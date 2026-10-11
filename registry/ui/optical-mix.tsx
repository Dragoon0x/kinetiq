"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type OpticalMixPalette = "field" | "dusk" | "press" | "tide";
export type OpticalMixElement = "h1" | "h2" | "h3" | "p" | "span" | "div";

export type OpticalMixProps = {
  /** The headline. It stays the element's real, selectable text. */
  text: string;
  /** The element that carries the text. @default "h2" */
  as?: OpticalMixElement;
  /** Diameter of one dab of paint, px on a 60 px line; dabs scale with the type. Smaller dabs fuse sooner. @default 2.5 */
  dotSize?: number;
  /** The pigments the line is painted in. @default "field" */
  palette?: OpticalMixPalette;
  /** Any CSS colours, two to six; replaces `palette`. */
  colors?: string[];
  /** How tightly the dabs pack, 0 (open weave) to 1 (just overlapping). @default 0.8 */
  density?: number;
  /** How far the lens pulls the dabs apart, 0 (they only swell) to 1. @default 0.6 */
  spread?: number;
  /** How much the dabs swell under the lens, 1 to 4. @default 2.2 */
  magnify?: number;
  /** The lens radius, px; held to about one and a quarter letters' height. @default 70 */
  lensRadius?: number;
  /** How much the dabs breathe while idle, 0 (still) to 1. @default 0.5 */
  twinkle?: number;
  /** The pointer and the keyboard can bring the lens. @default true */
  interactive?: boolean;
  /** When the dabs are painted on. @default "inView" */
  trigger?: "mount" | "inView";
  /** Paint on only the first time the line is seen. @default true */
  once?: boolean;
  /** Wait before painting on, ms. @default 0 */
  delay?: number;
  /** Hold the idle breathing. The lens still works. @default false */
  paused?: boolean;
  /** Twists the dither so two lines never share a pattern. @default 1 */
  seed?: number;
  /** Cap on the canvas pixel ratio, 1 to 2. @default 2 */
  dpr?: number;
  /** The dabs have all been painted on. */
  onComplete?: () => void;
  /** The word under the lens, or null when it closes. */
  onLensChange?: (word: string | null) => void;
  className?: string;
};

/**
 * Pigments at one fixed lightness each set: dabs of equal lightness and
 * different hue are what the eye fuses into a single tone (unequal lightness
 * reads as confetti), and a fixed lightness keeps a dab the same dab on a white
 * page and a dark one. `field` takes its hues from the house tokens:
 * ultramarine, ochre, vermilion and viridian, the painter's set.
 */
const PALETTES: Record<OpticalMixPalette, readonly string[]> = {
  field: [
    "oklch(from var(--accent-bright) 0.6 0.16 h)",
    "oklch(from var(--warn) 0.6 0.12 h)",
    "oklch(from var(--danger) 0.6 0.17 h)",
    "oklch(from var(--success) 0.6 0.13 h)",
  ],
  dusk: [
    "oklch(0.62 0.16 8)",
    "oklch(0.62 0.15 300)",
    "oklch(0.62 0.12 248)",
    "oklch(0.62 0.12 58)",
  ],
  press: [
    "oklch(0.64 0.12 222)",
    "oklch(0.64 0.2 350)",
    "oklch(0.64 0.13 102)",
  ],
  tide: [
    "oklch(0.6 0.1 200)",
    "oklch(0.6 0.12 160)",
    "oklch(0.6 0.13 256)",
    "oklch(0.6 0.08 96)",
  ],
};

/** Keyboard sweep: one word every 260 ms, about a glide spring's settle. */
const SWEEP_WORD = 0.26;
/** The paint-on sweep crosses the line in 600 ms: one beat. */
const SWEEP = 0.6;
/**
 * A dab is `dotSize` px on a 60 px line and scales with the type, so a caption
 * and a hero are painted with the same brush relative to their strokes.
 */
const dabOf = (dotSize: number, fontPx: number) =>
  clamp(dotSize, 1, 24) * clamp(fontPx / 60, 0.55, 1.8);
/** More dabs than this and the lattice opens up instead. */
const MAX_DOTS = 12000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A seeded unit float from three integers; unsigned shifts throughout. */
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x632be5ab), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (c + 0x7f4a7c15), 0x27d4eb2f) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The house snap spring's step response, evaluated exactly at time t (s). */
const SNAP = (() => {
  const { stiffness: k, damping: c, mass: m } = springs.snap;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return (t: number) =>
    1 -
    Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
})();

type Spring = { stiffness: number; damping: number; mass: number };

/** Semi-implicit Euler in quarter-millisecond-safe substeps. */
function stepSpring(
  x: number,
  v: number,
  target: number,
  s: Spring,
  dt: number,
): [number, number] {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a = (-s.stiffness * (x - target) - s.damping * v) / s.mass;
    v += a * h;
    x += v * h;
  }
  return [x, v];
}

/** The lens centre trails the pointer critically damped: no lag wobble. */
const FOLLOW: Spring = { stiffness: 484, damping: 44, mass: 1 };

type Word = { text: string; cx: number; cy: number; box: DOMRect };

type Lattice = {
  count: number;
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  phase: Float32Array;
  speed: Float32Array;
  delay: Float32Array;
  /** Dabs are grouped by pigment: pigment k is [starts[k], starts[k+1]). */
  starts: number[];
};

type Props = Required<
  Pick<
    OpticalMixProps,
    | "dotSize"
    | "density"
    | "spread"
    | "magnify"
    | "lensRadius"
    | "twinkle"
    | "interactive"
    | "trigger"
    | "once"
    | "delay"
    | "paused"
    | "seed"
    | "dpr"
  >
> & {
  motionSafe: boolean;
  onComplete?: () => void;
  onLensChange?: (word: string | null) => void;
  onPainted: () => void;
  onSay: (text: string) => void;
};

type Engine = {
  layout: () => void;
  kick: () => void;
  hover: (x: number, y: number) => void;
  away: () => void;
  keyTo: (index: number) => void;
  keyMove: (step: number | "home" | "end") => void;
  sweep: () => void;
  keyClose: () => void;
  dispose: () => void;
};

/** The word as the browser shows it, so the paint matches `text-transform`. */
function cased(word: string, transform: string): string {
  if (transform === "uppercase") return word.toUpperCase();
  if (transform === "lowercase") return word.toLowerCase();
  if (transform === "capitalize") {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): string => {
    if (!ctx) return colour;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0 0 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0} ${d[1] ?? 0} ${d[2] ?? 0})`;
  };
}

/**
 * Everything that runs per frame lives here, outside React: the lattice in
 * typed arrays, the lens springs as plain numbers, one rAF loop that stops
 * itself the moment nothing is changing.
 */
function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  textEl: HTMLElement,
  carriers: HTMLElement,
  latest: { current: Props },
): Engine | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  if (!mctx) return null;
  const read = rgbReader();

  let w = 0;
  let h = 0;
  let dpr = 1;
  let fontPx = 16;
  let lattice: Lattice | null = null;
  let words: Word[] = [];
  let pigments: string[] = [];
  let fadeLeft: CanvasGradient | null = null;
  let fadeRight: CanvasGradient | null = null;
  let visible = false;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let disposed = false;

  // Paint-on: null before it is seen, a start time while running.
  let entrance: number | null = null;
  let entranceDone = false;
  let played = false;
  let delayTimer = 0;

  const lens = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    open: false,
    changedAt: 0,
    s: new Float32Array(6),
    v: new Float32Array(6),
    word: null as string | null,
    key: -1,
    sweepAt: null as number | null,
  };

  const readColours = () => {
    pigments = [];
    for (const el of Array.from(carriers.children)) {
      pigments.push(read(getComputedStyle(el).color));
    }
  };

  const wordAt = (x: number, y: number): number => {
    let best = -1;
    let bestD = Infinity;
    words.forEach((word, i) => {
      const b = word.box;
      const dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
      const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return bestD <= fontPx * fontPx * 0.5 ? best : -1;
  };

  const report = (index: number) => {
    const next = index >= 0 ? (words[index]?.text ?? null) : null;
    if (next === lens.word) return;
    lens.word = next;
    latest.current.onLensChange?.(next);
  };

  const lensRadius = () =>
    clamp(Math.min(latest.current.lensRadius, fontPx * 1.3), 16, 400);

  /** Lay the words out exactly where the browser put them, then sample. */
  const layout = () => {
    if (disposed) return;
    // The canvas bleeds half an em above and below the line, so the lens has
    // room to push dabs out of the line box without cutting them off.
    const box = canvas.getBoundingClientRect();
    w = Math.max(1, box.width);
    h = Math.max(1, box.height);
    dpr = clamp(
      Math.min(window.devicePixelRatio || 1, latest.current.dpr),
      1,
      2,
    );
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    readColours();
    fadeLeft = ctx.createLinearGradient(0, 0, 10, 0);
    fadeLeft.addColorStop(0, "rgb(0 0 0)");
    fadeLeft.addColorStop(1, "rgb(0 0 0 / 0)");
    fadeRight = ctx.createLinearGradient(w, 0, w - 10, 0);
    fadeRight.addColorStop(0, "rgb(0 0 0)");
    fadeRight.addColorStop(1, "rgb(0 0 0 / 0)");

    const p = latest.current;
    const cs = getComputedStyle(textEl);
    fontPx = parseFloat(cs.fontSize) || 16;
    const scale = 2;
    mask.width = Math.ceil(w * scale);
    mask.height = Math.ceil(h * scale);
    mctx.setTransform(scale, 0, 0, scale, 0, 0);
    mctx.clearRect(0, 0, w, h);
    mctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const spaced = mctx as CanvasRenderingContext2D & {
      letterSpacing?: string;
    };
    if ("letterSpacing" in spaced) {
      spaced.letterSpacing =
        cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    }
    mctx.textBaseline = "alphabetic";
    mctx.fillStyle = "rgb(0 0 0)";

    words = [];
    const node = textEl.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent ?? "";
      const range = document.createRange();
      for (const match of content.matchAll(/\S+/g)) {
        const start = match.index ?? 0;
        const shown = cased(match[0], cs.textTransform);
        range.setStart(node, start);
        range.setEnd(node, start + match[0].length);
        const rect = range.getClientRects()[0];
        if (!rect || rect.width === 0) continue;
        const local = new DOMRect(
          rect.left - box.left,
          rect.top - box.top,
          rect.width,
          rect.height,
        );
        const m = mctx.measureText(shown);
        const ascent = m.fontBoundingBoxAscent || fontPx * 0.8;
        const descent = m.fontBoundingBoxDescent || fontPx * 0.2;
        const baseline =
          local.top + (local.height - (ascent + descent)) / 2 + ascent;
        const ratio = m.width > 0 ? local.width / m.width : 1;
        mctx.save();
        mctx.translate(local.left, baseline);
        if (ratio > 0.85 && ratio < 1.15) mctx.scale(ratio, 1);
        mctx.fillText(shown, 0, 0);
        mctx.restore();
        words.push({
          text: match[0],
          cx: local.left + local.width / 2,
          cy: local.top + local.height / 2,
          box: local,
        });
      }
    }

    const data = mctx.getImageData(0, 0, mask.width, mask.height).data;
    const mw = mask.width;
    const mh = mask.height;
    const alpha = (x: number, y: number) => {
      const px = Math.round(x * scale);
      const py = Math.round(y * scale);
      if (px < 0 || py < 0 || px >= mw || py >= mh) return 0;
      return (data[(py * mw + px) * 4 + 3] ?? 0) / 255;
    };

    const n = Math.max(1, pigments.length);
    const dot = dabOf(p.dotSize, fontPx);
    // Density 1 lets neighbouring dabs just overlap; lower opens the weave.
    let pitch = dot * (0.95 + (1 - clamp(p.density, 0, 1)) * 0.75);
    const build = () => {
      const buckets: number[][] = Array.from({ length: n }, () => []);
      const rowH = pitch * 0.866;
      const rows = Math.ceil(h / rowH);
      const cols = Math.ceil(w / pitch) + 1;
      const o = pitch * 0.3;
      let total = 0;
      for (let row = 0; row < rows; row += 1) {
        const y = rowH * (row + 0.5);
        const shift = row & 1 ? pitch / 2 : 0;
        for (let col = 0; col < cols; col += 1) {
          const x = shift + pitch * (col + 0.25);
          const cover =
            (alpha(x, y) * 2 +
              alpha(x - o, y) +
              alpha(x + o, y) +
              alpha(x, y - o) +
              alpha(x, y + o)) /
            6;
          if (cover < 0.18) continue;
          // An ordered dither on the hex lattice: in axial coordinates
          // (q + 2r) mod n gives all six neighbours a different pigment for
          // n ≥ 3, so no two touching dabs share a colour and the tone fuses.
          const q = col - ((row - (row & 1)) >> 1);
          const k =
            n >= 3
              ? (((q + 2 * row + p.seed) % n) + n) % n
              : (((col + row + p.seed) % n) + n) % n;
          const j1 = hash3(col, row, p.seed);
          const j2 = hash3(row, col, p.seed + 17);
          const j3 = hash3(col + 7, row + 3, p.seed + 31);
          buckets[k]!.push(
            x + (j1 - 0.5) * pitch * 0.2,
            y + (j2 - 0.5) * pitch * 0.2,
            (dot / 2) *
              (0.55 + 0.45 * Math.min(1, cover * 1.25)) *
              (0.94 + j3 * 0.12),
            j1 * Math.PI * 2,
            0.5 + j2 * 0.8,
            (x / w) * SWEEP + j3 * 0.08,
          );
          total += 1;
        }
      }
      return { buckets, total };
    };
    let built = build();
    if (built.total > MAX_DOTS) {
      pitch *= Math.sqrt(built.total / MAX_DOTS);
      built = build();
    }
    const count = built.total;
    const next: Lattice = {
      count,
      x: new Float32Array(count),
      y: new Float32Array(count),
      r: new Float32Array(count),
      phase: new Float32Array(count),
      speed: new Float32Array(count),
      delay: new Float32Array(count),
      starts: [0],
    };
    let i = 0;
    for (const bucket of built.buckets) {
      for (let b = 0; b < bucket.length; b += 6) {
        next.x[i] = bucket[b] ?? 0;
        next.y[i] = bucket[b + 1] ?? 0;
        next.r[i] = bucket[b + 2] ?? 0;
        next.phase[i] = bucket[b + 3] ?? 0;
        next.speed[i] = bucket[b + 4] ?? 0;
        next.delay[i] = bucket[b + 5] ?? 0;
        i += 1;
      }
      next.starts.push(i);
    }
    lattice = next;
    if (lens.key >= 0) {
      const word = words[Math.min(lens.key, words.length - 1)];
      if (word) {
        lens.tx = word.cx;
        lens.ty = word.cy;
      }
    }
    if (p.trigger === "mount" && !played) start();
    draw(performance.now());
    kick();
  };

  const start = () => {
    if (played && latest.current.once) return;
    played = true;
    window.clearTimeout(delayTimer);
    const go = () => {
      if (disposed) return;
      if (!latest.current.motionSafe) {
        entrance = null;
        entranceDone = true;
        draw(performance.now());
        latest.current.onPainted();
        latest.current.onComplete?.();
        return;
      }
      entrance = performance.now();
      entranceDone = false;
      kick();
    };
    if (latest.current.delay > 0) {
      delayTimer = window.setTimeout(go, latest.current.delay);
    } else go();
  };

  const update = (now: number, dt: number) => {
    const p = latest.current;
    // The lens centre.
    if (!p.motionSafe) {
      lens.x = lens.tx;
      lens.y = lens.ty;
      lens.vx = 0;
      lens.vy = 0;
    } else {
      [lens.x, lens.vx] = stepSpring(lens.x, lens.vx, lens.tx, FOLLOW, dt);
      [lens.y, lens.vy] = stepSpring(lens.y, lens.vy, lens.ty, FOLLOW, dt);
    }
    // Keyboard sweep: word by word, then rest on the last.
    if (lens.sweepAt !== null) {
      const i = Math.floor((now - lens.sweepAt) / 1000 / SWEEP_WORD);
      const index = Math.min(words.length - 1, i);
      const word = words[index];
      if (word) {
        lens.tx = word.cx;
        lens.ty = word.cy;
        lens.key = index;
        report(index);
      }
      if (i >= words.length - 1) lens.sweepAt = null;
    }
    // One strength per pigment: they open on glide one after another, so the
    // colours come apart like light through a prism, and close on the slower
    // drift spring, so they mix again as you move on.
    const n = Math.max(1, pigments.length);
    const target = lens.open ? 1 : 0;
    for (let k = 0; k < n; k += 1) {
      if ((now - lens.changedAt) / 1000 < k * (lens.open ? 0.045 : 0.03)) {
        continue;
      }
      if (!p.motionSafe) {
        const sk = lens.s[k] ?? 0;
        lens.s[k] = clamp(sk + (target > sk ? 1 : -1) * (dt / 0.15), 0, 1);
        lens.v[k] = 0;
        continue;
      }
      const [s, v] = stepSpring(
        lens.s[k] ?? 0,
        lens.v[k] ?? 0,
        target,
        lens.open ? springs.glide : springs.drift,
        dt,
      );
      lens.s[k] = s;
      lens.v[k] = v;
      if (Math.abs(s - target) < 0.002 && Math.abs(v) < 0.01) {
        lens.s[k] = target;
        lens.v[k] = 0;
      }
    }
  };

  const lensBusy = () => {
    if (lens.sweepAt !== null) return true;
    if (Math.abs(lens.x - lens.tx) > 0.1 || Math.abs(lens.y - lens.ty) > 0.1) {
      return true;
    }
    const target = lens.open ? 1 : 0;
    const n = Math.max(1, pigments.length);
    for (let k = 0; k < n; k += 1) if (lens.s[k] !== target) return true;
    return false;
  };

  const lensShown = () => {
    const n = Math.max(1, pigments.length);
    for (let k = 0; k < n; k += 1) if ((lens.s[k] ?? 0) > 0.001) return true;
    return false;
  };

  const twinkling = () => {
    const p = latest.current;
    return p.motionSafe && !p.paused && p.twinkle > 0;
  };

  const draw = (now: number) => {
    const L = lattice;
    lastDraw = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!L || (entrance === null && !entranceDone)) return;
    const p = latest.current;
    const t = now / 1000;
    const tw = twinkling() ? clamp(p.twinkle, 0, 1) * 0.3 : 0;
    const since = entrance !== null ? (now - entrance) / 1000 : Infinity;
    const R = lensRadius();
    const R2 = R * R;
    const spread = clamp(p.spread, 0, 1);
    const swell = clamp(p.magnify, 1, 4) - 1;
    const n = L.starts.length - 1;
    const nudge = spread * dabOf(p.dotSize, fontPx) * 0.6;
    const lx = lens.x;
    const ly = lens.y;
    let open = 0;
    for (let k = 0; k < n; k += 1) open = Math.max(open, lens.s[k] ?? 0);
    for (let k = 0; k < n; k += 1) {
      const from = L.starts[k] ?? 0;
      const to = L.starts[k + 1] ?? from;
      const s = lens.s[k] ?? 0;
      // a ≤ 2.6 keeps the fisheye monotonic: dabs part, never cross.
      const a = spread * 2.6 * s;
      const angle = (k / n) * Math.PI * 2;
      const nx = Math.cos(angle) * nudge * s;
      const ny = Math.sin(angle) * nudge * s;
      ctx.beginPath();
      for (let i = from; i < to; i += 1) {
        let x = L.x[i] ?? 0;
        let y = L.y[i] ?? 0;
        let r = L.r[i] ?? 0;
        const e = since - (L.delay[i] ?? 0);
        if (e <= 0) continue;
        if (e < 1) r *= SNAP(e);
        if (tw > 0) {
          r *= 1 + tw * Math.sin(t * (L.speed[i] ?? 1) + (L.phase[i] ?? 0));
        }
        if (s > 0.001) {
          const dx = x - lx;
          const dy = y - ly;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const u = Math.sqrt(d2) / R;
            const f = 1 + a * (1 - u) * (1 - u);
            const g = (1 - u * u) * (1 - u * u);
            x = lx + dx * f + nx * g;
            y = ly + dy * f + ny * g;
            r *= 1 + swell * s * g;
          }
        }
        if (r < 0.2) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = pigments[k] ?? "rgb(0 0 0)";
      ctx.fill();
    }
    // Dabs pushed past the ends of the line fade out rather than being cut.
    if (open > 0.001 && (lx < R + 10 || lx > w - R - 10)) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = open;
      if (lx < R + 10 && fadeLeft) {
        ctx.fillStyle = fadeLeft;
        ctx.fillRect(0, 0, 10, h);
      }
      if (lx > w - R - 10 && fadeRight) {
        ctx.fillStyle = fadeRight;
        ctx.fillRect(w - 10, 0, 10, h);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // The paint-on wipes the server's dotted stand-in away just behind the
    // front of fresh dabs, so the line never blinks out between the two.
    if (entrance !== null && !entranceDone) {
      const front = (since / SWEEP) * w;
      const cut = `linear-gradient(90deg, transparent ${Math.round(front - 28)}px, black ${Math.round(front + 6)}px)`;
      textEl.style.maskImage = cut;
      textEl.style.setProperty("-webkit-mask-image", cut);
      if (since > SWEEP + 0.08 + 1) {
        entranceDone = true;
        textEl.style.maskImage = "";
        textEl.style.removeProperty("-webkit-mask-image");
        latest.current.onPainted();
        latest.current.onComplete?.();
      }
    }
  };

  const busy = () =>
    (entrance !== null && !entranceDone) || lensBusy() || twinkling();

  const loop = (now: number) => {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(now, dt);
    const animating = (entrance !== null && !entranceDone) || lensBusy();
    // Breathing alone draws at 30 fps; the lens and the paint-on at full rate.
    if (animating || now - lastDraw > 32) draw(now);
    if (busy()) raf = window.requestAnimationFrame(loop);
    else draw(now);
  };

  const kick = () => {
    if (disposed || raf || !visible || document.hidden) return;
    last = performance.now();
    raf = window.requestAnimationFrame(loop);
  };

  const openAt = (x: number, y: number, jump: boolean) => {
    if (jump || !lensShown()) {
      lens.x = x;
      lens.y = y;
      lens.vx = 0;
      lens.vy = 0;
    }
    lens.tx = x;
    lens.ty = y;
    if (!lens.open) {
      lens.open = true;
      lens.changedAt = performance.now();
    }
    kick();
  };

  const close = () => {
    if (lens.open) {
      lens.open = false;
      lens.changedAt = performance.now();
    }
    lens.sweepAt = null;
    report(-1);
    kick();
  };

  const io = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    const was = visible;
    visible = Boolean(entry?.isIntersecting);
    if (visible && !was) {
      if (latest.current.trigger === "inView") {
        if (!played) start();
        else if (!latest.current.once) {
          played = false;
          start();
        }
      }
      draw(performance.now());
      kick();
    }
  });
  io.observe(root);
  let pending = 0;
  const ro = new ResizeObserver(() => {
    if (pending) return;
    pending = window.requestAnimationFrame(() => {
      pending = 0;
      layout();
    });
  });
  ro.observe(root);
  const onVisibility = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const fonts = document.fonts;
  const onFonts = () => layout();
  fonts?.addEventListener?.("loadingdone", onFonts);
  void fonts?.ready.then(() => {
    if (!disposed) layout();
  });

  layout();

  return {
    layout,
    kick: () => {
      draw(performance.now());
      kick();
    },
    hover: (x, y) => {
      lens.key = -1;
      lens.sweepAt = null;
      openAt(x, y, false);
      report(wordAt(x, y));
    },
    away: () => {
      if (lens.key >= 0) return;
      close();
    },
    keyTo: (index) => {
      const word = words[clamp(index, 0, words.length - 1)];
      if (!word) return;
      lens.key = clamp(index, 0, words.length - 1);
      lens.sweepAt = null;
      openAt(word.cx, word.cy, false);
      report(lens.key);
      latest.current.onSay(
        `Lens on ${word.text}, word ${lens.key + 1} of ${words.length}`,
      );
    },
    keyMove: (step) => {
      if (!words.length) return;
      const from = lens.key < 0 ? 0 : lens.key;
      const index =
        step === "home"
          ? 0
          : step === "end"
            ? words.length - 1
            : clamp(from + step, 0, words.length - 1);
      const word = words[index];
      if (!word) return;
      lens.key = index;
      lens.sweepAt = null;
      openAt(word.cx, word.cy, false);
      report(index);
      latest.current.onSay(
        `Lens on ${word.text}, word ${index + 1} of ${words.length}`,
      );
    },
    sweep: () => {
      const first = words[0];
      if (!first) return;
      if (!latest.current.motionSafe) {
        lens.key = 0;
        openAt(first.cx, first.cy, true);
        report(0);
        return;
      }
      lens.key = 0;
      openAt(first.cx, first.cy, true);
      lens.sweepAt = performance.now();
      report(0);
    },
    keyClose: () => {
      lens.key = -1;
      close();
    },
    dispose: () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      if (pending) window.cancelAnimationFrame(pending);
      window.clearTimeout(delayTimer);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      fonts?.removeEventListener?.("loadingdone", onFonts);
      textEl.style.maskImage = "";
      textEl.style.removeProperty("-webkit-mask-image");
    },
  };
}

/** The server's frame: the same pigments as a dotted fill clipped to the glyphs. */
function standIn(
  pigments: readonly string[],
  dot: number,
): React.CSSProperties {
  const p = r2(Math.max(2, dot) * 1.25);
  const r = r2(Math.max(2, dot) / 2);
  const slots = [0, 1, 2, 3];
  const n = Math.max(1, pigments.length);
  return {
    color: "transparent",
    backgroundImage: slots
      .map(
        (slot) =>
          `radial-gradient(circle at ${r2(p / 2)}px ${r2(p / 2)}px, ${pigments[slot % n]} ${r}px, transparent ${r2(r + 0.6)}px)`,
      )
      .join(", "),
    backgroundSize: `${r2(p * 2)}px ${r2(p * 2)}px`,
    backgroundPosition: `0 0, ${p}px 0, ${r2(p / 2)}px ${p}px, ${r2(p * 1.5)}px ${p}px`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
  };
}

/**
 * A headline painted in dabs of separate pure pigments, laid in an ordered
 * dither on a hex lattice so no two touching dabs share a colour: from reading
 * distance they fuse into one tone. The real text is the element's own
 * transparent text, laid out by the browser, so it sizes the box, selects and
 * copies as words, and is read once by assistive technology; the paint is a
 * canvas sampled from that exact layout.
 *
 * Hover opens a soft lens: inside it a monotonic fisheye pushes the dabs
 * apart and they swell, so the fused tone separates into its colours. Each
 * pigment opens on the glide spring 45 ms after the last, like light coming
 * apart in a prism, and closes on the slower drift spring, so they mix again
 * as you move on. Idle, every dab breathes on its own slow seeded sine. The
 * line is painted on left to right, each dab growing on the snap spring.
 *
 * Keyboard focus sweeps the lens along the line word by word; Left and Right
 * move it, Home and End jump, Enter or Space sweeps again, Escape closes it.
 * Under reduced motion the dabs are painted still, the lens fades rather than
 * springs and follows directly, and focus places it without a sweep.
 */
export function OpticalMix({
  text,
  as = "h2",
  dotSize = 2.5,
  palette = "field",
  colors,
  density = 0.8,
  spread = 0.6,
  magnify = 2.2,
  lensRadius = 70,
  twinkle = 0.5,
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 0,
  paused = false,
  seed = 1,
  dpr = 2,
  onComplete,
  onLensChange,
  className,
}: OpticalMixProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const pigments =
    colors && colors.length > 0
      ? colors.slice(0, 6)
      : (PALETTES[palette] ?? PALETTES.field);
  const pigmentKey = pigments.join("|");

  const [painted, setPainted] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);

  const latest = React.useRef<Props>({
    dotSize,
    density,
    spread,
    magnify,
    lensRadius,
    twinkle,
    interactive,
    trigger,
    once,
    delay,
    paused,
    seed,
    dpr,
    motionSafe,
    onComplete,
    onLensChange,
    onPainted: () => setPainted(true),
    onSay: (t: string) => setSaid((s) => ({ n: s.n + 1, text: t })),
  });
  React.useEffect(() => {
    latest.current = {
      ...latest.current,
      dotSize,
      density,
      spread,
      magnify,
      lensRadius,
      twinkle,
      interactive,
      trigger,
      once,
      delay,
      paused,
      seed,
      dpr,
      motionSafe,
      onComplete,
      onLensChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const textEl = textRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !textEl || !carriers) return;
    const made = createEngine(root, canvas, textEl, carriers, latest);
    engine.current = made;
    return () => {
      made?.dispose();
      engine.current = null;
    };
  }, []);

  // The lattice depends on the words, the dab size and the pigment count.
  React.useEffect(() => {
    engine.current?.layout();
  }, [text, dotSize, density, seed, pigmentKey, dpr]);

  // Anything that only changes how the lattice is drawn just needs a frame.
  React.useEffect(() => {
    engine.current?.kick();
  }, [spread, magnify, lensRadius, twinkle, paused, motionSafe]);

  const toLocal = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const drag = useDrag({
    threshold: 2,
    disabled: !interactive,
    onMove: ({ event }) => {
      if (event.pointerType !== "touch") return;
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box) return;
      engine.current?.hover(event.clientX - box.left, event.clientY - box.top);
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") engine.current?.away();
    },
    onCancel: () => engine.current?.away(),
    onTap: (event) => {
      if (event.pointerType === "touch") engine.current?.away();
    },
  });

  const Root = as === "span" ? "span" : "div";
  const Tag = as;

  return (
    <Root
      ref={rootRef as React.Ref<HTMLDivElement & HTMLSpanElement>}
      className={cn(
        "group/optical-mix relative isolate",
        as === "span" ? "inline-block" : "block",
        interactive && "touch-pan-y",
        className,
      )}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        if (!interactive || event.pointerType !== "touch") return;
        const at = toLocal(event);
        if (at) engine.current?.hover(at.x, at.y);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        const at = toLocal(event);
        if (at) engine.current?.hover(at.x, at.y);
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.away();
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-[0.5em] -z-10 h-[calc(100%+1em)] w-full"
      />
      <Tag
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            engine.current?.sweep();
          }
        }}
        onBlur={() => engine.current?.keyClose()}
        onKeyDown={(event) => {
          if (!interactive) return;
          const key = event.key;
          if (key === "ArrowRight" || key === "ArrowDown") {
            event.preventDefault();
            engine.current?.keyMove(1);
          } else if (key === "ArrowLeft" || key === "ArrowUp") {
            event.preventDefault();
            engine.current?.keyMove(-1);
          } else if (key === "Home") {
            event.preventDefault();
            engine.current?.keyMove("home");
          } else if (key === "End") {
            event.preventDefault();
            engine.current?.keyMove("end");
          } else if (key === "Enter" || key === " ") {
            event.preventDefault();
            engine.current?.sweep();
          } else if (key === "Escape") {
            event.preventDefault();
            engine.current?.keyClose();
          }
        }}
        className={cn(
          "relative m-0 block rounded-1 outline-none [font:inherit]",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        <span
          ref={textRef}
          className="block selection:bg-cobalt-wash selection:text-foreground"
          style={
            painted ? { color: "transparent" } : standIn(pigments, dotSize)
          }
        >
          {text}
        </span>
      </Tag>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.layout()}
        className="pointer-events-none absolute top-0 left-0 size-px overflow-hidden opacity-0"
      >
        {pigments.map((colour, i) => (
          <span
            key={`${i}-${colour}`}
            className="block size-px transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Arrow keys move a lens along the line to see its separate colours;
          Escape closes it.
        </span>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </Root>
  );
}
