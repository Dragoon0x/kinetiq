"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GradedWashPreset = "dusk" | "tide" | "ember" | "moss";

export type GradedWashState = "ready" | "painting" | "drying" | "dry";

export type GradedWashProps = {
  /** The two colours, top into bottom: a named pair or two CSS colours. @default "dusk" */
  colors?: GradedWashPreset | [string, string];
  /** How much water the wash carries, 0 (dry brush, quick to dry) to 1 (very wet: soft, pooling, slow to dry). @default 0.6 */
  wetness?: number;
  /** The board's resting slope in degrees, 0 (flat: the bead stalls) to 30 (steep: it runs). @default 12 */
  tilt?: number;
  /** The board's resting lean to the side, −1 (left low) to 1 (right low). @default 0 */
  lean?: number;
  /** How many strokes lay the wash, 4 to 12. @default 7 */
  strokes?: number;
  /** How long one stroke takes to cross the paper, in ms. @default 460 */
  pace?: number;
  /** How much tooth the paper has, 0 (hot-pressed smooth) to 1 (rough, granulating). @default 0.5 */
  grain?: number;
  /** When the first wash is laid: as it scrolls into view, on mount, or only on request. @default "inView" */
  trigger?: "inView" | "mount" | "manual";
  /** Change it to lay a new wash from outside. */
  washKey?: number;
  /** Fires as the wash goes from ready to painting (once per stroke), drying and dry, with the stroke number. */
  onStateChange?: (state: GradedWashState, stroke: number) => void;
  /** Fires when a wash has dried. */
  onComplete?: () => void;
  /** Names the board for assistive technology. @default "Watercolour wash" */
  label?: string;
  /** Shows the wash but takes no input. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the board; give it a height. @default "h-52 w-full" */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const pigment = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

const PAIRS: Record<GradedWashPreset, [string, string]> = {
  dusk: [pigment("--accent", 0.5, 0.13), pigment("--danger", 0.7, 0.11, -12)],
  tide: [pigment("--accent", 0.42, 0.1), pigment("--signal", 0.74, 0.1)],
  ember: [pigment("--warn", 0.74, 0.14), pigment("--danger", 0.52, 0.17)],
  moss: [pigment("--success", 0.64, 0.1), pigment("--accent", 0.46, 0.08)],
};

const PAIR_NAMES: Record<GradedWashPreset, string> = {
  dusk: "dusk blue into rose",
  tide: "deep blue into sea green",
  ember: "amber into red",
  moss: "moss into slate",
};

const PAPER = pigment("--warn", 0.968, 0.014);

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Resolves any CSS colour to sRGB 0–1 through a 1px canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[0] = (d[0] ?? 0) / 255;
    out[1] = (d[1] ?? 0) / 255;
    out[2] = (d[2] ?? 0) / 255;
  };
}

/* ----------------------------------- sim ----------------------------------- */

type Config = {
  wetness: number;
  tilt: number;
  strokes: number;
  pace: number;
  grain: number;
  motionSafe: boolean;
  dpr: number;
  colourKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  /** Starts a wash on fresh paper. */
  start: () => void;
  readColours: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

const CELL = 2;
const TOP = 0.05;
const BOTTOM = 0.9;

/**
 * The wash. Paper is a grid of cells holding pigment, the colour mix it was
 * laid with and how wet it still is; the bead is per column — where its
 * front is, how much water it holds and what colour it carries. Strokes
 * top the bead up, gravity creeps it down, the board's lean moves water
 * along it, and wherever its front lingers it keeps leaving pigment, so a
 * pause draws a tide line. Pixels are composed as light through two
 * pigments mixed in absorbance, on the paper's own colour.
 */
function createWash(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  slope: MotionValue<number>,
  leanMV: MotionValue<number>,
  onState: (s: GradedWashState, stroke: number) => void,
  onLive: () => void,
): Engine {
  const ctx = canvas.getContext("2d");
  const sheet = document.createElement("canvas");
  const sctx = sheet.getContext("2d");
  const read = rgbReader();
  const colA = new Float32Array(3);
  const colB = new Float32Array(3);
  const paper = new Float32Array(3);
  const absA = new Float32Array(3);
  const absB = new Float32Array(3);
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let cssW = 0;
  let cssH = 0;
  let ratio = 1;
  let dens = new Float32Array(0);
  let mixv = new Float32Array(0);
  let wet = new Float32Array(0);
  let tooth = new Float32Array(0);
  let front = new Float32Array(0);
  let water = new Float32Array(0);
  let bead = new Float32Array(0);
  let scratch = new Float32Array(0);
  let laid = new Int32Array(0);
  let still = new Float32Array(0);
  let image: ImageData | null = null;
  let phase: GradedWashState = "ready";
  let stroke = 0;
  let strokeT = 0;
  let painted = false;
  let visible = false;
  let disposed = false;
  let frame = 0;
  let last = 0;

  const absorb = (c: Float32Array, out: Float32Array) => {
    for (let k = 0; k < 3; k += 1) {
      out[k] = -Math.log(
        clamp((c[k] ?? 0.5) / Math.max(0.05, paper[k] ?? 1), 0.03, 1),
      );
    }
  };

  const readColours = () => {
    const kids = carriers.children;
    const a = kids[0];
    const b = kids[1];
    const p = kids[2];
    if (p) read(getComputedStyle(p).color, paper);
    if (a) read(getComputedStyle(a).color, colA);
    if (b) read(getComputedStyle(b).color, colB);
    absorb(colA, absA);
    absorb(colB, absB);
  };

  let quiet = false;
  const setPhase = (next: GradedWashState) => {
    if (next === phase && next !== "painting") return;
    phase = next;
    if (!quiet) onState(next, stroke);
  };

  /** Fresh paper of the current size: tooth from seeded value noise. */
  const allocate = () => {
    const n = W * H;
    dens = new Float32Array(n);
    mixv = new Float32Array(n);
    wet = new Float32Array(n);
    tooth = new Float32Array(n);
    front = new Float32Array(W);
    water = new Float32Array(W);
    bead = new Float32Array(W);
    scratch = new Float32Array(W);
    laid = new Int32Array(W);
    still = new Float32Array(W);
    sheet.width = Math.max(1, W);
    sheet.height = Math.max(1, H);
    image = sctx ? sctx.createImageData(Math.max(1, W), Math.max(1, H)) : null;
    const rnd = lcg(W * 131 + H);
    const gw = Math.ceil(W / 3) + 2;
    const gh = Math.ceil(H / 3) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rnd();
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const gx = x / 3;
        const gy = y / 3;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const a = grid[iy * gw + ix] ?? 0;
        const b = grid[iy * gw + ix + 1] ?? 0;
        const c = grid[(iy + 1) * gw + ix] ?? 0;
        const d = grid[(iy + 1) * gw + ix + 1] ?? 0;
        tooth[y * W + x] =
          lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 0.7 + rnd() * 0.3;
      }
    }
  };

  const clearPaper = () => {
    dens.fill(0);
    mixv.fill(0);
    wet.fill(0);
    water.fill(0);
    bead.fill(0);
    front.fill(Math.floor(H * TOP));
    laid.fill(Math.floor(H * TOP));
    still.fill(0);
    stroke = 0;
    strokeT = 0;
  };

  /**
   * Pigment left in column x down to row y1 by a bead holding w water of mix
   * m. Every cell is laid once, as the front first passes it — a cell the
   * bead lingers over gathers tide instead (see step).
   */
  const lay = (x: number, y1: number, w: number, m: number) => {
    const c = cfg;
    if (!c) return;
    const g = clamp(c.grain, 0, 1);
    const wt = clamp(c.wetness, 0, 1);
    const from = laid[x] ?? 0;
    const to = Math.min(H, Math.floor(y1));
    if (to <= from) return;
    for (let y = from; y < to; y += 1) {
      const i = y * W + x;
      const t = tooth[i] ?? 0.5;
      // A drier brush skips over the paper's tooth; a wet one fills it, and
      // pigment settles into the tooth as granulation.
      const skip = (1 - wt) * 0.6 * clamp((t - 0.7) * 5, 0, 1);
      const amount =
        0.56 *
        (0.78 + 0.22 * Math.min(w, 2) * 0.5) *
        (1 + g * 0.55 * (t - 0.5)) *
        (1 - skip);
      dens[i] = amount;
      mixv[i] = m;
      wet[i] = 1;
    }
    laid[x] = to;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c || W < 2) return;
    const n = clamp(Math.round(c.strokes), 4, 12);
    const wt = clamp(c.wetness, 0, 1);
    const top = Math.floor(H * TOP);
    const bottom = Math.floor(H * BOTTOM);
    const floor = Math.floor(H * 0.95);
    const band = (bottom - top) / n;
    const s = Math.sin((clamp(slope.get(), 0, 40) * Math.PI) / 180);
    const lean = clamp(leanMV.get(), -1, 1);
    const painting = phase === "painting";
    // Water the paper takes per cell the bead advances over.
    const soak = 0.05 - 0.02 * wt;

    // The brush crosses the paper; every column it passes is topped up and
    // its bead pulled down to the bottom of this stroke.
    if (painting) {
      const pace = Math.max(0.12, c.pace / 1000);
      const t0 = strokeT;
      strokeT += dt / pace;
      const span = W + 8;
      const xa = Math.max(0, Math.floor(t0 * span - 4));
      const xb = Math.min(W, Math.floor(strokeT * span - 4));
      const target = n > 1 ? stroke / (n - 1) : 0;
      const bottomOf = top + band * (stroke + 1);
      for (let x = xa; x < xb; x += 1) {
        const load = 0.45 + 0.6 * wt;
        const w = water[x] ?? 0;
        bead[x] = ((bead[x] ?? 0) * w + target * load) / (w + load);
        water[x] = w + load;
        const f = front[x] ?? top;
        if (bottomOf > f) {
          lay(x, bottomOf, water[x] ?? 0, bead[x] ?? target);
          water[x] = Math.max(0.2, (water[x] ?? 0) - (bottomOf - f) * soak);
          front[x] = bottomOf;
          still[x] = 0;
        }
      }
      if (strokeT >= 1) {
        stroke += 1;
        strokeT = -0.16;
        if (stroke >= n) setPhase("drying");
        else setPhase("painting");
      }
    }

    // Water runs along the bead toward the low side, and evens out between
    // painted columns; nothing runs onto dry paper.
    scratch.set(water);
    const flow = Math.min(0.3, Math.abs(lean) * 5 * dt);
    const dir = lean > 0 ? 1 : -1;
    const wetCol = (x: number) => x >= 0 && x < W && (front[x] ?? 0) > top;
    const even = Math.min(0.24, 6 * dt);
    for (let x = 0; x < W; x += 1) {
      if (!wetCol(x)) continue;
      const w = scratch[x] ?? 0;
      const l = wetCol(x - 1) ? (scratch[x - 1] ?? 0) : w;
      const r = wetCol(x + 1) ? (scratch[x + 1] ?? 0) : w;
      let next = w + (l + r - 2 * w) * even;
      if (flow > 0) {
        if (wetCol(x - dir)) next += (scratch[x - dir] ?? 0) * flow;
        if (wetCol(x + dir)) next -= w * flow;
      }
      water[x] = Math.max(0, next);
    }

    // Gravity creeps the bead down the slope; surface tension keeps the line
    // together, so a pooled side runs further in a smooth slant.
    const creepK = ((30 * s) / Math.sin((12 * Math.PI) / 180)) * (0.45 + wt);
    scratch.set(front);
    for (let x = 0; x < W; x += 1) {
      const w = water[x] ?? 0;
      const f = scratch[x] ?? top;
      if (f <= top) continue;
      const l = x > 0 ? (scratch[x - 1] ?? f) : f;
      const r = x < W - 1 ? (scratch[x + 1] ?? f) : f;
      const v =
        creepK * Math.pow(Math.max(0, w - 0.18), 1.2) * (painting ? 0.3 : 1);
      let nf = Math.min(floor, f + v * dt);
      nf = Math.min(nf, Math.min(l, r) + 1.6);
      nf = Math.max(f, nf);
      if (nf > f) {
        lay(x, nf, w, bead[x] ?? 0);
        water[x] = Math.max(0, w - (nf - f) * soak);
      }
      // Lingering: a front that has stood still keeps gathering pigment at
      // its edge — the tide line it leaves when it finally moves or dries.
      if (nf - f < 0.004 * Math.max(1, 60 * dt) && w > 0.05) {
        still[x] = (still[x] ?? 0) + dt;
        if ((still[x] ?? 0) > 0.35) {
          const yi = Math.min(H - 1, Math.max(0, Math.floor(nf) - 1));
          const i = yi * W + x;
          const add = w * dt * (0.12 + 0.3 * wt);
          const before = dens[i] ?? 0;
          mixv[i] =
            ((mixv[i] ?? 0) * before + (bead[x] ?? 0) * add) /
            Math.max(1e-6, before + add);
          dens[i] = Math.min(2.2, before + add);
          wet[i] = 1;
        }
      } else {
        still[x] = 0;
      }
      front[x] = nf;
    }

    // The paper drinks the bead; what is left when it is gone stays at the line.
    const drink = lerp(1.5, 0.62, wt) * (painting ? 0.25 : 1) * dt;
    for (let x = 0; x < W; x += 1) {
      const w = water[x] ?? 0;
      if (w <= 0) continue;
      const nw = w - w * drink - 0.03 * dt;
      if (nw < 0.05 && !painting) {
        const yi = Math.min(H - 1, Math.max(0, Math.floor(front[x] ?? 0) - 1));
        for (const [dy, share] of [
          [0, 0.75],
          [-1, 0.35],
        ] as const) {
          const j = Math.max(0, yi + dy) * W + x;
          const add = (0.22 + 0.35 * wt) * share;
          const before = dens[j] ?? 0;
          mixv[j] =
            ((mixv[j] ?? 0) * before + (bead[x] ?? 0) * add) /
            Math.max(1e-6, before + add);
          dens[j] = Math.min(2.2, before + add);
          wet[j] = Math.max(wet[j] ?? 0, 0.7);
        }
        water[x] = 0;
      } else {
        water[x] = Math.max(0, nw);
      }
    }

    // Wet paper dries, lighter.
    const dry = dt / lerp(1, 2.6, wt);
    let anyWet = false;
    for (let i = 0; i < wet.length; i += 1) {
      const v = wet[i] ?? 0;
      if (v > 0) {
        wet[i] = Math.max(0, v - dry);
        anyWet = true;
      }
    }
    let anyWater = false;
    for (let x = 0; x < W; x += 1) {
      if ((water[x] ?? 0) > 0.001) {
        anyWater = true;
        break;
      }
    }
    if (phase === "drying" && !anyWater && !anyWet) setPhase("dry");
  };

  /** The paper, composed: light through the laid pigment, wet darker and glossier. */
  const compose = () => {
    if (!image || !sctx) return;
    const px = image.data;
    const p0 = paper[0] ?? 1;
    const p1 = paper[1] ?? 1;
    const p2 = paper[2] ?? 1;
    const g = clamp(cfg?.grain ?? 0.5, 0, 1);
    for (let i = 0, o = 0; i < dens.length; i += 1, o += 4) {
      const t = tooth[i] ?? 0.5;
      const shade = 1 - g * 0.05 * (t - 0.5);
      const d = dens[i] ?? 0;
      let r = p0 * shade;
      let gg = p1 * shade;
      let b = p2 * shade;
      if (d > 0.002) {
        const m = mixv[i] ?? 0;
        const w = wet[i] ?? 0;
        // Wet paint is darker; it dries back to about four fifths.
        const k = d * (0.8 + 0.38 * w);
        r *= Math.exp(
          -k * ((absA[0] ?? 0) + ((absB[0] ?? 0) - (absA[0] ?? 0)) * m),
        );
        gg *= Math.exp(
          -k * ((absA[1] ?? 0) + ((absB[1] ?? 0) - (absA[1] ?? 0)) * m),
        );
        b *= Math.exp(
          -k * ((absA[2] ?? 0) + ((absB[2] ?? 0) - (absA[2] ?? 0)) * m),
        );
      }
      px[o] = r * 255;
      px[o + 1] = gg * 255;
      px[o + 2] = b * 255;
      px[o + 3] = 255;
    }
    sctx.putImageData(image, 0, 0);
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || W < 2 || cssW < 1) return;
    compose();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet, 0, 0, W, H, 0, 0, cssW, cssH);
    const sx = cssW / W;
    const sy = cssH / H;
    // The bead: a rich line of wet paint along the front with a light on it.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let started = false;
    ctx.beginPath();
    for (let x = 0; x < W; x += 1) {
      const w = water[x] ?? 0;
      if (w < 0.05) {
        started = false;
        continue;
      }
      const X = (x + 0.5) * sx;
      const Y = (front[x] ?? 0) * sy;
      if (!started) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
      started = true;
    }
    const m = averageBead();
    const k = 1.25;
    const br =
      (paper[0] ?? 1) *
      Math.exp(-k * ((absA[0] ?? 0) + ((absB[0] ?? 0) - (absA[0] ?? 0)) * m));
    const bg =
      (paper[1] ?? 1) *
      Math.exp(-k * ((absA[1] ?? 0) + ((absB[1] ?? 0) - (absA[1] ?? 0)) * m));
    const bb =
      (paper[2] ?? 1) *
      Math.exp(-k * ((absA[2] ?? 0) + ((absB[2] ?? 0) - (absA[2] ?? 0)) * m));
    ctx.strokeStyle = `rgb(${Math.round(br * 255)}, ${Math.round(bg * 255)}, ${Math.round(bb * 255)})`;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, sy * 1.6);
    ctx.stroke();
    ctx.translate(0, -Math.max(0.8, sy * 0.45));
    ctx.strokeStyle = "rgb(255, 255, 255)";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(0.7, sy * 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (phase === "painting" && strokeT >= 0) drawBrush(sx, sy, br, bg, bb);
    if (!painted) {
      painted = true;
      onLive();
    }
  };

  const averageBead = () => {
    let sum = 0;
    let weight = 0;
    for (let x = 0; x < W; x += 1) {
      const w = water[x] ?? 0;
      sum += (bead[x] ?? 0) * w;
      weight += w;
    }
    return weight > 0 ? sum / weight : 0;
  };

  /** A flat wash brush: loaded bristles, a ferrule and the start of a handle. */
  const drawBrush = (
    sx: number,
    sy: number,
    r: number,
    g: number,
    b: number,
  ) => {
    const c = cfg;
    if (!ctx || !c) return;
    const n = clamp(Math.round(c.strokes), 4, 12);
    const top = H * TOP;
    const band = (H * BOTTOM - top) / n;
    const span = W + 8;
    const X = (strokeT * span - 4) * sx;
    const y0 = (top + band * stroke) * sy;
    const h = band * sy * 1.15;
    const w = Math.max(5, h * 0.24);
    ctx.save();
    ctx.translate(X, y0 + band * sy * 0.5);
    ctx.rotate(-0.12);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w / 2, 3));
    ctx.fill();
    ctx.fillStyle = "rgb(150, 154, 162)";
    ctx.fillRect(w / 2, -h * 0.42, w * 0.9, h * 0.84);
    ctx.fillStyle = "rgb(122, 82, 52)";
    ctx.beginPath();
    ctx.roundRect(w / 2 + w * 0.9, -h * 0.16, w * 3.4, h * 0.32, h * 0.16);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // Only wet paint needs frames: the board's own tilt is drawn by CSS.
  const busy = () => phase === "painting" || phase === "drying";

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.12, (now - last) / 1000) : 1 / 60;
    last = now;
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i += 1) step(dt / steps);
    draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2 || !c) return;
    ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    cssW = w;
    cssH = h;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const nW = Math.max(8, Math.floor(w / CELL));
    const nH = Math.max(8, Math.floor(h / CELL));
    if (nW !== W || nH !== H) {
      const was = phase;
      W = nW;
      H = nH;
      allocate();
      clearPaper();
      // A resize mid-wash starts it again at the new size; a finished one
      // is laid again at once so the paper never comes back blank.
      if (was === "dry" || (was !== "ready" && !c.motionSafe)) finish();
      else if (was !== "ready") phase = "painting";
    }
    draw();
  };

  /** Runs a whole wash to dry at once: reduced motion, and a resize of a dry wash. */
  const finish = () => {
    clearPaper();
    phase = "painting";
    quiet = true;
    let guard = 0;
    // step() moves the phase on; read it fresh each turn.
    const at = () => phase as GradedWashState;
    while (at() !== "dry" && guard < 4000) {
      step(1 / 30);
      guard += 1;
    }
    quiet = false;
    phase = "dry";
  };

  const unsubs = [slope.on("change", kick), leanMV.on("change", kick)];

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) readColours();
      if (was.dpr !== next.dpr) resize();
      else draw();
    },
    start() {
      if (!cfg || W < 2) return;
      clearPaper();
      if (!cfg.motionSafe) {
        finish();
        onState("dry", stroke);
        draw();
        return;
      }
      phase = "ready";
      setPhase("painting");
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    resize,
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      for (const u of unsubs) u();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component -------------------------------- */

const KEY_LEAN = 0.8;
const KEY_SLOPE = 10;

/**
 * A sheet of paper taped to a tilted board, receiving a graded watercolour
 * wash. A flat brush lays it stroke by stroke from the top; each stroke tops
 * up a bead of wet paint along the bottom of the painted area, and the colour
 * it carries hands over from the first to the second — but the bead mixes
 * what it holds, so the change is a true gradation. Between strokes gravity
 * creeps the bead down the slope; drag the board to steepen or flatten it,
 * or lean it, and the water runs along the bead to the low side, where it
 * pools and runs further and darker. Where the bead slows it leaves soft tide
 * lines, and when the wash ends it dries in place into the darkest one, the
 * whole wash drying lighter than it went on.
 *
 * The paper is a Canvas 2D simulation, composed as light through two
 * pigments mixed in absorbance. The board is focusable: arrow keys tip it
 * while held, Enter or Space lays a new wash. Under reduced motion the wash
 * is computed whole and cross-fades in, and the board does not move.
 */
export function GradedWash({
  colors = "dusk",
  wetness = 0.6,
  tilt = 12,
  lean = 0,
  strokes = 7,
  pace = 460,
  grain = 0.5,
  trigger = "inView",
  washKey = 0,
  onStateChange,
  onComplete,
  label = "Watercolour wash",
  disabled = false,
  dpr = 2,
  className,
}: GradedWashProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const pair: [string, string] = Array.isArray(colors)
    ? [colors[0] ?? PAIRS.dusk[0], colors[1] ?? PAIRS.dusk[1]]
    : (PAIRS[colors] ?? PAIRS.dusk);
  const pairName = Array.isArray(colors)
    ? "two colours"
    : (PAIR_NAMES[colors] ?? PAIR_NAMES.dusk);
  const rest = clamp(tilt, 0, 30);
  const restLean = clamp(lean, -1, 1);

  const slope = useMotionValue(rest);
  const leanMV = useMotionValue(restLean);
  const fade = useMotionValue(1);
  const rotateX = useTransform(slope, (s) => (motionSafe ? r2(s * 0.28) : 0));
  const rotateY = useTransform(leanMV, (l) => (motionSafe ? r2(l * 5) : 0));

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [started, setStarted] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const keys = React.useRef(new Set<string>());
  const dragFrom = React.useRef({ s: rest, l: restLean, w: 1, h: 1 });
  const seenView = React.useRef(false);
  const startedRef = React.useRef(false);

  const config: Config = {
    wetness,
    tilt: rest,
    strokes,
    pace,
    grain,
    motionSafe,
    dpr,
    colourKey: pair.join("|"),
  };
  const latest = React.useRef({
    config,
    trigger,
    onStateChange,
    onComplete,
    motionSafe,
  });
  React.useEffect(() => {
    latest.current = {
      config,
      trigger,
      onStateChange,
      onComplete,
      motionSafe,
    };
    engine.current?.configure(config);
  });

  const onState = React.useCallback(
    (s: GradedWashState, stroke: number) => {
      const L = latest.current;
      L.onStateChange?.(s, stroke);
      if (s === "painting" && stroke === 0) {
        setSaid((x) => ({ n: x.n + 1, text: "Painting a new wash." }));
      } else if (s === "drying") {
        setSaid((x) => ({ n: x.n + 1, text: "Wash laid, drying." }));
      } else if (s === "dry") {
        setSaid((x) => ({ n: x.n + 1, text: "Dry." }));
        L.onComplete?.();
      }
    },
    [setSaid],
  );

  const startWash = React.useCallback(() => {
    const e = engine.current;
    if (!e) return;
    for (const c of running.current) c.stop();
    const first = !startedRef.current;
    startedRef.current = true;
    setStarted(true);
    if (first || !latest.current.motionSafe) {
      // The first wash fades the paper in over the still; under reduced
      // motion every wash is the finished one, cross-faded in.
      fade.set(0);
      e.start();
      running.current = [
        animate(fade, 1, { duration: durations.slow, ease: easings.enter }),
      ];
      return;
    }
    if (fade.get() < 0.99) {
      fade.set(1);
      e.start();
      return;
    }
    // The old wash fades out on the exit ease, then the brush starts again.
    running.current = [
      animate(fade, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          fade.set(1);
          e.start();
        },
      }),
    ];
  }, [fade, setStarted]);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createWash(root, canvas, carriers, slope, leanMV, onState, () =>
      root.setAttribute("data-live", ""),
    );
    engine.current = e;
    e.configure(latest.current.config);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(canvas);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        const on = Boolean(entry?.isIntersecting);
        e.setVisible(on);
        if (on && !seenView.current && latest.current.trigger === "inView") {
          seenView.current = true;
          startWash();
        }
      },
      { threshold: 0.35 },
    );
    watcher.observe(root);
    if (latest.current.trigger === "mount") startWash();
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      seenView.current = false;
    };
  }, [slope, leanMV, onState, startWash]);

  // A host that bumps `washKey` lays a new wash.
  const seenKey = React.useRef(washKey);
  React.useEffect(() => {
    if (seenKey.current === washKey) return;
    seenKey.current = washKey;
    startWash();
  }, [washKey, startWash]);

  // A new resting tilt or lean: the board settles there.
  React.useEffect(() => {
    for (const c of running.current) c.stop();
    running.current = motionSafe
      ? [
          animate(slope, rest, springs.drift),
          animate(leanMV, restLean, springs.drift),
        ]
      : [
          animate(slope, rest, { duration: 0 }),
          animate(leanMV, restLean, { duration: 0 }),
        ];
  }, [rest, restLean, motionSafe, slope, leanMV]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
    },
    [],
  );

  const settleBoard = (vs = 0, vl = 0) => {
    for (const c of running.current) c.stop();
    if (!motionSafe) {
      slope.set(rest);
      leanMV.set(restLean);
      running.current = [];
      return;
    }
    running.current = [
      animate(slope, rest, { ...springs.drift, velocity: vs }),
      animate(leanMV, restLean, { ...springs.drift, velocity: vl }),
    ];
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      for (const c of running.current) c.stop();
      running.current = [];
      const r = rootRef.current?.getBoundingClientRect();
      dragFrom.current = {
        s: slope.get(),
        l: leanMV.get(),
        w: Math.max(1, r?.width ?? 1),
        h: Math.max(1, r?.height ?? 1),
      };
    },
    onMove: ({ offset }) => {
      const d = dragFrom.current;
      // 1:1: the box's height of travel is 30° of slope, a third of its
      // width a full lean.
      slope.set(r2(clamp(d.s + (offset.y / d.h) * 30, 0, 40)));
      leanMV.set(r2(clamp(d.l + offset.x / (d.w * 0.33), -1, 1)));
    },
    onEnd: ({ velocity }) => {
      const d = dragFrom.current;
      settleBoard((velocity.y / d.h) * 30, velocity.x / (d.w * 0.33));
    },
    onCancel: () => settleBoard(),
    onTap: () => {
      if (!disabled) startWash();
    },
  });

  const keyAim = () => {
    const k = keys.current;
    const l = (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0);
    const s = (k.has("ArrowDown") ? 1 : 0) - (k.has("ArrowUp") ? 1 : 0);
    return {
      lean: clamp(restLean + l * KEY_LEAN, -1, 1),
      slope: clamp(rest + s * KEY_SLOPE, 0, 40),
    };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      if (keys.current.has(event.key)) return;
      keys.current.add(event.key);
      const aim = keyAim();
      for (const c of running.current) c.stop();
      running.current = motionSafe
        ? [
            animate(slope, aim.slope, springs.glide),
            animate(leanMV, aim.lean, springs.glide),
          ]
        : [
            animate(slope, aim.slope, { duration: 0 }),
            animate(leanMV, aim.lean, { duration: 0 }),
          ];
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) startWash();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!keys.current.has(event.key)) return;
    keys.current.delete(event.key);
    if (keys.current.size === 0) settleBoard();
    else {
      const aim = keyAim();
      for (const c of running.current) c.stop();
      running.current = [
        animate(slope, aim.slope, springs.glide),
        animate(leanMV, aim.lean, springs.glide),
      ];
    }
  };

  const tape = pigment("--warn", 0.9, 0.035);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="wash board"
      aria-label={`${label}, ${pairName}`}
      aria-describedby={`${uid}-keys`}
      tabIndex={disabled ? -1 : 0}
      {...drag}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (keys.current.size === 0) return;
        keys.current.clear();
        settleBoard();
      }}
      className={cn(
        "group/graded-wash relative isolate h-52 w-full touch-none overflow-clip rounded-3 border border-hairline bg-surface-2 select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{ perspective: 900 }}
    >
      <motion.div
        className="absolute inset-2.5 shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent),0_6px_18px_color-mix(in_oklab,black_12%,transparent)]"
        style={{ rotateX, rotateY, backgroundColor: PAPER }}
      >
        {/* The server's still: a finished wash, until the first one is laid. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            started && "opacity-0",
          )}
          style={{
            backgroundImage: `linear-gradient(to bottom, transparent 0 5%, color-mix(in oklab, ${pair[0]} 78%, ${PAPER}) 5.5%, color-mix(in oklab, ${pair[0]} 50%, color-mix(in oklab, ${pair[1]} 50%, ${PAPER})) 50%, color-mix(in oklab, ${pair[1]} 72%, ${PAPER}) 88%, color-mix(in oklab, ${pair[1]} 92%, black) 89.5%, transparent 90.5%)`,
          }}
        />
        <motion.canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full",
            !started && "opacity-0",
          )}
          style={started ? { opacity: fade } : undefined}
        />
        {[
          "-top-1 -left-3 rotate-[-38deg]",
          "-top-1 -right-3 rotate-[38deg]",
          "-bottom-1 -left-3 rotate-[38deg]",
          "-right-3 -bottom-1 rotate-[-38deg]",
        ].map((at) => (
          <span
            key={at}
            aria-hidden
            className={cn(
              "pointer-events-none absolute h-3.5 w-10 opacity-85 shadow-[0_1px_1px_color-mix(in_oklab,black_10%,transparent)]",
              at,
            )}
            style={{ backgroundColor: tape }}
          />
        ))}
      </motion.div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[pair[0], pair[1], PAPER].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={`${uid}-keys`} className="sr-only">
        Drag, or hold the arrow keys, to tilt the board: sideways leans it, up
        and down change the slope. Enter lays a new wash.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
