"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BeadFountainFinish = "steel" | "brass" | "copper" | "black";
export type BeadFountainState = "rest" | "pulling" | "falling" | "winding";

export type BeadFountainProps = {
  /** Each bead's diameter, px (3 to 10). @default 5 */
  beadSize?: number;
  /** How many beads the chain has (20 to 400). @default 160 */
  length?: number;
  /** The metal: brushed steel, brass, copper or black nickel. @default "steel" */
  finish?: BeadFountainFinish;
  /** Gravity, as a share of the house pull (0.3 to 2). @default 1 */
  gravity?: number;
  /** How hard the pile kicks each bead up as it leaves, as a share of the pull's speed: the fountain's height. @default 0.6 */
  lift?: number;
  /** Air drag on the beads, 0 (none) to 1 (thick air). @default 0.2 */
  drag?: number;
  /** How fast the pot winds the chain back in, beads a second. @default 45 */
  rewindSpeed?: number;
  /** How long the dropped chain lies still before the pot winds it in, ms. @default 900 */
  rewindDelay?: number;
  /** Where the pot stands, as a fraction of the box's width. @default 0.2 */
  potPosition?: number;
  /** Content beside the pot: a product line, a heading. The chain passes in front of it. */
  children?: React.ReactNode;
  /** The pointer and keys pull the chain. @default true */
  interactive?: boolean;
  /** The chain rests in its pot and nothing pulls it. @default false */
  disabled?: boolean;
  /** Hold the chain where it is. @default false */
  paused?: boolean;
  /** Ticks as beads run over the rim and as the dropped chain lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The chain's accessible name, for the keyboard's way in. @default "Bead chain" */
  label?: string;
  /** The chain changed what it is doing: resting in the pot, being pulled, falling, or winding in. */
  onStateChange?: (state: BeadFountainState) => void;
  /** How many beads are out of the pot, at most ten times a second. */
  onPour?: (out: number) => void;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

type Shades = { base: string; dark: string; light: string };

/** Finishes as pigment: a token's hue at fixed lightness, so the metal reads the same on both themes. */
const FINISHES: Record<BeadFountainFinish, Shades> = {
  steel: {
    base: "oklch(from var(--ink-2) 0.74 0.012 h)",
    dark: "oklch(from var(--ink-2) 0.4 0.016 h)",
    light: "oklch(from var(--ink-2) 0.98 0.004 h)",
  },
  brass: {
    base: "oklch(from var(--warn) 0.76 0.11 h)",
    dark: "oklch(from var(--warn) 0.46 0.08 h)",
    light: "oklch(from var(--warn) 0.97 0.05 h)",
  },
  copper: {
    base: "oklch(from var(--danger) 0.64 0.12 calc(h + 25))",
    dark: "oklch(from var(--danger) 0.4 0.09 calc(h + 25))",
    light: "oklch(from var(--danger) 0.94 0.05 calc(h + 30))",
  },
  black: {
    base: "oklch(from var(--ink-2) 0.34 0.01 h)",
    dark: "oklch(from var(--ink-2) 0.16 0.01 h)",
    light: "oklch(from var(--ink-2) 0.86 0.01 h)",
  },
};

/** The pot is glazed stoneware: a warm clay pigment, its dark inside, and the shadow under everything. */
const POT = {
  glaze: "oklch(from var(--warn) 0.6 0.05 calc(h - 20))",
  deep: "oklch(from var(--warn) 0.42 0.04 calc(h - 20))",
  inside: "oklch(from var(--ink-2) 0.2 0.01 h)",
  shadow: "oklch(from var(--ink-2) 0.15 0.01 h)",
};

const STEP = 1 / 120;
const ITERATIONS = 16;
const G = 1800;
/** Beads out of the pot at rest, the tagged end hanging over the rim. */
const REST_OUT = 12;
const KEY_STEP = 24;
/** The catch: how long the end takes to fly to a hand that took it, s. */
const CATCH = 0.12;
const REPORT_EVERY = 100;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The pot's geometry in a box, px: centre, rim, floor, size. */
function potIn(w: number, h: number, potPosition: number) {
  const floor = h - 10;
  const potW = clamp(h * 0.36, 52, 84);
  const potH = clamp(h * 0.3, 44, 70);
  const wall = 5;
  const cx = clamp(
    potPosition * w,
    potW / 2 + 14,
    Math.max(potW / 2 + 14, w - potW / 2 - 14),
  );
  return {
    cx,
    floor,
    potW,
    potH,
    wall,
    rimY: floor - potH,
    left: cx - potW / 2,
    right: cx + potW / 2,
    mx: cx,
    my: floor - potH + 6,
    lip: potW * 0.13,
  };
}

type Pot = ReturnType<typeof potIn>;

/** Any CSS colour the canvas understands, as an `rgb()` string. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): string => {
    if (!ctx) return colour;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
  };
}

type Config = {
  beadSize: number;
  length: number;
  finish: BeadFountainFinish;
  gravity: number;
  lift: number;
  drag: number;
  rewindSpeed: number;
  rewindDelay: number;
  potPosition: number;
  interactive: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
};

type Report = {
  state: (s: BeadFountainState) => void;
  pour: (out: number) => void;
  tick: (kind: "rim" | "land", speed: number, x: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  hover: (x: number, y: number) => void;
  grab: (x: number, y: number) => void;
  handTo: (x: number, y: number) => void;
  letGo: () => void;
  toggle: (x: number, y: number) => void;
  keyMove: (dx: number, dy: number) => void;
  keyToggle: () => void;
  keyFocus: (on: boolean) => void;
  held: () => boolean;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  report: { current: Report },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = colourReader();
  let cfg: Config | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let pot: Pot = potIn(400, 208, 0.2);
  let frame = 0;
  let last = 0;
  let t = 0;
  let disposed = false;
  let started = false;

  // The chain: bead 0 is the tagged end, bead out − 1 the one at the mouth.
  let n = 0;
  let out = 0;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let s = 6;
  let rb = 2.5;
  let mouthLen = 6;
  let feedV = 0;
  let stillFor = 0;
  let state: BeadFountainState = "rest";
  let releasedAt = -10;
  let restSince = 0;
  let settledAt = -1;
  let lastReport = -1;
  let reportedOut = -1;
  // Reduced motion's let-go: the chain fades and is back in its pot.
  let fadeFrom = -1;
  let alpha = 1;
  let grid = new Int32Array(0);
  let nextInCell = new Int32Array(0);

  const hand = {
    held: false,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    // The catch: from where the end was to the hand, over CATCH.
    from: { x: 0, y: 0 },
    caughtAt: -1,
    key: false,
    keyX: 0,
    keyY: 0,
    vx: 0,
    vy: 0,
  };

  let sprite: HTMLCanvasElement | null = null;
  let inks = {
    base: "gray",
    dark: "black",
    light: "white",
    glaze: "gray",
    deep: "black",
    inside: "black",
    shadow: "black",
  };

  const setState = (next: BeadFountainState) => {
    if (state === next) return;
    if (next === "rest") restSince = t;
    state = next;
    report.current.state(next);
  };

  const buildSprite = () => {
    const d = size.dpr;
    const r = rb * d;
    const px2 = Math.max(4, Math.ceil(r * 2 + 2));
    const sp = sprite ?? document.createElement("canvas");
    sp.width = px2;
    sp.height = px2;
    const c = sp.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, px2, px2);
    const m = px2 / 2;
    const g = c.createRadialGradient(
      m - r * 0.38,
      m - r * 0.42,
      r * 0.05,
      m,
      m,
      r,
    );
    g.addColorStop(0, inks.light);
    g.addColorStop(0.32, inks.base);
    g.addColorStop(0.85, inks.dark);
    g.addColorStop(1, inks.dark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(m, m, r, 0, Math.PI * 2);
    c.fill();
    sprite = sp;
  };

  const readColours = () => {
    const kids = carriers.children;
    const get = (i: number) => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : "gray";
    };
    inks = {
      base: get(0),
      dark: get(1),
      light: get(2),
      glaze: get(3),
      deep: get(4),
      inside: get(5),
      shadow: get(6),
    };
    buildSprite();
  };

  /** Lays the chain out at rest: in the pot, its end draped over the right rim. */
  const restLayout = () => {
    const c = cfg;
    if (!c) return;
    out = Math.min(REST_OUT, n);
    mouthLen = s;
    const capX = pot.right - pot.wall / 2;
    const capY = pot.rimY - pot.wall / 2 - rb;
    const pts: [number, number][] = [
      [pot.mx, pot.my],
      [capX - rb, capY],
      [pot.right + rb + 0.5, pot.rimY + rb],
      [pot.right + rb + 0.5, pot.floor - rb],
    ];
    const along = (dist: number): [number, number] => {
      let left = dist;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i] ?? [0, 0];
        const b = pts[i + 1] ?? [0, 0];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= len || i === pts.length - 2) {
          const k = len > 0 ? Math.min(1, left / len) : 0;
          return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
        }
        left -= len;
      }
      return pts[0] ?? [0, 0];
    };
    for (let j = 0; j < out; j += 1) {
      const [bx, by] = along((out - j) * s);
      x[j] = bx;
      y[j] = by;
      px[j] = bx;
      py[j] = by;
    }
    feedV = 0;
  };

  const allocate = () => {
    const c = cfg;
    if (!c) return;
    n = clamp(Math.round(c.length), 20, 400);
    rb = clamp(c.beadSize, 3, 10) / 2;
    s = rb * 2 * 1.32;
    x = new Float32Array(n);
    y = new Float32Array(n);
    px = new Float32Array(n);
    py = new Float32Array(n);
    nextInCell = new Int32Array(n);
    hand.held = false;
    restLayout();
    buildSprite();
  };

  const pinned = (i: number) => i === 0 && hand.held;

  /** Pushes a bead out of a capsule (a pot wall): a segment with a radius. */
  const capsule = (
    i: number,
    ax: number,
    ay: number,
    by: number,
    rad: number,
  ) => {
    const bx = x[i] ?? 0;
    const bY = y[i] ?? 0;
    const cy = clamp(bY, ay, by);
    const dx = bx - ax;
    const dy = bY - cy;
    const d = Math.hypot(dx, dy);
    const min = rad + rb;
    if (d >= min || d === 0) return;
    const k = (min - d) / d;
    x[i] = bx + dx * k;
    y[i] = bY + dy * k;
  };

  const collide = (i: number) => {
    const c = cfg;
    if (!c) return;
    const pb = pot;
    // The pot's walls, as capsules: the chain slides over the rim like a pulley.
    const wr = pb.wall / 2;
    capsule(i, pb.left + wr, pb.rimY, pb.floor - 2, wr);
    capsule(i, pb.right - wr, pb.rimY, pb.floor - 2, wr);
    // Inside the pot the stored pile is a floor.
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    if (xi > pb.left + pb.wall && xi < pb.right - pb.wall && yi > pb.rimY) {
      const fill = n > 0 ? (n - out) / n : 0;
      const pile = pb.floor - 6 - (pb.potH - 16) * fill * 0.75;
      if (yi > pile - rb) y[i] = pile - rb;
    }
    // The floor, with friction; the box's sides.
    const floorY = pb.floor - rb;
    if ((y[i] ?? 0) > floorY) {
      const speed = (y[i] ?? 0) - (py[i] ?? 0);
      y[i] = floorY;
      // Friction takes most of the sliding: the dropped chain heaps.
      px[i] = (x[i] ?? 0) - ((x[i] ?? 0) - (px[i] ?? 0)) * 0.6;
      if (speed > 3.2 && t - releasedAt < 1.2) {
        report.current.tick("land", speed / STEP, x[i] ?? 0);
      }
    }
    if ((x[i] ?? 0) < rb) x[i] = rb;
    if ((x[i] ?? 0) > size.w - rb) x[i] = size.w - rb;
    if ((y[i] ?? 0) < rb) y[i] = rb;
  };

  /** Beads push on beads (never their own neighbours), so the dropped chain stacks. */
  const separate = () => {
    const cell = rb * 2;
    const cols = Math.max(1, Math.ceil(size.w / cell));
    const rows = Math.max(1, Math.ceil(size.h / cell));
    if (grid.length !== cols * rows) grid = new Int32Array(cols * rows);
    grid.fill(-1);
    for (let i = 0; i < out; i += 1) {
      const cx = clamp(Math.floor((x[i] ?? 0) / cell), 0, cols - 1);
      const cy = clamp(Math.floor((y[i] ?? 0) / cell), 0, rows - 1);
      const k = cy * cols + cx;
      nextInCell[i] = grid[k] ?? -1;
      grid[k] = i;
    }
    const min = rb * 2 * 0.92;
    for (let i = 0; i < out; i += 1) {
      const cx = clamp(Math.floor((x[i] ?? 0) / cell), 0, cols - 1);
      const cy = clamp(Math.floor((y[i] ?? 0) / cell), 0, rows - 1);
      for (let oy = -1; oy <= 1; oy += 1) {
        const ry = cy + oy;
        if (ry < 0 || ry >= rows) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const rx = cx + ox;
          if (rx < 0 || rx >= cols) continue;
          let j = grid[ry * cols + rx] ?? -1;
          while (j !== -1) {
            if (j > i + 1) {
              const dx = (x[j] ?? 0) - (x[i] ?? 0);
              const dy = (y[j] ?? 0) - (y[i] ?? 0);
              const d = Math.hypot(dx, dy);
              if (d < min && d > 1e-4) {
                const push = ((min - d) / d) * 0.5;
                const wi = pinned(i) ? 0 : 1;
                const wj = pinned(j) ? 0 : 1;
                const sum = wi + wj || 1;
                x[i] = (x[i] ?? 0) - dx * push * (wi / sum) * 2;
                y[i] = (y[i] ?? 0) - dy * push * (wi / sum) * 2;
                x[j] = (x[j] ?? 0) + dx * push * (wj / sum) * 2;
                y[j] = (y[j] ?? 0) + dy * push * (wj / sum) * 2;
              }
            }
            j = nextInCell[j] ?? -1;
          }
        }
      }
    }
  };

  const constrain = (forward: boolean) => {
    // The mouth: the last bead out may be no further than mouthLen from it.
    if (out > 0 && (out < n || state === "winding")) {
      const j = out - 1;
      const dx = (x[j] ?? 0) - pot.mx;
      const dy = (y[j] ?? 0) - pot.my;
      const d = Math.hypot(dx, dy);
      if (d > mouthLen && d > 1e-4 && !pinned(j)) {
        const k = (d - mouthLen) / d;
        x[j] = (x[j] ?? 0) - dx * k;
        y[j] = (y[j] ?? 0) - dy * k;
      }
    }
    const one = (a: number) => {
      const b = a + 1;
      const dx = (x[b] ?? 0) - (x[a] ?? 0);
      const dy = (y[b] ?? 0) - (y[a] ?? 0);
      const d = Math.hypot(dx, dy);
      if (d < 1e-4) return;
      // A chain only resists being pulled apart; pushed together it folds.
      if (d <= s) return;
      const diff = (d - s) / d;
      const wa = pinned(a) ? 0 : 0.5;
      const wb = pinned(a) ? 1 : 0.5;
      x[a] = (x[a] ?? 0) + dx * diff * wa;
      y[a] = (y[a] ?? 0) + dy * diff * wa;
      x[b] = (x[b] ?? 0) - dx * diff * wb;
      y[b] = (y[b] ?? 0) - dy * diff * wb;
    };
    if (forward) for (let a = 0; a < out - 1; a += 1) one(a);
    else for (let a = out - 2; a >= 0; a -= 1) one(a);
  };

  const feed = () => {
    const c = cfg;
    if (!c || out >= n || out < 1) return 0;
    let spawned = 0;
    while (out < n && spawned < 3) {
      const j = out - 1;
      const d = Math.hypot((x[j] ?? 0) - pot.mx, (y[j] ?? 0) - pot.my);
      // The pile holds on a little: only a real pull pays a bead out, so a
      // still hand does not siphon the whole chain onto the floor.
      if (d <= s + Math.max(0.5, rb * 0.3)) break;
      // The pile kicks the leaving bead upward at a share of the pay-out
      // speed: the higher the pull, the higher the arc over the rim.
      const kick = c.motionSafe ? Math.min(1200, c.lift * feedV * 1.6) : 0;
      const k = out;
      x[k] = pot.mx;
      y[k] = pot.my;
      px[k] = pot.mx;
      py[k] = pot.my + kick * STEP;
      out += 1;
      spawned += 1;
      report.current.tick("rim", feedV, pot.mx);
    }
    return spawned;
  };

  const absorb = (c: Config) => {
    // The reel slows for the last few beads, so the tag comes home rather
    // than whipping in over the rim.
    const ease = clamp((out - REST_OUT) / 24, 0.2, 1);
    mouthLen -= c.rewindSpeed * ease * s * STEP;
    while (mouthLen <= 0 && out > REST_OUT) {
      out -= 1;
      mouthLen += s;
    }
    if (out <= REST_OUT) {
      mouthLen = Math.max(mouthLen, s);
      return true;
    }
    return false;
  };

  const substep = () => {
    const c = cfg;
    if (!c) return;
    const g = G * clamp(c.gravity, 0.3, 2) * STEP * STEP;
    const homing = state === "winding" && out < REST_OUT + 24;
    const damp =
      1 - (0.001 + clamp(c.drag, 0, 1) * 0.004 + (homing ? 0.03 : 0));
    // The hand: 1:1 once caught; during the catch the end flies to it.
    if (hand.held) {
      const k = clamp((t - hand.caughtAt) / CATCH, 0, 1);
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      const hx = hand.from.x + (hand.tx - hand.from.x) * e;
      const hy = hand.from.y + (hand.ty - hand.from.y) * e;
      hand.vx = (hx - hand.x) / STEP;
      hand.vy = (hy - hand.y) / STEP;
      hand.x = hx;
      hand.y = hy;
    }
    for (let i = 0; i < out; i += 1) {
      if (pinned(i)) {
        px[i] = x[i] ?? 0;
        py[i] = y[i] ?? 0;
        x[i] = hand.x;
        y[i] = hand.y;
        continue;
      }
      const vx = ((x[i] ?? 0) - (px[i] ?? 0)) * damp;
      const vy = ((y[i] ?? 0) - (py[i] ?? 0)) * damp;
      px[i] = x[i] ?? 0;
      py[i] = y[i] ?? 0;
      x[i] = (x[i] ?? 0) + vx;
      y[i] = (y[i] ?? 0) + vy + g;
    }
    const spawned = hand.held ? feed() : 0;
    feedV = feedV * 0.92 + ((spawned * s) / STEP) * 0.08;
    if (state === "winding") {
      if (absorb(c)) {
        setState("rest");
      }
    }
    for (let k = 0; k < ITERATIONS; k += 1) constrain(k % 2 === 0);
    separate();
    for (let i = 0; i < out; i += 1) if (!pinned(i)) collide(i);
    for (let k = 0; k < 2; k += 1) constrain(k % 2 === 0);
    // Solids have the last word, so a winding chain wraps the rim instead
    // of cutting through the pot's wall.
    for (let i = 0; i < out; i += 1) if (!pinned(i)) collide(i);
  };

  const energy = () => {
    let e = 0;
    for (let i = 0; i < out; i += 1) {
      const vx = (x[i] ?? 0) - (px[i] ?? 0);
      const vy = (y[i] ?? 0) - (py[i] ?? 0);
      e += vx * vx + vy * vy;
    }
    return e / Math.max(1, out);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (fadeFrom >= 0) {
      // Reduced motion: fade out, set the chain back in its pot, fade in.
      const k = (t - fadeFrom) / 0.2;
      if (k >= 1 && k < 2 && state !== "rest") {
        hand.held = false;
        restLayout();
        setState("rest");
      }
      alpha = k < 1 ? 1 - k : clamp(k - 1, 0, 1);
      if (k >= 2) {
        fadeFrom = -1;
        alpha = 1;
      }
      return;
    }
    const steps = clamp(Math.round(dt / STEP), 1, 4);
    for (let i = 0; i < steps; i += 1) {
      t += STEP;
      substep();
    }
    const e = energy();
    stillFor = e < 0.0004 ? stillFor + dt : 0;
    // A heap can jitter forever at the last decimal: three seconds after the
    // drop it counts as settled whatever it is doing.
    if (
      state === "falling" &&
      settledAt < 0 &&
      (stillFor > 0.15 || t - releasedAt > 3)
    ) {
      settledAt = t;
    }
    if (
      state === "falling" &&
      settledAt >= 0 &&
      t - settledAt >= c.rewindDelay / 1000
    ) {
      mouthLen = Math.min(
        s,
        Math.hypot((x[out - 1] ?? 0) - pot.mx, (y[out - 1] ?? 0) - pot.my),
      );
      setState("winding");
    }
    const now = t * 1000;
    if (out !== reportedOut && now - lastReport >= REPORT_EVERY) {
      lastReport = now;
      reportedOut = out;
      report.current.pour(out);
    }
  };

  const drawPotBack = (c: CanvasRenderingContext2D, d: number) => {
    const p = pot;
    // The ground shadow under the pot, soft.
    c.fillStyle = inks.shadow;
    c.globalAlpha = 0.16;
    c.beginPath();
    c.ellipse(
      p.cx * d,
      p.floor * d,
      (p.potW / 2 + 6) * d,
      4 * d,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.globalAlpha = 1;
    // The dark inside of the mouth.
    c.fillStyle = inks.inside;
    c.beginPath();
    c.ellipse(
      p.cx * d,
      p.rimY * d,
      (p.potW / 2 - 1) * d,
      p.lip * d,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    // The top of the stored pile, glinting in the mouth.
    const stored = n - out;
    if (stored > 0 && sprite) {
      const shown = Math.min(9, Math.ceil(stored / 12));
      const sw = sprite.width;
      for (let i = 0; i < shown; i += 1) {
        const a = (i / 9) * Math.PI * 2 + 0.6;
        const rr = (p.potW / 2 - 8) * (0.25 + ((i * 37) % 10) / 14);
        const bx = p.cx + Math.cos(a) * rr;
        const by = p.rimY + 1 + Math.sin(a) * p.lip * 0.55;
        c.globalAlpha = 0.85;
        c.drawImage(sprite, bx * d - sw / 2, by * d - sw / 2);
      }
      c.globalAlpha = 1;
    }
  };

  const drawPotFront = (c: CanvasRenderingContext2D, d: number) => {
    const p = pot;
    const l = p.left * d;
    const r = p.right * d;
    const top = p.rimY * d;
    const bottom = p.floor * d;
    const belly = 4 * d;
    const g = c.createLinearGradient(l, 0, r, 0);
    g.addColorStop(0, inks.deep);
    g.addColorStop(0.35, inks.glaze);
    g.addColorStop(0.55, inks.glaze);
    g.addColorStop(1, inks.deep);
    c.fillStyle = g;
    c.beginPath();
    // The front lip is the lower half of the mouth's ellipse.
    c.moveTo(l, top);
    c.ellipse(p.cx * d, top, (p.potW / 2) * d, p.lip * d, 0, Math.PI, 0, true);
    // The sides run straight down the walls the chain slides on, then tuck in at the foot.
    c.bezierCurveTo(
      r,
      top + (bottom - top) * 0.5,
      r,
      bottom - belly,
      r - 8 * d,
      bottom,
    );
    c.lineTo(l + 8 * d, bottom);
    c.bezierCurveTo(l, bottom - belly, l, top + (bottom - top) * 0.5, l, top);
    c.closePath();
    c.fill();
    // A soft highlight down the glaze, and the rim's lit edge.
    c.globalAlpha = 0.22;
    c.strokeStyle = inks.light;
    c.lineWidth = 2 * d;
    c.beginPath();
    c.moveTo(l + (r - l) * 0.3, top + p.lip * d + 4 * d);
    c.lineTo(l + (r - l) * 0.28, bottom - 8 * d);
    c.stroke();
    c.globalAlpha = 0.5;
    c.lineWidth = 1 * d;
    c.beginPath();
    c.ellipse(p.cx * d, top, (p.potW / 2) * d, p.lip * d, 0, Math.PI, 0, true);
    c.stroke();
    c.globalAlpha = 1;
  };

  const draw = () => {
    if (!ctx || size.w < 1) return;
    const d = size.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    drawPotBack(ctx, d);
    ctx.globalAlpha = alpha;
    // Contact shadows for beads near the floor.
    ctx.fillStyle = inks.shadow;
    ctx.beginPath();
    for (let i = 0; i < out; i += 1) {
      const gap = pot.floor - (y[i] ?? 0) - rb;
      if (gap > 18) continue;
      const k = 1 - gap / 18;
      ctx.moveTo(((x[i] ?? 0) + rb * 1.3 * k) * d, pot.floor * d);
      ctx.ellipse(
        (x[i] ?? 0) * d,
        pot.floor * d,
        rb * 1.3 * k * d,
        rb * 0.45 * k * d,
        0,
        0,
        Math.PI * 2,
      );
    }
    ctx.globalAlpha = 0.18 * alpha;
    ctx.fill();
    // The links: one thin line through every bead into the mouth.
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = inks.dark;
    ctx.lineWidth = Math.max(0.75, rb * 0.42) * d;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < out; i += 1) {
      if (i === 0) ctx.moveTo((x[i] ?? 0) * d, (y[i] ?? 0) * d);
      else ctx.lineTo((x[i] ?? 0) * d, (y[i] ?? 0) * d);
    }
    if (out > 0 && out < n) ctx.lineTo(pot.mx * d, pot.my * d);
    ctx.stroke();
    if (sprite) {
      const sw = sprite.width;
      for (let i = out - 1; i >= 0; i -= 1) {
        ctx.drawImage(
          sprite,
          (x[i] ?? 0) * d - sw / 2,
          (y[i] ?? 0) * d - sw / 2,
        );
      }
    }
    // The tag at the free end: a small flat clasp.
    if (out > 0) {
      const tx = (x[0] ?? 0) * d;
      const ty = (y[0] ?? 0) * d;
      const ang =
        out > 1
          ? Math.atan2((y[0] ?? 0) - (y[1] ?? 0), (x[0] ?? 0) - (x[1] ?? 0))
          : Math.PI / 2;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      const tg = ctx.createLinearGradient(0, -rb * d, 0, rb * d);
      tg.addColorStop(0, inks.light);
      tg.addColorStop(0.45, inks.base);
      tg.addColorStop(1, inks.dark);
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(
        rb * 1.4 * d,
        0,
        rb * 1.9 * d,
        rb * 1.15 * d,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    drawPotFront(ctx, d);
    if (!started) {
      started = true;
      root.setAttribute("data-live", "");
    }
  };

  const busy = () => {
    if (!cfg) return false;
    if (fadeFrom >= 0) return true;
    if (hand.held || state === "falling" || state === "winding") return true;
    return stillFor < 0.4 && t - restSince < 1.5;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    if (fadeFrom >= 0) t += dt;
    step(dt);
    draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (cfg?.paused) return;
    stillFor = 0;
    frame = window.requestAnimationFrame(tick);
  };

  const take = (tx: number, ty: number) => {
    if (!cfg?.interactive || n === 0) return;
    if (fadeFrom >= 0) return;
    hand.held = true;
    hand.from = { x: x[0] ?? tx, y: y[0] ?? ty };
    hand.x = hand.from.x;
    hand.y = hand.from.y;
    hand.tx = tx;
    hand.ty = ty;
    hand.caughtAt = t;
    settledAt = -1;
    if (state === "winding") mouthLen = s;
    setState("pulling");
    kick();
  };

  const release = () => {
    if (!hand.held) return;
    hand.held = false;
    hand.key = false;
    // The end leaves the hand with the hand's own speed: the chain is thrown.
    px[0] = (x[0] ?? 0) - hand.vx * STEP;
    py[0] = (y[0] ?? 0) - hand.vy * STEP;
    releasedAt = t;
    settledAt = -1;
    stillFor = 0;
    setState("falling");
    if (!cfg?.motionSafe) fadeFrom = t;
    kick();
  };

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dd = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    const first = size.w < 1;
    const sx = first ? 1 : w / size.w;
    const sy = first ? 1 : h / size.h;
    size.w = w;
    size.h = h;
    const dprChanged = size.dpr !== dd;
    size.dpr = dd;
    pot = potIn(w, h, cfg?.potPosition ?? 0.2);
    const bw = Math.max(1, Math.round(w * dd));
    const bh = Math.max(1, Math.round(h * dd));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (first || (state === "rest" && !hand.held)) restLayout();
    else {
      // Mid-pour, the chain keeps its place as a share of the box.
      for (let i = 0; i < out; i += 1) {
        x[i] = (x[i] ?? 0) * sx;
        y[i] = (y[i] ?? 0) * sy;
        px[i] = (px[i] ?? 0) * sx;
        py[i] = (py[i] ?? 0) * sy;
      }
    }
    if (dprChanged || first) buildSprite();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        allocate();
        resize();
        return;
      }
      if (was.length !== next.length || was.beadSize !== next.beadSize) {
        allocate();
        setState("rest");
      }
      if (was.finish !== next.finish) readColours();
      if (was.potPosition !== next.potPosition) {
        pot = potIn(size.w, size.h, next.potPosition);
        if (state === "rest") restLayout();
      }
      if (was.dpr !== next.dpr) resize();
      if (!next.interactive && hand.held) release();
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
    hover(hx, hy) {
      if (!cfg?.interactive) return;
      if (hand.held) {
        if (hand.key) return;
        hand.tx = hx;
        hand.ty = hy;
        kick();
        return;
      }
      // A resting chain is taken by the pointer as it comes in; a winding
      // one only when the pointer reaches its end.
      const near = Math.hypot(hx - (x[0] ?? 0), hy - (y[0] ?? 0)) < 26;
      if (state === "rest" || (state === "winding" && near)) take(hx, hy);
    },
    grab(hx, hy) {
      if (hand.held) {
        hand.key = false;
        hand.tx = hx;
        hand.ty = hy;
        kick();
        return;
      }
      take(hx, hy);
    },
    handTo(hx, hy) {
      if (!hand.held) return;
      hand.key = false;
      hand.tx = hx;
      hand.ty = hy;
      kick();
    },
    letGo: release,
    toggle(hx, hy) {
      if (hand.held) release();
      else take(hx, hy);
    },
    keyMove(dx, dy) {
      if (!cfg?.interactive) return;
      if (!hand.held) {
        take(x[0] ?? size.w / 2, y[0] ?? size.h / 2);
        hand.tx = hand.from.x;
        hand.ty = hand.from.y;
      }
      hand.key = true;
      hand.tx = clamp(hand.tx + dx, rb, size.w - rb);
      hand.ty = clamp(hand.ty + dy, rb, size.h - rb);
      hand.from = { x: hand.x, y: hand.y };
      hand.caughtAt = t;
      kick();
    },
    keyToggle() {
      if (hand.held) release();
      else take(x[0] ?? size.w / 2, y[0] ?? size.h / 2);
    },
    keyFocus(on) {
      if (!on && hand.key) release();
    },
    held: () => hand.held,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

/** The rest frame for the server: the pot and the chain's end over its rim, as the canvas starts. */
function standIn(beadSize: number, potPosition: number) {
  const h = 208;
  const p = potIn(1000, h, 0);
  const rb = clamp(beadSize, 3, 10) / 2;
  const s = rb * 2 * 1.32;
  const capX = p.potW / 2 - p.wall / 2;
  const capY = p.rimY - p.wall / 2 - rb;
  const pts: [number, number][] = [
    [0, p.my],
    [capX - rb, capY],
    [p.potW / 2 + rb + 0.5, p.rimY + rb],
    [p.potW / 2 + rb + 0.5, p.floor - rb],
  ];
  const beads: { x: number; y: number }[] = [];
  for (let j = REST_OUT - 1; j >= 0; j -= 1) {
    let left = (REST_OUT - j) * s;
    let bx = 0;
    let by = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i] ?? [0, 0];
      const b = pts[i + 1] ?? [0, 0];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= len || i === pts.length - 2) {
        const k = len > 0 ? Math.min(1, left / len) : 0;
        bx = a[0] + (b[0] - a[0]) * k;
        by = a[1] + (b[1] - a[1]) * k;
        break;
      }
      left -= len;
    }
    // Relative to the pot's foot, which sits 10px above the box's bottom.
    beads.push({ x: r2(bx), y: r2(by - h) });
  }
  return {
    x: `${r2(clamp(potPosition, 0, 1) * 100)}%`,
    beads,
    rb: r2(rb),
    w: r2(p.potW),
    hgt: r2(p.potH),
    lip: r2(p.lip),
  };
}

/**
 * A long ball chain coiled in a squat glazed pot, its tagged end hanging
 * over the rim. The pointer is the hand: bring it in and the end flies to it
 * and is held 1:1, move away and the chain pours out after it — and the
 * faster you pull, the higher it lifts into an arc above the rim, because the
 * pile kicks every leaving bead upward at a share of the chain's speed (the
 * chain fountain). Click, lift your finger or leave the box and the chain is
 * let go: it falls, slides and coils into a heap, beads pushing on beads,
 * then the pot winds it back in over the rim.
 *
 * Position-based physics at 120 Hz on a Canvas 2D, drawn from pre-shaded
 * bead sprites. The keyboard's way in is a transparent button behind the
 * content: arrows carry the end and pour the chain, Space or Enter takes it
 * or lets it go, Escape lets go. Under reduced motion there is no fountain
 * and no fall: let go and the chain fades back into its pot.
 */
export function BeadFountain({
  beadSize = 5,
  length = 160,
  finish = "steel",
  gravity = 1,
  lift = 0.6,
  drag = 0.2,
  rewindSpeed = 45,
  rewindDelay = 900,
  potPosition = 0.2,
  children,
  interactive = true,
  disabled = false,
  paused = false,
  sound = false,
  dpr = 2,
  label = "Bead chain",
  onStateChange,
  onPour,
  className,
}: BeadFountainProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const live = interactive && !disabled;
  const shades = FINISHES[finish] ?? FINISHES.steel;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callbacks = React.useRef({ onStateChange, onPour, audio });
  const dragging = React.useRef(false);
  const report = React.useRef<Report>({
    state: (s) => {
      const words: Partial<Record<BeadFountainState, string>> = {
        pulling: "Pouring.",
        falling: "Let go.",
        rest: "Back in the pot.",
      };
      const text = words[s];
      if (text) setSaid((v) => ({ n: v.n + 1, text }));
      callbacks.current.onStateChange?.(s);
    },
    pour: (out) => callbacks.current.onPour?.(out),
    tick: (kind, speed, x) => {
      const root = rootRef.current;
      const pan = root
        ? panFrom(root.getBoundingClientRect().left + x, root)
        : 0;
      if (kind === "rim") {
        callbacks.current.audio.play("tick", {
          pitch: 0.7 + Math.min(1, speed / 900) * 0.8,
          gain: 0.32,
          pan,
        });
      } else {
        callbacks.current.audio.play("tick", {
          pitch: 0.5 + Math.min(1, speed / 1500) * 0.3,
          gain: 0.22,
          pan,
        });
      }
    },
  });

  const config: Config = {
    beadSize,
    length,
    finish,
    gravity,
    lift: clamp(lift, 0, 1.5),
    drag,
    rewindSpeed: Math.max(1, rewindSpeed),
    rewindDelay: Math.max(0, rewindDelay),
    potPosition: clamp(potPosition, 0, 1),
    interactive: live,
    paused,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onStateChange, onPour, audio };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, report);
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
      visible.current = false;
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

  const pull = useDrag({
    threshold: 2,
    disabled: !live,
    onStart: ({ point }) => {
      dragging.current = true;
      const at = local(point.x, point.y);
      engine.current?.grab(at.x, at.y);
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      engine.current?.handTo(at.x, at.y);
    },
    onEnd: () => {
      // A drag ends the way a hand opens: the chain is let go.
      dragging.current = false;
      engine.current?.letGo();
    },
    onCancel: () => {
      dragging.current = false;
      engine.current?.letGo();
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      engine.current?.toggle(at.x, at.y);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const by = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      engine.current?.keyMove(move[0], move[1]);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) engine.current?.keyToggle();
      return;
    }
    if (event.key === "Escape" && engine.current?.held()) {
      event.preventDefault();
      engine.current.letGo();
    }
  };

  const still = React.useMemo(
    () => standIn(beadSize, potPosition),
    [beadSize, potPosition],
  );

  return (
    <div
      ref={bindRoot}
      {...(live ? pull : {})}
      onPointerMove={(event) => {
        if (live) pull.onPointerMove(event);
        if (!live || dragging.current || event.pointerType === "touch") return;
        const at = local(event.clientX, event.clientY);
        engine.current?.hover(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch" && !dragging.current) {
          engine.current?.letGo();
        }
      }}
      className={cn(
        "group/bead-fountain relative isolate h-56 w-full overflow-clip select-none",
        live ? "cursor-grab touch-none" : "touch-auto",
        className,
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible group-data-live/bead-fountain:hidden"
      >
        <svg x={still.x} y="100%" className="overflow-visible">
          <g transform="translate(0 -10)">
            <ellipse
              cx={0}
              cy={0}
              rx={r2(still.w / 2 + 6)}
              ry={4}
              style={{ fill: POT.shadow, opacity: 0.16 }}
            />
            <ellipse
              cx={0}
              cy={-still.hgt}
              rx={r2(still.w / 2 - 1)}
              ry={still.lip}
              style={{ fill: POT.inside }}
            />
            <path
              d={`M ${r2(-still.w / 2)} ${-still.hgt} A ${r2(still.w / 2)} ${still.lip} 0 0 0 ${r2(still.w / 2)} ${-still.hgt} C ${r2(still.w / 2 + 4)} ${r2(-still.hgt * 0.6)} ${r2(still.w / 2)} -4 ${r2(still.w / 2 - 8)} 0 L ${r2(-still.w / 2 + 8)} 0 C ${r2(-still.w / 2)} -4 ${r2(-still.w / 2 - 4)} ${r2(-still.hgt * 0.6)} ${r2(-still.w / 2)} ${-still.hgt} Z`}
              style={{ fill: POT.glaze }}
            />
          </g>
          <g>
            <path
              d={`M ${still.beads.map((b) => `${b.x} ${b.y}`).join(" L ")}`}
              fill="none"
              strokeWidth={r2(Math.max(0.75, still.rb * 0.42))}
              style={{ stroke: shades.dark }}
            />
            {still.beads.map((b, i) => (
              <circle
                key={i}
                cx={b.x}
                cy={b.y}
                r={still.rb}
                style={{ fill: shades.base }}
              />
            ))}
          </g>
        </svg>
      </svg>
      <div className="relative z-10 size-full">{children}</div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[
          shades.base,
          shades.dark,
          shades.light,
          POT.glaze,
          POT.deep,
          POT.inside,
          POT.shadow,
        ].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          // Space's own click on key-up would take the chain a second time.
          if (event.key === " ") event.preventDefault();
        }}
        onBlur={() => engine.current?.keyFocus(false)}
        onClick={(event) => {
          // A click with no pointer behind it (assistive technology) takes
          // the chain or lets it go, like Space.
          if (event.detail === 0 && live) engine.current?.keyToggle();
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Arrow keys carry the end of the chain and pour it out; Space or Enter
          takes it or lets it go; Escape lets it go.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
