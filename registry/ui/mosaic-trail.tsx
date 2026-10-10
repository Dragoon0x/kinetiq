"use client";

import * as React from "react";

import {
  animate,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MosaicTrailPalette = "aurora" | "ember" | "ink";

export type MosaicTrailProps = {
  /** Content laid over the mosaic, such as a hero. It stays fully interactive; the tiles never take a click. */
  children?: React.ReactNode;
  /** The side of one square cell, in px. @default 14 */
  cell?: number;
  /** The grout between lit tiles, in px. @default 2 */
  gap?: number;
  /** How long a tile takes to fade out once its hold is over, in ms. @default 900 */
  fade?: number;
  /** How long a tile stays at full brightness before it starts to fade, in ms. @default 140 */
  hold?: number;
  /** The trail's colours from head to tail: a preset, or any CSS colours resolved on the element. @default "aurora" */
  colors?: MosaicTrailPalette | readonly string[];
  /** How many brightness steps a tile fades through, 2 to 8. @default 5 */
  levels?: number;
  /** Fade through an ordered dither, so tiles drop out in a pixel pattern rather than all together. @default true */
  dither?: boolean;
  /** The brush's radius in cells; a fast stroke paints a little wider. @default 1 */
  brush?: number;
  /** How rounded each tile is, as a share of its side (0 to 0.5). @default 0.18 */
  round?: number;
  /** How visible the resting grout grid is, 0 to 1. @default 0.6 */
  grid?: number;
  /** The brightest a tile gets, 0 to 1. @default 0.9 */
  intensity?: number;
  /** A click sends a pixel burst with rays this many cells long; 0 turns it off. @default 6 */
  burst?: number;
  /** One comet across the mosaic the first time it comes into view. @default true */
  intro?: boolean;
  /** Keyboard focus inside draws a comet to the focused control and frames it in pixels. @default true */
  followFocus?: boolean;
  /** The pointer paints (mouse and pen); a tap sends a burst. @default true */
  interactive?: boolean;
  /** Freezes the trail where it is. @default false */
  paused?: boolean;
  /** Seed for the dither offsets, the intro's path and the reduced-motion still. @default 11 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when the first tile lights and when the last one has faded. */
  onActiveChange?: (active: boolean) => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

const PALETTES: Record<MosaicTrailPalette, readonly string[]> = {
  aurora: [
    "var(--signal)",
    "var(--accent-bright)",
    "color-mix(in oklab, var(--accent-bright) 40%, var(--ink-3))",
  ],
  ember: [
    "oklch(from var(--warn) 0.86 0.15 h)",
    "oklch(from var(--danger) 0.66 0.19 h)",
    "oklch(from var(--danger) 0.42 0.08 h)",
  ],
  ink: ["var(--foreground)", "var(--ink-2)", "var(--ink-3)"],
};

/** A 4×4 ordered-dither matrix, as thresholds in (0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16,
);
const LUT = 32;
/** The head lights first; each cell of the brush a little after. */
const BRUSH_LAG = 16;
const BURST_STEP = 26;
/** The burst's eight rays, as steps along x and y. */
const RAY_X = [1, 1, 0, -1, -1, -1, 0, 1] as const;
const RAY_Y = [0, 1, 1, 1, 0, -1, -1, -1] as const;
const TRACE_STEP = 9;

type Rgb = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** An unsigned integer hash to [0, 1). */
const hash = (i: number, seed: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Resolves any CSS colour the canvas can parse into its sRGB bytes. */
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

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toByte = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
};

/** sRGB bytes to oklab, so the trail's colours walk evenly in lightness. */
function toOklab([r, g, b]: Rgb): Rgb {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: Rgb): Rgb {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * A pointer trail laid in pixels. The box is a mosaic of square cells; the
 * pointer lights every cell along its path — sampled at half a cell, so a
 * flick still leaves an unbroken line — with a soft brush whose head lights
 * first. Each tile holds for `hold`, then fades over `fade` while its colour
 * walks from the head of `colors` to the tail with its age, so a stroke is a
 * comet that cools behind you. Brightness steps down through `levels`, offset
 * per tile by a 4×4 ordered dither, so the tail dissolves pixel by pixel in a
 * checker-and-cross pattern instead of blurring away, and a tile that lights
 * from dark pops in on its own spring with the snap constants.
 *
 * A click sends a burst: eight rays of tiles from the pointer, one cell
 * every 26 ms. Keyboard focus inside runs a comet to the focused control on
 * the glide spring and traces a pixel frame round it. The canvas sits under
 * the children and never takes a click; the loop runs only while something
 * is lit, on screen, in a visible tab. Reduced motion: a still comet is laid
 * across the mosaic, the tile under the mouse lights in place, and a focused
 * control gets a still frame.
 */
export function MosaicTrail({
  children,
  cell = 14,
  gap = 2,
  fade = 900,
  hold = 140,
  colors = "aurora",
  levels = 5,
  dither = true,
  brush = 1,
  round = 0.18,
  grid = 0.6,
  intensity = 0.9,
  burst = 6,
  intro = true,
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 11,
  dpr = 2,
  onActiveChange,
  className,
}: MosaicTrailProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);

  const size = clamp(cell, 4, 64);
  const stops = typeof colors === "string" ? PALETTES[colors] : colors;
  const stopsKey = (stops ?? PALETTES.aurora).join("|");

  const params = React.useRef({
    size,
    gap,
    fade,
    hold,
    stops: stops ?? PALETTES.aurora,
    levels,
    dither,
    brush,
    round,
    intensity,
    burst,
    intro,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActiveChange,
  });
  React.useEffect(() => {
    params.current = {
      size,
      gap,
      fade,
      hold,
      stops: stops ?? PALETTES.aurora,
      levels,
      dither,
      brush,
      round,
      intensity,
      burst,
      intro,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
      onActiveChange,
    };
  });

  const api = React.useRef<{
    move: (x: number, y: number) => void;
    enter: (x: number, y: number) => void;
    leave: () => void;
    burst: (x: number, y: number) => void;
    focus: (node: HTMLElement | null) => void;
    rebuild: () => void;
    restyle: () => void;
    wake: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = ctx;
    const read = rgbReader();

    let w = 0;
    let h = 0;
    let ratio = 1;
    let x0 = 0;
    let y0 = 0;
    let cols = 0;
    let rows = 0;
    let n = 0;
    let amp = new Float32Array(0);
    let born = new Float64Array(0);
    let pop = new Float32Array(0);
    let popV = new Float32Array(0);
    let lit = new Uint8Array(0);
    let list = new Int32Array(0);
    let count = 0;
    let shades: string[] = [];
    let shadeLevels = 1;
    let raf = 0;
    let last = 0;
    let inView = false;
    let introduced = false;
    let active = false;
    let running: AnimationPlaybackControls | null = null;

    // Where the pointer was at the last move, for the path between moves.
    const trail = { x: 0, y: 0, t: 0, on: false, speed: 0 };
    // Reduced motion: the one tile under the mouse, and a focused frame.
    let still = -1;
    let stillFrame: number[] = [];
    let focusFrom: { x: number; y: number } | null = null;

    const report = (on: boolean) => {
      if (active === on) return;
      active = on;
      params.current.onActiveChange?.(on);
    };

    let ditherX = 0;
    let ditherY = 0;

    const restyle = () => {
      ditherX = Math.floor(hash(5, params.current.seed) * 4);
      ditherY = Math.floor(hash(6, params.current.seed) * 4);
      const probe = probeRef.current;
      if (!probe) return;
      const p = params.current;
      const list0 = p.stops.length > 0 ? p.stops : PALETTES.aurora;
      const labs = list0.map((colour) => {
        probe.style.color = colour;
        return toOklab(read(getComputedStyle(probe).color));
      });
      shadeLevels = Math.round(clamp(p.levels, 2, 8));
      const peak = clamp(p.intensity, 0, 1);
      shades = [];
      for (let i = 0; i < LUT; i += 1) {
        const at = (i / (LUT - 1)) * (labs.length - 1);
        const k = Math.min(labs.length - 2, Math.floor(at));
        const a = labs[Math.max(0, k)] ?? [0, 0, 0];
        const b = labs[Math.max(0, k + 1)] ?? a;
        const t = labs.length > 1 ? at - Math.max(0, k) : 0;
        const [r, gg, bb] = fromOklab([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ]);
        for (let q = 1; q <= shadeLevels; q += 1) {
          shades.push(
            `rgba(${r}, ${gg}, ${bb}, ${r2((q / shadeLevels) * peak)})`,
          );
        }
      }
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 1 || h < 1) return false;
      const p = params.current;
      ratio = Math.min(2, Math.max(1, p.dpr), window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      // The grid is centred, matching the CSS grout behind it.
      const s = p.size;
      x0 = w / 2 - s / 2 - s * Math.ceil((w / 2 - s / 2) / s);
      y0 = h / 2 - s / 2 - s * Math.ceil((h / 2 - s / 2) / s);
      cols = Math.ceil((w - x0) / s);
      rows = Math.ceil((h - y0) / s);
      n = cols * rows;
      amp = new Float32Array(n);
      born = new Float64Array(n);
      pop = new Float32Array(n).fill(1);
      popV = new Float32Array(n);
      lit = new Uint8Array(n);
      list = new Int32Array(n);
      count = 0;
      return true;
    };

    const valueAt = (i: number, now: number) => {
      const p = params.current;
      const age = now - (born[i] ?? 0);
      if (age < 0) return 0;
      const span = Math.max(1, p.fade);
      const env = age < p.hold ? 1 : 1 - (age - p.hold) / span;
      if (env <= 0) return 0;
      return (amp[i] ?? 0) * Math.pow(env, 1.4);
    };

    const stamp = (i: number, strength: number, at: number) => {
      if (i < 0 || i >= n) return;
      const now = performance.now();
      const current = valueAt(i, now);
      // A lit tile is renewed at once (never dimmed by a weaker touch, never
      // blinked dark waiting on a delayed one); a dark one pops in on time.
      if (current < 0.25) {
        pop[i] = 0.55;
        popV[i] = 0;
      }
      amp[i] = Math.max(strength, current);
      born[i] = current > 0.05 ? Math.min(at, now) : at;
      if (!lit[i]) {
        lit[i] = 1;
        list[count] = i;
        count += 1;
      }
      report(true);
    };

    const cellAt = (x: number, y: number) => {
      const c = Math.floor((x - x0) / params.current.size);
      const r = Math.floor((y - y0) / params.current.size);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
      return r * cols + c;
    };

    /** A soft round brush at (x, y): the head at `at`, the rim a little later. */
    const dab = (x: number, y: number, at: number, extra: number) => {
      const p = params.current;
      const s = p.size;
      const radius = clamp(p.brush, 0, 4) + extra;
      const reach = Math.ceil(radius + 0.5);
      const cc = Math.floor((x - x0) / s);
      const rr = Math.floor((y - y0) / s);
      for (let dr = -reach; dr <= reach; dr += 1) {
        for (let dc = -reach; dc <= reach; dc += 1) {
          const c = cc + dc;
          const r = rr + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const dx = (x0 + (c + 0.5) * s - x) / s;
          const dy = (y0 + (r + 0.5) * s - y) / s;
          const d = Math.sqrt(dx * dx + dy * dy);
          const fall = clamp(1 - (d - 0.5) / (radius + 0.5), 0, 1);
          const strength = d <= 0.5 ? 1 : fall * fall;
          if (strength < 0.15) continue;
          stamp(r * cols + c, strength, at + d * BRUSH_LAG);
        }
      }
    };

    /** Every cell along the path since the last point, at half-cell steps. */
    const strokeTo = (x: number, y: number) => {
      const now = performance.now();
      if (!trail.on) {
        trail.x = x;
        trail.y = y;
        trail.t = now;
        trail.on = true;
        dab(x, y, now, 0);
        return;
      }
      const dx = x - trail.x;
      const dy = y - trail.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = Math.max(1, now - trail.t);
      trail.speed = trail.speed * 0.6 + (dist / dt) * 1000 * 0.4;
      const extra = Math.min(0.8, trail.speed / 2600);
      const steps = Math.max(1, Math.ceil(dist / (params.current.size * 0.5)));
      for (let k = 1; k <= steps; k += 1) {
        const f = k / steps;
        dab(trail.x + dx * f, trail.y + dy * f, trail.t + dt * f, extra);
      }
      trail.x = x;
      trail.y = y;
      trail.t = now;
    };

    const sendBurst = (x: number, y: number) => {
      const p = params.current;
      const length = Math.round(clamp(p.burst, 0, 16));
      if (length === 0) return;
      const now = performance.now();
      const s = p.size;
      const cc = Math.floor((x - x0) / s);
      const rr = Math.floor((y - y0) / s);
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return;
      stamp(rr * cols + cc, 1, now);
      for (let dir = 0; dir < 8; dir += 1) {
        const dx = RAY_X[dir] ?? 0;
        const dy = RAY_Y[dir] ?? 0;
        const diagonal = dx !== 0 && dy !== 0;
        const reach = diagonal ? Math.max(1, Math.round(length * 0.7)) : length;
        for (let k = 1; k <= reach; k += 1) {
          const c = cc + dx * k;
          const r = rr + dy * k;
          if (c < 0 || r < 0 || c >= cols || r >= rows) break;
          stamp(
            r * cols + c,
            1 - (k / (reach + 2)) * 0.45,
            now + k * BURST_STEP,
          );
        }
      }
    };

    /** The cells round a rectangle, clockwise from its top-left. */
    const ring = (left: number, top: number, right: number, bottom: number) => {
      const s = params.current.size;
      const c0 = Math.floor((left - x0) / s) - 1;
      const r0 = Math.floor((top - y0) / s) - 1;
      const c1 = Math.floor((right - x0) / s) + 1;
      const r1 = Math.floor((bottom - y0) / s) + 1;
      const out: number[] = [];
      const push = (c: number, r: number) => {
        if (c < 0 || r < 0 || c >= cols || r >= rows) return;
        out.push(r * cols + c);
      };
      for (let c = c0; c <= c1; c += 1) push(c, r0);
      for (let r = r0 + 1; r <= r1; r += 1) push(c1, r);
      for (let c = c1 - 1; c >= c0; c -= 1) push(c, r1);
      for (let r = r1 - 1; r > r0; r -= 1) push(c0, r);
      return out;
    };

    const tile = (i: number, shade: string, scale: number) => {
      const p = params.current;
      const s = p.size;
      const inner = Math.max(1, s - clamp(p.gap, 0, s * 0.5)) * scale;
      const c = i % cols;
      const r = (i - c) / cols;
      const x = x0 + c * s + (s - inner) / 2;
      const y = y0 + r * s + (s - inner) / 2;
      g.fillStyle = shade;
      const corner = clamp(p.round, 0, 0.5) * inner;
      g.beginPath();
      if (corner > 0.4 && typeof g.roundRect === "function") {
        g.roundRect(x, y, inner, inner, corner);
      } else {
        g.rect(x, y, inner, inner);
      }
      g.fill();
    };

    const shadeOf = (value: number, i: number, ageShare: number) => {
      const p = params.current;
      const levelsNow = shadeLevels;
      const c = i % Math.max(1, cols);
      const r = Math.floor(i / Math.max(1, cols));
      const threshold = p.dither
        ? (BAYER[((r + ditherY) % 4) * 4 + ((c + ditherX) % 4)] ?? 0.5)
        : 0.5;
      const level = Math.min(
        levelsNow,
        Math.floor(value * levelsNow + threshold),
      );
      if (level <= 0) return null;
      const ci = Math.min(LUT - 1, Math.floor(clamp(ageShare, 0, 1) * LUT));
      return shades[ci * levelsNow + level - 1] ?? null;
    };

    const draw = (now: number) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const p = params.current;
      const life = Math.max(1, p.hold + p.fade);
      for (let k = 0; k < count; k += 1) {
        const i = list[k] ?? 0;
        const age = now - (born[i] ?? 0);
        if (age < 0) continue;
        const shade = shadeOf(valueAt(i, now), i, age / life);
        if (shade) tile(i, shade, pop[i] ?? 1);
      }
    };

    /** Reduced motion: one still comet, plus the hovered tile and a frame. */
    const drawStill = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (n === 0) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const p = params.current;
      const s = p.size;
      // A seeded arc rising across the mosaic, its head on the right and
      // its brush tapering toward the tail, as a stroke would have left it.
      const a = hash(1, p.seed);
      const b = hash(2, p.seed);
      const values = new Map<number, number>();
      const steps = Math.max(4, Math.round((w / s) * 1.4));
      for (let k = 0; k <= steps; k += 1) {
        const f = k / steps;
        const x = w * (0.14 + 0.7 * f);
        const y =
          h * (0.8 - 0.46 * f) -
          Math.sin(f * Math.PI) * h * (0.1 + 0.12 * a) +
          Math.sin(f * Math.PI * 2 + b * 6) * h * 0.04;
        const radius = clamp(p.brush, 0, 4) * f;
        const reach = Math.ceil(radius + 0.5);
        const cc = Math.floor((x - x0) / s);
        const rr = Math.floor((y - y0) / s);
        for (let dr = -reach; dr <= reach; dr += 1) {
          for (let dc = -reach; dc <= reach; dc += 1) {
            const c = cc + dc;
            const r = rr + dr;
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const dx = (x0 + (c + 0.5) * s - x) / s;
            const dy = (y0 + (r + 0.5) * s - y) / s;
            const d = Math.sqrt(dx * dx + dy * dy);
            const fall = clamp(1 - (d - 0.5) / (radius + 0.5), 0, 1);
            const v = (d <= 0.5 ? 1 : fall * fall) * Math.pow(f, 1.2);
            const i = r * cols + c;
            if (v > (values.get(i) ?? 0)) values.set(i, v);
          }
        }
      }
      for (const [i, v] of values) {
        const shade = shadeOf(v, i, 1 - Math.pow(v, 0.8));
        if (shade) tile(i, shade, 1);
      }
      for (const i of stillFrame) {
        const shade = shadeOf(1, i, 0);
        if (shade) tile(i, shade, 1);
      }
      if (still >= 0) {
        const shade = shadeOf(1, still, 0);
        if (shade) tile(still, shade, 1);
      }
    };

    const step = (dt: number, now: number) => {
      const p = params.current;
      const life = p.hold + p.fade;
      const k = springs.snap.stiffness / springs.snap.mass;
      const c = springs.snap.damping / springs.snap.mass;
      for (let j = 0; j < count; j += 1) {
        const i = list[j] ?? 0;
        const age = now - (born[i] ?? 0);
        if (age < 0) continue;
        if (age > life) {
          // Gone dark: out of the active list (swap with the last).
          lit[i] = 0;
          pop[i] = 1;
          popV[i] = 0;
          count -= 1;
          list[j] = list[count] ?? 0;
          j -= 1;
          continue;
        }
        const s = pop[i] ?? 1;
        const v = popV[i] ?? 0;
        if (Math.abs(1 - s) > 0.001 || Math.abs(v) > 0.01) {
          const nv = v + (k * (1 - s) - c * v) * dt;
          popV[i] = nv;
          pop[i] = s + nv * dt;
        } else {
          pop[i] = 1;
          popV[i] = 0;
        }
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let t = dt;
      while (t > 1e-6) {
        const d = Math.min(t, 1 / 120);
        step(d, now);
        t -= d;
      }
      draw(now);
      if (count === 0) {
        last = 0;
        report(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe) {
        drawStill();
        return;
      }
      if (p.paused) {
        draw(performance.now());
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const runPath = (
      points: (f: number) => { x: number; y: number },
      transition: Transition,
      after?: () => void,
    ) => {
      running?.stop();
      trail.on = false;
      const from: number = 0;
      running = animate(from, 1, {
        ...transition,
        onUpdate: (f: number) => {
          const at = points(clamp(f, 0, 1.08));
          strokeTo(at.x, at.y);
          wake();
        },
        onComplete: () => {
          trail.on = false;
          after?.();
          wake();
        },
      });
    };

    const sweep = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused || n === 0) return;
      const a = hash(3, p.seed);
      const b = hash(4, p.seed);
      runPath(
        (f) => ({
          x: w * (-0.04 + 1.08 * f),
          y:
            h * (0.72 - 0.42 * f) -
            Math.sin(f * Math.PI) * h * (0.18 + 0.16 * a) +
            Math.sin(f * Math.PI * 3 + b * 6) * h * 0.05,
        }),
        { duration: 1.25, ease: easings.move },
      );
    };

    api.current = {
      move: (x, y) => {
        const p = params.current;
        if (!p.motionSafe) {
          const i = cellAt(x, y);
          if (i !== still) {
            still = i;
            drawStill();
          }
          return;
        }
        if (p.paused) return;
        strokeTo(x, y);
        wake();
      },
      enter: (x, y) => {
        trail.on = false;
        trail.speed = 0;
        api.current?.move(x, y);
      },
      leave: () => {
        trail.on = false;
        if (still >= 0) {
          still = -1;
          if (!params.current.motionSafe) drawStill();
        }
      },
      burst: (x, y) => {
        const p = params.current;
        if (!p.motionSafe || p.paused) return;
        sendBurst(x, y);
        wake();
      },
      focus: (node) => {
        const p = params.current;
        if (!node) {
          stillFrame = [];
          if (!p.motionSafe) drawStill();
          return;
        }
        const a = root.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        const left = b.left - a.left;
        const top = b.top - a.top;
        const right = left + b.width;
        const bottom = top + b.height;
        const cells = ring(left, top, right, bottom);
        if (!p.motionSafe) {
          stillFrame = cells;
          drawStill();
          return;
        }
        if (p.paused) return;
        const to = { x: left + b.width / 2, y: top + b.height / 2 };
        const from = focusFrom ?? { x: Math.max(0, left - 120), y: to.y };
        focusFrom = to;
        runPath(
          (f) => ({
            x: from.x + (to.x - from.x) * f,
            y: from.y + (to.y - from.y) * f,
          }),
          springs.glide,
          () => {
            const now = performance.now();
            cells.forEach((i, k) => stamp(i, 1, now + k * TRACE_STEP));
          },
        );
      },
      rebuild: () => {
        running?.stop();
        if (!layout()) return;
        if (!params.current.motionSafe) drawStill();
        else draw(performance.now());
      },
      restyle: () => {
        restyle();
        if (!params.current.motionSafe) drawStill();
        else {
          draw(performance.now());
          wake();
        }
      },
      wake: () => {
        if (!params.current.motionSafe) drawStill();
        else wake();
      },
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      if (!layout()) return;
      if (!params.current.motionSafe) drawStill();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (!inView) return;
      if (!introduced && params.current.intro && n > 0) {
        introduced = true;
        sweep();
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running?.stop();
      running = null;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [size, dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [stopsKey, levels, intensity, seed]);
  React.useEffect(() => {
    api.current?.wake();
  }, [gap, round, dither, paused, motionSafe]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  const lineColour = `color-mix(in oklab, var(--hairline-strong) ${Math.round(clamp(grid, 0, 1) * 100)}%, transparent)`;
  const pitch = r2(size);

  return (
    <div
      ref={rootRef}
      onPointerEnter={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        const at = local(event);
        api.current?.enter(at.x, at.y);
      }}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        const at = local(event);
        api.current?.move(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        api.current?.leave();
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "touch") {
          touchStart.current = { x: event.clientX, y: event.clientY };
          return;
        }
        if (event.button !== 0) return;
        const at = local(event);
        api.current?.burst(at.x, at.y);
      }}
      onPointerUp={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || event.pointerType !== "touch") return;
        // A tap, not a scroll.
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          return;
        }
        const at = local(event);
        api.current?.burst(at.x, at.y);
      }}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
      onFocus={(event) => {
        if (!followFocus) return;
        const target = event.target as HTMLElement;
        if (!target.matches(":focus-visible")) return;
        api.current?.focus(target);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        api.current?.focus(null);
      }}
      className={cn("relative isolate overflow-clip", className)}
    >
      {/* The setting bed: grout lines at the cell pitch, centred like the
          canvas grid, so the server frame is the resting frame. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `linear-gradient(to right, ${lineColour} 1px, transparent 1px), linear-gradient(to bottom, ${lineColour} 1px, transparent 1px)`,
          backgroundSize: `${pitch}px ${pitch}px`,
          backgroundPosition: "center",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      />
      {children}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
