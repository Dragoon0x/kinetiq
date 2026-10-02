"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartScatter,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ChartMorphType = "bar" | "line" | "area" | "dot";
export type ChartMorphStatus = "ready" | "loading" | "error";

export type ChartMorphSeries = {
  id: string;
  label: string;
  /** One reading per label, oldest first. */
  values: number[];
  /** Any CSS colour. Defaults to the house series pigments. */
  color?: string;
};

export type ChartMorphProps = {
  /** Controlled chart type: bars, a line, an area or dots. */
  type?: ChartMorphType;
  /** Initial type when uncontrolled. @default "bar" */
  defaultType?: ChartMorphType;
  /** Fires from the type switch with the new type. */
  onTypeChange?: (type: ChartMorphType) => void;
  /** Curve tension for the line and the area, 0 to 1; bars round their corners by it. @default 0.5 */
  smooth?: number;
  /** How many of the latest readings are shown, 2 to all of them. @default 12 */
  points?: number;
  /** The series, each one value per label. @default defaultChartMorphSeries */
  series?: ChartMorphSeries[];
  /** One label per reading, oldest first: "Sep 2026". @default defaultChartMorphLabels */
  labels?: string[];
  /** Controlled hidden series ids. */
  hidden?: string[];
  /** Initial hidden series when uncontrolled. @default [] */
  defaultHidden?: string[];
  /** Fires from the legend with the new hidden ids. */
  onHiddenChange?: (hidden: string[]) => void;
  /** The point under the cursor changed (an index into the labels), or the cursor left. */
  onCursorChange?: (index: number | null) => void;
  /** How far a type change sweeps across the points, 0 (all at once) to 1 (a full left-to-right wave). @default 0.5 */
  wave?: number;
  /** How a reading prints. @default compact currency in `locale` */
  format?: (value: number) => string;
  /** The locale for readings. @default "en-US" */
  locale?: string;
  /** The currency for readings. @default "USD" */
  currency?: string;
  /** The chart's heading. @default "Volume" */
  title?: string;
  /** A quieter line under the heading. */
  subtitle?: string;
  /** The chart's accessible name. @default the title */
  label?: string;
  /** Whether the readings have arrived. @default "ready" */
  status?: ChartMorphStatus;
  /** "Try again" was pressed after the readings failed to load. */
  onRetry?: () => void;
  /** Play the swish and the ticks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** October 2024 to September 2026. */
export const defaultChartMorphLabels: string[] = Array.from(
  { length: 24 },
  (_, i) => {
    const m = (9 + i) % 12;
    const y = 2024 + Math.floor((9 + i) / 12);
    return `${MONTHS[m] ?? ""} ${y}`;
  },
);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two years of a store's monthly payment volume: cards growing steadily
 * with a December peak, wallets climbing fast from a small base, bank
 * transfers easing off. Plain arithmetic on a seeded sequence.
 */
export const defaultChartMorphSeries: ChartMorphSeries[] = (() => {
  const rand = mulberry32(1320);
  const cards: number[] = [];
  const wallets: number[] = [];
  const transfers: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    const month = (9 + i) % 12;
    const season =
      month === 11 ? 1.22 : month === 0 ? 0.86 : month === 10 ? 1.08 : 1;
    cards.push(Math.round((36000 + 640 * i) * season * (0.94 + 0.12 * rand())));
    wallets.push(
      Math.round((7800 + 720 * i) * season * (0.92 + 0.16 * rand())),
    );
    transfers.push(Math.round((13200 - 150 * i) * (0.9 + 0.2 * rand())));
  }
  return [
    { id: "cards", label: "Cards", values: cards },
    { id: "wallets", label: "Wallets", values: wallets },
    { id: "transfers", label: "Transfers", values: transfers },
  ];
})();

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

const TYPES: ChartMorphType[] = ["bar", "line", "area", "dot"];

type Params = {
  /** Half-width of each point's flat top, as a share of a bar. */
  hw: number;
  /** Connectors: 0 a notch to the floor, 1 the curve between the points. */
  join: number;
  /** How far each column's foot rises to its top: 1 collapses it to a sliver. */
  floor: number;
  fill: number;
  stroke: number;
  /** Dot radius, as a share of a full dot. */
  dot: number;
  /** How far series stand apart, as a share of a bar group. */
  dodge: number;
};

const PARAMS: Record<ChartMorphType, Params> = {
  bar: { hw: 1, join: 0, floor: 0, fill: 0.9, stroke: 0, dot: 0, dodge: 1 },
  line: { hw: 0, join: 1, floor: 0, fill: 0, stroke: 1, dot: 0.5, dodge: 0 },
  area: { hw: 0, join: 1, floor: 0, fill: 0.22, stroke: 1, dot: 0, dodge: 0 },
  // Dots keep the notches: a bar retracts straight up into its dot instead
  // of spinning a web to its neighbours on the way.
  dot: { hw: 0, join: 0, floor: 1, fill: 0, stroke: 0, dot: 1, dodge: 0.6 },
};

const KEYS = Object.keys(PARAMS.bar) as (keyof Params)[];
const DOT_R = 4.5;
const TOP = 12;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (p: number) => p * p * (3 - 2 * p);

const oneHot = (t: ChartMorphType) => TYPES.map((k) => (k === t ? 1 : 0));

function blend(w: number[]): Params {
  const out: Params = {
    hw: 0,
    join: 0,
    floor: 0,
    fill: 0,
    stroke: 0,
    dot: 0,
    dodge: 0,
  };
  let sum = 0;
  TYPES.forEach((t, k) => {
    const wk = w[k] ?? 0;
    sum += wk;
    for (const key of KEYS) out[key] += PARAMS[t][key] * wk;
  });
  if (sum > 0) for (const key of KEYS) out[key] /= sum;
  return out;
}

/** A type change in flight: where each point was coming from, and where it goes. */
type Morph = { from: number[][]; to: ChartMorphType; n: number };
/** A series toggle in flight, the same way: visibility per series. */
type Fade = { from: number[]; to: number[]; n: number };

/** How far a transition has got, 0–1: its clock runs from n − 1 to n. */
const localOf = (clock: number, n: number) => clamp(clock - (n - 1), 0, 1);

/** A point's own progress through a sweep: the left starts first. */
const sweep = (t: number, u: number, wave: number) =>
  ease(clamp(t * (1 + wave) - u * wave, 0, 1));

function weightsAt(
  m: Morph,
  i: number,
  t: number,
  u: number,
  wave: number,
): number[] {
  const to = oneHot(m.to);
  const from = m.from[i] ?? to;
  const p = sweep(t, u, wave);
  return from.map((f, k) => lerp(f, to[k] ?? 0, p));
}

const visAt = (f: Fade, s: number, t: number) =>
  lerp(f.from[s] ?? f.to[s] ?? 1, f.to[s] ?? 1, ease(t));

type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

const mix = (a: Pt, b: Pt, k: number): Pt => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
];
const straight = (a: Pt, b: Pt): Cubic => [
  a,
  mix(a, b, 1 / 3),
  mix(a, b, 2 / 3),
  b,
];

/** A cubic cut at a third and two thirds: three cubics that draw the same curve. */
function thirds(c: Cubic): [Cubic, Cubic, Cubic] {
  const split = (q: Cubic, t: number): [Cubic, Cubic] => {
    const [p0, p1, p2, p3] = q;
    const a = mix(p0, p1, t);
    const b = mix(p1, p2, t);
    const d = mix(p2, p3, t);
    const ab = mix(a, b, t);
    const bd = mix(b, d, t);
    const m = mix(ab, bd, t);
    return [
      [p0, a, ab, m],
      [m, bd, d, p3],
    ];
  };
  const [first, rest] = split(c, 1 / 3);
  const [second, third] = split(rest, 1 / 2);
  return [first, second, third];
}

const fmtPt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

type Geometry = {
  values: number[];
  /** Readings in the data. */
  count: number;
  /** The window, a motion value's current reading. */
  n: number;
  yMax: number;
  w: number;
  h: number;
  smooth: number;
  wave: number;
  morph: Morph;
  t: number;
  vis: number[];
  s: number;
};

type Mark = {
  x: number;
  y: number;
  bottom: number;
  hw: number;
  rc: number;
  p: Params;
  /** The series' visibility, 0–1. */
  seen: number;
};

/** Every visible point of one series, placed for this frame. */
function marksOf(g: Geometry): Mark[] {
  const { count: L, n, w, h } = g;
  const base = h - 1;
  const slot = w / Math.max(1e-6, n);
  const visible = g.vis.reduce((a, v) => a + v, 0);
  const before = g.vis.slice(0, g.s).reduce((a, v) => a + v, 0);
  const own = g.vis[g.s] ?? 0;
  const group = slot * 0.74;
  const sub = group / Math.max(1, visible);
  const centre = before + own / 2 - visible / 2;
  const marks: Mark[] = [];
  const first = Math.max(0, Math.ceil(L - n) - 1);
  for (let i = first; i < L; i += 1) {
    const j = i - (L - n);
    const u = clamp(j / Math.max(1, n - 1), 0, 1);
    const p = blend(weightsAt(g.morph, i, g.t, u, g.wave));
    const xc = (j + 0.5) * slot;
    const x = xc + centre * sub * p.dodge;
    const v = (g.values[i] ?? 0) * own;
    const y = base - (v / Math.max(1e-9, g.yMax)) * (base - TOP);
    const bottom = base + (y - base) * p.floor;
    const hw = Math.max(0, sub * 0.42 * own) * p.hw;
    const rc = Math.max(0, Math.min(hw, 6 * g.smooth, (bottom - y) / 2));
    marks.push({ x, y, bottom, hw, rc, p, seen: own });
  }
  return marks;
}

/**
 * One series as three paths: the fill (bars to areas), the stroke along its
 * top, and its dots. Each point is a flat top of half-width `hw` with rounded
 * corners, joined to the next by three cubics that are either a notch to the
 * floor or the smooth curve between the points, blended by `join`.
 */
function seriesPaths(g: Geometry) {
  const marks = marksOf(g);
  if (marks.length === 0)
    return { fill: "", stroke: "", dots: "", fillA: 0, strokeA: 0 };
  // Monotone tangents through the tops, so a curve never overshoots a reading.
  const slopes: number[] = [];
  for (let k = 0; k < marks.length - 1; k += 1) {
    const a = marks[k] as Mark;
    const b = marks[k + 1] as Mark;
    slopes.push((b.y - a.y) / Math.max(1e-6, b.x - a.x));
  }
  const tangent = (k: number) => {
    const a = slopes[k - 1];
    const b = slopes[k];
    if (a === undefined) return b ?? 0;
    if (b === undefined) return a;
    if (a * b <= 0) return 0;
    const m = (a + b) / 2;
    const limit = 3 * Math.min(Math.abs(a), Math.abs(b));
    return Math.sign(m) * Math.min(Math.abs(m), limit);
  };
  const top: string[] = [];
  let fillA = 0;
  let strokeA = 0;
  const dots: string[] = [];
  marks.forEach((m, k) => {
    fillA += m.p.fill * m.seen;
    strokeA += m.p.stroke * m.seen;
    const l = m.x - m.hw;
    const r = m.x + m.hw;
    if (k === 0) top.push(`M ${fmtPt([l, m.y + m.rc])}`);
    top.push(
      `Q ${fmtPt([l, m.y])} ${fmtPt([l + m.rc, m.y])}`,
      `L ${fmtPt([r - m.rc, m.y])}`,
      `Q ${fmtPt([r, m.y])} ${fmtPt([r, m.y + m.rc])}`,
    );
    const radius = DOT_R * m.p.dot * m.seen;
    if (radius > 0.2) {
      dots.push(
        `M ${fmtPt([m.x - radius, m.y])} a ${r2(radius)} ${r2(radius)} 0 1 0 ${r2(2 * radius)} 0 a ${r2(radius)} ${r2(radius)} 0 1 0 ${r2(-2 * radius)} 0`,
      );
    }
    const next = marks[k + 1];
    if (!next) return;
    const s: Pt = [r, m.y + m.rc];
    const e: Pt = [next.x - next.hw, next.y + next.rc];
    const notch: Cubic[] = [
      straight(s, [r, m.bottom]),
      straight([r, m.bottom], [next.x - next.hw, next.bottom]),
      straight([next.x - next.hw, next.bottom], e),
    ];
    const dx = e[0] - s[0];
    const dy = e[1] - s[1];
    const c1: Pt = [
      s[0] + dx / 3,
      s[1] + lerp(dy / 3, (tangent(k) * dx) / 3, g.smooth),
    ];
    const c2: Pt = [
      e[0] - dx / 3,
      e[1] - lerp(dy / 3, (tangent(k + 1) * dx) / 3, g.smooth),
    ];
    const curve = thirds([s, c1, c2, e]);
    const j = (m.p.join + next.p.join) / 2;
    for (let q = 0; q < 3; q += 1) {
      const a = notch[q] as Cubic;
      const b = curve[q] as Cubic;
      top.push(
        `C ${fmtPt(mix(a[1], b[1], j))} ${fmtPt(mix(a[2], b[2], j))} ${fmtPt(mix(a[3], b[3], j))}`,
      );
    }
  });
  const firstM = marks[0] as Mark;
  const stroke = top.join(" ");
  // The fill closes along every column's own foot, right to left, so a foot
  // that is rising (bars into dots) takes the fill with it instead of
  // leaving a wedge from one end of the chart to the other.
  const feet = [...marks]
    .reverse()
    .map(
      (m) =>
        `L ${fmtPt([m.x + m.hw, m.bottom])} L ${fmtPt([m.x - m.hw, m.bottom])}`,
    )
    .join(" ");
  const fill = `M ${fmtPt([firstM.x - firstM.hw, firstM.bottom])} L ${stroke.slice(2)} ${feet} Z`;
  return {
    fill,
    stroke,
    dots: dots.join(" "),
    fillA: r2(fillA / marks.length),
    strokeA: r2(strokeA / marks.length),
  };
}

/**
 * A compact reading — 51.5K, $1.2M — built from a plain formatter. The
 * platform's own compact notation differs between ICU versions ($20K in one
 * browser, $20.0K on a server), which would not hydrate.
 */
function compactWith(fmt: Intl.NumberFormat, v: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  const a = Math.abs(v);
  for (let i = 0; i < units.length; i += 1) {
    const [unit, suffix] = units[i] as [number, string];
    if (a < unit) continue;
    const scaled = Math.round((a / unit) * 10) / 10;
    // 999,960 rounds to 1000K: that is 1M.
    if (scaled >= 1000 && i > 0) {
      const [up, upSuffix] = units[i - 1] as [number, string];
      return `${fmt.format(Math.sign(v) * (Math.round((a / up) * 10) / 10))}${upSuffix}`;
    }
    return `${fmt.format(Math.sign(v) * scaled)}${suffix}`;
  }
  return fmt.format(Math.round(v * 10) / 10);
}

/** A y axis of three to five round steps that clears the highest reading. */
function axisFor(max: number): { step: number; ticks: number } {
  const v = max > 0 ? max * 1.06 : 1;
  let p = 1;
  while (p * 10 <= v) p *= 10;
  while (p > v) p /= 10;
  for (const scale of [0.1, 1]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = Math.round(m * p * scale * 1e6) / 1e6;
      const ticks = Math.ceil(v / step - 1e-9);
      if (ticks <= 5) return { step, ticks: Math.max(2, ticks) };
    }
  }
  return { step: 10 * p, ticks: 2 };
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Series are pigment: a token's hue at a fixed lightness, the same in both themes. */
const PIGMENT = [
  "oklch(from var(--accent-bright) 0.6 0.19 h)",
  "oklch(from var(--signal) 0.68 0.14 h)",
  "oklch(from var(--warn) 0.76 0.15 h)",
  "oklch(from var(--accent-bright) 0.64 0.16 calc(h + 60))",
  "oklch(from var(--danger) 0.64 0.18 h)",
];

const ICONS: Record<ChartMorphType, React.ReactNode> = {
  bar: <ChartColumn aria-hidden className="size-4 shrink-0" />,
  line: <ChartLine aria-hidden className="size-4 shrink-0" />,
  area: <ChartArea aria-hidden className="size-4 shrink-0" />,
  dot: <ChartScatter aria-hidden className="size-4 shrink-0" />,
};
const NAMES: Record<ChartMorphType, string> = {
  bar: "Bars",
  line: "Line",
  area: "Area",
  dot: "Dots",
};
const SPOKEN: Record<ChartMorphType, string> = {
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  dot: "Dot chart",
};
const PITCH: Record<ChartMorphType, number> = {
  bar: 0.9,
  line: 1.1,
  area: 1,
  dot: 1.25,
};

type Shared = {
  clock: MotionValue<number>;
  fadeClock: MotionValue<number>;
  window: MotionValue<number>;
  yMax: MotionValue<number>;
  morph: Morph;
  fade: Fade;
  count: number;
  frame: { w: number; h: number };
  smooth: number;
  wave: number;
};

/** One series' marks. Memoised: a cursor move never rebuilds its subscriptions. */
const SeriesMarks = React.memo(function SeriesMarks({
  values,
  s,
  color,
  shared,
}: {
  values: number[];
  s: number;
  color: string;
  shared: Shared;
}) {
  const geometry = useTransform(
    [
      shared.clock,
      shared.fadeClock,
      shared.window,
      shared.yMax,
    ] as MotionValue<number>[],
    ([c = 1, fc = 1, n = 1, y = 1]: number[]) => {
      const tf = localOf(fc, shared.fade.n);
      return seriesPaths({
        values,
        count: shared.count,
        n,
        yMax: y,
        w: shared.frame.w,
        h: shared.frame.h,
        smooth: shared.smooth,
        wave: shared.wave,
        morph: shared.morph,
        t: localOf(c, shared.morph.n),
        vis: shared.fade.to.map((_, k) => visAt(shared.fade, k, tf)),
        s,
      });
    },
  );
  const fill = useTransform(geometry, (g) => g.fill);
  const stroke = useTransform(geometry, (g) => g.stroke);
  const dots = useTransform(geometry, (g) => g.dots);
  const fillA = useTransform(geometry, (g) => g.fillA);
  const strokeA = useTransform(geometry, (g) => g.strokeA);
  return (
    <g style={{ color }}>
      <motion.path
        d={fill}
        fill="currentColor"
        style={{ fillOpacity: fillA }}
      />
      <motion.path
        d={stroke}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ strokeOpacity: strokeA }}
      />
      <motion.path d={dots} fill="currentColor" />
    </g>
  );
});

/** The y of a value on the scale, as the scale glides. */
const useScaleY = (value: number, yMax: MotionValue<number>, h: number) =>
  useTransform(yMax, (m) =>
    r2(h - 1 - (value / Math.max(1e-9, m)) * (h - 1 - TOP)),
  );

/** A gridline keeps its value as the scale moves: it rides to its new height. */
function GridLine({
  value,
  yMax,
  h,
}: {
  value: number;
  yMax: MotionValue<number>;
  h: number;
}) {
  const y = useScaleY(value, yMax, h);
  return (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-px",
        value === 0 ? "bg-hairline-strong" : "bg-hairline",
      )}
      style={{ y }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    />
  );
}

function GridLabel({
  value,
  yMax,
  h,
  text,
}: {
  value: number;
  yMax: MotionValue<number>;
  h: number;
  text: string;
}) {
  const y = useScaleY(value, yMax, h);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 right-1.5 -translate-y-1/2 font-mono text-[10px] leading-none whitespace-nowrap text-ink-3 tabular-nums"
      style={{ y }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      {text}
    </motion.span>
  );
}

function XLabel({
  index,
  count,
  window,
  w,
  text,
}: {
  index: number;
  count: number;
  window: MotionValue<number>;
  w: number;
  text: string;
}) {
  const x = useTransform(window, (n) =>
    r2(((index - (count - n) + 0.5) / Math.max(1e-6, n)) * w),
  );
  return (
    <motion.span
      aria-hidden
      className="absolute top-0 left-0 -translate-x-1/2 font-mono text-[10px] leading-none whitespace-nowrap text-ink-3"
      style={{ x }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      {text}
    </motion.span>
  );
}

type CursorGeo = {
  x: number;
  slot: number;
  /** How bar-like the chart is at the cursor, 0–1. */
  bars: number;
  rings: { x: number; y: number; o: number }[];
};

/** Where the cursor and its rings sit this frame, from the shared values. */
function cursorGeometry(
  at: number,
  n: number,
  c: number,
  fc: number,
  y: number,
  series: ChartMorphSeries[],
  shared: Pick<
    Shared,
    "morph" | "fade" | "count" | "frame" | "smooth" | "wave"
  >,
): CursorGeo {
  const { w, h } = shared.frame;
  const L = shared.count;
  const slot = w / Math.max(1e-6, n);
  const x = (at - (L - n) + 0.5) * slot;
  const tf = localOf(fc, shared.fade.n);
  const vis = shared.fade.to.map((_, k) => visAt(shared.fade, k, tf));
  const t = localOf(c, shared.morph.n);
  const lo = Math.floor(at);
  const k = at - lo;
  const first = Math.max(0, Math.ceil(L - n) - 1);
  const rings = series.map((sr, s) => {
    const marks = marksOf({
      values: sr.values,
      count: L,
      n,
      yMax: y,
      w,
      h,
      smooth: shared.smooth,
      wave: shared.wave,
      morph: shared.morph,
      t,
      vis,
      s,
    });
    const a = marks[lo - first];
    const b = marks[Math.min(L - 1, lo + 1) - first] ?? a;
    if (!a || !b) return { x: 0, y: 0, o: 0 };
    return {
      x: r2(lerp(a.x, b.x, k)),
      y: r2(lerp(a.y, b.y, k)),
      o: r2(vis[s] ?? 0),
    };
  });
  const bars = blend(weightsAt(shared.morph, Math.round(at), t, 0.5, 0)).hw;
  return { x: r2(x), slot: r2(slot), bars: r2(bars), rings };
}

/** Under the marks: a column band for bars, a hairline for the rest. */
function CursorBand({
  geo,
  shown,
  h,
}: {
  geo: MotionValue<CursorGeo>;
  shown: MotionValue<number>;
  h: number;
}) {
  const lineX = useTransform(geo, (g) => g.x);
  const band = useTransform(geo, (g) => r2(g.x - g.slot / 2));
  const bandW = useTransform(geo, (g) => g.slot);
  const bars = useTransform(geo, (g) => g.bars);
  const bandA = useTransform(
    [bars, shown] as MotionValue<number>[],
    ([b = 0, o = 0]: number[]) => r2(b * 0.07 * o),
  );
  const lineA = useTransform(
    [bars, shown] as MotionValue<number>[],
    ([b = 0, o = 0]: number[]) => r2((1 - 0.7 * b) * o),
  );
  return (
    <g pointerEvents="none">
      <motion.rect
        y={0}
        height={h}
        x={band}
        width={bandW}
        fill="currentColor"
        className="text-foreground"
        style={{ fillOpacity: bandA }}
      />
      <motion.line
        x1={lineX}
        x2={lineX}
        y1={TOP - 6}
        y2={h - 1}
        stroke="currentColor"
        strokeWidth={1}
        className="text-ink-3"
        style={{ strokeOpacity: lineA }}
      />
    </g>
  );
}

/** Over the marks: a ring on one series at the cursor. */
function Ring({
  geo,
  s,
  color,
  shown,
}: {
  geo: MotionValue<CursorGeo>;
  s: number;
  color: string;
  shown: MotionValue<number>;
}) {
  const cx = useTransform(geo, (g) => g.rings[s]?.x ?? 0);
  const cy = useTransform(geo, (g) => g.rings[s]?.y ?? 0);
  const seen = useTransform(geo, (g) => g.rings[s]?.o ?? 0);
  const o = useTransform(
    [seen, shown] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => r2(a * b),
  );
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={5}
      strokeWidth={2}
      pointerEvents="none"
      style={{ opacity: o, stroke: color, fill: "var(--card)" }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The chart                                */
/* ----------------------------------------------------------------------- */

/**
 * A chart whose type is a shape the data takes, not a different drawing.
 * Each series is one path rebuilt every frame from a few motion values: per
 * point, a flat top joined to the next by three cubics that are either a
 * notch to the floor or the curve between the points, plus a dot. Bars,
 * line, area and dots are four settings of those numbers, so changing type
 * moves the same points — bars narrow and their notches rise into the
 * curve, dots swell out of the line or bars retract into them — in a sweep
 * from left to right on glide.
 *
 * The window of points, the y scale and each series' visibility are motion
 * values too: more points slide in from the left, a hidden series flattens
 * and fades while the others re-dodge, and gridlines ride the scale. A
 * cursor snaps to the nearest point on snap, with a ring on every series and
 * a readout beside it.
 *
 * The type switch is a radio group, the legend toggle buttons, and the plot
 * a slider over its points. Under reduced motion every change happens at
 * once behind a short fade, and the cursor and readout still answer.
 */
export function ChartMorph({
  type,
  defaultType = "bar",
  onTypeChange,
  smooth = 0.5,
  points = 12,
  series = defaultChartMorphSeries,
  labels = defaultChartMorphLabels,
  hidden,
  defaultHidden,
  onHiddenChange,
  onCursorChange,
  wave = 0.5,
  format,
  locale = "en-US",
  currency = "USD",
  title = "Volume",
  subtitle,
  label,
  status = "ready",
  onRetry,
  sound = false,
  disabled = false,
  className,
}: ChartMorphProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const tension = clamp(smooth, 0, 1);
  const sweepBy = clamp(wave, 0, 1);
  const count = Math.max(0, ...series.map((s) => s.values.length));
  const shownCount = clamp(
    Math.round(points),
    Math.min(2, count),
    Math.max(1, count),
  );

  const money = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [locale, currency],
  );
  const reading = (v: number) => (format ? format(v) : compactWith(money, v));

  /* -------------------------------- type --------------------------------- */

  const [ownType, setOwnType] = React.useState<ChartMorphType>(defaultType);
  const current: ChartMorphType = type ?? ownType;

  const clock = useMotionValue(1);
  const [morph, setMorph] = React.useState<Morph>(() => ({
    from: [],
    to: current,
    n: 1,
  }));
  if (morph.to !== current) {
    // The sweep starts from wherever every point is now, so a change in the
    // middle of another carries on from the shapes on screen.
    const t = localOf(clock.get(), morph.n);
    const nNow = Math.max(1, shownCount);
    const from = Array.from({ length: count }, (_, i) =>
      weightsAt(
        morph,
        i,
        t,
        clamp((i - (count - nNow)) / Math.max(1, nNow - 1), 0, 1),
        sweepBy,
      ),
    );
    setMorph({ from, to: current, n: morph.n + 1 });
  }

  /* ----------------------------- visibility ------------------------------ */

  const [ownHidden, setOwnHidden] = React.useState<string[]>(
    () => defaultHidden ?? [],
  );
  const hiddenIds = hidden ?? ownHidden;
  const visTarget = series.map((s) => (hiddenIds.includes(s.id) ? 0 : 1));
  const fadeClock = useMotionValue(1);
  const [fade, setFade] = React.useState<Fade>(() => ({
    from: visTarget,
    to: visTarget,
    n: 1,
  }));
  if (fade.to.join() !== visTarget.join()) {
    const t = localOf(fadeClock.get(), fade.n);
    setFade({
      from: visTarget.map((_, s) => visAt(fade, s, t)),
      to: visTarget,
      n: fade.n + 1,
    });
  }

  /* ------------------------------ the plot ------------------------------- */

  const [plotEl, setPlotEl] = React.useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = React.useState({ w: 640, h: 300 });
  React.useEffect(() => {
    if (!plotEl) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(plotEl.clientWidth);
      const h = Math.round(plotEl.clientHeight);
      if (w < 4 || h < 4) return;
      setFrame((f) => (f.w === w && f.h === h ? f : { w, h }));
    });
    ro.observe(plotEl);
    return () => ro.disconnect();
  }, [plotEl]);

  const first = count - shownCount;
  const visibleSeries = series.filter((s) => !hiddenIds.includes(s.id));
  let peak = 0;
  for (const s of visibleSeries) {
    for (let i = Math.max(0, first); i < count; i += 1) {
      peak = Math.max(peak, s.values[i] ?? 0);
    }
  }
  const axis = axisFor(peak);
  const top = axis.step * axis.ticks;

  const windowMV = useMotionValue(shownCount);
  const yMax = useMotionValue(top);
  const plotFade = useMotionValue(1);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const dip = () => {
    plotFade.set(0.35);
    run(
      "dip",
      animate(plotFade, 1, { duration: durations.fast, ease: easings.enter }),
    );
  };

  // Each transition's clock runs from n − 1 to n. A StrictMode re-run sets
  // it back to its start and lets it finish rather than freezing it.
  React.useEffect(() => {
    if (morph.n <= 1) return;
    clock.set(morph.n - 1);
    if (!motionSafe) {
      halt("clock");
      clock.set(morph.n);
      dip();
      return;
    }
    run("clock", animate(clock, morph.n, springs.glide));
    // Keyed on the transition's number alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.n]);

  React.useEffect(() => {
    if (fade.n <= 1) return;
    fadeClock.set(fade.n - 1);
    if (!motionSafe) {
      halt("fade");
      fadeClock.set(fade.n);
      dip();
      return;
    }
    run("fade", animate(fadeClock, fade.n, springs.glide));
    // Keyed on the toggle's number alone, like the type's clock above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fade.n]);

  React.useEffect(() => {
    if (!motionSafe) {
      halt("window");
      halt("yMax");
      if (windowMV.get() !== shownCount || yMax.get() !== top) dip();
      windowMV.set(shownCount);
      yMax.set(top);
      return;
    }
    if (windowMV.get() !== shownCount) {
      run("window", animate(windowMV, shownCount, springs.glide));
    }
    if (yMax.get() !== top) run("yMax", animate(yMax, top, springs.glide));
    // Keyed on the destinations; the helpers are fresh closures each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownCount, top, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const colors = series.map(
    (s, i) => s.color ?? PIGMENT[i % PIGMENT.length] ?? "currentColor",
  );
  const shared: Shared = React.useMemo(
    () => ({
      clock,
      fadeClock,
      window: windowMV,
      yMax,
      morph,
      fade,
      count,
      frame,
      smooth: tension,
      wave: sweepBy,
    }),
    [
      clock,
      fadeClock,
      windowMV,
      yMax,
      morph,
      fade,
      count,
      frame,
      tension,
      sweepBy,
    ],
  );

  /* -------------------------------- speech ------------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------- cursor -------------------------------- */

  const [cursor, setCursor] = React.useState<number | null>(null);
  const cursorAt =
    cursor !== null && cursor >= first && cursor < count ? cursor : null;
  const cursorPos = useMotionValue(count - 1);
  const cursorShown = useMotionValue(0);
  React.useEffect(() => {
    if (cursorAt === null) {
      run(
        "cursorShown",
        animate(cursorShown, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    run(
      "cursorShown",
      animate(cursorShown, 1, {
        duration: durations.blink,
        ease: easings.enter,
      }),
    );
    if (!motionSafe || cursorShown.get() < 0.05) {
      halt("cursor");
      cursorPos.set(cursorAt);
    } else {
      run("cursor", animate(cursorPos, cursorAt, springs.snap));
    }
    // Keyed on the point the cursor is on, not on the helpers that move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorAt, motionSafe]);

  const cursorGeo = useTransform(
    [cursorPos, windowMV, clock, fadeClock, yMax] as MotionValue<number>[],
    ([at = 0, n = 1, c = 1, fc = 1, y = 1]: number[]) =>
      cursorGeometry(at, n, c, fc, y, series, shared),
  );

  /**
   * Moves the cursor. It ticks only for a press, a drag or a key: a mouse
   * merely passing over the plot reads the points in silence.
   */
  const moveCursor = (i: number | null, pan = 0, audible = true) => {
    const next = i === null ? null : clamp(i, Math.max(0, first), count - 1);
    if (next === cursorAt) return;
    if (next !== null && audible) {
      audio.play("tick", {
        pitch: r2(0.9 + (0.5 * (next - first)) / Math.max(1, shownCount - 1)),
        gain: 0.3,
        pan,
      });
    }
    setCursor(next);
    onCursorChange?.(next);
  };

  const indexAt = (clientX: number) => {
    const rect = plotEl?.getBoundingClientRect();
    if (!rect) return null;
    const share = (clientX - rect.left) / Math.max(1, rect.width);
    return clamp(
      Math.round(share * shownCount - 0.5 + first),
      Math.max(0, first),
      count - 1,
    );
  };

  const sentenceAt = (i: number) =>
    `${labels[i] ?? `Point ${i + 1}`}: ${visibleSeries
      .map((s) => `${s.label} ${reading(s.values[i] ?? 0)}`)
      .join(", ")}`;

  const onPlotKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || count === 0) return;
    const last = count - 1;
    const from = cursorAt ?? last;
    const go = (i: number) => {
      event.preventDefault();
      moveCursor(i);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        go(cursorAt === null ? last : from + 1);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        go(cursorAt === null ? last : from - 1);
        return;
      case "PageUp":
        go(from + 3);
        return;
      case "PageDown":
        go(from - 3);
        return;
      case "Home":
        go(first);
        return;
      case "End":
        go(last);
        return;
      case "Escape":
        if (cursorAt === null) return;
        event.preventDefault();
        moveCursor(null);
        return;
    }
  };

  /* --------------------------- type and legend --------------------------- */

  const typeNodes = React.useRef(new Map<ChartMorphType, HTMLButtonElement>());
  const chooseType = (t: ChartMorphType, el: Element | null) => {
    if (disabled || t === current) return;
    const rect = el?.getBoundingClientRect();
    audio.play("swish", {
      pitch: PITCH[t],
      gain: 0.42,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (type === undefined) setOwnType(t);
    onTypeChange?.(t);
    say(`${SPOKEN[t]}.`);
  };
  const onTypeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const i = TYPES.indexOf(current);
    const go = (j: number) => {
      const t = TYPES[(j + TYPES.length) % TYPES.length];
      if (!t) return;
      event.preventDefault();
      const node = typeNodes.current.get(t) ?? null;
      node?.focus();
      chooseType(t, node);
    };
    if (event.key === "ArrowRight" || event.key === "ArrowDown") go(i + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(i - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(TYPES.length - 1);
  };

  const toggleSeries = (id: string, el: Element | null) => {
    if (disabled) return;
    const s = series.find((x) => x.id === id);
    const rect = el?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    const showing = !hiddenIds.includes(id);
    if (showing && visibleSeries.length <= 1) {
      audio.play("tick", { pitch: 0.7, gain: 0.25, pan });
      say("Keep at least one series visible.");
      return;
    }
    const next = showing
      ? [...hiddenIds, id]
      : hiddenIds.filter((x) => x !== id);
    audio.play("tick", { pitch: showing ? 0.85 : 1.2, gain: 0.35, pan });
    if (hidden === undefined) setOwnHidden(next);
    onHiddenChange?.(next);
    say(`${s?.label ?? id} ${showing ? "hidden" : "shown"}.`);
  };

  /* -------------------------------- render ------------------------------- */

  const slotW = frame.w / Math.max(1, shownCount);
  const every = Math.max(1, Math.ceil(46 / Math.max(1, slotW)));
  const xLabels: number[] = [];
  for (let i = count - 1; i >= Math.max(0, first); i -= every) xLabels.push(i);
  const ticks = Array.from(
    { length: axis.ticks + 1 },
    (_, k) => Math.round(k * axis.step * 1e6) / 1e6,
  );
  const latest = count - 1;
  const focusIndex = cursorAt ?? latest;
  const latestTotal = visibleSeries.reduce(
    (a, s) => a + (s.values[focusIndex] ?? 0),
    0,
  );

  const readoutX = cursorAt === null ? 0 : (cursorAt - first + 0.5) * slotW;
  const cardW = 156;
  const flip = readoutX + 12 + cardW > frame.w;
  const cardLeft = r2(
    clamp(
      flip ? readoutX - 12 - cardW : readoutX + 12,
      0,
      Math.max(0, frame.w - cardW),
    ),
  );

  const typeSwitch = (
    <div
      role="radiogroup"
      aria-label="Chart type"
      onKeyDown={onTypeKey}
      className="grid grid-cols-4 gap-0.5 rounded-2 bg-surface-2 p-0.5 @min-[30rem]:inline-grid"
    >
      {TYPES.map((t) => {
        const on = t === current;
        return (
          <button
            key={t}
            ref={(node) => {
              if (node) typeNodes.current.set(t, node);
              else typeNodes.current.delete(t);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={NAMES[t]}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={(event) => chooseType(t, event.currentTarget)}
            className={cn(
              "relative inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors",
              FOCUS_RING,
              on
                ? "text-foreground"
                : "text-ink-2 enabled:hover:text-foreground",
              "disabled:cursor-not-allowed",
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-type`}
                className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {ICONS[t]}
              <span className="hidden @min-[30rem]:inline">{NAMES[t]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const legend = (
    <div role="group" aria-label="Series" className="flex flex-wrap gap-1.5">
      {series.map((s, i) => {
        const on = !hiddenIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={(event) => toggleSeries(s.id, event.currentTarget)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
              FOCUS_RING,
              on
                ? "border-hairline-strong text-foreground"
                : "border-hairline text-ink-3 line-through decoration-ink-3/60",
              "enabled:hover:bg-surface-2 disabled:cursor-not-allowed",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full transition-opacity",
                on ? "opacity-100" : "opacity-35",
              )}
              style={{ background: colors[i] }}
            />
            {s.label}
            <span className="font-mono text-[11px] text-ink-3 tabular-nums no-underline">
              {reading(s.values[focusIndex] ?? 0)}
            </span>
          </button>
        );
      })}
    </div>
  );

  const table = (
    <div className="hidden flex-col gap-1 @min-[68rem]:flex">
      <p className="flex justify-between px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>Last {shownCount}</span>
        <span>{cursorAt === null ? "total" : (labels[cursorAt] ?? "")}</span>
      </p>
      <ul role="list" className="flex flex-col">
        {series.map((s, i) => {
          const win = s.values.slice(Math.max(0, first), count);
          const total = win.reduce((a, v) => a + v, 0);
          const change =
            win.length > 1 && (win[0] ?? 0) > 0
              ? ((win[win.length - 1] ?? 0) - (win[0] ?? 0)) / (win[0] ?? 1)
              : 0;
          const on = !hiddenIds.includes(s.id);
          return (
            <li
              key={s.id}
              className={cn(
                "grid grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-1 py-1.5 text-[12px] transition-opacity",
                on ? "opacity-100" : "opacity-45",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: colors[i] }}
              />
              <span className="min-w-0">
                <span className="block truncate text-foreground">
                  {s.label}
                </span>
                <span className="block font-mono text-[10px] text-ink-3 tabular-nums">
                  avg {reading(win.length ? total / win.length : 0)} ·{" "}
                  <span
                    className={change >= 0 ? "text-success" : "text-danger"}
                  >
                    {change >= 0 ? "+" : "−"}
                    {Math.abs(change * 100).toFixed(1)}%
                  </span>
                </span>
              </span>
              <span className="font-mono text-[12px] text-foreground tabular-nums">
                {reading(cursorAt === null ? total : (s.values[cursorAt] ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  let plot: React.ReactNode;
  if (status === "loading") {
    plot = (
      <div
        aria-hidden
        className="absolute inset-0 flex items-end gap-1.5 px-2 pb-px"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              height: `${[42, 55, 48, 63, 58, 70, 66, 74, 69, 81, 77, 88][i] ?? 50}%`,
            }}
          />
        ))}
      </div>
    );
  } else if (status === "error" || count === 0) {
    plot = (
      <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 p-4 text-center">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {status === "error" ? (
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          ) : null}
          {status === "error"
            ? "The readings didn't load."
            : "No readings for this period."}
        </p>
        {status === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors enabled:hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    plot = (
      <>
        <AnimatePresence initial={false}>
          {ticks.map((v) => (
            <GridLine key={v} value={v} yMax={yMax} h={frame.h} />
          ))}
        </AnimatePresence>
        <motion.svg
          aria-hidden
          width={frame.w}
          height={frame.h}
          viewBox={`0 0 ${frame.w} ${frame.h}`}
          className="absolute inset-0 block size-full overflow-visible"
          style={{ opacity: plotFade }}
        >
          <CursorBand geo={cursorGeo} shown={cursorShown} h={frame.h} />
          {series.map((s, i) => (
            <SeriesMarks
              key={s.id}
              values={s.values}
              s={i}
              color={colors[i] ?? "currentColor"}
              shared={shared}
            />
          ))}
          {series.map((s, i) => (
            <Ring
              key={s.id}
              geo={cursorGeo}
              s={i}
              color={colors[i] ?? "currentColor"}
              shown={cursorShown}
            />
          ))}
        </motion.svg>
        <AnimatePresence>
          {cursorAt !== null ? (
            <motion.div
              key="readout"
              aria-hidden
              className="pointer-events-none absolute top-1 left-0 z-10 rounded-3 border border-hairline-strong bg-popover px-2.5 py-2 shadow-[0_8px_20px_color-mix(in_oklab,black_16%,transparent)]"
              style={{ width: cardW }}
              initial={{ opacity: 0, x: cardLeft }}
              animate={{ opacity: 1, x: cardLeft }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.fast, ease: easings.enter },
                x: motionSafe ? springs.snap : { duration: 0 },
              }}
            >
              <p className="text-[11px] font-medium text-foreground">
                {labels[cursorAt] ?? `Point ${cursorAt + 1}`}
              </p>
              <ul role="list" className="mt-1 flex flex-col gap-0.5">
                {series.map((s, i) =>
                  hiddenIds.includes(s.id) ? null : (
                    <li
                      key={s.id}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: colors[i] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        {s.label}
                      </span>
                      <span className="font-mono text-foreground tabular-nums">
                        {reading(s.values[cursorAt] ?? 0)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div
      role="region"
      aria-label={label ?? title}
      className={cn(
        "@container flex w-full flex-col gap-3 rounded-4 border border-hairline bg-card p-3 text-foreground @min-[40rem]:p-4",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-col gap-2.5 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
            {subtitle ? `${subtitle} · ` : ""}
            {count > 0
              ? `${reading(latestTotal)} in ${labels[focusIndex] ?? ""}`
              : "—"}
          </p>
        </div>
        {typeSwitch}
      </header>
      {legend}
      <div className="grid gap-3 @min-[68rem]:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex">
            <div aria-hidden className="relative w-11 shrink-0">
              {status === "ready" && count > 0 ? (
                <AnimatePresence initial={false}>
                  {ticks.map((v) => (
                    <GridLabel
                      key={v}
                      value={v}
                      yMax={yMax}
                      h={frame.h}
                      text={reading(v)}
                    />
                  ))}
                </AnimatePresence>
              ) : null}
            </div>
            <div
              ref={setPlotEl}
              role="slider"
              tabIndex={disabled || status !== "ready" || count === 0 ? -1 : 0}
              aria-label={`${title}, ${SPOKEN[current].toLowerCase()}, ${shownCount} points`}
              aria-valuemin={1}
              aria-valuemax={Math.max(1, shownCount)}
              aria-valuenow={
                cursorAt === null ? shownCount : cursorAt - first + 1
              }
              aria-valuetext={
                cursorAt === null
                  ? "No point chosen. Use the arrow keys to read the points."
                  : sentenceAt(cursorAt)
              }
              aria-disabled={disabled || undefined}
              onKeyDown={onPlotKey}
              onPointerMove={(event) => {
                if (disabled || count === 0) return;
                if (event.pointerType !== "mouse" && event.buttons === 0)
                  return;
                moveCursor(
                  indexAt(event.clientX),
                  panFrom(event.clientX, plotEl),
                  event.buttons !== 0,
                );
              }}
              onPointerDown={(event) => {
                if (disabled || count === 0) return;
                moveCursor(
                  indexAt(event.clientX),
                  panFrom(event.clientX, plotEl),
                );
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") moveCursor(null);
              }}
              className={cn(
                "relative h-[200px] min-w-0 flex-1 touch-pan-y overflow-clip rounded-2 select-none @min-[40rem]:h-[300px]",
                FOCUS_RING,
                disabled ? "cursor-not-allowed" : "cursor-crosshair",
              )}
            >
              {plot}
            </div>
          </div>
          <div aria-hidden className="relative ml-11 h-3 overflow-clip">
            {status === "ready" ? (
              <AnimatePresence initial={false}>
                {xLabels.map((i) => (
                  <XLabel
                    key={i}
                    index={i}
                    count={count}
                    window={windowMV}
                    w={frame.w}
                    text={(labels[i] ?? "").split(" ")[0] ?? ""}
                  />
                ))}
              </AnimatePresence>
            ) : null}
          </div>
        </div>
        {status === "ready" && count > 0 ? table : null}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
