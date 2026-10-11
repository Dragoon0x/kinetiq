"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  createVelocityTracker,
  project,
  rubberClamp,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import {
  useTactileSound,
  type LoopHandle,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TextBottleCharset = "ascii" | "blocks" | "dots" | "binary";
export type TextBottleState =
  "resting" | "sloshing" | "pouring" | "refilling" | "empty";

export type TextBottleProps = {
  /** The bottle's angle in degrees (controlled): negative tips it left, positive right. */
  tilt?: number;
  /** The angle it starts at when uncontrolled. @default 0 */
  defaultTilt?: number;
  /** Fires from the drag release or the key that tipped it, with the new angle in whole degrees. */
  onTiltChange?: (tilt: number) => void;
  /** How thick the liquid is, 0 (water: quick waves, a fast glug) to 1 (syrup: slow, damped, a slow pour). @default 0.35 */
  viscosity?: number;
  /** The glyphs the water is typed in, light to heavy. @default "ascii" */
  charset?: TextBottleCharset;
  /** A custom density ramp, light to heavy, starting with a space. Overrides `charset`. */
  ramp?: string;
  /** How full the bottle starts, and refills to, 0 to 1. @default 0.7 */
  fill?: number;
  /** The furthest it tips either way, degrees, 30 to 170. @default 135 */
  maxTilt?: number;
  /** How long an upright bottle takes to refill from empty, ms; 0 never refills. @default 7000 */
  refill?: number;
  /** The grid's font size in px: smaller is a finer, denser bottle. @default 10 */
  cellSize?: number;
  /** The water, any CSS colour; it is drawn at fixed lightness so it reads on both themes. @default the accent blue */
  waterColor?: string;
  /** The glass outline, any CSS colour. @default the ink at two thirds */
  glassColor?: string;
  /** Fires when the bottle starts or stops pouring, sloshing or refilling, or runs empty, with the level 0 to 1. */
  onStateChange?: (state: TextBottleState, level: number) => void;
  /** Fires as the level passes each 5% step while it pours or refills, 0 to 1. */
  onLevelChange?: (level: number) => void;
  /** A glug while it pours, after a tip by hand or key. @default false */
  sound?: boolean;
  /** The bottle's accessible name. @default "Bottle of water" */
  label?: string;
  /** Freeze the water: no waves, pouring or refilling. The bottle still turns. @default false */
  paused?: boolean;
  /** No tipping by hand or key. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the piece; it fills a 448px-tall box by default. */
  className?: string;
};

const RAMPS: Record<TextBottleCharset, string> = {
  ascii: " .:-=+*#%@",
  blocks: " ░▒▓█",
  dots: " .·•●",
  binary: " .:10",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const DEG = Math.PI / 180;
/** Physics substep, s. */
const STEP = 1 / 240;
/** Gravity for the stream and the drips, px/s². */
const FALL = 2000;
/** The bottle counts as upright (and refills) within this many degrees. */
const UPRIGHT = 25;
/** Stream and drip particles alive at once. */
const POOL = 280;
/** The area of water one stream glyph carries, in cells. */
const PARCEL = 0.18;

function sdBox(x: number, y: number, hx: number, hy: number) {
  const qx = Math.abs(x) - hx;
  const qy = Math.abs(y) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

/** A polynomial smooth minimum: the fillet where the neck meets the shoulders. */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

type Shape = {
  /** Bottle height, px. */
  H: number;
  bodyCy: number;
  bodyHw: number;
  bodyHh: number;
  rTop: number;
  rBot: number;
  neckCy: number;
  neckHw: number;
  neckHh: number;
  lipCy: number;
  lipHw: number;
  lipHh: number;
  k: number;
  /** The mouth, in the bottle's own frame. */
  mouthY: number;
  mouthHw: number;
};

/** The bottle's proportions for a height, in its own frame (origin at its centre, y down). */
function shapeFor(H: number, cw: number, ch: number): Shape {
  const neckHw = Math.max(0.072 * H, 1.7 * cw);
  const top = -0.5 * H;
  const lipHh = 0.55 * ch;
  return {
    H,
    bodyCy: 0.17 * H,
    bodyHw: 0.22 * H,
    bodyHh: 0.33 * H,
    rTop: 0.13 * H,
    rBot: 0.045 * H,
    neckCy: -0.28 * H,
    neckHw,
    neckHh: 0.22 * H,
    lipCy: top + lipHh,
    lipHw: neckHw,
    lipHh,
    k: 0.05 * H,
    mouthY: top,
    mouthHw: neckHw,
  };
}

/** Signed distance to the glass's outer surface, negative inside. */
function bottleSdf(s: Shape, x: number, y: number) {
  const r = y < s.bodyCy ? s.rTop : s.rBot;
  const body = sdBox(x, y - s.bodyCy, s.bodyHw - r, s.bodyHh - r) - r;
  const neck = sdBox(x, y - s.neckCy, s.neckHw, s.neckHh);
  return smin(body, neck, s.k);
}

function lipSdf(s: Shape, x: number, y: number) {
  return sdBox(x, y - s.lipCy, s.lipHw, s.lipHh);
}

/** The mouth is open: no glass across it. */
const inMouth = (s: Shape, x: number, y: number, cw: number) =>
  y < s.mouthY + s.lipHh && Math.abs(x) < s.mouthHw - 0.5 * cw;

/** The bottle's height for a box: it must still fit when tipped all the way. */
const bottleHeight = (w: number, h: number) => Math.min(w * 0.86, h * 0.6);

/* ------------------------------------------------------------------ */
/* The still: the server's frame and the first paint, upright, typed   */
/* on a fixed grid sized for the tall card.                           */
/* ------------------------------------------------------------------ */

const STILL = { cols: 53, rows: 46, cw: 6, ch: 12 };

type StillArt = { glass: string[]; light: string[]; deep: string[] };

function stillArt(fill: number, ramp: string): StillArt {
  const { cols, rows, cw, ch } = STILL;
  const w = cols * cw;
  const h = rows * ch;
  const s = shapeFor(bottleHeight(w, h), cw, ch);
  const px = w / 2;
  const py = h * 0.4;
  const NB = " ";
  const glass: string[][] = [];
  const kinds: number[][] = [];
  let cap = 0;
  for (let r = 0; r < rows; r += 1) {
    const g: string[] = [];
    const k: number[] = [];
    for (let c = 0; c < cols; c += 1) {
      const lx = (c + 0.5) * cw - px;
      const ly = (r + 0.5) * ch - py;
      const d = bottleSdf(s, lx, ly);
      const dOut = Math.min(d, lipSdf(s, lx, ly));
      // Upright, the walls are vertical or horizontal or the shoulders' and
      // base's curves; the normal's direction picks the glyph as below.
      const e = 0.5;
      const gx =
        Math.min(bottleSdf(s, lx + e, ly), lipSdf(s, lx + e, ly)) -
        Math.min(bottleSdf(s, lx - e, ly), lipSdf(s, lx - e, ly));
      const gy =
        Math.min(bottleSdf(s, lx, ly + e), lipSdf(s, lx, ly + e)) -
        Math.min(bottleSdf(s, lx, ly - e), lipSdf(s, lx, ly - e));
      const len = Math.sqrt(gx * gx + gy * gy) || 1;
      const nx = gx / len;
      const ny = gy / len;
      const half = edgeBand(nx, ny, cw, ch);
      if (Math.abs(dOut) <= half && !inMouth(s, lx, ly, cw)) {
        g.push(EDGE[edgeIndex(nx, ny, dOut, ch)] ?? "|");
        k.push(1);
      } else if (d < 0) {
        g.push(NB);
        k.push(2);
        cap += 1;
      } else {
        g.push(NB);
        k.push(0);
      }
    }
    glass.push(g);
    kinds.push(k);
  }
  // Fill from the bottom until the water holds `fill` of the bottle.
  const want = clamp(fill, 0, 1) * cap;
  let have = 0;
  let surfaceRow = rows;
  let part = 0;
  for (let r = rows - 1; r >= 0; r -= 1) {
    const inRow = (kinds[r] ?? []).filter((v) => v === 2).length;
    if (have + inRow >= want) {
      surfaceRow = r;
      part = inRow ? (want - have) / inRow : 0;
      break;
    }
    have += inRow;
    surfaceRow = r;
  }
  const n = ramp.length;
  const light: string[] = [];
  const deep: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    let l = "";
    let dp = "";
    for (let c = 0; c < cols; c += 1) {
      const kind = kinds[r]?.[c] ?? 0;
      let ch1 = NB;
      let ch2 = NB;
      if (kind === 2 && r >= surfaceRow) {
        if (r === surfaceRow) {
          const i = Math.max(1, Math.round(part * 0.55 * (n - 2)) + 1);
          ch1 = ramp[Math.min(n - 1, i)] ?? NB;
        } else {
          const depth = r - surfaceRow;
          const density = 0.42 + 0.48 * Math.min(1, depth / 8);
          ch2 = ramp[Math.min(n - 1, Math.round(density * (n - 2)) + 1)] ?? NB;
        }
      }
      l += ch1;
      dp += ch2;
    }
    light.push(l);
    deep.push(dp);
  }
  return { glass: glass.map((g) => g.join("")), light, deep };
}

/**
 * How close to the outline a cell's centre must be to carry glass: the
 * thinnest band that still joins up, corner to corner, on cells twice as
 * tall as they are wide.
 */
const edgeBand = (nx: number, ny: number, cw: number, ch: number) =>
  0.5 * Math.max(Math.abs(nx) * cw, Math.abs(ny) * ch) + 0.01;

const EDGE = ["|", "/", "-", "\\", "_"];

/**
 * The outline glyph for a cell, from the wall's outward normal (y down) and
 * the cell centre's signed distance to it. A wall slanting flatter than the
 * cell's own diagonal crosses two cells a row; the one it crosses low gets
 * `_`, so a slope types as a staircase (`\_`) rather than a doubled stroke.
 */
function edgeIndex(nx: number, ny: number, d: number, ch: number): number {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  if (ax > 0.9) return 0;
  if (ay > 0.9) return ny > 0 ? 4 : 2;
  if (ay > 0.45 && -d / ny > 0.22 * ch) return 4;
  return nx * ny > 0 ? 1 : 3;
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

type Config = {
  viscosity: number;
  ramp: string;
  ascii: boolean;
  fill: number;
  maxTilt: number;
  refill: number;
  cellSize: number;
  paused: boolean;
  motionSafe: boolean;
  dpr: number;
  colorKey: string;
  audio: TactileSound;
};

type Report = (state: TextBottleState, level: number) => void;

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (visible: boolean) => void;
  wake: () => void;
  /** Sends the bottle to an angle on a spring; `velocity` in deg/s, or null to keep its own. */
  springTo: (
    target: number,
    velocity: number | null,
    kind: "glide" | "snap",
  ) => void;
  /** Holds the bottle at an angle, 1:1 under the finger. */
  hold: (theta: number) => void;
  /** The angle it is drawn at now. */
  angle: () => number;
  /** The pivot in client coordinates. */
  pivot: () => { x: number; y: number };
  dispose: () => void;
};

type Group = { idx: Int32Array; glyph: Uint8Array; n: number };

/* Draw groups, one fill colour each. */
const G_GLASS = 0;
const G_SHINE = 1;
const G_FOAM = 2;
const G_W0 = 3;
const G_W1 = 4;
const G_W2 = 5;
const G_W3 = 6;
const GROUPS = 7;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  report: { current: Report },
  byHand: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let seed = 0x5eed_1823;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  /* Layout. */
  let w = 0;
  let h = 0;
  let cw = 6;
  let ch = 12;
  let cols = 0;
  let rows = 0;
  let ox = 0;
  let oy = 0;
  let px = 0;
  let py = 0;
  let shape: Shape | null = null;
  let mono = "monospace";
  let fontPx = 10;

  /* Per cell: 0 outside, 1 glass, 2 inside; outline glyph; reflection streak. */
  let kind = new Uint8Array(0);
  let code = new Uint8Array(0);
  let shine = new Uint8Array(0);
  let stamp = new Int32Array(0);
  let count = new Uint8Array(0);
  let classified = Number.NaN;
  let stampId = 1;

  /* Per column: the wave field (height up, px), face velocities, wet depth, surface y. */
  let eta = new Float32Array(0);
  let vel = new Float32Array(0);
  let depth = new Float32Array(0);
  let surf = new Float32Array(0);
  let agit = new Float32Array(0);
  let puddle = new Float32Array(0);
  let groups: Group[] = [];

  /* Water. */
  let volume = -1;
  let capUp = 1;
  let flow = 0;
  let pourAcc = 0;
  let dripAcc = 0;
  let glug: LoopHandle | null = null;
  let glugAudio: TactileSound | null = null;
  let lastState: TextBottleState | null = null;
  let lastLevel = -1;

  /* The bottle's angle (deg), its spring, and smoothed rates for the slosh (rad). */
  let theta = 0;
  let omega = 0;
  let target = 0;
  let spring: { stiffness: number; damping: number; mass: number } =
    springs.glide;
  let holding = false;
  let heldPrev = 0;
  let om = 0;
  let al = 0;

  /* Particles: stream, spray and drips. */
  const pX = new Float32Array(POOL);
  const pY = new Float32Array(POOL);
  const pVX = new Float32Array(POOL);
  const pVY = new Float32Array(POOL);
  const pLife = new Float32Array(POOL);
  /** 0 dead, 1 stream, 2 spray, 3 drip. */
  const pKind = new Uint8Array(POOL);
  let alive = 0;

  /* Colours, indexed as the carriers are: 1 glass, 2 shine, 3–7 water on a dark page, 8–12 on a light one. */
  const colours: string[] = Array.from({ length: 13 }, () => "rgba(0,0,0,0)");
  let lightPage = false;
  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();
  const resolve = (colour: string): [string, number] => {
    if (!reader) return ["rgba(128,128,128,1)", 0.5];
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgba(128,128,128,1)";
    reader.fillStyle = colour;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    const r = d[0] ?? 0;
    const g = d[1] ?? 0;
    const b = d[2] ?? 0;
    const a = (d[3] ?? 255) / 255;
    return [
      `rgba(${r}, ${g}, ${b}, ${r2(a)})`,
      (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
    ];
  };

  const glyphs: string[] = [];
  let rampLen = 2;
  let GLY_EDGE = 0;
  let GLY_SHINE = 0;
  let GLY_FOAM = 0;
  let GLY_DROP = 0;
  const buildGlyphs = () => {
    const c = cfg;
    if (!c) return;
    glyphs.length = 0;
    for (const g of c.ramp) glyphs.push(g);
    rampLen = glyphs.length;
    GLY_EDGE = glyphs.length;
    glyphs.push("|", "/", "-", "\\", "_");
    GLY_SHINE = glyphs.length;
    glyphs.push(":");
    GLY_FOAM = glyphs.length;
    glyphs.push(c.ascii ? "~" : (glyphs[1] ?? "."));
    GLY_DROP = glyphs.length;
    glyphs.push(c.ascii ? "'" : (glyphs[1] ?? "."));
  };

  const rampCode = (density: number) =>
    clamp(Math.round(density * (rampLen - 2)) + 1, 1, rampLen - 1);

  /** Re-letters the grid for the bottle at `deg`: which cells are glass, which can hold water. */
  const classify = (deg: number) => {
    const s = shape;
    if (!s || cols < 1) return;
    if (deg === classified) return;
    classified = deg;
    const c = Math.cos(deg * DEG);
    const sn = Math.sin(deg * DEG);
    const reach = 0.56 * s.H + 2 * Math.max(cw, ch);
    const near = Math.max(cw, ch);
    const streakX = -s.bodyHw + 1.1 * cw;
    const streakW = 0.8 * (Math.abs(c) * cw + Math.abs(sn) * ch);
    const streakTop = s.bodyCy - s.bodyHh + 0.12 * s.H;
    const streakBot = s.bodyCy + s.bodyHh - 0.18 * s.H;
    for (let r = 0; r < rows; r += 1) {
      const dy = oy + (r + 0.5) * ch - py;
      for (let k = 0; k < cols; k += 1) {
        const i = r * cols + k;
        const dx = ox + (k + 0.5) * cw - px;
        shine[i] = 0;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) {
          kind[i] = 0;
          continue;
        }
        const lx = c * dx + sn * dy;
        const ly = -sn * dx + c * dy;
        const d = bottleSdf(s, lx, ly);
        const dOut = Math.min(d, lipSdf(s, lx, ly));
        if (Math.abs(dOut) < near) {
          const e = 0.5;
          const gx =
            Math.min(bottleSdf(s, lx + e, ly), lipSdf(s, lx + e, ly)) -
            Math.min(bottleSdf(s, lx - e, ly), lipSdf(s, lx - e, ly));
          const gy =
            Math.min(bottleSdf(s, lx, ly + e), lipSdf(s, lx, ly + e)) -
            Math.min(bottleSdf(s, lx, ly - e), lipSdf(s, lx, ly - e));
          // The normal in the world: the grid never turns, the glass does.
          const wx = c * gx - sn * gy;
          const wy = sn * gx + c * gy;
          const len = Math.sqrt(wx * wx + wy * wy) || 1;
          const nx = wx / len;
          const ny = wy / len;
          const half = edgeBand(nx, ny, cw, ch);
          if (Math.abs(dOut) <= half && !inMouth(s, lx, ly, cw)) {
            kind[i] = 1;
            code[i] = GLY_EDGE + edgeIndex(nx, ny, dOut, ch);
            continue;
          }
        }
        kind[i] = d < 0 ? 2 : 0;
        if (
          d < 0 &&
          lx > streakX &&
          lx < streakX + streakW &&
          ly > streakTop &&
          ly < streakBot
        )
          shine[i] = 1;
      }
    }
  };

  /** Water area (cells) under a surface at `s` (world y), each column offset by its wave. */
  const areaAt = (s: number) => {
    let a = 0;
    for (let k = 0; k < cols; k += 1) {
      const y = s - (eta[k] ?? 0);
      for (let r = 0; r < rows; r += 1) {
        if (kind[r * cols + k] !== 2) continue;
        const bottom = oy + (r + 1) * ch;
        if (bottom <= y) continue;
        a += Math.min(1, (bottom - y) / ch);
      }
    }
    return a;
  };

  let surface = 0;
  let centroidX = 0;
  let centroidY = 0;

  /** Finds the level that holds the water's volume in the bottle as it now stands. */
  const solveLevel = () => {
    let lo = oy - h;
    let hi = oy + rows * ch + h;
    for (let i = 0; i < 26; i += 1) {
      const mid = (lo + hi) / 2;
      if (areaAt(mid) > volume) lo = mid;
      else hi = mid;
    }
    surface = (lo + hi) / 2;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = 0; k < cols; k += 1) {
      const y = surface - (eta[k] ?? 0);
      surf[k] = y;
      let wet = 0;
      for (let r = 0; r < rows; r += 1) {
        if (kind[r * cols + k] !== 2) continue;
        const bottom = oy + (r + 1) * ch;
        if (bottom <= y) continue;
        wet += Math.min(1, (bottom - y) / ch) * ch;
      }
      depth[k] = wet;
      if (wet > 0) {
        sx += (ox + (k + 0.5) * cw) * wet;
        sy += (y + wet / 2) * wet;
        sw += wet;
      }
    }
    centroidX = sw ? sx / sw : px;
    centroidY = sw ? sy / sw : py;
  };

  /** One substep of the shallow water on the columns: flux form, so nothing is lost or made. */
  const waves = (dt: number, ax: number) => {
    const c = cfg;
    if (!c) return;
    const v = clamp(c.viscosity, 0, 1);
    const g = lerp(1700, 900, v);
    const gamma = lerp(0.9, 7, v);
    for (let f = 1; f < cols; f += 1) {
      const a = depth[f - 1] ?? 0;
      const b = depth[f] ?? 0;
      if (a < 2 || b < 2) {
        vel[f] = 0;
        continue;
      }
      const u =
        (vel[f] ?? 0) +
        dt *
          ((-g * ((eta[f] ?? 0) - (eta[f - 1] ?? 0))) / cw -
            ax -
            gamma * (vel[f] ?? 0));
      vel[f] = clamp(u, -700, 700);
    }
    vel[0] = 0;
    vel[cols] = 0;
    let mean = 0;
    let wetCols = 0;
    for (let k = 0; k < cols; k += 1) {
      const d = depth[k] ?? 0;
      if (d < 2) {
        eta[k] = 0;
        agit[k] = (agit[k] ?? 0) * 0.9;
        continue;
      }
      const left = Math.min(depth[k - 1] ?? 0, d) * (vel[k] ?? 0);
      const right = Math.min(depth[k + 1] ?? 0, d) * (vel[k + 1] ?? 0);
      const change = (dt * (right - left)) / cw;
      eta[k] = clamp((eta[k] ?? 0) - change, -0.8 * d - ch, 0.8 * d + 2 * ch);
      agit[k] = lerp(agit[k] ?? 0, Math.abs(change) / dt, 0.08);
      mean += eta[k] ?? 0;
      wetCols += 1;
    }
    // The level absorbs any drift, so the field stays about zero mean.
    if (wetCols) {
      mean /= wetCols;
      for (let k = 0; k < cols; k += 1)
        if ((depth[k] ?? 0) >= 2) eta[k] = (eta[k] ?? 0) - mean;
    }
  };

  const spawn = (
    kindOf: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) => {
    for (let i = 0; i < POOL; i += 1) {
      if (pKind[i] !== 0) continue;
      pKind[i] = kindOf;
      pX[i] = x;
      pY[i] = y;
      pVX[i] = vx;
      pVY[i] = vy;
      pLife[i] = 0;
      alive += 1;
      return;
    }
  };

  const columnAt = (x: number) =>
    clamp(Math.floor((x - ox) / cw), 0, Math.max(0, cols - 1));

  /** The mouth's two lip points in the world, lower first. */
  const lips = () => {
    const s = shape;
    if (!s) return null;
    const c = Math.cos(theta * DEG);
    const sn = Math.sin(theta * DEG);
    const inner = s.mouthHw - 0.4 * cw;
    const y0 = s.mouthY + 0.5 * ch;
    const ax = px + c * -inner - sn * y0;
    const ay = py + sn * -inner + c * y0;
    const bx = px + c * inner - sn * y0;
    const by = py + sn * inner + c * y0;
    return ay >= by
      ? { lx: ax, ly: ay, hx: bx, hy: by }
      : { lx: bx, ly: by, hx: ax, hy: ay };
  };

  const shapeOpen = () => (shape ? shape.mouthHw - 0.4 * cw : 4);

  const stopGlug = () => {
    glug?.stop();
    glug = null;
  };

  /** Water leaving the mouth: the head over the lower lip, and a glug when the mouth is drowned. */
  const pour = (dt: number) => {
    const c = cfg;
    const L = lips();
    flow = 0;
    if (!c || !L || volume <= 0.01) {
      stopGlug();
      return;
    }
    const k = columnAt(L.lx);
    const s = (depth[k] ?? 0) > 0 ? (surf[k] ?? surface) : surface;
    const head = L.ly - s;
    if (head <= 0.5) {
      stopGlug();
      return;
    }
    const v = clamp(c.viscosity, 0, 1);
    const span = Math.max(1, L.ly - L.hy);
    const drowned = clamp(head / span, 0, 1);
    const open = 2 * shapeOpen() * drowned;
    const speed = Math.sqrt(2 * 1400 * head);
    let q = (lerp(0.42, 0.11, v) * open * speed) / (cw * ch);
    if (drowned > 0.97) {
      // Air has to fight its way in: the flow comes in gulps.
      const rate = lerp(6, 2.6, v);
      const wave = 0.5 + 0.5 * Math.sin(clock * rate * Math.PI * 2);
      q *= 0.3 + 0.7 * wave * wave;
    }
    q = Math.min(q, volume / dt);
    flow = q;
    volume = Math.max(0, volume - q * dt);
    if (c.motionSafe) {
      pourAcc += (q * dt) / PARCEL;
      const dirX = Math.sin(theta * DEG);
      const dirY = -Math.cos(theta * DEG);
      const exit = Math.min(speed * 0.55, 520);
      while (pourAcc >= 1) {
        pourAcc -= 1;
        const t = rand() * drowned;
        const x = L.lx + (L.hx - L.lx) * t + dirX * ch * 0.6;
        const y = L.ly + (L.hy - L.ly) * t + dirY * ch * 0.6;
        const spread = (rand() - 0.5) * 0.16;
        spawn(
          1,
          x,
          y,
          (dirX + spread * -dirY) * exit,
          (dirY + spread * dirX) * exit,
        );
      }
    }
    // The glug answers a tip by hand or key, never a tip from the page.
    const audio = c.audio;
    const activated =
      (
        navigator as Navigator & {
          userActivation?: { hasBeenActive: boolean };
        }
      ).userActivation?.hasBeenActive ?? true;
    if (byHand.current && activated) {
      const gain = clamp(0.25 + q / 60, 0.25, 0.7);
      const pitch = 0.7 + 0.6 * clamp(volume / capUp, 0, 1) - 0.25 * v;
      if (!glug || glugAudio !== audio) {
        stopGlug();
        glugAudio = audio;
        glug = audio.start("glug", { gain, pitch });
      } else glug.set({ gain, pitch });
    }
  };

  /** Drips from an unseen tap into an upright bottle that is not yet full. */
  const refillStep = (dt: number) => {
    const c = cfg;
    const s = shape;
    if (!c || !s || c.refill <= 0) return false;
    const want = clamp(c.fill, 0, 1) * capUp;
    if (Math.abs(theta) > UPRIGHT || flow > 0 || volume >= want - 0.25)
      return false;
    const rate = want / (Math.max(500, c.refill) / 1000);
    if (!c.motionSafe) {
      volume = Math.min(want, volume + rate * dt);
      return true;
    }
    dripAcc += dt;
    const every = 0.085;
    while (dripAcc >= every) {
      dripAcc -= every;
      const mx = px - Math.sin(theta * DEG) * s.mouthY;
      spawn(3, mx + (rand() - 0.5) * cw, oy, 0, 0);
    }
    return true;
  };

  /** Stream, spray and drips: ballistic, landing in the puddle or the mouth. */
  const particles = (dt: number) => {
    const c = cfg;
    const s = shape;
    if (!c || !s || !alive) return;
    const floor = oy + (rows - 1) * ch;
    const want = clamp(c.fill, 0, 1) * capUp;
    const rate = want / (Math.max(500, c.refill) / 1000);
    const mouth = py + Math.cos(theta * DEG) * s.mouthY;
    for (let i = 0; i < POOL; i += 1) {
      const kindOf = pKind[i] ?? 0;
      if (!kindOf) continue;
      const vy = (pVY[i] ?? 0) + FALL * dt;
      pVY[i] = vy;
      pX[i] = (pX[i] ?? 0) + (pVX[i] ?? 0) * dt;
      pY[i] = (pY[i] ?? 0) + vy * dt;
      pLife[i] = (pLife[i] ?? 0) + dt;
      const x = pX[i] ?? 0;
      const y = pY[i] ?? 0;
      let dead = x < 0 || x > w || (pLife[i] ?? 0) > 3;
      if (kindOf === 3 && y >= mouth + ch * 0.5) {
        volume = Math.min(want, volume + rate * 0.085);
        dead = true;
      } else if (kindOf === 1 && y >= floor) {
        const k = columnAt(x);
        puddle[k] = (puddle[k] ?? 0) + 0.22;
        if (rand() < 0.28)
          spawn(2, x, floor - 2, (rand() - 0.5) * 140, -90 - rand() * 120);
        dead = true;
      } else if (kindOf === 2 && (y >= floor || (pLife[i] ?? 0) > 0.5)) {
        dead = true;
      }
      if (dead) {
        pKind[i] = 0;
        alive -= 1;
      }
    }
  };

  /** The puddle spreads a little and soaks away. */
  const soak = (dt: number) => {
    let any = false;
    for (let k = 0; k < cols; k += 1) {
      const p = puddle[k] ?? 0;
      if (p <= 0) continue;
      const spread =
        0.9 * dt * ((puddle[k - 1] ?? p) + (puddle[k + 1] ?? p) - 2 * p);
      const next = (p + spread) * (1 - 0.45 * dt) - 0.06 * dt;
      puddle[k] = next > 0.01 ? Math.min(next, 3) : 0;
      if ((puddle[k] ?? 0) > 0) any = true;
    }
    return any;
  };

  const stillWater = () => {
    let peak = 0;
    for (let k = 0; k < cols; k += 1) {
      peak = Math.max(peak, Math.abs(eta[k] ?? 0), Math.abs(vel[k] ?? 0) / 20);
    }
    return peak < 0.08;
  };

  const settleWater = () => {
    eta.fill(0);
    vel.fill(0);
    agit.fill(0);
  };

  const stateNow = (refilling: boolean): TextBottleState => {
    if (flow > 0) return "pouring";
    if (refilling) return "refilling";
    if (volume < 0.03 * capUp) return "empty";
    const springing =
      !holding && (Math.abs(target - theta) > 0.05 || Math.abs(omega) > 0.5);
    if (holding || springing || !stillWater()) return "sloshing";
    return "resting";
  };

  const emit = (state: TextBottleState) => {
    const lv = Math.round(clamp(volume / capUp, 0, 1) * 20) / 20;
    if (state === lastState && lv === lastLevel) return;
    lastState = state;
    lastLevel = lv;
    report.current(state, lv);
  };

  /** Advances everything by dt; returns whether anything is still moving. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c || !shape) return false;
    clock += dt;
    let moving = false;
    const before = theta;
    if (!holding) {
      const n = Math.max(1, Math.ceil(dt / STEP));
      const hstep = dt / n;
      for (let i = 0; i < n; i += 1) {
        omega +=
          ((spring.stiffness * (target - theta) - spring.damping * omega) /
            spring.mass) *
          hstep;
        theta += omega * hstep;
      }
      if (Math.abs(target - theta) < 0.02 && Math.abs(omega) < 0.2) {
        theta = target;
        omega = 0;
      } else moving = true;
    } else {
      theta = heldPrev;
      moving = true;
    }
    // Smoothed angular rate and acceleration (rad), for the slosh.
    const rate = ((theta - before) / Math.max(dt, 1e-4)) * DEG;
    const prevOm = om;
    om = lerp(om, rate, Math.min(1, dt / 0.03));
    al = lerp(al, (om - prevOm) / Math.max(dt, 1e-4), Math.min(1, dt / 0.05));
    classify(Math.round(theta * 100) / 100);
    if (!c.paused && c.motionSafe) {
      const rx = centroidX - px;
      const ry = centroidY - py;
      const ax = clamp(0.6 * (-al * ry - om * om * rx), -3000, 3000);
      const n = Math.max(1, Math.ceil(dt / STEP));
      for (let i = 0; i < n; i += 1) waves(dt / n, ax);
      if (stillWater() && Math.abs(ax) < 1) settleWater();
      else moving = true;
    } else if (!c.motionSafe) settleWater();
    solveLevel();
    let refilling = false;
    if (!c.paused) {
      pour(dt);
      if (flow > 0) moving = true;
      refilling = refillStep(dt);
      if (refilling) moving = true;
      particles(dt);
      if (alive) moving = true;
      if (soak(dt)) moving = true;
    } else stopGlug();
    if (flow <= 0) stopGlug();
    emit(stateNow(refilling));
    return moving;
  };

  /* ---------------- drawing ---------------- */

  const push = (g: number, i: number, glyph: number) => {
    const grp = groups[g];
    if (!grp || grp.n >= grp.idx.length) return;
    grp.idx[grp.n] = i;
    grp.glyph[grp.n] = glyph;
    grp.n += 1;
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || !visible || cols < 1) return;
    for (const g of groups) g.n = 0;
    stampId += 1;
    const dark = lightPage ? 8 : 3;
    const motion = c.motionSafe;
    for (let k = 0; k < cols; k += 1) {
      const y = surf[k] ?? surface;
      const foamy = motion && (agit[k] ?? 0) > 22;
      for (let r = 0; r < rows; r += 1) {
        const i = r * cols + k;
        const kd = kind[i];
        if (kd === 1) {
          push(G_GLASS, i, code[i] ?? GLY_EDGE);
          stamp[i] = stampId;
          continue;
        }
        if (kd !== 2) continue;
        const top = oy + r * ch;
        const cover = clamp((top + ch - y) / ch, 0, 1);
        if (cover < 0.12) {
          if (shine[i]) {
            push(G_SHINE, i, GLY_SHINE);
            stamp[i] = stampId;
          }
          continue;
        }
        stamp[i] = stampId;
        const below = top + ch / 2 - y;
        if (cover < 1 || below < ch * 0.5) {
          if (foamy) push(G_FOAM, i, GLY_FOAM);
          else push(G_W0, i, rampCode(cover * 0.55));
          continue;
        }
        const density = 0.42 + 0.48 * Math.min(1, below / (8 * ch));
        const tier = below < 2.5 * ch ? G_W1 : below < 7 * ch ? G_W2 : G_W3;
        push(tier, i, rampCode(density));
      }
    }
    // The stream: count glyphs per cell, then letter each cell by how many.
    if (motion && alive) {
      for (let p = 0; p < POOL; p += 1) {
        if (!pKind[p]) continue;
        const k = Math.floor(((pX[p] ?? 0) - ox) / cw);
        const r = Math.floor(((pY[p] ?? 0) - oy) / ch);
        if (k < 0 || k >= cols || r < 0 || r >= rows) continue;
        const i = r * cols + k;
        if (stamp[i] === stampId) continue;
        if (stamp[i] !== -stampId) {
          stamp[i] = -stampId;
          count[i] = 0;
        }
        count[i] = Math.min(250, (count[i] ?? 0) + (pKind[p] === 1 ? 2 : 1));
      }
      for (let p = 0; p < POOL; p += 1) {
        if (!pKind[p]) continue;
        const k = Math.floor(((pX[p] ?? 0) - ox) / cw);
        const r = Math.floor(((pY[p] ?? 0) - oy) / ch);
        if (k < 0 || k >= cols || r < 0 || r >= rows) continue;
        const i = r * cols + k;
        if (stamp[i] !== -stampId) continue;
        stamp[i] = stampId;
        if (pKind[p] === 1) {
          const n = count[i] ?? 1;
          push(n > 3 ? G_W1 : G_W0, i, rampCode(clamp(0.45 + n * 0.09, 0, 1)));
        } else push(G_FOAM, i, GLY_DROP);
      }
    } else if (!motion && flow > 0) {
      // Reduced motion: the stream is a still column from the mouth down.
      const L = lips();
      if (L) {
        const dirX = Math.sin(theta * DEG);
        const dirY = -Math.cos(theta * DEG);
        const v0 = 160;
        for (let t = 0; t < 1.2; t += 0.012) {
          const x = (L.lx + L.hx) / 2 + dirX * v0 * t;
          const y = (L.ly + L.hy) / 2 + dirY * v0 * t + 0.5 * FALL * t * t;
          const k = Math.floor((x - ox) / cw);
          const r = Math.floor((y - oy) / ch);
          if (k < 0 || k >= cols || r < 0 || r >= rows) break;
          const i = r * cols + k;
          if (stamp[i] === stampId) continue;
          stamp[i] = stampId;
          push(G_W1, i, rampCode(0.8));
        }
      }
    }
    // The puddle along the floor.
    for (let k = 0; k < cols; k += 1) {
      const p = puddle[k] ?? 0;
      if (p < 0.05) continue;
      const i = (rows - 1) * cols + k;
      if (stamp[i] !== stampId) {
        stamp[i] = stampId;
        push(G_W2, i, rampCode(clamp(p / 1.4, 0.2, 1)));
      }
      if (p > 1.4 && rows > 1) {
        const j = (rows - 2) * cols + k;
        if (stamp[j] !== stampId) {
          stamp[j] = stampId;
          push(G_W0, j, rampCode(clamp((p - 1.4) / 1.4, 0.15, 0.6)));
        }
      }
    }

    const dpr = canvas.width / Math.max(1, w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${fontPx}px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fills = [
      colours[1],
      colours[2],
      colours[dark],
      colours[dark + 1],
      colours[dark + 2],
      colours[dark + 3],
      colours[dark + 4],
    ];
    for (let g = 0; g < GROUPS; g += 1) {
      const grp = groups[g];
      if (!grp || !grp.n) continue;
      ctx.fillStyle = fills[g] ?? "gray";
      for (let n = 0; n < grp.n; n += 1) {
        const i = grp.idx[n] ?? 0;
        const r = Math.floor(i / cols);
        const k = i - r * cols;
        ctx.fillText(
          glyphs[grp.glyph[n] ?? 1] ?? ".",
          ox + (k + 0.5) * cw,
          oy + (r + 0.5) * ch,
        );
      }
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /* ---------------- loop ---------------- */

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden || !ctx) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const pick = (i: number) => {
      const el = kids[i];
      return el ? resolve(getComputedStyle(el).color) : resolve("gray");
    };
    lightPage = pick(0)[1] > 0.5;
    for (let i = 1; i < 13; i += 1) colours[i] = pick(i)[0];
    const probe = kids[13];
    if (probe) mono = getComputedStyle(probe).fontFamily || "monospace";
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 8 || nh < 8) return;
    w = nw;
    h = nh;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    fontPx = clamp(Math.round(c.cellSize), 7, 18);
    ctx.font = `${fontPx}px ${mono}`;
    cw = r2(Math.max(fontPx * 0.5, ctx.measureText("M").width));
    ch = Math.round(fontPx * 1.2);
    const nc = Math.max(1, Math.floor(w / cw));
    const nr = Math.max(1, Math.floor(h / ch));
    if (nc !== cols || nr !== rows) {
      cols = nc;
      rows = nr;
      const cells = cols * rows;
      kind = new Uint8Array(cells);
      code = new Uint8Array(cells);
      shine = new Uint8Array(cells);
      stamp = new Int32Array(cells);
      count = new Uint8Array(cells);
      eta = new Float32Array(cols);
      vel = new Float32Array(cols + 1);
      depth = new Float32Array(cols);
      surf = new Float32Array(cols);
      agit = new Float32Array(cols);
      puddle = new Float32Array(cols);
      groups = Array.from({ length: GROUPS }, () => ({
        idx: new Int32Array(cells),
        glyph: new Uint8Array(cells),
        n: 0,
      }));
    }
    ox = (w - cols * cw) / 2;
    oy = (h - rows * ch) / 2;
    px = w / 2;
    py = h * 0.4;
    shape = shapeFor(bottleHeight(w, h), cw, ch);
    // Capacity upright, to keep the level a fraction of the bottle across sizes.
    const was = volume >= 0 ? volume / capUp : clamp(c.fill, 0, 1);
    classified = Number.NaN;
    classify(0);
    let cap = 0;
    for (let i = 0; i < kind.length; i += 1) if (kind[i] === 2) cap += 1;
    capUp = Math.max(1, cap);
    volume = clamp(was, 0, 1) * capUp;
    classified = Number.NaN;
    classify(Math.round(theta * 100) / 100);
    settleWater();
    solveLevel();
    emit(stateNow(false));
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
      if (!was || was.ramp !== next.ramp || was.ascii !== next.ascii) {
        buildGlyphs();
        // The outline's glyph codes sit after the ramp: re-letter the glass.
        classified = Number.NaN;
        classify(Math.round(theta * 100) / 100);
      }
      if (!was) {
        readColours();
        theta = target;
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.cellSize !== next.cellSize || was.dpr !== next.dpr) resize();
      if (was.audio !== next.audio) stopGlug();
      if (!next.motionSafe) {
        theta = target;
        omega = 0;
        alive = 0;
        pKind.fill(0);
      }
      if (next.paused) stopGlug();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      resize();
    },
    setVisible(v) {
      visible = v;
      if (v) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    springTo(next, velocity, kindOf) {
      holding = false;
      target = next;
      spring = kindOf === "snap" ? springs.snap : springs.glide;
      if (velocity !== null) omega = velocity;
      if (!cfg?.motionSafe) {
        theta = next;
        omega = 0;
      }
      kick();
    },
    hold(next) {
      holding = true;
      heldPrev = next;
      if (!cfg?.motionSafe) {
        theta = next;
        target = next;
      }
      kick();
    },
    angle: () => theta,
    pivot() {
      const r = root.getBoundingClientRect();
      return { x: r.left + px, y: r.top + py };
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      stopGlug();
    },
  };
}

/* ------------------------------------------------------------------ */

const KEY_STEP = 10;

const describe = (tilt: number, level: number, state: TextBottleState) => {
  const pct = `${Math.round(level * 100)}%`;
  if (state === "pouring") return `Pouring, ${pct} left`;
  if (state === "empty") return "Empty";
  const lean =
    Math.abs(tilt) < 3
      ? "Upright"
      : `Tilted ${Math.abs(Math.round(tilt))}° ${tilt > 0 ? "right" : "left"}`;
  return state === "refilling"
    ? `${lean}, ${pct} full, refilling`
    : `${lean}, ${pct} full`;
};

/**
 * A bottle of water typed on a grid of monospace cells. The glass is one ring
 * of edge glyphs chosen from the outline's direction at each cell, so as the
 * bottle turns its outline re-letters itself on the fixed grid; the water is a
 * density ramp, light at the surface and heavier with depth.
 *
 * Underneath, the water is a shallow-water simulation on the grid's columns
 * in flux form (volume is conserved exactly), with the level solved every
 * frame so it holds the same area inside the turned glass. Tipping the bottle
 * accelerates its walls, so the water lags, runs up the glass and sloshes back
 * before it settles. Past the point where the mouth's lip goes under the
 * level it pours: a stream of glyphs leaves the neck on real ballistics, in
 * gulps when the mouth is drowned, splashes on the floor and gathers in a
 * puddle that soaks away. Stood upright it refills slowly from a dripping tap.
 *
 * It is a `role="slider"`: drag it round, or use the arrow keys (Enter stands
 * it up). Under reduced motion it turns at once, the water stays level and a
 * pour is a still column, while the level still drains and refills.
 */
export function TextBottle({
  tilt,
  defaultTilt = 0,
  onTiltChange,
  viscosity = 0.35,
  charset = "ascii",
  ramp,
  fill = 0.7,
  maxTilt = 135,
  refill = 7000,
  cellSize = 10,
  waterColor = "var(--accent-bright)",
  glassColor,
  onStateChange,
  onLevelChange,
  sound = false,
  label = "Bottle of water",
  paused = false,
  disabled = false,
  dpr = 2,
  className,
}: TextBottleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const limit = clamp(maxTilt, 30, 170);
  const lowest = -limit;
  const [own, setOwn] = React.useState(() => clamp(defaultTilt, -limit, limit));
  const current = Math.round(clamp(tilt ?? own, -limit, limit));
  const glyphRamp =
    ramp && ramp.length >= 2 ? ramp : (RAMPS[charset] ?? RAMPS.ascii);

  const [reading, setReading] = React.useState<{
    state: TextBottleState;
    level: number;
  }>(() => ({
    state: "resting",
    level: Math.round(clamp(fill, 0, 1) * 20) / 20,
  }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const byHand = React.useRef(false);
  const committed = React.useRef<number | null>(null);
  const shown = React.useRef(current);
  const grab = React.useRef({
    raw: 0,
    angle: 0,
    tracker: createVelocityTracker(),
  });

  const config: Config = {
    viscosity,
    ramp: glyphRamp,
    ascii: !ramp && charset === "ascii",
    fill,
    maxTilt: limit,
    refill,
    cellSize,
    paused,
    motionSafe,
    dpr,
    colorKey: `${waterColor}|${glassColor ?? ""}`,
    audio,
  };
  const latest = React.useRef(config);

  const prevState = React.useRef<TextBottleState>("resting");
  const prevLevel = React.useRef(Math.round(clamp(fill, 0, 1) * 20) / 20);
  const onReport = React.useRef<Report>(() => {});
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
    onReport.current = (state, level) => {
      const before = prevState.current;
      prevState.current = state;
      setReading({ state, level });
      if (level !== prevLevel.current) {
        prevLevel.current = level;
        onLevelChange?.(level);
      }
      if (state !== before) {
        onStateChange?.(state, level);
        const text =
          state === "pouring"
            ? "Pouring."
            : state === "empty"
              ? "Empty. Stand it up to refill."
              : before === "refilling" && level >= clamp(fill, 0, 1) - 0.05
                ? "Full again."
                : "";
        if (text) setSaid((s) => ({ n: s.n + 1, text }));
      }
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, onReport, byHand);
    engine.current = e;
    e.springTo(shown.current, 0, "snap");
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    let alive = true;
    // Metrics change once the mono face arrives.
    void document.fonts?.ready.then(() => {
      if (alive) e.resize();
    });
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  // A host (or a tweak) that moves `tilt` gets the same turn a key would.
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    if (committed.current !== current) byHand.current = false;
    committed.current = null;
    engine.current?.springTo(current, null, "snap");
  }, [current]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  /** Lands the bottle on an angle and reports it, from the gesture or key that chose it. */
  const commit = (
    next: number,
    velocity: number | null,
    kind: "glide" | "snap",
  ) => {
    const value = Math.round(clamp(next, -limit, limit));
    byHand.current = true;
    if (tilt === undefined) {
      setOwn(value);
      shown.current = value;
      engine.current?.springTo(value, velocity, kind);
    } else {
      // Controlled: go back to where the host says; if it takes the change,
      // the effect above carries the bottle on before a frame is drawn.
      committed.current = value;
      engine.current?.springTo(current, velocity, kind);
    }
    if (value !== current) onTiltChange?.(value);
  };

  const pointerAngle = (x: number, y: number) => {
    const p = engine.current?.pivot();
    if (!p) return { a: 0, r: 0 };
    return { a: Math.atan2(y - p.y, x - p.x), r: Math.hypot(x - p.x, y - p.y) };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      byHand.current = true;
      const g = grab.current;
      g.raw = e.angle();
      g.angle = pointerAngle(point.x, point.y).a;
      g.tracker.reset();
      g.tracker.push(g.raw, 0, performance.now());
      e.hold(g.raw);
    },
    onMove: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      const g = grab.current;
      const { a, r } = pointerAngle(point.x, point.y);
      let d = a - g.angle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      g.angle = a;
      // Near the pivot the angle is all noise: it counts for less there.
      g.raw += (d / DEG) * clamp((r - 10) / 50, 0, 1);
      const shownAngle = rubberClamp(g.raw, -limit, limit, 60);
      g.tracker.push(shownAngle, 0, performance.now());
      e.hold(r2(shownAngle));
    },
    onEnd: () => {
      const e = engine.current;
      if (!e) return;
      const v = grab.current.tracker.velocity().x;
      const now = e.angle();
      commit(project(now, v, 0.993), clamp(v, -900, 900), "glide");
    },
    onCancel: () => engine.current?.springTo(current, null, "glide"),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = event.shiftKey ? 3 : 1;
    const from = shown.current;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = from + KEY_STEP * big;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = from - KEY_STEP * big;
        break;
      case "PageUp":
        next = from + 45;
        break;
      case "PageDown":
        next = from - 45;
        break;
      case "Home":
        next = -limit;
        break;
      case "End":
        next = limit;
        break;
      case "Enter":
      case " ":
        next = 0;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next, null, "snap");
  };

  const still = React.useMemo(
    () => stillArt(fill, glyphRamp),
    [fill, glyphRamp],
  );
  const water = waterColor;
  const tones = (ls: number[]) =>
    ls.map((l, i) =>
      i === 0
        ? `oklch(from ${water} ${l} calc(c * 0.55) h)`
        : `oklch(from ${water} ${l} c h)`,
    );
  const carrierColours = [
    "var(--background)",
    glassColor ?? "color-mix(in oklab, var(--ink) 66%, transparent)",
    "color-mix(in oklab, var(--ink) 30%, transparent)",
    ...tones([0.93, 0.86, 0.76, 0.66, 0.56]),
    ...tones([0.68, 0.66, 0.57, 0.49, 0.41]),
  ];
  const { cols, rows, cw, ch } = STILL;
  const valueText = describe(current, reading.level, reading.state);

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/text-bottle relative isolate h-112 w-full select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${cols * cw} ${rows * ch}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full font-mono transition-opacity duration-300 group-data-live/text-bottle:opacity-0"
        fontSize={10}
      >
        {(
          [
            [
              "glass",
              still.glass,
              "color-mix(in oklab, var(--ink) 66%, transparent)",
            ],
            ["light", still.light, `oklch(from ${water} 0.8 calc(c * 0.6) h)`],
            ["deep", still.deep, `oklch(from ${water} 0.62 c h)`],
          ] as const
        ).map(([key, lines, colour]) => (
          <g key={key} style={{ fill: colour }}>
            {lines.map((line, r) =>
              line.trim() ? (
                <text
                  key={r}
                  x={0}
                  y={r * ch + 9}
                  textLength={cols * cw}
                  lengthAdjust="spacing"
                >
                  {line}
                </text>
              ) : null,
            )}
          </g>
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/text-bottle:opacity-100"
      />
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={`${uid}-hint`}
        aria-valuemin={lowest}
        aria-valuemax={limit}
        aria-valuenow={current}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute inset-0 touch-none rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      />
      <span id={`${uid}-hint`} className="sr-only">
        Drag the bottle round to tip it, or use the arrow keys. Home and End tip
        it all the way; Enter stands it upright to refill.
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        {carrierColours.map((colour, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
        <span className="font-mono" />
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
