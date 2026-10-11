"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AvatarJarItem = {
  /** Stable id: a pebble keeps its place in the heap across renders by it. */
  id: string;
  /** The person's (or tag's) name: the pebble's accessible name and its card's title. */
  name: string;
  /** A second line on the card when lifted, e.g. a role or a team. */
  role?: string;
  /** A photo for the pebble. Without one a portrait is drawn from the id. */
  src?: string;
  /** The drawn portrait's background, any CSS colour. @default a pigment picked from the id */
  color?: string;
};

export type AvatarJarGlass = "clear" | "sea" | "amber" | "smoke";

export type AvatarJarProps = {
  /** What is in the jar. More than fit are counted on the lid instead. @default sixteen people of a design team */
  items?: readonly AvatarJarItem[];
  /** Controlled tilt in degrees; negative leans left. */
  angle?: number;
  /** The tilt to start at when uncontrolled. @default 0 */
  defaultAngle?: number;
  /** Fires when a drag or a key leaves the jar at a new tilt, with the angle it will come to rest at. */
  onAngleChange?: (angle: number) => void;
  /** Controlled: the id of the pebble lifted out, or null. */
  lifted?: string | null;
  /** The pebble lifted out at first when uncontrolled. @default null */
  defaultLifted?: string | null;
  /** Fires when a pebble is lifted out (with its id) or dropped back (null). */
  onLiftedChange?: (id: string | null) => void;
  /** How far the jar can tip either way, in degrees. @default 28 */
  tilt?: number;
  /** A pebble's diameter in jar units (the jar is 200 wide inside). @default 34 */
  pebbleSize?: number;
  /** The glass's tint. @default "clear" */
  glass?: AvatarJarGlass;
  /** Gravity, as a multiple of the house's: light pebbles drift, heavy ones drop. @default 1 */
  gravity?: number;
  /** How much a pebble bounces off glass and other pebbles, 0 to 0.8. @default 0.28 */
  bounce?: number;
  /** When the pebbles pour in: as the jar scrolls into view, on mount, or never (they start in a heap). @default "inView" */
  pour?: "inView" | "mount" | "none";
  /** Change it to pour every pebble in again from the top. */
  repourKey?: number;
  /** Names the jar for assistive technology. @default "Jar" */
  label?: string;
  /** Clack when the pebbles the visitor moved hit the glass and each other. Off unless asked for. @default false */
  sound?: boolean;
  /** Seeds where pebbles start and how each portrait is drawn. @default 7 */
  seed?: number;
  /** Freeze the pebbles where they are. @default false */
  paused?: boolean;
  /** Shows the jar but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the jar's box; give it a height. @default "h-[30rem] w-full" */
  className?: string;
};

export const defaultAvatarJarItems: AvatarJarItem[] = [
  { id: "ines", name: "Ines Okafor", role: "Type design" },
  { id: "tomas", name: "Tomas Reyes", role: "Motion" },
  { id: "mira", name: "Mira Halvorsen", role: "Research" },
  { id: "jun", name: "Jun Takeda", role: "Design systems" },
  { id: "ada", name: "Ada Mensah", role: "Illustration" },
  { id: "leo", name: "Leo Brandt", role: "Product design" },
  { id: "sana", name: "Sana Qureshi", role: "Brand" },
  { id: "noor", name: "Noor Haddad", role: "Content design" },
  { id: "elias", name: "Elias Varga", role: "Prototyping" },
  { id: "priya", name: "Priya Raman", role: "Accessibility" },
  { id: "hugo", name: "Hugo Lind", role: "Interaction" },
  { id: "yara", name: "Yara Costa", role: "Research ops" },
  { id: "femi", name: "Femi Adeyemi", role: "Visual design" },
  { id: "lena", name: "Lena Park", role: "Design lead" },
  { id: "omar", name: "Omar Saleh", role: "Sound design" },
  { id: "ruth", name: "Ruth Calder", role: "Writing" },
];

/* -------------------------------- geometry -------------------------------- */

/** The jar's own frame, in jar units: 240 wide, 340 tall. */
const FRAME_W = 240;
const FRAME_H = 340;
const CX = 120;
const TOP = 34;
const BOTTOM = 330;
const NECK = 58;
const BODY = 100;
const SHOULDER_Y = 56;
const BODY_Y = 106;
const CORNER = 28;
/** The jar turns about its middle, the way a hand turns it. */
const PIVOT_Y = (TOP + BOTTOM) / 2;
/** Extents of the glass from the pivot, for fitting a tilted jar in its box. */
const HALF_X = BODY + 9;
const HALF_Y = (BOTTOM - TOP) / 2 + 12;

type Vec = { x: number; y: number };
type Segment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
};

/** The inside of the glass as a polyline the pebbles collide with: neck, shoulders, body, rounded foot. */
function innerContour(): Vec[] {
  const left: Vec[] = [
    { x: CX - NECK, y: TOP - 160 },
    { x: CX - NECK, y: SHOULDER_Y },
  ];
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 6;
    // A quadratic shoulder: out from the neck, down to the body.
    const x = (1 - t) * (1 - t) * NECK + 2 * (1 - t) * t * BODY + t * t * BODY;
    const y =
      (1 - t) * (1 - t) * SHOULDER_Y +
      2 * (1 - t) * t * (SHOULDER_Y + 6) +
      t * t * BODY_Y;
    left.push({ x: CX - x, y });
  }
  left.push({ x: CX - BODY, y: BOTTOM - CORNER });
  // The foot's rounded corner, from pointing left round to pointing down.
  for (let i = 1; i <= 5; i += 1) {
    const a = Math.PI - (i / 6) * (Math.PI / 2);
    left.push({
      x: CX - BODY + CORNER + CORNER * Math.cos(a),
      y: BOTTOM - CORNER + CORNER * Math.sin(a),
    });
  }
  left.push({ x: CX - BODY + CORNER, y: BOTTOM });
  const right = left.map((p) => ({ x: 2 * CX - p.x, y: p.y })).reverse();
  return [...left, ...right];
}

/** Segments with their inward normals, for a contour drawn down the left and up the right. */
function segmentsOf(points: Vec[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i] as Vec;
    const b = points[i + 1] as Vec;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Walking down the left side, along the foot and up the right, the
    // inside is always to the right of travel: (dy, -dx) in a y-down frame.
    out.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      nx: dy / len,
      ny: -dx / len,
    });
  }
  return out;
}

const CONTOUR = innerContour();
const SEGMENTS = segmentsOf(CONTOUR);

const r2 = (v: number) => Math.round(v * 100) / 100;
/** The clock for "did the visitor just touch the jar", read only in handlers. */
const clockNow = () => performance.now();
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The glass, outside and in, as SVG paths in jar units. */
function glassPath(off: number): string {
  const n = NECK + off;
  const b = BODY + off;
  const top = TOP - 2;
  const bottom = BOTTOM + off;
  const c = CORNER + off * 0.6;
  return [
    `M ${r2(CX - n)} ${top}`,
    `L ${r2(CX - n)} ${SHOULDER_Y}`,
    `Q ${r2(CX - b)} ${SHOULDER_Y + 6} ${r2(CX - b)} ${BODY_Y}`,
    `L ${r2(CX - b)} ${r2(bottom - c)}`,
    `Q ${r2(CX - b)} ${r2(bottom)} ${r2(CX - b + c)} ${r2(bottom)}`,
    `L ${r2(CX + b - c)} ${r2(bottom)}`,
    `Q ${r2(CX + b)} ${r2(bottom)} ${r2(CX + b)} ${r2(bottom - c)}`,
    `L ${r2(CX + b)} ${BODY_Y}`,
    `Q ${r2(CX + b)} ${SHOULDER_Y + 6} ${r2(CX + n)} ${SHOULDER_Y}`,
    `L ${r2(CX + n)} ${top}`,
  ].join(" ");
}

const GLASS_OUTER = glassPath(7);
const GLASS_INNER = glassPath(0);

const GLASS_TINT: Record<AvatarJarGlass, string> = {
  clear: "var(--foreground)",
  sea: "oklch(0.78 0.08 188)",
  amber: "oklch(0.8 0.12 72)",
  smoke: "oklch(0.5 0.015 260)",
};

/* -------------------------------- portraits ------------------------------- */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Background hues for the drawn portraits: soft pigments that read the same on light and dark pages. */
const HUES = [24, 62, 96, 148, 188, 226, 262, 302, 342];

function Portrait({ item, seed }: { item: AvatarJarItem; seed: number }) {
  const h = hash(`${item.id}:${seed}`);
  const hue = HUES[h % HUES.length] ?? 220;
  const figureHue = (hue + 150 + ((h >>> 5) % 60)) % 360;
  const hair = (h >>> 9) % 4;
  const bg = item.color ?? `oklch(0.87 0.06 ${hue})`;
  const figure = `oklch(0.46 0.07 ${figureHue})`;
  const face = `oklch(0.7 0.05 ${figureHue})`;
  const dark = `oklch(0.3 0.04 ${figureHue})`;
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="block size-full">
      <rect width="40" height="40" fill={bg} />
      <path
        d="M3 42 C3 31.5 10.5 27.6 20 27.6 C29.5 27.6 37 31.5 37 42 Z"
        fill={figure}
      />
      <circle cx="20" cy="16.6" r="8.4" fill={face} />
      {hair === 0 ? (
        <path
          d="M11.4 16 C11.4 9.6 15.2 7.6 20 7.6 C24.8 7.6 28.6 9.6 28.6 16 C26 13 23 12 20 12 C17 12 14 13 11.4 16 Z"
          fill={dark}
        />
      ) : hair === 1 ? (
        <>
          <circle cx="20" cy="6.2" r="4" fill={dark} />
          <path
            d="M11.6 15.6 C11.6 10.2 15.2 8.2 20 8.2 C24.8 8.2 28.4 10.2 28.4 15.6 C25.6 12.8 14.4 12.8 11.6 15.6 Z"
            fill={dark}
          />
        </>
      ) : hair === 2 ? (
        <path
          d="M10.4 26 C9.6 17 11.2 8 20 8 C28.8 8 30.4 17 29.6 26 C28 22.6 27.6 17 26.4 13.8 C23.6 12.4 16.4 12.4 13.6 13.8 C12.4 17 12 22.6 10.4 26 Z"
          fill={dark}
        />
      ) : (
        <>
          <circle cx="14.4" cy="10.6" r="3.8" fill={dark} />
          <circle cx="20" cy="8.4" r="4.2" fill={dark} />
          <circle cx="25.6" cy="10.6" r="3.8" fill={dark} />
        </>
      )}
    </svg>
  );
}

/* --------------------------------- physics -------------------------------- */

type Body = {
  id: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where the pebble was at the start of the step. */
  px: number;
  py: number;
  /** Spin, in degrees and in radians a second. */
  a: number;
  w: number;
  /** "free": in the jar · "wait": queued above the mouth · "lift": out of the jar · "drop": on its way back. */
  mode: "free" | "wait" | "lift" | "drop";
  /** World-space state while lifted or dropping. */
  wx: number;
  wy: number;
  wvx: number;
  wvy: number;
  wa: number;
  wva: number;
  s: number;
  vs: number;
  el: HTMLElement | null;
};

type Fit = {
  /** jar units → px */
  s: number;
  /** Where the pivot sits in the box, px. */
  px: number;
  py: number;
  /** Where a lifted pebble hangs, px, and its card beside it. */
  liftX: number;
  liftY: number;
  cardX: number;
  cardW: number;
  w: number;
  h: number;
};

type Physics = {
  gravity: number;
  bounce: number;
  paused: boolean;
  motionSafe: boolean;
};

const G = 2200;
const STEP = 1 / 240;
const ITER = 6;
const LIFT_SCALE = 1.7;
/** Jar units a second: faster than any fall the jar can give, slower than a glitch. */
const MAX_SPEED = 1100;

type Engine = {
  setBodies: (
    list: { id: string; r: number; x: number; y: number; a: number }[],
  ) => void;
  bind: (id: string, el: HTMLElement | null) => void;
  configure: (p: Physics) => void;
  fit: (f: Fit) => void;
  pour: (ids: string[], rand: () => number) => void;
  lift: (id: string) => void;
  drop: (id: string) => void;
  solve: () => void;
  wake: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

type Impact = { speed: number; glass: boolean; x: number };

function createEngine(
  angle: { get: () => number },
  onImpact: (hit: Impact) => void,
): Engine {
  const bodies = new Map<string, Body>();
  const order: Body[] = [];
  let cfg: Physics = {
    gravity: 1,
    bounce: 0.28,
    paused: false,
    motionSafe: true,
  };
  let fit: Fit | null = null;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let still = 0;
  let visible = false;
  let disposed = false;
  let prevAngle = angle.get();
  let jarW = 0;
  let pourQueue: {
    id: string;
    at: number;
    x: number;
    vx: number;
    w: number;
  }[] = [];
  let clock = 0;

  const toWorld = (x: number, y: number, out: Vec) => {
    const f = fit;
    if (!f) {
      out.x = x;
      out.y = y;
      return;
    }
    const th = (angle.get() * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const lx = (x - CX) * f.s;
    const ly = (y - PIVOT_Y) * f.s;
    out.x = f.px + lx * c - ly * s;
    out.y = f.py + lx * s + ly * c;
  };
  const toLocal = (x: number, y: number, out: Vec) => {
    const f = fit;
    if (!f) {
      out.x = x;
      out.y = y;
      return;
    }
    const th = (angle.get() * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dx = (x - f.px) / f.s;
    const dy = (y - f.py) / f.s;
    out.x = CX + dx * c + dy * s;
    out.y = PIVOT_Y - dx * s + dy * c;
  };
  const tmp: Vec = { x: 0, y: 0 };

  // The lift rides the snap spring, the way back the glide spring.
  const SNAP_K = springs.snap.stiffness / springs.snap.mass;
  const SNAP_C = springs.snap.damping / springs.snap.mass;
  const GLIDE_K = springs.glide.stiffness / springs.glide.mass;
  const GLIDE_C = springs.glide.damping / springs.glide.mass;

  // Contacts found in a step's first pass, kept for the velocity pass: the
  // pebbles (or -1 for glass), the normal, and how fast they were closing.
  let cA = new Int32Array(0);
  let cB = new Int32Array(0);
  let cN = new Float32Array(0);
  let cV = new Float32Array(0);
  let contacts = 0;
  const room = (n: number) => {
    const need = Math.max(16, n * 10);
    if (cA.length >= need) return;
    cA = new Int32Array(need);
    cB = new Int32Array(need);
    cN = new Float32Array(need * 2);
    cV = new Float32Array(need);
  };
  const record = (a: number, b: number, nx: number, ny: number, vn: number) => {
    if (contacts >= cA.length) return;
    cA[contacts] = a;
    cB[contacts] = b;
    cN[contacts * 2] = nx;
    cN[contacts * 2 + 1] = ny;
    cV[contacts] = vn;
    contacts += 1;
  };

  /**
   * One step, position-based: integrate, push every overlap apart (pebble on
   * pebble, pebble on glass) a few times over, then read the velocity back
   * from how far each pebble actually moved — so a pebble held by its
   * neighbours really is still — and only then add the bounce of a real
   * impact and let contact friction roll the pebbles.
   */
  const physicsStep = (dt: number, th: number, om: number, al: number) => {
    const g = G * cfg.gravity;
    const gx = g * Math.sin(th);
    const gy = g * Math.cos(th);
    const e = clamp(cfg.bounce, 0, 0.8);
    // Fill the queue: the next pebble drops through the neck.
    const head = pourQueue[0];
    if (head && head.at <= clock) {
      const b = bodies.get(head.id);
      // The next pebble waits its turn until the mouth is clear, so none is
      // ever born inside another.
      let clear = true;
      if (b) {
        for (const o of order) {
          if (o.mode !== "free") continue;
          const dx = o.x - head.x;
          const dy = o.y - (TOP - b.r - 4);
          if (dx * dx + dy * dy < (o.r + b.r) * (o.r + b.r) * 1.1) {
            clear = false;
            break;
          }
        }
      }
      if (!b) pourQueue.shift();
      else if (clear) {
        pourQueue.shift();
        b.mode = "free";
        b.x = head.x;
        b.y = TOP - b.r - 4;
        b.vx = head.vx;
        b.vy = 160;
        b.w = head.w;
      }
    }
    for (const b of order) {
      if (b.mode !== "free") continue;
      // The jar's frame turns: Euler, centrifugal and Coriolis terms, so a
      // jerk of the jar sloshes the heap the way a real one would.
      const rx = b.x - CX;
      const ry = b.y - PIVOT_Y;
      const ax = gx + 0.5 * (al * ry + om * om * rx + 2 * om * b.vy);
      const ay = gy + 0.5 * (-al * rx + om * om * ry - 2 * om * b.vx);
      b.vx = (b.vx + ax * dt) * (1 - 0.3 * dt);
      b.vy = (b.vy + ay * dt) * (1 - 0.3 * dt);
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    contacts = 0;
    for (let it = 0; it < ITER; it += 1) {
      const first = it === 0;
      for (let i = 0; i < order.length; i += 1) {
        const p = order[i] as Body;
        if (p.mode !== "free") continue;
        for (let j = i + 1; j < order.length; j += 1) {
          const q = order[j] as Body;
          if (q.mode !== "free") continue;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const rr = p.r + q.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const ip = 1 / (p.r * p.r);
          const iq = 1 / (q.r * q.r);
          const wp = ip / (ip + iq);
          const pen = rr - d;
          p.x -= nx * pen * wp;
          p.y -= ny * pen * wp;
          q.x += nx * pen * (1 - wp);
          q.y += ny * pen * (1 - wp);
          if (first) {
            record(i, j, nx, ny, (q.vx - p.vx) * nx + (q.vy - p.vy) * ny);
          }
        }
      }
      for (let i = 0; i < order.length; i += 1) {
        const b = order[i] as Body;
        if (b.mode !== "free") continue;
        for (const sgm of SEGMENTS) {
          const ex = sgm.bx - sgm.ax;
          const ey = sgm.by - sgm.ay;
          const len2 = ex * ex + ey * ey || 1;
          const t = clamp(
            ((b.x - sgm.ax) * ex + (b.y - sgm.ay) * ey) / len2,
            0,
            1,
          );
          const side = (b.x - sgm.ax) * sgm.nx + (b.y - sgm.ay) * sgm.ny;
          if (side > b.r + 1) continue;
          const dx = b.x - (sgm.ax + ex * t);
          const dy = b.y - (sgm.ay + ey * t);
          const d = Math.hypot(dx, dy);
          let nx: number;
          let ny: number;
          let pen: number;
          if (side < 0 && t > 0 && t < 1) {
            nx = sgm.nx;
            ny = sgm.ny;
            pen = b.r - side;
          } else {
            if (d >= b.r || d < 1e-6) continue;
            nx = dx / d;
            ny = dy / d;
            pen = b.r - d;
          }
          b.x += nx * pen;
          b.y += ny * pen;
          if (first) record(i, -1, nx, ny, b.vx * nx + b.vy * ny);
        }
        // A last guard: nothing tunnels out through the body's walls or foot.
        b.x = clamp(b.x, CX - BODY + b.r, CX + BODY - b.r);
        if (b.y > BOTTOM - b.r) b.y = BOTTOM - b.r;
      }
    }
    for (const b of order) {
      if (b.mode !== "free") continue;
      b.vx = (b.x - b.px) / dt;
      b.vy = (b.y - b.py) / dt;
      // A deep overlap resolved in one step must not turn into a launch.
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        b.vx *= MAX_SPEED / speed;
        b.vy *= MAX_SPEED / speed;
      }
    }
    // Bounce and roll, from the contacts the first pass found.
    const grip = Math.min(1, 40 * dt);
    for (let k = 0; k < contacts; k += 1) {
      const p = order[cA[k] ?? 0];
      const qi = cB[k] ?? -1;
      const nx = cN[k * 2] ?? 0;
      const ny = cN[k * 2 + 1] ?? 0;
      const closing = cV[k] ?? 0;
      if (!p) continue;
      const tx = -ny;
      const ty = nx;
      if (qi < 0) {
        if (closing < -60 && e > 0) {
          p.vx += -closing * e * nx;
          p.vy += -closing * e * ny;
        }
        // Rolling on the glass: spin toward the rate that leaves no slip.
        const target = (p.vx * tx + p.vy * ty) / p.r;
        p.w += (target - p.w) * grip;
        if (closing < -140) {
          toWorld(p.x, p.y, tmp);
          onImpact({ speed: -closing, glass: true, x: tmp.x });
        }
        continue;
      }
      const q = order[qi];
      if (!q) continue;
      if (closing < -60 && e > 0) {
        const ip = 1 / (p.r * p.r);
        const iq = 1 / (q.r * q.r);
        const jn = (-closing * e) / (ip + iq);
        p.vx -= jn * ip * nx;
        p.vy -= jn * ip * ny;
        q.vx += jn * iq * nx;
        q.vy += jn * iq * ny;
      }
      // Two pebbles rolling on each other share out the slip between them.
      const slip =
        (q.vx - p.vx) * tx + (q.vy - p.vy) * ty - q.w * q.r - p.w * p.r;
      p.w += (slip / (2 * p.r)) * grip;
      q.w += (slip / (2 * q.r)) * grip;
      if (closing < -140) {
        toWorld((p.x + q.x) / 2, (p.y + q.y) / 2, tmp);
        onImpact({ speed: -closing, glass: false, x: tmp.x });
      }
    }
    for (const b of order) {
      if (b.mode !== "free") continue;
      b.a += (b.w * dt * 180) / Math.PI;
      b.w *= 1 - 0.8 * dt;
    }
  };

  const springStep = (dt: number) => {
    for (const b of order) {
      if (b.mode !== "lift" && b.mode !== "drop") continue;
      const f = fit;
      if (!f) continue;
      let tx = f.liftX;
      let ty = f.liftY;
      let ts = LIFT_SCALE;
      let k = SNAP_K;
      let c = SNAP_C;
      if (b.mode === "drop") {
        toWorld(CX, TOP - b.r - 6, tmp);
        tx = tmp.x;
        ty = tmp.y;
        ts = 1;
        k = GLIDE_K;
        c = GLIDE_C;
      }
      b.wvx += (-k * (b.wx - tx) - c * b.wvx) * dt;
      b.wvy += (-k * (b.wy - ty) - c * b.wvy) * dt;
      b.wx += b.wvx * dt;
      b.wy += b.wvy * dt;
      b.vs += (-k * (b.s - ts) - c * b.vs) * dt;
      b.s += b.vs * dt;
      // The pebble rights itself in the world: its face turns upright.
      const target = b.mode === "lift" ? 0 : b.wa;
      b.wva += (-k * (b.wa - target) - c * b.wva) * dt;
      b.wa += b.wva * dt;
      if (b.mode === "drop" && Math.hypot(b.wx - tx, b.wy - ty) < 3 * f.s) {
        // Back through the mouth: into the jar's frame, falling.
        toLocal(b.wx, b.wy, tmp);
        b.x = tmp.x;
        b.y = tmp.y;
        const th = (angle.get() * Math.PI) / 180;
        const c2 = Math.cos(th);
        const s2 = Math.sin(th);
        b.vx = (b.wvx * c2 + b.wvy * s2) / f.s;
        b.vy = (-b.wvx * s2 + b.wvy * c2) / f.s + 160;
        b.a = b.wa - angle.get();
        b.w = 0;
        b.s = 1;
        b.mode = "free";
      }
    }
  };

  const paint = () => {
    const f = fit;
    const jar = angle.get();
    for (const b of order) {
      const el = b.el;
      if (!el) continue;
      if (b.mode === "wait") {
        el.style.opacity = "0";
        continue;
      }
      el.style.opacity = "";
      if (b.mode === "free" || !f) {
        el.style.transform = `translate(${r2(b.x - b.r)}px, ${r2(b.y - b.r)}px) rotate(${r1(b.a)}deg)`;
        el.style.zIndex = "";
        continue;
      }
      toLocal(b.wx, b.wy, tmp);
      el.style.transform = `translate(${r2(tmp.x - b.r)}px, ${r2(tmp.y - b.r)}px) rotate(${r1(b.wa - jar)}deg) scale(${r2(b.s)})`;
      el.style.zIndex = "30";
    }
  };

  const energy = () => {
    let most = 0;
    for (const b of order) {
      if (b.mode === "wait") return Infinity;
      if (b.mode !== "free") {
        most = Math.max(
          most,
          Math.hypot(b.wvx, b.wvy) + Math.abs(b.vs) * 100 + Math.abs(b.wva),
        );
        continue;
      }
      most = Math.max(most, Math.hypot(b.vx, b.vy) + Math.abs(b.w) * b.r);
    }
    return most;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!cfg.paused) {
      acc += dt;
      const th = (angle.get() * Math.PI) / 180;
      const prev = (prevAngle * Math.PI) / 180;
      const om = clamp((th - prev) / Math.max(dt, 1e-3), -6, 6);
      const al = clamp((om - jarW) / Math.max(dt, 1e-3), -60, 60);
      jarW = om;
      prevAngle = angle.get();
      let steps = 0;
      while (acc >= STEP && steps < 16) {
        clock += STEP;
        physicsStep(STEP, th, om, al);
        springStep(STEP);
        acc -= STEP;
        steps += 1;
      }
      if (steps >= 16) acc = 0;
    }
    paint();
    if (energy() < 8 && !pourQueue.length && !cfg.paused) still += dt;
    else still = 0;
    if (still > 0.4 || cfg.paused) {
      for (const b of order) {
        if (b.mode === "free") {
          b.vx = 0;
          b.vy = 0;
          b.w = 0;
        }
      }
      last = 0;
      jarW = 0;
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  let solveFrame = 0;
  const wake = () => {
    if (disposed || !visible || document.hidden) return;
    still = 0;
    if (!cfg.motionSafe) {
      // Reduced motion re-solves the heap at rest, at most once a frame, so a
      // drag that turns the jar does not solve it on every pointer move.
      if (!solveFrame) {
        solveFrame = window.requestAnimationFrame(() => {
          solveFrame = 0;
          if (!disposed) solve();
        });
      }
      return;
    }
    if (!frame) {
      prevAngle = angle.get();
      frame = window.requestAnimationFrame(tick);
    }
  };

  /** Runs the heap to rest at once: the reduced-motion answer to a tilt, a lift or a drop. */
  const solve = () => {
    for (const b of order) {
      if (b.mode === "wait") b.mode = "free";
      if (b.mode === "drop") {
        b.mode = "free";
        b.x = CX;
        b.y = TOP - b.r - 6;
        b.s = 1;
        b.vx = 0;
        b.vy = 0;
      }
      if (b.mode === "lift") {
        b.wx = fit?.liftX ?? 0;
        b.wy = fit?.liftY ?? 0;
        b.s = LIFT_SCALE;
        b.wa = 0;
      }
    }
    pourQueue = [];
    const th = (angle.get() * Math.PI) / 180;
    for (let i = 0; i < 240 * 3; i += 1) {
      physicsStep(STEP, th, 0, 0);
      if (i % 60 === 59 && energy() < 2) break;
    }
    for (const b of order) {
      b.vx = 0;
      b.vy = 0;
      b.w = 0;
    }
    prevAngle = angle.get();
    paint();
  };

  return {
    setBodies(list) {
      const keep = new Set(list.map((x) => x.id));
      for (const id of [...bodies.keys()]) {
        if (!keep.has(id)) bodies.delete(id);
      }
      order.length = 0;
      for (const item of list) {
        let b = bodies.get(item.id);
        if (!b) {
          b = {
            id: item.id,
            r: item.r,
            x: item.x,
            y: item.y,
            vx: 0,
            vy: 0,
            px: item.x,
            py: item.y,
            a: item.a,
            w: 0,
            mode: "free",
            wx: 0,
            wy: 0,
            wvx: 0,
            wvy: 0,
            wa: 0,
            wva: 0,
            s: 1,
            vs: 0,
            el: null,
          };
          bodies.set(item.id, b);
        }
        b.r = item.r;
        order.push(b);
      }
      room(order.length);
      paint();
      wake();
    },
    bind(id, el) {
      const b = bodies.get(id);
      if (b) b.el = el;
    },
    configure(p) {
      const was = cfg;
      cfg = p;
      if (was.paused !== p.paused || was.gravity !== p.gravity) wake();
    },
    fit(f) {
      fit = f;
      if (!cfg.motionSafe) solve();
      else {
        paint();
        wake();
      }
    },
    pour(ids, rand) {
      if (!cfg.motionSafe) return;
      const gap = cascade(ids.length);
      pourQueue = ids.map((id, i) => {
        const b = bodies.get(id);
        const r = b?.r ?? 17;
        const room = Math.max(0, NECK - r - 3);
        if (b) b.mode = "wait";
        return {
          id,
          at: clock + 0.12 + i * Math.max(gap, 0.055),
          x: CX + (rand() * 2 - 1) * room,
          vx: (rand() * 2 - 1) * 40,
          w: (rand() * 2 - 1) * 6,
        };
      });
      paint();
      wake();
    },
    lift(id) {
      const b = bodies.get(id);
      if (!b || b.mode === "lift") return;
      if (b.mode === "free" || b.mode === "wait") {
        toWorld(b.x, b.y, tmp);
        b.wx = tmp.x;
        b.wy = tmp.y;
        b.wa = b.a + angle.get();
        // Turn the short way round to upright.
        b.wa = ((((b.wa + 180) % 360) + 360) % 360) - 180;
        b.wvx = 0;
        b.wvy = -60;
        b.wva = 0;
        b.s = 1;
        b.vs = 0;
      }
      b.mode = "lift";
      if (!cfg.motionSafe) solve();
      wake();
    },
    drop(id) {
      const b = bodies.get(id);
      if (!b || b.mode !== "lift") return;
      b.mode = "drop";
      if (!cfg.motionSafe) solve();
      wake();
    },
    solve,
    wake,
    setVisible(on) {
      visible = on;
      if (on) wake();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (solveFrame) window.cancelAnimationFrame(solveFrame);
      frame = 0;
      solveFrame = 0;
    },
  };
}

/* ---------------------------------- layout --------------------------------- */

/** A heap for the first paint and the server: hex rows from the foot up, in item order. */
function heap(items: readonly AvatarJarItem[], size: number, seed: number) {
  const rand = lcg(seed);
  const r = size / 2;
  const pitch = size * 1.02;
  const rise = pitch * 0.866;
  const full = Math.max(1, Math.floor((2 * BODY) / pitch));
  const out: { id: string; r: number; x: number; y: number; a: number }[] = [];
  let k = 0;
  let col = 0;
  for (const item of items) {
    // Alternate rows hold one fewer and sit in the gaps of the row below.
    const inRow = k % 2 === 1 ? Math.max(1, full - 1) : full;
    const x = CX - (inRow * pitch) / 2 + pitch / 2 + col * pitch;
    const y = BOTTOM - r - k * rise;
    const ri = r * (0.9 + ((hash(item.id) >>> 3) % 21) / 100);
    out.push({
      id: item.id,
      r: r2(ri),
      x: r2(x),
      y: r2(y),
      a: Math.round(rand() * 360 - 180),
    });
    col += 1;
    if (col >= inRow) {
      col = 0;
      k += 1;
    }
  }
  return out;
}

function fitBox(w: number, h: number, size: number, tilt: number): Fit {
  const t = (Math.min(60, Math.abs(tilt) + 6) * Math.PI) / 180;
  const halfW = HALF_X * Math.cos(t) + HALF_Y * Math.sin(t);
  const halfH = HALF_X * Math.sin(t) + HALF_Y * Math.cos(t);
  const sw = (w - 16) / (2 * halfW);
  const lift0 = size * LIFT_SCALE * sw + 28;
  const sh = (h - lift0 - 18) / (2 * halfH);
  const s = Math.max(0.2, Math.min(1.5, sw, sh));
  const liftR = (size / 2) * LIFT_SCALE * s;
  const py = h - 12 - halfH * s;
  const jarTop = py - (PIVOT_Y - TOP + 8) * s;
  const cardW = Math.min(156, Math.max(96, w * 0.42));
  const group = liftR * 2 + 10 + cardW;
  const liftX = w / 2 - group / 2 + liftR;
  const liftY = Math.max(liftR + 6, Math.min(jarTop - liftR - 8, jarTop / 2));
  return {
    s: r2(s),
    px: r2(w / 2),
    py: r2(py),
    liftX: r2(liftX),
    liftY: r2(liftY),
    cardX: r2(liftX + liftR + 10),
    cardW: r2(cardW),
    w,
    h,
  };
}

/* -------------------------------- component -------------------------------- */

/**
 * A glass jar of pebbles, each a face. The pebbles are rigid discs in a
 * small physics world — gravity, contact with restitution `bounce` and
 * friction that rolls them — so they pour in through the neck one after
 * another, tumble and settle into a heap with a rattle. Drag the jar sideways
 * and it turns 1:1 under the finger (rubber-banded past `tilt`): in its frame
 * gravity swings round, and the turning frame's own forces slosh the heap
 * against the low side; let go and the throw is projected and the jar glides
 * to rest there with the release velocity. Click a pebble to lift it out on
 * the snap spring — it rights itself, grows, and its name card settles beside
 * it — and click again to drop it back through the mouth to find a gap.
 *
 * The pebbles are a roving set of buttons: Up and Down move between them,
 * Left and Right tilt the jar, 0 rights it, Enter lifts or drops, Escape
 * drops. The simulation sleeps when the heap is still and never runs off
 * screen. Under reduced motion nothing tumbles: every change re-solves the
 * heap at once.
 */
export function AvatarJar({
  items = defaultAvatarJarItems,
  angle,
  defaultAngle = 0,
  onAngleChange,
  lifted,
  defaultLifted = null,
  onLiftedChange,
  tilt = 28,
  pebbleSize = 34,
  glass = "clear",
  gravity = 1,
  bounce = 0.28,
  pour = "inView",
  repourKey = 0,
  label = "Jar",
  sound = false,
  seed = 7,
  paused = false,
  disabled = false,
  className,
}: AvatarJarProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const maxTilt = clamp(tilt, 0, 60);
  const size = clamp(pebbleSize, 16, 64);

  // Only as many pebbles as the jar holds; the rest are counted on the lid.
  const capacity = Math.max(
    1,
    Math.floor((0.7 * 51000) / (Math.PI * (size / 2) ** 2)),
  );
  const shown = React.useMemo(
    () => items.slice(0, capacity),
    [items, capacity],
  );
  const extra = items.length - shown.length;

  const [ownAngle, setOwnAngle] = React.useState(defaultAngle);
  const rest = clamp(angle ?? ownAngle, -maxTilt, maxTilt);
  const angleMV = useMotionValue(rest);
  const [ownLifted, setOwnLifted] = React.useState<string | null>(
    defaultLifted,
  );
  const liftedId = lifted !== undefined ? lifted : ownLifted;
  const [active, setActive] = React.useState<string | null>(null);
  const focusId =
    active && shown.some((i) => i.id === active)
      ? active
      : (shown[0]?.id ?? null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  const start = React.useMemo(
    () => heap(shown, size, seed),
    [shown, size, seed],
  );
  const startById = React.useMemo(
    () => new Map(start.map((b) => [b.id, b])),
    [start],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const spin = React.useRef<AnimationPlaybackControls | null>(null);
  const dragFrom = React.useRef(0);
  const dragging = React.useRef(false);
  const touchedAt = React.useRef(-Infinity);
  const poured = React.useRef(false);
  const visibleRef = React.useRef(false);
  const liftedShown = React.useRef<string | null>(null);

  const fit = React.useMemo(
    () => (box ? fitBox(box.w, box.h, size, maxTilt) : null),
    [box, size, maxTilt],
  );

  // Everything the engine needs to catch up with, whenever it (re)starts.
  const latest = React.useRef({
    physics: { gravity, bounce, paused, motionSafe } as Physics,
    fit,
    start,
    lifted: liftedId,
    pour,
    pourIds: shown.map((i) => i.id),
    seed,
  });
  const playImpact = React.useRef<(hit: Impact) => void>(() => {});
  React.useEffect(() => {
    latest.current = {
      physics: { gravity, bounce, paused, motionSafe },
      fit,
      start,
      lifted: liftedId,
      pour,
      pourIds: shown.map((i) => i.id),
      seed,
    };
    playImpact.current = (hit: Impact) => {
      // Only the visitor's own commotion is heard, and only once they have
      // pressed or clicked something on the page.
      if (clockNow() - touchedAt.current > 1500) return;
      const nav = navigator as Navigator & {
        userActivation?: { hasBeenActive: boolean };
      };
      if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
      const root = rootRef.current;
      audio.play("clack", {
        pitch: (hit.glass ? 1.35 : 0.95) * Math.sqrt(34 / size),
        gain: clamp((hit.speed - 120) / 900, 0.08, 0.6),
        pan: root
          ? panFrom(hit.x + root.getBoundingClientRect().left, root)
          : 0,
      });
    };
  });

  /** Pours every pebble in from the top, once per call to `repour`. */
  const pourRef = React.useRef(() => {});
  React.useEffect(() => {
    pourRef.current = () => {
      const e = engine.current;
      if (!e || poured.current) return;
      poured.current = true;
      const l = latest.current;
      if (!l.physics.motionSafe) return;
      e.pour(l.pourIds, lcg(l.seed + 11));
    };
  });

  // The engine is plain state that outlives StrictMode's rehearsal: a
  // cleanup only stops its loop, and the next setup resumes the same heap,
  // the same pour and the same lifted pebble.
  React.useEffect(() => {
    let e = engine.current;
    if (!e) {
      e = createEngine(angleMV, (hit) => playImpact.current(hit));
      engine.current = e;
      const l = latest.current;
      e.configure(l.physics);
      if (l.fit) e.fit(l.fit);
      e.setBodies(l.start);
      for (const [id, el] of nodes.current) e.bind(id, el);
      if (l.lifted) e.lift(l.lifted);
      liftedShown.current = l.lifted;
      if (l.pour === "mount") pourRef.current();
    }
    e.setVisible(visibleRef.current);
    const unsub = angleMV.on("change", () => engine.current?.wake());
    const running = e;
    return () => {
      unsub();
      running.setVisible(false);
      spin.current?.stop();
    };
  }, [angleMV]);

  React.useEffect(() => {
    engine.current?.configure({ gravity, bounce, paused, motionSafe });
  }, [gravity, bounce, paused, motionSafe]);

  React.useEffect(() => {
    if (fit) engine.current?.fit(fit);
  }, [fit]);

  React.useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setBodies(start);
    for (const [id, el] of nodes.current) e.bind(id, el);
  }, [start]);

  // The tilt the host or the last gesture asked for.
  const shownRest = React.useRef(rest);
  React.useEffect(() => {
    if (dragging.current) return;
    if (shownRest.current === rest) return;
    shownRest.current = rest;
    spin.current?.stop();
    if (!motionSafe) {
      angleMV.set(rest);
      engine.current?.solve();
      return;
    }
    spin.current = animate(angleMV, rest, springs.glide);
  }, [rest, motionSafe, angleMV]);

  // The lifted pebble follows the value.
  React.useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const was = liftedShown.current;
    if (was === liftedId) return;
    if (was) e.drop(was);
    if (liftedId) e.lift(liftedId);
    liftedShown.current = liftedId;
  }, [liftedId]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const on = Boolean(entry?.isIntersecting);
      visibleRef.current = on;
      engine.current?.setVisible(on);
      if (on && latest.current.pour === "inView") pourRef.current();
    });
    watcher.observe(node);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visibleRef.current = false;
    };
  }, []);

  // A host that bumps `repourKey` pours the jar again.
  const pouredKey = React.useRef(repourKey);
  React.useEffect(() => {
    if (pouredKey.current === repourKey) return;
    pouredKey.current = repourKey;
    poured.current = false;
    pourRef.current();
  }, [repourKey]);

  /* ------------------------------ interaction ------------------------------ */

  const touch = () => {
    touchedAt.current = clockNow();
  };

  const nameOf = (id: string | null) =>
    shown.find((i) => i.id === id)?.name ?? "";

  const setLift = (id: string | null) => {
    if (disabled || id === liftedId) return;
    touch();
    const el = rootRef.current;
    if (id) {
      audio.play("pop", {
        pitch: 0.9,
        gain: 0.4,
        pan: el
          ? panFrom(el.getBoundingClientRect().left + (fit?.liftX ?? 0), el)
          : 0,
      });
      const item = shown.find((i) => i.id === id);
      say(
        `Lifted ${item?.name ?? "a pebble"}${item?.role ? `, ${item.role}` : ""}.`,
      );
    } else if (liftedId) {
      say(`${nameOf(liftedId)} dropped back in.`);
    }
    if (lifted === undefined) setOwnLifted(id);
    onLiftedChange?.(id);
  };

  const describeTilt = (deg: number) => {
    const a = Math.round(deg);
    if (a === 0) return "Upright.";
    return `Tilted ${Math.abs(a)}° ${a < 0 ? "left" : "right"}.`;
  };

  const commitAngle = (next: number, velocity = 0) => {
    const to = clamp(Math.round(next * 10) / 10, -maxTilt, maxTilt);
    touch();
    spin.current?.stop();
    shownRest.current = angle === undefined ? to : rest;
    if (angle === undefined) setOwnAngle(to);
    onAngleChange?.(to);
    say(describeTilt(to));
    const target = angle === undefined ? to : rest;
    if (!motionSafe) {
      angleMV.set(target);
      engine.current?.solve();
      return;
    }
    spin.current = animate(angleMV, target, { ...springs.glide, velocity });
    engine.current?.wake();
  };

  const degPerPx = () => maxTilt / Math.max(80, (box?.w ?? 300) * 0.32);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      spin.current?.stop();
      dragFrom.current = angleMV.get();
      touch();
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current + offset.x * degPerPx();
      angleMV.set(
        r2(rubberClamp(raw, -maxTilt, maxTilt, Math.max(4, maxTilt * 0.5))),
      );
      touch();
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.x * degPerPx();
      commitAngle(clamp(project(angleMV.get(), v, 0.99), -maxTilt, maxTilt), v);
    },
    onCancel: () => {
      dragging.current = false;
      commitAngle(angleMV.get());
    },
    onTap: (event) => {
      const target = event.target as Element | null;
      const hit = target?.closest<HTMLElement>("[data-pebble]");
      const id = hit?.dataset.pebble ?? null;
      if (id) {
        setActive(id);
        setLift(liftedId === id ? null : id);
      } else if (liftedId) {
        setLift(null);
      }
    },
  });

  const focusPebble = (id: string | undefined) => {
    if (!id) return;
    setActive(id);
    nodes.current.get(id)?.focus();
  };

  const onPebbleKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled) return;
    const i = shown.findIndex((x) => x.id === id);
    const step = event.shiftKey ? 15 : 5;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusPebble(shown[(i + 1) % shown.length]?.id);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusPebble(shown[(i - 1 + shown.length) % shown.length]?.id);
        return;
      case "Home":
        event.preventDefault();
        focusPebble(shown[0]?.id);
        return;
      case "End":
        event.preventDefault();
        focusPebble(shown[shown.length - 1]?.id);
        return;
      case "ArrowLeft":
        event.preventDefault();
        commitAngle(Math.max(-maxTilt, rest - step));
        return;
      case "ArrowRight":
        event.preventDefault();
        commitAngle(Math.min(maxTilt, rest + step));
        return;
      case "0":
        event.preventDefault();
        commitAngle(0);
        return;
      case "Escape":
        if (liftedId) {
          event.preventDefault();
          setLift(null);
        }
        return;
    }
  };

  /* -------------------------------- drawing -------------------------------- */

  const tint = GLASS_TINT[glass] ?? GLASS_TINT.clear;
  const liftedItem = shown.find((i) => i.id === liftedId) ?? null;
  const [cardItem, setCardItem] = React.useState<AvatarJarItem | null>(
    liftedItem,
  );
  if (liftedItem && liftedItem !== cardItem) setCardItem(liftedItem);

  const s = fit?.s ?? 1;
  const frameStyle: React.CSSProperties = fit
    ? {
        left: r2(fit.px - CX),
        top: r2(fit.py - PIVOT_Y),
        width: FRAME_W,
        height: FRAME_H,
        transformOrigin: `${CX}px ${PIVOT_Y}px`,
      }
    : {
        left: `calc(50% - ${CX}px)`,
        bottom: 12,
        width: FRAME_W,
        height: FRAME_H,
        transformOrigin: `${CX}px ${PIVOT_Y}px`,
      };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="jar"
      aria-label={`${label}, ${items.length} ${items.length === 1 ? "pebble" : "pebbles"}`}
      aria-describedby={hintId}
      {...drag}
      onPointerDown={(event) => {
        touch();
        drag.onPointerDown(event);
      }}
      onKeyDown={touch}
      className={cn(
        "group/avatar-jar relative isolate h-[30rem] w-full touch-pan-y overflow-clip select-none",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <p id={hintId} className="sr-only">
        Up and down arrows move between pebbles. Left and right arrows tilt the
        jar, 0 sets it upright. Enter lifts a pebble out or drops it back,
        Escape drops it.
      </p>

      {/* The shadow on the table: it does not turn with the jar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1/2 h-4 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_16%,transparent),transparent)]"
        style={{ width: r2(FRAME_W * s * 0.9) }}
      />

      <motion.div
        className="absolute"
        style={{ ...frameStyle, rotate: angleMV, scale: s }}
      >
        <svg
          aria-hidden
          width={FRAME_W}
          height={FRAME_H}
          viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          <path
            d={`${GLASS_OUTER} Z`}
            style={{
              fill: `color-mix(in oklab, ${tint} ${glass === "clear" ? 5 : 16}%, transparent)`,
            }}
          />
          <path
            d={GLASS_INNER}
            fill="none"
            strokeWidth={5}
            style={{
              stroke: `color-mix(in oklab, ${tint} ${glass === "clear" ? 6 : 18}%, transparent)`,
            }}
          />
        </svg>

        {shown.map((item) => {
          const b = startById.get(item.id);
          const d = (b?.r ?? size / 2) * 2;
          const on = item.id === liftedId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) {
                  nodes.current.set(item.id, node);
                  engine.current?.bind(item.id, node);
                } else {
                  nodes.current.delete(item.id);
                  engine.current?.bind(item.id, null);
                }
              }}
              type="button"
              data-pebble={item.id}
              tabIndex={item.id === focusId ? 0 : -1}
              aria-label={`${item.name}${item.role ? `, ${item.role}` : ""}`}
              aria-pressed={on}
              aria-disabled={disabled || undefined}
              onFocus={() => setActive(item.id)}
              onKeyDown={(event) => onPebbleKey(event, item.id)}
              onClick={(event) => {
                // Pointer presses arrive through the drag's tap; a click with
                // no pointer behind it is Enter, Space or assistive tech.
                if (event.detail !== 0 || disabled) return;
                setLift(on ? null : item.id);
              }}
              className={cn(
                "absolute top-0 left-0 overflow-hidden rounded-full",
                "shadow-[inset_0_-3px_6px_color-mix(in_oklab,black_22%,transparent),0_1px_2px_color-mix(in_oklab,black_18%,transparent)]",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
              style={{
                width: d,
                height: d,
                transform: b
                  ? `translate(${r2(b.x - b.r)}px, ${r2(b.y - b.r)}px) rotate(${b.a}deg)`
                  : undefined,
              }}
            >
              {item.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none size-full object-cover"
                />
              ) : (
                <Portrait item={item} seed={seed} />
              )}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_24%,color-mix(in_oklab,white_55%,transparent),transparent_42%)]"
              />
            </button>
          );
        })}

        {/* The glass in front: rim, lip and the highlights that sit over the pebbles. */}
        <svg
          aria-hidden
          width={FRAME_W}
          height={FRAME_H}
          viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
          className="pointer-events-none absolute inset-0 z-10 overflow-visible"
        >
          <path
            d={GLASS_OUTER}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{
              stroke: `color-mix(in oklab, ${tint} ${glass === "clear" ? 34 : 70}%, var(--hairline-strong))`,
            }}
          />
          <rect
            x={CX - NECK - 12}
            y={TOP - 10}
            width={(NECK + 12) * 2}
            height={10}
            rx={5}
            strokeWidth={1.5}
            style={{
              fill: `color-mix(in oklab, ${tint} ${glass === "clear" ? 8 : 24}%, transparent)`,
              stroke: `color-mix(in oklab, ${tint} ${glass === "clear" ? 34 : 70}%, var(--hairline-strong))`,
            }}
          />
          <path
            d={`M ${CX - BODY + 12} ${BODY_Y + 10} L ${CX - BODY + 12} ${BOTTOM - 44}`}
            strokeWidth={6}
            strokeLinecap="round"
            className="stroke-white"
            opacity={0.32}
          />
          <path
            d={`M ${CX - BODY + 24} ${BODY_Y + 4} L ${CX - BODY + 24} ${BODY_Y + 54}`}
            strokeWidth={2.5}
            strokeLinecap="round"
            className="stroke-white"
            opacity={0.28}
          />
          <path
            d={`M ${CX + BODY - 12} ${BODY_Y + 24} L ${CX + BODY - 12} ${BODY_Y + 72}`}
            strokeWidth={3}
            strokeLinecap="round"
            className="stroke-white"
            opacity={0.2}
          />
          <path
            d={`M ${CX - BODY + 30} ${BOTTOM + 3} Q ${CX} ${BOTTOM + 9} ${CX + BODY - 30} ${BOTTOM + 3}`}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            style={{
              stroke: `color-mix(in oklab, ${tint} ${glass === "clear" ? 22 : 50}%, transparent)`,
            }}
          />
          {extra > 0 ? (
            <text
              x={CX}
              y={TOP - 15}
              textAnchor="middle"
              className="fill-ink-3 font-mono text-[11px]"
            >
              +{extra}
            </text>
          ) : null}
        </svg>
      </motion.div>

      {/* The lifted pebble's card, beside where it hangs. */}
      {fit ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-20 rounded-3 border border-hairline bg-popover px-3 py-2 shadow-[0_6px_18px_color-mix(in_oklab,black_14%,transparent)]"
          style={{ left: fit.cardX, top: fit.liftY, width: fit.cardW }}
          initial={false}
          animate={
            liftedItem
              ? { opacity: 1, x: 0, y: "-50%" }
              : { opacity: 0, x: motionSafe ? -8 : 0, y: "-50%" }
          }
          transition={
            liftedItem
              ? motionSafe
                ? {
                    ...springs.flick,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
              : { duration: durations.fast, ease: easings.exit }
          }
        >
          <p
            title={cardItem?.name}
            className="truncate text-sm font-medium text-foreground"
          >
            {cardItem?.name ?? ""}
          </p>
          {cardItem?.role ? (
            <p title={cardItem.role} className="truncate text-xs text-ink-3">
              {cardItem.role}
            </p>
          ) : null}
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
