"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  useSpring,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CharCastRamp = "fine" | "short" | "blocks" | "dots";
export type CharCastTrigger = "mount" | "inView" | "manual";
export type CharCastElement = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

export type CharCastProps = {
  /** The headline. It stays real text — transparent over the characters — so it reads, selects and copies. */
  text: string;
  /** The element the headline renders as. @default "div" */
  as?: CharCastElement;
  /** The character cell's width, px; rows are 1.4 times taller, as mono glyphs are. @default 6 */
  cell?: number;
  /** The density ramp the coverage is cast through, light to dense. @default "short" */
  ramp?: CharCastRamp;
  /** A custom ramp, lightest first (start with a space); overrides `ramp`. */
  characters?: string;
  /** The radius of the light the pointer carries, px; 0 turns it off. @default 72 */
  light?: number;
  /** The colour the finer characters warm toward at the light's centre. @default "var(--accent-bright)" */
  tint?: string;
  /** How fast the noise drifts through the glyphs, 0 (still) to 2. @default 1 */
  drift?: number;
  /** The coverage curve: above 1 thins the strokes, below 1 fattens them; 0.5 to 2. @default 1 */
  contrast?: number;
  /** What casts the headline. @default "inView" */
  trigger?: CharCastTrigger;
  /** With `inView`, cast only the first time it is seen. @default true */
  once?: boolean;
  /** With `manual`: true casts the headline, false shows it as plain type. */
  active?: boolean;
  /** How long the cast takes to sweep across, ms. @default 700 */
  duration?: number;
  /** The pointer, a touch or the arrow keys carry the light. @default true */
  interactive?: boolean;
  /** Caps the canvas's device pixel ratio; never above 2. @default 2 */
  dpr?: number;
  /** Seeds the noise and the cast's order. @default 0 */
  seed?: number;
  /** The cast has settled. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

const RAMPS: Record<CharCastRamp, string> = {
  fine: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  short: " .:-=+*#%@",
  blocks: " ░▒▓█",
  dots: " .·•●",
};

/** Rows are this much taller than cells are wide: mono glyphs are tall. */
const ROW = 1.4;
/** Glyphs are set this large against their row, so a dense ramp reads as solid ink. */
const SET = 1.08;
/** The light's own spring and the cast's: the light trails the hand on glide. */
const LIGHT_SPRING = springs.glide;
/** The snap spring's step response, solved in closed form: each cell's density overshoots one step and settles. */
const SNAP = (() => {
  const { stiffness, damping, mass } = springs.snap;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const k = (zeta * w0) / wd;
  return (t: number) =>
    t <= 0
      ? 0
      : 1 -
        Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + k * Math.sin(wd * t));
})();
/** How long one cell's density takes to settle, s. */
const SETTLE = 0.42;
/** The frame clock, read only from effects, events and frames. */
const clockNow = () => performance.now();
/** Drift redraws this often, ms: a slow photocopy, never a flicker. */
const DRIFT_STEP = 83;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A lattice hash in [0, 1). Unsigned shifts throughout. */
function lattice(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 1274126177) ^
    seed;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
function noise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const at = (i: number, j: number, k: number) =>
    lattice(xi + i, yi + j, zi + k, seed);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (k: number) =>
    lerp(
      lerp(at(0, 0, k), at(1, 0, k), sx),
      lerp(at(0, 1, k), at(1, 1, k), sx),
      sy,
    );
  return lerp(plane(0), plane(1), sz) * 2 - 1;
}

type Rgb = [number, number, number];

/** Any CSS colour as sRGB bytes, read back from a one-pixel canvas. */
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

/** Light levels the lit glyphs are drawn in: ink warming toward the tint. */
const LEVELS = 8;

type Grid = {
  w: number;
  h: number;
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  /** Coverage per coarse cell, 0 to 1. */
  coarse: Float32Array;
  /** Coverage per fine cell (half the size), 0 to 1. */
  fine: Float32Array;
  fcols: number;
  frows: number;
  /** Fine cell size, px. */
  fw: number;
  fh: number;
  /** When each coarse cell joins the cast, 0 to 1. */
  order: Float32Array;
};

type Paint = {
  ink: string;
  lit: string[];
  mono: string;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Phase = "idle" | "cast" | "rest";

type Api = {
  layout: () => void;
  kick: () => void;
  colours: () => void;
  cast: () => void;
  idle: () => void;
};

/**
 * Your headline recast in characters. The headline stays real text,
 * transparent, and a canvas behind it draws it again as a grid of characters:
 * on layout the text is rasterised from its own DOM — each word at its box in
 * the element's own font — and the coverage of every cell picks a character
 * from a density ramp, set in the mono face in the element's ink. A slow value
 * noise drifts through the glyphs, nudging the letters' edges up and down the
 * ramp and leaving a faint dust in the empty cells.
 *
 * The pointer carries a soft light that trails the hand on the glide spring;
 * inside it each cell gives way to four finer characters that resolve the
 * true letterforms, warming toward `tint` at the centre. The cast is the
 * signature: every cell condenses out of blank paper on a seeded sweep, its
 * density following the snap spring's step response, so it overshoots one
 * step heavier and settles.
 *
 * Touch drags the light across; the keyboard brings it to the first letter on
 * focus and the arrow keys walk it. The canvas draws only while something
 * changes — the light moving, the cast, or the drift at a dozen frames a
 * second — and never off screen or in a hidden tab; its pixel ratio is capped
 * at 2, it follows the theme, and it survives a lost context. Under reduced
 * motion there is no drift, the cast is a fade and the light follows directly.
 */
export function CharCast({
  text,
  as = "div",
  cell = 6,
  ramp = "short",
  characters,
  light = 72,
  tint = "var(--accent-bright)",
  drift = 1,
  contrast = 1,
  trigger = "inView",
  once = true,
  active,
  duration = 700,
  interactive = true,
  dpr = 2,
  seed = 0,
  onComplete,
  className,
}: CharCastProps) {
  const motionSafe = useMotionSafe();
  const hintId = `${React.useId()}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const running = onScreen && !hidden;

  const lightX = useMotionValue(0);
  const lightY = useMotionValue(0);
  const followX = useSpring(lightX, LIGHT_SPRING);
  const followY = useSpring(lightY, LIGHT_SPRING);
  const lightOn = useMotionValue(0);
  const castT = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const grid = React.useRef<Grid | null>(null);
  const paint = React.useRef<Paint | null>(null);
  const reader = React.useRef<((c: string) => Rgb) | null>(null);
  const scratch = React.useRef<HTMLCanvasElement | null>(null);
  const frame = React.useRef(0);
  const later = React.useRef(0);
  const lastDrift = React.useRef(0);
  const ratio = React.useRef(1);
  const castRun = React.useRef<AnimationPlaybackControls | null>(null);
  const fades = React.useRef<AnimationPlaybackControls | null>(null);
  const liftTimer = React.useRef(0);
  const caret = React.useRef({ x: 0, y: 0 });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onComplete);
  const live = React.useRef({
    running,
    motionSafe,
    phase,
    ramp: RAMPS.short,
    light,
    drift,
    contrast,
    seed,
    duration,
  });

  const chars =
    characters && characters.length > 1
      ? characters
      : (RAMPS[ramp] ?? RAMPS.short);
  const words = React.useMemo(
    () => text.split(/\s+/).filter((w) => w.length > 0),
    [text],
  );

  /** Measures the text, rasterises it, and averages its coverage into the two grids. */
  const layout = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = Math.max(1, Math.round(root.clientWidth));
    const h = Math.max(1, Math.round(root.clientHeight));
    const scale = Math.min(2, Math.max(0.5, dpr), window.devicePixelRatio || 1);
    ratio.current = scale;
    // Only a real change of size reallocates the backing store.
    const bw = Math.round(w * scale);
    const bh = Math.round(h * scale);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    const raster = scratch.current ?? document.createElement("canvas");
    scratch.current = raster;
    raster.width = w;
    raster.height = h;
    const rctx = raster.getContext("2d", { willReadFrequently: true });
    if (!rctx) return;
    const style = getComputedStyle(root);
    rctx.clearRect(0, 0, w, h);
    rctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ("letterSpacing" in rctx) {
      (
        rctx as CanvasRenderingContext2D & { letterSpacing: string }
      ).letterSpacing =
        style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    }
    rctx.fillStyle = "white";
    rctx.textBaseline = "alphabetic";
    const rect = root.getBoundingClientRect();
    words.forEach((word, i) => {
      const node = wordNodes.current.get(i);
      if (!node) return;
      const metrics = rctx.measureText(word);
      const ascent =
        metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
      for (const r of Array.from(node.getClientRects())) {
        rctx.fillText(
          word,
          r.left - rect.left - root.clientLeft,
          r.top - rect.top - root.clientTop + ascent,
        );
      }
    });
    const data = rctx.getImageData(0, 0, w, h).data;

    const cw = Math.max(3, Math.round(cell));
    const ch = Math.max(4, Math.round(cell * ROW));
    const cols = Math.ceil(w / cw);
    const rows = Math.ceil(h / ch);
    const fw = cw / 2;
    const fh = ch / 2;
    const fcols = Math.ceil(w / fw);
    const frows = Math.ceil(h / fh);
    const coarse = new Float32Array(cols * rows);
    const fine = new Float32Array(fcols * frows);
    const fineCount = new Float32Array(fcols * frows);
    const coarseCount = new Float32Array(cols * rows);
    for (let y = 0; y < h; y += 1) {
      const cy = Math.floor(y / ch);
      const fy = Math.floor(y / fh);
      for (let x = 0; x < w; x += 1) {
        const a = (data[(y * w + x) * 4 + 3] ?? 0) / 255;
        const ci = cy * cols + Math.floor(x / cw);
        const fi = fy * fcols + Math.floor(x / fw);
        coarse[ci] = (coarse[ci] ?? 0) + a;
        coarseCount[ci] = (coarseCount[ci] ?? 0) + 1;
        fine[fi] = (fine[fi] ?? 0) + a;
        fineCount[fi] = (fineCount[fi] ?? 0) + 1;
      }
    }
    for (let i = 0; i < coarse.length; i += 1)
      coarse[i] = (coarse[i] ?? 0) / Math.max(1, coarseCount[i] ?? 1);
    for (let i = 0; i < fine.length; i += 1)
      fine[i] = (fine[i] ?? 0) / Math.max(1, fineCount[i] ?? 1);
    const order = new Float32Array(cols * rows);
    const s = hash(text) ^ Math.imul(live.current.seed + 1, 0x9e3779b1);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        // The cast sweeps left to right with a seeded scatter, so it reads as
        // type setting rather than as a wipe.
        order[r * cols + c] =
          0.6 * (c / Math.max(1, cols - 1)) + 0.4 * lattice(c, r, 7, s);
      }
    }
    grid.current = {
      w,
      h,
      cw,
      ch,
      cols,
      rows,
      coarse,
      fine,
      fcols,
      frows,
      fw,
      fh,
      order,
    };
    if (!paint.current) colours();
    draw(clockNow());
  };

  /** The ink and the light's colours, resolved on the element itself. */
  const colours = () => {
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!canvas || !probe) return;
    reader.current ??= rgbReader();
    const read = reader.current;
    const ink = read(getComputedStyle(canvas).color);
    const warm = read(getComputedStyle(probe).color);
    const css = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
    const lit: string[] = [];
    for (let i = 0; i < LEVELS; i += 1) {
      const t = (i / (LEVELS - 1)) * 0.85;
      lit.push(
        css([
          Math.round(ink[0] + (warm[0] - ink[0]) * t),
          Math.round(ink[1] + (warm[1] - ink[1]) * t),
          Math.round(ink[2] + (warm[2] - ink[2]) * t),
        ]),
      );
    }
    paint.current = {
      ink: css(ink),
      lit,
      mono: getComputedStyle(probe).fontFamily,
    };
  };

  /** One frame of characters. */
  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const g = grid.current;
    const p = paint.current;
    if (!canvas || !g || !p) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const L = live.current;
    const rampChars = Array.from(L.ramp);
    const top = rampChars.length - 1;
    const scale = ratio.current;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    if (L.phase === "idle" || top < 1) return;

    const t = castT.get();
    const span = Math.max(0.2, L.duration / 1000) * 0.6;
    const casting = L.phase === "cast";
    const drifting = L.drift > 0 && L.motionSafe;
    const z = drifting ? (now / 1000) * 0.35 * L.drift : 0;
    const s = hash(text) ^ Math.imul(L.seed + 7, 0x85ebca6b);
    const radius = Math.max(0, L.light);
    const on = lightOn.get();
    const lx = L.motionSafe ? followX.get() : lightX.get();
    const ly = L.motionSafe ? followY.get() : lightY.get();
    const lit = radius > 0 && on > 0.002;
    const gamma = clamp(L.contrast, 0.5, 2);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${r2(g.ch * SET)}px ${p.mono}`;
    ctx.fillStyle = p.ink;

    const levelOf = (cov: number) => Math.pow(clamp01(cov * 1.15), gamma) * top;
    const fineCells: number[] = [];

    for (let r = 0; r < g.rows; r += 1) {
      for (let c = 0; c < g.cols; c += 1) {
        const i = r * g.cols + c;
        const cov = g.coarse[i] ?? 0;
        const cx = c * g.cw + g.cw / 2;
        const cy = r * g.ch + g.ch / 2;
        let grow = 1;
        let alpha = 1;
        if (casting) {
          const elapsed = t - (g.order[i] ?? 0) * span;
          if (L.motionSafe) {
            grow = SNAP(elapsed);
            alpha = clamp01(elapsed / 0.06);
          } else {
            alpha = clamp01(t / 0.3);
          }
          if (alpha <= 0) continue;
        }
        let level = levelOf(cov);
        let dust = false;
        if (drifting) {
          const n = noise(c * 0.11, r * 0.17, z, s);
          if (cov > 0.02) {
            level += n * (0.2 + 1.4 * cov * (1 - cov));
          } else if (n > 0.7) {
            level = 1;
            dust = true;
          }
        }
        let k = Math.round(level * grow);
        k = clamp(k, 0, top);
        let glow = 0;
        if (lit) {
          const d = Math.hypot(cx - lx, cy - ly);
          glow = on * (1 - clamp01((d - radius * 0.5) / (radius * 0.5)));
          if (glow > 0.01) fineCells.push(i, glow);
        }
        if (k === 0 || glow > 0.97) continue;
        const ink = dust ? 0.22 : 0.55 + 0.45 * clamp01(cov * 1.4);
        ctx.globalAlpha = ink * alpha * (1 - glow);
        const ch = rampChars[k];
        if (ch) ctx.fillText(ch, cx, cy);
      }
    }

    if (fineCells.length) {
      ctx.font = `${r2(g.fh * SET)}px ${p.mono}`;
      for (let n = 0; n < fineCells.length; n += 2) {
        const i = fineCells[n] ?? 0;
        const glow = fineCells[n + 1] ?? 0;
        const r = Math.floor(i / g.cols);
        const c = i % g.cols;
        ctx.fillStyle = p.lit[Math.round(glow * (LEVELS - 1))] ?? p.ink;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const fc = c * 2 + dx;
            const fr = r * 2 + dy;
            if (fc >= g.fcols || fr >= g.frows) continue;
            const cov = g.fine[fr * g.fcols + fc] ?? 0;
            const k = clamp(Math.round(levelOf(cov)), 0, top);
            if (k === 0) continue;
            ctx.globalAlpha = glow * (0.55 + 0.45 * clamp01(cov * 1.4));
            const ch = rampChars[k];
            if (ch)
              ctx.fillText(ch, fc * g.fw + g.fw / 2, fr * g.fh + g.fh / 2);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    if (drifting) lastDrift.current = now;
  };

  /** The loop: every frame while the light or the cast moves, a dozen a second while it only drifts, and none otherwise. */
  const tick = (now: number) => {
    frame.current = 0;
    const L = live.current;
    if (!L.running || L.phase === "idle") return;
    const moving =
      L.phase === "cast" ||
      followX.isAnimating() ||
      followY.isAnimating() ||
      lightOn.isAnimating();
    const drifting = L.drift > 0 && L.motionSafe;
    if (moving || (drifting && now - lastDrift.current >= DRIFT_STEP - 4)) {
      draw(now);
    }
    if (moving) {
      frame.current = requestAnimationFrame(tick);
    } else if (drifting) {
      window.clearTimeout(later.current);
      later.current = window.setTimeout(() => {
        frame.current = requestAnimationFrame(tick);
      }, DRIFT_STEP);
    }
  };

  const kick = () => {
    if (frame.current) return;
    window.clearTimeout(later.current);
    frame.current = requestAnimationFrame(tick);
  };

  const halt = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    window.clearTimeout(later.current);
  };

  const cast = () => {
    castRun.current?.stop();
    castT.jump(0);
    setPhase("cast");
    live.current.phase = "cast";
    const span = Math.max(0.2, live.current.duration / 1000) * 0.6;
    const end = live.current.motionSafe ? span + SETTLE : durations.slow;
    castRun.current = animate(castT, end, {
      duration: end,
      ease: "linear",
      onComplete: () => {
        castRun.current = null;
        setPhase("rest");
        live.current.phase = "rest";
        report.current?.();
        api.current?.kick();
      },
    });
    kick();
  };

  const idle = () => {
    castRun.current?.stop();
    castRun.current = null;
    setPhase("idle");
    live.current.phase = "idle";
    draw(clockNow());
  };

  React.useLayoutEffect(() => {
    api.current = { layout, kick, colours, cast, idle };
    report.current = onComplete;
    live.current = {
      running,
      motionSafe,
      phase: live.current.phase,
      ramp: chars,
      light,
      drift,
      contrast,
      seed,
      duration,
    };
  });

  // A new look redraws at once; the loop picks up whatever now moves.
  React.useEffect(() => {
    if (!grid.current) return;
    api.current?.layout();
    api.current?.kick();
  }, [cell, chars, light, drift, contrast, seed, text, words, motionSafe]);

  React.useEffect(() => {
    if (running) api.current?.kick();
    else halt();
    return halt;
  }, [running]);

  // Triggers.
  React.useEffect(() => {
    if (trigger === "mount" && phase === "idle") api.current?.cast();
    if (trigger === "inView") {
      if (onScreen && phase === "idle") api.current?.cast();
      if (!onScreen && !once && phase === "rest") api.current?.idle();
    }
    if (trigger === "manual" && active !== undefined) {
      if (active && phase === "idle") api.current?.cast();
      if (!active && phase !== "idle") api.current?.idle();
    }
  }, [trigger, onScreen, once, active, phase]);

  React.useEffect(() => {
    const run = castRun;
    const fade = fades;
    const lift = liftTimer;
    return () => {
      run.current?.stop();
      fade.current?.stop();
      window.clearTimeout(lift.current);
    };
  }, []);

  // The light's springs wake the loop whenever they move.
  React.useEffect(() => {
    const wake = () => api.current?.kick();
    const a = followX.on("change", wake);
    const b = followY.on("change", wake);
    const c = lightOn.on("change", wake);
    return () => {
      a();
      b();
      c();
    };
  }, [followX, followY, lightOn]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.layout());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.layout());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindCanvas = React.useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (!node) return;
    // A lost 2D context comes back blank: rasterise and draw again.
    const restored = () => api.current?.layout();
    node.addEventListener("contextrestored", restored);
    api.current?.layout();
    return () => node.removeEventListener("contextrestored", restored);
  }, []);

  const bindWord = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(i, node);
    else wordNodes.current.delete(i);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    return {
      x: r2(clientX - rect.left - root.clientLeft),
      y: r2(clientY - rect.top - root.clientTop),
    };
  };

  const fadeLight = (to: number) => {
    fades.current?.stop();
    fades.current = animate(lightOn, to, {
      duration: to > 0 ? durations.base : durations.slow,
      ease: to > 0 ? easings.enter : easings.exit,
    });
  };

  /** Moves the light: on arrival it jumps there, then trails the hand. */
  const aim = (x: number, y: number, arrive: boolean) => {
    if (arrive || lightOn.get() < 0.05 || !motionSafe) {
      lightX.jump(x);
      lightY.jump(y);
      followX.jump(x);
      followY.jump(y);
    } else {
      lightX.set(x);
      lightY.set(y);
    }
    if (arrive) fadeLight(1);
    kick();
  };

  const canLight = interactive && light > 0;

  /** The keyboard's light: on a letter, moved a few cells or a line at a time. */
  const firstLetter = () => {
    const root = rootRef.current;
    const node = wordNodes.current.get(0);
    if (!root || !node) return { x: 0, y: 0 };
    const r = node.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    return {
      x: r2(r.left - box.left + Math.min(r.width / 2, 24)),
      y: r2(r.top - box.top + r.height / 2),
    };
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!canLight) return;
    const g = grid.current;
    const root = rootRef.current;
    if (!g || !root) return;
    const lineH = parseFloat(getComputedStyle(root).lineHeight) || g.ch * 4;
    const at = caret.current;
    let x = at.x;
    let y = at.y;
    switch (event.key) {
      case "ArrowRight":
        x += g.cw * 3;
        break;
      case "ArrowLeft":
        x -= g.cw * 3;
        break;
      case "ArrowDown":
        y += lineH;
        break;
      case "ArrowUp":
        y -= lineH;
        break;
      case "Home":
        x = 0;
        break;
      case "End":
        x = g.w;
        break;
      default:
        return;
    }
    event.preventDefault();
    caret.current = { x: clamp(x, 0, g.w), y: clamp(y, 0, g.h) };
    aim(caret.current.x, caret.current.y, false);
  };

  const Tag = as;
  const shown = phase !== "idle";

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={canLight ? 0 : undefined}
        aria-describedby={canLight ? hintId : undefined}
        onPointerEnter={(event: React.PointerEvent) => {
          if (!canLight || event.pointerType === "touch") return;
          const p = local(event.clientX, event.clientY);
          aim(p.x, p.y, true);
        }}
        onPointerMove={(event: React.PointerEvent) => {
          if (!canLight) return;
          if (event.pointerType === "touch" && lightOn.get() < 0.05) return;
          const p = local(event.clientX, event.clientY);
          aim(p.x, p.y, false);
        }}
        onPointerLeave={(event: React.PointerEvent) => {
          if (!canLight || event.pointerType === "touch") return;
          fadeLight(0);
        }}
        onPointerDown={(event: React.PointerEvent) => {
          if (!canLight || event.pointerType !== "touch") return;
          window.clearTimeout(liftTimer.current);
          const p = local(event.clientX, event.clientY);
          aim(p.x, p.y, true);
        }}
        onPointerUp={(event: React.PointerEvent) => {
          if (!canLight || event.pointerType !== "touch") return;
          // A tap leaves the light a moment, then it goes out.
          window.clearTimeout(liftTimer.current);
          liftTimer.current = window.setTimeout(() => fadeLight(0), 900);
        }}
        onPointerCancel={() => {
          if (canLight) fadeLight(0);
        }}
        onFocus={(event: React.FocusEvent<HTMLElement>) => {
          if (!canLight || event.target !== event.currentTarget) return;
          if (!event.currentTarget.matches(":focus-visible")) return;
          caret.current = firstLetter();
          aim(caret.current.x, caret.current.y, true);
        }}
        onBlur={() => {
          if (canLight) fadeLight(0);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "relative block",
          canLight &&
            "touch-pan-y rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <canvas
          ref={bindCanvas}
          aria-hidden
          onTransitionEnd={() => {
            api.current?.colours();
            api.current?.layout();
          }}
          className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        />
        <span className={cn("relative", shown && "text-transparent")}>
          {words.map((word, i) => (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <span ref={bindWord(i)}>{word}</span>
            </React.Fragment>
          ))}
        </span>
        <span
          ref={probeRef}
          aria-hidden
          onTransitionEnd={() => {
            api.current?.colours();
            api.current?.layout();
          }}
          className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden font-mono transition-colors duration-1"
          style={{ color: tint }}
        />
      </Tag>
      {canLight ? (
        <span id={hintId} className="sr-only select-none">
          Use the arrow keys to move the light across the letters.
        </span>
      ) : null}
    </>
  );
}
