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
import { RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PulseRange = "7d" | "30d" | "90d" | "1y";
export type PulseKind = "money" | "count" | "percent";
export type PulseStatus = "ready" | "loading" | "error";

export type PulseMetric = {
  id: string;
  /** The tile's label and the chart's title. */
  label: string;
  /** Money in `currency`, a count, or a rate stored as a fraction (0.031). */
  kind: PulseKind;
  /** How a window adds up. @default "sum" for money and count, "mean" for percent */
  aggregate?: "sum" | "mean";
  /** Whether a rise is good news (revenue) or bad (refunds): sets the delta's colour. @default "up" */
  goodWhen?: "up" | "down";
  /** One value per day, oldest first; the last is `now`. */
  series: number[];
};

export type PulseSegment = {
  id: string;
  label: string;
  /** Any CSS colour — pass a token, never a hex. Defaults to the house series hues. */
  color?: string;
  /** This segment's revenue, one value per day, aligned with the metrics. */
  series: number[];
};

export type PulseBreakdown = {
  id: string;
  /** Shown in the breakdown switch: "Channel". */
  label: string;
  segments: PulseSegment[];
};

export type PulseWindow = { from: string; to: string; custom: boolean };

export type PulseDashboardProps = {
  /** Controlled period: the last 7, 30 or 90 days, or the last year, up to `now`. */
  range?: PulseRange;
  /** Initial period when uncontrolled. @default "30d" */
  defaultRange?: PulseRange;
  /** Fires from the period switch with the new period. */
  onRangeChange?: (range: PulseRange) => void;
  /** How much the chart's line curves, 0 to 1: straight segments to monotone curves. @default 0.6 */
  smooth?: number;
  /** Controlled breakdown: which of `breakdowns` the donut splits revenue by. */
  donut?: string;
  /** Initial breakdown when uncontrolled. @default "channel" */
  defaultDonut?: string;
  /** Fires from the breakdown switch with the new breakdown's id. */
  onDonutChange?: (id: string) => void;
  /** Controlled metric: the tile the chart draws. */
  metric?: string;
  /** Initial metric when uncontrolled. @default the first metric */
  defaultMetric?: string;
  /** Fires from the tile press or key that chose a metric. */
  onMetricChange?: (id: string) => void;
  /** Fires whenever the window changes: a period, a zoom or a reset. Dates are YYYY-MM-DD, both included. */
  onWindowChange?: (window: PulseWindow) => void;
  /** The tiles, in order (four fit a row). @default defaultPulseMetrics (730 seeded days) */
  metrics?: PulseMetric[];
  /** The donut's breakdowns of revenue. @default defaultPulseBreakdowns */
  breakdowns?: PulseBreakdown[];
  /** The last day in the series (Date or ms). @default defaultPulseNow */
  now?: number | Date;
  /** The locale for numbers and money. @default "en-US" */
  locale?: string;
  /** The currency for money metrics. @default "USD" */
  currency?: string;
  /** Formats a value for tiles, readouts and the legend. @default by kind in `locale` */
  format?: (value: number, kind: PulseKind) => string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: PulseStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The dashboard's heading. @default "Pulse" */
  title?: string;
  /** A quieter line under the heading, before the window's dates. */
  subtitle?: string;
  /** The dashboard's accessible name. @default the title */
  label?: string;
  /** Play the ticks and swishes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const DAYS = 730;

/** The last day of the seeded store: 30 September 2026. */
export const defaultPulseNow = Date.UTC(2026, 8, 30);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Two years of a small online store: revenue that grows a third over the
 * two years, busier weekends, promotion days, a strong November and a quiet
 * December, with orders, conversion and refunds that follow it. Plain
 * arithmetic only, so the server and the browser compute every value to the
 * same bit.
 */
const STORE = (() => {
  const rand = mulberry32(1312);
  const revenue: number[] = [];
  const orders: number[] = [];
  const conversion: number[] = [];
  const refunds: number[] = [];
  for (let i = 0; i < DAYS; i += 1) {
    const date = new Date(defaultPulseNow - (DAYS - 1 - i) * DAY_MS);
    const dow = date.getUTCDay();
    const month = date.getUTCMonth();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + (0.34 * i) / DAYS;
    const promo = i % 61 === 17 || i % 97 === 40 ? 1.7 : 1;
    const season = month === 11 ? 0.82 : month === 10 ? 1.14 : 1;
    const rev =
      1380 *
      trend *
      (weekend ? 1.24 : 1) *
      promo *
      season *
      (0.86 + rand() * 0.28);
    revenue.push(cents(rev));
    orders.push(Math.max(1, Math.round(rev / (44 + rand() * 9))));
    conversion.push(
      r4(
        (0.026 + (0.006 * i) / DAYS) *
          (weekend ? 1.1 : 1) *
          (0.9 + rand() * 0.2),
      ),
    );
    refunds.push(r4((0.026 - (0.008 * i) / DAYS) * (0.75 + rand() * 0.5)));
  }
  return { revenue, orders, conversion, refunds };
})();

export const defaultPulseMetrics: PulseMetric[] = [
  { id: "revenue", label: "Revenue", kind: "money", series: STORE.revenue },
  { id: "orders", label: "Orders", kind: "count", series: STORE.orders },
  {
    id: "conversion",
    label: "Conversion",
    kind: "percent",
    series: STORE.conversion,
  },
  {
    id: "refunds",
    label: "Refund rate",
    kind: "percent",
    goodWhen: "down",
    series: STORE.refunds,
  },
];

/** Splits each day's revenue by weights that drift over the two years. */
function splitRevenue(
  id: string,
  label: string,
  seed: number,
  parts: { id: string; label: string; w: (f: number) => number }[],
): PulseBreakdown {
  const rand = mulberry32(seed);
  const lists = parts.map(() => [] as number[]);
  STORE.revenue.forEach((rev, i) => {
    const f = i / DAYS;
    const w = parts.map((p) => Math.max(0.01, p.w(f) * (0.9 + rand() * 0.2)));
    const total = w.reduce((a, b) => a + b, 0);
    w.forEach((x, k) => lists[k]?.push(cents((rev * x) / total)));
  });
  return {
    id,
    label,
    segments: parts.map((p, k) => ({
      id: p.id,
      label: p.label,
      series: lists[k] ?? [],
    })),
  };
}

export const defaultPulseBreakdowns: PulseBreakdown[] = [
  splitRevenue("channel", "Channel", 41, [
    { id: "direct", label: "Direct", w: (f) => 0.34 - 0.06 * f },
    { id: "search", label: "Search", w: (f) => 0.27 + 0.02 * f },
    { id: "social", label: "Social", w: (f) => 0.12 + 0.09 * f },
    { id: "email", label: "Email", w: (f) => 0.17 - 0.03 * f },
    { id: "partners", label: "Partners", w: () => 0.1 },
  ]),
  splitRevenue("plan", "Plan", 42, [
    { id: "starter", label: "Starter", w: (f) => 0.46 - 0.12 * f },
    { id: "growth", label: "Growth", w: (f) => 0.36 + 0.06 * f },
    { id: "scale", label: "Scale", w: (f) => 0.18 + 0.06 * f },
  ]),
  splitRevenue("region", "Region", 43, [
    { id: "north", label: "North", w: () => 0.31 },
    { id: "south", label: "South", w: (f) => 0.22 + 0.04 * f },
    { id: "east", label: "East", w: (f) => 0.26 - 0.03 * f },
    { id: "west", label: "West", w: (f) => 0.21 - 0.01 * f },
  ]),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const RANGES: PulseRange[] = ["7d", "30d", "90d", "1y"];
const RANGE_DAYS: Record<PulseRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};
const RANGE_NAMES: Record<PulseRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
};
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/**
 * Slices are filled shapes, so they are pigment: each takes a token's hue at
 * a fixed lightness and reads the same on a light page and a dark one.
 */
const PIGMENT = [
  "oklch(from var(--accent-bright) 0.6 0.18 h)",
  "oklch(from var(--signal) 0.74 0.13 h)",
  "oklch(from var(--accent-bright) 0.7 0.14 calc(h + 60))",
  "oklch(from var(--warn) 0.8 0.13 h)",
  "oklch(from var(--accent-bright) 0.8 0.07 h)",
  "oklch(from var(--danger) 0.7 0.15 h)",
];

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * A y axis of three to five round steps (1, 2, 2.5 or 5 × 10ⁿ) that clears
 * the highest reading. Built by repeated ×10 and ÷10 rather than logarithms,
 * so the server and every browser pick the same top.
 */
function axisFor(max: number): { step: number; ticks: number } {
  const v = max > 0 ? max * 1.04 : 1;
  let p = 1;
  while (p * 10 <= v) p *= 10;
  while (p > v) p /= 10;
  for (const scale of [0.1, 1]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * p * scale;
      const ticks = Math.ceil(v / step - 1e-9);
      if (ticks <= 5) return { step, ticks: Math.max(3, ticks) };
    }
  }
  return { step: 10 * p, ticks: 3 };
}

const aggregateOf = (m: PulseMetric) =>
  m.aggregate ?? (m.kind === "percent" ? "mean" : "sum");

const prefixOf = (series: number[]) => {
  const out = [0];
  let sum = 0;
  for (const v of series) {
    sum += v;
    out.push(sum);
  }
  return out;
};

/** The running total of a daily series at a fractional day. */
const areaTo = (series: number[], prefix: number[], at: number) => {
  const c = clamp(at, 0, series.length);
  const i = Math.floor(c);
  return (prefix[i] ?? 0) + (c - i) * (series[i] ?? 0);
};

type Points = { xs: number[]; ys: number[] };

/**
 * The readings across the window [lo, hi), in px across `width`. While the
 * days fit (`budget` or fewer), each day is a point at its own centre, one
 * day past either edge so the line runs in from outside; past that, the
 * window is read as `budget` means, each over its own share of the window.
 * Both are continuous in lo and hi, which is what lets a period change be a
 * real zoom: the line stretches and gathers rather than being redrawn.
 */
function readings(
  series: number[],
  prefix: number[],
  lo: number,
  hi: number,
  width: number,
  budget: number,
): Points {
  const span = Math.max(1e-6, hi - lo);
  const xs: number[] = [];
  const ys: number[] = [];
  const n = series.length;
  if (span <= budget) {
    const first = Math.max(0, Math.floor(lo - 0.5));
    const last = Math.min(n - 1, Math.ceil(hi - 0.5));
    for (let i = first; i <= last; i += 1) {
      xs.push(((i + 0.5 - lo) / span) * width);
      ys.push(series[i] ?? 0);
    }
    // Where the series itself stops, its end value holds to the edge.
    if (xs.length > 0 && (xs[0] ?? 0) > 0) {
      xs.unshift(0);
      ys.unshift(ys[0] ?? 0);
    }
    if (xs.length > 0 && (xs[xs.length - 1] ?? width) < width) {
      xs.push(width);
      ys.push(ys[ys.length - 1] ?? 0);
    }
    return { xs, ys };
  }
  const w = span / Math.max(1, budget - 1);
  for (let j = 0; j < budget; j += 1) {
    const d = lo + j * w;
    const a = clamp(d - w / 2, 0, n);
    const b = clamp(d + w / 2, 0, n);
    xs.push((j / Math.max(1, budget - 1)) * width);
    ys.push(
      b - a > 1e-6
        ? (areaTo(series, prefix, b) - areaTo(series, prefix, a)) / (b - a)
        : (series[Math.min(n - 1, Math.floor(d))] ?? 0),
    );
  }
  return { xs, ys };
}

/**
 * The line through the readings. Each segment's handles are blended from
 * straight thirds (smooth 0) to monotone tangents (smooth 1), so a curve
 * never overshoots a reading however smooth it is.
 */
function linePath({ xs, ys }: Points, smooth: number): string {
  const n = ys.length;
  if (n === 0) return "";
  const slopes: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const h = (xs[k + 1] ?? 0) - (xs[k] ?? 0) || 1;
    slopes.push(((ys[k + 1] ?? 0) - (ys[k] ?? 0)) / h);
  }
  const tangents = ys.map((_, k) => {
    const a = slopes[k - 1];
    const b = slopes[k];
    if (a === undefined) return b ?? 0;
    if (b === undefined) return a;
    if (a * b <= 0) return 0;
    const m = (a + b) / 2;
    const limit = 3 * Math.min(Math.abs(a), Math.abs(b));
    return Math.sign(m) * Math.min(Math.abs(m), limit);
  });
  let d = `M ${r2(xs[0] ?? 0)} ${r2(ys[0] ?? 0)}`;
  for (let k = 0; k < n - 1; k += 1) {
    const x0 = xs[k] ?? 0;
    const x1 = xs[k + 1] ?? 0;
    const h = x1 - x0;
    const y0 = ys[k] ?? 0;
    const y1 = ys[k + 1] ?? 0;
    const straight = (y1 - y0) / 3;
    const c1 = y0 + lerp(straight, ((tangents[k] ?? 0) * h) / 3, smooth);
    const c2 = y1 - lerp(straight, ((tangents[k + 1] ?? 0) * h) / 3, smooth);
    d += ` C ${r2(x0 + h / 3)} ${r2(c1)} ${r2(x1 - h / 3)} ${r2(c2)} ${r2(x1)} ${r2(y1)}`;
  }
  return d;
}

/** An annulus sector, clockwise from 12 o'clock, angles in degrees. */
function sector(
  c: number,
  outer: number,
  inner: number,
  a0: number,
  a1: number,
): string {
  const pad = 1.4;
  if (a1 - a0 <= pad) return "";
  const from = a0 + pad / 2;
  const to = Math.min(a1 - pad / 2, from + 359.99);
  const pt = (r: number, a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${r3(c + r * Math.sin(rad))} ${r3(c - r * Math.cos(rad))}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return [
    `M ${pt(outer, from)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${pt(outer, to)}`,
    `L ${pt(inner, to)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${pt(inner, from)}`,
    "Z",
  ].join(" ");
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/**
 * One digit as a column of 0–9 behind a one-line window: a change slides the
 * column on snap, so a number rolls the way an odometer does rather than
 * swapping. Columns are tabular, so a roll never moves its neighbours.
 */
function Digit({
  value,
  delay,
  motionSafe,
}: {
  value: number;
  delay: number;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-block h-[1em] overflow-clip">
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: `${-value}em` }}
        transition={motionSafe ? { ...springs.snap, delay } : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} className="block h-[1em] leading-none">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Roll({
  text,
  delay,
  motionSafe,
}: {
  text: string;
  delay: number;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((ch, i) => {
        // Keyed from the right, so the units stay the units when a number
        // gains a digit.
        const place = chars.length - i;
        if (ch >= "0" && ch <= "9") {
          return (
            <Digit
              key={`d${place}`}
              value={Number(ch)}
              delay={delay + (place - 1) * 0.024}
              motionSafe={motionSafe}
            />
          );
        }
        return (
          <span key={`c${place}${ch}`} className="inline-block h-[1em]">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

function Delta({
  change,
  text,
  good,
  motionSafe,
}: {
  change: number | null;
  text: string;
  good: "up" | "down";
  motionSafe: boolean;
}) {
  if (change === null) {
    return <span className="text-[11px] text-ink-3">No earlier data</span>;
  }
  const flat = Math.abs(change) < 1e-9;
  const better = good === "up" ? change > 0 : change < 0;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-1.5 font-mono text-[11px] tabular-nums transition-colors",
        flat ? "text-ink-3" : better ? "text-success" : "text-danger",
      )}
      style={{
        background: flat
          ? "color-mix(in oklab, var(--ink-3) 12%, transparent)"
          : `color-mix(in oklab, ${better ? "var(--success)" : "var(--danger)"} 13%, transparent)`,
      }}
    >
      <motion.svg
        aria-hidden
        viewBox="0 0 12 12"
        className="size-3 shrink-0"
        initial={false}
        animate={{ rotate: flat ? 45 : change > 0 ? 0 : 90 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ originX: 0.5, originY: 0.5 }}
      >
        <path
          d="M3.5 8.5 L8.5 3.5 M4.5 3.5 H8.5 V7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
      {text}
    </span>
  );
}

/** A tile's sparkline: its own metric over the shared window, scaled to itself. */
function Spark({
  series,
  prefix,
  lo,
  hi,
  active,
}: {
  series: number[];
  prefix: number[];
  lo: MotionValue<number>;
  hi: MotionValue<number>;
  active: boolean;
}) {
  const W = 120;
  const H = 26;
  const d = useTransform(
    [lo, hi] as MotionValue<number>[],
    ([a = 0, b = 1]: number[]) => {
      const pts = readings(series, prefix, a, b, W, 32);
      let min = Infinity;
      let max = -Infinity;
      for (const y of pts.ys) {
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      const span = max - min || 1;
      return linePath(
        {
          xs: pts.xs,
          ys: pts.ys.map((y) => H - 2 - ((y - min) / span) * (H - 4)),
        },
        0.8,
      );
    },
  );
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-[26px] w-full"
    >
      <motion.path
        d={d}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={cn(
          "transition-colors",
          active ? "stroke-cobalt-bright" : "stroke-ink-3/60",
        )}
      />
    </svg>
  );
}

/** One slice of the donut: its angles glide, and it pulls out along its own middle. */
function Slice({
  a0,
  a1,
  from,
  delay,
  color,
  active,
  dim,
  size,
  motionSafe,
  onEnter,
  onLeave,
  onPress,
}: {
  a0: number;
  a1: number;
  /** Where a new slice starts its sweep. */
  from: number;
  delay: number;
  color: string;
  active: boolean;
  dim: boolean;
  size: number;
  motionSafe: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPress: () => void;
}) {
  const start = useMotionValue(motionSafe ? from : a0);
  const end = useMotionValue(motionSafe ? from : a1);
  const pull = useMotionValue(0);
  React.useEffect(() => {
    if (!motionSafe) {
      start.set(a0);
      end.set(a1);
      return;
    }
    const spring = { ...springs.glide, delay };
    const c = [animate(start, a0, spring), animate(end, a1, spring)];
    return () => {
      for (const x of c) x.stop();
    };
  }, [a0, a1, delay, motionSafe, start, end]);
  React.useEffect(() => {
    const c = animate(
      pull,
      active && motionSafe ? 6 : 0,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => c.stop();
  }, [active, motionSafe, pull]);
  const c = size / 2;
  const d = useTransform(
    [start, end] as MotionValue<number>[],
    ([s = 0, e = 0]: number[]) => sector(c, c - 7, c - 25, s, e),
  );
  const mid = (((a0 + a1) / 2) * Math.PI) / 180;
  const x = useTransform(pull, (p) => r3(p * Math.sin(mid)));
  const y = useTransform(pull, (p) => r3(-p * Math.cos(mid)));
  return (
    <motion.path
      d={d}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={onPress}
      initial={false}
      animate={{ opacity: dim ? 0.38 : 1 }}
      transition={{ duration: durations.fast, ease: easings.move }}
      strokeWidth={1.5}
      style={{ x, y, fill: color }}
      className={cn(
        "cursor-pointer",
        // Without the pull, the slice in question is outlined instead.
        active && !motionSafe ? "stroke-foreground" : "stroke-transparent",
      )}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                               The dashboard                              */
/* ----------------------------------------------------------------------- */

type Win = { from: number; to: number };
type Brush = { a: number; b: number };
type Said = { n: number; text: string };

const PLOT_W = 640;
const PLOT_H = 208;

/**
 * A KPI dashboard where everything reads one window of days. The period
 * switch sets it and a brush on the chart narrows it, and when it changes
 * everything moves in one beat: the tiles' digits roll on snap, units
 * first, the four tiles in cascade; the chart's window glides on glide, so a
 * longer period is a real zoom out — the line is rebuilt every frame from
 * the window, read as the mean of each sample's share of it; the y scale and
 * the donut's slices glide with it.
 *
 * Dragging across the chart draws a brush that follows the finger 1:1 and
 * rubber-bands past the ends; letting go zooms into it — the brush widens to
 * fill the plot as the days stretch under it — and the window becomes a
 * custom one that the tiles and donut answer too. Pointing at a donut slice
 * pulls it out along its own middle on snap and the hub reads it.
 *
 * The period is a radio group, the tiles a tablist whose panel is the chart,
 * and the chart a slider over its days: arrows step a day, Page keys a week,
 * Shift with an arrow stretches a brush, Enter zooms to it and Escape lets
 * go of the brush, then the zoom. Under reduced motion nothing travels: the
 * window, digits and slices change at once behind a short fade, and every
 * number still updates.
 */
export function PulseDashboard({
  range,
  defaultRange = "30d",
  onRangeChange,
  smooth = 0.6,
  donut,
  defaultDonut = "channel",
  onDonutChange,
  metric,
  defaultMetric,
  onMetricChange,
  onWindowChange,
  metrics = defaultPulseMetrics,
  breakdowns = defaultPulseBreakdowns,
  now = defaultPulseNow,
  locale = "en-US",
  currency = "USD",
  format,
  status = "ready",
  onRetry,
  title = "Pulse",
  subtitle,
  label,
  sound = false,
  disabled = false,
  className,
}: PulseDashboardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const hintId = `${uid}-hint`;
  const fillId = `pulse-fill-${safeId}`;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ready = status === "ready";
  const smoothK = clamp(smooth, 0, 1);

  const N = Math.max(1, metrics[0]?.series.length ?? 1);

  /* ------------------------------ formats ------------------------------- */

  const moneyFmt = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency],
  );
  const countFmt = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );
  const fmt = (v: number, kind: PulseKind) =>
    format
      ? format(v, kind)
      : kind === "money"
        ? moneyFmt.format(Math.round(v))
        : kind === "count"
          ? countFmt.format(Math.round(v))
          : `${(v * 100).toFixed(2)}%`;
  /** Axis labels: short, so four fit a phone. */
  const short = (v: number, kind: PulseKind) => {
    if (kind === "percent") return `${r2(v * 100)}%`;
    const unit =
      kind === "money" ? moneyFmt.format(0).replace(/[\d.,\s]/g, "") : "";
    if (v >= 1e6) return `${unit}${r2(v / 1e6)}m`;
    if (v >= 1e3) return `${unit}${r2(v / 1e3)}k`;
    return `${unit}${Math.round(v)}`;
  };
  const dayLabel = (i: number) => {
    const d = new Date(nowMs - (N - 1 - Math.round(i)) * DAY_MS);
    return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
  };
  const isoAt = (i: number) =>
    new Date(nowMs - (N - 1 - Math.round(i)) * DAY_MS)
      .toISOString()
      .slice(0, 10);

  /* ------------------------------- state -------------------------------- */

  const [ownRange, setOwnRange] = React.useState<PulseRange>(defaultRange);
  const period = range ?? ownRange;
  const [custom, setCustom] = React.useState<Win | null>(null);
  // A period the host sets drops a zoom, as a press on the switch would.
  const [seenRange, setSeenRange] = React.useState(period);
  if (seenRange !== period) {
    setSeenRange(period);
    if (custom) setCustom(null);
  }
  const span = Math.min(N, RANGE_DAYS[period] ?? 30);
  const win: Win = custom ?? { from: N - span, to: N };

  const [ownMetric, setOwnMetric] = React.useState(
    defaultMetric ?? metrics[0]?.id ?? "",
  );
  const chosenId = metric ?? ownMetric;
  const chosen = metrics.find((m) => m.id === chosenId) ?? metrics[0];

  const [ownDonut, setOwnDonut] = React.useState(defaultDonut);
  const donutId = donut ?? ownDonut;
  const breakdown = breakdowns.find((b) => b.id === donutId) ?? breakdowns[0];

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const prefixes = React.useMemo(
    () => new Map(metrics.map((m) => [m.id, prefixOf(m.series)])),
    [metrics],
  );
  const prefixFor = (m: PulseMetric) => prefixes.get(m.id) ?? [0];

  /** A metric over a window, and against the window of the same length before it. */
  const kpi = (m: PulseMetric, w: Win) => {
    const p = prefixFor(m);
    const len = w.to - w.from;
    const total = (a: number, b: number) =>
      areaTo(m.series, p, b) - areaTo(m.series, p, a);
    const mean = aggregateOf(m) === "mean";
    const value = mean ? total(w.from, w.to) / len : total(w.from, w.to);
    if (w.from - len < 0) return { value, change: null as number | null };
    const before = mean
      ? total(w.from - len, w.from) / len
      : total(w.from - len, w.from);
    const change =
      m.kind === "percent"
        ? (value - before) * 100
        : before === 0
          ? null
          : ((value - before) / before) * 100;
    return { value, change };
  };
  const changeText = (m: PulseMetric, change: number | null) => {
    if (change === null) return "";
    const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
    const abs = Math.abs(change);
    return m.kind === "percent"
      ? `${sign}${abs.toFixed(2)} pt`
      : `${sign}${abs.toFixed(1)}%`;
  };
  const sentence = (m: PulseMetric | undefined, w: Win, lead: string) => {
    if (!m) return lead;
    const k = kpi(m, w);
    const abs = k.change === null ? 0 : Math.abs(k.change);
    const by =
      m.kind === "percent" ? `${abs.toFixed(2)} points` : `${abs.toFixed(1)}%`;
    const vs =
      k.change === null
        ? ""
        : `, ${k.change >= 0 ? "up" : "down"} ${by} on the period before`;
    return `${lead} ${m.label.toLowerCase()} ${fmt(k.value, m.kind)}${vs}.`;
  };

  /* ---------------------------- chart values ---------------------------- */

  const [plot, setPlot] = React.useState<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ w: PLOT_W, h: PLOT_H });
  React.useEffect(() => {
    if (!plot) return;
    const measure = () =>
      setBox((b) => {
        const w = Math.round(plot.clientWidth);
        const h = Math.round(plot.clientHeight);
        return w === b.w && h === b.h
          ? b
          : { w: Math.max(40, w), h: Math.max(40, h) };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(plot);
    return () => ro.disconnect();
  }, [plot]);
  /** How many readings the line can hold: one per ~5px. */
  const budget = clamp(Math.round(box.w / 5), 24, 180);

  const lo = useMotionValue(win.from);
  const hi = useMotionValue(win.to);
  const chosenSeries = chosen?.series ?? [];
  const chosenPrefix = chosen ? prefixFor(chosen) : [0];
  const axis = (() => {
    let max = 0;
    const pts = readings(
      chosenSeries,
      chosenPrefix,
      win.from,
      win.to,
      box.w,
      budget,
    );
    pts.ys.forEach((v, i) => {
      const x = pts.xs[i] ?? 0;
      if (x >= 0 && x <= box.w) max = Math.max(max, v);
    });
    return axisFor(max);
  })();
  const peak = axis.step * axis.ticks;
  const gridY = (g: number) => r2(box.h - 4 - (g / axis.ticks) * (box.h - 12));
  const yMax = useMotionValue(peak);
  /** 0 → 1 while the chart morphs from the metric it showed to the one chosen. */
  const mix = useMotionValue(1);
  const [morph, setMorph] = React.useState<{
    from: string;
    fromMax: number;
    n: number;
  }>({ from: chosen?.id ?? "", fromMax: peak, n: 0 });
  const plotFade = useMotionValue(1);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The window glides to wherever the state says it is: the period's, or a
  // zoom's. A re-run (StrictMode) carries it on from where it got to.
  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("lo")?.stop();
      anims.current.get("hi")?.stop();
      lo.set(win.from);
      hi.set(win.to);
      return;
    }
    run("lo", animate(lo, win.from, springs.glide));
    run("hi", animate(hi, win.to, springs.glide));
  }, [win.from, win.to, motionSafe, lo, hi]);

  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("y")?.stop();
      yMax.set(peak);
      return;
    }
    run("y", animate(yMax, peak, springs.glide));
  }, [peak, motionSafe, yMax]);

  React.useEffect(() => {
    if (morph.n === 0) return;
    const running = anims.current;
    mix.set(0);
    if (!motionSafe) {
      mix.set(1);
      return;
    }
    run("mix", animate(mix, 1, springs.glide));
    return () => {
      // Finish rather than freeze a morph a re-run interrupts.
      running.get("mix")?.stop();
      mix.set(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.n]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const fromMetric = metrics.find((m) => m.id === morph.from);
  const shapes = useTransform(
    [lo, hi, yMax, mix] as MotionValue<number>[],
    ([a = 0, b = 1, top = 1, k = 1]: number[]) => {
      const h = box.h;
      const toY = (v: number, max: number) =>
        h - 4 - clamp(v / Math.max(1e-9, max), 0, 1.4) * (h - 12);
      const pts = readings(chosenSeries, chosenPrefix, a, b, box.w, budget);
      let ys = pts.ys.map((v) => toY(v, top));
      // A new metric grows out of the old one's shape: the same x readings,
      // each height eased from the old scale's to the new.
      if (k < 1 && fromMetric && fromMetric.id !== chosen?.id) {
        const old = readings(
          fromMetric.series,
          prefixFor(fromMetric),
          a,
          b,
          box.w,
          budget,
        ).ys.map((v) => toY(v, morph.fromMax));
        ys = ys.map((y, i) => lerp(old[i] ?? y, y, k));
      }
      const line = linePath({ xs: pts.xs, ys }, smoothK);
      const first = r2(pts.xs[0] ?? 0);
      const last = r2(pts.xs[pts.xs.length - 1] ?? box.w);
      return { line, area: `${line} L ${last} ${h} L ${first} ${h} Z` };
    },
  );
  const line = useTransform(shapes, (s) => s.line);
  const area = useTransform(shapes, (s) => s.area);

  /* ------------------------------ the brush ----------------------------- */

  const [cursor, setCursor] = React.useState<number | null>(null);
  const [brush, setBrush] = React.useState<Brush | null>(null);
  const brushL = useMotionValue(0);
  const brushR = useMotionValue(0);
  const brushOpacity = useMotionValue(0);
  const cursorX = useMotionValue(0);
  const brushW = useTransform(
    [brushL, brushR] as MotionValue<number>[],
    ([l = 0, r = 0]: number[]) => r2(Math.max(0, r - l)),
  );
  const dragFrom = React.useRef(0);

  const xOfDay = (day: number, w: Win = win) =>
    ((day - w.from) / Math.max(1, w.to - w.from)) * box.w;
  const dayOfX = (x: number) =>
    clamp(
      Math.floor(win.from + (x / Math.max(1, box.w)) * (win.to - win.from)),
      win.from,
      win.to - 1,
    );

  const showCursor = (day: number | null, snap: boolean) => {
    setCursor(day);
    if (day === null) return;
    const x = r2(xOfDay(day + 0.5));
    if (!snap || !motionSafe) {
      anims.current.get("cx")?.stop();
      cursorX.set(x);
    } else {
      run("cx", animate(cursorX, x, springs.flick));
    }
  };

  const paintBrush = (b: Brush | null) => {
    if (!b) {
      run(
        "bo",
        animate(brushOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    anims.current.get("bl")?.stop();
    anims.current.get("br")?.stop();
    anims.current.get("bo")?.stop();
    brushL.set(r2(xOfDay(Math.min(b.a, b.b))));
    brushR.set(r2(xOfDay(Math.max(b.a, b.b) + 1)));
    brushOpacity.set(1);
  };

  const emitWindow = (w: Win, isCustom: boolean) =>
    onWindowChange?.({
      from: isoAt(w.from),
      to: isoAt(w.to - 1),
      custom: isCustom,
    });

  const zoomTo = (w: Win) => {
    if (disabled) return;
    const next = {
      from: clamp(Math.round(w.from), 0, N - 1),
      to: clamp(Math.round(w.to), 1, N),
    };
    if (next.to - next.from < 2) return;
    setCustom(next);
    setBrush(null);
    setCursor(null);
    emitWindow(next, true);
    audio.play("swish", {
      pitch: 1.15,
      gain: 0.45,
      pan: plot
        ? panFrom(plot.getBoundingClientRect().left + box.w / 2, null)
        : 0,
    });
    say(
      sentence(
        chosen,
        next,
        `Zoomed to ${dayLabel(next.from)} to ${dayLabel(next.to - 1)}:`,
      ),
    );
    // The brush opens out to the plot's edges as the days stretch under it,
    // then lets go.
    if (motionSafe) {
      run("bl", animate(brushL, 0, springs.glide));
      run("br", animate(brushR, box.w, springs.glide));
      run(
        "bo",
        animate(brushOpacity, 0, {
          duration: durations.slow,
          delay: 0.18,
          ease: easings.exit,
        }),
      );
    } else {
      brushOpacity.set(0);
      run("fade", animate(plotFade, [0.4, 1], { duration: durations.fast }));
    }
  };

  const resetZoom = () => {
    if (!custom || disabled) return;
    const w = { from: N - span, to: N };
    setCustom(null);
    setBrush(null);
    paintBrush(null);
    emitWindow(w, false);
    audio.play("swish", { pitch: 0.85, gain: 0.4 });
    say(sentence(chosen, w, `Back to the last ${RANGE_NAMES[period]}:`));
    if (!motionSafe) {
      run("fade", animate(plotFade, [0.4, 1], { duration: durations.fast }));
    }
  };

  const pickRange = (r: PulseRange) => {
    if (disabled || (r === period && !custom)) return;
    const len = Math.min(N, RANGE_DAYS[r]);
    const w = { from: N - len, to: N };
    if (range === undefined) setOwnRange(r);
    setCustom(null);
    setBrush(null);
    paintBrush(null);
    setCursor(null);
    onRangeChange?.(r);
    emitWindow(w, false);
    audio.play("tick", {
      pitch: r === "7d" ? 1.3 : r === "30d" ? 1.12 : r === "90d" ? 0.96 : 0.82,
      gain: 0.45,
    });
    say(sentence(chosen, w, `Last ${RANGE_NAMES[r]}:`));
    if (!motionSafe) {
      run("fade", animate(plotFade, [0.4, 1], { duration: durations.fast }));
    }
  };

  const pickMetric = (id: string) => {
    if (disabled || id === chosen?.id) return;
    const next = metrics.find((m) => m.id === id);
    if (!next) return;
    if (metric === undefined) setOwnMetric(id);
    onMetricChange?.(id);
    setMorph((m) => ({
      from: chosen?.id ?? "",
      fromMax: yMax.get(),
      n: m.n + 1,
    }));
    audio.play("tick", {
      pitch: r2(1 + metrics.indexOf(next) * 0.08),
      gain: 0.4,
    });
    say(sentence(next, win, "Chart shows"));
  };

  const pickDonut = (id: string) => {
    if (disabled || id === breakdown?.id) return;
    if (donut === undefined) setOwnDonut(id);
    onDonutChange?.(id);
    setPinned(null);
    audio.play("tick", { pitch: 1.05, gain: 0.4 });
    const b = breakdowns.find((x) => x.id === id);
    if (b) say(`Revenue by ${b.label.toLowerCase()}.`);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || !ready,
    onStart: ({ point, offset }) => {
      const rect = plot?.getBoundingClientRect();
      dragFrom.current = rect ? point.x - offset.x - rect.left : 0;
      setCursor(null);
      anims.current.get("bl")?.stop();
      anims.current.get("br")?.stop();
      anims.current.get("bo")?.stop();
      brushOpacity.set(1);
      brushL.set(r2(clamp(dragFrom.current, 0, box.w)));
      brushR.set(r2(clamp(dragFrom.current, 0, box.w)));
    },
    onMove: ({ offset }) => {
      // The free edge is under the finger, rubber-banded past the plot.
      const edge = rubberClamp(
        dragFrom.current + offset.x,
        0,
        box.w,
        box.w / 3,
      );
      const fixed = clamp(dragFrom.current, 0, box.w);
      brushL.set(r2(Math.min(fixed, edge)));
      brushR.set(r2(Math.max(fixed, edge)));
    },
    onEnd: () => {
      const l = clamp(brushL.get(), 0, box.w);
      const r = clamp(brushR.get(), 0, box.w);
      if (r - l < 10) {
        paintBrush(null);
        return;
      }
      const f = (x: number) =>
        win.from + (x / Math.max(1, box.w)) * (win.to - win.from);
      zoomTo({ from: Math.floor(f(l)), to: Math.ceil(f(r)) });
    },
    onCancel: () => paintBrush(null),
    onTap: (event) => {
      const rect = plot?.getBoundingClientRect();
      if (!rect) return;
      showCursor(dayOfX(event.clientX - rect.left), true);
    },
  });

  const onPlotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !ready) return;
    const at = cursor ?? win.to - 1;
    const stepTo = (d: number) => {
      const next = clamp(at + d, win.from, win.to - 1);
      if (event.shiftKey) {
        const b = { a: brush?.a ?? at, b: next };
        setBrush(b);
        paintBrush(b);
      } else if (brush) {
        setBrush(null);
        paintBrush(null);
      }
      showCursor(next, true);
      // A tick each time the cursor crosses into a new week.
      if (Math.floor(next / 7) !== Math.floor(at / 7)) {
        audio.play("tick", { pitch: 1.2, gain: 0.25 });
      }
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        stepTo(1);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        stepTo(-1);
        return;
      case "PageUp":
        event.preventDefault();
        stepTo(7);
        return;
      case "PageDown":
        event.preventDefault();
        stepTo(-7);
        return;
      case "Home":
        event.preventDefault();
        stepTo(win.from - at);
        return;
      case "End":
        event.preventDefault();
        stepTo(win.to - 1 - at);
        return;
      case "Enter":
        if (brush && Math.abs(brush.b - brush.a) >= 1) {
          event.preventDefault();
          zoomTo({
            from: Math.min(brush.a, brush.b),
            to: Math.max(brush.a, brush.b) + 1,
          });
        }
        return;
      case "Escape":
        if (brush) {
          event.preventDefault();
          setBrush(null);
          paintBrush(null);
        } else if (custom) {
          event.preventDefault();
          resetZoom();
        }
        return;
    }
  };

  /* ------------------------------ the donut ----------------------------- */

  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const activeSlice = hovered ?? pinned;
  const segPrefixes = React.useMemo(
    () => (breakdown?.segments ?? []).map((seg) => prefixOf(seg.series)),
    [breakdown],
  );
  const segs = breakdown?.segments ?? [];
  const sums = segs.map(
    (seg, k) =>
      areaTo(seg.series, segPrefixes[k] ?? [0], win.to) -
      areaTo(seg.series, segPrefixes[k] ?? [0], win.from),
  );
  const sumAll = sums.reduce((a, b) => a + b, 0) || 1;
  const slices: {
    id: string;
    label: string;
    value: number;
    share: number;
    a0: number;
    a1: number;
    color: string;
  }[] = [];
  for (let k = 0, at = 0; k < segs.length; k += 1) {
    const seg = segs[k];
    if (!seg) continue;
    const share = (sums[k] ?? 0) / sumAll;
    slices.push({
      id: seg.id,
      label: seg.label,
      value: sums[k] ?? 0,
      share,
      a0: r2(at),
      a1: r2(at + share * 360),
      color: seg.color ?? PIGMENT[k % PIGMENT.length] ?? "var(--accent-bright)",
    });
    at += share * 360;
  }
  const donutTotal = slices.reduce((t, s) => t + s.value, 0);
  const hub = slices.find((s) => s.id === activeSlice) ?? null;
  const legendRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [legendFocus, setLegendFocus] = React.useState(0);

  /* ------------------------------- render ------------------------------- */

  // Deltas are rounded to what they print, so "0.0%" is never drawn red.
  const tiles = metrics.map((m) => {
    const k = kpi(m, win);
    const change =
      k.change === null
        ? null
        : Number(k.change.toFixed(m.kind === "percent" ? 2 : 1)) || 0;
    return { m, value: k.value, change };
  });
  const step = cascade(Math.max(2, metrics.length));
  const rangeLabel = custom
    ? `${dayLabel(win.from)} – ${dayLabel(win.to - 1)}`
    : `Last ${RANGE_NAMES[period]}`;
  const axisDays = [0, 1 / 3, 2 / 3, 1].map((f) =>
    Math.min(win.to - 1, Math.round(win.from + f * (win.to - win.from - 1))),
  );
  const cursorValue =
    cursor !== null && chosen ? (chosen.series[cursor] ?? 0) : null;
  const valueDay = cursor ?? win.to - 1;
  const tipLeft = cursor !== null ? xOfDay(cursor + 0.5) : 0;

  const radio = (on: boolean) =>
    cn(
      "relative inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-[5px] px-2.5 font-mono text-[11px] whitespace-nowrap transition-colors @min-[40rem]:flex-none",
      on ? "text-foreground" : "text-ink-3 hover:text-foreground",
      FOCUS_IN,
    );

  const rovingKeys = (
    event: React.KeyboardEvent<HTMLElement>,
    index: number,
    total: number,
    pick: (i: number) => void,
  ) => {
    const d =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? total - 1
          : d
            ? (index + d + total) % total
            : -1;
    if (to === -1) return;
    event.preventDefault();
    pick(to);
  };

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="grid gap-3 p-3 @min-[40rem]:p-4">
          <p className="sr-only">Loading the dashboard.</p>
          <div className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
              >
                <span className="h-2.5 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-5 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-4 w-12 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="h-60 rounded-3 bg-surface-1 motion-safe:animate-pulse" />
            <div className="h-60 rounded-3 bg-surface-1 motion-safe:animate-pulse" />
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The numbers did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="grid gap-3 p-3 @min-[40rem]:p-4">
        {/* The tiles */}
        <div
          role="tablist"
          aria-label="Metrics"
          className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4"
        >
          {tiles.map(({ m, value, change }, i) => {
            const on = m.id === chosen?.id;
            const text = fmt(value, m.kind);
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                id={`${uid}-tab-${m.id}`}
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => pickMetric(m.id)}
                onKeyDown={(event) =>
                  rovingKeys(event, i, metrics.length, (to) => {
                    const next = metrics[to];
                    if (!next) return;
                    pickMetric(next.id);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                      [to]?.focus();
                  })
                }
                className={cn(
                  "relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-3 border border-hairline bg-surface-1 p-3 text-left transition-colors",
                  on ? "bg-card" : "enabled:hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-tile`}
                    aria-hidden
                    className="pointer-events-none absolute -inset-px rounded-3 ring-[1.5px] ring-cobalt-bright ring-inset"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="col-start-1 row-start-1 truncate text-[11px] leading-5 text-ink-3">
                  {m.label}
                </span>
                <span className="col-span-2 row-start-2 text-[20px] font-semibold text-foreground @min-[68rem]:text-[22px]">
                  <Roll text={text} delay={i * step} motionSafe={motionSafe} />
                  <span className="sr-only">{text}</span>
                </span>
                {/* Under the value on a phone; beside the label once the
                    tiles are four across and the sparkline takes row three. */}
                <span className="col-span-2 row-start-3 justify-self-start @min-[40rem]:col-span-1 @min-[40rem]:col-start-2 @min-[40rem]:row-start-1 @min-[40rem]:justify-self-end">
                  <Delta
                    change={change}
                    text={changeText(m, change)}
                    good={m.goodWhen ?? "up"}
                    motionSafe={motionSafe}
                  />
                </span>
                <span className="col-span-2 row-start-3 hidden @min-[40rem]:block">
                  <Spark
                    series={m.series}
                    prefix={prefixFor(m)}
                    lo={lo}
                    hi={hi}
                    active={on}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_16rem] @min-[68rem]:grid-cols-[minmax(0,1fr)_18rem]">
          {/* The chart */}
          <section
            id={panelId}
            role="tabpanel"
            aria-labelledby={chosen ? `${uid}-tab-${chosen.id}` : undefined}
            className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
          >
            <div className="flex h-7 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] font-medium">
                {chosen?.label ?? ""}
                <span className="font-normal text-ink-3"> · daily</span>
              </p>
              <AnimatePresence initial={false} mode="popLayout">
                {custom ? (
                  <motion.span
                    key="zoom"
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-hairline bg-card pr-1 pl-2.5 font-mono text-[11px] text-ink-2 tabular-nums"
                    initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                      x: motionSafe ? springs.snap : { duration: 0 },
                    }}
                  >
                    {rangeLabel}
                    <button
                      type="button"
                      aria-label="Reset zoom"
                      onClick={resetZoom}
                      disabled={disabled}
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </motion.span>
                ) : (
                  <motion.span
                    key="hint"
                    className="hidden shrink-0 text-[11px] text-ink-3 @min-[30rem]:inline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      transition: { duration: durations.fast },
                    }}
                  >
                    Drag across to zoom
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              ref={setPlot}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${chosen?.label ?? "Value"} by day`}
              aria-orientation="horizontal"
              aria-valuemin={win.from}
              aria-valuemax={win.to - 1}
              aria-valuenow={valueDay}
              aria-valuetext={
                chosen
                  ? `${dayLabel(valueDay)}, ${chosen.label.toLowerCase()} ${fmt(chosen.series[valueDay] ?? 0, chosen.kind)}`
                  : undefined
              }
              aria-describedby={hintId}
              aria-disabled={disabled || undefined}
              {...drag}
              onPointerMove={(event) => {
                drag.onPointerMove(event);
                if (event.pointerType !== "mouse" || event.buttons !== 0)
                  return;
                const rect = event.currentTarget.getBoundingClientRect();
                const day = dayOfX(event.clientX - rect.left);
                if (day !== cursor) showCursor(day, cursor !== null);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setCursor(null);
              }}
              onDoubleClick={resetZoom}
              onKeyDown={onPlotKeyDown}
              onBlur={() => {
                if (brush) {
                  setBrush(null);
                  paintBrush(null);
                }
              }}
              style={{ opacity: plotFade }}
              className={cn(
                "relative h-44 touch-pan-y select-none @min-[40rem]:h-auto @min-[40rem]:flex-1 @min-[40rem]:basis-52 @min-[68rem]:basis-60",
                disabled ? "cursor-not-allowed" : "cursor-crosshair",
                FOCUS_RING,
                "rounded-2",
              )}
            >
              <svg
                aria-hidden
                viewBox={`0 0 ${box.w} ${box.h}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
              >
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0"
                      style={{
                        stopColor: "var(--accent-bright)",
                        stopOpacity: 0.26,
                      }}
                    />
                    <stop
                      offset="1"
                      style={{
                        stopColor: "var(--accent-bright)",
                        stopOpacity: 0,
                      }}
                    />
                  </linearGradient>
                </defs>
                {Array.from({ length: axis.ticks + 1 }, (_, g) => (
                  <line
                    key={g}
                    x1={0}
                    x2={box.w}
                    y1={gridY(g)}
                    y2={gridY(g)}
                    className="stroke-hairline"
                    strokeWidth={1}
                    strokeDasharray={g === 0 ? undefined : "2 4"}
                  />
                ))}
                <motion.rect
                  x={brushL}
                  width={brushW}
                  y={0}
                  height={box.h}
                  rx={4}
                  style={{ opacity: brushOpacity }}
                  className="fill-[color-mix(in_oklab,var(--accent-bright)_12%,transparent)] stroke-[color-mix(in_oklab,var(--accent-bright)_55%,transparent)]"
                  strokeWidth={1}
                />
                <motion.path d={area} fill={`url(#${fillId})`} />
                <motion.path
                  d={line}
                  fill="none"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-cobalt-bright"
                />
                {cursor !== null && cursorValue !== null ? (
                  <>
                    <motion.line
                      x1={cursorX}
                      x2={cursorX}
                      y1={0}
                      y2={box.h}
                      className="stroke-ink-3/50"
                      strokeWidth={1}
                    />
                    <motion.circle
                      cx={cursorX}
                      cy={r2(
                        box.h -
                          4 -
                          clamp(cursorValue / Math.max(1e-9, peak), 0, 1.4) *
                            (box.h - 12),
                      )}
                      r={3.5}
                      strokeWidth={2}
                      className="fill-card stroke-cobalt-bright"
                    />
                  </>
                ) : null}
              </svg>
              <div className="pointer-events-none absolute inset-0">
                {Array.from({ length: axis.ticks }, (_, i) => i + 1).map(
                  (g) => (
                    <motion.span
                      key={`${g}-${axis.step}-${chosen?.id ?? ""}`}
                      className="absolute left-0 -translate-y-1/2 rounded-1 bg-surface-1/85 px-1 font-mono text-[10px] text-ink-3 tabular-nums"
                      style={{ top: gridY(g) }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                    >
                      {chosen ? short(axis.step * g, chosen.kind) : ""}
                    </motion.span>
                  ),
                )}
              </div>
              {cursor !== null && cursorValue !== null && chosen ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute top-1 left-0 z-10"
                  style={{ x: cursorX }}
                >
                  <div
                    className={cn(
                      "rounded-2 border border-hairline-strong bg-popover px-2 py-1 shadow-[0_4px_14px_color-mix(in_oklab,black_14%,transparent)]",
                      tipLeft > box.w * 0.6
                        ? "-translate-x-[calc(100%+8px)]"
                        : "translate-x-2",
                    )}
                  >
                    <p className="font-mono text-[10px] text-ink-3 uppercase">
                      {dayLabel(cursor)}
                    </p>
                    <p className="font-mono text-[12px] font-medium whitespace-nowrap text-foreground tabular-nums">
                      {fmt(cursorValue, chosen.kind)}
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </motion.div>
            <div className="relative h-4 font-mono text-[10px] text-ink-3 tabular-nums">
              {axisDays.map((d, i) => (
                <motion.span
                  key={`${i}-${d}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                  className={cn(
                    "absolute top-0",
                    i === 0
                      ? "left-0"
                      : i === axisDays.length - 1
                        ? "right-0"
                        : "-translate-x-1/2",
                  )}
                  style={
                    i === 0 || i === axisDays.length - 1
                      ? undefined
                      : { left: `${r2((i / (axisDays.length - 1)) * 100)}%` }
                  }
                >
                  {dayLabel(d)}
                </motion.span>
              ))}
            </div>
          </section>

          {/* The breakdown */}
          <section
            aria-label={`Revenue by ${breakdown?.label.toLowerCase() ?? "segment"}`}
            className="flex min-w-0 flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
              <p className="shrink-0 text-[13px] font-medium whitespace-nowrap">
                Revenue by
              </p>
              <div
                role="radiogroup"
                aria-label="Break revenue down by"
                className="inline-flex h-7 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
              >
                {breakdowns.map((b, i) => {
                  const on = b.id === breakdown?.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      disabled={disabled}
                      onClick={() => pickDonut(b.id)}
                      onKeyDown={(event) =>
                        rovingKeys(event, i, breakdowns.length, (to) => {
                          const next = breakdowns[to];
                          if (!next) return;
                          pickDonut(next.id);
                          event.currentTarget.parentElement
                            ?.querySelectorAll<HTMLButtonElement>(
                              "[role=radio]",
                            )
                            [to]?.focus();
                        })
                      }
                      className={cn(
                        "relative inline-flex h-6 items-center rounded-[5px] px-2 text-[11px] transition-colors",
                        on
                          ? "text-foreground"
                          : "text-ink-3 hover:text-foreground",
                        FOCUS_IN,
                      )}
                    >
                      {on ? (
                        <motion.span
                          layoutId={`${uid}-donut`}
                          aria-hidden
                          className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                          transition={
                            motionSafe ? springs.snap : { duration: 0 }
                          }
                        />
                      ) : null}
                      <span className="relative">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 @min-[40rem]:grid-cols-1 @min-[40rem]:justify-items-center">
              <div className="relative size-[7.5rem] @min-[68rem]:size-[8.75rem]">
                <svg
                  aria-hidden
                  viewBox="0 0 140 140"
                  className="size-full overflow-visible"
                  onPointerLeave={() => setHovered(null)}
                >
                  <AnimatePresence initial={false}>
                    <motion.g
                      key={breakdown?.id ?? "none"}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: durations.base,
                          ease: easings.exit,
                        },
                      }}
                    >
                      {slices.map((s, k) => (
                        <Slice
                          key={s.id}
                          a0={s.a0}
                          a1={s.a1}
                          from={0}
                          delay={k * cascade(slices.length)}
                          color={s.color}
                          active={activeSlice === s.id}
                          dim={activeSlice !== null && activeSlice !== s.id}
                          size={140}
                          motionSafe={motionSafe}
                          onEnter={() => setHovered(s.id)}
                          onLeave={() =>
                            setHovered((h) => (h === s.id ? null : h))
                          }
                          onPress={() => {
                            if (disabled) return;
                            setPinned((p) => (p === s.id ? null : s.id));
                            audio.play("tick", { pitch: 1.1, gain: 0.4 });
                          }}
                        />
                      ))}
                    </motion.g>
                  </AnimatePresence>
                </svg>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={hub?.id ?? "total"}
                      className="flex max-w-[5.5rem] flex-col items-center text-center"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                    >
                      <span className="w-full truncate text-[10px] text-ink-3">
                        {hub ? hub.label : "Total"}
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-foreground tabular-nums">
                        {short(hub ? hub.value : donutTotal, "money")}
                      </span>
                      {hub ? (
                        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                          {r2(hub.share * 100).toFixed(1)}%
                        </span>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <ul
                aria-label="Segments"
                className="flex w-full min-w-0 flex-col gap-0.5"
              >
                {slices.map((s, k) => {
                  const on = activeSlice === s.id;
                  return (
                    <li key={`${breakdown?.id}-${s.id}`}>
                      <button
                        ref={(node) => {
                          if (node) legendRefs.current.set(s.id, node);
                          else legendRefs.current.delete(s.id);
                        }}
                        type="button"
                        aria-pressed={pinned === s.id}
                        tabIndex={
                          k === Math.min(legendFocus, slices.length - 1)
                            ? 0
                            : -1
                        }
                        disabled={disabled}
                        onPointerEnter={() => setHovered(s.id)}
                        onPointerLeave={() =>
                          setHovered((h) => (h === s.id ? null : h))
                        }
                        onFocus={() => {
                          setLegendFocus(k);
                          setHovered(s.id);
                        }}
                        onBlur={() =>
                          setHovered((h) => (h === s.id ? null : h))
                        }
                        onClick={() => {
                          setPinned((p) => (p === s.id ? null : s.id));
                          audio.play("tick", { pitch: 1.1, gain: 0.4 });
                        }}
                        onKeyDown={(event) =>
                          rovingKeys(event, k, slices.length, (to) => {
                            const next = slices[to];
                            if (next) legendRefs.current.get(next.id)?.focus();
                          })
                        }
                        className={cn(
                          "flex h-6 w-full min-w-0 items-center gap-2 rounded-2 px-1.5 text-left text-[12px] transition-colors",
                          on
                            ? "bg-card text-foreground"
                            : "text-ink-2 hover:text-foreground",
                          FOCUS_IN,
                        )}
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: s.color }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {s.label}
                        </span>
                        <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[68rem]:inline">
                          {short(s.value, "money")}
                        </span>
                        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
                          {(s.share * 100).toFixed(1)}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {subtitle ? `${subtitle} · ` : ""}
            {dayLabel(win.from)} – {dayLabel(win.to - 1)}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Period"
          className="relative flex h-8 w-full shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5 @min-[40rem]:inline-flex @min-[40rem]:w-auto"
        >
          {RANGES.map((r, i) => {
            const on = r === period && !custom;
            const stop = custom ? i === 0 : r === period;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={stop ? 0 : -1}
                disabled={disabled}
                onClick={() => pickRange(r)}
                onKeyDown={(event) =>
                  rovingKeys(event, i, RANGES.length, (to) => {
                    const next = RANGES[to];
                    if (!next) return;
                    pickRange(next);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
                      [to]?.focus();
                  })
                }
                className={radio(on)}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-range`}
                    aria-hidden
                    className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{RANGE_NAMES[r]}</span>
              </button>
            );
          })}
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move a day, Page keys a week. Hold Shift with an arrow to
        mark a stretch, Enter zooms to it, Escape lets go of the mark and then
        the zoom.
      </p>

      {body()}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
