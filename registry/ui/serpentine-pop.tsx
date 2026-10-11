"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SerpentinePopPalette = "party" | "sorbet" | "gilt" | "mono";

export type SerpentinePopProps = {
  /** The content the paper falls over (or behind, with `layer="back"`). It stays fully interactive. */
  children?: React.ReactNode;
  /** The paper's colours: pigments at a fixed lightness, so a streamer looks the same on any page. @default "party" */
  palette?: SerpentinePopPalette;
  /** Your own paper colours, any CSS colours (tokens included); replaces `palette`. */
  colors?: string[];
  /** How many streamers a moving pointer throws, at most, per second (1 to 12). @default 5 */
  rate?: number;
  /** How tightly the paper remembers its roll, 0 (straight ribbons) to 1 (tight ringlets). @default 0.6 */
  curl?: number;
  /** Width of the paper strip, px. @default 6 */
  stripWidth?: number;
  /** Length of one streamer unrolled, px. @default 130 */
  streamerLength?: number;
  /** Streamers a popper fires. @default 12 */
  burst?: number;
  /** Paper flecks a popper puffs out with them. @default 36 */
  flecks?: number;
  /** How fast paper falls, 0.5 (floating) to 2 (heavy). @default 1 */
  gravity?: number;
  /** Seconds settled paper lies on the floor before it fades; 0 keeps it until `maxPaper` is reached. @default 10 */
  linger?: number;
  /** Most streamers lying on the floor at once; past it the oldest fade. @default 40 */
  maxPaper?: number;
  /** Curled streamers already lying along the bottom edge at rest. @default 6 */
  scatter?: number;
  /** Draw the paper in front of the content or behind it. @default "front" */
  layer?: "front" | "back";
  /** Hold the paper where it is and stop throwing. @default false */
  paused?: boolean;
  /** Seeds the colours, curls and launch of every streamer. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The popper's accessible name. @default "Party popper" */
  label?: string;
  /** Fires on every popper, with how many have been fired so far. */
  onPop?: (count: number) => void;
  /** A pop and a paper crinkle when a popper fires. Off unless asked for. @default false */
  sound?: boolean;
  /** No streamers, no poppers; the box is plain content and leaves the tab order. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box (it clips the paper). */
  className?: string;
};

const PALETTES: Record<SerpentinePopPalette, readonly string[]> = {
  party: [
    "oklch(from var(--danger) 0.66 calc(c * 0.95) h)",
    "oklch(from var(--warn) 0.84 c h)",
    "oklch(from var(--accent-bright) 0.64 c h)",
    "oklch(from var(--signal) 0.76 calc(c * 0.9) h)",
    "oklch(from var(--danger) 0.8 calc(c * 0.5) calc(h - 18))",
  ],
  sorbet: [
    "oklch(from var(--danger) 0.85 calc(c * 0.38) calc(h - 10))",
    "oklch(from var(--warn) 0.9 calc(c * 0.55) h)",
    "oklch(from var(--accent-bright) 0.84 calc(c * 0.34) h)",
    "oklch(from var(--signal) 0.87 calc(c * 0.42) h)",
  ],
  gilt: [
    "oklch(from var(--warn) 0.78 calc(c * 0.8) calc(h - 6))",
    "oklch(from var(--warn) 0.9 calc(c * 0.32) h)",
    "oklch(from var(--ink-2) 0.8 0.012 h)",
    "oklch(from var(--danger) 0.62 calc(c * 0.5) calc(h + 30))",
  ],
  mono: ["var(--ink)", "var(--ink-2)", "var(--ink-3)", "var(--accent-bright)"],
};

/** Fixed-step physics: integrated at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** Points along one streamer. */
const POINTS = 22;
/** Fall, px/s² at gravity 1. Paper's drag keeps it near 230 px/s at most. */
const FALL = 520;
/** Air drag per second: paper is all drag, the roll is a small heavy cylinder. */
const PAPER_DRAG = 2.2;
const COIL_DRAG = 0.45;
const FLECK_DRAG = 4.2;
/** Side force of the flutter, px/s². */
const FLUTTER = 240;
/** Most streamers in the air at once. */
const MAX_LIVE = 70;
/** Most flecks, in the air and on the floor. */
const MAX_FLECKS = 260;
/** How far apart along the pointer's path two thrown streamers are, at least, px. */
const THROW_GAP = 34;
/** A fade, s. */
const FADE = 0.6;
/** Settled paper fades in this fast under reduced motion, s. */
const APPEAR = 0.2;

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

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(clamp(r, 0, 1) * 255)} ${Math.round(clamp(g, 0, 1) * 255)} ${Math.round(clamp(b, 0, 1) * 255)})`;

/**
 * Eight shades per colour: four facing levels of the printed front, four of
 * the paler back. The front's brightest level carries a little sheen.
 */
function shadesOf([r, g, b]: [number, number, number]): string[] {
  const out: string[] = [];
  for (let level = 0; level < 4; level += 1) {
    const lit = 0.62 + (0.38 * level) / 3;
    const sheen = level === 3 ? 0.1 : 0;
    out.push(
      rgb(
        r * lit + (1 - r) * sheen,
        g * lit + (1 - g) * sheen,
        b * lit + (1 - b) * sheen,
      ),
    );
  }
  for (let level = 0; level < 4; level += 1) {
    const lit = 0.58 + (0.34 * level) / 3;
    out.push(
      rgb(
        (r + (1 - r) * 0.3) * lit,
        (g + (1 - g) * 0.3) * lit,
        (b + (1 - b) * 0.3) * lit,
      ),
    );
  }
  return out;
}

type Streamer = {
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  /** Points paid out from the roll; the rest ride inside it. */
  out: number;
  /** The roll: position, previous position, pop-in scale and its velocity, turn. */
  cx: number;
  cy: number;
  cpx: number;
  cpy: number;
  scale: number;
  scaleV: number;
  turn: number;
  colour: number;
  /** Rest bend per joint, signed by the paper's handedness, rad. */
  bend: number;
  phase: number;
  twistRate: number;
  spin: number;
  spinRate: number;
  flutterRate: number;
  age: number;
  stillSteps: number;
  asleep: boolean;
  /** Wall-clock second it settled, for `linger`. */
  settledAt: number;
  alpha: number;
  fading: boolean;
  appearing: boolean;
  /** Part of the resting garland: `linger` never fades it (crowding still can). */
  keep: boolean;
};

type Fleck = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  turnRate: number;
  flip: number;
  flipRate: number;
  w: number;
  h: number;
  colour: number;
  phase: number;
  asleep: boolean;
  settledAt: number;
  alpha: number;
  fading: boolean;
  appearing: boolean;
  keep: boolean;
};

type Ring = { x: number; y: number; age: number; colour: number };

type Config = {
  rate: number;
  curl: number;
  stripWidth: number;
  streamerLength: number;
  burst: number;
  flecks: number;
  gravity: number;
  linger: number;
  maxPaper: number;
  scatter: number;
  paused: boolean;
  seed: number;
  dpr: number;
  disabled: boolean;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  hover: (x: number, y: number, t: number) => void;
  leave: () => void;
  pop: (x: number, y: number) => void;
  dispose: () => void;
};

const now = () => performance.now() / 1000;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  visible: React.RefObject<boolean>,
): Engine {
  const ctx = canvas.getContext("2d");
  const floorCanvas = document.createElement("canvas");
  const floorCtx = floorCanvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let shades: string[][] = [["rgb(128 128 128)"]];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let wake = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let disposed = false;
  let floorDirty = true;
  let rand = lcg(7);
  let garlandFor = "";
  const streamers: Streamer[] = [];
  const flecks: Fleck[] = [];
  const rings: Ring[] = [];
  // Scratch, sized once: never allocated per frame.
  const sx = new Float32Array(POINTS + 1);
  const sy = new Float32Array(POINTS + 1);
  const sc = new Float32Array(POINTS + 1);
  const lx = new Float32Array(POINTS + 1);
  const ly = new Float32Array(POINTS + 1);
  const rx = new Float32Array(POINTS + 1);
  const ry = new Float32Array(POINTS + 1);
  const bucketA = new Int8Array(POINTS + 1);
  const bucketB = new Int8Array(POINTS + 1);
  const cut = new Float32Array(POINTS + 1);
  const pointer = { x: 0, y: 0, t: 0, vx: 0, vy: 0, inside: false };
  const thrown = { x: 0, y: 0, t: -1 };

  const seg = () =>
    (cfg ? clamp(cfg.streamerLength, 40, 420) : 150) / (POINTS - 1);
  const half = () => clamp(cfg?.stripWidth ?? 6, 2, 16) / 2;
  const floorY = () => H - 1 - half();
  const coilMax = () => clamp(2.2 + seg() * (POINTS - 1) * 0.018, 3, 7.5);

  const readColours = () => {
    const kids = Array.from(carriers.children);
    const next = kids.map((el) => shadesOf(read(getComputedStyle(el).color)));
    shades = next.length ? next : [["rgb(128 128 128)"]];
    floorDirty = true;
    draw();
  };

  const shade = (colour: number, bucket: number) => {
    const set = shades[colour % shades.length] ?? shades[0] ?? [];
    return set[bucket] ?? set[0] ?? "rgb(128 128 128)";
  };

  const makeStreamer = (x: number, y: number): Streamer => {
    const c = cfg;
    const curl = clamp(c?.curl ?? 0.6, 0, 1);
    const hand = rand() < 0.5 ? -1 : 1;
    const xs = new Float32Array(POINTS);
    const ys = new Float32Array(POINTS);
    xs.fill(x);
    ys.fill(y);
    return {
      x: xs,
      y: ys,
      px: xs.slice(),
      py: ys.slice(),
      out: 1,
      cx: x,
      cy: y,
      cpx: x,
      cpy: y,
      scale: 0,
      scaleV: 0,
      turn: rand() * Math.PI * 2,
      colour: Math.floor(rand() * 64),
      bend: hand * (0.02 + curl * 0.6) * (0.75 + rand() * 0.5),
      phase: rand() * Math.PI * 2,
      twistRate: (0.22 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1),
      spin: 0,
      spinRate: 2 + rand() * 3,
      flutterRate: 4 + rand() * 4,
      age: 0,
      stillSteps: 0,
      asleep: false,
      settledAt: 0,
      alpha: 1,
      fading: false,
      appearing: false,
      keep: false,
    };
  };

  /** A coil thrown from (x, y) with velocity (vx, vy), px/s. */
  const launch = (x: number, y: number, vx: number, vy: number) => {
    if (streamers.filter((s) => !s.asleep).length >= MAX_LIVE) return;
    const s = makeStreamer(x, y);
    const h = STEP;
    s.cpx = x - vx * h;
    s.cpy = y - vy * h;
    // The free end leaves with a little of the throw, so it is not pinned.
    s.px[0] = x - vx * h * 0.22;
    s.py[0] = y - vy * h * 0.22;
    streamers.push(s);
  };

  /** A streamer already lying on the floor in loops: the garland, and reduced motion's answer. */
  const lying = (x0: number, appearing: boolean, keep: boolean) => {
    const c = cfg;
    const s = makeStreamer(x0, floorY());
    const L = seg();
    const curl = clamp(c?.curl ?? 0.6, 0, 1);
    const radius = 5 + curl * 6 + rand() * 3;
    const dir = rand() < 0.5 ? -1 : 1;
    const turn = (0.3 + curl * 0.5) * (0.8 + rand() * 0.4);
    const fy = floorY();
    for (let i = 0; i < POINTS; i += 1) {
      const phi = i * turn + s.phase;
      const run = i * L * (0.55 - curl * 0.25);
      const x = clamp(x0 + dir * run + Math.sin(phi) * radius, 1, W - 1);
      const y = Math.min(fy, fy - (1 - Math.cos(phi)) * radius * 0.6);
      s.x[i] = x;
      s.y[i] = y;
      s.px[i] = x;
      s.py[i] = y;
    }
    s.out = POINTS;
    s.scale = 1;
    s.asleep = true;
    s.settledAt = now();
    s.alpha = appearing ? 0 : 1;
    s.appearing = appearing;
    s.keep = keep;
    streamers.push(s);
  };

  const lyingFleck = (x: number, appearing: boolean, keep: boolean) => {
    if (flecks.length >= MAX_FLECKS) return;
    flecks.push({
      x: clamp(x, 2, W - 2),
      y: H - 1.5,
      vx: 0,
      vy: 0,
      angle: (rand() - 0.5) * 0.6,
      turnRate: 0,
      flip: rand() * Math.PI,
      flipRate: 0,
      w: 2.6 + rand() * 1.8,
      h: 1.6 + rand() * 1.2,
      colour: Math.floor(rand() * 64),
      phase: rand() * 6,
      asleep: true,
      settledAt: now(),
      alpha: appearing ? 0 : 1,
      fading: false,
      appearing,
      keep,
    });
  };

  const garland = () => {
    const c = cfg;
    if (!c || W < 1 || H < 1) return;
    const key = `${c.scatter}|${c.seed}|${c.curl}`;
    if (key === garlandFor) return;
    garlandFor = key;
    for (let i = streamers.length - 1; i >= 0; i -= 1) {
      const s = streamers[i];
      if (s?.asleep) streamers.splice(i, 1);
    }
    flecks.length = 0;
    rand = lcg(c.seed);
    const n = clamp(Math.round(c.scatter * Math.min(1, W / 520)), 0, 24);
    for (let k = 0; k < n; k += 1) {
      const x = W * (0.06 + (0.88 * (k + 0.2 + rand() * 0.6)) / Math.max(1, n));
      lying(x, false, true);
      lyingFleck(x + (rand() - 0.5) * 40, false, true);
      lyingFleck(x + (rand() - 0.5) * 60, false, true);
    }
    floorDirty = true;
  };

  const measure = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const oldFloor = H > 0 ? floorY() : 0;
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c?.dpr ?? 2, 0.5, 2));
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    // Each canvas is checked on its own: a remount (StrictMode rehearses
    // one) finds the visible canvas already sized but a fresh floor canvas.
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (floorCanvas.width !== cw || floorCanvas.height !== ch) {
      floorCanvas.width = cw;
      floorCanvas.height = ch;
    }
    // Paper on the floor stays on the floor when the box changes height.
    if (oldFloor > 0) {
      const dy = floorY() - oldFloor;
      for (const s of streamers) {
        for (let i = 0; i < POINTS; i += 1) {
          s.y[i] = (s.y[i] ?? 0) + dy;
          s.py[i] = (s.py[i] ?? 0) + dy;
          s.x[i] = clamp(s.x[i] ?? 0, 1, W - 1);
          s.px[i] = clamp(s.px[i] ?? 0, 1, W - 1);
        }
        s.cy += dy;
        s.cpy += dy;
      }
      for (const f of flecks) {
        f.y += dy;
        f.x = clamp(f.x, 2, W - 2);
      }
    }
    floorDirty = true;
  };

  // ---------------------------------------------------------------- physics

  const stepStreamer = (s: Streamer, h: number) => {
    const c = cfg;
    if (!c) return;
    const g = FALL * clamp(c.gravity, 0.3, 3);
    const L = seg();
    const fy = floorY();
    const gh = g * h * h;
    s.age += h;
    // The roll pops out on the recoil constants: two small bounces.
    if (s.out < POINTS) {
      const k = springs.recoil.stiffness;
      const d = springs.recoil.damping;
      s.scaleV += (-k * (s.scale - 1) - d * s.scaleV) * h;
      s.scale += s.scaleV * h;
    }
    s.spin += s.spinRate * h;
    let moved = 0;
    const damp = 1 - PAPER_DRAG * h;
    for (let i = 0; i < s.out; i += 1) {
      const x = s.x[i] ?? 0;
      const y = s.y[i] ?? 0;
      const vx = (x - (s.px[i] ?? x)) * damp;
      const vy = (y - (s.py[i] ?? y)) * damp;
      const grounded = y >= fy - 0.5;
      const side = grounded
        ? 0
        : Math.sin(clock * s.flutterRate + s.phase + i * 0.55) * FLUTTER;
      s.px[i] = x;
      s.py[i] = y;
      s.x[i] = x + vx + side * h * h;
      s.y[i] = y + vy + gh;
    }
    if (s.out < POINTS) {
      const cd = 1 - COIL_DRAG * h;
      const vx = (s.cx - s.cpx) * cd;
      const vy = (s.cy - s.cpy) * cd;
      s.cpx = s.cx;
      s.cpy = s.cy;
      s.cx += vx;
      s.cy += vy + gh;
      const r = coilMax();
      if (s.cy > fy - r) {
        s.cy = fy - r;
        s.cpy = s.cy;
        s.cpx = s.cx - vx * 0.5;
      }
      if (s.cx < r) {
        s.cx = r;
        s.cpx = s.cx;
      } else if (s.cx > W - r) {
        s.cx = W - r;
        s.cpx = s.cx;
      }
      // Pay out: whenever the roll has run a segment ahead of the paper.
      let lastI = s.out - 1;
      let dx = s.cx - (s.x[lastI] ?? 0);
      let dy = s.cy - (s.y[lastI] ?? 0);
      let d = Math.hypot(dx, dy);
      while (d > L && s.out < POINTS) {
        const k = s.out;
        const nx = (s.x[lastI] ?? 0) + (dx / d) * L;
        const ny = (s.y[lastI] ?? 0) + (dy / d) * L;
        s.x[k] = nx;
        s.y[k] = ny;
        s.px[k] = nx - vx * 0.6;
        s.py[k] = ny - vy * 0.6;
        s.out += 1;
        // Unrolling takes a little of the roll's speed.
        s.cpx = s.cx - (s.cx - s.cpx) * 0.985;
        s.cpy = s.cy - (s.cy - s.cpy) * 0.985;
        s.turn += L / Math.max(1, r);
        lastI = k;
        dx = s.cx - nx;
        dy = s.cy - ny;
        d = Math.hypot(dx, dy);
      }
      if (s.out >= POINTS) {
        s.x[POINTS - 1] = s.cx;
        s.y[POINTS - 1] = s.cy;
        s.px[POINTS - 1] = s.cpx;
        s.py[POINTS - 1] = s.cpy;
      }
    }
    const n = s.out;
    // Length: three passes of distance constraints.
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < n - 1; i += 1) {
        const ax = s.x[i] ?? 0;
        const ay = s.y[i] ?? 0;
        const bx = s.x[i + 1] ?? 0;
        const by = s.y[i + 1] ?? 0;
        const ddx = bx - ax;
        const ddy = by - ay;
        const dd = Math.hypot(ddx, ddy) || 0.0001;
        const k = ((dd - L) / dd) * 0.5;
        s.x[i] = ax + ddx * k;
        s.y[i] = ay + ddy * k;
        s.x[i + 1] = bx - ddx * k;
        s.y[i + 1] = by - ddy * k;
      }
    }
    // Curl: each joint is bent toward the roll's memory, tighter toward the
    // core, softer once the paper lies on the floor. Both neighbours turn
    // half the correction in opposite senses and the joint takes back their
    // sum, so the bend never pushes the paper along: a curl that propelled
    // itself would keep a strip hovering in mid-air.
    for (let i = 1; i < n - 1; i += 1) {
      const x0 = s.x[i - 1] ?? 0;
      const y0 = s.y[i - 1] ?? 0;
      const x1 = s.x[i] ?? 0;
      const y1 = s.y[i] ?? 0;
      const ax = x0 - x1;
      const ay = y0 - y1;
      const bx = (s.x[i + 1] ?? 0) - x1;
      const by = (s.y[i + 1] ?? 0) - y1;
      const a1 = Math.atan2(-ay, -ax);
      const a2 = Math.atan2(by, bx);
      let diff = a2 - a1 - s.bend * (0.65 + (0.7 * i) / POINTS);
      if (diff > Math.PI) diff -= Math.PI * 2;
      else if (diff < -Math.PI) diff += Math.PI * 2;
      const grounded = y1 >= fy - 0.5;
      const k = -diff * (grounded ? 0.04 : 0.12) * 0.5;
      const cs = Math.cos(k);
      const sn = Math.sin(k);
      const nbx = bx * cs - by * sn;
      const nby = bx * sn + by * cs;
      const nax = ax * cs + ay * sn;
      const nay = -ax * sn + ay * cs;
      const dbx = nbx - bx;
      const dby = nby - by;
      const dax = nax - ax;
      const day = nay - ay;
      const jx = (dax + dbx) / 3;
      const jy = (day + dby) / 3;
      s.x[i + 1] = x1 + nbx - jx;
      s.y[i + 1] = y1 + nby - jy;
      s.x[i - 1] = x1 + nax - jx;
      s.y[i - 1] = y1 + nay - jy;
      s.x[i] = x1 - jx;
      s.y[i] = y1 - jy;
    }
    // The floor and the walls: paper slides to a stop on the floor.
    for (let i = 0; i < n; i += 1) {
      let x = s.x[i] ?? 0;
      let y = s.y[i] ?? 0;
      if (y > fy) {
        y = fy;
        s.py[i] = fy;
        s.px[i] = x - (x - (s.px[i] ?? x)) * 0.55;
      }
      if (x < 1) {
        x = 1;
        s.px[i] = 1;
      } else if (x > W - 1) {
        x = W - 1;
        s.px[i] = W - 1;
      }
      s.x[i] = x;
      s.y[i] = y;
      moved = Math.max(
        moved,
        Math.abs(x - (s.px[i] ?? x)) + Math.abs(y - (s.py[i] ?? y)),
      );
    }
    s.stillSteps = moved < 0.02 ? s.stillSteps + 1 : 0;
    const lowest = s.y[0] ?? 0;
    if (s.out >= POINTS && s.stillSteps > 45 && lowest > fy - 60) {
      s.asleep = true;
      s.settledAt = now();
      floorDirty = true;
    } else if (s.age > 20) {
      // Paper that never found the floor (caught on a wall) bows out.
      s.asleep = true;
      s.fading = true;
      s.settledAt = now();
      floorDirty = true;
    }
  };

  const stepFleck = (f: Fleck, h: number) => {
    const c = cfg;
    if (!c) return;
    const g = FALL * 0.62 * clamp(c.gravity, 0.3, 3);
    const damp = 1 - FLECK_DRAG * h;
    f.vx = f.vx * damp + Math.sin(clock * 5 + f.phase) * 90 * h;
    f.vy = f.vy * damp + g * h;
    f.x += f.vx * h;
    f.y += f.vy * h;
    f.angle += f.turnRate * h;
    f.flip += f.flipRate * h;
    const fy = H - 1.5;
    if (f.y >= fy) {
      f.y = fy;
      f.vy = 0;
      f.vx *= 0.8;
      f.turnRate *= 0.8;
      f.flipRate *= 0.7;
      if (Math.abs(f.vx) < 2) {
        f.asleep = true;
        f.settledAt = now();
        // Lying flat: show its face.
        f.flip = Math.round(f.flip / Math.PI) * Math.PI;
        floorDirty = true;
      }
    }
    if (f.x < 2) {
      f.x = 2;
      f.vx = Math.abs(f.vx) * 0.4;
    } else if (f.x > W - 2) {
      f.x = W - 2;
      f.vx = -Math.abs(f.vx) * 0.4;
    }
  };

  /** Fades: linger, crowding, and reduced motion's fade-ins. Returns whether any ran. */
  const ageFloor = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    const t = now();
    let busy = false;
    // Crowding: past `maxPaper`, the oldest settled streamers fade first.
    let settled = 0;
    for (const s of streamers) if (s.asleep && !s.fading) settled += 1;
    let over = settled - Math.max(0, Math.round(c.maxPaper));
    for (let i = 0; i < streamers.length && over > 0; i += 1) {
      const s = streamers[i];
      if (!s || !s.asleep || s.fading) continue;
      s.fading = true;
      over -= 1;
    }
    const linger = Math.max(0, c.linger);
    for (let i = streamers.length - 1; i >= 0; i -= 1) {
      const s = streamers[i];
      if (!s || !s.asleep) continue;
      if (s.appearing) {
        s.alpha = Math.min(1, s.alpha + dt / APPEAR);
        if (s.alpha >= 1) s.appearing = false;
        busy = true;
        floorDirty = true;
      }
      if (!s.fading && !s.keep && linger > 0 && t - s.settledAt > linger) {
        s.fading = true;
      }
      if (s.fading) {
        s.alpha -= dt / FADE;
        busy = true;
        floorDirty = true;
        if (s.alpha <= 0) streamers.splice(i, 1);
      }
    }
    for (let i = flecks.length - 1; i >= 0; i -= 1) {
      const f = flecks[i];
      if (!f || !f.asleep) continue;
      if (f.appearing) {
        f.alpha = Math.min(1, f.alpha + dt / APPEAR);
        if (f.alpha >= 1) f.appearing = false;
        busy = true;
        floorDirty = true;
      }
      if (!f.fading && !f.keep && linger > 0 && t - f.settledAt > linger) {
        f.fading = true;
      }
      if (f.fading) {
        f.alpha -= dt / FADE;
        busy = true;
        floorDirty = true;
        if (f.alpha <= 0) flecks.splice(i, 1);
      }
    }
    return busy;
  };

  // ---------------------------------------------------------------- drawing

  const drawStreamer = (g: CanvasRenderingContext2D, s: Streamer) => {
    const hw = half();
    const fy = floorY();
    const coil = s.out < POINTS;
    let m = 0;
    for (let i = 0; i < s.out; i += 1) {
      sx[m] = s.x[i] ?? 0;
      sy[m] = s.y[i] ?? 0;
      m += 1;
    }
    if (coil) {
      sx[m] = s.cx;
      sy[m] = s.cy;
      m += 1;
    }
    if (m >= 2) {
      for (let i = 0; i < m; i += 1) {
        const a = Math.max(0, i - 1);
        const b = Math.min(m - 1, i + 1);
        let tx = (sx[b] ?? 0) - (sx[a] ?? 0);
        let ty = (sy[b] ?? 0) - (sy[a] ?? 0);
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        // Paper coming off the roll lies flat against it.
        let cosT =
          coil && i >= m - 2
            ? 1
            : Math.cos(s.phase + i * s.twistRate + s.spin * 0.6);
        // Paper lying on the floor lies flat: its twist relaxes there.
        if ((sy[i] ?? 0) >= fy - 1) {
          cosT = (cosT < 0 ? -1 : 1) * Math.max(Math.abs(cosT), 0.7);
        }
        sc[i] = cosT;
        const w = hw * cosT;
        lx[i] = (sx[i] ?? 0) - ty * w;
        ly[i] = (sy[i] ?? 0) + tx * w;
        rx[i] = (sx[i] ?? 0) + ty * w;
        ry[i] = (sy[i] ?? 0) - tx * w;
      }
      // The silhouette in the middle shade: a twisted strip's outline crosses
      // itself, and the nonzero rule fills both lobes, so no seam shows
      // between the shaded pieces laid over it.
      g.fillStyle = shade(s.colour, 1);
      g.beginPath();
      g.moveTo(lx[0] ?? 0, ly[0] ?? 0);
      for (let i = 1; i < m; i += 1) g.lineTo(lx[i] ?? 0, ly[i] ?? 0);
      for (let i = m - 1; i >= 0; i -= 1) g.lineTo(rx[i] ?? 0, ry[i] ?? 0);
      g.closePath();
      g.fill();
      // Each segment (or each half, where the strip turns over) into one of
      // eight buckets by face and facing.
      let used = 0;
      for (let i = 0; i < m - 1; i += 1) {
        const c0 = sc[i] ?? 1;
        const c1 = sc[i + 1] ?? 1;
        if (c0 * c1 >= 0) {
          const face = c0 + c1 >= 0 ? 0 : 4;
          const level = Math.round((Math.abs(c0 + c1) / 2) * 3);
          bucketA[i] = face + level;
          bucketB[i] = -1;
        } else {
          cut[i] = c0 / (c0 - c1);
          bucketA[i] = (c0 >= 0 ? 0 : 4) + Math.round(Math.abs(c0) * 1.5);
          bucketB[i] = (c1 >= 0 ? 0 : 4) + Math.round(Math.abs(c1) * 1.5);
        }
        used |= 1 << (bucketA[i] ?? 0);
        if ((bucketB[i] ?? -1) >= 0) used |= 1 << (bucketB[i] ?? 0);
      }
      for (let b = 0; b < 8; b += 1) {
        if (b === 1 || !(used & (1 << b))) continue;
        g.fillStyle = shade(s.colour, b);
        g.beginPath();
        for (let i = 0; i < m - 1; i += 1) {
          const a = bucketA[i] ?? -1;
          const bb = bucketB[i] ?? -1;
          if (bb < 0) {
            if (a !== b) continue;
            g.moveTo(lx[i] ?? 0, ly[i] ?? 0);
            g.lineTo(lx[i + 1] ?? 0, ly[i + 1] ?? 0);
            g.lineTo(rx[i + 1] ?? 0, ry[i + 1] ?? 0);
            g.lineTo(rx[i] ?? 0, ry[i] ?? 0);
            g.closePath();
          } else {
            const t = cut[i] ?? 0.5;
            const xx = (sx[i] ?? 0) + ((sx[i + 1] ?? 0) - (sx[i] ?? 0)) * t;
            const yy = (sy[i] ?? 0) + ((sy[i + 1] ?? 0) - (sy[i] ?? 0)) * t;
            if (a === b) {
              g.moveTo(lx[i] ?? 0, ly[i] ?? 0);
              g.lineTo(xx, yy);
              g.lineTo(rx[i] ?? 0, ry[i] ?? 0);
              g.closePath();
            }
            if (bb === b) {
              g.moveTo(xx, yy);
              g.lineTo(lx[i + 1] ?? 0, ly[i + 1] ?? 0);
              g.lineTo(rx[i + 1] ?? 0, ry[i + 1] ?? 0);
              g.closePath();
            }
          }
        }
        g.fill();
      }
    }
    if (coil) {
      // The roll: what is left of it, with its spiral turning as it pays out.
      const r =
        coilMax() *
        Math.sqrt((POINTS - s.out) / POINTS) *
        clamp(s.scale, 0, 1.4);
      if (r > 0.4) {
        g.fillStyle = shade(s.colour, 2);
        g.beginPath();
        g.arc(s.cx, s.cy, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = shade(s.colour, 4);
        g.lineWidth = Math.max(0.6, r * 0.16);
        g.beginPath();
        for (let k = 0; k <= 16; k += 1) {
          const a = s.turn + k * 0.95;
          const rr = r * (0.92 - (k / 16) * 0.78);
          const px = s.cx + Math.cos(a) * rr;
          const py = s.cy + Math.sin(a) * rr;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  };

  const drawFleck = (g: CanvasRenderingContext2D, f: Fleck) => {
    const cs = Math.cos(f.angle);
    const sn = Math.sin(f.angle);
    const tumble = Math.cos(f.flip);
    const sy2 = Math.max(0.12, Math.abs(tumble));
    g.setTransform(
      dpr * cs,
      dpr * sn,
      -dpr * sn * sy2,
      dpr * cs * sy2,
      dpr * f.x,
      dpr * f.y,
    );
    g.fillStyle = shade(f.colour, tumble >= 0 ? 3 : 6);
    g.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
  };

  const paintFloor = () => {
    if (!floorCtx) return;
    floorDirty = false;
    floorCtx.setTransform(1, 0, 0, 1, 0, 0);
    floorCtx.clearRect(0, 0, floorCanvas.width, floorCanvas.height);
    floorCtx.shadowColor = "rgb(0 0 0 / 0.16)";
    floorCtx.shadowBlur = 2 * dpr;
    floorCtx.shadowOffsetY = 1 * dpr;
    for (const s of streamers) {
      if (!s.asleep || s.alpha <= 0) continue;
      floorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      floorCtx.globalAlpha = clamp(s.alpha, 0, 1);
      drawStreamer(floorCtx, s);
    }
    floorCtx.shadowColor = "transparent";
    for (const f of flecks) {
      if (!f.asleep || f.alpha <= 0) continue;
      floorCtx.globalAlpha = clamp(f.alpha, 0, 1);
      drawFleck(floorCtx, f);
    }
    floorCtx.globalAlpha = 1;
    floorCtx.setTransform(1, 0, 0, 1, 0, 0);
  };

  function draw() {
    if (!ctx || W < 1) return;
    if (floorDirty) paintFloor();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(floorCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of streamers) {
      if (s.asleep) continue;
      drawStreamer(ctx, s);
    }
    for (const f of flecks) {
      if (f.asleep) continue;
      drawFleck(ctx, f);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of rings) {
      // The popper's flash: a ring and six short sparks, gone in 240 ms.
      const p = clamp(r.age / 0.24, 0, 1);
      const e = 1 - (1 - p) * (1 - p);
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.strokeStyle = shade(r.colour, 3);
      ctx.lineWidth = 2 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + e * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.42;
        const r0 = 8 + e * 18;
        const r1 = r0 + 7 * (1 - p);
        ctx.moveTo(r.x + Math.cos(a) * r0, r.y + Math.sin(a) * r0);
        ctx.lineTo(r.x + Math.cos(a) * r1, r.y + Math.sin(a) * r1);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ loop

  const awake = () =>
    rings.length > 0 ||
    streamers.some((s) => !s.asleep || s.fading || s.appearing) ||
    flecks.some((f) => !f.asleep || f.fading || f.appearing);

  /** When nothing moves, wake for the next `linger` fade, if there is one. */
  const scheduleWake = () => {
    window.clearTimeout(wake);
    wake = 0;
    const c = cfg;
    if (!c || c.linger <= 0 || c.paused) return;
    let first = Infinity;
    for (const s of streamers) {
      if (s.asleep && !s.keep) first = Math.min(first, s.settledAt);
    }
    for (const f of flecks) {
      if (f.asleep && !f.keep) first = Math.min(first, f.settledAt);
    }
    if (!Number.isFinite(first)) return;
    const ms = Math.max(50, (first + c.linger - now()) * 1000 + 30);
    wake = window.setTimeout(() => {
      wake = 0;
      ageFloor(0);
      kick();
    }, ms);
  };

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    if (!c.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) {
        clock += STEP;
        for (const s of streamers) if (!s.asleep) stepStreamer(s, STEP);
        for (const f of flecks) if (!f.asleep) stepFleck(f, STEP);
        acc -= STEP;
        steps += 1;
      }
      if (steps === 6) acc = 0;
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        const r = rings[i];
        if (!r) continue;
        r.age += dt;
        if (r.age > 0.24) rings.splice(i, 1);
      }
      ageFloor(dt);
    }
    draw();
    if (!c.paused && awake()) frame = window.requestAnimationFrame(tick);
    else {
      last = 0;
      acc = 0;
      scheduleWake();
    }
  };

  function kick() {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  }

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.dpr !== next.dpr) measure();
      if (!was || was.colourKey !== next.colourKey) readColours();
      garland();
      if (was && was.motionSafe && !next.motionSafe) {
        // Reduced motion: whatever is in the air is set down where it is.
        for (let i = streamers.length - 1; i >= 0; i -= 1) {
          const s = streamers[i];
          if (s && !s.asleep) streamers.splice(i, 1);
        }
        for (let i = flecks.length - 1; i >= 0; i -= 1) {
          const f = flecks[i];
          if (f && !f.asleep) flecks.splice(i, 1);
        }
        rings.length = 0;
        floorDirty = true;
      }
      draw();
      kick();
      if (!awake()) scheduleWake();
    },
    resize() {
      measure();
      garland();
      draw();
      kick();
    },
    readColours,
    hover(x, y, t) {
      const c = cfg;
      if (!c || c.disabled || c.paused || !c.motionSafe) return;
      if (pointer.inside && t > pointer.t) {
        const dt = Math.max(0.008, (t - pointer.t) / 1000);
        pointer.vx = clamp((x - pointer.x) / dt, -1400, 1400);
        pointer.vy = clamp((y - pointer.y) / dt, -1400, 1400);
      } else {
        pointer.vx = 0;
        pointer.vy = 0;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.t = t;
      pointer.inside = true;
      const travelled = Math.hypot(x - thrown.x, y - thrown.y);
      const gap = 1000 / clamp(c.rate, 0.5, 20);
      if (thrown.t < 0) {
        thrown.x = x;
        thrown.y = y;
        thrown.t = t;
        return;
      }
      if (travelled < THROW_GAP || t - thrown.t < gap) return;
      thrown.x = x;
      thrown.y = y;
      thrown.t = t;
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed < 40) return;
      // Off the cursor: a third of its motion, an upward kick, a seeded lean.
      launch(
        x,
        y,
        pointer.vx * 0.32 + (rand() - 0.5) * 160,
        pointer.vy * 0.32 - (120 + rand() * 150),
      );
      kick();
    },
    leave() {
      pointer.inside = false;
      thrown.t = -1;
    },
    pop(x, y) {
      const c = cfg;
      if (!c || c.disabled || W < 1) return;
      const px = clamp(x, 4, W - 4);
      const py = clamp(y, 4, H - 4);
      if (!c.motionSafe) {
        // Reduced motion: the popper's paper is already down, fading in.
        const n = 3;
        for (let k = 0; k < n; k += 1) {
          lying(
            clamp(px + (k - 1) * 34 + (rand() - 0.5) * 16, 6, W - 6),
            true,
            false,
          );
        }
        for (let k = 0; k < 10; k += 1) {
          lyingFleck(px + (rand() - 0.5) * 120, true, false);
        }
        floorDirty = true;
        kick();
        return;
      }
      const g = FALL * clamp(c.gravity, 0.3, 3);
      // Launched to peak near half the box: the paper's own length does the rest.
      // Unrolling and drag take about a fifth of the roll's speed on the way up.
      const rise = clamp(Math.min(py - 12, H * 0.6), 20, H);
      const v0 = Math.sqrt(2 * g * rise) * 1.22;
      const count = clamp(Math.round(c.burst), 0, 40);
      for (let k = 0; k < count; k += 1) {
        const spread = count > 1 ? k / (count - 1) - 0.5 : 0;
        const a = -Math.PI / 2 + spread * 0.98 + (rand() - 0.5) * 0.14;
        const v = v0 * (0.82 + rand() * 0.26);
        launch(px, py, Math.cos(a) * v, Math.sin(a) * v);
      }
      const nf = clamp(Math.round(c.flecks), 0, 120);
      for (let k = 0; k < nf; k += 1) {
        if (flecks.length >= MAX_FLECKS) {
          const oldest = flecks.findIndex((f) => f.asleep);
          if (oldest < 0) break;
          flecks.splice(oldest, 1);
        }
        const a = -Math.PI / 2 + (rand() - 0.5) * 1.7;
        const v = v0 * (0.7 + rand() * 0.6);
        flecks.push({
          x: px,
          y: py,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          angle: rand() * Math.PI * 2,
          turnRate: (rand() - 0.5) * 16,
          flip: rand() * Math.PI,
          flipRate: 6 + rand() * 12,
          w: 2.6 + rand() * 1.8,
          h: 1.6 + rand() * 1.2,
          colour: Math.floor(rand() * 64),
          phase: rand() * 6,
          asleep: false,
          settledAt: 0,
          alpha: 1,
          fading: false,
          appearing: false,
          keep: false,
        });
      }
      rings.push({ x: px, y: py, age: 0, colour: Math.floor(rand() * 64) });
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(wake);
      wake = 0;
      streamers.length = 0;
      flecks.length = 0;
      rings.length = 0;
      floorCanvas.width = 0;
      floorCanvas.height = 0;
    },
  };
}

const FORM_FIELD = "input, textarea, select, [contenteditable='true']";

/**
 * Coloured paper streamers for any box. A moving pointer throws tight coils
 * of paper off the cursor: each pops out on the recoil spring, flies on its
 * throw while the strip pays out behind it — the roll visibly unwinding,
 * its spiral turning by the paper it lets go — and once empty the strip is
 * free paper, all drag and flutter, springing into ringlets from its curl
 * memory and turning over to show its paler back. A click or tap fires a
 * popper: a ring flashes, a dozen coils leave in an upward cone, tumbling
 * flecks puff out with them, and everything drifts down and settles along
 * the bottom edge, where it lies until `linger` runs out.
 *
 * The paper layer is a canvas that never takes a click; the children stay
 * fully interactive. The box is one tab stop: Enter or Space fires a popper
 * from an aim point on the bottom edge that Left and Right move. Under
 * reduced motion nothing flies: a garland lies on the floor, and a popper
 * sets its paper down in place with a short fade.
 */
export function SerpentinePop({
  children,
  palette = "party",
  colors,
  rate = 5,
  curl = 0.6,
  stripWidth = 6,
  streamerLength = 130,
  burst = 12,
  flecks = 36,
  gravity = 1,
  linger = 10,
  maxPaper = 40,
  scatter = 6,
  layer = "front",
  paused = false,
  seed = 7,
  dpr = 2,
  label = "Party popper",
  onPop,
  sound = false,
  disabled = false,
  className,
}: SerpentinePopProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const paints = colors?.length
    ? colors
    : (PALETTES[palette] ?? PALETTES.party);
  const colourKey = paints.join("|");
  const [aim, setAim] = React.useState(0.5);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const pops = React.useRef(0);
  const press = React.useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const timers = React.useRef<number[]>([]);

  const config: Config = {
    rate,
    curl,
    stripWidth,
    streamerLength,
    burst,
    flecks,
    gravity,
    linger,
    maxPaper,
    scatter,
    paused,
    seed,
    dpr,
    disabled,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.resize();
    });
    watcher.observe(node);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const fire = (x: number, y: number, clientX: number) => {
    if (disabled) return;
    engine.current?.pop(x, y);
    pops.current += 1;
    const count = Math.max(0, Math.round(burst));
    setSaid((s) => ({
      n: s.n + 1,
      text: `Popper fired, ${count} ${count === 1 ? "streamer" : "streamers"}.`,
    }));
    onPop?.(pops.current);
    const pan = panFrom(clientX, rootRef.current);
    const pitch = 0.92 + ((pops.current * 0.37) % 1) * 0.22;
    audio.play("pop", { pitch, pan, gain: 0.6 });
    timers.current.push(
      window.setTimeout(
        () => audio.play("paper", { pitch: 1.05, pan, gain: 0.32 }),
        60,
      ),
    );
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.hover(at.x, at.y, event.timeStamp);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== event.pointerId || disabled) return;
    const moved = Math.hypot(event.clientX - p.x, event.clientY - p.y);
    if (moved > 8 || event.timeStamp - p.t > 650) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(FORM_FIELD)) return;
    const at = local(event.clientX, event.clientY);
    fire(at.x, at.y, event.clientX);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) return;
    const root = rootRef.current;
    const width = root?.clientWidth ?? 0;
    const height = root?.clientHeight ?? 0;
    const stepBy = event.shiftKey ? 0.25 : 0.1;
    const move = (to: number) => {
      event.preventDefault();
      setAim(Math.round(clamp(to, 0.05, 0.95) * 100) / 100);
    };
    if (event.key === "ArrowLeft") move(aim - stepBy);
    else if (event.key === "ArrowRight") move(aim + stepBy);
    else if (event.key === "Home") move(0.05);
    else if (event.key === "End") move(0.95);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      const rect = root?.getBoundingClientRect();
      fire(aim * width, height - 10, (rect?.left ?? 0) + aim * width);
    }
  };

  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        layer === "back" ? "z-0" : "z-10",
      )}
    />
  );

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="popper"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
      }}
      onPointerLeave={() => engine.current?.leave()}
      className={cn(
        "group/serpentine-pop relative isolate touch-manipulation overflow-clip outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {layer === "back" ? canvas : null}
      <div
        className={cn("relative size-full", layer === "back" ? "z-10" : "z-0")}
      >
        {children}
      </div>
      {layer === "back" ? null : canvas}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1.5 z-20 -translate-x-1/2 text-cobalt-bright opacity-0 transition-opacity duration-150 group-focus-visible/serpentine-pop:opacity-100"
        style={{ left: `${Math.round(aim * 1000) / 10}%` }}
      >
        <svg width="18" height="20" viewBox="0 0 18 20" className="block">
          <path
            d="M9 1 L16 18 Q9 20.5 2 18 Z"
            fill="currentColor"
            opacity={0.9}
          />
          <path
            d="M5.2 10.4 L12.8 10.4 M3.6 14.3 L14.4 14.3"
            stroke="var(--background)"
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.7}
          />
        </svg>
      </span>
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
      <span id={hintId} className="sr-only">
        Move the pointer to throw streamers. Click, tap, or press Enter to fire
        a popper; the Left and Right arrows aim it along the bottom edge.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
