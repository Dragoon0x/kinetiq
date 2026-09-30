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
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PourGlass = "tumbler" | "flute" | "jar";

export type PourHoldProps = {
  /** Controlled amount poured, 0 to `max`. */
  value?: number;
  /** Initial amount when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the pour or the key that changed it, with the new amount. */
  onValueChange?: (value: number) => void;
  /** What a full glass is worth. @default 100 */
  max?: number;
  /** The value's resolution and one arrow key's pour. @default 5 */
  step?: number;
  /** What is being poured. The slider's accessible name, shown over the reading. */
  label: string;
  /** The reading and the spoken value. @default a percentage of `max` */
  format?: (value: number, max: number) => string;
  /** The Empty button's text. @default "Empty" */
  emptyLabel?: string;
  /** How hard it pours, 0 to 1: a trickle from a shallow tilt, or a glug from a steep one. @default 0.5 */
  rate?: number;
  /** Water to syrup, 0 to 1: slower, thicker, and a surface that barely sloshes. @default 0.2 */
  viscosity?: number;
  /** The glass's shape, which sets how fast the level climbs for the same pour. @default "tumbler" */
  glass?: PourGlass;
  /** Let a held pour run over the brim and spill. Off: the carafe rights itself at the brim. @default false */
  overflow?: boolean;
  /** Play the pour. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];

/** The drawing's own box, in px: every pose and every spill stays inside it. */
const W = 240;
const H = 248;
/** The glass's centre line. */
const GX = 146;
/** Rows of the volume table: fine enough that the level never steps. */
const ROWS = 64;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** How far a rounded corner of radius r pulls the wall in at height h. */
const corner = (h: number, r: number) =>
  h < r ? r - Math.sqrt(r * r - (r - h) * (r - h)) : 0;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

type GlassDef = {
  /** Interior height, rim to floor. */
  depth: number;
  /** World y of the interior floor. */
  floorY: number;
  /** Interior half-width at height h above the floor. */
  half: (h: number) => number;
  /** The glass's outer half-width at height h. */
  outer: (h: number) => number;
  /** The outer silhouette under the floor, left half, top to bottom, as [dx from the centre, y]. */
  below: Pt[];
  /** Where the mouth hangs while pouring, from the centre line. */
  mouthDx: number;
  /** A screw band under a jar's rim. */
  thread?: boolean;
};

const GLASSES: Record<PourGlass, GlassDef> = {
  tumbler: {
    depth: 100,
    floorY: 230,
    half: (h) => 32 + (9 * h) / 100 - corner(h, 5),
    outer: (h) => 34.5 + (9 * h) / 100,
    below: [
      [-34.5, 235.5],
      [-33.7, 237.3],
      [-31.8, 238],
    ],
    mouthDx: -26,
  },
  flute: {
    depth: 84,
    floorY: 194,
    half: (h) =>
      h < 24 ? 2.5 + 15.5 * Math.sqrt(h / 24) : 18 + (3 * (h - 24)) / 60,
    outer: (h) =>
      2 + (h < 24 ? 2.5 + 15.5 * Math.sqrt(h / 24) : 18 + (3 * (h - 24)) / 60),
    below: [
      [-3.4, 197],
      [-1.8, 201],
      [-1.8, 233.5],
      [-5, 235.6],
      [-15, 236.6],
      [-24, 237.4],
      [-25, 238.6],
      [-23.6, 239.6],
      [-14, 240],
    ],
    mouthDx: -13,
  },
  jar: {
    depth: 98,
    floorY: 228,
    half: (h) => 49 - corner(h, 10) - 5 * smooth((h - 86) / 10),
    outer: (h) => 52 - 5 * smooth((h - 86) / 10),
    below: [
      [-52, 233.5],
      [-51.2, 236.2],
      [-49, 237.6],
      [-46.5, 238],
    ],
    mouthDx: -28,
    thread: true,
  },
};

type GlassSpec = {
  def: GlassDef;
  rimY: number;
  rimHalf: number;
  tableY: number;
  /** Cumulative volume at ROWS + 1 even heights, 0 to 1. */
  table: number[];
  interior: string;
  clip: string;
  walls: string;
  /** The outer right contour, rim to table: where a spill runs. */
  spill: Pt[];
  spillLength: number;
  mouth: Pt;
  ticks: { x: number; y: number }[];
  shadowHalf: number;
};

const toPath = (pts: readonly Pt[], close = true) =>
  pts.length === 0
    ? ""
    : `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")}${close ? " Z" : ""}`;

function heightOf(spec: GlassSpec, v: number): number {
  const t = spec.table;
  const target = clamp01(v);
  let lo = 0;
  let hi = ROWS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((t[mid] ?? 0) < target) lo = mid;
    else hi = mid;
  }
  const a = t[lo] ?? 0;
  const b = t[hi] ?? 1;
  const f = b > a ? (target - a) / (b - a) : 0;
  return ((lo + f) / ROWS) * spec.def.depth;
}

function buildGlass(def: GlassDef): GlassSpec {
  const { depth, floorY } = def;
  // Heights to trace the walls at: dense near the floor, where the corners
  // turn, and every 4px above.
  const hs: number[] = [];
  for (let h = 0; h < 14; h += 1) hs.push(h);
  for (let h = 14; h < depth; h += 4) hs.push(h);
  hs.push(depth);
  const up = hs;
  const down = [...hs].reverse();

  const rimY = floorY - depth;
  const rimHalf = def.half(depth);
  const interiorPts: Pt[] = [
    ...down.map((h): Pt => [GX - def.half(h), floorY - h]),
    ...up.map((h): Pt => [GX + def.half(h), floorY - h]),
  ];
  // The clip reaches a few px over the rim so a brimming surface can dome.
  const clipPts: Pt[] = [
    [GX - rimHalf, rimY - 5],
    ...interiorPts,
    [GX + rimHalf, rimY - 5],
  ];
  const outerLeft: Pt[] = [
    ...down.map((h): Pt => [GX - def.outer(h), floorY - h]),
    ...def.below.map(([dx, y]): Pt => [GX + dx, y]),
  ];
  const outerRight: Pt[] = [...outerLeft]
    .reverse()
    .map(([x, y]): Pt => [2 * GX - x, y]);
  const walls = `${toPath([...outerLeft, ...outerRight])} ${toPath(interiorPts)}`;

  // Area goes with the square of the width: the glass is round.
  const table = [0];
  let sum = 0;
  for (let i = 0; i < ROWS; i += 1) {
    const w = def.half(((i + 0.5) / ROWS) * depth);
    sum += w * w;
    table.push(sum);
  }
  for (let i = 0; i <= ROWS; i += 1) table[i] = (table[i] ?? 0) / sum;

  // A spill runs down the right-hand outside, from the rim to the widest
  // point of the base, and pools on the table from there.
  let widest = 0;
  def.below.forEach(([dx], i) => {
    if (-dx > -(def.below[widest]?.[0] ?? 0)) widest = i;
  });
  const spill: Pt[] = [
    ...down.map((h): Pt => [GX + def.outer(h), floorY - h]),
    ...def.below.slice(0, widest + 1).map(([dx, y]): Pt => [GX - dx, y]),
  ];
  let spillLength = 0;
  for (let i = 1; i < spill.length; i += 1) {
    const a = spill[i - 1];
    const b = spill[i];
    if (a && b) spillLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const tableY = Math.max(floorY, ...def.below.map(([, y]) => y));

  const spec: GlassSpec = {
    def,
    rimY,
    rimHalf,
    tableY,
    table,
    interior: toPath(interiorPts),
    clip: toPath(clipPts),
    walls,
    spill,
    spillLength,
    mouth: [GX + def.mouthDx, rimY - 22],
    ticks: [],
    shadowHalf: Math.max(...def.below.map(([dx]) => -dx)) + 6,
  };
  spec.ticks = [0.25, 0.5, 0.75].map((v) => {
    const h = heightOf(spec, v);
    return { x: r2(GX - def.outer(h)), y: r2(floorY - h) };
  });
  return spec;
}

const SPECS: Record<PourGlass, GlassSpec> = {
  tumbler: buildGlass(GLASSES.tumbler),
  flute: buildGlass(GLASSES.flute),
  jar: buildGlass(GLASSES.jar),
};

/*
 * The carafe, in its own frame: the pivot (where the hand would hold it) at
 * the origin and the mouth up the -y axis. Arcs are sampled once here, so a
 * pose is only a rotation and a shift per point.
 */
const MOUTH = 52;
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const out: Pt[] = [];
  for (let i = 1; i < 4; i += 1) {
    const a = ((from + ((to - from) * i) / 4) * Math.PI) / 180;
    out.push([
      Number((cx + r * Math.cos(a)).toFixed(3)),
      Number((cy + r * Math.sin(a)).toFixed(3)),
    ]);
  }
  return out;
};
const quad = (a: Pt, c: Pt, b: Pt) => {
  const out: Pt[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const t = i / 5;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
};
const mirror = (right: Pt[]): Pt[] => [
  ...right,
  ...[...right]
    .reverse()
    .filter(([x]) => x !== 0)
    .map(([x, y]): Pt => [-x, y]),
];
const CARAFE_OUTER: Pt[] = mirror([
  [0, 34],
  [11, 34],
  ...arc(11, 27, 7, 90, 0),
  [18, 27],
  [18, -12],
  ...quad([18, -12], [18, -30], [6, -32]),
  [6, -45],
  [7.5, -46],
  [7.5, -51],
  [6.5, -52],
  [0, -52],
]);
const CARAFE_INNER: Pt[] = mirror([
  [0, 32],
  [11, 32],
  ...arc(11, 27, 5, 90, 0),
  [16, 27],
  [16, -12],
  ...quad([16, -12], [16, -28], [4, -30.5]),
  [4, -52],
  [0, -52],
]);

const areaOf = (pts: readonly Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (p && q) a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};
const CARAFE_VOLUME = areaOf(CARAFE_INNER);

/** The part of a polygon at or below a horizontal line (y grows downward). */
function under(pts: readonly Pt[], line: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const inA = a[1] >= line;
    const inB = b[1] >= line;
    if (inA) out.push(a);
    if (inA !== inB) {
      const t = (line - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, line]);
    }
  }
  return out;
}

const REST_ANGLE = 22;
const REST_PIVOT: Pt = [50, 102];
/** The pose at which liquid reaches the lip and the stream leaves it. */
const POUR_AT = 0.86;
/** While held over a full glass with the brim guard on: tipped, not pouring. */
const HOVER_FULL = 0.4;

type Pose = { angle: number; px: number; py: number };

function poseOf(
  spec: GlassSpec,
  pose: number,
  volume: number,
  rate: number,
): Pose {
  // A carafe pours from a steeper angle as it empties, the way a hand tips
  // further for the last of it; the mouth stays over the same spot.
  const pourAngle = lerp(104, 126, rate) + 18 * clamp01(volume);
  const a = (pourAngle * Math.PI) / 180;
  const pourPivot: Pt = [
    spec.mouth[0] - MOUTH * Math.sin(a),
    spec.mouth[1] + MOUTH * Math.cos(a),
  ];
  return {
    angle: lerp(REST_ANGLE, pourAngle, pose),
    px: lerp(REST_PIVOT[0], pourPivot[0], pose),
    py: lerp(REST_PIVOT[1], pourPivot[1], pose),
  };
}

const place = (pts: readonly Pt[], p: Pose): Pt[] => {
  const a = (p.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]): Pt => [p.px + x * c - y * s, p.py + x * s + y * c]);
};

/** The liquid inside the carafe: level with gravity, whatever the tilt. */
function carafeLiquid(inner: readonly Pt[], fill: number): string {
  const target = CARAFE_VOLUME * fill;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, y] of inner) {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (areaOf(under(inner, mid)) > target) lo = mid;
    else hi = mid;
  }
  return toPath(under(inner, (lo + hi) / 2));
}

type Origin = { x: number; y: number; dx: number; dy: number };

const mouthOf = (p: Pose): Origin => {
  const a = (p.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  return { x: p.px + MOUTH * dx, y: p.py + MOUTH * dy, dx, dy };
};

type Flow = { v0: number; g: number; w0: number };

/** How long a drop leaving `o` takes to reach `surfaceY`, and where it lands. */
function fall(o: Origin, f: Flow, surfaceY: number) {
  const vy = o.dy * f.v0;
  const drop = Math.max(0.5, surfaceY - o.y);
  const t = (-vy + Math.sqrt(vy * vy + 2 * f.g * drop)) / f.g;
  return { t, x: o.x + o.dx * f.v0 * t };
}

/**
 * The stream between two moments of its fall, as a ribbon: a ballistic arc
 * that thins as it speeds up, since the same flow through a faster section
 * needs less of it.
 */
function streamPath(
  o: Origin,
  f: Flow,
  surfaceY: number,
  from: number,
  to: number,
): string {
  if (to - from < 0.015) return "";
  const { t: total } = fall(o, f, surfaceY);
  const left: string[] = [];
  const right: string[] = [];
  const n = 10;
  for (let i = 0; i <= n; i += 1) {
    const t = total * (from + ((to - from) * i) / n);
    const vx = o.dx * f.v0;
    const vy = o.dy * f.v0 + f.g * t;
    const speed = Math.hypot(vx, vy) || 1;
    const w = Math.max(1.5, f.w0 * Math.sqrt(f.v0 / speed)) / 2;
    const x = o.x + vx * t;
    const y = o.y + o.dy * f.v0 * t + 0.5 * f.g * t * t;
    const nx = (-vy / speed) * w;
    const ny = (vx / speed) * w;
    left.push(`${r2(x + nx)} ${r2(y + ny)}`);
    right.unshift(`${r2(x - nx)} ${r2(y - ny)}`);
  }
  return `M ${left.join(" L ")} L ${right.join(" L ")} Z`;
}

/** A length of a polyline, from `a` to `b` as shares of its whole length. */
function along(pts: readonly Pt[], total: number, a: number, b: number) {
  if (b - a < 0.005 || total <= 0) return "";
  const start = a * total;
  const end = b * total;
  const out: Pt[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i - 1];
    const q = pts[i];
    if (!p || !q) continue;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const lo = Math.max(start, run);
    const hi = Math.min(end, run + len);
    if (hi > lo && len > 0) {
      const at = (d: number): Pt => [
        p[0] + ((q[0] - p[0]) * (d - run)) / len,
        p[1] + ((q[1] - p[1]) * (d - run)) / len,
      ];
      if (out.length === 0) out.push(at(lo));
      out.push(at(hi));
    }
    run += len;
  }
  return toPath(out, false);
}

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The carafe has weight: one small overshoot as it comes to the pour. */
const TIP = spring(260, 0.74);

type Held = "pointer" | "key" | null;

type PourState = {
  /** What is physically holding the pour on, if anything. */
  held: Held;
  /** The carafe is tipped to pour. */
  active: boolean;
  /** It stops by itself at `target` (a tap or an arrow key). */
  stepped: boolean;
  target: number;
  /** The stream has left the mouth and not yet been let go. */
  streaming: boolean;
  /** The stream has landed: the level is rising. */
  flowing: boolean;
  spilling: boolean;
  /** Values this pour has reported, so the host echoing them back is not an override. */
  trail: Set<number>;
  pan: number;
};

type Api = {
  launch: () => void;
  land: () => void;
  reached: () => void;
  endStream: () => void;
  interrupt: () => void;
  settleTo: (v: number, quiet?: boolean) => void;
  stop: (report?: boolean) => void;
  release: (source: Exclude<Held, null>) => void;
  onVolume: (v: number) => void;
  onPose: (v: number) => void;
};

/**
 * A value input you fill by pouring. Holding the instrument tips a carafe;
 * once it leans past the pour angle a stream leaves the mouth, falls in a
 * real arc and lands in the glass, and from that frame the level — the
 * value — rises. Letting go rights the carafe, the stream's tail lets go of
 * the mouth and falls, and when it lands the surface takes the last drop and
 * settles, rocking on a spring whose damping is the liquid's viscosity. A tap
 * pours one step.
 *
 * The glass's shape turns volume into height (area goes with the square of
 * the width), so a flute's narrow bowl climbs fast and a jar's slowly. The
 * pour loop's pitch rises with the level, the way a filling glass sounds.
 *
 * It is a real `role="slider"`: arrow keys pour and lower one step, Page keys
 * ten, End pours to the brim, Home empties, and Space or Enter held pours
 * for as long as it is held. Under reduced motion the carafe swaps poses, the
 * stream appears whole and the surface stays flat, while the level still
 * rises and stops with the hold, because the level is the value.
 */
export function PourHold({
  value,
  defaultValue = 0,
  onValueChange,
  max = 100,
  step = 5,
  label,
  format,
  emptyLabel = "Empty",
  rate = 0.5,
  viscosity = 0.2,
  glass = "tumbler",
  overflow = false,
  sound = false,
  disabled = false,
  className,
}: PourHoldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `pour-${uid}`;
  const spec = SPECS[glass] ?? SPECS.tumbler;
  const top = Math.max(step, max);
  const unit = Math.max(1e-6, Math.min(step, top));
  const rt = clamp01(rate);
  const vs = clamp01(viscosity);
  const say =
    format ?? ((v: number, m: number) => `${Math.round((v / m) * 100)}%`);

  const [own, setOwn] = React.useState(() =>
    Math.min(top, Math.max(0, defaultValue)),
  );
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const current = Math.min(top, Math.max(0, value ?? own));

  const pose = useMotionValue(0);
  const volume = useMotionValue(current / top);
  const head = useMotionValue(0);
  const tail = useMotionValue(0);
  // Once let go, the stream keeps the path it had: the liquid already in the
  // air does not swing round with the carafe.
  const live = useMotionValue(1);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fdx = useMotionValue(0);
  const fdy = useMotionValue(1);
  const slosh = useMotionValue(0);
  const agitation = useMotionValue(0);
  const clock = useMotionValue(0);
  const ring = useMotionValue(0);
  const ringX = useMotionValue(GX);
  const spill = useMotionValue(0);
  const brim = useMotionValue(0);
  const sheetHead = useMotionValue(0);
  const sheetTail = useMotionValue(0);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const loop = React.useRef<LoopHandle | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const reported = React.useRef(current);
  const settledTop = React.useRef(top);
  const pour = React.useRef<PourState>({
    held: null,
    active: false,
    stepped: false,
    target: 1,
    streaming: false,
    flowing: false,
    spilling: false,
    trail: new Set(),
    pan: 0,
  });
  const api = React.useRef<Api | null>(null);

  const flow: Flow = {
    v0: lerp(55, 105, rt) * lerp(1, 0.55, vs),
    g: lerp(5200, 3400, vs),
    w0: Math.min(7, lerp(3.2, 6, rt) * lerp(1, 1.3, vs)),
  };
  // Share of the glass per second.
  const flowRate = lerp(0.17, 0.62, rt) * lerp(1, 0.45, vs);
  const liquidFill = `color-mix(in oklch, var(--accent-bright) ${Math.round(lerp(36, 72, vs))}%, transparent)`;
  const surfaceStroke = `color-mix(in oklch, var(--accent-bright) ${Math.round(lerp(70, 95, vs))}%, transparent)`;

  const quantize = (v: number) =>
    Math.min(
      top,
      Math.max(
        0,
        Number((Math.round((clamp01(v) * top) / unit) * unit).toFixed(6)),
      ),
    );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const tip = (to: number) => {
    if (!motionSafe) {
      halt("pose");
      pose.set(to);
      return;
    }
    run("pose", animate(pose, to, { ...TIP, velocity: pose.getVelocity() }));
  };

  const origin = (): Origin =>
    mouthOf(poseOf(spec, pose.get(), volume.get(), rt));

  const surfaceY = () => spec.def.floorY - heightOf(spec, volume.get());

  const report = (q: number) => {
    const p = pour.current;
    reported.current = q;
    p.trail.add(q);
    if (!controlled) setOwn(q);
    onValueChange?.(q);
  };

  const startLoop = () => {
    if (loop.current) return;
    loop.current = audio.start("pour", {
      pitch: r2(lerp(0.8, 1.9, volume.get()) * lerp(1, 0.78, vs)),
      gain: r2(lerp(0.5, 0.7, rt)),
      pan: pour.current.pan,
    });
  };
  const stopLoop = () => {
    loop.current?.stop();
    loop.current = null;
  };

  const begin = (stepped: boolean, target: number) => {
    const p = pour.current;
    // Pressed again while the last stream is still falling: that one is
    // finished off, and this pour starts clean.
    if (p.streaming || head.get() > 0) {
      halt("head");
      halt("tail");
      head.set(0);
      tail.set(0);
      stopLoop();
    }
    // Pressed while the level is still settling on a value it was given (a
    // drain after Home, a lower): the pour starts from that value, not from
    // wherever the drawing has got to, or its reports would jump.
    const settled = reported.current / top;
    if (Math.abs(volume.get() - settled) > 1e-3) {
      halt("flow");
      volume.set(settled);
    }
    p.active = true;
    p.stepped = stepped;
    p.target = target;
    p.streaming = false;
    p.flowing = false;
    p.trail = new Set([reported.current]);
    const rect = svgRef.current?.getBoundingClientRect();
    p.pan = rect ? panFrom(rect.left + (GX / W) * rect.width, null) : 0;
    live.set(1);
    tip(1);
    // Under reduced motion the carafe is already there; the pose watcher
    // launches the stream the moment it passes the pour angle otherwise.
    if (pose.get() >= POUR_AT) launch();
  };

  const launch = () => {
    const p = pour.current;
    if (!p.active || p.streaming) return;
    p.streaming = true;
    tail.set(0);
    if (!motionSafe) {
      halt("head");
      head.set(1);
      land();
      return;
    }
    head.set(0);
    const { t } = fall(origin(), flow, surfaceY());
    run(
      "head",
      animate(head, 1, {
        duration: t,
        ease: "linear",
        onComplete: () => api.current?.land(),
      }),
    );
  };

  const land = () => {
    const p = pour.current;
    if (!p.active || !p.streaming || p.flowing) return;
    p.flowing = true;
    startLoop();
    if (motionSafe) {
      const push = 0.06 * (0.5 + rt) * (1 - 0.7 * vs);
      run("slosh", animate(slosh, push, spring(120, 0.9)));
      run(
        "agitation",
        animate(agitation, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      run(
        "clock",
        animate(clock, clock.get() + 900, { duration: 100, ease: "linear" }),
      );
    }
    flowTo(p.target);
  };

  const flowTo = (target: number) => {
    const from = volume.get();
    if (target <= from + 1e-4) {
      reached();
      return;
    }
    run(
      "flow",
      animate(volume, target, {
        duration: (target - from) / flowRate,
        ease: "linear",
        onComplete: () => api.current?.reached(),
      }),
    );
  };

  const reached = () => {
    const p = pour.current;
    if (!p.active) return;
    if (volume.get() >= 0.999) {
      if (overflow && !p.stepped) {
        spillOver();
        return;
      }
      stop();
      return;
    }
    if (p.stepped) stop();
  };

  const spillOver = () => {
    const p = pour.current;
    if (p.spilling) return;
    p.spilling = true;
    loop.current?.set({ pitch: r2(1.9 * lerp(1, 0.78, vs)) });
    sheetTail.set(0);
    if (motionSafe) {
      run(
        "brim",
        animate(brim, 1, { duration: durations.base, ease: easings.enter }),
      );
      run(
        "sheet",
        animate(sheetHead, 1, { duration: 0.5, ease: easings.exit }),
      );
    } else {
      brim.set(1);
      sheetHead.set(1);
    }
    run(
      "spill",
      animate(spill, 1, {
        duration: Math.max(0.2, (1 - spill.get()) / (flowRate * 0.5)),
        ease: "linear",
      }),
    );
  };

  const stop = (tell = true) => {
    const p = pour.current;
    if (!p.active) return;
    p.active = false;
    halt("flow");
    halt("spill");
    if (p.spilling) {
      p.spilling = false;
      if (motionSafe) {
        run(
          "brim",
          animate(brim, 0, { duration: durations.slow, ease: easings.enter }),
        );
        run(
          "sheetTail",
          animate(sheetTail, 1, {
            duration: 0.45,
            ease: easings.exit,
            onComplete: () => {
              sheetHead.set(0);
              sheetTail.set(0);
            },
          }),
        );
      } else {
        brim.set(0);
        sheetHead.set(0);
        sheetTail.set(0);
      }
    }
    const streaming = p.streaming;
    p.streaming = false;
    p.flowing = false;
    // Still held over a full glass: it stays tipped a little, waiting.
    tip(p.held && volume.get() >= 0.999 ? HOVER_FULL : 0);
    if (streaming) {
      const o = origin();
      fx.set(o.x);
      fy.set(o.y);
      fdx.set(o.dx);
      fdy.set(o.dy);
      live.set(0);
      if (!motionSafe) {
        endStream();
      } else {
        const { t } = fall(o, flow, surfaceY());
        run(
          "tail",
          animate(tail, 1, {
            duration: t,
            ease: "linear",
            onComplete: () => api.current?.endStream(),
          }),
        );
      }
    }
    if (!tell) return;
    const q = quantize(volume.get());
    if (q !== reported.current) report(q);
    settleTo(q / top, true);
    // A controlled host answers on its own schedule. Once it has had its
    // turn, a host that refused the pour gets its own value back.
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  /** The last of the stream lands: the drip, the ring, and the settle. */
  const endStream = () => {
    halt("head");
    halt("tail");
    const surface = surfaceY();
    const o: Origin = {
      x: fx.get(),
      y: fy.get(),
      dx: fdx.get(),
      dy: fdy.get(),
    };
    head.set(0);
    tail.set(0);
    live.set(1);
    stopLoop();
    audio.play("plip", {
      pitch: r2(lerp(0.85, 1.5, volume.get()) * lerp(1, 0.8, vs)),
      gain: 0.5,
      pan: pour.current.pan,
    });
    if (!motionSafe) return;
    ringX.set(r2(fall(o, flow, surface).x));
    ring.set(0.001);
    run("ring", animate(ring, 1, { duration: 0.55, ease: easings.enter }));
    const swing = spring(220, lerp(0.2, 0.9, vs));
    run("slosh", animate(slosh, 0, { ...swing, velocity: -slosh.get() * 12 }));
    run(
      "agitation",
      animate(agitation, 0, { duration: 0.6, ease: easings.enter }),
    );
    run(
      "clock",
      animate(clock, clock.get() + 6, { duration: 0.6, ease: "linear" }),
    );
  };

  /** The level goes where the value says; the surface feels the change. */
  const settleTo = (v: number, quiet = false) => {
    const from = volume.get();
    const to = clamp01(v);
    if (!motionSafe) {
      run(
        "flow",
        animate(volume, to, { duration: durations.fast, ease: easings.enter }),
      );
    } else {
      // From rest: a pour's own speed would carry the level past its value.
      run("flow", animate(volume, to, { ...springs.glide, velocity: 0 }));
      if (!quiet && Math.abs(to - from) > 0.01) {
        const kick = Math.sign(to - from) * 0.05 * (1 - 0.7 * vs);
        run(
          "slosh",
          animate(slosh, 0, {
            ...spring(220, lerp(0.2, 0.9, vs)),
            velocity: kick * 14,
          }),
        );
      }
    }
    if (to <= 0 && from > 0.01) {
      audio.play("gloop", { pitch: 0.7, gain: 0.55, pan: pour.current.pan });
      run(
        "spill",
        animate(spill, 0, { duration: durations.slow, ease: easings.exit }),
      );
    }
  };

  /** A hold broken by the page, not the hand: everything stops now. */
  const interrupt = () => {
    const p = pour.current;
    detach.current?.();
    detach.current = null;
    p.held = null;
    stopLoop();
    if (p.active) stop();
    else tip(0);
  };

  const press = (source: Exclude<Held, null>) => {
    if (disabled) return;
    const p = pour.current;
    p.held = source;
    if (p.active) {
      // Pressed again while a tap's step is still pouring: it keeps going.
      if (p.stepped) {
        p.stepped = false;
        p.target = 1;
        if (p.flowing) flowTo(1);
      }
      return;
    }
    if (reported.current / top >= 0.999 && !overflow) {
      // Refused: it tips, but nothing comes out of it.
      tip(HOVER_FULL);
      return;
    }
    begin(false, 1);
  };

  const release = (source: Exclude<Held, null>) => {
    const p = pour.current;
    if (p.held !== source) return;
    p.held = null;
    if (!p.active) {
      tip(0);
      return;
    }
    if (p.stepped) return;
    if (p.flowing) {
      stop();
      return;
    }
    // Let go before anything landed: a tap pours one step.
    p.stepped = true;
    p.target = Math.min(1, (quantize(volume.get()) + unit) / top);
  };

  const pourSteps = (n: number) => {
    if (disabled) return;
    const p = pour.current;
    if (p.active) {
      if (p.stepped) {
        p.target = Math.min(1, p.target + (n * unit) / top);
        if (p.flowing) flowTo(p.target);
      }
      return;
    }
    // Steps count from the committed value; the drawing may still be
    // settling towards it.
    const from = reported.current / top;
    const target = Math.min(1, (reported.current + n * unit) / top);
    if (target <= from + 1e-4) return;
    begin(true, target);
  };

  const lower = (to: number) => {
    if (disabled) return;
    if (pour.current.active) stop();
    const q = Math.min(top, Math.max(0, to));
    if (q === reported.current) return;
    if (!controlled) setOwn(q);
    onValueChange?.(q);
  };

  const onVolume = (v: number) => {
    const p = pour.current;
    if (!p.flowing) return;
    loop.current?.set({ pitch: r2(lerp(0.8, 1.9, v) * lerp(1, 0.78, vs)) });
    const q = quantize(v);
    if (q !== reported.current) report(q);
  };

  const onPose = (v: number) => {
    const p = pour.current;
    if (p.active && !p.streaming && v >= POUR_AT) launch();
  };

  React.useEffect(() => {
    api.current = {
      launch,
      land,
      reached,
      endStream,
      interrupt,
      settleTo,
      stop,
      release,
      onVolume,
      onPose,
    };
  });

  // What the host says the value is. Its echo of this pour's own reports is
  // not news; anything else — a refusal, a reset — wins, even mid-pour.
  React.useEffect(() => {
    const p = pour.current;
    const now = api.current;
    if (!now) return;
    if (p.active) {
      if (current === reported.current || p.trail.has(current)) return;
      now.stop(false);
    }
    if (current === reported.current && top === settledTop.current) return;
    reported.current = current;
    settledTop.current = top;
    now.settleTo(current / top);
  }, [current, top, check]);

  React.useEffect(() => {
    const offVolume = volume.on("change", (v) => api.current?.onVolume(v));
    const offPose = pose.on("change", (v) => api.current?.onPose(v));
    return () => {
      offVolume();
      offPose();
    };
  }, [volume, pose]);

  React.useEffect(() => {
    const interrupted = () => api.current?.interrupt();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.interrupt();
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      detach.current?.();
      detach.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      loop.current?.stop();
      loop.current = null;
    };
  }, []);

  const carafe = useTransform(
    [pose, volume, spill] as MotionValue<number>[],
    ([p = 0, v = 0, s = 0]: number[]) => {
      const at = poseOf(spec, p, v, rt);
      const inner = place(CARAFE_INNER, at);
      const outer = place(CARAFE_OUTER, at);
      return {
        walls: `${toPath(outer)} ${toPath(inner)}`,
        glass: toPath(inner),
        liquid: carafeLiquid(
          inner,
          Math.min(0.8, Math.max(0.07, 0.74 - 0.62 * v - 0.1 * s)),
        ),
      };
    },
  );
  const carafeWalls = useTransform(carafe, (c) => c.walls);
  const carafeGlass = useTransform(carafe, (c) => c.glass);
  const carafeFill = useTransform(carafe, (c) => c.liquid);

  const stream = useTransform(
    [pose, volume, head, tail, live, fx, fy, fdx, fdy] as MotionValue<number>[],
    ([
      p = 0,
      v = 0,
      hd = 0,
      tl = 0,
      lv = 1,
      x = 0,
      y = 0,
      dx = 0,
      dy = 1,
    ]: number[]) => {
      if (hd <= tl) return "";
      const o: Origin =
        lv > 0.5 ? mouthOf(poseOf(spec, p, v, rt)) : { x, y, dx, dy };
      const sy = spec.def.floorY - heightOf(spec, v);
      return streamPath(o, flow, sy, tl, hd);
    },
  );

  const liquid = useTransform(
    [volume, slosh, agitation, clock, brim] as MotionValue<number>[],
    ([v = 0, sl = 0, ag = 0, ck = 0, bm = 0]: number[]) => {
      if (v <= 0.001) return { body: "", line: "" };
      const y0 = spec.def.floorY - heightOf(spec, v);
      const impact = spec.mouth[0] + 10;
      const amp = 1.3 * (1 - 0.6 * vs) * ag;
      const reach = spec.rimHalf + 4;
      const pts: Pt[] = [];
      for (let i = 0; i <= 24; i += 1) {
        const x = GX - reach + (2 * reach * i) / 24;
        const u = (x - GX) / spec.rimHalf;
        const dome = bm * 2.6 * Math.max(0, 1 - u * u);
        pts.push([
          x,
          y0 + sl * (x - GX) + amp * Math.sin(0.36 * (x - impact) - ck) - dome,
        ]);
      }
      const bottom = spec.def.floorY + 4;
      return {
        body: toPath([...pts, [GX + reach, bottom], [GX - reach, bottom]]),
        line: toPath(pts, false),
      };
    },
  );
  const liquidBody = useTransform(liquid, (l) => l.body);
  const liquidLine = useTransform(liquid, (l) => l.line);

  const ringY = useTransform(volume, (v) =>
    r2(spec.def.floorY - heightOf(spec, v)),
  );
  const ringRx = useTransform(ring, (r) => r2(2 + 16 * r));
  const ringRy = useTransform(ring, (r) => r2(0.6 + 1.8 * r));
  const ringOpacity = useTransform(ring, (r) =>
    r > 0 && r < 1 ? r2(0.7 * (1 - r)) : 0,
  );

  const sheet = useTransform(
    [sheetHead, sheetTail] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => along(spec.spill, spec.spillLength, b, a),
  );
  const spillEnd = spec.spill[spec.spill.length - 1] ?? [GX, spec.tableY];
  // The puddle reaches 1.72 radii right of the foot: it stops short of the
  // drawing's edge rather than being cut by it.
  const puddleRx = useTransform(spill, (s) =>
    s > 0.002 ? r2(Math.min((W - 2 - spillEnd[0]) / 1.72, 3 + 36 * s)) : 0,
  );
  const puddleCx = useTransform(puddleRx, (rx) => r2(spillEnd[0] + rx * 0.72));
  const puddleRy = useTransform(spill, (s) => r2(1.4 + 1.2 * s));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const p = pour.current;
    if (p.held) return;
    detach.current?.();
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach.current?.();
      detach.current = null;
      api.current?.release("pointer");
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      api.current?.interrupt();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    press("pointer");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(1, Math.round(top / unit / 10));
    switch (event.key) {
      case " ":
      case "Enter":
        event.preventDefault();
        if (!event.repeat) press("key");
        return;
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        pourSteps(1);
        return;
      case "PageUp":
        event.preventDefault();
        pourSteps(big);
        return;
      case "End":
        event.preventDefault();
        pourSteps(Math.ceil(top / unit));
        return;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        lower(reported.current - unit);
        return;
      case "PageDown":
        event.preventDefault();
        lower(reported.current - big * unit);
        return;
      case "Home":
        event.preventDefault();
        lower(0);
        return;
    }
  };

  const reading = say(current, top);

  return (
    <div
      className={cn(
        "inline-flex w-[240px] max-w-full flex-col gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={top}
        aria-valuenow={current}
        aria-valuetext={reading}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || disabled) return;
          if (!pour.current.active && !pour.current.held) tip(0.08);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (!pour.current.active && !pour.current.held) tip(0);
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") release("key");
        }}
        onBlur={() => release("key")}
        className={cn(
          "relative block touch-none rounded-3 outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto max-w-full"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={spec.clip} />
            </clipPath>
          </defs>

          <ellipse
            cx={GX}
            cy={spec.tableY + 1}
            rx={spec.shadowHalf}
            ry={2.5}
            className="fill-ink-3/15"
          />
          <motion.ellipse
            cx={puddleCx}
            cy={spec.tableY}
            rx={puddleRx}
            ry={puddleRy}
            style={{ fill: liquidFill }}
          />

          <path d={spec.interior} className="fill-ink-3/[0.07]" />
          <g clipPath={`url(#${clipId})`}>
            <motion.path d={liquidBody} style={{ fill: liquidFill }} />
            <motion.path
              d={liquidLine}
              fill="none"
              strokeWidth={1.2}
              strokeLinecap="round"
              style={{ stroke: surfaceStroke }}
            />
            <motion.ellipse
              cx={ringX}
              cy={ringY}
              rx={ringRx}
              ry={ringRy}
              fill="none"
              strokeWidth={1}
              style={{ stroke: surfaceStroke, opacity: ringOpacity }}
            />
          </g>
          <path d={spec.walls} fillRule="evenodd" className="fill-ink-3/60" />
          {spec.def.thread ? (
            <g className="stroke-ink-3/60" strokeWidth={1}>
              {[5, 9].map((dy) => (
                <line
                  key={dy}
                  x1={r2(GX - spec.def.outer(spec.def.depth - dy) - 0.5)}
                  x2={r2(GX + spec.def.outer(spec.def.depth - dy) + 0.5)}
                  y1={spec.rimY + dy}
                  y2={spec.rimY + dy}
                />
              ))}
            </g>
          ) : null}
          <g className="stroke-ink-3/70" strokeWidth={1}>
            {spec.ticks.map((t) => (
              <line key={t.y} x1={t.x - 5} x2={t.x - 1.5} y1={t.y} y2={t.y} />
            ))}
          </g>
          <motion.path
            d={sheet}
            fill="none"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: surfaceStroke }}
          />

          <motion.path d={stream} style={{ fill: liquidFill }} />

          <motion.path d={carafeGlass} className="fill-ink-3/[0.07]" />
          <motion.path d={carafeFill} style={{ fill: liquidFill }} />
          <motion.path
            d={carafeWalls}
            fillRule="evenodd"
            className="fill-ink-3/60"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-3" title={label}>
            {label}
          </p>
          <p className="font-mono text-lg leading-tight text-foreground tabular-nums">
            {reading}
          </p>
        </div>
        <button
          type="button"
          onClick={() => lower(0)}
          disabled={disabled || current === 0}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          {emptyLabel}
        </button>
      </div>
    </div>
  );
}
