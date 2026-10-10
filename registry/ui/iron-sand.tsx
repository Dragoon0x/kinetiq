"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IronSandColor = "graphite" | "rust" | "cobalt";

export type IronSandProps = {
  /** The content on top of the plate: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many grains on a wide card, 300 to 8000; smaller boxes get fewer so the dusting stays even. @default 3500 */
  grains?: number;
  /** How strong the field is, 0 to 1: how much of the plate it lines up and how hard the poles pull. @default 0.6 */
  strength?: number;
  /** The sand's colour: a named one, or any CSS colour. @default "graphite" */
  color?: IronSandColor | (string & {});
  /** Magnets under the plate, 0 to 4: one, a dipole, a triangle, a quadrupole. @default 2 */
  poles?: number;
  /** A grain's length, px. @default 5 */
  grainLength?: number;
  /** How far the hidden magnets wander on their slow paths, 0 (still) to 1. @default 0.35 */
  drift?: number;
  /** The plate under the sand. @default the page, lifted a breath toward the ink */
  surface?: string;
  /** The pointer and keyboard focus carry a pole, and a press taps the plate. @default true */
  interactive?: boolean;
  /** How strong the carried pole is, 0 to 1. @default 0.8 */
  pointerStrength?: number;
  /** A press on the plate taps it: the grains hop and settle into cleaner lines. @default true */
  tap?: boolean;
  /** Hold the magnets still; the sand still answers the pointer. @default false */
  paused?: boolean;
  /** Seeds where the magnets sit and how the sand was scattered. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus picks up (true) or drops (false) the pole. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS: Record<IronSandColor, string> = {
  graphite: "color-mix(in oklab, var(--foreground) 80%, var(--background))",
  rust: "oklch(0.54 0.11 46)",
  cobalt: "oklch(from var(--accent-bright) 0.58 c h)",
};
const SURFACE = "color-mix(in oklab, var(--foreground) 5%, var(--background))";

/** Fixed physics step: the needles' springs integrate at 60 Hz. */
const STEP = 1 / 60;
/** Static friction: a grain slides only when pushed faster than this, px/s, and turns only past this torque. */
const SLIDE_FRICTION = 18;
const TURN_FRICTION = 12;
/** How hard a full field turns a needle. */
const ALIGN = 260;
/** Each grain's elastic hold on its spot, 1/s, and its slow creep home, s. */
const TETHER = 1.8;
const CREEP = 1.5;
/** A tap's shock ring, px/s, and how long a grain stays loose after it hops, s. */
const RING_SPEED = 700;
const HOP = 0.35;
const RINGS = 3;
const MAX_GRAINS = 8000;
const REFERENCE_AREA = 760 * 232;
/** The carried pole follows on glide and arrives on drift; a hop settles on recoil. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A small seeded generator: the same plate for the same seed. */
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

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const css = ([r, g, b]: Rgb, a = 1) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** Where the magnets sit, as fractions of the box, and their signs. */
function layoutPoles(count: number, seed: number) {
  const rand = lcg(seed * 17 + 11);
  const j = () => (rand() - 0.5) * 0.06;
  const n = clamp(Math.round(count), 0, 4);
  if (n === 1) return [{ fx: 0.56 + j(), fy: 0.5 + j(), q: 1 }];
  if (n === 2)
    return [
      { fx: 0.3 + j(), fy: 0.5 + j(), q: 1 },
      { fx: 0.7 + j(), fy: 0.5 + j(), q: -1 },
    ];
  if (n === 3)
    return [0, 1, 2].map((k) => {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 3 + rand() * 0.3;
      return {
        fx: 0.55 + 0.24 * Math.cos(a),
        fy: 0.5 + 0.3 * Math.sin(a),
        q: k === 1 ? -1 : 1,
      };
    });
  if (n === 4)
    return [
      { fx: 0.3 + j(), fy: 0.3 + j(), q: 1 },
      { fx: 0.7 + j(), fy: 0.3 + j(), q: -1 },
      { fx: 0.7 + j(), fy: 0.7 + j(), q: 1 },
      { fx: 0.3 + j(), fy: 0.7 + j(), q: -1 },
    ];
  return [];
}

type Sand = {
  n: number;
  hx: Float32Array;
  hy: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  th: Float32Array;
  om: Float32Array;
  len: Float32Array;
  tone: Uint8Array;
  pile: Float32Array;
  hop: Float32Array;
  /** How upright each grain stands (the field's vertical share), and toward which side its tip points. */
  stand: Float32Array;
  tip: Int8Array;
  kick: Float32Array;
};

type Config = {
  grains: number;
  strength: number;
  paintKey: string;
  poles: number;
  grainLength: number;
  drift: number;
  interactive: boolean;
  pointerStrength: number;
  tap: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  tapAt: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let sand: Sand | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  const size = { w: 0, h: 0, dpr: 1 };
  const read = rgbReader();
  const plate = document.createElement("canvas");
  const paint = {
    surface: [240, 240, 240] as Rgb,
    grain: [40, 40, 40] as Rgb,
    tones: ["rgb(40, 40, 40)", "rgb(60, 60, 60)", "rgb(80, 80, 80)"],
    shadow: "rgba(0, 0, 0, 0.3)",
    tip: "rgb(255, 255, 255)",
  };
  /** Fixed poles: rest position (px), live position, charge. Slot 4 is the hand's. */
  const poleX = new Float32Array(5);
  const poleY = new Float32Array(5);
  const restX = new Float32Array(5);
  const restY = new Float32Array(5);
  const poleQ = new Float32Array(5);
  const phase = new Float32Array(10);
  let fixed = 0;
  const sim = { t: 0 };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
  };
  const rings = Array.from({ length: RINGS }, () => ({
    on: false,
    x: 0,
    y: 0,
    r: 0,
    strength: 0,
  }));
  const depth = () => 9 + 7 * clamp(cfg?.strength ?? 0.6, 0, 1);
  /** Field units: a single pole reads 1 at this distance. */
  const reference = () => 0.24 * Math.min(size.w, size.h);

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The field at (x, y) from every pole: in-plane bx, by and the vertical share. */
  const field = { bx: 0, by: 0, bz: 0, near: -1 };
  const fieldAt = (x: number, y: number, withHand: boolean) => {
    const d = depth();
    const ref = reference();
    const norm = (ref * ref + d * d) ** 1.5 / ref;
    let bx = 0;
    let by = 0;
    let bz = 0;
    let best = 0;
    let near = -1;
    const count = withHand ? 5 : fixed;
    for (let k = 0; k < count; k += 1) {
      if (k >= fixed && k < 4) continue;
      const q =
        k === 4
          ? hand.amount * (0.6 + 1.6 * clamp(cfg?.pointerStrength ?? 0.8, 0, 1))
          : (poleQ[k] ?? 0);
      if (q === 0) continue;
      const dx = x - (poleX[k] ?? 0);
      const dy = y - (poleY[k] ?? 0);
      const dd = k === 4 ? d * 0.85 : d;
      const r2 = dx * dx + dy * dy + dd * dd;
      const inv = (q * norm) / (r2 * Math.sqrt(r2));
      bx += dx * inv;
      by += dy * inv;
      bz += dd * inv;
      const mag = Math.abs(inv);
      if (mag > best) {
        best = mag;
        near = k;
      }
    }
    field.bx = bx;
    field.by = by;
    field.bz = bz;
    field.near = near;
  };

  /** Lays the sand down: two thirds along field lines traced from the poles, the rest scattered. */
  const scatter = () => {
    const c = cfg;
    const { w, h } = size;
    if (!c || w < 1 || h < 1) return;
    const rand = lcg(c.seed * 31 + 7);
    const n = Math.round(
      clamp(c.grains, 300, MAX_GRAINS) *
        clamp((w * h) / REFERENCE_AREA, 0.3, 1),
    );
    const hx = new Float32Array(n);
    const hy = new Float32Array(n);
    // Field lines from each pole, as polylines.
    const lines: number[][] = [];
    let total = 0;
    const d = depth();
    if (fixed > 0) {
      for (let k = 0; k < fixed; k += 1) {
        const q = poleQ[k] ?? 0;
        const starts = 30;
        const spin = rand() * Math.PI * 2;
        for (let s = 0; s < starts; s += 1) {
          const a = spin + (s * Math.PI * 2) / starts;
          let x = (poleX[k] ?? 0) + Math.cos(a) * d * 1.4;
          let y = (poleY[k] ?? 0) + Math.sin(a) * d * 1.4;
          const pts = [x, y];
          for (let i = 0; i < 700; i += 1) {
            fieldAt(x, y, false);
            const m = Math.hypot(field.bx, field.by);
            if (m < 1e-6) break;
            // Away from a north pole, toward a south one.
            const dir = q > 0 ? 1 : -1;
            x += (field.bx / m) * 3 * dir;
            y += (field.by / m) * 3 * dir;
            if (x < -12 || y < -12 || x > w + 12 || y > h + 12) break;
            let arrived = false;
            for (let o = 0; o < fixed; o += 1) {
              if (o === k) continue;
              if (
                Math.hypot(x - (poleX[o] ?? 0), y - (poleY[o] ?? 0)) <
                d * 1.4
              ) {
                arrived = true;
              }
            }
            pts.push(x, y);
            total += 3;
            if (arrived) break;
          }
          lines.push(pts);
        }
      }
    }
    const along = fixed > 0 && total > 0 ? Math.round(n * 0.64) : 0;
    let placed = 0;
    if (along > 0) {
      const gap = total / along;
      let carry = rand() * gap;
      for (const pts of lines) {
        for (let i = 2; i + 1 < pts.length && placed < along; i += 2) {
          const x0 = pts[i - 2] ?? 0;
          const y0 = pts[i - 1] ?? 0;
          const x1 = pts[i] ?? 0;
          const y1 = pts[i + 1] ?? 0;
          carry += 3;
          while (carry >= gap && placed < along) {
            carry -= gap;
            const t = 1 - carry / 3;
            const nx = -(y1 - y0) / 3;
            const ny = (x1 - x0) / 3;
            const side = (rand() - 0.5) * 3.2;
            hx[placed] = x0 + (x1 - x0) * t + nx * side;
            hy[placed] = y0 + (y1 - y0) * t + ny * side;
            placed += 1;
          }
        }
      }
    }
    for (; placed < n; placed += 1) {
      hx[placed] = rand() * w;
      hy[placed] = rand() * h;
    }
    const len = new Float32Array(n);
    const th = new Float32Array(n);
    const tone = new Uint8Array(n);
    const pile = new Float32Array(n);
    const kick = new Float32Array(n);
    const gl = clamp(c.grainLength, 2, 14);
    for (let i = 0; i < n; i += 1) {
      len[i] = gl * (0.6 + rand() * 0.8);
      th[i] = rand() * Math.PI;
      tone[i] = Math.floor(rand() * 3);
      pile[i] = Math.sqrt(rand());
      kick[i] = rand() * Math.PI * 2;
    }
    sand = {
      n,
      hx,
      hy,
      x: Float32Array.from(hx),
      y: Float32Array.from(hy),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      th,
      om: new Float32Array(n),
      len,
      tone,
      pile,
      hop: new Float32Array(n),
      stand: new Float32Array(n),
      tip: new Int8Array(n),
      kick,
    };
    if (!c.motionSafe) place();
  };

  /** The magnets, at rest positions for this box. */
  const lay = () => {
    const c = cfg;
    if (!c) return;
    const list = layoutPoles(c.poles, c.seed);
    fixed = list.length;
    const rand = lcg(c.seed * 5 + 1);
    for (let k = 0; k < 4; k += 1) {
      const p = list[k];
      restX[k] = p ? p.fx * size.w : 0;
      restY[k] = p ? p.fy * size.h : 0;
      poleX[k] = restX[k] ?? 0;
      poleY[k] = restY[k] ?? 0;
      poleQ[k] = p ? p.q : 0;
    }
    for (let i = 0; i < 10; i += 1) phase[i] = rand() * Math.PI * 2;
    wander(0);
  };

  /** The magnets' slow Lissajous paths. */
  const wander = (t: number) => {
    const c = cfg;
    if (!c) return;
    const a = 0.07 * Math.min(size.w, size.h) * clamp(c.drift, 0, 1);
    for (let k = 0; k < fixed; k += 1) {
      poleX[k] =
        (restX[k] ?? 0) +
        a * Math.sin((t * Math.PI * 2) / (22 + k * 3) + (phase[k * 2] ?? 0));
      poleY[k] =
        (restY[k] ?? 0) +
        a *
          0.8 *
          Math.sin((t * Math.PI * 2) / (31 - k * 2) + (phase[k * 2 + 1] ?? 0));
    }
  };

  /** Reduced motion: every grain at home, its needle laid along the field. */
  const place = () => {
    const s = sand;
    const c = cfg;
    if (!s || !c) return;
    const k = clamp(c.strength, 0, 1);
    for (let i = 0; i < s.n; i += 1) {
      s.x[i] = s.hx[i] ?? 0;
      s.y[i] = s.hy[i] ?? 0;
      s.vx[i] = 0;
      s.vy[i] = 0;
      s.om[i] = 0;
      s.hop[i] = 0;
      fieldAt(s.x[i] ?? 0, s.y[i] ?? 0, true);
      const bh = Math.hypot(field.bx, field.by);
      const pull = (bh * (0.2 + 2.8 * k)) / (1 + bh * (0.2 + 2.8 * k));
      if (pull * ALIGN * 0.5 > TURN_FRICTION) {
        s.th[i] = Math.atan2(field.by, field.bx);
      }
      standOf(s, i);
    }
  };

  const standOf = (s: Sand, i: number) => {
    const m = Math.hypot(field.bx, field.by, field.bz);
    const share = m > 0 ? Math.abs(field.bz) / m : 0;
    s.stand[i] = clamp(share * 1.5 - 0.55, 0, 1);
    const k = field.near;
    if (k < 0) {
      s.tip[i] = 1;
      return;
    }
    const dx = (s.x[i] ?? 0) - (poleX[k] ?? 0);
    const dy = (s.y[i] ?? 0) - (poleY[k] ?? 0);
    const th = s.th[i] ?? 0;
    s.tip[i] = Math.cos(th) * dx + Math.sin(th) * dy >= 0 ? 1 : -1;
  };

  /** One physics step. Returns whether any grain is still on the move. */
  const step = (dt: number): boolean => {
    const s = sand;
    const c = cfg;
    if (!s || !c) return false;
    let moving = false;
    const k = clamp(c.strength, 0, 1);
    const ps = clamp(c.pointerStrength, 0, 1);
    const d = depth();
    // The carried pole: position on glide, presence on drift.
    const want = hand.present && c.interactive ? 1 : 0;
    hand.vx +=
      ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
        GLIDE.mass) *
      dt;
    hand.vy +=
      ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
        GLIDE.mass) *
      dt;
    hand.px += hand.vx * dt;
    hand.py += hand.vy * dt;
    hand.amountV +=
      ((DRIFT.stiffness * (want - hand.amount) - DRIFT.damping * hand.amountV) /
        DRIFT.mass) *
      dt;
    hand.amount = clamp(hand.amount + hand.amountV * dt, 0, 1.2);
    if (Math.abs(want - hand.amount) < 0.002 && Math.abs(hand.amountV) < 0.01) {
      hand.amount = want;
      hand.amountV = 0;
    } else moving = true;
    if (Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5) moving = true;
    poleX[4] = hand.px;
    poleY[4] = hand.py;

    for (const r of rings) {
      if (!r.on) continue;
      moving = true;
      r.r += RING_SPEED * dt;
      if (r.r > Math.hypot(size.w, size.h) + 40) r.on = false;
    }

    const handOn = hand.amount > 0.002;
    const reach = 22 + 56 * ps;
    const pullMax = 60 + 190 * ps;
    const pileHand = 5 + 14 * ps;
    const pileFixed = 4 + 8 * k;
    const creep = 1 - Math.exp(-dt / CREEP);
    const gain = 0.2 + 2.8 * k;
    for (let i = 0; i < s.n; i += 1) {
      const x = s.x[i] ?? 0;
      const y = s.y[i] ?? 0;
      // A shock ring passing lifts the grain off the plate for a moment.
      for (let q = 0; q < RINGS; q += 1) {
        const r = rings[q];
        if (!r || !r.on) continue;
        const dist = Math.hypot(x - r.x, y - r.y);
        if (dist <= r.r && dist > r.r - RING_SPEED * dt - 1) {
          const kick = s.kick[i] ?? 0;
          const fall = r.strength / (1 + dist / 260);
          s.hop[i] = Math.max(s.hop[i] ?? 0, fall);
          s.vx[i] = (s.vx[i] ?? 0) + Math.cos(kick) * 46 * fall;
          s.vy[i] = (s.vy[i] ?? 0) + Math.sin(kick) * 46 * fall;
          s.om[i] = (s.om[i] ?? 0) + Math.sin(kick * 3) * 7 * fall;
        }
      }
      let hop = s.hop[i] ?? 0;
      if (hop > 0) {
        hop = Math.max(0, hop - dt / HOP);
        s.hop[i] = hop;
        moving = true;
      }
      const loose = hop > 0;

      fieldAt(x, y, handOn);
      // The needle turns toward the field (either way: a filing has no
      // north), held by friction until the torque beats it.
      const bh = Math.hypot(field.bx, field.by);
      const pull = (bh * gain) / (1 + bh * gain);
      const stiff = ALIGN * pull * (loose ? 1.5 : 1);
      let th = s.th[i] ?? 0;
      let om = s.om[i] ?? 0;
      if (stiff > 0) {
        let diff = Math.atan2(field.by, field.bx) - th;
        diff -= Math.PI * Math.round(diff / Math.PI);
        const torque = 0.5 * stiff * Math.sin(2 * diff);
        if (!loose && Math.abs(torque) < TURN_FRICTION && Math.abs(om) < 0.08) {
          om = 0;
        } else {
          const zeta = loose
            ? RECOIL.damping / (2 * Math.sqrt(RECOIL.stiffness))
            : 0.72;
          om += (torque - 2 * zeta * Math.sqrt(stiff) * om) * dt;
          th += om * dt;
          moving = true;
        }
      } else if (om !== 0) {
        om *= Math.exp(-dt * 8);
        if (Math.abs(om) < 0.05) om = 0;
        th += om * dt;
        moving = true;
      }
      s.th[i] = th;
      s.om[i] = om;

      // Sliding: drawn toward strong field, held by its tether and by
      // friction; a pile radius keeps arrivals from collapsing to a point.
      let wx = 0;
      let wy = 0;
      let drawn = 0;
      const n = handOn ? 5 : fixed;
      for (let p = 0; p < n; p += 1) {
        if (p >= fixed && p < 4) continue;
        const dx = (poleX[p] ?? 0) - x;
        const dy = (poleY[p] ?? 0) - y;
        const r = Math.hypot(dx, dy);
        const isHand = p === 4;
        const span = isHand ? reach : 26 + 30 * k;
        if (r > span * 2.2 || r < 1e-3) continue;
        const floor =
          (isHand ? pileHand : pileFixed) * (s.pile[i] ?? 0.5) + d * 0.3;
        let speed: number;
        if (r < floor) speed = -(floor - r) * 9;
        else {
          const u = (r - floor) / span;
          const peak = isHand ? pullMax * hand.amount : 70 * k;
          speed = (peak * 3.1 * u) / (1 + u * u) ** 2;
        }
        wx += (dx / r) * speed;
        wy += (dy / r) * speed;
        drawn += Math.abs(speed);
      }
      const ox = (s.hx[i] ?? 0) - x;
      const oy = (s.hy[i] ?? 0) - y;
      const hold = TETHER * (loose ? 3 : 1);
      wx += ox * hold;
      wy += oy * hold;
      let vx = s.vx[i] ?? 0;
      let vy = s.vy[i] ?? 0;
      const push = Math.hypot(wx, wy);
      if (!loose && push < SLIDE_FRICTION && Math.hypot(vx, vy) < 4) {
        vx = 0;
        vy = 0;
        // Held by friction, a grain still creeps home, slowly — unless a
        // pole is what holds it here, or it would only creep back and slide.
        const cx = ox * creep;
        const cy = oy * creep;
        if (drawn < 2 && Math.abs(ox) + Math.abs(oy) > 1) {
          s.x[i] = x + cx;
          s.y[i] = y + cy;
          moving = true;
        }
      } else {
        // Sand on paper is overdamped: velocity follows the push quickly.
        const follow = 1 - Math.exp(-dt / 0.06);
        vx += (wx - vx) * follow;
        vy += (wy - vy) * follow;
        const sp = Math.hypot(vx, vy);
        if (sp > 900) {
          vx *= 900 / sp;
          vy *= 900 / sp;
        }
        s.x[i] = x + vx * dt;
        s.y[i] = y + vy * dt;
        moving = true;
      }
      s.vx[i] = vx;
      s.vy[i] = vy;
      standOf(s, i);
    }
    return moving;
  };

  const draw = () => {
    const s = sand;
    const c = cfg;
    if (!ctx || !s || !c || !visible.current || size.w < 1) return;
    const { dpr } = size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(plate, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    // Shadows of the standing and the hopping grains.
    ctx.beginPath();
    for (let i = 0; i < s.n; i += 1) {
      const stand = s.stand[i] ?? 0;
      const hop = s.hop[i] ?? 0;
      if (stand < 0.2 && hop <= 0) continue;
      const lift = hop * 2.6 + stand * 1.2;
      const half = ((s.len[i] ?? 4) / 2) * (1 + 0.7 * stand);
      const th = s.th[i] ?? 0;
      const cx = (s.x[i] ?? 0) + 0.6 + lift * 0.7;
      const cy = (s.y[i] ?? 0) + 0.9 + lift;
      ctx.moveTo(cx - Math.cos(th) * half, cy - Math.sin(th) * half);
      ctx.lineTo(cx + Math.cos(th) * half, cy + Math.sin(th) * half);
    }
    ctx.strokeStyle = paint.shadow;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // The grains, in three tones.
    for (let t = 0; t < 3; t += 1) {
      ctx.beginPath();
      for (let i = 0; i < s.n; i += 1) {
        if ((s.tone[i] ?? 0) !== t) continue;
        const stand = s.stand[i] ?? 0;
        const hop = s.hop[i] ?? 0;
        const half =
          ((s.len[i] ?? 4) / 2) * (1 + 0.7 * stand) * (1 - 0.2 * hop);
        const th = s.th[i] ?? 0;
        const cx = (s.x[i] ?? 0) - hop * 1.2;
        const cy = (s.y[i] ?? 0) - hop * 1.8;
        ctx.moveTo(cx - Math.cos(th) * half, cy - Math.sin(th) * half);
        ctx.lineTo(cx + Math.cos(th) * half, cy + Math.sin(th) * half);
      }
      ctx.strokeStyle = paint.tones[t] ?? paint.tones[0] ?? "currentColor";
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // Bright tips on the spikes that stand at the poles.
    ctx.beginPath();
    for (let i = 0; i < s.n; i += 1) {
      const stand = s.stand[i] ?? 0;
      if (stand < 0.45) continue;
      const half = ((s.len[i] ?? 4) / 2) * (1 + 0.7 * stand);
      const th = s.th[i] ?? 0;
      const sign = s.tip[i] ?? 1;
      const ex = (s.x[i] ?? 0) + Math.cos(th) * half * sign;
      const ey = (s.y[i] ?? 0) + Math.sin(th) * half * sign;
      ctx.moveTo(
        ex - Math.cos(th) * sign * 1.4,
        ey - Math.sin(th) * sign * 1.4,
      );
      ctx.lineTo(ex, ey);
    }
    ctx.strokeStyle = paint.tip;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !sand) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
    const drifting = c.motionSafe && !c.paused && c.drift > 0 && fixed > 0;
    let busy = hand.present || hand.amount > 0 || hand.amountV !== 0;
    for (const r of rings) if (r.on) busy = true;
    // With no hand and no tap in flight, the magnets wander and the grains
    // creep slowly enough for thirty frames a second.
    if (!busy && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const span = last ? Math.min(0.05, (now - drawnAt) / 1000) : dt;
    last = now;
    drawnAt = now;
    let moving = false;
    if (c.motionSafe) {
      if (drifting) {
        sim.t += span;
        wander(sim.t);
      }
      const steps = Math.max(1, Math.round(span / STEP));
      for (let i = 0; i < steps; i += 1) {
        if (step(span / steps)) moving = true;
      }
    } else place();
    draw();
    if (moving || drifting) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !sand)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** The plate: its colour, a fine speckle and a soft vignette. Built once per size and look. */
  const layers = () => {
    const { w, h, dpr } = size;
    const c = cfg;
    if (!c || w < 1) return;
    plate.width = Math.round(w * dpr);
    plate.height = Math.round(h * dpr);
    const p = plate.getContext("2d");
    if (!p) return;
    p.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.fillStyle = css(paint.surface);
    p.fillRect(0, 0, w, h);
    const rand = lcg(c.seed * 3 + 2);
    const dark = mixRgb(paint.surface, paint.grain, 0.12);
    p.fillStyle = css(dark, 0.5);
    for (let i = 0; i < (w * h) / 90; i += 1) {
      p.fillRect(rand() * w, rand() * h, 0.8, 0.8);
    }
    const shade = p.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    shade.addColorStop(0, css(paint.surface, 0));
    shade.addColorStop(1, css(mixRgb(paint.surface, [0, 0, 0], 0.18), 0.6));
    p.fillStyle = shade;
    p.fillRect(0, 0, w, h);
  };

  const readColours = () => {
    const kids = carriers.children;
    const get = (i: number): Rgb | null => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : null;
    };
    paint.surface = get(0) ?? paint.surface;
    paint.grain = get(1) ?? paint.grain;
    const g = paint.grain;
    const lightPlate =
      0.2126 * paint.surface[0] +
        0.7152 * paint.surface[1] +
        0.0722 * paint.surface[2] >
      128;
    paint.tones = [
      css(g),
      css(mixRgb(g, paint.surface, 0.3)),
      css(mixRgb(g, lightPlate ? [0, 0, 0] : [255, 255, 255], 0.2)),
    ];
    paint.shadow = css(
      mixRgb(paint.surface, [0, 0, 0], 0.55),
      lightPlate ? 0.28 : 0.5,
    );
    paint.tip = css(mixRgb(g, [255, 255, 255], lightPlate ? 0.55 : 0.7));
    layers();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && sand) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    lay();
    scatter();
    layers();
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
        readColours();
        resize();
        return;
      }
      if (
        was.poles !== next.poles ||
        was.seed !== next.seed ||
        was.grains !== next.grains ||
        was.grainLength !== next.grainLength
      ) {
        lay();
        scatter();
        layers();
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.paintKey !== next.paintKey) readColours();
      if (was.drift !== next.drift) wander(sim.t);
      if (!next.motionSafe) place();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
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
        // A pole that arrives from nowhere starts where it lands.
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
      if (c && !c.motionSafe) {
        hand.px = x;
        hand.py = y;
        hand.amount = 1;
        poleX[4] = x;
        poleY[4] = y;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) hand.amount = 0;
      kick();
    },
    tapAt(x, y, strength) {
      const c = cfg;
      if (!c || !c.tap) return;
      if (!c.motionSafe) {
        // Reduced motion: the plate is re-laid at once, without a hop.
        place();
        draw();
        return;
      }
      let pick = rings[0];
      for (const r of rings) {
        if (!r.on) {
          pick = r;
          break;
        }
        if (pick && r.r > pick.r) pick = r;
      }
      if (!pick) return;
      pick.on = true;
      pick.x = x;
      pick.y = y;
      pick.r = 0;
      pick.strength = strength;
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
 * A background of iron sand on a plate with magnets hidden under it, and the
 * content on top in its own layer. The grains are laid along the field from
 * the start and each is a short needle on its own angular spring, turning to
 * the field (either way round) wherever the field is strong enough to beat
 * the friction holding it — so near the magnets the sand lines up crisply in
 * the flowing lines between the poles, far away it stays loosely scattered,
 * and at each pole the grains stand up into a small tuft of spikes. The
 * magnets wander slowly, and the lines sway with them.
 *
 * The pointer carries a pole: grains near it turn to it, break friction and
 * stream after it, crowding into a moving tuft, and peel off and creep home
 * when it leaves. A press taps the plate — a shock ring runs out, each grain
 * hops as it passes, lets go of friction for a moment and snaps to the field
 * on the recoil spring, so the plate tidies itself into cleaner lines.
 * Keyboard focus on a control inside carries the pole there and taps from it.
 * Canvas 2D in five batched strokes; it stops when the sand is still and
 * nothing is wandering, and runs only on screen in a visible page. Under
 * reduced motion every grain lies at home along the field, the pole turns the
 * needles at once, and nothing slides.
 */
export function IronSand({
  children,
  grains = 3500,
  strength = 0.6,
  color = "graphite",
  poles = 2,
  grainLength = 5,
  drift = 0.35,
  surface = SURFACE,
  interactive = true,
  pointerStrength = 0.8,
  tap = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: IronSandProps) {
  const motionSafe = useMotionSafe();
  const grainPaint = Object.prototype.hasOwnProperty.call(COLORS, color)
    ? COLORS[color as IronSandColor]
    : String(color);
  const paints = [surface, grainPaint] as const;
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    grains,
    strength,
    paintKey,
    poles,
    grainLength,
    drift,
    interactive,
    pointerStrength,
    tap,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
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
      engine.current?.tapAt(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.tapAt(at.x, at.y, 0.6);
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
        // A sideways drag carries the pole on touch; an upright one scrolls.
        "group/iron-sand relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/iron-sand:opacity-0"
        style={standIn(surface, grainPaint)}
      />
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

/**
 * The designed still frame for the server render and the first paint: the
 * plate with two soft pools of sand where a dipole's poles would gather it,
 * ringed faintly like field lines.
 */
function standIn(surface: string, grain: string): React.CSSProperties {
  const tint = (share: number) =>
    `color-mix(in oklab, ${grain} ${share}%, transparent)`;
  return {
    backgroundColor: surface,
    backgroundImage: [
      `radial-gradient(circle at 30% 50%, ${tint(55)} 0, ${tint(18)} 18px, transparent 48px)`,
      `radial-gradient(circle at 70% 50%, ${tint(55)} 0, ${tint(18)} 18px, transparent 48px)`,
      `repeating-radial-gradient(ellipse 60% 70% at 50% 50%, ${tint(9)} 0 1px, transparent 1px 11px)`,
    ].join(", "),
  };
}
