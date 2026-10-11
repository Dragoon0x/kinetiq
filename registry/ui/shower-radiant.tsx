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
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ShowerTint = "ice" | "green" | "gold" | "rose";

export type ShowerRadiantProps = {
  /** A headline over the sky; it takes no pointer input. The root sets `--shower-ink` and `--shower-faint` for text on the night. */
  children?: React.ReactNode;
  /** The shower's zenithal hourly rate at its peak: meteors an hour with the radiant overhead. @default 100 */
  rate?: number;
  /** How long a meteor's glowing train lingers and how far it spreads, 0 to 1. @default 0.5 */
  train?: number;
  /** The heads' colour and the trains' glow. @default "ice" */
  tint?: ShowerTint;
  /** A head colour of your own, any CSS colour; overrides `tint`. */
  headColor?: string;
  /** Controlled hour of the night, as a clock hour (1.5 is 01:30). */
  hour?: number;
  /** Initial hour when uncontrolled. @default 1 */
  defaultHour?: number;
  /** Fires from the drag or key that moved the hour, with the new clock hour in quarter hours. */
  onHourChange?: (hour: number) => void;
  /** When the scale starts, as a clock hour. @default 20 */
  startHour?: number;
  /** When it ends, as a clock hour (the next morning if smaller than `startHour`). @default 5 */
  endHour?: number;
  /** When the shower peaks, as a clock hour. @default 2.5 */
  peakHour?: number;
  /** How often a slow, bright fireball comes through, 0 (never) to 1. @default 0.3 */
  fireballs?: number;
  /** How fast meteors cross the sky, 0.5 to 2. @default 1 */
  speed?: number;
  /** Mark the radiant with a faint ring. @default true */
  showRadiant?: boolean;
  /** Hold the sky still. @default false */
  paused?: boolean;
  /** Seeds the stars, the trees and every meteor. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The hour scale's accessible name. @default "Hour of the night" */
  label?: string;
  /** Shows the sky but the scale takes no input. @default false */
  disabled?: boolean;
  /** Sizes the frame; the scale takes 76px of it. @default "h-[30rem] w-full" */
  className?: string;
};

const TINTS: Record<ShowerTint, { head: string; train: string }> = {
  ice: {
    head: "color-mix(in oklab, var(--accent-bright) 22%, white)",
    train: "oklch(from var(--success) 0.78 0.1 h)",
  },
  green: {
    head: "oklch(from var(--success) 0.92 0.11 h)",
    train: "oklch(from var(--success) 0.75 0.13 h)",
  },
  gold: {
    head: "oklch(from var(--warn) 0.93 0.1 h)",
    train: "oklch(from var(--warn) 0.72 0.1 h)",
  },
  rose: {
    head: "oklch(from var(--danger) 0.88 0.09 h)",
    train: "oklch(from var(--danger) 0.66 0.11 h)",
  },
};
// The night is fixed art: dark on a light page and a dark one alike.
const ZENITH = "color-mix(in oklab, var(--accent) 16%, black)";
const HORIZON = "color-mix(in oklab, var(--accent-bright) 26%, black)";
const TREES = "color-mix(in oklab, var(--accent) 7%, black)";
const GALAXY = "color-mix(in oklab, var(--accent-bright) 30%, white)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;
const SCALE_H = 76;
const MAX_METEORS = 24;
const MAX_TRAINS = 28;
const MAX_FRAGS = 160;
const STEP_H = 0.25;

type RGB = [number, number, number];

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): RGB => {
    if (!ctx) return [0.9, 0.95, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const rgba = (c: RGB, a = 1) =>
  `rgb(${Math.round(clamp01(c[0]) * 255)} ${Math.round(clamp01(c[1]) * 255)} ${Math.round(clamp01(c[2]) * 255)} / ${Math.round(clamp01(a) * 1000) / 1000})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** The night's shape: how long it is, where the peak sits, all in hours from the start. */
type Night = { start: number; length: number; peak: number };

const nightOf = (start: number, end: number, peak: number): Night => {
  const length = (end - start + 24) % 24 || 24;
  return { start, length, peak: clamp((peak - start + 24) % 24, 0, length) };
};

/** The radiant's altitude in degrees: it rises through the night. */
const altitudeAt = (night: Night, n: number) =>
  8 + 58 * clamp01(n / night.length);

/** Meteors an hour an observer would count: the rate, the shower's activity and the radiant's height. */
const visibleRate = (rate: number, night: Night, n: number) => {
  const activity = 0.14 + 0.86 * Math.exp(-(((n - night.peak) / 2.1) ** 2));
  const alt = (altitudeAt(night, n) * Math.PI) / 180;
  return Math.max(0, rate * activity * Math.sin(alt));
};

/** Where the radiant sits in the sky box, as fractions of its width and height. */
const radiantAt = (night: Night, n: number) => {
  const f = clamp01(n / night.length);
  const alt = altitudeAt(night, n);
  return {
    x: 0.3 + 0.28 * f,
    y: 0.84 - (0.84 - 0.13) * (alt / 66),
  };
};

/**
 * What an observer would count at a clock hour: meteors an hour and the
 * radiant's altitude in degrees, for the same night the component draws.
 */
export function showerReading(
  rate: number,
  hour: number,
  night: { startHour?: number; endHour?: number; peakHour?: number } = {},
): { perHour: number; altitude: number } {
  const shape = nightOf(
    night.startHour ?? 20,
    night.endHour ?? 5,
    night.peakHour ?? 2.5,
  );
  const n = clamp((((hour - shape.start) % 24) + 24) % 24, 0, shape.length);
  return {
    perHour: Math.round(visibleRate(Math.max(0, rate), shape, n)),
    altitude: Math.round(altitudeAt(shape, n)),
  };
}

const clockText = (hour: number) => {
  const minutes = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

type Config = {
  rate: number;
  train: number;
  fireballs: number;
  speed: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
  night: Night;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  redraw: () => void;
  dispose: () => void;
};

function createEngine(
  box: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  position: MotionValue<number>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let drawn = 0;
  let disposed = false;
  let visible = false;
  let rand = lcg(5);

  let zenith: RGB = [0.02, 0.03, 0.07];
  let horizon: RGB = [0.07, 0.09, 0.18];
  let trees: RGB = [0.01, 0.012, 0.03];
  let galaxy: RGB = [0.8, 0.85, 1];
  let head: RGB = [0.9, 0.95, 1];
  let trainRGB: RGB = [0.5, 0.9, 0.7];
  let bg: HTMLCanvasElement | null = null;
  let fg: HTMLCanvasElement | null = null;
  let streak: HTMLCanvasElement | null = null;
  let band: HTMLCanvasElement | null = null;
  let glow: HTMLCanvasElement | null = null;
  let treeTop = 0;
  // Twinkling stars, drawn live over the pre-rendered field.
  const TW = 26;
  const twX = new Float32Array(TW);
  const twY = new Float32Array(TW);
  const twP = new Float32Array(TW);
  const twR = new Float32Array(TW);

  const mOn = new Uint8Array(MAX_METEORS);
  const mX = new Float32Array(MAX_METEORS);
  const mY = new Float32Array(MAX_METEORS);
  const mUx = new Float32Array(MAX_METEORS);
  const mUy = new Float32Array(MAX_METEORS);
  const mLen = new Float32Array(MAX_METEORS);
  const mSpeed = new Float32Array(MAX_METEORS);
  const mT = new Float32Array(MAX_METEORS);
  const mPeak = new Float32Array(MAX_METEORS);
  const mFire = new Uint8Array(MAX_METEORS);
  const mFlare = new Float32Array(MAX_METEORS);

  const tOn = new Uint8Array(MAX_TRAINS);
  const tX0 = new Float32Array(MAX_TRAINS);
  const tY0 = new Float32Array(MAX_TRAINS);
  const tX1 = new Float32Array(MAX_TRAINS);
  const tY1 = new Float32Array(MAX_TRAINS);
  const tAge = new Float32Array(MAX_TRAINS);
  const tLife = new Float32Array(MAX_TRAINS);
  const tPeak = new Float32Array(MAX_TRAINS);
  const tBend = new Float32Array(MAX_TRAINS);
  let tNext = 0;

  const fOn = new Uint8Array(MAX_FRAGS);
  const fX = new Float32Array(MAX_FRAGS);
  const fY = new Float32Array(MAX_FRAGS);
  const fVx = new Float32Array(MAX_FRAGS);
  const fVy = new Float32Array(MAX_FRAGS);
  const fAge = new Float32Array(MAX_FRAGS);
  const fLife = new Float32Array(MAX_FRAGS);
  let fNext = 0;
  /** The sky's lift from a fireball, decaying. */
  let skyLift = 0;

  const skyScale = () => Math.max(W, H) * 0.85;

  const readColours = () => {
    const kids = carriers.children;
    const at = (i: number, fallback: RGB): RGB => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : fallback;
    };
    zenith = at(0, zenith);
    horizon = at(1, horizon);
    trees = at(2, trees);
    galaxy = at(3, galaxy);
    head = at(4, head);
    trainRGB = at(5, trainRGB);
    bg = null;
    fg = null;
    streak = null;
    glow = null;
    draw();
  };

  /** A streak lying along +x: faint tail at 0, a hot head at the right end. */
  const buildSprites = () => {
    const s = document.createElement("canvas");
    s.width = 256;
    s.height = 16;
    const g = s.getContext("2d");
    if (g) {
      const along = g.createLinearGradient(0, 0, 256, 0);
      along.addColorStop(0, rgba(head, 0));
      along.addColorStop(0.7, rgba(mix(head, [1, 1, 1], 0.2), 0.45));
      along.addColorStop(1, rgba(mix(head, [1, 1, 1], 0.6), 1));
      g.fillStyle = along;
      g.fillRect(0, 0, 256, 16);
      // A soft cross-section: the streak's core is a hairline, its glow wider.
      g.globalCompositeOperation = "destination-in";
      const across = g.createLinearGradient(0, 0, 0, 16);
      across.addColorStop(0, "rgb(0 0 0 / 0)");
      across.addColorStop(0.42, "rgb(0 0 0 / 0.5)");
      across.addColorStop(0.5, "rgb(0 0 0 / 1)");
      across.addColorStop(0.58, "rgb(0 0 0 / 0.5)");
      across.addColorStop(1, "rgb(0 0 0 / 0)");
      g.fillStyle = across;
      g.fillRect(0, 0, 256, 16);
    }
    streak = s;
    const b = document.createElement("canvas");
    b.width = 128;
    b.height = 16;
    const bgc = b.getContext("2d");
    if (bgc) {
      const along = bgc.createLinearGradient(0, 0, 128, 0);
      along.addColorStop(0, rgba(trainRGB, 0));
      along.addColorStop(0.25, rgba(trainRGB, 0.8));
      along.addColorStop(0.75, rgba(trainRGB, 0.8));
      along.addColorStop(1, rgba(trainRGB, 0));
      bgc.fillStyle = along;
      bgc.fillRect(0, 0, 128, 16);
      bgc.globalCompositeOperation = "destination-in";
      const across = bgc.createLinearGradient(0, 0, 0, 16);
      across.addColorStop(0, "rgb(0 0 0 / 0)");
      across.addColorStop(0.5, "rgb(0 0 0 / 1)");
      across.addColorStop(1, "rgb(0 0 0 / 0)");
      bgc.fillStyle = across;
      bgc.fillRect(0, 0, 128, 16);
    }
    band = b;
    const gl = document.createElement("canvas");
    gl.width = 64;
    gl.height = 64;
    const gg = gl.getContext("2d");
    if (gg) {
      const grad = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, rgba([1, 1, 1], 1));
      grad.addColorStop(0.2, rgba(head, 0.6));
      grad.addColorStop(1, rgba(head, 0));
      gg.fillStyle = grad;
      gg.fillRect(0, 0, 64, 64);
    }
    glow = gl;
  };

  /** The sky, its stars and the galaxy; and on its own layer, the trees. */
  const buildBackdrop = () => {
    if (W < 1 || H < 1) return;
    const r = lcg((cfg?.seed ?? 5) * 17 + 3);
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    bg = document.createElement("canvas");
    bg.width = pw;
    bg.height = ph;
    fg = document.createElement("canvas");
    fg.width = pw;
    fg.height = ph;
    const g = bg.getContext("2d");
    const f = fg.getContext("2d");
    if (!g || !f) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    treeTop = H - Math.max(26, H * 0.1);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgba(mix(zenith, [0, 0, 0], 0.3)));
    sky.addColorStop(0.6, rgba(zenith));
    sky.addColorStop(1, rgba(horizon));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // The galaxy: a broad, faint band of soft light leaning across the sky.
    if (glow) {
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 70; i += 1) {
        const t = r();
        const x = lerp(-0.1, 1.1, t) * W + (r() - 0.5) * W * 0.12;
        const y = lerp(0.95, -0.05, t) * H * 0.85 + (r() - 0.5) * H * 0.1;
        const s = (0.08 + r() * 0.16) * Math.max(W, H);
        g.globalAlpha = 0.018 + r() * 0.028;
        g.drawImage(glow, x - s / 2, y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
    const stars = Math.round((W * H) / 900);
    for (let i = 0; i < stars; i += 1) {
      const x = r() * W;
      const y = Math.pow(r(), 1.2) * treeTop;
      const s = 0.45 + r() * r() * 1.3;
      const warm = r();
      const tint: RGB =
        warm < 0.12 ? [1, 0.85, 0.7] : warm > 0.9 ? [0.75, 0.85, 1] : [1, 1, 1];
      g.fillStyle = rgba(mix(tint, galaxy, 0.2), 0.2 + r() * r() * 0.75);
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < TW; i += 1) {
      twX[i] = r() * W;
      twY[i] = Math.pow(r(), 1.3) * treeTop * 0.95;
      twP[i] = r() * TAU;
      twR[i] = 0.8 + r() * 2.4;
    }
    // Conifers: a row of spires, taller and darker toward the front.
    for (let layer = 0; layer < 2; layer += 1) {
      const front = layer === 1;
      f.fillStyle = rgba(front ? trees : mix(trees, horizon, 0.35));
      f.beginPath();
      f.moveTo(0, H);
      let x = -6;
      const baseY = front ? H : H - 4;
      f.lineTo(x, baseY - 8);
      while (x < W + 10) {
        const w = (front ? 9 : 6) + r() * (front ? 12 : 8);
        const h =
          (front ? 0.55 : 0.35) * (H - treeTop) +
          r() * (H - treeTop) * (front ? 0.55 : 0.4);
        const top = baseY - (H - treeTop) * (front ? 0.22 : 0.3) - h;
        // A spire with two shoulders of branches.
        f.lineTo(x + w * 0.2, top + h * 0.62);
        f.lineTo(x + w * 0.32, top + h * 0.6);
        f.lineTo(x + w * 0.42, top + h * 0.3);
        f.lineTo(x + w * 0.5, top);
        f.lineTo(x + w * 0.58, top + h * 0.3);
        f.lineTo(x + w * 0.68, top + h * 0.6);
        f.lineTo(x + w * 0.8, top + h * 0.62);
        f.lineTo(x + w, baseY - (H - treeTop) * (front ? 0.22 : 0.3));
        x += w * (0.7 + r() * 0.5);
      }
      f.lineTo(W + 10, H);
      f.closePath();
      f.fill();
    }
  };

  const measure = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w < 1 || h < 1) return;
    const next = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    if (
      w === W &&
      h === H &&
      next === dpr &&
      canvas.width === Math.round(w * next)
    )
      return;
    W = w;
    H = h;
    dpr = next;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    bg = null;
    fg = null;
  };

  const spawn = (fire: boolean) => {
    const c = cfg;
    if (!c) return;
    let m = -1;
    for (let i = 0; i < MAX_METEORS; i += 1) {
      if (!mOn[i]) {
        m = i;
        break;
      }
    }
    if (m < 0) return;
    const n = position.get();
    const rp = radiantAt(c.night, n);
    const S = skyScale();
    const a = rand() * TAU;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const d0 = S * (0.05 + 0.48 * Math.pow(rand(), 0.8));
    // Near the radiant a meteor comes almost straight at you: short.
    const near = clamp(d0 / (S * 0.45), 0.22, 1);
    let len = S * (0.07 + 0.3 * rand()) * near;
    let v = S * (0.95 + 0.8 * rand()) * clamp(c.speed, 0.5, 2);
    if (fire) {
      len *= 1.9;
      v *= 0.55;
    }
    mOn[m] = 1;
    mX[m] = rp.x * W + ux * d0;
    mY[m] = rp.y * H + uy * d0;
    mUx[m] = ux;
    mUy[m] = uy;
    mLen[m] = len;
    mSpeed[m] = v;
    mT[m] = 0;
    mPeak[m] = fire ? 1 : 0.35 + 0.65 * Math.pow(rand(), 1.6);
    mFire[m] = fire ? 1 : 0;
    mFlare[m] = !fire && rand() < 0.18 ? 0.6 + rand() * 0.6 : 0;
  };

  const leaveTrain = (m: number) => {
    const c = cfg;
    if (!c) return;
    const fire = Boolean(mFire[m]);
    const persist = lerp(0.12, 2.6, clamp01(c.train));
    const life = persist * (fire ? 3.2 : 0.5 + (mPeak[m] ?? 0.5) * 0.9);
    if (life < 0.08) return;
    const i = tNext;
    tNext = (tNext + 1) % MAX_TRAINS;
    const len = mLen[m] ?? 0;
    tOn[i] = 1;
    tX0[i] = mX[m] ?? 0;
    tY0[i] = mY[m] ?? 0;
    tX1[i] = (mX[m] ?? 0) + (mUx[m] ?? 0) * len;
    tY1[i] = (mY[m] ?? 0) + (mUy[m] ?? 0) * len;
    tAge[i] = 0;
    tLife[i] = life;
    tPeak[i] = (fire ? 0.75 : 0.42) * (mPeak[m] ?? 0.5);
    tBend[i] = fire ? (rand() - 0.5) * 2 : 0;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const n = position.get();
    // A time-lapse: one second here is a minute of the night.
    const perSecond = visibleRate(c.rate, c.night, n) / 60;
    if (rand() < perSecond * dt) {
      spawn(rand() < 0.015 + 0.09 * clamp01(c.fireballs));
    }
    skyLift = Math.max(0, skyLift - dt * 1.6);
    for (let m = 0; m < MAX_METEORS; m += 1) {
      if (!mOn[m]) continue;
      const t = (mT[m] ?? 0) + dt;
      mT[m] = t;
      const dur = (mLen[m] ?? 1) / Math.max(1, mSpeed[m] ?? 1);
      if (mFire[m]) {
        skyLift = Math.max(skyLift, Math.sin(Math.PI * clamp01(t / dur)) * 0.9);
        // Fragments peel off the head and fall behind it.
        if (rand() < dt * 40) {
          const k = fNext;
          fNext = (fNext + 1) % MAX_FRAGS;
          const s = (mSpeed[m] ?? 0) * Math.min(t, dur);
          fOn[k] = 1;
          fX[k] = (mX[m] ?? 0) + (mUx[m] ?? 0) * s;
          fY[k] = (mY[m] ?? 0) + (mUy[m] ?? 0) * s;
          fVx[k] = (mUx[m] ?? 0) * (mSpeed[m] ?? 0) * 0.5 + (rand() - 0.5) * 30;
          fVy[k] = (mUy[m] ?? 0) * (mSpeed[m] ?? 0) * 0.5 + (rand() - 0.5) * 30;
          fAge[k] = 0;
          fLife[k] = 0.25 + rand() * 0.35;
        }
      }
      if (t >= dur) {
        mOn[m] = 0;
        leaveTrain(m);
      }
    }
    for (let i = 0; i < MAX_TRAINS; i += 1) {
      if (!tOn[i]) continue;
      tAge[i] = (tAge[i] ?? 0) + dt;
      if ((tAge[i] ?? 0) >= (tLife[i] ?? 0)) tOn[i] = 0;
    }
    for (let k = 0; k < MAX_FRAGS; k += 1) {
      if (!fOn[k]) continue;
      fAge[k] = (fAge[k] ?? 0) + dt;
      if ((fAge[k] ?? 0) >= (fLife[k] ?? 0)) {
        fOn[k] = 0;
        continue;
      }
      const drag = Math.exp(-3 * dt);
      fVx[k] = (fVx[k] ?? 0) * drag;
      fVy[k] = (fVy[k] ?? 0) * drag;
      fX[k] = (fX[k] ?? 0) + (fVx[k] ?? 0) * dt;
      fY[k] = (fY[k] ?? 0) + (fVy[k] ?? 0) * dt;
    }
  };

  /** One streak with its head at (x, y), lying back along (ux, uy). */
  const drawStreak = (
    x: number,
    y: number,
    ux: number,
    uy: number,
    len: number,
    width: number,
    alpha: number,
  ) => {
    if (!ctx || !streak || len < 0.5 || alpha <= 0.003) return;
    // The sprite's +x is the direction of travel; scale it to the length.
    ctx.setTransform(ux * dpr, uy * dpr, -uy * dpr, ux * dpr, x * dpr, y * dpr);
    ctx.globalAlpha = clamp01(alpha);
    ctx.drawImage(streak, -len, -width / 2, len, width);
  };

  const drawBand = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    alpha: number,
  ) => {
    if (!band || !ctx || alpha <= 0.003) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const ux = dx / len;
    const uy = dy / len;
    ctx.setTransform(
      ux * dpr,
      uy * dpr,
      -uy * dpr,
      ux * dpr,
      x0 * dpr,
      y0 * dpr,
    );
    ctx.globalAlpha = clamp01(alpha);
    ctx.drawImage(band, 0, -width / 2, len, width);
  };

  function draw() {
    const c = cfg;
    if (!ctx || !c || W < 1 || H < 1) return;
    if (!streak || !glow) buildSprites();
    if (!bg || !fg) buildBackdrop();
    drawn += 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    if (skyLift > 0.01) {
      ctx.globalAlpha = 0.07 * skyLift;
      ctx.fillStyle = rgba(mix(head, horizon, 0.4), 1);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgb(255 255 255)";
    for (let i = 0; i < TW; i += 1) {
      const a = c.motionSafe
        ? 0.25 +
          0.55 * (0.5 + 0.5 * Math.sin(clock * (twR[i] ?? 1) + (twP[i] ?? 0)))
        : 0.6;
      ctx.globalAlpha = a;
      ctx.fillRect((twX[i] ?? 0) - 0.7, (twY[i] ?? 0) - 0.7, 1.4, 1.4);
    }

    if (!c.motionSafe) {
      drawComposite();
    } else {
      const persist = lerp(0.12, 2.6, clamp01(c.train));
      for (let i = 0; i < MAX_TRAINS; i += 1) {
        if (!tOn[i]) continue;
        const f = (tAge[i] ?? 0) / Math.max(0.01, tLife[i] ?? 1);
        const a = (tPeak[i] ?? 0) * Math.pow(1 - f, 1.6);
        const width = 1.6 + (tAge[i] ?? 0) * (2 + persist * 1.4);
        // The upper wind drifts and bends a long train.
        const bend = (tBend[i] ?? 0) * (tAge[i] ?? 0) * 6;
        const mx = ((tX0[i] ?? 0) + (tX1[i] ?? 0)) / 2 + bend;
        const my = ((tY0[i] ?? 0) + (tY1[i] ?? 0)) / 2 - bend * 0.4;
        if (bend !== 0) {
          drawBand(tX0[i] ?? 0, tY0[i] ?? 0, mx, my, width, a);
          drawBand(mx, my, tX1[i] ?? 0, tY1[i] ?? 0, width, a);
        } else {
          drawBand(
            tX0[i] ?? 0,
            tY0[i] ?? 0,
            tX1[i] ?? 0,
            tY1[i] ?? 0,
            width,
            a,
          );
        }
      }
      for (let m = 0; m < MAX_METEORS; m += 1) {
        if (!mOn[m]) continue;
        const len = mLen[m] ?? 0;
        const v = mSpeed[m] ?? 1;
        const dur = len / Math.max(1, v);
        const t = mT[m] ?? 0;
        const tau = clamp01(t / dur);
        const fire = Boolean(mFire[m]);
        let b = Math.pow(Math.sin(Math.PI * tau), 0.7) * (mPeak[m] ?? 0.5);
        const flare = mFlare[m] ?? 0;
        if (flare > 0) b += flare * Math.exp(-(((tau - 0.78) / 0.08) ** 2));
        const s = Math.min(len, v * t);
        const hx = (mX[m] ?? 0) + (mUx[m] ?? 0) * s;
        const hy = (mY[m] ?? 0) + (mUy[m] ?? 0) * s;
        const tail = Math.min(s, len * (fire ? 0.5 : 0.38));
        drawStreak(hx, hy, mUx[m] ?? 1, mUy[m] ?? 0, tail, fire ? 7 : 4, b);
        if (glow) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const g = (fire ? 22 : 7) * (0.6 + b * 0.6);
          ctx.globalAlpha = clamp01(b * (fire ? 0.95 : 0.7));
          ctx.drawImage(glow, hx - g / 2, hy - g / 2, g, g);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgba(mix(head, [1, 0.8, 0.5], 0.4), 1);
      for (let k = 0; k < MAX_FRAGS; k += 1) {
        if (!fOn[k]) continue;
        ctx.globalAlpha = clamp01(1 - (fAge[k] ?? 0) / (fLife[k] ?? 1)) * 0.9;
        ctx.fillRect((fX[k] ?? 0) - 0.7, (fY[k] ?? 0) - 0.7, 1.4, 1.4);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (fg) ctx.drawImage(fg, 0, 0);
  }

  /** Reduced motion: a long exposure, every streak of a few minutes at this hour laid down at once. */
  function drawComposite() {
    const c = cfg;
    if (!c || !ctx) return;
    const n = position.get();
    const rp = radiantAt(c.night, n);
    const count = clamp(
      Math.round(visibleRate(c.rate, c.night, n) * 0.3) + 6,
      6,
      60,
    );
    const r = lcg(c.seed * 131 + 9);
    const S = skyScale();
    for (let i = 0; i < count; i += 1) {
      const a = r() * TAU;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const d0 = S * (0.05 + 0.48 * Math.pow(r(), 0.8));
      const near = clamp(d0 / (S * 0.45), 0.22, 1);
      const len = S * (0.07 + 0.3 * r()) * near;
      const peak = 0.35 + 0.65 * Math.pow(r(), 1.6);
      const x0 = rp.x * W + ux * d0;
      const y0 = rp.y * H + uy * d0;
      drawBand(
        x0,
        y0,
        x0 + ux * len,
        y0 + uy * len,
        3 + 4 * clamp01(c.train),
        peak * 0.25 * clamp01(c.train + 0.2),
      );
      drawStreak(x0 + ux * len, y0 + uy * len, ux, uy, len, 3.5, peak * 0.85);
    }
  }

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (
      disposed ||
      !c ||
      !visible ||
      document.hidden ||
      c.paused ||
      !c.motionSafe
    ) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    step(dt);
    let busy = skyLift > 0;
    for (let m = 0; m < MAX_METEORS && !busy; m += 1) if (mOn[m]) busy = true;
    for (let i = 0; i < MAX_TRAINS && !busy; i += 1) if (tOn[i]) busy = true;
    // With nothing in the air only the twinkle changes: half the frames do.
    if (busy || drawn % 2 === 0) draw();
    else drawn += 1;
    frame = window.requestAnimationFrame(tick);
  };

  function kick() {
    if (
      disposed ||
      frame ||
      !visible ||
      document.hidden ||
      cfg?.paused ||
      !cfg?.motionSafe
    )
      return;
    frame = window.requestAnimationFrame(tick);
  }

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.seed !== next.seed) {
        rand = lcg(next.seed);
        bg = null;
        fg = null;
      }
      if (!was || was.dpr !== next.dpr) measure();
      if (was && was.motionSafe !== next.motionSafe) {
        mOn.fill(0);
        tOn.fill(0);
        fOn.fill(0);
        skyLift = 0;
      }
      if (!was || was.colourKey !== next.colourKey) readColours();
      draw();
      kick();
    },
    resize() {
      measure();
      draw();
      kick();
    },
    readColours,
    setVisible(v) {
      visible = v;
      if (v) {
        measure();
        draw();
        kick();
      }
    },
    redraw() {
      if (visible && (!cfg?.motionSafe || cfg.paused)) draw();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      bg = null;
      fg = null;
      streak = null;
      band = null;
      glow = null;
    },
  };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A meteor shower over a dark treeline. Meteors appear at random round a
 * radiant point and streak straight outward along fanning rays: short near
 * the radiant, where they come almost at you, long far from it; each is
 * brief and bright, with a hot head, a tapering streak and a train of glow
 * left along its path that lingers and spreads. Now and then a fireball:
 * slower and brighter, shedding fragments, lifting the sky, its train
 * bending in the upper wind.
 *
 * Under the sky an hour scale is a slider over the night, with the shower's
 * activity drawn above its ticks. Dragging moves through the night 1:1: the
 * radiant climbs as the hours pass and the visible rate — the shower's rate,
 * its activity and the radiant's altitude together — climbs toward the peak;
 * a release projects the throw and glides to a quarter hour on springs.glide.
 * Arrow keys step a quarter hour, Page keys an hour. Canvas 2D with the sky
 * and trees pre-rendered; the loop runs only on screen. Under reduced motion
 * the sky is a still long exposure of streaks fanning from the radiant,
 * redrawn as the hour changes.
 */
export function ShowerRadiant({
  children,
  rate = 100,
  train = 0.5,
  tint = "ice",
  headColor,
  hour,
  defaultHour = 1,
  onHourChange,
  startHour = 20,
  endHour = 5,
  peakHour = 2.5,
  fireballs = 0.3,
  speed = 1,
  showRadiant = true,
  paused = false,
  seed = 5,
  dpr = 2,
  label = "Hour of the night",
  disabled = false,
  className,
}: ShowerRadiantProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const night = React.useMemo(
    () => nightOf(startHour, endHour, peakHour),
    [startHour, endHour, peakHour],
  );
  const toNight = React.useCallback(
    (h: number) => clamp((((h - night.start) % 24) + 24) % 24, 0, night.length),
    [night],
  );
  const toClock = React.useCallback(
    (n: number) => Number(((((night.start + n) % 24) + 24) % 24).toFixed(2)),
    [night],
  );
  const [own, setOwn] = React.useState(() => toNight(defaultHour));
  const value = hour === undefined ? own : toNight(hour);

  const skyRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const position = useMotionValue(value);
  const glide = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const reported = React.useRef(value);

  const tints = TINTS[tint] ?? TINTS.ice;
  const head = headColor ?? tints.head;
  const config: Config = {
    rate: Math.max(0, rate),
    train,
    fireballs,
    speed,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey: `${head}|${tints.train}`,
    night,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const sky = skyRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!sky || !canvas || !carriers) return;
    const e = createEngine(sky, canvas, carriers, position);
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(sky);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(sky);
    const onVisibility = () => {
      if (!document.hidden) e.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = position.on("change", () => e.redraw());
    return () => {
      unsubscribe();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [position]);

  // Where the running glide is heading: a host answering with the same
  // value must not restart it and throw away the release velocity.
  const heading = React.useRef<number | null>(null);
  const settleTo = React.useCallback(
    (to: number, velocity = 0) => {
      glide.current?.stop();
      heading.current = to;
      if (!motionSafe) {
        position.jump(to);
        return;
      }
      glide.current = animate(position, to, { ...springs.glide, velocity });
    },
    [motionSafe, position],
  );

  // A host that moves `hour` gets the same glide a key would.
  React.useEffect(() => {
    if (dragging.current) return;
    if (heading.current !== null && Math.abs(heading.current - value) < 1e-6)
      return;
    if (Math.abs(position.get() - value) > 1e-3) settleTo(value);
  }, [value, settleTo, position]);

  React.useEffect(() => () => glide.current?.stop(), []);

  const commit = (n: number, velocity = 0) => {
    const snapped = clamp(Math.round(n / STEP_H) * STEP_H, 0, night.length);
    settleTo(snapped, velocity);
    if (hour === undefined) setOwn(snapped);
    if (snapped !== reported.current) {
      reported.current = snapped;
      onHourChange?.(toClock(snapped));
    }
  };

  const width = () => trackRef.current?.getBoundingClientRect().width ?? 1;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      glide.current?.stop();
      dragFrom.current = position.get();
    },
    onMove: ({ offset }) => {
      const perPx = night.length / Math.max(1, width());
      const raw = dragFrom.current + offset.x * perPx;
      position.set(
        Number(
          rubberClamp(raw, 0, night.length, night.length * 0.25).toFixed(4),
        ),
      );
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const perPx = night.length / Math.max(1, width());
      const landing = project(position.get(), velocity.x * perPx, 0.99);
      commit(landing, velocity.x * perPx);
    },
    onCancel: () => {
      dragging.current = false;
      settleTo(value);
    },
    onTap: (event) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      commit(((event.clientX - r.left) / Math.max(1, r.width)) * night.length);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 1 : STEP_H;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = value + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = value - step;
    else if (event.key === "PageUp") next = value + 1;
    else if (event.key === "PageDown") next = value - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = night.length;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  // Everything the scale shows rides the position directly, frame by frame.
  const thumbLeft = useTransform(
    position,
    (n) => `${((clamp(n, 0, night.length) / night.length) * 100).toFixed(3)}%`,
  );
  const clockMV = useTransform(position, (n) =>
    clockText(night.start + clamp(n, 0, night.length)),
  );
  const rateMV = useTransform(
    position,
    (n) =>
      `about ${Math.round(visibleRate(Math.max(0, rate), night, clamp(n, 0, night.length)))} an hour`,
  );
  const radiantX = useTransform(
    position,
    (n) => `${(radiantAt(night, n).x * 100).toFixed(3)}%`,
  );
  const radiantY = useTransform(
    position,
    (n) => `${(radiantAt(night, n).y * 100).toFixed(3)}%`,
  );

  // The activity curve: 48 samples across the night, in a 100 × 24 box.
  const curve = React.useMemo(() => {
    const max = Math.max(
      1,
      ...Array.from({ length: 49 }, (_, i) =>
        visibleRate(100, night, (i / 48) * night.length),
      ),
    );
    const pts = Array.from({ length: 49 }, (_, i) => {
      const n = (i / 48) * night.length;
      const y = 22 - (visibleRate(100, night, n) / max) * 18;
      return `${(i * (100 / 48)).toFixed(3)} ${y.toFixed(3)}`;
    });
    return {
      line: `M ${pts.join(" L ")}`,
      area: `M 0 24 L ${pts.join(" L ")} L 100 24 Z`,
    };
  }, [night]);

  const hours = Array.from(
    { length: Math.floor(night.length) + 1 },
    (_, i) => i,
  );
  const reading = Math.round(visibleRate(Math.max(0, rate), night, value));
  const altitude = Math.round(altitudeAt(night, value));
  const valueText = `${clockText(night.start + value)}, about ${reading} meteors an hour, radiant ${altitude} degrees up`;

  return (
    <div
      className={cn(
        "relative isolate flex h-[30rem] w-full flex-col overflow-clip rounded-3 select-none",
        className,
      )}
      style={
        {
          backgroundColor: TREES,
          "--shower-ink": "color-mix(in oklab, var(--accent-bright) 8%, white)",
          "--shower-faint":
            "color-mix(in oklab, var(--accent-bright) 35%, white 55%)",
          "--shower-tint": head,
        } as React.CSSProperties
      }
    >
      <div
        ref={skyRef}
        role="img"
        aria-label={`A meteor shower over a treeline at ${clockText(night.start + value)}: about ${reading} meteors an hour, fanning out from a radiant ${altitude} degrees up.`}
        className="relative flex-1 overflow-clip"
        style={{
          backgroundColor: ZENITH,
          backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${ZENITH}, black 30%), ${ZENITH} 60%, ${HORIZON})`,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        {showRadiant ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -mt-3 -ml-3 size-6 rounded-full border border-dashed border-(--shower-faint) opacity-50"
            style={{ left: radiantX, top: radiantY }}
          />
        ) : null}
      </div>
      {children ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          {children}
        </div>
      ) : null}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={Math.round(night.length * 60)}
        aria-valuenow={Math.round(value * 60)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative mx-3 mb-2 shrink-0 cursor-ew-resize touch-pan-y rounded-2",
          disabled && "cursor-default opacity-60",
          FOCUS_RING,
        )}
        style={{ height: SCALE_H - 8 }}
      >
        <div className="flex items-baseline justify-between gap-2 pt-1.5 font-mono text-[10px] tracking-[0.06em] tabular-nums">
          <motion.span className="text-(--shower-ink)">{clockMV}</motion.span>
          <motion.span className="truncate text-(--shower-faint)">
            {rateMV}
          </motion.span>
        </div>
        <svg
          aria-hidden
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-5 h-6 w-full"
        >
          <path
            d={curve.area}
            className="fill-(--shower-tint)"
            opacity={0.16}
          />
          <path
            d={curve.line}
            className="fill-none stroke-(--shower-tint)"
            strokeOpacity={0.55}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          aria-hidden
          className="absolute inset-x-0 top-11 h-px bg-(--shower-faint) opacity-30"
        />
        {hours.map((i) => {
          const left = `${((i / night.length) * 100).toFixed(3)}%`;
          const major = i % 2 === 0;
          const edge =
            i === 0
              ? "translate-x-0"
              : i === hours.length - 1 && i === night.length
                ? "-translate-x-full"
                : "-translate-x-1/2";
          return (
            <React.Fragment key={i}>
              <span
                aria-hidden
                className="absolute top-11 h-1.5 w-px bg-(--shower-faint) opacity-60"
                style={{ left }}
              />
              {major ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[3.25rem] font-mono text-[10px] leading-none text-(--shower-faint) tabular-nums",
                    edge,
                  )}
                  style={{ left }}
                >
                  {String(Math.round((night.start + i) % 24)).padStart(2, "0")}
                </span>
              ) : null}
            </React.Fragment>
          );
        })}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-5 h-7 w-0"
          style={{ left: thumbLeft }}
        >
          <span className="absolute top-0 left-[-0.5px] h-full w-px bg-(--shower-ink)" />
          <span className="absolute bottom-[-3px] left-[-4px] size-2 rounded-full bg-(--shower-ink) shadow-[0_0_0_3px_color-mix(in_oklab,var(--shower-tint)_35%,transparent)]" />
        </motion.span>
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[ZENITH, HORIZON, TREES, GALAXY, head, tints.train].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={hintId} className="sr-only">
        Left and Right move a quarter hour, Shift or Page Up and Page Down an
        hour, Home and End to dusk and dawn.
      </span>
    </div>
  );
}
