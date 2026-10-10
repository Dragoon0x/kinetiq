"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PollenFlowPalette = "pollen" | "dusk" | "sea" | "ink";

export type PollenFlowProps = {
  /** The content on top of the current: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many specks fill a 760 by 232 box, 50 to 5000; larger and smaller boxes scale it by area. @default 1600 */
  count?: number;
  /** How long the fading trails run behind the specks, 0 (bare specks) to 1. @default 0.5 */
  trail?: number;
  /** The specks' colours: a named palette, or up to three CSS colours. @default "pollen" */
  colors?: PollenFlowPalette | (string & {}) | readonly string[];
  /** How fast the breeze blows, 0 (still air) to 2. @default 0.6 */
  speed?: number;
  /** The size of an eddy in the air, px. @default 170 */
  scale?: number;
  /** How much the air swirls on top of the steady breeze, 0 (a straight current) to 1. @default 0.55 */
  turbulence?: number;
  /** Where the breeze blows, degrees anticlockwise from rightward. @default -8 */
  wind?: number;
  /** The specks' size, px. @default 1.6 */
  size?: number;
  /** The air eddies round the pointer and keyboard focus, and a press shakes pollen loose. @default true */
  interactive?: boolean;
  /** How hard the hand turns the air, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand's eddy reaches, px. @default 110 */
  radius?: number;
  /** Hold the air still: the specks stop where they are. @default false */
  paused?: boolean;
  /** Seeds the specks and the air, so two currents never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) turning the air. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus shakes pollen loose. */
  onShake?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const PALETTES: Record<PollenFlowPalette, readonly string[]> = {
  pollen: [
    "var(--warn)",
    "oklch(from var(--warn) l c calc(h - 24))",
    "oklch(from var(--warn) l calc(c * 0.45) calc(h + 22))",
  ],
  dusk: [
    "oklch(from var(--danger) l calc(c * 0.7) calc(h - 14))",
    "var(--accent-bright)",
    "var(--warn)",
  ],
  sea: [
    "var(--signal)",
    "var(--accent-bright)",
    "oklch(from var(--signal) l calc(c * 0.4) calc(h + 40))",
  ],
  ink: ["var(--foreground)", "var(--muted-foreground)", "var(--accent-bright)"],
};

/** The box `count` is quoted for; other boxes scale it by area. */
const BASE_AREA = 760 * 232;
const MAX_SPECKS = 6000;
/** Trail points kept per speck, and how often one is laid down, s. */
const HISTORY = 10;
const SAMPLE_MIN = 0.08;
const SAMPLE_MAX = 0.11;
/** The flow is evaluated on this grid, px, and sampled between. */
const CELL = 20;
/** A speck catches up with the air over this long, s. */
const INERTIA = 0.25;
/** The breeze at speed 1, px/s. */
const BREEZE = 34;
/** The hand's eddy at full strength, px/s. */
const EDDY = 140;
/** A shake's specks glow and fade into the current over about two seconds. */
const GLOW_FADE = 0.7;
/** Still (paused or reduced motion), a press's glow only fades: about a second. */
const STILL_FADE = 0.3;
const SHAKE = 80;
const STEP = 1 / 120;
/** The eddy's place follows on glide, its strength comes and goes on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** Size classes give the cloud depth: small specks sit back and dim. */
const SIZES = [0.7, 1, 1.45] as const;
const DEPTH = [0.5, 0.78, 1] as const;

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

/** Smooth value noise over x, y and time, in -1..1. Allocates nothing per call. */
function valueNoise(seed: number) {
  const salt = (Math.imul(Math.round(seed) | 0, 0x9e3779b1) ^ 0x85ebca6b) | 0;
  const hash = (x: number, y: number, z: number) => {
    let h =
      (Math.imul(x, 374761393) +
        Math.imul(y, 668265263) +
        Math.imul(z, 1440670441) +
        salt) |
      0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  };
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const plane = (xi: number, yi: number, k: number, u: number, v: number) => {
    const a = hash(xi, yi, k);
    const b = hash(xi + 1, yi, k);
    const c = hash(xi, yi + 1, k);
    const d = hash(xi + 1, yi + 1, k);
    const top = a + (b - a) * u;
    return top + (c + (d - c) * u - top) * v;
  };
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = ease(x - xi);
    const v = ease(y - yi);
    const w = ease(z - zi);
    const near = plane(xi, yi, zi, u, v);
    return near + (plane(xi, yi, zi + 1, u, v) - near) * w;
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

const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
const luma = (c: Rgb) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

function paletteOf(colors: PollenFlowProps["colors"]): string[] {
  const list =
    typeof colors === "string"
      ? Object.prototype.hasOwnProperty.call(PALETTES, colors)
        ? PALETTES[colors as PollenFlowPalette]
        : [colors]
      : (colors ?? PALETTES.pollen);
  const picked = list.slice(0, 3).map(String);
  return picked.length > 0 ? picked : [...PALETTES.pollen];
}

type Config = {
  count: number;
  trail: number;
  paintKey: string;
  hues: number;
  speed: number;
  scale: number;
  turbulence: number;
  wind: number;
  size: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onShake: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  shake: (x: number, y: number, amount: number) => void;
  dispose: () => void;
};

type Specks = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  glow: Float32Array;
  hist: Float32Array;
  head: Uint8Array;
  filled: Uint8Array;
  next: Float32Array;
  every: Float32Array;
  kind: Uint8Array;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  let noise = valueNoise(1);
  let rand = lcg(1);
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  const sim = { z: 0, cursor: 0 };
  const paint = { inks: ["rgb(0, 0, 0)"], light: false };
  const flow = {
    cols: 0,
    rows: 0,
    psi: new Float32Array(0),
    u: new Float32Array(0),
    v: new Float32Array(0),
  };
  let specks: Specks | null = null;
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const trailPoints = (c: Config) => Math.round(clamp(c.trail, 0, 1) * HISTORY);

  /** The box's speck count: `count` for the card it is quoted for, by area elsewhere. */
  const countFor = (c: Config) => {
    const area = Math.max(1, size.w * size.h) / BASE_AREA;
    return Math.round(
      Math.min(MAX_SPECKS, clamp(c.count, 50, 5000) * clamp(area, 0.35, 3)),
    );
  };

  const seedSpecks = (c: Config) => {
    const n = countFor(c);
    const s: Specks = {
      n,
      x: new Float32Array(n),
      y: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      glow: new Float32Array(n),
      hist: new Float32Array(n * HISTORY * 2),
      head: new Uint8Array(n),
      filled: new Uint8Array(n),
      next: new Float32Array(n),
      every: new Float32Array(n),
      kind: new Uint8Array(n),
    };
    const r = lcg(c.seed * 17 + 3);
    for (let i = 0; i < n; i += 1) {
      s.x[i] = r() * size.w;
      s.y[i] = r() * size.h;
      s.every[i] = SAMPLE_MIN + (SAMPLE_MAX - SAMPLE_MIN) * r();
      s.next[i] = s.every[i] ?? SAMPLE_MIN;
      // Most specks are mid-sized; a few large ones sit in front.
      const k = r();
      s.kind[i] = k < 0.38 ? 0 : k < 0.86 ? 1 : 2;
    }
    specks = s;
    sim.cursor = 0;
  };

  const layFlow = () => {
    flow.cols = Math.ceil(size.w / CELL) + 5;
    flow.rows = Math.ceil(size.h / CELL) + 5;
    const n = flow.cols * flow.rows;
    flow.psi = new Float32Array(n);
    flow.u = new Float32Array(n);
    flow.v = new Float32Array(n);
  };

  /** The air now: a steady breeze plus the curl of two octaves of noise. */
  const computeFlow = (c: Config) => {
    const { cols, rows, psi, u, v } = flow;
    const breeze = BREEZE * clamp(c.speed, 0, 2);
    const sc = clamp(c.scale, 40, 800);
    // The swirl scales with the breeze, so at speed 0 the air is still.
    const k = clamp(c.turbulence, 0, 1) * breeze * 0.9;
    const z = sim.z;
    for (let j = 0; j < rows; j += 1) {
      const y = (j - 2) * CELL;
      for (let i = 0; i < cols; i += 1) {
        const x = (i - 2) * CELL;
        psi[j * cols + i] =
          k *
          sc *
          (noise(x / sc, y / sc, z) +
            0.5 * noise(x / (sc * 0.5) + 5.2, y / (sc * 0.5) + 1.3, z * 1.7));
      }
    }
    const a = (clamp(c.wind, -360, 360) * Math.PI) / 180;
    const wx = Math.cos(a) * breeze;
    const wy = -Math.sin(a) * breeze;
    for (let j = 1; j < rows - 1; j += 1) {
      for (let i = 1; i < cols - 1; i += 1) {
        const at = j * cols + i;
        // Divergence-free: the velocity is the curl of the stream function,
        // so specks swirl and braid but never pile into knots.
        u[at] =
          wx + ((psi[at + cols] ?? 0) - (psi[at - cols] ?? 0)) / (2 * CELL);
        v[at] = wy - ((psi[at + 1] ?? 0) - (psi[at - 1] ?? 0)) / (2 * CELL);
      }
    }
  };

  const air = { u: 0, v: 0 };
  const sampleAir = (x: number, y: number) => {
    const { cols, rows, u, v } = flow;
    const fx = clamp(x / CELL + 2, 1, cols - 2.001);
    const fy = clamp(y / CELL + 2, 1, rows - 2.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const a = j * cols + i;
    const b = a + cols;
    air.u =
      ((u[a] ?? 0) * (1 - tx) + (u[a + 1] ?? 0) * tx) * (1 - ty) +
      ((u[b] ?? 0) * (1 - tx) + (u[b + 1] ?? 0) * tx) * ty;
    air.v =
      ((v[a] ?? 0) * (1 - tx) + (v[a + 1] ?? 0) * tx) * (1 - ty) +
      ((v[b] ?? 0) * (1 - tx) + (v[b + 1] ?? 0) * tx) * ty;
  };

  /** Adds the hand's eddy at a point: a soft vortex with a calm core and a slight lift. */
  const addEddy = (c: Config, x: number, y: number) => {
    if (hand.amount < 0.001) return;
    const dx = x - hand.px;
    const dy = y - hand.py;
    const d = Math.hypot(dx, dy);
    const r = clamp(c.radius, 20, 600);
    if (d > r * 2.4 || d < 0.001) return;
    const q = d / (r * 0.5);
    const turn =
      EDDY *
      clamp(c.pointerStrength, 0, 1) *
      hand.amount *
      q *
      Math.exp(0.5 * (1 - q * q));
    air.u += ((-dy / d) * 1 + (dx / d) * 0.22) * turn;
    air.v += ((dx / d) * 1 + (dy / d) * 0.22) * turn;
  };

  const resetTrail = (s: Specks, i: number) => {
    s.filled[i] = 0;
    s.next[i] = s.every[i] ?? SAMPLE_MIN;
  };

  /** One step of the hand's springs; true while they are still moving. */
  const settleHand = (c: Config, dt: number) => {
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    const target = want > 0 ? 1 : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (target - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount = clamp(hand.amount + hand.amountV * h, 0, 1.2);
    }
    const moving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!moving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(target - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = target;
      hand.amountV = 0;
    }
    return moving || arriving;
  };

  /** Advances the air and the specks; true while anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const s = specks;
    if (!c || !s) return false;
    const handMoving = settleHand(c, dt);
    const breezing = clamp(c.speed, 0, 2) > 0;
    sim.z += dt * 0.08 * clamp(c.speed, 0, 2);
    computeFlow(c);
    const follow = 1 - Math.exp(-dt / INERTIA);
    const fade = Math.exp(-dt / GLOW_FADE);
    const m = 12;
    const w = size.w;
    const h = size.h;
    let fastest = 0;
    let glowing = false;
    for (let i = 0; i < s.n; i += 1) {
      let x = s.x[i] ?? 0;
      let y = s.y[i] ?? 0;
      sampleAir(x, y);
      addEddy(c, x, y);
      let vx = s.vx[i] ?? 0;
      let vy = s.vy[i] ?? 0;
      vx += (air.u - vx) * follow;
      vy += (air.v - vy) * follow;
      x += vx * dt;
      y += vy * dt;
      fastest = Math.max(fastest, Math.abs(vx) + Math.abs(vy));
      const g = (s.glow[i] ?? 0) * fade;
      s.glow[i] = g < 0.01 ? 0 : g;
      if (g >= 0.01) glowing = true;
      // Out past the edge a speck comes back in on the far side with no
      // trail, so none streaks across the box.
      let wrapped = false;
      if (x < -m) {
        x += w + 2 * m;
        wrapped = true;
      } else if (x > w + m) {
        x -= w + 2 * m;
        wrapped = true;
      }
      if (y < -m) {
        y += h + 2 * m;
        wrapped = true;
      } else if (y > h + m) {
        y -= h + 2 * m;
        wrapped = true;
      }
      s.x[i] = x;
      s.y[i] = y;
      s.vx[i] = vx;
      s.vy[i] = vy;
      if (wrapped) {
        resetTrail(s, i);
        continue;
      }
      const next = (s.next[i] ?? 0) - dt;
      if (next <= 0) {
        const head = ((s.head[i] ?? 0) + 1) % HISTORY;
        const at = (i * HISTORY + head) * 2;
        s.hist[at] = x;
        s.hist[at + 1] = y;
        s.head[i] = head;
        s.filled[i] = Math.min(HISTORY, (s.filled[i] ?? 0) + 1);
        s.next[i] = next + (s.every[i] ?? SAMPLE_MIN);
      } else s.next[i] = next;
    }
    return (
      breezing || handMoving || hand.amount > 0 || fastest > 0.5 || glowing
    );
  };

  /** Fades a shake's glow where the specks stand: paused, or reduced motion. */
  const fadeOnly = (dt: number): boolean => {
    const s = specks;
    if (!s) return false;
    const fade = Math.exp(-dt / STILL_FADE);
    let glowing = false;
    for (let i = 0; i < s.n; i += 1) {
      const g = (s.glow[i] ?? 0) * fade;
      s.glow[i] = g < 0.04 ? 0 : g;
      if (g >= 0.04) glowing = true;
    }
    return glowing;
  };

  /**
   * Reduced motion's long exposure: every speck where the seed puts it, its
   * trail traced back along the still air.
   */
  const expose = () => {
    const c = cfg;
    const s = specks;
    if (!c || !s) return;
    computeFlow(c);
    const back = (SAMPLE_MIN + SAMPLE_MAX) / 2;
    for (let i = 0; i < s.n; i += 1) {
      let x = s.x[i] ?? 0;
      let y = s.y[i] ?? 0;
      s.head[i] = HISTORY - 1;
      s.filled[i] = HISTORY;
      s.next[i] = s.every[i] ?? SAMPLE_MIN;
      s.glow[i] = 0;
      for (let k = 0; k < HISTORY; k += 1) {
        sampleAir(x, y);
        x -= air.u * back;
        y -= air.v * back;
        const at = (i * HISTORY + (HISTORY - 1 - k)) * 2;
        s.hist[at] = x;
        s.hist[at + 1] = y;
      }
    }
  };

  /** Point k of a speck's trail: 0 is the speck, 1 its newest sample. */
  const pointOf = (
    s: Specks,
    i: number,
    k: number,
    out: { x: number; y: number },
  ) => {
    if (k === 0) {
      out.x = s.x[i] ?? 0;
      out.y = s.y[i] ?? 0;
      return;
    }
    const slot = ((s.head[i] ?? 0) - (k - 1) + HISTORY * 2) % HISTORY;
    const at = (i * HISTORY + slot) * 2;
    out.x = s.hist[at] ?? 0;
    out.y = s.hist[at + 1] ?? 0;
  };

  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 0 };

  const draw = () => {
    const c = cfg;
    const s = specks;
    if (!c || !s || !ctx || !visible.current || size.w < 1) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const L = trailPoints(c);
    const hues = Math.max(1, Math.min(3, c.hues));
    const base = clamp(c.size, 0.5, 6);
    const strength = paint.light ? 0.92 : 0.86;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Trails: one stroke per colour and fade band, the oldest band faintest
    // and thinnest; the last band is drawn in part so the tail does not
    // jump as samples are laid down.
    for (let hue = 0; hue < hues; hue += 1) {
      ctx.strokeStyle = paint.inks[hue] ?? paint.inks[0] ?? "rgb(0, 0, 0)";
      for (let b = 0; b < L; b += 1) {
        const t = (b + 0.5) / (L + 0.5);
        ctx.globalAlpha = strength * 0.55 * Math.pow(1 - t, 1.3);
        ctx.lineWidth = base * 0.75 * (1 - 0.55 * (b / Math.max(1, L)));
        ctx.beginPath();
        for (let i = hue; i < s.n; i += hues) {
          if ((s.filled[i] ?? 0) < b + 1) continue;
          pointOf(s, i, b, p0);
          pointOf(s, i, b + 1, p1);
          if (b === L - 1 && (s.filled[i] ?? 0) >= L) {
            const every = s.every[i] ?? SAMPLE_MIN;
            const left = clamp((s.next[i] ?? 0) / every, 0, 1);
            p1.x = p0.x + (p1.x - p0.x) * left;
            p1.y = p0.y + (p1.y - p0.y) * left;
          }
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      }
    }
    // Heads: one fill per colour and size class.
    for (let hue = 0; hue < hues; hue += 1) {
      ctx.fillStyle = paint.inks[hue] ?? paint.inks[0] ?? "rgb(0, 0, 0)";
      for (let k = 0; k < SIZES.length; k += 1) {
        const r = (base * (SIZES[k] ?? 1)) / 2;
        ctx.globalAlpha = strength * (DEPTH[k] ?? 1);
        ctx.beginPath();
        for (let i = hue; i < s.n; i += hues) {
          if (s.kind[i] !== k || (s.glow[i] ?? 0) > 0) continue;
          const x = s.x[i] ?? 0;
          const y = s.y[i] ?? 0;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    // Shaken specks: larger and brighter at first, each with a soft halo.
    for (let i = 0; i < s.n; i += 1) {
      const g = s.glow[i] ?? 0;
      if (g <= 0) continue;
      const k = s.kind[i] ?? 1;
      const r = ((base * (SIZES[k] ?? 1)) / 2) * (1 + 1.2 * g);
      const x = s.x[i] ?? 0;
      const y = s.y[i] ?? 0;
      ctx.fillStyle = paint.inks[i % hues] ?? paint.inks[0] ?? "rgb(0, 0, 0)";
      if (!paint.light) {
        // A halo only glows on a dark page; on a pale one it reads as a
        // smudge, so there the speck alone is larger and deeper.
        ctx.globalAlpha = 0.12 * g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, strength * (DEPTH[k] ?? 1) + 0.5 * g);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !specks) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = c.motionSafe && !c.paused ? step(dt) : fadeOnly(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !specks)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const colourOf = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(0, 0, 0)";
    };
    paint.light = luma(read(colourOf(0))) > 0.5;
    // Pigment, not text colour: each hue at a fixed lightness per theme, so
    // the pollen reads the same on a pale page as on a dark one.
    const inks: string[] = [];
    for (let k = 0; k < 3; k += 1) {
      inks.push(css(read(colourOf(1 + k * 2 + (paint.light ? 1 : 0)))));
    }
    paint.inks = inks;
  };

  const settleStill = () => {
    const c = cfg;
    if (!c) return;
    if (!c.motionSafe) expose();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && specks) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layFlow();
    computeFlow(c);
    seedSpecks(c);
    settleStill();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        noise = valueNoise(next.seed);
        rand = lcg(next.seed * 29 + 11);
        readColours();
        resize();
        return;
      }
      let reseed = false;
      if (was.seed !== next.seed) {
        noise = valueNoise(next.seed);
        rand = lcg(next.seed * 29 + 11);
        reseed = true;
      }
      if (was.count !== next.count) reseed = true;
      if (was.paintKey !== next.paintKey) readColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (reseed && size.w > 0) seedSpecks(next);
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (
        reseed ||
        was.motionSafe !== next.motionSafe ||
        (!next.motionSafe &&
          (was.scale !== next.scale ||
            was.turbulence !== next.turbulence ||
            was.wind !== next.wind ||
            was.speed !== next.speed))
      ) {
        settleStill();
      }
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
    handTo(x, y, source) {
      const c = cfg;
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (c && (!c.motionSafe || c.paused)) return;
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      kick();
    },
    shake(x, y, amount) {
      const c = cfg;
      const s = specks;
      if (!c || !s || !c.interactive || s.n === 0) return;
      c.onShake();
      if (!c.motionSafe || c.paused) {
        // Nothing travels: the specks round the press brighten where they
        // stand and fade back.
        const reach = clamp(c.radius, 20, 600);
        for (let i = 0; i < s.n; i += 1) {
          const d = Math.hypot((s.x[i] ?? 0) - x, (s.y[i] ?? 0) - y);
          if (d < reach) {
            s.glow[i] = Math.max(s.glow[i] ?? 0, (1 - d / reach) * amount);
          }
        }
        draw();
        kick();
        return;
      }
      // The oldest specks — the cursor walks the field in order, so the one
      // it reaches was reborn longest ago — are shaken loose at the press.
      const n = Math.min(Math.round(SHAKE * amount), Math.floor(s.n / 4));
      for (let k = 0; k < n; k += 1) {
        const i = sim.cursor;
        sim.cursor = (sim.cursor + 1) % s.n;
        const a = rand() * Math.PI * 2;
        const spread = 10 * Math.sqrt(rand());
        const throwSpeed = 120 + 200 * rand();
        s.x[i] = x + Math.cos(a) * spread;
        s.y[i] = y + Math.sin(a) * spread;
        s.vx[i] = Math.cos(a) * throwSpeed;
        s.vy[i] = Math.sin(a) * throwSpeed;
        s.glow[i] = 1;
        resetTrail(s, i);
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background of fine specks carried on a slow breeze, with the content on
 * top in its own layer. The air is a steady current plus the curl of two
 * octaves of noise drifting in time, so specks swirl and braid but never
 * pile into knots; each has a little inertia and leaves a short trail that
 * tapers and fades behind it, and three sizes give the cloud depth.
 *
 * The air eddies round the hand: a soft vortex with a calm core whose place
 * follows on glide and whose strength comes and goes on drift, so specks
 * wheel round the cursor and are let go downstream. A press shakes pollen
 * loose — the oldest specks are reborn at the press in a little cloud,
 * thrown outward, brighter and larger at first, until the air's drag takes
 * them and they fade into the current. Keyboard focus on a control inside
 * brings the eddy there and shakes a smaller cloud from it. Canvas 2D, a few
 * dozen batched strokes a frame, only on screen in a visible page. Under
 * reduced motion the current is a long exposure: a still frame of specks
 * with their trails traced back along the air.
 */
export function PollenFlow({
  children,
  count = 1600,
  trail = 0.5,
  colors = "pollen",
  speed = 0.6,
  scale = 170,
  turbulence = 0.55,
  wind = -8,
  size = 1.6,
  interactive = true,
  pointerStrength = 0.6,
  radius = 110,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onShake,
  className,
}: PollenFlowProps) {
  const motionSafe = useMotionSafe();
  const listKey = typeof colors === "string" ? colors : colors.join("|");
  const palette = React.useMemo(
    () => paletteOf(colors),
    // The list is compared by its contents, not its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey],
  );
  const paints = React.useMemo(() => {
    const out = [
      `color-mix(in oklab, var(--background) 96%, ${palette[0] ?? "var(--warn)"})`,
    ];
    for (let k = 0; k < 3; k += 1) {
      const colour = palette[k % palette.length] ?? "var(--warn)";
      out.push(`oklch(from ${colour} 0.86 calc(c * 0.9) h)`);
      out.push(`oklch(from ${colour} 0.55 c h)`);
    }
    return out;
  }, [palette]);
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onShake });

  const config: Config = {
    count,
    trail,
    paintKey,
    hues: palette.length,
    speed,
    scale,
    turbulence,
    wind,
    size,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onShake: () => report.current.onShake?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onShake };
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
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.shake(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside brings the eddy there and shakes a
  // smaller cloud from it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.shake(at.x, at.y, 0.5);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
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
      onBlur={onBlur}
      className={cn(
        // A sideways drag stirs the air on touch; an upright one scrolls.
        "group/pollen-flow relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: paints[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <StandIn seed={seed} palette={palette} />
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

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The designed still for the server render and the first paint: a seeded
 * scatter of specks with short strokes along the breeze, at a mid lightness
 * that reads on light and dark pages alike.
 */
function StandIn({
  seed,
  palette,
}: {
  seed: number;
  palette: readonly string[];
}) {
  const dots = React.useMemo(() => {
    const rand = lcg(seed * 17 + 3);
    return Array.from({ length: 110 }, (_, i) => {
      const k = rand();
      return {
        x: r3(rand() * 100),
        y: r3(rand() * 100),
        r: k < 0.38 ? 0.6 : k < 0.86 ? 0.85 : 1.2,
        o: r3(0.35 + 0.45 * rand()),
        hue: i % Math.max(1, palette.length),
      };
    });
  }, [seed, palette.length]);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/pollen-flow:opacity-0"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={`${d.x}%`}
          cy={`${d.y}%`}
          r={d.r}
          fill={`oklch(from ${palette[d.hue] ?? "var(--warn)"} 0.7 c h)`}
          fillOpacity={d.o}
        />
      ))}
    </svg>
  );
}
