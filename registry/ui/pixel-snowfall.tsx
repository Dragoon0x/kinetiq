"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PixelSnowfallProps = {
  /** The content in front of the snow: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How hard it snows, 0 (a few flakes) to 1 (a heavy fall), set per area so every size snows alike. @default 0.5 */
  density?: number;
  /** The steady wind, -1 (hard left) to 1 (hard right); gusts ride on it. @default 0.25 */
  wind?: number;
  /** CSS px per pixel of snow, 2 to 6. @default 3 */
  pixel?: number;
  /** How fast the snow falls, 0.25 to 2. @default 1 */
  speed?: number;
  /** How strong the passing gusts are, 0 (steady air) to 1. @default 0.5 */
  gusts?: number;
  /** How many depths of snow fall: 1 (one), 2 (near and middle) or 3 (far, middle, near). @default 3 */
  layers?: number;
  /** How deep the drift along the bottom may bank, 0 (none) to 1. @default 0.5 */
  drift?: number;
  /** How quickly the drift melts back, 0 (it only grows to its limit) to 1. @default 0.4 */
  melt?: number;
  /** The cold tint in the sky, the shadows and the flakes, any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The pointer is a wind source and a press bursts a gust; keyboard focus puffs one from the control. @default true */
  interactive?: boolean;
  /** How hard the hand blows and how strong a gust is, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the snow still in the air; the hand is ignored. @default false */
  paused?: boolean;
  /** Seeds where every flake starts and the drift's first shape. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a press (or keyboard focus) bursts a gust. */
  onGust?: () => void;
  /** Fires when the pointer starts (true) or stops (false) blowing on the snow. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pixel art moves at its own cadence: thirty frames a second. */
const FRAME_MS = 33;
const REFERENCE_AREA = 760 * 208;
const MAX_FLAKES = 1200;
const MAX_SPRAY = 160;
/** Fall speed (CSS px/s) per depth: far, middle, near. */
const FALL = [14, 27, 46] as const;
/** How much of the wind each depth takes, and how quickly. */
const LEAN = [0.35, 0.65, 1] as const;
const INERTIA = [0.9, 0.6, 0.38] as const;
const FLUTTER = [3, 6, 11] as const;
/** Wind at strength 1, CSS px/s. */
const WIND = 48;
/** Snow added to the drift by a landing flake, in cells: middle, near. */
const DEPOSIT = [0.13, 0.22] as const;
/** The hand's reach as a wind source, CSS px. */
const REACH = 92;
/** The gust's reach and its push at peak, CSS px and px/s². */
const GUST_REACH = 130;
const GUST_PUSH = 1500;
/** The gust's push into its spring: peaks near 1 a tenth of a second in. */
const GUST = 26;
const DRIFT_SPRING = springs.drift;
const STEP = 1 / 120;
/** Ordered 4×4 dither, for the sky's pixel-art gradient. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

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

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
/** RGBA bytes as one little-endian word, the way ImageData lays them out. */
const pack = ([r, g, b]: Rgb) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** The tint as a cold pigment at a fixed lightness, the same in either theme. */
const tintOf = (c: string) => `oklch(from ${c} 0.66 calc(c * 0.7) h)`;

type Look = {
  skyTop: Rgb;
  skyLow: Rgb;
  /** Flake colour and its alpha per depth. */
  flake: Rgb;
  alpha: [number, number, number];
  body: Rgb;
  crest: Rgb;
  shade: Rgb;
  /** On a pale page the drift is outlined so it reads. */
  outline: Rgb | null;
};

type Field = {
  w: number;
  h: number;
  dpr: number;
  cell: number;
  cols: number;
  rows: number;
  off: HTMLCanvasElement;
  image: ImageData;
  buf: Uint32Array;
  sky: Uint32Array;
  height: Float32Array;
  /** Per column, the share of the cap it rests at: the dunes an old wind banked. */
  rest: Float32Array;
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  depth: Uint8Array;
  phase: Float32Array;
  pace: Float32Array;
  sx: Float32Array;
  sy: Float32Array;
  svx: Float32Array;
  svy: Float32Array;
  sLive: Uint8Array;
};

type Config = {
  density: number;
  wind: number;
  pixel: number;
  speed: number;
  gusts: number;
  layers: number;
  drift: number;
  melt: number;
  tintKey: string;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onGust: () => void;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, at: number) => void;
  handAway: () => void;
  gust: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let field: Field | null = null;
  let look: Look | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  let rand = lcg(1);
  const read = rgbReader();
  const sim = { t: 0 };
  const hand = { x: 0, y: 0, vx: 0, vy: 0, at: 0, present: false };
  const gustState = { x: 0, v: 0, cx: 0, cy: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const cellOf = (c: Config) => clamp(Math.round(c.pixel), 2, 6);
  const countOf = (c: Config, w: number, h: number) =>
    Math.min(
      MAX_FLAKES,
      Math.round(clamp(c.density, 0, 1) * 560 * ((w * h) / REFERENCE_AREA)),
    );
  /** Which depth a new flake takes, from how many depths fall. */
  const depthFor = (c: Config, r: number) => {
    const layers = clamp(Math.round(c.layers), 1, 3);
    if (layers === 1) return 1;
    if (layers === 2) return r < 0.6 ? 1 : 2;
    return r < 0.5 ? 0 : r < 0.84 ? 1 : 2;
  };
  const capOf = (c: Config, f: Field) => clamp(c.drift, 0, 1) * 0.36 * f.rows;

  const readLook = () => {
    const kids = carriers.children;
    const style = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(0, 0, 0)";
    };
    const bg = read(style(0));
    const fg = read(style(1));
    const tint = read(style(2));
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    if (lum > 0.5) {
      // An overcast day: flakes read dark against the bright sky; the
      // drift is white, outlined in slate, shaded blue in its hollows.
      const slate = mix(fg, tint, 0.35);
      look = {
        skyTop: mix(mix(bg, tint, 0.2), fg, 0.1),
        skyLow: mix(mix(bg, tint, 0.08), fg, 0.03),
        flake: slate,
        alpha: [0.22, 0.48, 0.72],
        body: WHITE,
        crest: mix(WHITE, tint, 0.06),
        shade: mix(WHITE, tint, 0.24),
        outline: mix(slate, WHITE, 0.25),
      };
    } else {
      // A night fall: near-white flakes over a deep sky that lifts a
      // little toward the ground.
      look = {
        skyTop: mix(mix(bg, BLACK, 0.28), tint, 0.05),
        skyLow: mix(bg, tint, 0.16),
        flake: mix(WHITE, tint, 0.1),
        alpha: [0.38, 0.72, 1],
        body: mix(mix(WHITE, tint, 0.16), bg, 0.12),
        crest: mix(WHITE, tint, 0.05),
        shade: mix(mix(WHITE, tint, 0.38), bg, 0.3),
        outline: null,
      };
    }
  };

  /** The sky as a dithered gradient, laid out once per size and theme. */
  const paintSky = () => {
    const f = field;
    const lk = look;
    if (!f || !lk) return;
    const levels = 7;
    const tones: number[] = [];
    for (let k = 0; k <= levels; k += 1)
      tones.push(pack(mix(lk.skyTop, lk.skyLow, k / levels)));
    for (let y = 0; y < f.rows; y += 1) {
      const t = (y / Math.max(1, f.rows - 1)) * levels;
      for (let x = 0; x < f.cols; x += 1) {
        const d = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
        const k = Math.min(levels, Math.floor(t + d));
        f.sky[y * f.cols + x] = tones[k] ?? 0;
      }
    }
  };

  const spawn = (c: Config, f: Field, i: number, anywhere: boolean) => {
    const d = depthFor(c, rand());
    f.depth[i] = d;
    f.x[i] = rand() * f.cols;
    f.y[i] = anywhere ? rand() * f.rows : -1 - rand() * 6;
    f.pace[i] = 0.78 + rand() * 0.44;
    f.vx[i] = 0;
    f.vy[i] = ((FALL[d] ?? 20) * (f.pace[i] ?? 1)) / f.cell;
    f.phase[i] = rand() * Math.PI * 2;
  };

  /** A drift banked by an old wind: seeded dunes at about their resting depth. */
  const layDrift = (c: Config, f: Field) => {
    const cap = capOf(c, f);
    // The same dunes the server's still frame draws.
    const r = lcg(c.seed * 41 + 3);
    const p1 = r() * Math.PI * 2;
    const p2 = r() * Math.PI * 2;
    for (let x = 0; x < f.cols; x += 1) {
      const u = (x / f.cols) * Math.PI * 2;
      const dune = clamp(
        0.55 + 0.3 * Math.sin(u * 1.3 + p1) + 0.15 * Math.sin(u * 3.1 + p2),
        0.15,
        1,
      );
      f.rest[x] = dune * 0.75;
      f.height[x] = cap * dune * 0.75;
    }
  };

  const build = (c: Config, w: number, h: number, dpr: number) => {
    const cell = cellOf(c);
    const cols = Math.max(1, Math.ceil(w / cell));
    const rows = Math.max(1, Math.ceil(h / cell));
    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const image = new ImageData(cols, rows);
    const n = countOf(c, w, h);
    field = {
      w,
      h,
      dpr,
      cell,
      cols,
      rows,
      off,
      image,
      buf: new Uint32Array(image.data.buffer),
      sky: new Uint32Array(cols * rows),
      height: new Float32Array(cols),
      rest: new Float32Array(cols),
      n,
      x: new Float32Array(MAX_FLAKES),
      y: new Float32Array(MAX_FLAKES),
      vx: new Float32Array(MAX_FLAKES),
      vy: new Float32Array(MAX_FLAKES),
      depth: new Uint8Array(MAX_FLAKES),
      phase: new Float32Array(MAX_FLAKES),
      pace: new Float32Array(MAX_FLAKES),
      sx: new Float32Array(MAX_SPRAY),
      sy: new Float32Array(MAX_SPRAY),
      svx: new Float32Array(MAX_SPRAY),
      svy: new Float32Array(MAX_SPRAY),
      sLive: new Uint8Array(MAX_SPRAY),
    };
    rand = lcg(c.seed * 41 + 3);
    for (let i = 0; i < MAX_FLAKES; i += 1) spawn(c, field, i, true);
    layDrift(c, field);
    sim.t = rand() * 60;
  };

  /** The wind at the current moment, CSS px/s, before the hand. */
  const windNow = (c: Config) => {
    const steady = clamp(c.wind, -1, 1);
    const dir = steady < 0 ? -1 : 1;
    const t = sim.t;
    const swell = Math.max(0, Math.sin(t * 0.23 + 1.7));
    const g =
      clamp(c.gusts, 0, 1) *
      (1.3 * swell * swell * swell * swell + 0.22 * Math.sin(t * 0.11 + 0.4));
    return (steady + dir * g) * WIND;
  };

  const land = (c: Config, f: Field, col: number, amount: number) => {
    const cap = capOf(c, f);
    const k = ((Math.floor(col) % f.cols) + f.cols) % f.cols;
    const was = f.height[k] ?? 0;
    f.height[k] = Math.min(cap, was + amount);
    // A column more than a cell above its neighbour sheds into it, so the
    // drift banks into rounded dunes rather than spikes.
    for (let pass = 0; pass < 3; pass += 1) {
      for (let j = Math.max(1, k - 6); j < Math.min(f.cols, k + 7); j += 1) {
        const a = f.height[j - 1] ?? 0;
        const b = f.height[j] ?? 0;
        const diff = b - a;
        if (Math.abs(diff) > 1) {
          const move = (Math.abs(diff) - 1) / 2;
          if (diff > 0) {
            f.height[j] = b - move;
            f.height[j - 1] = a + move;
          } else {
            f.height[j] = b + move;
            f.height[j - 1] = a - move;
          }
        }
      }
    }
  };

  /** One step of the fall, dt seconds. */
  const advance = (c: Config, dt: number) => {
    const f = field;
    if (!f) return;
    sim.t += dt;
    const P = f.cell;
    const rate = clamp(c.speed, 0.25, 2);
    const base = windNow(c);
    const s = clamp(c.pointerStrength, 0, 1);
    const reach = REACH / P;
    const hx = hand.x / P;
    const hy = hand.y / P;
    const blowing = hand.present && c.interactive;
    const hv = Math.min(900, Math.hypot(hand.vx, hand.vy));
    // A hand blows a little at rest and harder the faster it moves.
    const breath = blowing ? (16 + hv * 0.42) * s : 0;
    // Gust: a critically damped impulse on the drift spring constants.
    gustState.v +=
      ((-DRIFT_SPRING.stiffness * gustState.x -
        DRIFT_SPRING.damping * gustState.v) /
        DRIFT_SPRING.mass) *
      dt;
    gustState.x += gustState.v * dt;
    if (Math.abs(gustState.x) < 0.002 && Math.abs(gustState.v) < 0.02) {
      gustState.x = 0;
      gustState.v = 0;
    }
    const gust = Math.max(0, gustState.x);
    const gReach = GUST_REACH / P;
    const gx = gustState.cx / P;
    const gy = gustState.cy / P;
    const tilt = rate;
    for (let i = 0; i < f.n; i += 1) {
      const d = f.depth[i] ?? 0;
      let x = f.x[i] ?? 0;
      let y = f.y[i] ?? 0;
      let vx = f.vx[i] ?? 0;
      let vy = f.vy[i] ?? 0;
      const pace = f.pace[i] ?? 1;
      const flutter =
        (FLUTTER[d] ?? 5) *
        Math.sin((f.phase[i] ?? 0) + sim.t * (1.3 + 0.5 * pace));
      const wantX = (base * (LEAN[d] ?? 1) * tilt + flutter) / P;
      const wantY = ((FALL[d] ?? 20) * pace * rate) / P;
      const k = 1 - Math.exp(-dt / (INERTIA[d] ?? 0.6));
      vx += (wantX - vx) * k;
      vy += (wantY - vy) * k;
      const near = (LEAN[d] ?? 1) * 0.6 + 0.4;
      if (breath > 0) {
        const dx = x - hx;
        const dy = y - hy;
        const r = Math.hypot(dx, dy);
        if (r < reach && r > 0.01) {
          const fall = 1 - r / reach;
          const push = ((breath * fall * fall) / P) * near;
          vx +=
            ((dx / r) * push + (hand.vx / P) * 0.5 * fall * fall * s) * dt * 6;
          vy +=
            ((dy / r) * push + (hand.vy / P) * 0.5 * fall * fall * s) * dt * 6;
        }
      }
      if (gust > 0) {
        const dx = x - gx;
        const dy = y - gy;
        const r = Math.hypot(dx, dy);
        if (r < gReach && r > 0.01) {
          const fall = 1 - r / gReach;
          const push = ((GUST_PUSH * gust * fall * fall) / P) * near;
          vx += (dx / r) * push * dt;
          vy += (dy / r) * push * dt;
        }
      }
      const cap = 420 / P;
      vx = clamp(vx, -cap, cap);
      vy = clamp(vy, -cap, cap);
      x += vx * dt;
      y += vy * dt;
      if (x < 0) x += f.cols;
      else if (x >= f.cols) x -= f.cols;
      f.x[i] = x;
      f.y[i] = y;
      f.vx[i] = vx;
      f.vy[i] = vy;
      if (y < -12) {
        // Blown out over the top: it comes back down somewhere else.
        spawn(c, f, i, false);
        continue;
      }
      const col = Math.floor(x);
      const ground = f.rows - (f.height[col] ?? 0);
      if (d > 0 && y >= ground - 0.5) {
        land(c, f, col, DEPOSIT[d - 1] ?? 0.3);
        spawn(c, f, i, false);
      } else if (y >= f.rows + 1) {
        spawn(c, f, i, false);
      }
    }
    // Spray from a scoured drift arcs out and lands again.
    const g = 170 / P;
    for (let j = 0; j < MAX_SPRAY; j += 1) {
      if (!f.sLive[j]) continue;
      let vx = f.svx[j] ?? 0;
      let vy = f.svy[j] ?? 0;
      vy += g * dt;
      vx *= Math.exp(-dt * 1.2);
      let x = (f.sx[j] ?? 0) + vx * dt;
      const y = (f.sy[j] ?? 0) + vy * dt;
      if (x < 0) x += f.cols;
      else if (x >= f.cols) x -= f.cols;
      f.sx[j] = x;
      f.sy[j] = y;
      f.svx[j] = vx;
      f.svy[j] = vy;
      const col = Math.floor(x);
      if (vy > 0 && y >= f.rows - (f.height[col] ?? 0) - 0.5) {
        land(c, f, col, 0.45);
        f.sLive[j] = 0;
      }
    }
    // The drift melts back, faster where it stands above its dunes, so it
    // keeps the shape the old wind gave it while the fall feeds it.
    const m = clamp(c.melt, 0, 1);
    const cap = Math.max(1, capOf(c, f));
    for (let x = 0; x < f.cols; x += 1) {
      const hgt = f.height[x] ?? 0;
      const over = Math.max(
        0,
        hgt / (cap * Math.max(0.1, f.rest[x] ?? 0.5)) - 0.5,
      );
      const loss = m * (0.004 + 0.06 * over);
      f.height[x] = Math.max(0, Math.min(cap, hgt - loss * dt));
    }
  };

  const blend = (f: Field, k: number, rgb: Rgb, a: number) => {
    const was = f.buf[k] ?? 0;
    const r0 = was & 255;
    const g0 = (was >>> 8) & 255;
    const b0 = (was >>> 16) & 255;
    const r = Math.round(r0 + (rgb[0] - r0) * a);
    const g = Math.round(g0 + (rgb[1] - g0) * a);
    const b = Math.round(b0 + (rgb[2] - b0) * a);
    f.buf[k] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  };
  const plot = (f: Field, x: number, y: number, rgb: Rgb, a: number) => {
    if (y < 0 || y >= f.rows) return;
    const xi = ((x % f.cols) + f.cols) % f.cols;
    blend(f, y * f.cols + xi, rgb, a);
  };

  const draw = () => {
    const f = field;
    const lk = look;
    const ctx = canvas.getContext("2d");
    if (!f || !lk || !ctx || !visible.current) return;
    f.buf.set(f.sky);
    const flake = lk.flake;
    // Far flakes first, behind the drift.
    for (let i = 0; i < f.n; i += 1) {
      if (f.depth[i] !== 0) continue;
      plot(
        f,
        Math.floor(f.x[i] ?? 0),
        Math.floor(f.y[i] ?? 0),
        flake,
        lk.alpha[0],
      );
    }
    const body = pack(lk.body);
    for (let x = 0; x < f.cols; x += 1) {
      const hgt = f.height[x] ?? 0;
      if (hgt <= 0.02) continue;
      const top = f.rows - hgt;
      const first = Math.floor(top);
      const partial = 1 - (top - first);
      const left = f.height[x - 1] ?? hgt;
      const right = f.height[x + 1] ?? hgt;
      // A hollow sits lower than its neighbours: blue shade gathers in it.
      const hollow = clamp((left + right) / 2 - hgt + 0.4, 0, 2);
      for (let y = Math.max(0, first); y < f.rows; y += 1) {
        const k = y * f.cols + x;
        if (y === first) {
          // On a pale page the crest is a whole cell of slate once the
          // column is half a cell over it, so the outline never breaks up.
          if (lk.outline) {
            if (partial > 0.45) blend(f, k, lk.outline, 0.8);
          } else blend(f, k, lk.crest, partial);
          continue;
        }
        const below = y - first;
        if (lk.outline && below === 1 && partial <= 0.45) {
          blend(f, k, lk.outline, 0.8);
          continue;
        }
        f.buf[k] = body;
        const dither = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
        if (below <= 1 && lk.outline === null) blend(f, k, lk.crest, 0.6);
        else if (below > 3 + hollow * 2 && dither < 0.16 + hollow * 0.16)
          blend(f, k, lk.shade, 0.7);
      }
    }
    for (let i = 0; i < f.n; i += 1) {
      const d = f.depth[i] ?? 0;
      if (d === 0) continue;
      const x = Math.floor(f.x[i] ?? 0);
      const y = Math.floor(f.y[i] ?? 0);
      if (d === 1) plot(f, x, y, flake, lk.alpha[1]);
      else {
        // A near flake is a small cross with a bright heart.
        plot(f, x, y, flake, lk.alpha[2]);
        const arm = lk.alpha[2] * 0.42;
        plot(f, x - 1, y, flake, arm);
        plot(f, x + 1, y, flake, arm);
        plot(f, x, y - 1, flake, arm);
        plot(f, x, y + 1, flake, arm);
      }
    }
    for (let j = 0; j < MAX_SPRAY; j += 1) {
      if (!f.sLive[j]) continue;
      plot(
        f,
        Math.floor(f.sx[j] ?? 0),
        Math.floor(f.sy[j] ?? 0),
        flake,
        lk.alpha[1],
      );
    }
    const off = f.off.getContext("2d");
    if (!off) return;
    off.putImageData(f.image, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const scale = f.cell * f.dpr;
    ctx.drawImage(
      f.off,
      0,
      0,
      f.cols,
      f.rows,
      0,
      0,
      f.cols * scale,
      f.rows * scale,
    );
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !field) {
      last = 0;
      return;
    }
    if (!c.motionSafe || c.paused) {
      last = 0;
      draw();
      return;
    }
    if (last && now - last < FRAME_MS - 2) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.066, (now - last) / 1000) : FRAME_MS / 1000;
    last = now;
    // Fixed small steps, so a strong gust never tunnels a flake through
    // the drift.
    let left = dt;
    while (left > 1e-4) {
      const h = Math.min(STEP * 2, left);
      advance(c, h);
      left -= h;
    }
    hand.vx *= Math.exp(-dt / 0.12);
    hand.vy *= Math.exp(-dt / 0.12);
    draw();
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !field)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const sizeCanvas = (f: Field) => {
    canvas.width = Math.max(1, Math.round(f.w * f.dpr));
    canvas.height = Math.max(1, Math.round(f.h * f.dpr));
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    const was = field;
    if (
      was &&
      was.w === w &&
      was.h === h &&
      was.dpr === dpr &&
      was.cell === cellOf(c)
    )
      return;
    build(c, w, h, dpr);
    if (field) sizeCanvas(field);
    if (!look) readLook();
    paintSky();
    draw();
    kick();
  };

  const readColours = () => {
    if (!cfg) return;
    readLook();
    paintSky();
    draw();
  };

  /** Reduced motion: a still moment, moved on by `seconds` without drawing between. */
  const fastForward = (c: Config, seconds: number) => {
    let left = seconds;
    while (left > 1e-4) {
      const h = Math.min(1 / 30, left);
      advance(c, h);
      left -= h;
    }
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        resize();
        return;
      }
      if (!field) {
        resize();
        return;
      }
      if (
        was.pixel !== next.pixel ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.layers !== next.layers
      ) {
        field = null;
        resize();
      } else {
        const n = countOf(next, field.w, field.h);
        if (n > field.n) {
          for (let i = field.n; i < n; i += 1) spawn(next, field, i, true);
        }
        field.n = n;
      }
      if (was.tintKey !== next.tintKey) readColours();
      if (!next.interactive && hand.present) {
        hand.present = false;
        setActive(false);
      }
      draw();
      kick();
    },
    resize,
    readColours,
    wake() {
      draw();
      kick();
    },
    handTo(x, y, at) {
      const c = cfg;
      if (!c || !c.interactive || c.paused) return;
      const dt = hand.at ? Math.max(8, at - hand.at) / 1000 : 0;
      if (dt > 0 && hand.present) {
        const k = Math.min(1, dt / 0.05);
        hand.vx += ((x - hand.x) / dt - hand.vx) * k;
        hand.vy += ((y - hand.y) / dt - hand.vy) * k;
      }
      hand.x = x;
      hand.y = y;
      hand.at = at;
      hand.present = true;
      setActive(true);
    },
    handAway() {
      hand.present = false;
      hand.vx = 0;
      hand.vy = 0;
      hand.at = 0;
      setActive(false);
    },
    gust(x, y, strength) {
      const c = cfg;
      const f = field;
      if (!c || !f || !c.interactive || c.paused) return;
      c.onGust();
      const s =
        clamp(strength, 0, 1) * (0.45 + 0.55 * clamp(c.pointerStrength, 0, 1));
      gustState.cx = x;
      gustState.cy = y;
      // Near the drift, the gust scours a crater and throws its snow up.
      const col = Math.floor(x / f.cell);
      const surface = f.rows - (f.height[col] ?? 0);
      const above = surface - y / f.cell;
      if (above < 68 / f.cell) {
        const r = Math.max(3, Math.round(30 / f.cell));
        let sprayed = 0;
        for (let dx = -r; dx <= r; dx += 1) {
          const k = col + dx;
          if (k < 0 || k >= f.cols) continue;
          const shape = 1 - (dx / (r + 1)) * (dx / (r + 1));
          const hgt = f.height[k] ?? 0;
          const take = Math.min(hgt, hgt * 0.75 * shape * s + 0.6 * shape * s);
          f.height[k] = hgt - take;
          // Every half cell of snow lifted goes up as a flake of spray.
          let pieces = Math.round(take * 2);
          while (pieces > 0 && sprayed < MAX_SPRAY) {
            let slot = -1;
            for (let j = 0; j < MAX_SPRAY; j += 1) {
              if (!f.sLive[j]) {
                slot = j;
                break;
              }
            }
            if (slot < 0) break;
            f.sLive[slot] = 1;
            f.sx[slot] = k + rand();
            f.sy[slot] = f.rows - (f.height[k] ?? 0) - 1 - rand() * 2;
            const out = dx === 0 ? (rand() - 0.5) * 2 : Math.sign(dx);
            f.svx[slot] = (out * (40 + rand() * 110) * s) / f.cell;
            f.svy[slot] = (-(70 + rand() * 120) * s) / f.cell;
            pieces -= 1;
            sprayed += 1;
          }
        }
      }
      if (!c.motionSafe) {
        // The gust's end state at once: the crater, and the snow moved on.
        gustState.x = 0;
        gustState.v = 0;
        fastForward(c, 1.6);
        draw();
        return;
      }
      gustState.v += GUST * s;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      field = null;
    },
  };
}

/**
 * A background of snow drawn as pixel art: one cell is `pixel` CSS px,
 * scaled up crisp, falling at three depths over a dithered sky — far flakes
 * single dim cells, middle ones single bright cells, near ones small crosses
 * that sway hardest in the wind — and settling into a drift along the bottom
 * edge. A column more than a cell above its neighbour sheds into it, so the
 * drift banks into rounded dunes, and every column slowly melts, so it finds
 * its own depth. The wind is steady with seeded gusts passing through.
 *
 * The pointer is a wind source: air blows outward from it, harder the faster
 * it moves. A press bursts a gust — a critically damped impulse on the
 * `springs.drift` constants — that throws the flakes near it outward and,
 * near the drift, scours a crater whose snow sprays up and lands again;
 * keyboard focus on a control inside puffs a softer gust from it. Canvas 2D
 * into a buffer of cells, thirty frames a second while on screen in a
 * visible page, nothing allocated per frame. Under reduced motion it is one
 * still winter frame, and a press shows the gust's end state at once.
 */
export function PixelSnowfall({
  children,
  density = 0.5,
  wind = 0.25,
  pixel = 3,
  speed = 1,
  gusts = 0.5,
  layers = 3,
  drift = 0.5,
  melt = 0.4,
  color = "var(--accent-bright)",
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onGust,
  onActiveChange,
  className,
}: PixelSnowfallProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => ["var(--background)", "var(--foreground)", tintOf(color)],
    [color],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportGust = React.useRef(onGust);
  const reportActive = React.useRef(onActiveChange);

  const config: Config = {
    density,
    wind,
    pixel,
    speed,
    gusts,
    layers,
    drift,
    melt,
    tintKey: color,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onGust: () => reportGust.current?.(),
    onActive: (a) => reportActive.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportGust.current = onGust;
    reportActive.current = onActiveChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, event.timeStamp);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, event.timeStamp);
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the bare snow gusts.
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.gust(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway();
  };

  // Keyboard focus on a control inside puffs a gust from it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.gust(at.x, at.y, 0.55);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        // A finger blows the snow as it moves across; an upright swipe is
        // the page's.
        "group/pixel-snowfall relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip transition-opacity duration-300 group-data-live/pixel-snowfall:opacity-0"
        style={skyStandIn(paints[2] ?? "gray", density, pixel, seed)}
      >
        <div
          className="absolute inset-x-0 bottom-0"
          style={driftStandIn(drift, pixel, seed)}
        />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * The designed still frame for the server render and the first paint: a
 * banded sky and seeded pixel flakes, each a single gradient cell.
 */
function skyStandIn(
  tint: string,
  density: number,
  pixel: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 7 + 2);
  const p = clamp(Math.round(pixel), 2, 6);
  const n = Math.round(14 + clamp(density, 0, 1) * 46);
  const flake = "color-mix(in oklab, var(--foreground) 62%, var(--background))";
  const images: string[] = [];
  const sizes: string[] = [];
  const spots: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const near = rand() > 0.72;
    images.push(`linear-gradient(${flake}, ${flake})`);
    sizes.push(`${near ? p * 2 : p}px ${near ? p * 2 : p}px`);
    spots.push(`${pct(rand())} ${pct(rand() * 0.86)}`);
  }
  const bands: string[] = [];
  for (let k = 0; k < 6; k += 1) {
    const mixAmt = Math.round(4 + k * 2.4);
    bands.push(
      `color-mix(in oklab, var(--background) ${100 - mixAmt}%, ${tint}) ${pct(k / 6)} ${pct((k + 1) / 6)}`,
    );
  }
  images.push(`linear-gradient(to bottom, ${bands.join(", ")})`);
  sizes.push("100% 100%");
  spots.push("0 0");
  return {
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: spots.join(", "),
    backgroundRepeat: "no-repeat",
  };
}

/** The drift as a stepped silhouette, a pixel per step. */
function driftStandIn(
  drift: number,
  pixel: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 41 + 3);
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const steps = 48;
  const points: string[] = ["0% 100%"];
  for (let i = 0; i <= steps; i += 1) {
    const u = (i / steps) * Math.PI * 2;
    const dune = clamp(
      0.55 + 0.3 * Math.sin(u * 1.3 + p1) + 0.15 * Math.sin(u * 3.1 + p2),
      0.15,
      1,
    );
    const top = Math.round((1 - dune) * 1000) / 10;
    const x0 = Math.round((i / (steps + 1)) * 1000) / 10;
    const x1 = Math.round(((i + 1) / (steps + 1)) * 1000) / 10;
    points.push(`${x0}% ${top}%`, `${x1}% ${top}%`);
  }
  points.push("100% 100%");
  // The silhouette steps in whole pixels of snow, like the drift itself.
  const p = clamp(Math.round(pixel), 2, 6);
  const height = Math.round(clamp(drift, 0, 1) * 0.36 * 0.75 * 1000) / 10;
  return {
    height: `calc(${height}% + ${p}px)`,
    backgroundColor: "color-mix(in oklab, var(--background) 22%, white)",
    clipPath: `polygon(${points.join(", ")})`,
  };
}
