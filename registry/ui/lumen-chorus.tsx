"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LumenChorusProps = {
  /** The series: one filament per value, left to right. @default 24 seeded hourly readings */
  values?: number[];
  /** A label per value, read in the readout. @default "1", "2", … */
  labels?: string[];
  /** A ramp of CSS colours across the filaments, left to right. @default ["var(--accent-bright)", "var(--signal)"] */
  colors?: string[];
  /** The light's colour temperature: 0 is the ramp as given (cool), 1 warm amber and rose, mixed in oklab. @default 0.2 */
  warmth?: number;
  /** How the filaments move to new values: 0 slow and soft (drift), 0.5 glide, 1 quick with one overshoot (snap). @default 0.5 */
  rise?: number;
  /** How wide the chorus stands, as a share of the width it could fill, 0 to 1. @default 0.75 */
  spacing?: number;
  /** The value at the top of the scale. @default the largest value × 1.1 */
  max?: number;
  /** Formats a value for the readout. @default one decimal place */
  format?: (value: number) => string;
  /** Appended to every formatted value, e.g. "kW". @default "" */
  unit?: string;
  /** Where the horizon sits, as a share of the height, 0.55 to 0.9. @default 0.74 */
  horizon?: number;
  /** How much the filaments and horizon glow, 0 to 1. @default 0.6 */
  glow?: number;
  /** How strongly they reflect on the ground below the horizon, 0 to 1. @default 0.5 */
  reflection?: number;
  /** Faint pulses of light climbing the filaments while idle, 0 to 1. @default 0.35 */
  shimmer?: number;
  /** The filament being read, by index, or null (controlled). */
  active?: number | null;
  /** The filament read first when uncontrolled. @default null */
  defaultActive?: number | null;
  /** Fires from the hover, key or focus that changed the filament being read. */
  onActiveChange?: (index: number | null) => void;
  /** Hold the shimmer still; new values still arrive. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The chorus's accessible name. @default "Values" */
  label?: string;
  /** Sizes the panel; it fills its parent by default. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A day of solar output: a seeded bell with clouds in it. */
export const defaultLumenChorusValues = Array.from({ length: 24 }, (_, i) => {
  const sun = Math.max(0, Math.sin((Math.PI * (i - 5.5)) / 13));
  const cloud = 0.82 + 0.18 * Math.cos(i * 1.7 + 0.4);
  return Math.round(sun * 4.2 * cloud * 10) / 10;
});

export const defaultLumenChorusLabels = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, "0")}:00`,
);

const defaultFormat = (v: number) => {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/* sRGB ⇄ oklab, for mixing the ramps the way the eye sees them. */
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
function toOklab(r: number, g: number, b: number): [number, number, number] {
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
function fromOklab(L: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    clamp(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 1),
    clamp(
      toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      0,
      1,
    ),
    clamp(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), 0, 1),
  ];
}

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.6, 0.7, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(150, 170, 255)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/** A spring between two calibrated ones, interpolated in log space. */
function blendSpring(rise: number) {
  const t = clamp(rise, 0, 1);
  const [a, b, f] =
    t < 0.5
      ? [springs.drift, springs.glide, t / 0.5]
      : [springs.glide, springs.snap, (t - 0.5) / 0.5];
  const k = Math.exp(
    lerp(Math.log(a.stiffness / a.mass), Math.log(b.stiffness / b.mass), f),
  );
  const c = Math.exp(
    lerp(Math.log(a.damping / a.mass), Math.log(b.damping / b.mass), f),
  );
  return { k, c };
}

type Config = {
  values: number[];
  max: number;
  colorKey: string;
  count: number;
  warmth: number;
  rise: number;
  spacing: number;
  horizon: number;
  glow: number;
  reflection: number;
  shimmer: number;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  active: number | null;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The filament nearest a client x, or null outside the chorus. */
  pick: (clientX: number) => number | null;
  /** Where filament i stands, px from the left. */
  xOf: (i: number) => number;
  dispose: () => void;
};

const DASH = [1.5, 3];

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  onPlaced: () => void,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let clock = 0;
  const size = { w: 0, h: 0, scale: 1 };
  const read = rgbReader();
  let dark = true;
  let n = 0;
  let height = new Float32Array(0);
  let speed = new Float32Array(0);
  let goal = new Float32Array(0);
  let startAt = new Float32Array(0);
  let travel = new Float32Array(0);
  let flare = new Float32Array(0);
  let before = new Float32Array(0);
  let fade = 1;
  // Per filament: its colour as a string, a body gradient and a bloom gradient.
  let colour: string[] = [];
  let body: CanvasGradient[] = [];
  let bloom: CanvasGradient[] = [];
  let horizonGrad: CanvasGradient | null = null;
  let horizonCol = "rgb(150, 170, 255)";
  let inkCol = "rgb(230, 235, 255)";
  let base: [number, number, number][] = [];
  let warm: [number, number, number][] = [];

  const geometry = () => {
    const c = cfg;
    const w = size.w;
    const hy = size.h * clamp(c?.horizon ?? 0.74, 0.55, 0.9);
    const pad = 22;
    const span =
      lerp(0.35, 1, clamp(c?.spacing ?? 0.75, 0, 1)) * Math.max(0, w - 2 * pad);
    const left = (w - span) / 2;
    const top = 44;
    return { hy, span, left, maxH: Math.max(8, hy - top) };
  };

  const xOf = (i: number) => {
    const g = geometry();
    return n <= 1 ? size.w / 2 : g.left + (i * g.span) / (n - 1);
  };

  const targetOf = (v: number) => {
    const c = cfg;
    const g = geometry();
    return (clamp(v, 0, c?.max ?? 1) / Math.max(1e-6, c?.max ?? 1)) * g.maxH;
  };

  const allocate = (count: number) => {
    if (count === n) return;
    const keep = height;
    n = count;
    height = new Float32Array(n);
    speed = new Float32Array(n);
    goal = new Float32Array(n);
    startAt = new Float32Array(n);
    travel = new Float32Array(n);
    flare = new Float32Array(n);
    before = new Float32Array(n);
    for (let i = 0; i < n; i += 1)
      height[i] = keep[Math.min(i, keep.length - 1)] ?? 0;
  };

  const paletteFor = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = clamp(c.warmth, 0, 1);
    colour = [];
    body = [];
    bloom = [];
    const ramp = (stops: [number, number, number][], t: number) => {
      if (stops.length === 0) return toOklab(0.6, 0.7, 1);
      const x = clamp(t, 0, 1) * (stops.length - 1);
      const i = Math.floor(x);
      const a = stops[i] ?? stops[0] ?? [0.6, 0.7, 1];
      const b = stops[Math.min(i + 1, stops.length - 1)] ?? a;
      const A = toOklab(a[0], a[1], a[2]);
      const B = toOklab(b[0], b[1], b[2]);
      const f = x - i;
      return [
        lerp(A[0], B[0], f),
        lerp(A[1], B[1], f),
        lerp(A[2], B[2], f),
      ] as [number, number, number];
    };
    for (let i = 0; i < Math.max(1, n); i += 1) {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const p = ramp(base, t);
      const q = ramp(warm, t);
      // Warmth is the light's colour temperature: a straight mix in oklab, so
      // cool coloured light passes through near-white light to warm light.
      const [r, g, b] = fromOklab(
        lerp(p[0], q[0], w),
        lerp(p[1], q[1], w),
        lerp(p[2], q[2], w),
      );
      const R = Math.round(r * 255);
      const G = Math.round(g * 255);
      const B = Math.round(b * 255);
      colour.push(`rgb(${R}, ${G}, ${B})`);
      // The body: a unit-tall gradient, bright at the tip (0) and fading to the base (1).
      const tip = dark
        ? `rgba(${Math.round(R * 0.7 + 76)}, ${Math.round(G * 0.7 + 76)}, ${Math.round(B * 0.7 + 76)}, 1)`
        : `rgba(${R}, ${G}, ${B}, 1)`;
      const gb = ctx.createLinearGradient(0, 0, 0, 1);
      gb.addColorStop(0, tip);
      gb.addColorStop(0.35, `rgba(${R}, ${G}, ${B}, 0.85)`);
      gb.addColorStop(1, `rgba(${R}, ${G}, ${B}, ${dark ? 0.35 : 0.45})`);
      body.push(gb);
      // The bloom: a unit-radius soft disc; on a light page, colour, not white.
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gl.addColorStop(
        0,
        dark
          ? `rgba(${Math.round(R * 0.55 + 115)}, ${Math.round(G * 0.55 + 115)}, ${Math.round(B * 0.55 + 115)}, 0.95)`
          : `rgba(${R}, ${G}, ${B}, 0.55)`,
      );
      gl.addColorStop(0.25, `rgba(${R}, ${G}, ${B}, ${dark ? 0.5 : 0.22})`);
      gl.addColorStop(1, `rgba(${R}, ${G}, ${B}, 0)`);
      bloom.push(gl);
    }
  };

  const readColours = () => {
    const c = cfg;
    if (!c) return;
    const kids = carriers.children;
    base = [];
    warm = [];
    for (let i = 0; i < kids.length; i += 1) {
      const el = kids[i] as HTMLElement | undefined;
      if (!el) continue;
      const rgb = read(getComputedStyle(el).color);
      const role = el.dataset.role;
      if (role === "base") base.push(rgb);
      else if (role === "warm") warm.push(rgb);
      else if (role === "page")
        dark = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 0.5;
      else if (role === "ink") {
        inkCol = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
      }
    }
    paletteFor();
    const mid = colour[Math.floor(colour.length / 2)] ?? "rgb(150, 170, 255)";
    horizonCol = mid;
    if (ctx) {
      horizonGrad = ctx.createLinearGradient(0, -1, 0, 1);
      const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(mid);
      const rgb = m ? `${m[1]}, ${m[2]}, ${m[3]}` : "150, 170, 255";
      horizonGrad.addColorStop(0, `rgba(${rgb}, 0)`);
      horizonGrad.addColorStop(0.5, `rgba(${rgb}, ${dark ? 0.55 : 0.18})`);
      horizonGrad.addColorStop(1, `rgba(${rgb}, 0)`);
    }
  };

  const retarget = (now: number, cascadeIn: boolean) => {
    const c = cfg;
    if (!c) return;
    allocate(c.values.length);
    const gap = cascade(n);
    for (let i = 0; i < n; i += 1) {
      const t = targetOf(c.values[i] ?? 0);
      if (Math.abs(t - (goal[i] ?? 0)) < 0.01 && startAt[i] !== undefined) {
        goal[i] = t;
        continue;
      }
      goal[i] = t;
      startAt[i] = now + (cascadeIn ? i * gap : 0);
      travel[i] = Math.abs(t - (height[i] ?? 0));
    }
  };

  const springing = () => {
    for (let i = 0; i < n; i += 1) {
      if (
        Math.abs((height[i] ?? 0) - (goal[i] ?? 0)) > 0.05 ||
        Math.abs(speed[i] ?? 0) > 0.05
      )
        return true;
      if ((flare[i] ?? 0) > 0.01) return true;
    }
    return fade < 1;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    if (!c.motionSafe) {
      fade = Math.min(1, fade + dt / durations.base);
      for (let i = 0; i < n; i += 1) {
        height[i] = goal[i] ?? 0;
        speed[i] = 0;
      }
      return;
    }
    const { k, c: damp } = blendSpring(c.rise);
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i += 1) {
      if (clock < (startAt[i] ?? 0)) continue;
      let x = height[i] ?? 0;
      let v = speed[i] ?? 0;
      const g = goal[i] ?? 0;
      for (let s = 0; s < sub; s += 1) {
        const h = dt / sub;
        v += (-k * (x - g) - damp * v) * h;
        x += v * h;
      }
      if (Math.abs(x - g) < 0.05 && Math.abs(v) < 0.05) {
        // Arrived: a small flare if it came far.
        if ((travel[i] ?? 0) > 8) flare[i] = 1;
        travel[i] = 0;
        x = g;
        v = 0;
      }
      height[i] = x;
      speed[i] = v;
      flare[i] = (flare[i] ?? 0) * Math.exp(-dt / 0.35);
    }
  };

  const drawSet = (
    heights: Float32Array,
    alpha: number,
    g: ReturnType<typeof geometry>,
  ) => {
    const c = cfg;
    if (!ctx || !c || alpha <= 0.001) return;
    const s = size.scale;
    const glow = clamp(c.glow, 0, 1);
    const refl = clamp(c.reflection, 0, 1);
    const shim = c.motionSafe && !c.paused ? clamp(c.shimmer, 0, 1) : 0;
    const coreW = n > 40 && size.w < 420 ? 1 : 1.4;
    const act = c.active;
    for (let i = 0; i < n; i += 1) {
      const h = heights[i] ?? 0;
      const x = xOf(i);
      const isActive = act === i;
      const dim = act === null || isActive ? 1 : 0.62;
      const a = alpha * dim;
      const grad = body[i] ?? body[0];
      const halo = bloom[i] ?? bloom[0];
      if (!grad || !halo) continue;
      // Reflection: a shorter, softer streak on the wet ground, brightest at the horizon.
      if (refl > 0 && h > 1) {
        ctx.globalAlpha = a * refl * 0.28;
        ctx.setTransform(s, 0, 0, s * h * 0.42 * refl, s * x, s * (g.hy + 2));
        ctx.fillStyle = grad;
        ctx.fillRect(-1.6, 0, 3.2, 1);
      }
      if (h > 0.5) {
        // The glow round the body, then the hairline core.
        ctx.setTransform(s, 0, 0, s * h, s * x, s * (g.hy - h));
        ctx.fillStyle = grad;
        ctx.globalAlpha = a * (0.1 + glow * 0.2);
        ctx.fillRect(-3.5, 0, 7, 1);
        ctx.globalAlpha = a;
        const w = isActive ? coreW + 0.8 : coreW;
        ctx.fillRect(-w / 2, 0, w, 1);
      }
      // The tip blooms with its speed, swells a little on arrival.
      const v = Math.abs(speed[i] ?? 0);
      const r =
        2.5 +
        glow * 4 +
        Math.min(10, v * 0.06) +
        (flare[i] ?? 0) * 6 +
        (isActive ? 3 : 0);
      ctx.setTransform(s * r, 0, 0, s * r, s * x, s * (g.hy - h));
      ctx.fillStyle = halo;
      ctx.globalAlpha = a * (0.55 + 0.45 * glow);
      ctx.fillRect(-1, -1, 2, 2);
      // Where it meets the horizon, a small flare.
      ctx.setTransform(s * 4, 0, 0, s * 2, s * x, s * g.hy);
      ctx.globalAlpha = a * 0.6;
      ctx.fillRect(-1, -1, 2, 2);
      // Shimmer: a pulse climbing now and then.
      if (shim > 0 && h > 6) {
        const period = 3.2 + ((i * 7919) % 13) * 0.37;
        const p = ((clock + ((i * 104729) % 97) * 0.13) % period) / 1.4;
        if (p < 1) {
          const y = g.hy - h * p;
          ctx.setTransform(s * 3, 0, 0, s * 3, s * x, s * y);
          ctx.globalAlpha = a * shim * Math.sin(Math.PI * p) * 0.9;
          ctx.fillRect(-1, -1, 2, 2);
        }
      }
    }
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || size.w < 1) return;
    const g = geometry();
    const s = size.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    // The horizon: a soft band and a bright line, brighter under the chorus.
    if (horizonGrad) {
      ctx.setTransform(
        s * size.w,
        0,
        0,
        s * (10 + 14 * clamp(c.glow, 0, 1)),
        0,
        s * g.hy,
      );
      ctx.fillStyle = horizonGrad;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, -1, 1, 2);
    }
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = horizonCol;
    ctx.globalAlpha = dark ? 0.75 : 0.6;
    ctx.fillRect(g.left - 18, g.hy - 0.5, g.span + 36, 1);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, g.hy - 0.5, size.w, 1);
    if (!c.motionSafe && fade < 1) {
      drawSet(before, 1 - fade, g);
      drawSet(height, fade, g);
    } else {
      drawSet(height, 1, g);
    }
    // The reading: a dotted thread from the tip up to the readout.
    const act = c.active;
    if (act !== null && act >= 0 && act < n) {
      const x = xOf(act);
      const h = height[act] ?? 0;
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.strokeStyle = inkCol;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, g.hy - h - 8);
      ctx.lineTo(Math.round(x) + 0.5, 40);
      if (g.hy - h - 8 > 40) ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const shimmering = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused && c.shimmer > 0);
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const moving = springing();
    // Only the shimmer: thirty frames a second.
    if (!moving && last && now - drawnAt < 33) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    step(dt);
    draw();
    if (springing() || shimmering()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!springing() && !shimmering()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const prevMax = geometry().maxH;
    size.w = w;
    size.h = h;
    size.scale = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * size.scale));
    canvas.height = Math.max(1, Math.round(h * size.scale));
    // A new size rescales the heights: no springing for a resize.
    const after = geometry().maxH;
    const k = prevMax > 0 ? after / prevMax : 1;
    for (let i = 0; i < n; i += 1) {
      height[i] = (height[i] ?? 0) * k;
      goal[i] = targetOf(c.values[i] ?? 0);
      if (!c.motionSafe || Math.abs((height[i] ?? 0) - (goal[i] ?? 0)) < 2)
        height[i] = goal[i] ?? 0;
    }
    onPlaced();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        allocate(next.values.length);
        readColours();
        resize();
        // First paint stands at the values already, like the server's still:
        // a card seen before it scrolls in never looks unstarted. Springs
        // answer every later change.
        retarget(clock, false);
        for (let i = 0; i < n; i += 1) {
          height[i] = goal[i] ?? 0;
          travel[i] = 0;
        }
        kick();
        return;
      }
      if (
        was.colorKey !== next.colorKey ||
        was.count !== next.count ||
        was.warmth !== next.warmth
      ) {
        if (was.count !== next.count) allocate(next.count);
        readColours();
      }
      const valuesChanged =
        was.max !== next.max ||
        was.values.length !== next.values.length ||
        was.values.some((v, i) => v !== next.values[i]);
      const geomChanged =
        was.horizon !== next.horizon || was.spacing !== next.spacing;
      if (valuesChanged || geomChanged) {
        if (!next.motionSafe) {
          before = new Float32Array(height);
          fade = valuesChanged ? 0 : 1;
        }
        retarget(clock, valuesChanged);
        if (geomChanged) onPlaced();
      }
      if (next.motionSafe !== was.motionSafe && !next.motionSafe) {
        for (let i = 0; i < n; i += 1) height[i] = goal[i] ?? 0;
      }
      if (was.dpr !== next.dpr) resize();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    pick(clientX) {
      const r = root.getBoundingClientRect();
      const x = clientX - r.left;
      const g = geometry();
      if (n === 0) return null;
      const stepW = n > 1 ? g.span / (n - 1) : g.span;
      if (x < g.left - stepW / 2 - 6 || x > g.left + g.span + stepW / 2 + 6)
        return null;
      return clamp(
        Math.round(n > 1 ? ((x - g.left) / g.span) * (n - 1) : 0),
        0,
        n - 1,
      );
    },
    xOf,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

/**
 * A glowing horizon with thin filaments of light rising from it, one per
 * value of a data series — a quiet equaliser drawn in light. When new values
 * arrive each filament's height is a spring retargeted from where it stands,
 * released left to right in a cascade; `rise` picks the spring from the
 * calibration set (drift, glide, snap) and a filament's tip blooms with its
 * speed, flaring softly as it arrives. Filaments reflect on the glossy ground
 * below, the horizon pools light under them, and faint pulses climb them
 * while idle.
 *
 * Hovering, or arrowing with the keyboard, reads one: it brightens, the rest
 * dim, and a readout with its label and value slides above it on
 * springs.snap while the readings cross-fade in one cell. The chorus is a
 * slider over the index, with every value also in a list for assistive
 * technology. Canvas 2D, gradients cached per filament; the loop stops when
 * settled and runs at thirty frames a second for the shimmer alone. Under
 * reduced motion new values cross-fade in.
 */
export function LumenChorus({
  values = defaultLumenChorusValues,
  labels,
  colors = ["var(--accent-bright)", "var(--signal)"],
  warmth = 0.2,
  rise = 0.5,
  spacing = 0.75,
  max,
  format = defaultFormat,
  unit = "",
  horizon = 0.74,
  glow = 0.6,
  reflection = 0.5,
  shimmer = 0.35,
  active,
  defaultActive = null,
  onActiveChange,
  paused = false,
  dpr = 2,
  label = "Values",
  className,
}: LumenChorusProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const n = values.length;
  const top = max ?? Math.max(1e-6, ...values.map((v) => Math.abs(v))) * 1.1;
  const [own, setOwn] = React.useState<number | null>(defaultActive);
  const current = active === undefined ? own : active;
  const shown =
    current !== null && current >= 0 && current < n ? current : null;
  const labelOf = (i: number) => labels?.[i] ?? String(i + 1);
  const valueText = (i: number) =>
    `${format(values[i] ?? 0)}${unit ? ` ${unit}` : ""}`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const readoutX = useMotionValue(0);
  const [readoutW, setReadoutW] = React.useState(96);
  const measureRef = React.useRef<HTMLDivElement | null>(null);

  const config: Config = {
    values,
    max: top,
    colorKey: colors.join("|"),
    count: n,
    warmth,
    rise,
    spacing,
    horizon,
    glow,
    reflection,
    shimmer,
    paused,
    dpr,
    motionSafe,
    active: shown,
  };
  const latest = React.useRef(config);

  /** Slides the readout over filament i: snap with motion, a jump without. */
  const place = React.useCallback(
    (i: number | null, jump: boolean) => {
      const e = engine.current;
      const root = rootRef.current;
      if (!e || !root || i === null) return;
      const half = readoutW / 2;
      const x = Math.round(
        clamp(e.xOf(i), half + 6, root.clientWidth - half - 6),
      );
      if (jump || !latest.current.motionSafe) readoutX.jump(x);
      else animate(readoutX, x, springs.snap);
    },
    [readoutW, readoutX],
  );

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  const placeRef = React.useRef(place);
  React.useEffect(() => {
    placeRef.current = place;
  }, [place]);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, () =>
      placeRef.current(latest.current.active, true),
    );
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) e.wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The readout's width: the widest reading, measured once it is in the page.
  const bindMeasure = React.useCallback((node: HTMLDivElement | null) => {
    measureRef.current = node;
    if (!node) return;
    const ro = new ResizeObserver(() =>
      setReadoutW(Math.ceil(node.offsetWidth)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Follow the reading as it changes (a host's change slides it too).
  const placed = React.useRef<number | null>(null);
  React.useEffect(() => {
    const jump = placed.current === null;
    placed.current = shown;
    place(shown, jump);
  }, [shown, place]);

  const choose = (i: number | null) => {
    const next = i === null ? null : clamp(i, 0, Math.max(0, n - 1));
    if (next === current) return;
    if (active === undefined) setOwn(next);
    onActiveChange?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (n === 0) return;
    const at = shown ?? n - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = at - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "PageUp") next = at + 6;
    else if (event.key === "PageDown") next = at - 6;
    if (next === null) return;
    event.preventDefault();
    choose(clamp(next, 0, n - 1));
  };

  const textFor = (i: number | null) =>
    i === null ? "None" : `${labelOf(i)}, ${valueText(i)}`;

  // The server's frame: the chorus standing at its values, in a 1000 × 1000 box.
  const still = (() => {
    const hy = Math.round(clamp(horizon, 0.55, 0.9) * 1000);
    const span = Math.round(lerp(0.35, 1, clamp(spacing, 0, 1)) * 940);
    const left = Math.round(500 - span / 2);
    const maxH = hy - 200;
    const lines = values.map((v, i) => ({
      x: Number((n <= 1 ? 500 : left + (i * span) / (n - 1)).toFixed(1)),
      y: Number((hy - (clamp(v, 0, top) / top) * maxH).toFixed(1)),
    }));
    return { hy, span, left, lines };
  })();

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={n > 0 ? 1 : 0}
        aria-valuemax={n}
        aria-valuenow={shown === null ? (n > 0 ? n : 0) : shown + 1}
        aria-valuetext={shown === null ? `${n} values` : textFor(shown)}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible") && shown === null)
            choose(n - 1);
        }}
        onBlur={() => choose(null)}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          choose(engine.current?.pick(event.clientX) ?? null);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") return;
          choose(engine.current?.pick(event.clientX) ?? null);
        }}
        onPointerLeave={() => {
          if (document.activeElement !== rootRef.current) choose(null);
        }}
        className={cn(
          "group/lumen-chorus absolute inset-0 isolate overflow-clip rounded-3 border border-hairline [contain:paint] select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--background) 86%, var(--accent)), var(--background) 70%, color-mix(in oklab, var(--background) 93%, var(--accent)))",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full group-data-live/lumen-chorus:hidden"
        >
          <defs>
            <linearGradient
              id={`${uid}-ramp`}
              gradientUnits="userSpaceOnUse"
              x1={still.left}
              x2={still.left + still.span}
              y1="0"
              y2="0"
            >
              {colors.slice(0, 8).map((c, i, all) => (
                <stop
                  key={i}
                  offset={
                    all.length > 1
                      ? Number((i / (all.length - 1)).toFixed(3))
                      : 0
                  }
                  stopColor={c}
                />
              ))}
            </linearGradient>
          </defs>
          <line
            x1="0"
            x2="1000"
            y1={still.hy}
            y2={still.hy}
            stroke={`url(#${uid}-ramp)`}
            strokeOpacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
          {still.lines.map((l, i) => (
            <line
              key={i}
              x1={l.x}
              x2={l.x}
              y1={still.hy}
              y2={l.y}
              stroke={`url(#${uid}-ramp)`}
              strokeWidth="1.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-2 left-0 grid -translate-x-1/2 justify-items-center transition-opacity duration-150",
            shown === null ? "opacity-0" : "opacity-100",
          )}
          style={{ x: readoutX }}
        >
          <div
            ref={bindMeasure}
            className="col-start-1 row-start-1 grid justify-items-center"
          >
            {values.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "col-start-1 row-start-1 flex flex-col items-center rounded-2 border border-hairline bg-popover/85 px-2 py-0.5 whitespace-nowrap shadow-sm backdrop-blur-sm transition-opacity duration-150",
                  shown === i ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="font-mono text-[9px] leading-3 tracking-[0.08em] text-ink-3 uppercase">
                  {labelOf(i)}
                </span>
                <span className="text-xs leading-4 font-semibold text-foreground tabular-nums">
                  {valueText(i)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
        <span
          ref={carriersRef}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden"
        >
          {colors.slice(0, 8).map((c, i) => (
            <span
              key={`b${i}`}
              data-role="base"
              className="transition-colors duration-1"
              style={{ color: c }}
            />
          ))}
          <span
            data-role="warm"
            className="transition-colors duration-1"
            style={{
              color:
                "light-dark(oklch(from var(--warn) 0.66 0.15 h), oklch(from var(--warn) 0.84 0.13 h))",
            }}
          />
          <span
            data-role="warm"
            className="transition-colors duration-1"
            style={{
              color:
                "light-dark(oklch(from var(--danger) 0.58 0.17 h), oklch(from var(--danger) 0.74 0.15 h))",
            }}
          />
          <span
            data-role="page"
            className="transition-colors duration-1"
            style={{ color: "var(--background)" }}
          />
          <span
            data-role="ink"
            className="transition-colors duration-1"
            style={{ color: "var(--ink-2)" }}
          />
        </span>
      </div>
      {/* Outside the slider: a slider's children are presentational to assistive technology. */}
      <div className="sr-only">
        <ul id={`${uid}-list`} aria-label={`${label}, every value`}>
          {values.map((_, i) => (
            <li key={i}>{textFor(i)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
