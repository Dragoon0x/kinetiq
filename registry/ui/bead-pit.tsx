"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BeadPitPalette = "candy" | "accent" | "pearl" | "ember";

export type BeadPitProps = {
  /** The content on top of the pit: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many beads lie in the pit, 20 to 400; more beads are smaller, so the pit fills the same depth. @default 160 */
  count?: number;
  /** How hard the beads fall, 0 (they drift) to 2 (heavy). @default 1 */
  gravity?: number;
  /** The beads' glass: a named set of pigments, or CSS colours of your own. @default "candy" */
  palette?: BeadPitPalette | readonly string[];
  /** How deep the pit is filled, as a share of the height, 0.1 to 0.8. @default 0.42 */
  fill?: number;
  /** How lively a bead bounces off the floor, the walls and the others, 0 (dead) to 0.8. @default 0.3 */
  bounce?: number;
  /** How glossy the glass is: the size and strength of each highlight, 0 (matte) to 1. @default 0.7 */
  gloss?: number;
  /** How much of the hand's speed a stirred bead takes, 0 (it is only pushed aside) to 1. @default 0.6 */
  stir?: number;
  /** The hand's reach in the pit, px. @default 40 */
  radius?: number;
  /** How many beads a click pops into the air, 1 to 24. @default 8 */
  pop?: number;
  /** How high a popped bead flies, as a share of the height, 0 to 1. @default 0.6 */
  popHeight?: number;
  /** The pointer stirs the pit and a click pops beads; keyboard focus inside pops them too. @default true */
  interactive?: boolean;
  /** Freeze the beads where they are. @default false */
  paused?: boolean;
  /** Seeds the beads' colours, sizes and places. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Pops answer with a soft blup and each popped bead lands with a quieter one. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the pointer starts (true) or stops (false) stirring the pit. */
  onActiveChange?: (active: boolean) => void;
  /** Fires on every pop, with how many beads went up. */
  onPop?: (count: number) => void;
  /** Fires when every bead has come to rest. */
  onSettle?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Glass is pigment at fixed lightness: the same beads on a light page and a dark one. */
const PALETTES: Record<BeadPitPalette, readonly string[]> = {
  candy: [
    "oklch(0.7 0.17 22)",
    "oklch(0.82 0.15 86)",
    "oklch(0.74 0.13 162)",
    "oklch(0.6 0.15 256)",
    "oklch(0.72 0.14 330)",
  ],
  accent: [
    "oklch(from var(--accent) 0.52 c h)",
    "oklch(from var(--accent-bright) 0.7 c h)",
    "oklch(from var(--accent-bright) 0.86 calc(c * 0.45) h)",
    "oklch(from var(--signal) 0.76 c h)",
    "oklch(from var(--accent) 0.34 calc(c * 0.6) h)",
  ],
  pearl: [
    "oklch(0.94 0.014 90)",
    "oklch(0.88 0.035 60)",
    "oklch(0.86 0.025 250)",
    "oklch(0.9 0.03 340)",
    "oklch(0.8 0.012 95)",
  ],
  ember: [
    "oklch(0.55 0.18 30)",
    "oklch(0.68 0.16 50)",
    "oklch(0.81 0.14 82)",
    "oklch(0.42 0.12 25)",
    "oklch(0.75 0.09 60)",
  ],
};

/** Fixed physics step, and at most this many per frame. */
const STEP = 1 / 120;
const MAX_STEPS = 4;
/** The most the hand pushes a bead in one step, px: about 500 px/s. */
const PUSH = 4;
/** px/s² at gravity 1. */
const G = 1600;
/** Below this speed for half a second, every bead is at rest. */
const REST_SPEED = 4;
const REST_TIME = 0.5;
/** Reduced motion: how long popped beads are ringed after the still swap, ms. */
const RING_HOLD = durations.page * 1000;

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

type Rgb = readonly [number, number, number];

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

const mix = (a: Rgb, b: Rgb, t: number, alpha = 1) =>
  `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)}, ${alpha})`;

/** Whether the page has had a click, tap or key yet: sound waits for one. */
const activated = () =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive === true;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  count: number;
  gravity: number;
  colorKey: string;
  fill: number;
  bounce: number;
  gloss: number;
  stir: number;
  radius: number;
  pop: number;
  popHeight: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPop: (count: number, x: number, sizes: number[]) => void;
  onLand: (x: number, r: number, speed: number) => void;
  onSettle: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, at: number) => void;
  handAway: () => void;
  popAt: (x: number, y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let quiet = 0;
  let resting = true;
  let ringTimer = 0;
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  let n = 0;
  let radius = 10;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let r = new Float32Array(0);
  let hue = new Uint8Array(0);
  /** A popped bead is still in the air: its landing is heard once. */
  let flying = new Uint8Array(0);
  /** Reduced motion: beads just popped, ringed in the still frame. */
  let ringed = new Uint8Array(0);
  let order = new Int32Array(0);
  let near = new Float32Array(0);
  /** Where each bead was before this step, and how hard it was knocked (-1: by the hand). */
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let knock = new Float32Array(0);
  /** The spatial hash: cell size, cells across and down, and each cell's run of beads. */
  let cs = 1;
  let gw = 1;
  let gh = 1;
  let cellStart = new Int32Array(1);
  let cellOf = new Int32Array(0);
  let sorted = new Int32Array(0);
  let cursor = new Int32Array(1);
  /** Reduced motion: whether any bead is ringed right now. */
  let anyRinged = false;
  /** One sprite per colour, drawn at the largest bead's size; and the contact shadow. */
  let sprites: HTMLCanvasElement[] = [];
  let shadow: HTMLCanvasElement | null = null;
  let ringColour = "rgba(0, 0, 0, 0.5)";
  const hand = { x: 0, y: 0, vx: 0, vy: 0, at: 0, present: false };

  const seatBeads = (c: Config) => {
    const { w, h } = size;
    if (w < 1 || h < 1) return;
    n = clamp(Math.round(c.count), 20, 400);
    const depth = clamp(c.fill, 0.1, 0.8) * h;
    // Radius so n beads, loosely packed, fill the depth asked for.
    radius = clamp(Math.sqrt((w * depth) / (n * 3.5)), 4, 24);
    x = new Float32Array(n);
    y = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    r = new Float32Array(n);
    hue = new Uint8Array(n);
    flying = new Uint8Array(n);
    ringed = new Uint8Array(n);
    order = new Int32Array(n);
    near = new Float32Array(n);
    px = new Float32Array(n);
    py = new Float32Array(n);
    knock = new Float32Array(n);
    const rand = lcg(c.seed * 41 + 7);
    const colours = Math.max(1, sprites.length || 5);
    const pitch = radius * 2.02;
    const across = Math.max(1, Math.floor((w - radius) / pitch));
    for (let i = 0; i < n; i += 1) {
      const row = Math.floor(i / across);
      const col = i % across;
      r[i] = radius * (0.88 + rand() * 0.24);
      x[i] =
        radius * 1.2 + col * pitch + (row % 2) * radius + (rand() - 0.5) * 2;
      y[i] = h - radius - row * radius * 1.76 - rand() * 2;
      hue[i] = Math.floor(rand() * colours);
    }
    cs = radius * 2.4;
    gw = Math.ceil(w / cs) + 2;
    gh = Math.ceil((h * 2.2) / cs) + 2;
    cellStart = new Int32Array(gw * gh + 1);
    cursor = new Int32Array(gw * gh);
    cellOf = new Int32Array(n);
    sorted = new Int32Array(n);
    // Let the lattice slump into a pile before anyone sees it.
    for (let s = 0; s < 90; s += 1) integrate(STEP, c, false);
    for (let i = 0; i < n; i += 1) {
      vx[i] = 0;
      vy[i] = 0;
    }
  };

  /**
   * One fixed step of the pit, solved on positions: gravity moves every
   * bead, then the hand, the other beads, the walls and the floor push it
   * back out of whatever it overlaps, and its velocity is whatever motion
   * survived. A pile at rest therefore has no velocity at all, and sleeps.
   */
  const integrate = (dt: number, c: Config, live: boolean): number => {
    const { w, h } = size;
    const g = clamp(c.gravity, 0, 2) * G;
    const e = clamp(c.bounce, 0, 0.8);
    const air = 1 - 0.35 * dt;
    for (let i = 0; i < n; i += 1) {
      px[i] = x[i] ?? 0;
      py[i] = y[i] ?? 0;
      knock[i] = 0;
      vy[i] = ((vy[i] ?? 0) + g * dt) * air;
      vx[i] = (vx[i] ?? 0) * air;
      x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
      y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
    }
    // The hand is a round paddle: beads it reaches are pushed out of it.
    const stirring = live && hand.present && c.interactive;
    const R = clamp(c.radius, 8, Math.max(8, Math.min(w, h) * 0.6));
    if (stirring) {
      for (let i = 0; i < n; i += 1) {
        const dx = (x[i] ?? 0) - hand.x;
        const dy = (y[i] ?? 0) - hand.y;
        const reach = R + (r[i] ?? 0);
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2) || 1;
        // A paddle that lands inside the pile carves its way out over a few
        // steps rather than flinging everything it overlaps at once.
        const push = Math.min(reach - d, PUSH);
        x[i] = (x[i] ?? 0) + (dx / d) * push;
        y[i] = (y[i] ?? 0) + (dy / d) * push;
        knock[i] = -1;
      }
    }
    for (let pass = 0; pass < 3; pass += 1) {
      cellStart.fill(0);
      for (let i = 0; i < n; i += 1) {
        const cx = clamp(Math.floor((x[i] ?? 0) / cs) + 1, 0, gw - 1);
        const cy = clamp(Math.floor(((y[i] ?? 0) + h * 1.2) / cs), 0, gh - 1);
        const k = cy * gw + cx;
        cellOf[i] = k;
        cellStart[k + 1] = (cellStart[k + 1] ?? 0) + 1;
      }
      for (let k = 0; k < gw * gh; k += 1) {
        cellStart[k + 1] = (cellStart[k + 1] ?? 0) + (cellStart[k] ?? 0);
      }
      cursor.set(cellStart.subarray(0, gw * gh));
      for (let i = 0; i < n; i += 1) {
        const k = cellOf[i] ?? 0;
        const slot = cursor[k] ?? 0;
        sorted[slot] = i;
        cursor[k] = slot + 1;
      }
      for (let i = 0; i < n; i += 1) {
        const k = cellOf[i] ?? 0;
        const cx = k % gw;
        const cy = Math.floor(k / gw);
        const ri = r[i] ?? 0;
        const mi = ri * ri;
        for (let oy = -1; oy <= 1; oy += 1) {
          const yy = cy + oy;
          if (yy < 0 || yy >= gh) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const xx = cx + ox;
            if (xx < 0 || xx >= gw) continue;
            const kk = yy * gw + xx;
            const from = cellStart[kk] ?? 0;
            const to = cellStart[kk + 1] ?? 0;
            for (let s = from; s < to; s += 1) {
              const j = sorted[s] ?? 0;
              if (j <= i) continue;
              const dx = (x[j] ?? 0) - (x[i] ?? 0);
              const dy = (y[j] ?? 0) - (y[i] ?? 0);
              const rr = ri + (r[j] ?? 0);
              const d2 = dx * dx + dy * dy;
              if (d2 >= rr * rr || d2 < 1e-6) continue;
              const d = Math.sqrt(d2);
              const nx = dx / d;
              const ny = dy / d;
              const mj = (r[j] ?? 0) * (r[j] ?? 0);
              const overlap = rr - d;
              x[i] = (x[i] ?? 0) - nx * overlap * (mj / (mi + mj));
              y[i] = (y[i] ?? 0) - ny * overlap * (mj / (mi + mj));
              x[j] = (x[j] ?? 0) + nx * overlap * (mi / (mi + mj));
              y[j] = (y[j] ?? 0) + ny * overlap * (mi / (mi + mj));
              if (pass === 0) {
                // How hard they met, for a popped bead's landing.
                const vn =
                  ((vx[i] ?? 0) - (vx[j] ?? 0)) * nx +
                  ((vy[i] ?? 0) - (vy[j] ?? 0)) * ny;
                if (vn > (knock[i] ?? 0) && (knock[i] ?? 0) >= 0) knock[i] = vn;
                if (vn > (knock[j] ?? 0) && (knock[j] ?? 0) >= 0) knock[j] = vn;
              }
            }
          }
        }
      }
      for (let i = 0; i < n; i += 1) {
        const ri = r[i] ?? 0;
        x[i] = clamp(x[i] ?? 0, ri, Math.max(ri, w - ri));
        if ((y[i] ?? 0) > h - ri) y[i] = h - ri;
      }
    }
    // Velocity is the motion that survived, with a bounce off the floor and
    // the walls for anything that hit them hard.
    let fastest = 0;
    const hard = g * dt * 4 + 30;
    for (let i = 0; i < n; i += 1) {
      const ri = r[i] ?? 0;
      const before = vy[i] ?? 0;
      const beforeX = vx[i] ?? 0;
      let nvx = ((x[i] ?? 0) - (px[i] ?? 0)) / dt;
      let nvy = ((y[i] ?? 0) - (py[i] ?? 0)) / dt;
      const floored = (y[i] ?? 0) >= h - ri - 0.01;
      if (floored) {
        if (before > hard) {
          nvy = -before * e;
          if (live && flying[i]) land(i, before);
        }
        nvx *= 1 - 6 * dt;
      }
      if (
        ((x[i] ?? 0) <= ri + 0.01 || (x[i] ?? 0) >= w - ri - 0.01) &&
        Math.abs(beforeX) > hard
      )
        nvx = -beforeX * e;
      if (live && flying[i] && (knock[i] ?? 0) > 140) land(i, knock[i] ?? 0);
      // The hand lends a share of its own speed to what it pushes.
      if ((knock[i] ?? 0) < 0) {
        const share = clamp(c.stir, 0, 1) * 0.35;
        nvx += (hand.vx - nvx) * share;
        nvy += (hand.vy - nvy) * share;
      }
      let sp = Math.hypot(nvx, nvy);
      if (sp > 1400) {
        nvx *= 1400 / sp;
        nvy *= 1400 / sp;
        sp = 1400;
      }
      // Glass at a crawl comes to rest: static friction.
      if (sp < 18) {
        nvx *= 0.8;
        nvy *= 0.8;
        sp *= 0.8;
      }
      vx[i] = nvx;
      vy[i] = nvy;
      if (sp > fastest) fastest = sp;
    }
    return fastest;
  };

  /** A popped bead's first landing, heard once. */
  const land = (i: number, speed: number) => {
    flying[i] = 0;
    cfg?.onLand(x[i] ?? 0, r[i] ?? radius, speed);
  };

  const paintSprites = () => {
    const c = cfg;
    if (!c) return;
    const kids = carriers.children;
    const white: Rgb = [255, 255, 255];
    const black: Rgb = [0, 0, 0];
    const ground = read(getComputedStyle(kids[0] ?? root).color);
    const gloss = clamp(c.gloss, 0, 1);
    const R = Math.ceil(radius * 1.12 * size.dpr) + 2;
    sprites = [];
    for (let i = 1; i < kids.length; i += 1) {
      const base = read(getComputedStyle(kids[i] ?? root).color);
      const s = document.createElement("canvas");
      s.width = R * 2;
      s.height = R * 2;
      const g = s.getContext("2d");
      if (!g) continue;
      const rad = R - 2;
      // The body: lit from the upper left, darkening to a rim.
      const body = g.createRadialGradient(
        R - rad * 0.35,
        R - rad * 0.42,
        rad * 0.05,
        R,
        R,
        rad,
      );
      body.addColorStop(0, mix(base, white, 0.3));
      body.addColorStop(0.55, mix(base, base, 0));
      body.addColorStop(1, mix(base, black, 0.42));
      g.beginPath();
      g.arc(R, R, rad, 0, Math.PI * 2);
      g.fillStyle = body;
      g.fill();
      // Light bounced up from the floor.
      const bounceLight = g.createRadialGradient(
        R + rad * 0.15,
        R + rad * 0.62,
        0,
        R + rad * 0.15,
        R + rad * 0.62,
        rad * 0.55,
      );
      bounceLight.addColorStop(0, mix(base, white, 0.35, 0.45));
      bounceLight.addColorStop(1, mix(base, white, 0.35, 0));
      g.fillStyle = bounceLight;
      g.fill();
      // The highlight: a soft window of light, sharper the glossier.
      if (gloss > 0) {
        g.save();
        g.translate(R - rad * 0.36, R - rad * 0.44);
        g.rotate(-0.6);
        g.scale(1, 0.62);
        const hr = rad * (0.22 + 0.16 * gloss);
        const spec = g.createRadialGradient(0, 0, 0, 0, 0, hr);
        spec.addColorStop(
          0,
          `rgba(255, 255, 255, ${(0.35 + 0.6 * gloss).toFixed(3)})`,
        );
        spec.addColorStop(
          0.5 - 0.3 * gloss + 0.3,
          `rgba(255, 255, 255, ${(0.25 * gloss).toFixed(3)})`,
        );
        spec.addColorStop(1, "rgba(255, 255, 255, 0)");
        g.beginPath();
        g.arc(0, 0, hr, 0, Math.PI * 2);
        g.fillStyle = spec;
        g.fill();
        g.restore();
      }
      sprites.push(s);
    }
    const sh = document.createElement("canvas");
    const S = Math.ceil(radius * 1.6 * size.dpr) + 2;
    sh.width = S * 2;
    sh.height = S;
    const sg = sh.getContext("2d");
    if (sg) {
      sg.translate(S, S / 2);
      sg.scale(1, 0.4);
      const grad = sg.createRadialGradient(0, 0, 0, 0, 0, S);
      grad.addColorStop(0, mix(ground, black, 0.6, 0.38));
      grad.addColorStop(1, mix(ground, black, 0.6, 0));
      sg.beginPath();
      sg.arc(0, 0, S, 0, Math.PI * 2);
      sg.fillStyle = grad;
      sg.fill();
    }
    shadow = sh;
    ringColour =
      getComputedStyle(kids[0] ?? root).borderColor || "currentColor";
    if (n > 0) {
      const count = Math.max(1, sprites.length);
      const rand = lcg((cfg?.seed ?? 1) * 41 + 9);
      for (let i = 0; i < n; i += 1) hue[i] = Math.floor(rand() * count);
    }
  };

  const draw = () => {
    const g = canvas.getContext("2d");
    if (!g || !visible.current || size.w < 1) return;
    const { dpr } = size;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const sh = shadow;
    if (sh) {
      for (let i = 0; i < n; i += 1) {
        const ri = r[i] ?? 0;
        // The shadow sits on what is under the bead: the floor, or the pile.
        const sw = ri * 3.2;
        g.drawImage(
          sh,
          ((x[i] ?? 0) - sw / 2) * dpr,
          ((y[i] ?? 0) + ri * 0.55 - sw * 0.25) * dpr,
          sw * dpr,
          sw * 0.5 * dpr,
        );
      }
    }
    for (let i = 0; i < n; i += 1) {
      const s = sprites[hue[i] ?? 0] ?? sprites[0];
      if (!s) continue;
      const ri = (r[i] ?? 0) + 1;
      const side = ri * 2 * (s.width / (s.width - 4));
      g.drawImage(
        s,
        ((x[i] ?? 0) - side / 2) * dpr,
        ((y[i] ?? 0) - side / 2) * dpr,
        side * dpr,
        side * dpr,
      );
    }
    // Reduced motion: the beads a pop just moved, ringed for a moment.
    if (anyRinged) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.beginPath();
      for (let i = 0; i < n; i += 1) {
        if (!ringed[i]) continue;
        g.moveTo((x[i] ?? 0) + (r[i] ?? 0) + 2.5, y[i] ?? 0);
        g.arc(x[i] ?? 0, y[i] ?? 0, (r[i] ?? 0) + 2.5, 0, Math.PI * 2);
      }
      g.lineWidth = 1.5;
      g.strokeStyle = ringColour;
      g.stroke();
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    if (c.paused || !c.motionSafe) {
      draw();
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    carry += dt;
    let fastest = 0;
    let steps = 0;
    while (carry >= STEP && steps < MAX_STEPS) {
      carry -= STEP;
      steps += 1;
      fastest = Math.max(fastest, integrate(STEP, c, true));
    }
    if (steps === MAX_STEPS) carry = 0;
    draw();
    // Asleep once every bead has been nearly still for half a second.
    // Gravity adds a step's worth of speed to a resting bead before its
    // contacts take it away again: that much is rest, not motion.
    const rest = REST_SPEED + 1.5 * clamp(c.gravity, 0, 2) * G * STEP;
    if (fastest < rest && !hand.present && steps > 0) quiet += dt;
    else if (steps > 0) quiet = 0;
    if (quiet >= REST_TIME) {
      quiet = 0;
      last = 0;
      carry = 0;
      flying.fill(0);
      vx.fill(0);
      vy.fill(0);
      if (!resting) {
        resting = true;
        c.onSettle();
      }
      return;
    }
    resting = false;
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    quiet = 0;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: run the pit to rest off screen, then draw it once. */
  const settleNow = (c: Config) => {
    for (let s = 0; s < 900; s += 1) {
      if (integrate(STEP, c, false) < REST_SPEED && s > 30) break;
    }
    for (let i = 0; i < n; i += 1) {
      vx[i] = 0;
      vy[i] = 0;
    }
    flying.fill(0);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    seatBeads(c);
    paintSprites();
    if (!c.motionSafe) settleNow(c);
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        resize();
        return;
      }
      const reseat =
        was.count !== next.count ||
        was.fill !== next.fill ||
        was.seed !== next.seed;
      if (reseat) seatBeads(next);
      if (
        reseat ||
        was.colorKey !== next.colorKey ||
        was.gloss !== next.gloss ||
        was.dpr !== next.dpr
      ) {
        if (was.dpr !== next.dpr) {
          size.w = 0;
          resize();
        } else paintSprites();
      }
      // A new gravity jostles the pit, so the beads show how they now fall.
      if (was.gravity !== next.gravity && next.motionSafe && !reseat) {
        const rand = lcg(Math.round(next.gravity * 100) + next.seed);
        for (let i = 0; i < n; i += 1) {
          vy[i] = (vy[i] ?? 0) - (60 + rand() * 140);
          vx[i] = (vx[i] ?? 0) + (rand() - 0.5) * 60;
        }
      }
      if (!next.interactive && hand.present) {
        hand.present = false;
        next.onActive(false);
      }
      if (!next.motionSafe) {
        settleNow(next);
        ringed.fill(0);
        anyRinged = false;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      paintSprites();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(px, py, at) {
      const dt = hand.at ? Math.max(8, at - hand.at) / 1000 : 0;
      if (dt > 0 && hand.present) {
        const k = Math.min(1, dt / 0.05);
        hand.vx += ((px - hand.x) / dt - hand.vx) * k;
        hand.vy += ((py - hand.y) / dt - hand.vy) * k;
      } else {
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = px;
      hand.y = py;
      hand.at = at;
      if (!hand.present) cfg?.onActive(true);
      hand.present = true;
      // Reduced motion: the hand does not move the beads.
      if (cfg?.motionSafe) kick();
    },
    handAway() {
      if (hand.present) cfg?.onActive(false);
      hand.present = false;
      hand.at = 0;
      hand.vx = 0;
      hand.vy = 0;
      kick();
    },
    popAt(px, py) {
      const c = cfg;
      if (!c || n < 1) return;
      const k = clamp(Math.round(c.pop), 1, 24);
      // The beads that pop are the ones on top of the pile around the
      // click: a buried bead would shove the whole pile up with it.
      const column = radius * 3;
      let top = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (Math.abs((x[i] ?? 0) - px) < column) top = Math.min(top, y[i] ?? 0);
      }
      if (!Number.isFinite(top)) top = py;
      for (let i = 0; i < n; i += 1) {
        const dx = (x[i] ?? 0) - px;
        const dy = Math.max(0, (y[i] ?? 0) - top);
        near[i] = dx * dx + dy * dy * 2.2;
        order[i] = i;
      }
      // The k best placed, by a partial selection.
      for (let a = 0; a < Math.min(k, n); a += 1) {
        let best = a;
        for (let b = a + 1; b < n; b += 1) {
          if ((near[order[b] ?? 0] ?? 0) < (near[order[best] ?? 0] ?? 0))
            best = b;
        }
        const t = order[a] ?? 0;
        order[a] = order[best] ?? 0;
        order[best] = t;
      }
      const rand = lcg(Math.round(px * 7 + py * 13) + c.seed);
      const g = Math.max(80, clamp(c.gravity, 0, 2) * G);
      const lift = Math.sqrt(2 * g * clamp(c.popHeight, 0, 1) * size.h);
      const sizes: number[] = [];
      const popped = Math.min(k, n);
      ringed.fill(0);
      anyRinged = !c.motionSafe;
      for (let a = 0; a < popped; a += 1) {
        const i = order[a] ?? 0;
        vy[i] = -lift * (0.7 + rand() * 0.45);
        vx[i] = ((x[i] ?? 0) - px) * 2 + (rand() - 0.5) * 140;
        flying[i] = 1;
        ringed[i] = c.motionSafe ? 0 : 1;
        sizes.push((r[i] ?? radius) / radius);
      }
      c.onPop(popped, px, sizes);
      if (c.motionSafe) {
        kick();
        return;
      }
      // Reduced motion: the pop is run to its end off screen and the result
      // is drawn as one still, the moved beads ringed for a moment.
      settleNow(c);
      draw();
      window.clearTimeout(ringTimer);
      ringTimer = window.setTimeout(() => {
        ringed.fill(0);
        anyRinged = false;
        draw();
      }, RING_HOLD);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(ringTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background whose floor is a pit of glossy glass beads, with the content
 * on top in its own layer. The beads are circles under simple 2D physics —
 * gravity, bouncing walls and floor, collisions resolved through a spatial
 * hash, a little friction where glass rubs — drawn as shaded spheres from a
 * sprite per colour, each with a soft contact shadow and a highlight up and
 * to the left. Their size is chosen so `count` beads fill `fill` of the
 * height at any width.
 *
 * The hand is a round paddle in the pit: beads it reaches are pushed out of
 * it and take a share of its speed, so a sweep rolls a wave of beads ahead of
 * it and leaves a hollow that refills. A click pops the nearest few into the
 * air — they fly, tumble and land back on the pile — with soft blups when
 * `sound` is on, after the visitor's first click, tap or key. Keyboard focus
 * on a control inside pops the beads behind it. The loop sleeps once every
 * bead is still and never runs off screen. Under reduced motion the pile is
 * drawn still, and a pop is run to rest off screen and shown as one swap with
 * the moved beads ringed.
 */
export function BeadPit({
  children,
  count = 160,
  gravity = 1,
  palette = "candy",
  fill = 0.42,
  bounce = 0.3,
  gloss = 0.7,
  stir = 0.6,
  radius = 40,
  pop = 8,
  popHeight = 0.6,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  sound = false,
  onActiveChange,
  onPop,
  onSettle,
  className,
}: BeadPitProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const glass = React.useMemo(
    () =>
      typeof palette === "string"
        ? (PALETTES[palette as BeadPitPalette] ?? PALETTES.candy)
        : palette.length >= 1
          ? palette.slice(0, 8)
          : PALETTES.candy,
    [palette],
  );
  const colorKey = glass.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onPop, onSettle });
  const voice = React.useRef(audio);
  const chord = React.useRef<number[]>([]);
  /** Where a press began: a release close by, soon after, is a click. */
  const pressAt = React.useRef<{ x: number; y: number; t: number } | null>(
    null,
  );

  const pan = (x: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    return rect ? panFrom(rect.left + x, root) : 0;
  };

  const config: Config = {
    count,
    gravity,
    colorKey,
    fill,
    bounce,
    gloss,
    stir,
    radius,
    pop,
    popHeight,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onPop: (n, x, sizes) => {
      report.current.onPop?.(n);
      // A pop answers the visitor: a short chord of blups, the bigger beads
      // lower, never before the page has had a click, tap or key.
      if (!activated()) return;
      for (const t of chord.current) window.clearTimeout(t);
      chord.current = sizes.slice(0, 3).map((k, i) =>
        window.setTimeout(
          () =>
            voice.current.play("blup", {
              pitch: Number((1.25 / Math.max(0.6, k) + i * 0.08).toFixed(3)),
              gain: 0.6,
              pan: pan(x),
            }),
          i * 32,
        ),
      );
    },
    onLand: (x, r, speed) => {
      if (!activated()) return;
      voice.current.play("blup", {
        pitch: Number((1.6 * (10 / Math.max(4, r))).toFixed(3)),
        gain: Number(Math.min(0.32, speed / 2400).toFixed(3)),
        pan: pan(x),
      });
    },
    onSettle: () => report.current.onSettle?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onPop, onSettle };
    voice.current = audio;
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
    const timers = chord;
    return () => {
      e.dispose();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
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

  // Size and sighting, bound to the node when it arrives.
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
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the bare pit pops.
    if (hit && rootRef.current?.contains(hit)) {
      pressAt.current = null;
      return;
    }
    const at = local(event.clientX, event.clientY);
    pressAt.current = { ...at, t: event.timeStamp };
    if (event.pointerType === "touch")
      engine.current?.handTo(at.x, at.y, event.timeStamp);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = pressAt.current;
    pressAt.current = null;
    if (event.pointerType === "touch") engine.current?.handAway();
    if (!from || !interactive) return;
    const at = local(event.clientX, event.clientY);
    if (
      Math.hypot(at.x - from.x, at.y - from.y) < 8 &&
      event.timeStamp - from.t < 500
    )
      engine.current?.popAt(from.x, from.y);
  };

  const onPointerCancel = () => {
    pressAt.current = null;
    engine.current?.handAway();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway();
  };

  // Keyboard focus on a control inside pops the beads behind it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.bottom);
    engine.current?.popAt(at.x, at.y);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        // A sideways finger stirs the pit; an upright swipe scrolls the page.
        "group/bead-pit relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/bead-pit:opacity-0"
        style={standIn(glass, fill)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="border-ring transition-colors duration-1"
          style={{ color: "var(--background)" }}
        />
        {glass.map((paint, i) => (
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

/**
 * The designed still frame for the server render and the first paint: a
 * bed of beads in two of the colours across the bottom of the frame.
 */
function standIn(glass: readonly string[], fill: number): React.CSSProperties {
  const top = Math.round((1 - clamp(fill, 0.1, 0.8)) * 100);
  const a = glass[0] ?? "gray";
  const b = glass[Math.min(2, glass.length - 1)] ?? a;
  return {
    backgroundImage: [
      `linear-gradient(180deg, var(--background) 0 ${top}%, transparent ${top}%)`,
      `radial-gradient(circle at 30% 30%, ${a} 0 38%, transparent 42%)`,
      `radial-gradient(circle at 80% 80%, ${b} 0 38%, transparent 42%)`,
    ].join(", "),
    backgroundSize: "100% 100%, 22px 22px, 22px 22px",
    backgroundPosition: "0 0, 0 100%, 0 100%",
  };
}
