"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GrainGatherTrigger = "mount" | "inView" | "hover" | "manual";
export type GrainGatherElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div";

export type GrainGatherProps = {
  /** The words the grains gather into. */
  text: string;
  /** The text element rendered. @default "h2" */
  as?: GrainGatherElement;
  /** How many grains, 0 to 1: about 1,200 to 4,800, spread over the letters' ink. @default 0.6 */
  density?: number;
  /** How far the hand reaches, px. @default 56 */
  radius?: number;
  /** How hard the hand pushes the grains aside, 0 to 1. @default 0.6 */
  strength?: number;
  /** How hard a press throws the grains, 0 to 1. @default 0.6 */
  scatter?: number;
  /** How much the scattered grains wander before they gather, 0 to 1. @default 0.5 */
  drift?: number;
  /** The grains' colour. @default "currentColor" — the text colour you set */
  color?: string;
  /** A grain's size, px. @default 1.3 */
  grain?: number;
  /** The highest device pixel ratio the canvas draws at (capped at 2). @default 2 */
  dpr?: number;
  /** A pointer parts the grains, a press scatters them, and Enter or Space scatters them from the keyboard. @default true */
  interactive?: boolean;
  /** When they gather: on mount, when scrolled into view, on hover or keyboard focus, or when `active` turns true. @default "inView" */
  trigger?: GrainGatherTrigger;
  /** Gather only the first time. False lets them drift apart when the text leaves view and gather again. @default true */
  once?: boolean;
  /** Wait before the grains start to gather, ms. @default 100 */
  delay?: number;
  /** For `trigger="manual"`: true gathers the grains, false lets them drift apart. */
  active?: boolean;
  /** Fires the first time the grains settle into the words. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The gather's spring, per grain: the drift calibration, a little under-damped. */
const GATHER_K = springs.drift.stiffness / springs.drift.mass;
const GATHER_ZETA = 0.8;
/** How long a grain takes to take hold once its turn comes, s. */
const ENGAGE = 0.24;
/** The gather's sweep across the words, left to right, s. */
const SWEEP = 0.45;
/** Fixed simulation step, s. */
const STEP = 1 / 120;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Rgb = [number, number, number];

/** Any CSS colour to rgb, through a 1×1 canvas: oklch, color-mix and all. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

type Field = {
  n: number;
  w: number;
  h: number;
  hx: Float32Array;
  hy: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  k: Float32Array;
  c: Float32Array;
  /** When, after the gather begins, this grain's spring takes hold, s. */
  start: Float32Array;
  phase: Float32Array;
  size: Float32Array;
  /** 0, 1 or 2: three tones of the one colour, so the sand has depth. */
  tone: Uint8Array;
};

type Sim = {
  field: Field | null;
  /** Simulation clock, s. */
  t: number;
  /** Simulation time the gather began, or null while the grains drift. */
  gatherAt: number | null;
  /** Simulation time of the last scatter, or null. */
  burstAt: number | null;
  last: number;
  frame: number;
  acc: number;
  timer: number | null;
  played: boolean;
  completed: boolean;
  settled: boolean;
  /** The hand. */
  hand: {
    on: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
  };
  press: { x: number; y: number; t: number; id: number } | null;
  /** Reduced motion's fade, 0 to 1. */
  alpha: number;
  colours: string[];
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  play: () => void;
  begin: () => void;
  release: () => void;
  wake: () => void;
  frame: (now: number) => void;
  layout: () => void;
  paint: () => void;
  burst: (x: number, y: number) => void;
};

/**
 * Words poured rather than printed. The text is laid out for real — in the
 * DOM, in your font, transparent and selectable — and its own glyphs are
 * drawn into an offscreen mask and sampled into a few thousand grains on a
 * canvas behind it. Before the trigger the grains lie scattered, drifting on
 * a slow seeded field; then each grain's spring takes hold in reading order,
 * a sweep left to right, and they gather into the letters on springs from the
 * drift calibration, a touch under-damped so the words sharpen out of a haze.
 *
 * A mouse, pen or finger moving through the words parts the grains like a hand
 * through sand — a push with a smooth falloff plus a drag along the hand's own
 * motion — and the springs draw them back behind it. A press throws them
 * outward from the point and lets the springs go for a moment, so they fly,
 * drift and regather; Enter or Space does the same from the keyboard. The
 * simulation is typed arrays with nothing allocated per frame, runs only on
 * screen in a visible page, and stops the moment every grain is home. Under
 * reduced motion the grains appear already home and fade in, and the hand
 * and the throw are off.
 */
export function GrainGather({
  text,
  as = "h2",
  density = 0.6,
  radius = 56,
  strength = 0.6,
  scatter = 0.6,
  drift = 0.5,
  color = "currentColor",
  grain = 1.3,
  dpr = 2,
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 100,
  active,
  onComplete,
  className,
}: GrainGatherProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const words = React.useMemo(
    () => text.split(/(\s+)/).filter((w) => w !== ""),
    [text],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const textRef = React.useRef<HTMLHeadingElement | null>(null);
  const reader = React.useRef<((c: string) => Rgb) | null>(null);
  const context = React.useRef<CanvasRenderingContext2D | null>(null);
  const fadeRun = React.useRef<AnimationPlaybackControls | null>(null);
  const sim = React.useRef<Sim>({
    field: null,
    t: 0,
    gatherAt: null,
    burstAt: null,
    last: 0,
    frame: 0,
    acc: 0,
    timer: null,
    played: false,
    completed: false,
    settled: false,
    hand: { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0 },
    press: null,
    alpha: 1,
    colours: ["rgba(0,0,0,1)", "rgba(0,0,0,0.8)", "rgba(0,0,0,0.6)"],
  });
  const api = React.useRef<Api | null>(null);
  const done = React.useRef(onComplete);
  const pump = React.useCallback((now: number) => {
    sim.current.frame = 0;
    api.current?.frame(now);
  }, []);

  const backing = () =>
    Math.max(1, Math.min(2, dpr, window.devicePixelRatio || 1));

  const readColours = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!reader.current) reader.current = rgbReader();
    const [r, g, b] = reader.current(getComputedStyle(canvas).color);
    sim.current.colours = [1, 0.8, 0.58].map(
      (a) => `rgba(${r}, ${g}, ${b}, ${a})`,
    );
  };

  const paint = () => {
    const canvas = canvasRef.current;
    const f = sim.current.field;
    if (canvas && !context.current) context.current = canvas.getContext("2d");
    const ctx = context.current;
    if (!canvas || !ctx) return;
    const s = backing();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!f) return;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalAlpha = clamp01(sim.current.alpha);
    for (let tone = 0; tone < 3; tone += 1) {
      ctx.fillStyle = sim.current.colours[tone] ?? "black";
      for (let i = 0; i < f.n; i += 1) {
        if (f.tone[i] !== tone) continue;
        const z = f.size[i] ?? 1;
        ctx.fillRect((f.x[i] ?? 0) - z / 2, (f.y[i] ?? 0) - z / 2, z, z);
      }
    }
    ctx.globalAlpha = 1;
  };

  /**
   * Reads the words' real layout and samples their glyphs into grain homes.
   * Grains already on the canvas carry over and flow to their new homes.
   */
  const layout = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const host = textRef.current;
    if (!root || !canvas || !host) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const s = backing();
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    readColours();

    // The mask: each word drawn where the page laid it out, in its font.
    const scale = 2;
    const mask = document.createElement("canvas");
    mask.width = Math.round(w * scale);
    mask.height = Math.round(h * scale);
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    if (!mctx) return;
    const cs = getComputedStyle(host);
    mctx.setTransform(scale, 0, 0, scale, 0, 0);
    mctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const spacing = cs.letterSpacing;
    if ("letterSpacing" in mctx && spacing && spacing !== "normal") {
      (
        mctx as CanvasRenderingContext2D & { letterSpacing: string }
      ).letterSpacing = spacing;
    }
    mctx.fillStyle = "black";
    mctx.textBaseline = "alphabetic";
    const rootBox = root.getBoundingClientRect();
    for (const node of Array.from(
      host.querySelectorAll<HTMLElement>("[data-grain-word]"),
    )) {
      const word = node.textContent ?? "";
      const r = node.getBoundingClientRect();
      const m = mctx.measureText(word);
      // An inline-block word is one line box tall: the baseline sits half
      // the leading down, then the font's ascent.
      const ascent = m.fontBoundingBoxAscent || r.height * 0.78;
      const descent = m.fontBoundingBoxDescent || r.height * 0.22;
      const baseline = (r.height - (ascent + descent)) / 2 + ascent;
      mctx.fillText(
        word,
        r.left - rootBox.left,
        r.top - rootBox.top + baseline,
      );
    }
    const data = mctx.getImageData(0, 0, mask.width, mask.height).data;
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 110) ink += 1;
    const area = ink / (scale * scale);
    const target = lerp(1200, 4800, clamp01(density));
    const pitch = Math.max(0.8, Math.sqrt(area / Math.max(1, target)));

    const rand = lcg(hashText(text) ^ Math.round(w));
    const hx: number[] = [];
    const hy: number[] = [];
    for (let y = pitch / 2; y < h; y += pitch) {
      for (let x = pitch / 2; x < w; x += pitch) {
        const jx = x + (rand() - 0.5) * pitch * 0.9;
        const jy = y + (rand() - 0.5) * pitch * 0.9;
        const px = Math.round(jx * scale);
        const py = Math.round(jy * scale);
        if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) continue;
        if ((data[(py * mask.width + px) * 4 + 3] ?? 0) > 110) {
          hx.push(jx);
          hy.push(jy);
        }
      }
    }
    const n = Math.min(4800, hx.length);
    const old = sim.current.field;
    const field: Field = {
      n,
      w,
      h,
      hx: new Float32Array(n),
      hy: new Float32Array(n),
      x: new Float32Array(n),
      y: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      k: new Float32Array(n),
      c: new Float32Array(n),
      start: new Float32Array(n),
      phase: new Float32Array(n),
      size: new Float32Array(n),
      tone: new Uint8Array(n),
    };
    const g = sim.current.gatherAt !== null && sim.current.settled;
    for (let i = 0; i < n; i += 1) {
      const pick = hx.length > n ? Math.floor((i * hx.length) / n) : i;
      const homeX = hx[pick] ?? 0;
      const homeY = hy[pick] ?? 0;
      field.hx[i] = homeX;
      field.hy[i] = homeY;
      const stiff = GATHER_K * (0.72 + 0.56 * rand());
      field.k[i] = stiff;
      field.c[i] = 2 * GATHER_ZETA * Math.sqrt(stiff);
      field.start[i] = (homeX / w) * SWEEP + rand() * 0.08;
      field.phase[i] = rand() * Math.PI * 2;
      // Large type samples on a wider pitch; its grains grow with it, so the
      // sand reads as dense at a hero as it does at a caption.
      field.size[i] =
        grain * clamp(pitch / 1.25, 0.85, 1.8) * (0.65 + 0.5 * rand());
      field.tone[i] = rand() < 0.5 ? 0 : rand() < 0.6 ? 1 : 2;
      if (old && old.n > 0) {
        const j = i % old.n;
        field.x[i] = old.x[j] ?? homeX;
        field.y[i] = old.y[j] ?? homeY;
      } else if (g || !motionSafe) {
        field.x[i] = homeX;
        field.y[i] = homeY;
      } else {
        field.x[i] = rand() * w;
        field.y[i] = rand() * h;
      }
    }
    sim.current.field = field;
    sim.current.settled = false;
    paint();
    wake();
  };

  /** Advances the sand by one fixed step; true while any grain is still moving. */
  const step = (dt: number): boolean => {
    const S = sim.current;
    const f = S.field;
    if (!f) return false;
    S.t += dt;
    const t = S.t;
    const gather = S.gatherAt;
    const hold = S.burstAt === null ? 1 : clamp01((t - S.burstAt - 0.12) / 0.6);
    const wander = clamp01(drift) * 38;
    const R = Math.max(8, radius);
    const push = clamp01(strength) * 7000;
    const hand = S.hand;
    const air = S.burstAt !== null && hold < 1 ? 3.2 : 1.4;
    let moving = false;
    for (let i = 0; i < f.n; i += 1) {
      let x = f.x[i] ?? 0;
      let y = f.y[i] ?? 0;
      let vx = f.vx[i] ?? 0;
      let vy = f.vy[i] ?? 0;
      const e =
        gather === null
          ? 0
          : clamp01((t - gather - (f.start[i] ?? 0)) / ENGAGE) * hold;
      let ax = 0;
      let ay = 0;
      if (e > 0) {
        const k = f.k[i] ?? GATHER_K;
        const c = f.c[i] ?? 10;
        ax += e * (k * ((f.hx[i] ?? 0) - x) - c * vx);
        ay += e * (k * ((f.hy[i] ?? 0) - y) - c * vy);
      }
      const free = 1 - e;
      if (free > 0.001) {
        const ph = f.phase[i] ?? 0;
        ax += free * (wander * Math.sin(y * 0.031 + t * 0.7 + ph) - air * vx);
        ay +=
          free * (wander * Math.cos(x * 0.027 - t * 0.6 + ph * 1.3) - air * vy);
        // Loose sand stays on the table: a soft wall at the box's edges.
        if (x < 0) ax -= x * 30;
        else if (x > f.w) ax -= (x - f.w) * 30;
        if (y < 0) ay -= y * 30;
        else if (y > f.h) ay -= (y - f.h) * 30;
      }
      if (hand.on) {
        const dx = x - hand.x;
        const dy = y - hand.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 0.001;
          const fall = (1 - d / R) ** 2;
          ax += (dx / d) * fall * push + hand.vx * fall * 7;
          ay += (dy / d) * fall * push + hand.vy * fall * 7;
        }
      }
      vx += ax * dt;
      vy += ay * dt;
      x += vx * dt;
      y += vy * dt;
      f.x[i] = x;
      f.y[i] = y;
      f.vx[i] = vx;
      f.vy[i] = vy;
      if (
        !moving &&
        (vx * vx + vy * vy > 4 ||
          Math.abs(x - (f.hx[i] ?? 0)) > 0.3 ||
          Math.abs(y - (f.hy[i] ?? 0)) > 0.3)
      ) {
        moving = true;
      }
    }
    return moving;
  };

  const frame = (now: number) => {
    const S = sim.current;
    const f = S.field;
    if (!f) return;
    const dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : STEP;
    S.last = now;
    S.acc += dt;
    let moving = false;
    let steps = 0;
    while (S.acc >= STEP && steps < 6) {
      moving = step(STEP) || moving;
      S.acc -= STEP;
      steps += 1;
    }
    if (steps === 6) S.acc = 0;
    // A frame shorter than a step moves nothing and decides nothing.
    if (steps === 0) {
      S.frame = window.requestAnimationFrame(pump);
      return;
    }
    // The hand fades: a still pointer stops pushing.
    S.hand.vx *= 0.8;
    S.hand.vy *= 0.8;
    paint();
    const gathered =
      S.gatherAt !== null &&
      S.t - S.gatherAt > SWEEP + ENGAGE + 0.1 &&
      (S.burstAt === null || S.t - S.burstAt > 0.75);
    if (gathered && !moving && !S.hand.on) {
      // Every grain home and still: snap the last fractions and rest.
      for (let i = 0; i < f.n; i += 1) {
        f.x[i] = f.hx[i] ?? 0;
        f.y[i] = f.hy[i] ?? 0;
        f.vx[i] = 0;
        f.vy[i] = 0;
      }
      S.settled = true;
      S.last = 0;
      paint();
      if (!S.completed) {
        S.completed = true;
        done.current?.();
      }
      return;
    }
    // A hand resting on parted sand holds it there; the next move wakes it.
    if (
      gathered &&
      !moving &&
      S.hand.on &&
      Math.abs(S.hand.vx) + Math.abs(S.hand.vy) < 1
    ) {
      S.last = 0;
      return;
    }
    // Scattered sand with no wander and no hand needs no frames.
    if (S.gatherAt === null && drift <= 0 && !S.hand.on && !moving) {
      S.last = 0;
      return;
    }
    S.frame = window.requestAnimationFrame(pump);
  };

  const wake = () => {
    const S = sim.current;
    if (S.frame || !running || !motionSafe || !S.field) return;
    if (S.settled && !S.hand.on && S.gatherAt !== null) return;
    S.settled = false;
    S.last = 0;
    S.frame = window.requestAnimationFrame(pump);
  };

  const begin = () => {
    const S = sim.current;
    S.timer = null;
    const f = S.field;
    if (!motionSafe) {
      // Reduced motion: the grains are home, and fade in.
      S.gatherAt = S.t;
      S.settled = true;
      if (f) {
        f.x.set(f.hx);
        f.y.set(f.hy);
        f.vx.fill(0);
        f.vy.fill(0);
      }
      fadeRun.current?.stop();
      S.alpha = 0;
      fadeRun.current = animate(0, 1, {
        duration: durations.slow,
        ease: easings.enter,
        onUpdate: (v) => {
          sim.current.alpha = v;
          api.current?.paint();
        },
        onComplete: () => {
          if (!sim.current.completed) {
            sim.current.completed = true;
            done.current?.();
          }
        },
      });
      return;
    }
    S.alpha = 1;
    S.gatherAt = S.t;
    S.burstAt = null;
    S.settled = false;
    wake();
  };

  const play = () => {
    const S = sim.current;
    if (S.timer !== null) window.clearTimeout(S.timer);
    S.timer = null;
    S.played = true;
    if (delay > 0) {
      S.timer = window.setTimeout(() => api.current?.begin(), delay);
    } else {
      begin();
    }
  };

  /** The springs let go: the grains drift apart again. */
  const release = () => {
    const S = sim.current;
    if (S.timer !== null) window.clearTimeout(S.timer);
    S.timer = null;
    S.gatherAt = null;
    S.burstAt = null;
    S.settled = false;
    if (!motionSafe) {
      fadeRun.current?.stop();
      S.alpha = 0.25;
      paint();
      return;
    }
    // A gentle push apart, so letting go is seen.
    const f = S.field;
    if (f) {
      const rand = lcg(Math.round(S.t * 1000) + 7);
      for (let i = 0; i < f.n; i += 1) {
        f.vx[i] = (rand() - 0.5) * 160;
        f.vy[i] = (rand() - 0.5) * 160;
      }
    }
    wake();
  };

  /** A press throws the grains outward from the point. */
  const burst = (x: number, y: number) => {
    const S = sim.current;
    const f = S.field;
    if (!f || !motionSafe || !interactive) return;
    const rand = lcg(Math.round(S.t * 1000) + f.n);
    const power = clamp01(scatter) * 900;
    const reach = Math.max(40, f.w * 0.5);
    for (let i = 0; i < f.n; i += 1) {
      let dx = (f.x[i] ?? 0) - x;
      let dy = (f.y[i] ?? 0) - y;
      let d = Math.hypot(dx, dy);
      if (d < 0.5) {
        const a = rand() * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      const kick =
        power * (0.35 + 0.65 * Math.exp(-d / reach)) * (0.6 + 0.8 * rand());
      f.vx[i] = (f.vx[i] ?? 0) + (dx / d) * kick;
      f.vy[i] = (f.vy[i] ?? 0) + (dy / d) * kick - rand() * power * 0.15;
    }
    if (S.gatherAt === null) S.gatherAt = S.t - SWEEP - ENGAGE;
    S.burstAt = S.t;
    S.settled = false;
    wake();
  };

  React.useLayoutEffect(() => {
    api.current = { play, begin, release, wake, frame, layout, paint, burst };
    done.current = onComplete;
  });

  // New words, a new density or grain size: sample again.
  React.useEffect(() => {
    api.current?.layout();
  }, [text, density, grain, dpr]);

  const firstSafe = React.useRef(motionSafe);
  React.useEffect(() => {
    if (firstSafe.current === motionSafe) return;
    firstSafe.current = motionSafe;
    if (sim.current.played) api.current?.play();
  }, [motionSafe]);

  React.useEffect(() => {
    if (trigger === "mount") api.current?.play();
  }, [trigger]);

  React.useEffect(() => {
    if (trigger !== "manual" || active === undefined) return;
    if (active) api.current?.play();
    else api.current?.release();
  }, [trigger, active]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    const S = sim.current;
    return () => {
      if (S.frame) window.cancelAnimationFrame(S.frame);
      S.frame = 0;
      S.last = 0;
    };
  }, [running, motionSafe, drift]);

  React.useEffect(() => {
    const S = sim.current;
    const fading = fadeRun;
    return () => {
      if (S.timer !== null) window.clearTimeout(S.timer);
      S.timer = null;
      fading.current?.stop();
    };
  }, []);

  const latestTrigger = React.useRef({ trigger, once });
  React.useEffect(() => {
    latestTrigger.current = { trigger, once };
  });

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setOnScreen(entry.isIntersecting);
        const { trigger: t, once: o } = latestTrigger.current;
        if (t !== "inView") return;
        const S = sim.current;
        if (entry.intersectionRatio >= 0.4 && (!S.played || !o)) {
          if (S.gatherAt === null) api.current?.play();
        } else if (!entry.isIntersecting && !o && S.played) {
          api.current?.release();
        }
      },
      { threshold: [0, 0.4] },
    );
    watcher.observe(node);
    const sizer = new ResizeObserver(() => api.current?.layout());
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.layout());
    return () => {
      watcher.disconnect();
      sizer.disconnect();
    };
  }, []);

  // A new theme or colour: the 1ms colour transition says when.
  const onColours = () => {
    readColours();
    paint();
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !motionSafe) return;
    if (event.pointerType === "touch" && !sim.current.press) return;
    const { x, y } = local(event.clientX, event.clientY);
    const hand = sim.current.hand;
    const t = event.timeStamp;
    if (hand.on && t > hand.t) {
      const k = 1000 / Math.max(8, t - hand.t);
      hand.vx = clamp((x - hand.x) * k, -2400, 2400);
      hand.vy = clamp((y - hand.y) * k, -2400, 2400);
    }
    hand.on = true;
    hand.x = x;
    hand.y = y;
    hand.t = t;
    wake();
  };

  const letGo = () => {
    sim.current.hand.on = false;
    wake();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    sim.current.press = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      id: event.pointerId,
    };
    if (event.pointerType === "touch") onPointerMove(event);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = sim.current.press;
    sim.current.press = null;
    if (event.pointerType === "touch") letGo();
    if (!press || press.id !== event.pointerId) return;
    // A press that stayed put is a throw; a drag is a hand (or a selection).
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > 6 || event.timeStamp - press.t > 450) return;
    const { x, y } = local(event.clientX, event.clientY);
    burst(x, y);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const f = sim.current.field;
    if (!f) return;
    burst(f.w / 2, f.h / 2);
  };

  const Tag = as as "h2";

  return (
    <div
      ref={bindRoot}
      role={interactive ? "group" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-describedby={interactive ? hintId : undefined}
      onPointerEnter={(event) => {
        if (
          trigger === "hover" &&
          event.pointerType !== "touch" &&
          (!sim.current.played || !once)
        ) {
          play();
        }
      }}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        if (trigger === "hover" && (!sim.current.played || !once)) play();
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") letGo();
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        sim.current.press = null;
        letGo();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "relative p-[0.2em]",
        interactive &&
          "touch-pan-y rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={{ color }}
      />
      {/* The real words: laid out by the page, read once, selectable — and
          transparent, because the sand is what you see. */}
      <Tag
        ref={textRef}
        className="relative m-0 text-transparent selection:bg-cobalt-wash selection:text-transparent"
        style={{ font: "inherit", letterSpacing: "inherit" }}
      >
        {words.map((w, i) =>
          /^\s+$/.test(w) ? (
            " "
          ) : (
            <span
              key={i}
              data-grain-word=""
              className="inline-block whitespace-nowrap"
            >
              {w}
            </span>
          ),
        )}
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Move across the words to part the grains; press, or press Enter, to
          scatter them.
        </span>
      ) : null}
    </div>
  );
}
