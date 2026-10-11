"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IncenseScriptElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type IncenseScriptTrigger = "mount" | "inView" | "manual";

export type IncenseScriptProps = {
  /** The phrases, written in smoke one after another. */
  phrases: string[];
  /** The element that carries the phrases. @default "p" */
  as?: IncenseScriptElement;
  /** How fast the thread travels and how far its wisps lean on the draught, 0 to 1. @default 0.5 */
  drift?: number;
  /** Turbulence, 0 (a laminar thread) to 1 (curling, swirling smoke). @default 0.5 */
  curl?: number;
  /** How long a written phrase stays before it clears to haze, ms. @default 2600 */
  linger?: number;
  /** The smoke, any CSS colour; resolved on the element, so it follows the theme. @default "var(--ink-2)" */
  color?: string;
  /** The ember, any CSS colour. A fixed glowing pigment by default. */
  ember?: string;
  /** How much smoke makes each letter, 0 (wisps) to 1 (dense). @default 0.6 */
  density?: number;
  /** Draw the stick of incense and its dish at the left edge. @default true */
  stick?: boolean;
  /** Cycle the phrases; false stops on the last one, written. @default true */
  loop?: boolean;
  /** What lights the stick. @default "inView" */
  trigger?: IncenseScriptTrigger;
  /** With trigger "manual": true lights the stick, false lets it rest. @default false */
  play?: boolean;
  /** Wait before the first thread leaves the ember, ms. @default 0 */
  delay?: number;
  /** A hand through the smoke pushes it aside; Enter wafts a breath across. @default true */
  interactive?: boolean;
  /** Cap on the canvas's pixel ratio (never above 2). @default 2 */
  dpr?: number;
  /** A phrase began: its index in `phrases`. */
  onPhraseChange?: (index: number) => void;
  /** A phrase finished writing: its index in `phrases`. */
  onComplete?: (index: number) => void;
  className?: string;
};

const EMBER = "oklch(0.72 0.19 42)";
const STICK = "oklch(0.36 0.05 34)";
const BAMBOO = "oklch(0.72 0.06 78)";
const ASH = "oklch(0.78 0.01 70)";

/** Most smoke particles in a phrase; a long phrase is sampled coarser. */
const MAX_PARTICLES = 2400;
/** The thread's remembered positions. */
const TRAIL = 96;
/** The ember's own plume. */
const PLUME = 56;
/** A phrase clearing to haze, s. */
const CLEAR = 1.7;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/**
 * Smooth turbulence: a few crossed sine waves with seeded phases. Not a true
 * curl field, but it swirls, it is cheap, and the same phrase smokes the same
 * way every time.
 */
const swirl = (x: number, y: number, t: number, k: number) =>
  Math.sin(x * 1.7 + t * 0.9 + k) * Math.cos(y * 1.3 - t * 0.7 + k * 1.3) +
  0.5 * Math.sin((x + y) * 2.9 + t * 1.6 + k * 2.1);

/** Reads any CSS colour as RGB through a one-pixel canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 128, d[1] ?? 128, d[2] ?? 128];
  };
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Letter = {
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  char: string;
};

type Phrase = {
  letters: Letter[];
  /** The thread's path as a polyline, and its running length. */
  px: Float32Array;
  py: Float32Array;
  plen: Float32Array;
  /** Where along the path each letter is caught. */
  catchAt: Float32Array;
  /** When each letter was caught, s of the phrase clock; NaN until then. */
  caught: Float32Array;
  length: number;
  speed: number;
  writeEnd: number;
  /** Particles: target, position, velocity, letter, release time, look. */
  count: number;
  tx: Float32Array;
  ty: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  of: Int16Array;
  born: Float32Array;
  alpha: Float32Array;
  size: Float32Array;
  freq: Float32Array;
  body: HTMLCanvasElement | null;
  seed: number;
  /** How far a hand has parted each letter's smoke, 0 to 1; it drifts back. */
  parted: Float32Array;
};

type Engine = {
  ctx: CanvasRenderingContext2D | null;
  w: number;
  h: number;
  ratio: number;
  em: number;
  ember: { x: number; y: number };
  rgb: [number, number, number];
  sprite: HTMLCanvasElement | null;
  phrase: Phrase | null;
  phase: "idle" | "write" | "linger" | "clear" | "rest";
  /** The phrase clock, s: advances only while the piece runs. */
  t: number;
  phaseAt: number;
  trailX: Float32Array;
  trailY: Float32Array;
  trailT: Float32Array;
  trailHead: number;
  trailCount: number;
  plumeX: Float32Array;
  plumeY: Float32Array;
  plumeT: Float32Array;
  plumeK: Float32Array;
  plumeHead: number;
  plumeNext: number;
  pointer: { x: number; y: number; vx: number; vy: number; t: number } | null;
  waft: number;
  reported: number;
};

const engineOf = (): Engine => ({
  ctx: null,
  w: 0,
  h: 0,
  ratio: 1,
  em: 16,
  ember: { x: 0, y: 0 },
  rgb: [128, 128, 128],
  sprite: null,
  phrase: null,
  phase: "idle",
  t: 0,
  phaseAt: 0,
  trailX: new Float32Array(TRAIL),
  trailY: new Float32Array(TRAIL),
  trailT: new Float32Array(TRAIL).fill(-1e9),
  trailHead: 0,
  trailCount: 0,
  plumeX: new Float32Array(PLUME),
  plumeY: new Float32Array(PLUME),
  plumeT: new Float32Array(PLUME).fill(-1e9),
  plumeK: new Float32Array(PLUME),
  plumeHead: 0,
  plumeNext: 0,
  pointer: null,
  waft: Number.NaN,
  reported: -1,
});

/** A soft round puff in the smoke's colour, drawn once per colour. */
function spriteOf(rgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    const [r, gg, b] = rgb;
    g.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 1)`);
    g.addColorStop(0.35, `rgba(${r}, ${gg}, ${b}, 0.55)`);
    g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return c;
}

/** A Catmull-Rom curve through the points, flattened. */
function spline(points: { x: number; y: number }[], per: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const at = (k: number) =>
    points[clamp(k, 0, points.length - 1)] ?? { x: 0, y: 0 };
  for (let k = 0; k < points.length - 1; k += 1) {
    const p0 = at(k - 1);
    const p1 = at(k);
    const p2 = at(k + 1);
    const p3 = at(k + 2);
    for (let j = 0; j < per; j += 1) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      xs.push(
        0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      );
      ys.push(
        0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      );
    }
  }
  const last = points[points.length - 1] ?? { x: 0, y: 0 };
  xs.push(last.x);
  ys.push(last.y);
  return { xs, ys };
}

type Api = {
  wake: () => void;
  halt: () => void;
  start: () => void;
  stop: () => void;
  prepare: (keep?: boolean) => void;
  resize: () => void;
  colours: () => void;
};

/**
 * A headline written in smoke. A stick of incense stands in its dish at the
 * left edge with the ember breathing; one thread of smoke leaves it, rises and
 * drifts right, and as it travels its curls catch on the letters one by one —
 * each letter forming out of the smoke the thread leaves there — so the whole
 * phrase is drawn in smoke. Written, it lingers, breathing slightly, then
 * diffuses upward into haze, and the next phrase begins from the ember.
 *
 * The phrase is real text laid out transparently, so it can be selected and
 * every letter's box is known; on each phrase the glyphs are drawn once to a
 * mask and sampled into smoke particles, and a soft body of each letter is
 * drawn once with a blur. One Canvas 2D loop moves the thread (a seeded spline
 * from the ember through every letter, with turbulence), its ageing trail,
 * the ember's own plume and every particle — each released at the thread and
 * pulled into its place by a spring at the glide calibration's damping ratio
 * while a decaying swirl curls it in. A hand through the smoke pushes it
 * aside and it drifts back; a transparent button gives the keyboard Enter to
 * waft a breath across the words. Every phrase is read once from an sr-only
 * copy. The loop runs only on screen in a visible page, with the pixel ratio
 * capped; under reduced motion each phrase stands finished in still smoke and
 * the phrases cross-fade.
 */
export function IncenseScript({
  phrases,
  as = "p",
  drift = 0.5,
  curl = 0.5,
  linger = 2600,
  color = "var(--ink-2)",
  ember = EMBER,
  density = 0.6,
  stick = true,
  loop = true,
  trigger = "inView",
  play = false,
  delay = 0,
  interactive = true,
  dpr = 2,
  onPhraseChange,
  onComplete,
  className,
}: IncenseScriptProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const glowId = `${uid}-ember`;
  const list = React.useMemo(
    () => (phrases.length ? phrases : [""]).map((p) => p.trim()),
    [phrases],
  );
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [slot, setSlot] = React.useState({ n: 0, index: 0 });
  const current = list[slot.index % list.length] ?? "";
  // Under motion the smoke is drawn; the laid-out copy is only its frame.
  const drawn = started && motionSafe;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const emberRef = React.useRef<SVGCircleElement | null>(null);
  const letterNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const engine = React.useRef<Engine>(engineOf());
  const reader = React.useRef<ReturnType<typeof rgbReader> | null>(null);
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const timers = React.useRef<number[]>([]);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    drift,
    curl,
    linger,
    density,
    loop,
    motionSafe,
    stick,
    dpr,
    count: list.length,
    index: slot.index,
    drawn,
    started,
    onPhraseChange,
    onComplete,
  });
  const [faint, setFaint] = React.useState(false);
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  /** The canvas's backing store: the root's size at a capped pixel ratio. */
  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const e = engine.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const ratio = Math.min(
      2,
      Math.max(0.5, cfg.current.dpr),
      window.devicePixelRatio || 1,
    );
    e.em = parseFloat(getComputedStyle(root).fontSize) || 16;
    if (w !== e.w || h !== e.h || ratio !== e.ratio || !e.ctx) {
      e.w = w;
      e.h = h;
      e.ratio = ratio;
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      e.ctx = canvas.getContext("2d");
      e.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    // The ember sits at the tip of the stick, drawn in em at the bottom left.
    e.ember = cfg.current.stick
      ? { x: 0.808 * e.em, y: h - 1.27 * e.em }
      : { x: 0, y: h * 0.7 };
  };

  /** The smoke's colour, read from the canvas element itself. */
  const colours = () => {
    const canvas = canvasRef.current;
    const e = engine.current;
    if (!canvas) return;
    if (!reader.current) reader.current = rgbReader();
    e.rgb = reader.current(getComputedStyle(canvas).color);
    e.sprite = spriteOf(e.rgb);
    const p = e.phrase;
    if (p) p.body = bodyOf(p);
  };

  /** Each letter's soft body: its glyph as a blurred shadow, drawn once. */
  const bodyOf = (p: Phrase): HTMLCanvasElement | null => {
    const e = engine.current;
    const root = rootRef.current;
    if (!root || e.w <= 0) return null;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(e.w * e.ratio));
    c.height = Math.max(1, Math.round(e.h * e.ratio));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(e.ratio, 0, 0, e.ratio, 0, 0);
    ctx.font = fontOf();
    ctx.textBaseline = "alphabetic";
    const [r, g, b] = e.rgb;
    // Drawn far off to the left, so only the shadow lands on the sheet.
    const away = e.w + 200;
    ctx.shadowOffsetX = away * e.ratio;
    ctx.shadowBlur = 0.05 * e.em * e.ratio;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
    ctx.fillStyle = "rgb(0, 0, 0)";
    for (const l of p.letters) ctx.fillText(l.char, l.x - away, l.baseline);
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.12)`;
    for (const l of p.letters) ctx.fillText(l.char, l.x, l.baseline);
    return c;
  };

  const fontOf = () => {
    const root = rootRef.current;
    const node = root?.querySelector<HTMLElement>("[data-smoke-line]");
    if (!node) return "16px sans-serif";
    const s = getComputedStyle(node);
    return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  };

  /** Lays the current phrase out as smoke: letters, path, particles, body. */
  const prepare = (keep = false) => {
    const root = rootRef.current;
    const e = engine.current;
    const c = cfg.current;
    if (!root) return;
    resize();
    const rect = root.getBoundingClientRect();
    const chars = graphemes(current);
    const font = fontOf();
    const probe = document.createElement("canvas").getContext("2d");
    let ascent = e.em * 0.8;
    if (probe) {
      probe.font = font;
      const m = probe.measureText("Hg");
      ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || ascent;
    }
    const letters: Letter[] = [];
    chars.forEach((char, i) => {
      if (/\s/.test(char)) return;
      const node = letterNodes.current.get(`${slot.n}:${i}`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      letters.push({
        x: r.left - rect.left,
        y: r.top - rect.top,
        w: r.width,
        h: r.height,
        baseline: r.top - rect.top + ascent,
        char,
      });
    });
    const seed = hash(current);
    const rand = lcg(seed);
    // The thread's path: up out of the ember, then through every letter,
    // arcing up between them (smoke rises), and away past the last.
    const em = e.em;
    const pts: { x: number; y: number }[] = [
      { x: e.ember.x, y: e.ember.y },
      { x: e.ember.x + 0.12 * em, y: e.ember.y - 0.75 * em },
    ];
    const anchorIndex: number[] = [];
    letters.forEach((l, i) => {
      const a = { x: l.x + l.w * 0.5, y: l.y + l.h * 0.42 };
      const prev = pts[pts.length - 1] ?? a;
      if (i > 0) {
        pts.push({
          x: (prev.x + a.x) / 2,
          y: Math.min(prev.y, a.y) - (0.12 + 0.3 * rand()) * em,
        });
      }
      anchorIndex.push(pts.length);
      pts.push(a);
    });
    const end = pts[pts.length - 1] ?? { x: 0, y: 0 };
    pts.push({ x: end.x + 0.9 * em, y: end.y - 0.9 * em });
    const per = 10;
    const { xs, ys } = spline(pts, per);
    const px = Float32Array.from(xs);
    const py = Float32Array.from(ys);
    const plen = new Float32Array(px.length);
    for (let k = 1; k < px.length; k += 1) {
      plen[k] =
        (plen[k - 1] ?? 0) +
        Math.hypot(
          (px[k] ?? 0) - (px[k - 1] ?? 0),
          (py[k] ?? 0) - (py[k - 1] ?? 0),
        );
    }
    const length = plen[plen.length - 1] ?? 0;
    const catchAt = Float32Array.from(
      anchorIndex.map((k) => plen[Math.min(plen.length - 1, k * per)] ?? 0),
    );
    // A phrase takes about a fifth of a second a letter, faster with drift.
    const write =
      clamp(letters.length * 0.17, 1.3, 3.4) / lerp(0.7, 1.5, clamp01(c.drift));
    const speed = length / write;

    // Smoke particles sampled from the glyphs.
    const mask = document.createElement("canvas");
    const mw = Math.max(1, Math.round(e.w));
    const mh = Math.max(1, Math.round(e.h));
    mask.width = mw;
    mask.height = mh;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    let count = 0;
    const tx: number[] = [];
    const ty: number[] = [];
    const of: number[] = [];
    if (mctx && letters.length) {
      mctx.font = font;
      mctx.textBaseline = "alphabetic";
      mctx.fillStyle = "rgb(255, 255, 255)";
      for (const l of letters) mctx.fillText(l.char, l.x, l.baseline);
      const data = mctx.getImageData(0, 0, mw, mh).data;
      let ink = 0;
      for (let k = 3; k < data.length; k += 4)
        if ((data[k] ?? 0) > 110) ink += 1;
      const want = Math.min(MAX_PARTICLES, 160 + 2400 * clamp01(c.density));
      const spacing = Math.max(1.2, Math.sqrt(ink / Math.max(1, want)));
      for (let y = 0; y < mh; y += spacing) {
        for (let x = 0; x < mw; x += spacing) {
          const jx = x + (rand() - 0.5) * spacing;
          const jy = y + (rand() - 0.5) * spacing;
          const ix = Math.round(clamp(jx, 0, mw - 1));
          const iy = Math.round(clamp(jy, 0, mh - 1));
          if ((data[(iy * mw + ix) * 4 + 3] ?? 0) <= 110) continue;
          let li = letters.findIndex(
            (l) =>
              jx >= l.x - 1 &&
              jx <= l.x + l.w + 1 &&
              jy >= l.y &&
              jy <= l.y + l.h,
          );
          if (li < 0) li = 0;
          tx.push(jx);
          ty.push(jy);
          of.push(li);
          count += 1;
          if (count >= MAX_PARTICLES) break;
        }
        if (count >= MAX_PARTICLES) break;
      }
    }
    const phrase: Phrase = {
      letters,
      px,
      py,
      plen,
      catchAt,
      caught: new Float32Array(letters.length).fill(Number.NaN),
      length,
      speed,
      writeEnd: 0.2 + length / speed,
      count,
      tx: Float32Array.from(tx),
      ty: Float32Array.from(ty),
      x: Float32Array.from(tx),
      y: Float32Array.from(ty),
      vx: new Float32Array(count),
      vy: new Float32Array(count),
      of: Int16Array.from(of),
      born: new Float32Array(count).fill(Number.NaN),
      alpha: Float32Array.from({ length: count }, () => 0.26 + 0.34 * rand()),
      size: Float32Array.from({ length: count }, () => 0.05 + 0.045 * rand()),
      freq: Float32Array.from({ length: count }, () => 7 + 6 * rand()),
      body: null,
      seed: (seed % 1000) / 100,
      parted: new Float32Array(letters.length),
    };
    // A re-layout keeps whatever the thread has already written.
    const prev = e.phrase;
    if (prev && prev.letters.length === letters.length && keep) {
      phrase.caught.set(prev.caught);
      for (let q = 0; q < count; q += 1) {
        const at = phrase.caught[phrase.of[q] ?? 0] ?? Number.NaN;
        if (!Number.isNaN(at)) phrase.born[q] = at - 1;
      }
    }
    e.phrase = phrase;
    phrase.body = bodyOf(phrase);
  };

  /** The point along the thread's path at length s. */
  const pathAt = (p: Phrase, s: number) => {
    const n = p.plen.length;
    let lo = 0;
    let hi = n - 1;
    const target = clamp(s, 0, p.length);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((p.plen[mid] ?? 0) < target) lo = mid;
      else hi = mid;
    }
    const a = p.plen[lo] ?? 0;
    const b = p.plen[hi] ?? 0;
    const t = b > a ? (target - a) / (b - a) : 0;
    return {
      x: lerp(p.px[lo] ?? 0, p.px[hi] ?? 0, t),
      y: lerp(p.py[lo] ?? 0, p.py[hi] ?? 0, t),
    };
  };

  const setPhase = (phase: Engine["phase"]) => {
    const e = engine.current;
    e.phase = phase;
    e.phaseAt = e.t;
  };

  /** One frame of smoke. */
  const frame = (now: number) => {
    raf.current = 0;
    const e = engine.current;
    const c = cfg.current;
    const ctx = e.ctx;
    const p = e.phrase;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    e.t += dt;
    const t = e.t;
    const em = e.em;
    const cu = clamp01(c.curl);
    const dr = clamp01(c.drift);
    let busy =
      e.phase === "write" || e.phase === "linger" || e.phase === "clear";

    // Phase changes, on the phrase clock.
    const age = t - e.phaseAt;
    if (p && e.phase === "write" && age >= p.writeEnd) {
      if (e.reported !== slot.n) {
        e.reported = slot.n;
        c.onComplete?.(c.index);
      }
      setPhase("linger");
    } else if (e.phase === "linger" && age >= c.linger / 1000) {
      if (!c.loop && c.index >= c.count - 1) setPhase("rest");
      else setPhase("clear");
    } else if (e.phase === "clear" && age >= CLEAR) {
      setPhase("idle");
      busy = false;
      advance();
    }

    if (!ctx || e.w <= 0) {
      if (busy && live.current)
        raf.current = window.requestAnimationFrame((x) => frameRef.current(x));
      return;
    }
    ctx.clearRect(0, 0, e.w, e.h);
    const [r, g, b] = e.rgb;
    const sprite = e.sprite;

    // The ember's own thin plume, while it burns.
    const burning = e.phase !== "idle" && e.phase !== "rest";
    if (burning && c.stick && t >= e.plumeNext) {
      const k = e.plumeHead;
      e.plumeX[k] = e.ember.x;
      e.plumeY[k] = e.ember.y;
      e.plumeT[k] = t;
      e.plumeK[k] = (k * 0.618) % 1;
      e.plumeHead = (k + 1) % PLUME;
      e.plumeNext = t + 0.045;
    }
    if (sprite) {
      for (let k = 0; k < PLUME; k += 1) {
        const a = t - (e.plumeT[k] ?? -1e9);
        if (a > 1.9) continue;
        busy = true;
        // Laminar for a moment above the ember, then it starts to curl.
        const lam = Math.max(0, a - 0.25);
        const x =
          (e.plumeX[k] ?? 0) +
          (0.15 + 0.6 * dr) * em * lam * lam +
          swirl(a * 1.6, e.plumeK[k] ?? 0, t * 0.7, 3.1) *
            (0.12 + 0.3 * cu) *
            em *
            lam;
        const y = (e.plumeY[k] ?? 0) - (0.55 * em * a + 0.1 * em * a * a);
        const s = (0.035 + 0.11 * a) * em;
        ctx.globalAlpha = 0.3 * (1 - a / 1.9) * Math.min(1, a * 5);
        ctx.drawImage(sprite, x - s, y - s, s * 2, s * 2);
      }
    }

    if (p) {
      const phaseAge = t - e.phaseAt;
      const writing = e.phase === "write";
      const s = writing ? Math.max(0, phaseAge - 0.2) * p.speed : p.length + 1;
      // The head of the thread, and the letters it has reached.
      if (writing && s <= p.length + 0.5 * em) {
        const head = pathAt(p, s);
        const wob = swirl(s / em, p.seed, t, p.seed) * cu * 0.12 * em;
        const hx = head.x + wob * 0.6;
        const hy = head.y + wob;
        const k = e.trailHead;
        e.trailX[k] = hx;
        e.trailY[k] = hy;
        e.trailT[k] = t;
        e.trailHead = (k + 1) % TRAIL;
        e.trailCount = Math.min(TRAIL, e.trailCount + 1);
        for (let li = 0; li < p.letters.length; li += 1) {
          if (!Number.isNaN(p.caught[li] ?? Number.NaN)) continue;
          if (s < (p.catchAt[li] ?? 0)) break;
          p.caught[li] = t;
          // The letter's smoke leaves the thread where it caught.
          for (let q = 0; q < p.count; q += 1) {
            if (p.of[q] !== li) continue;
            const ang = (q * 2.399) % (Math.PI * 2);
            const rad = ((q * 0.618) % 1) * 0.28 * em;
            p.x[q] = hx + Math.cos(ang) * rad;
            p.y[q] = hy + Math.sin(ang) * rad;
            p.vx[q] = p.speed * 0.25 + Math.cos(ang + 1.7) * 0.8 * em * cu;
            p.vy[q] = -0.4 * em + Math.sin(ang + 1.7) * 0.8 * em * cu;
            p.born[q] = t;
          }
        }
      }

      // The trail: the thread's past positions, rising, curling, fading.
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineCap = "round";
      let prevX = Number.NaN;
      let prevY = Number.NaN;
      for (let j = e.trailCount - 1; j >= 0; j -= 1) {
        const k = (e.trailHead - 1 - j + TRAIL * 2) % TRAIL;
        const a = t - (e.trailT[k] ?? -1e9);
        if (a > 1.6) {
          prevX = Number.NaN;
          continue;
        }
        busy = true;
        const x =
          (e.trailX[k] ?? 0) +
          swirl(a * 1.6, k * 0.21, t * 0.5, 1.7) * cu * 0.32 * em * a +
          0.35 * dr * em * a;
        const y = (e.trailY[k] ?? 0) - 0.42 * em * a;
        if (!Number.isNaN(prevX)) {
          ctx.globalAlpha = 0.5 * Math.pow(1 - a / 1.6, 1.6);
          ctx.lineWidth = (0.035 + 0.12 * a) * em;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        prevX = x;
        prevY = y;
      }

      // The letters' bodies.
      const clearing = e.phase === "clear";
      const u = clearing ? clamp01(phaseAge / CLEAR) : 0;
      if (p.body) {
        for (let li = 0; li < p.letters.length; li += 1) {
          const at = p.caught[li] ?? Number.NaN;
          if (Number.isNaN(at)) continue;
          const l = p.letters[li] as Letter;
          let a = smooth((t - at) / 0.7) * 0.62;
          if (e.phase === "linger" || e.phase === "rest")
            a *= 0.94 + 0.06 * Math.sin(t * 1.4 + li);
          // A hand through the smoke thins the letter it parts.
          const part = (p.parted[li] ?? 0) * Math.exp(-dt / 0.7);
          p.parted[li] = part < 0.01 ? 0 : part;
          if (part > 0) busy = true;
          a *= 1 - 0.75 * part;
          if (clearing) a *= (1 - u) * (1 - u);
          if (a <= 0.002) continue;
          const padX = 0.15 * em;
          const padY = 0.1 * em;
          const sx = (l.x - padX) * e.ratio;
          const sy = (l.y - padY) * e.ratio;
          const sw = (l.w + padX * 2) * e.ratio;
          const sh = (l.h + padY * 2) * e.ratio;
          const lift = clearing ? 0.85 * em * u * u : 0;
          const spread = clearing ? 0.16 * em * u : 0;
          const draw = (dx: number, dy: number, alpha: number) => {
            ctx.globalAlpha = alpha;
            ctx.drawImage(
              p.body as HTMLCanvasElement,
              sx,
              sy,
              sw,
              sh,
              l.x - padX + dx,
              l.y - padY - lift + dy,
              l.w + padX * 2,
              l.h + padY * 2,
            );
          };
          if (spread > 0.01) {
            // Three offset copies: a haze that softens as it rises.
            draw(-spread, 0, a * 0.45);
            draw(spread, -spread * 0.6, a * 0.45);
            draw(0, spread * 0.5, a * 0.3);
          } else draw(0, 0, a);
        }
      }

      // The smoke particles.
      if (sprite) {
        const ptr = e.pointer;
        const reach = 1.25 * em;
        const breathe = e.phase === "linger";
        const z =
          springs.glide.damping / (2 * Math.sqrt(springs.glide.stiffness));
        for (let q = 0; q < p.count; q += 1) {
          const born = p.born[q] ?? Number.NaN;
          if (Number.isNaN(born)) continue;
          const pa = t - born;
          let x = p.x[q] ?? 0;
          let y = p.y[q] ?? 0;
          let vx = p.vx[q] ?? 0;
          let vy = p.vy[q] ?? 0;
          if (clearing) {
            // Buoyant and turbulent: the letter lifts apart into haze.
            vx += (swirl(x / em, y / em, t, 2.3) * cu * 3 + dr * 1.2) * em * dt;
            vy += (-1.1 - 0.9 * u) * em * dt;
            vx *= 1 - 0.9 * dt;
            vy *= 1 - 0.9 * dt;
          } else {
            // Parted smoke drifts back slowly before its letter re-forms.
            const w =
              (p.freq[q] ?? 9) * (1 - 0.45 * (p.parted[p.of[q] ?? 0] ?? 0));
            let tx = p.tx[q] ?? 0;
            let ty = p.ty[q] ?? 0;
            if (breathe) {
              tx += swirl(tx / em, ty / em, t * 0.6, 1.1) * 0.025 * em;
              ty += swirl(ty / em, tx / em, t * 0.5, 4.2) * 0.02 * em;
            }
            const sw =
              swirl(x / em, y / em, t, 0.7) *
              cu *
              7 *
              em *
              Math.exp(-pa / 0.45);
            vx += (-(w * w) * (x - tx) - 2 * z * w * vx + sw) * dt;
            vy += (-(w * w) * (y - ty) - 2 * z * w * vy - sw * 0.6) * dt;
          }
          if (ptr && !clearing) {
            const d = Math.hypot(x - ptr.x, y - ptr.y);
            if (d < reach) {
              // Smoke is dragged toward half the hand's speed, never flung:
              // a fluid drag, bounded by the hand itself.
              const near = 1 - d / reach;
              const cap = 6 * em;
              const hvx = clamp(ptr.vx, -cap, cap) * 0.5;
              const hvy = clamp(ptr.vy, -cap, cap) * 0.5;
              const f = Math.min(1, near * 7 * dt);
              vx += (hvx - vx) * f;
              vy += (hvy - vy) * f;
              const li = p.of[q] ?? 0;
              const speed = Math.min(1, Math.hypot(ptr.vx, ptr.vy) / (12 * em));
              p.parted[li] = Math.max(p.parted[li] ?? 0, near * speed);
            }
          }
          x += vx * dt;
          y += vy * dt;
          p.x[q] = x;
          p.y[q] = y;
          p.vx[q] = vx;
          p.vy[q] = vy;
          if (Math.abs(vx) + Math.abs(vy) > 0.5) busy = true;
          let a = (p.alpha[q] ?? 0.3) * Math.min(1, pa / 0.25);
          if (clearing) a *= Math.pow(1 - u, 1.4);
          if (a <= 0.004) continue;
          const size = (p.size[q] ?? 0.09) * em * (clearing ? 1 + 2.4 * u : 1);
          ctx.globalAlpha = a;
          ctx.drawImage(sprite, x - size, y - size, size * 2, size * 2);
        }
      }
    }
    ctx.globalAlpha = 1;

    // The ember breathes, brighter while it writes.
    const glow = emberRef.current;
    if (glow) {
      const lit = burning ? 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.2)) : 0.2;
      glow.style.opacity = String(
        Math.round((e.phase === "write" ? Math.min(1, lit + 0.2) : lit) * 100) /
          100,
      );
    }
    if (e.pointer && now - e.pointer.t > 80) {
      e.pointer.vx *= 0.7;
      e.pointer.vy *= 0.7;
    }
    if (!Number.isNaN(e.waft)) {
      // The keyboard's breath: a hand that sweeps once along the line.
      const u = (now - e.waft) / 650;
      if (u > 1) {
        e.waft = Number.NaN;
        e.pointer = null;
      } else {
        const x = lerp(-0.5 * em, e.w + 0.5 * em, smooth(u));
        const y = (p?.letters[0]?.y ?? e.h / 2) + (p?.letters[0]?.h ?? 0) * 0.5;
        e.pointer = { x, y, vx: (e.w / 0.65) * 0.5, vy: -0.2 * em, t: now };
        busy = true;
      }
    }
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((x) => frameRef.current(x));
    }
  };

  /** The next phrase: its layout renders, then it is written. */
  const advance = () => {
    const c = cfg.current;
    setSlot((s) => ({
      n: s.n + 1,
      index: (s.index + 1) % Math.max(1, c.count),
    }));
  };

  /** Lights the stick and writes the current phrase. */
  const start = () => {
    const e = engine.current;
    clearTimers();
    if (!cfg.current.motionSafe) return;
    resize();
    colours();
    prepare();
    const p = e.phrase;
    if (p) {
      p.caught.fill(Number.NaN);
      p.born.fill(Number.NaN);
    }
    e.trailCount = 0;
    setPhase("idle");
    timers.current.push(
      window.setTimeout(
        () => {
          setPhase("write");
          api.current?.wake();
        },
        Math.max(0, delay),
      ),
    );
    wake();
  };

  const stop = () => {
    const e = engine.current;
    clearTimers();
    setPhase("idle");
    e.ctx?.clearRect(0, 0, e.w, e.h);
    halt();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      drift,
      curl,
      linger,
      density,
      loop,
      motionSafe,
      stick,
      dpr,
      count: list.length,
      index: slot.index,
      drawn,
      started,
      onPhraseChange,
      onComplete,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, start, stop, prepare, resize, colours };
  });

  // A new phrase is laid out, measured into smoke and written.
  React.useLayoutEffect(() => {
    const e = engine.current;
    const c = cfg.current;
    if (e.phase === "idle" && c.drawn && slot.n > 0) {
      api.current?.prepare();
      const p = e.phrase;
      if (p) {
        p.caught.fill(Number.NaN);
        p.born.fill(Number.NaN);
      }
      e.trailCount = 0;
      e.phase = "write";
      e.phaseAt = e.t;
      api.current?.wake();
    }
    // Each phrase is state: the host hears it as it begins, the first too.
    c.onPhraseChange?.(slot.index);
    // Standing finished under reduced motion, it is written as it arrives.
    if (c.started && !c.motionSafe) c.onComplete?.(slot.index);
  }, [slot]);

  React.useEffect(() => {
    if (drawn) api.current?.start();
    else api.current?.stop();
    // Lit under reduced motion, the phrase is already written.
    const c = cfg.current;
    if (c.started && !c.motionSafe) c.onComplete?.(c.index);
  }, [drawn, entrance.n]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
  }, [running]);

  // Reduced motion: each phrase stands finished and the next cross-fades in.
  React.useEffect(() => {
    if (motionSafe || !started) return;
    if (!loop && slot.index >= list.length - 1) return;
    if (list.length < 2 || !running) return;
    const id = window.setTimeout(
      () =>
        setSlot((s) => ({ n: s.n + 1, index: (s.index + 1) % list.length })),
      Math.round(linger + 1400),
    );
    return () => window.clearTimeout(id);
  }, [motionSafe, started, loop, slot, list.length, linger, running]);

  React.useEffect(
    () => () => {
      api.current?.halt();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const rest = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin();
    if (trigger === "manual") {
      if (play) begin();
      else rest();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, rest]);

  const seen = React.useRef(trigger);
  React.useLayoutEffect(() => {
    seen.current = trigger;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const relayout = () => {
        api.current?.resize();
        if (engine.current.phrase) api.current?.prepare(true);
        api.current?.wake();
      };
      const sizer = new ResizeObserver(relayout);
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", relayout);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        if (seen.current === "inView" && visible) begin();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", relayout);
      };
    },
    [begin],
  );

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letterNodes.current.set(key, node);
    else letterNodes.current.delete(key);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !motionSafe) return;
    const root = rootRef.current;
    const e = engine.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const prev = e.pointer;
    let vx = 0;
    let vy = 0;
    if (prev) {
      const dt = Math.max(8, event.timeStamp - prev.t) / 1000;
      vx = clamp((x - prev.x) / dt, -3000, 3000);
      vy = clamp((y - prev.y) / dt, -3000, 3000);
    }
    e.pointer = { x, y, vx, vy, t: event.timeStamp };
    wake();
  };

  /** A breath across the words: the keyboard's hand through the smoke. */
  const waft = () => {
    const e = engine.current;
    if (!motionSafe) {
      setFaint(true);
      window.setTimeout(() => setFaint(false), 450);
      return;
    }
    e.waft = performance.now();
    wake();
  };

  // Words stay whole: a phrase that is too long wraps between them.
  const chars = graphemes(current);
  const words: { at: number[]; key: number }[] = [];
  let run: number[] = [];
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (run.length) words.push({ at: run, key: i });
      run = [];
      return;
    }
    run.push(i);
  });
  if (run.length) words.push({ at: run, key: chars.length });

  const spoken = list
    .filter(Boolean)
    .map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`))
    .join(" ");
  const Tag = as;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative w-full",
        stick ? "pt-[0.9em] pb-[0.18em] pl-[1.55em]" : "pt-[0.7em] pb-[0.1em]",
        className,
      )}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        engine.current.pointer = null;
      }}
    >
      <Tag className="m-0">
        <span className="sr-only">{spoken}</span>
        <span aria-hidden className="grid">
          {/* Every phrase, invisible, so the box is the largest one's. */}
          {list.map((p, i) => (
            <span key={i} className="invisible select-none [grid-area:1/1]">
              {p}
            </span>
          ))}
          <motion.span
            key={slot.n}
            data-smoke-line=""
            initial={slot.n === 0 ? false : { opacity: 0 }}
            animate={{ opacity: faint ? 0.55 : 1 }}
            transition={{ duration: durations.slow, ease: easings.enter }}
            className="[grid-area:1/1]"
          >
            <span
              className="transition-[color,text-shadow] duration-300"
              style={{
                color: drawn ? "transparent" : color,
                textShadow: drawn
                  ? "none"
                  : `0 0 0.05em ${color}, 0 0 0.22em color-mix(in oklab, ${color} 45%, transparent)`,
              }}
            >
              {words.map((word, w) => (
                <React.Fragment key={word.key}>
                  {w > 0 ? " " : null}
                  <span className="whitespace-nowrap">
                    {word.at.map((i) => (
                      <span key={i} ref={bindLetter(`${slot.n}:${i}`)}>
                        {chars[i]}
                      </span>
                    ))}
                  </span>
                </React.Fragment>
              ))}
            </span>
          </motion.span>
        </span>
      </Tag>
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={() => {
          api.current?.colours();
          api.current?.wake();
        }}
        className="pointer-events-none absolute inset-0 size-full [mask-image:linear-gradient(to_bottom,transparent,black_0.7em)] transition-colors duration-1"
        style={{ color }}
      />
      {stick ? (
        <svg
          aria-hidden
          viewBox="0 -110 150 250"
          className="pointer-events-none absolute bottom-0 left-0 overflow-visible"
          style={{ width: "1.5em", height: "2.5em" }}
        >
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0%" stopColor={ember} stopOpacity={0.9} />
              <stop offset="45%" stopColor={ember} stopOpacity={0.28} />
              <stop offset="100%" stopColor={ember} stopOpacity={0} />
            </radialGradient>
          </defs>
          {drawn ? null : (
            // The still plume: what the smoke looks like before it moves.
            <path
              d="M81 12 C 76 -6, 92 -22, 86 -42 S 98 -78, 112 -96"
              fill="none"
              stroke={color}
              strokeWidth={3.5}
              strokeLinecap="round"
              opacity={0.28}
            />
          )}
          <path
            d="M18 126 Q 75 146 132 126"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <path
            d="M64 124 L 67 98"
            stroke={BAMBOO}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <path
            d="M67 98 L 79.4 22"
            stroke={STICK}
            strokeWidth={5.6}
            strokeLinecap="round"
          />
          <path
            d="M79.4 22 L 80.6 15"
            stroke={ASH}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle
            ref={emberRef}
            cx={80.8}
            cy={13}
            r={13}
            fill={`url(#${glowId})`}
            style={{ opacity: 0.2 }}
          />
          <circle cx={80.8} cy={13} r={3.2} fill={ember} />
        </svg>
      ) : null}
      {interactive ? (
        <>
          <button
            type="button"
            aria-label="Waft the smoke"
            aria-describedby={hintId}
            onClick={(event) => {
              if (event.detail === 0) waft();
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Enter wafts a breath across the words.
          </span>
        </>
      ) : null}
    </div>
  );
}
