"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type MetricPoint = {
  /** When the reading was taken, ms since the epoch. */
  t: number;
  /** The reading, or null where the collector has no data. */
  v: number | null;
};

export type MetricSeries = {
  id: string;
  label: string;
  /** Readings oldest first, evenly spaced. */
  points: MetricPoint[];
};

export type MetricComparison = {
  id: string;
  /** "Last week" — in the toolbar. */
  label: string;
  /** "7d ago" — the legend's column head. */
  short: string;
  /** How far back the comparison looks, ms. */
  offset: number;
};

export type MetricSpan = "1h" | "6h" | "24h" | "7d";
export type MetricRange = {
  span: MetricSpan;
  /** The window's right edge, ms. */
  end: number;
};
export type MetricStatus = "ready" | "loading" | "error";
export type GhostStyle = "dashed" | "dotted" | "area";
export type GhostPalette = "cobalt" | "mono" | "warm" | "cool";

export type GhostBaselineProps = {
  /** How the comparison is drawn: dashes, dots, or a soft area under a thin edge. @default "dashed" */
  ghostStyle?: GhostStyle;
  /** Stroke width of the live lines, px; the ghost is drawn at 80% of it. @default 1.5 */
  lineWidth?: number;
  /** The series colours. @default "cobalt" */
  palette?: GhostPalette;
  /** The query behind the chart, shown in mono under the title. */
  query?: string;
  /** The series, each with evenly spaced readings. @default defaultMetricSeries */
  series?: MetricSeries[];
  /** The comparisons on offer. @default defaultMetricComparisons */
  comparisons?: MetricComparison[];
  /** Controlled comparison id, or null for none. */
  compare?: string | null;
  /** Initial comparison when uncontrolled. @default null */
  defaultCompare?: string | null;
  /** Fires from the press that changed the comparison. */
  onCompareChange?: (id: string | null) => void;
  /** Controlled window. */
  range?: MetricRange;
  /** Initial window when uncontrolled. @default { span: "24h", end: now } */
  defaultRange?: MetricRange;
  /** Fires from the press or key that moved or resized the window. */
  onRangeChange?: (range: MetricRange) => void;
  /** The window sizes on offer. @default ["1h", "6h", "24h", "7d"] */
  spans?: MetricSpan[];
  /** The newest moment there can be data for; the window never moves past it. @default defaultMetricNow */
  now?: number;
  /** The readings' unit. @default "ms" */
  unit?: string;
  /** Whether the result has arrived. Loading keeps the axes; error keeps the last result under a Retry banner. @default "ready" */
  status?: MetricStatus;
  /** Retry was pressed after a refresh failed. */
  onRetry?: () => void;
  /** The most points drawn per series; the window is averaged into this many buckets. @default 160 */
  maxPoints?: number;
  /** The chart's name, and the explorer's accessible name. @default "Request latency" */
  title?: string;
  /** Height of the explorer, px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEP = 2 * MIN;

/** Thursday 15 October 2026, 16:00 UTC. */
export const defaultMetricNow = Date.UTC(2026, 9, 15, 16, 0);
/** Thursday's deploy, which slowed search by about a fifth. */
const DEPLOY = Date.UTC(2026, 9, 15, 10, 0);

export const defaultMetricQuery =
  "p95(http.request.duration) by route · service:waylight-api";

export const defaultMetricComparisons: MetricComparison[] = [
  { id: "day", label: "Yesterday", short: "1d ago", offset: DAY },
  { id: "week", label: "Last week", short: "7d ago", offset: 7 * DAY },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fifteen days of p95 latency for three Waylight routes, every two minutes:
 * a day cycle that peaks mid-afternoon, quieter weekends, a mean-reverting
 * wander, Tuesday's auth spike, Thursday's search regression after the
 * 10:00 deploy, a collector outage early on Wednesday and a search gap a week
 * before it. No trigonometry, so Node and the browser agree to the digit.
 */
function makeSeries(): MetricSeries[] {
  const n = 15 * 720;
  const start = defaultMetricNow - (n - 1) * STEP;
  const outage = [Date.UTC(2026, 9, 14, 3, 0), Date.UTC(2026, 9, 14, 5, 20)];
  const searchGap = [Date.UTC(2026, 9, 7, 22, 0), Date.UTC(2026, 9, 7, 22, 40)];
  const spike = Date.UTC(2026, 9, 13, 11, 20);
  const specs = [
    { id: "orders", label: "/v1/orders", base: 138, swing: 42, noise: 10 },
    { id: "search", label: "/v1/search", base: 168, swing: 34, noise: 13 },
    { id: "auth", label: "/v1/auth", base: 84, swing: 14, noise: 6 },
  ];
  return specs.map((spec, k) => {
    const rand = mulberry32(1654 + k * 7919);
    const points: MetricPoint[] = [];
    let walk = 0;
    for (let i = 0; i < n; i += 1) {
      const t = start + i * STEP;
      const hour = (t % DAY) / HOUR;
      // A triangle wave that peaks at 15:00 UTC.
      const cycle = 1 - Math.abs(((hour - 15 + 36) % 24) - 12) / 12;
      const weekday = (Math.floor(t / DAY) + 4) % 7;
      walk = walk * 0.9 + (rand() - 0.5) * spec.noise * 0.7;
      let v =
        spec.base + spec.swing * cycle + walk + (rand() - 0.5) * spec.noise;
      if (weekday === 0 || weekday === 6) v -= spec.swing * 0.45 * cycle;
      if (spec.id === "search" && t >= DEPLOY) {
        v *= 1 + 0.19 * Math.min(1, (t - DEPLOY) / (20 * MIN));
      }
      if (spec.id === "auth") {
        const d = Math.abs(t - spike) / (25 * MIN);
        if (d < 1) v += 150 * (1 - d);
      }
      const gap =
        (t >= (outage[0] ?? 0) && t < (outage[1] ?? 0)) ||
        (spec.id === "search" &&
          t >= (searchGap[0] ?? 0) &&
          t < (searchGap[1] ?? 0));
      points.push({ t, v: gap ? null : Math.round(v * 10) / 10 });
    }
    return { id: spec.id, label: spec.label, points };
  });
}

/** Fifteen days of three routes' p95 latency, every two minutes, ending at defaultMetricNow. */
export const defaultMetricSeries: MetricSeries[] = makeSeries();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const SPAN_MS: Record<MetricSpan, number> = {
  "1h": HOUR,
  "6h": 6 * HOUR,
  "24h": DAY,
  "7d": 7 * DAY,
};
const SPAN_NAME: Record<MetricSpan, string> = {
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "7d": "7 days",
};
const TICK_MS: Record<MetricSpan, number> = {
  "1h": 10 * MIN,
  "6h": HOUR,
  "24h": 4 * HOUR,
  "7d": DAY,
};

const PALETTES: Record<GhostPalette, string[]> = {
  cobalt: ["var(--accent-bright)", "var(--signal)", "var(--warn)"],
  mono: ["var(--ink)", "var(--ink-2)", "var(--ink-3)"],
  warm: ["var(--warn)", "var(--danger)", "oklch(from var(--danger) l c 350)"],
  cool: [
    "var(--signal)",
    "var(--accent-bright)",
    "oklch(from var(--signal) l c 215)",
  ],
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Fixed 24-hour UTC clock: a locale lookup would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const day = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()}`;
};
const when = (ms: number) =>
  `${WEEKDAYS[new Date(ms).getUTCDay()] ?? ""} ${clock(ms)}`;

const whole = (v: number) => String(Math.round(v));
const signedPct = (v: number) => {
  const n = Math.round(v);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;
};

const subscribeNothing = () => () => {};

/** The first index whose time is at or after `t`. */
function lowerBound(points: MetricPoint[], t: number) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((points[mid]?.t ?? Infinity) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Readings per sample, read from the first two points. */
const stepOf = (series: MetricSeries[]) => {
  const p = series[0]?.points;
  const a = p?.[0];
  const b = p?.[1];
  return a && b && b.t > a.t ? b.t - a.t : STEP;
};

/** The mean of the readings in each bucket; a bucket with none is a gap. */
function bucketize(
  points: MetricPoint[],
  from: number,
  to: number,
  count: number,
): (number | null)[] {
  const sums = new Array<number>(count).fill(0);
  const counts = new Array<number>(count).fill(0);
  const width = (to - from) / count;
  for (let i = lowerBound(points, from); i < points.length; i += 1) {
    const p = points[i];
    if (!p || p.t >= to) break;
    if (p.v === null) continue;
    const b = Math.min(count - 1, Math.floor((p.t - from) / width));
    sums[b] = (sums[b] ?? 0) + p.v;
    counts[b] = (counts[b] ?? 0) + 1;
  }
  return counts.map((c, i) => (c ? r1((sums[i] ?? 0) / c) : null));
}

/** A line through the buckets that lifts its pen over every gap. */
function linePath(values: (number | null)[], y: (v: number) => number) {
  const n = values.length;
  let d = "";
  let open = false;
  values.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    const x = r3(((i + 0.5) / n) * 1000);
    d += `${open ? "L" : "M"}${x} ${y(v)}`;
    open = true;
  });
  return d;
}

/** The same line closed down to the floor, run by run. */
function areaPath(values: (number | null)[], y: (v: number) => number) {
  const n = values.length;
  let d = "";
  let start = -1;
  const close = (end: number) => {
    if (start < 0) return;
    d += `L${r3(((end + 0.5) / n) * 1000)} 100L${r3(((start + 0.5) / n) * 1000)} 100Z`;
    start = -1;
  };
  values.forEach((v, i) => {
    if (v === null) {
      close(i - 1);
      return;
    }
    const x = r3(((i + 0.5) / n) * 1000);
    d += `${start < 0 ? "M" : "L"}${x} ${y(v)}`;
    if (start < 0) start = i;
  });
  close(n - 1);
  return d;
}

/* ----------------------------------------------------------------------- */
/*                               Rolling value                             */
/* ----------------------------------------------------------------------- */

/**
 * A figure that runs to its new value on a base tween — from `from` the
 * first time when asked, so a delta that appears counts up into place. The
 * value lives in a motion value rendered as text: no React render per frame,
 * and the server prints the settled figure.
 */
function Rolling({
  value,
  from,
  format,
  motionSafe,
}: {
  value: number;
  from?: number;
  format: (v: number) => string;
  motionSafe: boolean;
}) {
  const mv = useMotionValue(from ?? value);
  const text = useTransform(mv, format);
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [motionSafe, mv, value]);
  // Reduced motion prints the figure itself: a derived value can miss the
  // jump StrictMode's rehearsal remount swallows, and nothing rolls anyway.
  if (!motionSafe) return <span>{format(value)}</span>;
  return <motion.span>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                              Segmented radio                            */
/* ----------------------------------------------------------------------- */

function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  motionSafe,
}: {
  id: string;
  label: string;
  options: { value: T; label: React.ReactNode; name: string }[];
  value: T;
  onChange: (value: T) => void;
  motionSafe: boolean;
}) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const go = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-8 items-stretch gap-0.5 rounded-2 bg-surface-2 p-0.5"
    >
      {options.map((o, index) => {
        const checked = index === at;
        return (
          <button
            key={o.value}
            ref={(node) => {
              if (node) refs.current.set(o.value, node);
              else refs.current.delete(o.value);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.name}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                go(index + 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                go(index - 1);
              }
            }}
            className={cn(
              "relative isolate flex cursor-pointer items-center justify-center rounded-[5px] px-2.5 text-[12px] whitespace-nowrap transition-colors",
              FOCUS_RING,
              checked
                ? "font-medium text-foreground"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {checked ? (
              <motion.span
                layoutId={`${id}-pill`}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[5px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)] ring-1 ring-hairline"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Ghost                                  */
/* ----------------------------------------------------------------------- */

/**
 * The comparison, drawn under the live lines. When the visitor turns it on
 * it slides in from the left on `springs.glide` while a clip rect sweeps
 * across the plot on an enter tween, so the shadow is drawn in from the left
 * as it settles. The clip lives on an outer group with no transform, so it
 * stays put while the lines slide beneath it.
 */
function Ghost({
  clipId,
  paths,
  colors,
  ghostStyle,
  width,
  sweep,
  dim,
  motionSafe,
}: {
  clipId: string;
  paths: { id: string; line: string; area: string }[];
  colors: string[];
  ghostStyle: GhostStyle;
  width: number;
  sweep: boolean;
  dim: string | null;
  motionSafe: boolean;
}) {
  const reveal = useMotionValue(sweep && motionSafe ? 0 : 1020);
  const revealWidth = useTransform(reveal, (v) => Math.round(v));
  React.useEffect(() => {
    if (!sweep || !motionSafe) {
      reveal.jump(1020);
      return;
    }
    const controls = animate(reveal, 1020, {
      duration: 0.6,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [motionSafe, reveal, sweep]);

  const dash =
    ghostStyle === "dotted"
      ? "0.1 4.5"
      : ghostStyle === "dashed"
        ? "6 5"
        : undefined;
  return (
    <motion.g
      initial={sweep ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.fast }}
    >
      <defs>
        <clipPath id={clipId}>
          <motion.rect x={-10} y={-20} height={140} width={revealWidth} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <motion.g
          initial={sweep && motionSafe ? { x: -40 } : false}
          animate={{ x: 0 }}
          transition={springs.glide}
        >
          {paths.map((p, i) => {
            const color = colors[i % colors.length] ?? "var(--ink-3)";
            const faded = dim !== null && dim !== p.id;
            return (
              <g
                key={p.id}
                style={{
                  opacity: faded ? 0.15 : 1,
                  transition: "opacity 200ms ease",
                }}
              >
                {ghostStyle === "area" ? (
                  <path d={p.area} style={{ fill: color }} opacity={0.1} />
                ) : null}
                <path
                  d={p.line}
                  fill="none"
                  style={{ stroke: color }}
                  strokeOpacity={ghostStyle === "area" ? 0.5 : 0.62}
                  strokeWidth={r3(
                    width * (ghostStyle === "dotted" ? 1.25 : 0.8),
                  )}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </motion.g>
      </g>
    </motion.g>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A metric explorer: a query, its series on a chart, a legend table and the
 * controls for the window. Turning a comparison on lays the same window from
 * a day or a week earlier under the live lines as a faint ghost that slides
 * in from the left on `springs.glide` while a clip sweeps across the plot,
 * and the legend's comparison and delta columns roll to their figures. The
 * axis is chosen from both, so the comparison never rescales the chart.
 *
 * The plot is a slider over its buckets: Left and Right step the crosshair,
 * Shift steps ten, Home and End jump, and `[` and `]` shift the window
 * anywhere in the explorer. Gaps in the data are hatched; loading keeps the
 * axes; a failed refresh keeps the last result on screen. Under reduced
 * motion the ghost fades in where it lies and the figures change without
 * rolling.
 */
export function GhostBaseline({
  ghostStyle = "dashed",
  lineWidth = 1.5,
  palette = "cobalt",
  query = defaultMetricQuery,
  series = defaultMetricSeries,
  comparisons = defaultMetricComparisons,
  compare,
  defaultCompare = null,
  onCompareChange,
  range,
  defaultRange,
  onRangeChange,
  spans = ["1h", "6h", "24h", "7d"],
  now = defaultMetricNow,
  unit = "ms",
  status = "ready",
  onRetry,
  maxPoints = 160,
  title = "Request latency",
  height = 540,
  className,
}: GhostBaselineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const colors = PALETTES[palette] ?? PALETTES.cobalt;

  /* ---------------------------- comparison ----------------------------- */

  const [ownCompare, setOwnCompare] = React.useState<string | null>(
    defaultCompare,
  );
  const compareId = compare === undefined ? ownCompare : compare;
  const comparison = comparisons.find((c) => c.id === compareId) ?? null;
  // A comparison already on at first paint is simply there, in the
  // server's markup too; one that arrives after hydration sweeps and rolls.
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  /* ------------------------------- window ------------------------------ */

  const [ownRange, setOwnRange] = React.useState<MetricRange>(
    defaultRange ?? { span: "24h", end: now },
  );
  const wanted = range ?? ownRange;
  const [lastGood, setLastGood] = React.useState<MetricRange>(wanted);
  if (
    status === "ready" &&
    (lastGood.span !== wanted.span || lastGood.end !== wanted.end)
  ) {
    setLastGood(wanted);
  }
  // A failed refresh keeps the last result on screen, not a blank chart.
  const shown = status === "error" ? lastGood : wanted;
  const spanMs = SPAN_MS[shown.span];
  const to = shown.end;
  const from = to - spanMs;

  const step = stepOf(series);
  const firstT = series[0]?.points[0]?.t ?? now - 15 * DAY;
  const maxOffset = comparisons.reduce((m, c) => Math.max(m, c.offset), 0);

  const [announcement, setAnnouncement] = React.useState("");
  const [cross, setCross] = React.useState<number | null>(null);

  const setRange = (next: MetricRange) => {
    const end = clamp(
      next.end,
      Math.min(now, firstT + SPAN_MS[next.span] + maxOffset),
      now,
    );
    const clamped = { span: next.span, end };
    if (clamped.span === wanted.span && clamped.end === wanted.end) return;
    if (range === undefined) setOwnRange(clamped);
    onRangeChange?.(clamped);
    setCross(null);
    setAnnouncement(
      `Showing ${SPAN_NAME[clamped.span]} to ${when(clamped.end)}.`,
    );
  };
  const shift = (direction: -1 | 1) =>
    setRange({
      span: wanted.span,
      end: wanted.end + direction * SPAN_MS[wanted.span],
    });

  const chooseCompare = (id: string | null) => {
    if (id === compareId) return;
    if (compare === undefined) setOwnCompare(id);
    onCompareChange?.(id);
    const c = comparisons.find((x) => x.id === id);
    setAnnouncement(
      c ? `Comparing with ${c.label.toLowerCase()}.` : "Comparison off.",
    );
  };

  /* ------------------------------ buckets ------------------------------ */

  const perWindow = Math.max(1, Math.round(spanMs / step));
  const per = Math.max(1, Math.ceil(perWindow / Math.max(8, maxPoints)));
  const count = Math.max(2, Math.floor(perWindow / per));

  const live = React.useMemo(
    () => series.map((s) => bucketize(s.points, from, to, count)),
    [count, from, series, to],
  );
  const ghosts = React.useMemo(
    () =>
      comparisons.map((c) =>
        series.map((s) =>
          bucketize(s.points, from - c.offset, to - c.offset, count),
        ),
      ),
    [comparisons, count, from, series, to],
  );
  const ghostIndex = comparison ? comparisons.indexOf(comparison) : -1;
  const ghost = ghostIndex >= 0 ? (ghosts[ghostIndex] ?? null) : null;

  // The axis is chosen from the live data and every comparison together, so
  // turning one on never rescales the chart under the reader.
  const yMax = React.useMemo(() => {
    let max = 0;
    for (const list of [live, ...ghosts]) {
      for (const values of list) {
        for (const v of values) if (v !== null && v > max) max = v;
      }
    }
    const raw = Math.max(1, max * 1.06) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice =
      [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * mag >= raw) ?? 10;
    const unitStep = Number((nice * mag).toFixed(6));
    return { top: unitStep * 4, step: unitStep };
  }, [ghosts, live]);
  const yOf = React.useCallback(
    (v: number) => r3(100 - (clamp(v, 0, yMax.top) / yMax.top) * 100),
    [yMax.top],
  );

  const livePaths = React.useMemo(
    () => live.map((values) => linePath(values, yOf)),
    [live, yOf],
  );
  const ghostPaths = React.useMemo(
    () =>
      ghost
        ? ghost.map((values, i) => ({
            id: series[i]?.id ?? String(i),
            line: linePath(values, yOf),
            area: areaPath(values, yOf),
          }))
        : [],
    [ghost, series, yOf],
  );

  // Stretches with no reading on any route: the collector was down.
  const gaps = React.useMemo(() => {
    const out: { from: number; to: number; label: string }[] = [];
    let start = -1;
    for (let i = 0; i <= count; i += 1) {
      const empty = i < count && live.every((values) => values[i] === null);
      if (empty && start < 0) start = i;
      if (!empty && start >= 0) {
        const a = from + (start * spanMs) / count;
        const b = from + (i * spanMs) / count;
        out.push({
          from: r3((start / count) * 100),
          to: r3((i / count) * 100),
          label: `No data ${when(a)} to ${clock(b)}`,
        });
        start = -1;
      }
    }
    return out;
  }, [count, from, live, spanMs]);
  const empty = live.every((values) => values.every((v) => v === null));

  /* ----------------------------- crosshair ----------------------------- */

  const lastIndex = (() => {
    for (let i = count - 1; i >= 0; i -= 1) {
      if (live.some((values) => values[i] !== null)) return i;
    }
    return count - 1;
  })();
  const at = cross ?? lastIndex;
  const atTime = from + ((at + 0.5) * spanMs) / count;
  const [dim, setDim] = React.useState<string | null>(null);

  const rows = series.map((s, i) => {
    const now_ = live[i]?.[at] ?? null;
    const then = ghost?.[i]?.[at] ?? null;
    const delta =
      now_ !== null && then !== null && then > 0
        ? ((now_ - then) / then) * 100
        : null;
    return { s, i, now: now_, then, delta };
  });

  const valueText = `${when(atTime)}, ${rows
    .map(
      (r) =>
        `${r.s.label} ${r.now === null ? "no data" : `${whole(r.now)} ${unit}`}${
          comparison && r.then !== null
            ? `, ${comparison.label.toLowerCase()} ${whole(r.then)} ${unit}`
            : ""
        }`,
    )
    .join("; ")}`;

  const onPlotKey = (event: React.KeyboardEvent) => {
    const big = event.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = at + big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = at - big;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape" && cross !== null) {
      event.preventDefault();
      setCross(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setCross(clamp(next, 0, count - 1));
  };

  /* ------------------------------- ticks ------------------------------- */

  const xTicks = React.useMemo(() => {
    const tick = TICK_MS[shown.span];
    const out: { x: number; label: string }[] = [];
    for (let t = Math.ceil(from / tick) * tick; t <= to; t += tick) {
      const x = r3(((t - from) / spanMs) * 100);
      if (x < 4 || x > 96) continue;
      out.push({ x, label: shown.span === "7d" ? day(t) : clock(t) });
    }
    return out;
  }, [from, shown.span, spanMs, to]);
  const yTicks = [0, 1, 2, 3, 4].map((k) => k * yMax.step);

  /* ------------------------------ plot size ---------------------------- */

  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const indexAt = (clientX: number) => {
    const node = plotRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const f = (clientX - rect.left) / Math.max(1, rect.width);
    return clamp(Math.floor(f * count), 0, count - 1);
  };

  const ready = status === "ready";
  const drawn = status !== "loading";
  const crossX = r3(((at + 0.5) / count) * 100);
  const windowLabel =
    shown.span === "7d"
      ? `${day(from)} – ${day(to)}`
      : day(from) === day(to)
        ? `${day(from)} ${clock(from)} – ${clock(to)}`
        : `${day(from)} ${clock(from)} – ${day(to)} ${clock(to)}`;
  const atEnd = wanted.end >= now;
  const atStart = wanted.end - SPAN_MS[wanted.span] - maxOffset <= firstT;

  const button = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors",
    FOCUS_RING,
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "[" || event.key === "]") {
          event.preventDefault();
          shift(event.key === "[" ? -1 : 1);
        }
      }}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-col gap-0.5 border-b border-hairline px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p id={titleId} className="text-sm font-semibold">
              {title}
            </p>
            <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
              {windowLabel}
            </span>
          </div>
          <p
            className="truncate font-mono text-[11px] text-ink-3"
            title={query}
          >
            {query}
          </p>
        </header>

        <div
          role="toolbar"
          aria-label="Window and comparison"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Earlier ${SPAN_NAME[wanted.span]}`}
              aria-keyshortcuts="["
              aria-disabled={atStart || undefined}
              onClick={() => shift(-1)}
              className={cn(
                button,
                atStart
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <Segmented
              id={`${safeId}-span`}
              label="Window"
              options={spans.map((s) => ({
                value: s,
                label: s,
                name: SPAN_NAME[s],
              }))}
              value={wanted.span}
              onChange={(span) => setRange({ span, end: wanted.end })}
              motionSafe={motionSafe}
            />
            <button
              type="button"
              aria-label={`Later ${SPAN_NAME[wanted.span]}`}
              aria-keyshortcuts="]"
              aria-disabled={atEnd || undefined}
              onClick={() => shift(1)}
              className={cn(
                button,
                atEnd
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-ink-3 @min-[26rem]:inline">
              Compare
            </span>
            <Segmented
              id={`${safeId}-cmp`}
              label="Compare with"
              options={[
                { value: "none", label: "Off", name: "Off" },
                ...comparisons.map((c) => ({
                  value: c.id,
                  label: (
                    <>
                      <span className="@min-[26rem]:hidden">{c.short}</span>
                      <span className="hidden @min-[26rem]:inline">
                        {c.label}
                      </span>
                    </>
                  ),
                  name: c.label,
                })),
              ]}
              value={compareId ?? "none"}
              onChange={(id) => chooseCompare(id === "none" ? null : id)}
              motionSafe={motionSafe}
            />
          </div>
        </div>

        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 @min-[44rem]:grid-cols-[minmax(0,1fr)_16.5rem]">
            <section
              aria-label="Chart"
              className="flex min-w-0 flex-col gap-2 p-4"
            >
              {status === "error" ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-3 py-2"
                >
                  <TriangleAlert
                    aria-hidden
                    className="size-4 shrink-0 text-danger"
                  />
                  <p className="min-w-0 flex-1 text-[12px] text-ink-2">
                    Couldn&apos;t refresh. Showing the result to{" "}
                    {when(lastGood.end)}.
                  </p>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="relative ml-8">
                {yTicks.map((v) => (
                  <span
                    key={v}
                    aria-hidden
                    className="absolute -left-8 w-6 -translate-y-1/2 text-right font-mono text-[9.5px] leading-none text-ink-3 tabular-nums"
                    style={{ top: `${yOf(v)}%` }}
                  >
                    {whole(v)}
                  </span>
                ))}
                <div
                  ref={plotRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Crosshair"
                  aria-valuemin={0}
                  aria-valuemax={count - 1}
                  aria-valuenow={at}
                  aria-valuetext={valueText}
                  onKeyDown={onPlotKey}
                  onPointerMove={(event) => {
                    const i = indexAt(event.clientX);
                    if (i !== null) setCross((prev) => (prev === i ? prev : i));
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") setCross(null);
                  }}
                  className={cn(
                    "relative h-[180px] cursor-crosshair touch-pan-y rounded-1 @min-[44rem]:h-[280px]",
                    FOCUS_RING,
                    status === "error" && "opacity-75",
                  )}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 1000 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full overflow-visible"
                  >
                    {yTicks.map((v) => (
                      <line
                        key={v}
                        x1={0}
                        x2={1000}
                        y1={yOf(v)}
                        y2={yOf(v)}
                        vectorEffect="non-scaling-stroke"
                        className={
                          v === 0 ? "stroke-hairline-strong" : "stroke-hairline"
                        }
                        strokeWidth={1}
                      />
                    ))}
                    {drawn ? (
                      <>
                        <AnimatePresence>
                          {comparison && ghostPaths.length ? (
                            <Ghost
                              key={comparison.id}
                              clipId={`${safeId}-ghost-${comparison.id}`}
                              paths={ghostPaths}
                              colors={colors}
                              ghostStyle={ghostStyle}
                              width={lineWidth}
                              sweep={hydrated}
                              dim={dim}
                              motionSafe={motionSafe}
                            />
                          ) : null}
                        </AnimatePresence>
                        {livePaths.map((d, i) => {
                          const id = series[i]?.id ?? String(i);
                          return (
                            <path
                              key={id}
                              d={d}
                              fill="none"
                              style={{
                                stroke: colors[i % colors.length],
                                opacity: dim !== null && dim !== id ? 0.2 : 1,
                                transition: "opacity 200ms ease",
                              }}
                              strokeWidth={lineWidth}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                      </>
                    ) : null}
                  </svg>

                  {drawn
                    ? gaps.map((g) => (
                        <span
                          key={`${g.from}-${g.to}`}
                          title={g.label}
                          className="absolute inset-y-0 border-x border-hairline bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_1px,transparent_1px_5px)]"
                          style={{
                            left: `${g.from}%`,
                            width: `${r3(g.to - g.from)}%`,
                          }}
                        />
                      ))
                    : null}

                  {status === "loading" ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-[30%] h-[36%] rounded-2 bg-surface-2/80 motion-safe:animate-pulse"
                    />
                  ) : null}
                  {drawn && empty ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-3">
                      No data in this window
                    </span>
                  ) : null}

                  {drawn && cross !== null ? (
                    <>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 w-px bg-ink-3/45"
                        style={{ left: `${crossX}%` }}
                      />
                      {rows.map((r) => (
                        <React.Fragment key={r.s.id}>
                          {r.then !== null ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] bg-card"
                              style={{
                                left: `${crossX}%`,
                                top: `${yOf(r.then)}%`,
                                borderColor: colors[r.i % colors.length],
                              }}
                            />
                          ) : null}
                          {r.now !== null ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                              style={{
                                left: `${crossX}%`,
                                top: `${yOf(r.now)}%`,
                                backgroundColor: colors[r.i % colors.length],
                              }}
                            />
                          ) : null}
                        </React.Fragment>
                      ))}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-1 rounded-1 bg-popover px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-ink-2 tabular-nums ring-1 ring-hairline"
                        style={
                          crossX > 70
                            ? { right: `${r3(100 - crossX)}%`, marginRight: 6 }
                            : { left: `${crossX}%`, marginLeft: 6 }
                        }
                      >
                        {when(atTime)}
                      </span>
                    </>
                  ) : null}
                </div>
                <div aria-hidden className="relative mt-1.5 h-3.5">
                  {xTicks.map((t) => (
                    <span
                      key={t.x}
                      className="absolute -translate-x-1/2 font-mono text-[9.5px] leading-none whitespace-nowrap text-ink-3 tabular-nums"
                      style={{ left: `${t.x}%` }}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>

              {gaps.length && drawn ? (
                <ul className="sr-only">
                  {gaps.map((g) => (
                    <li key={g.from}>{g.label}</li>
                  ))}
                </ul>
              ) : null}

              <p className="ml-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-[2px] w-3.5 rounded-full bg-ink-2"
                  />
                  Now
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 transition-opacity",
                    !comparison && "opacity-50",
                  )}
                >
                  <svg aria-hidden width="14" height="4" className="shrink-0">
                    <line
                      x1="1"
                      x2="13"
                      y1="2"
                      y2="2"
                      className="stroke-ink-2"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeDasharray={
                        ghostStyle === "dotted"
                          ? "0.1 3.5"
                          : ghostStyle === "dashed"
                            ? "4 3"
                            : undefined
                      }
                    />
                  </svg>
                  {comparison ? comparison.label : "No comparison"}
                </span>
                {gaps.length && drawn ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-3 border-x border-hairline bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_1px,transparent_1px_4px)]"
                    />
                    No data
                  </span>
                ) : null}
              </p>
            </section>

            <section
              aria-label="Legend"
              className="flex min-w-0 flex-col gap-2 border-t border-hairline p-4 @min-[44rem]:border-t-0 @min-[44rem]:border-l"
            >
              <p className="flex items-baseline justify-between gap-2 text-[11px] text-ink-3">
                <span className="font-medium">p95, {unit}</span>
                <span className="font-mono tabular-nums">
                  {cross === null ? `Latest · ${clock(atTime)}` : when(atTime)}
                </span>
              </p>
              <table className="w-full border-collapse text-[12px]">
                <caption className="sr-only">
                  {`${title} at ${when(atTime)}${comparison ? `, against ${comparison.label.toLowerCase()}` : ""}`}
                </caption>
                <thead>
                  <tr className="text-[10.5px] text-ink-3">
                    <th scope="col" className="pb-1.5 text-left font-normal">
                      Route
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-normal">
                      Now
                    </th>
                    <th
                      scope="col"
                      className={cn(
                        "pb-1.5 text-right font-normal transition-opacity",
                        !comparison && "opacity-50",
                      )}
                    >
                      {comparison ? comparison.short : "Then"}
                    </th>
                    <th
                      scope="col"
                      className={cn(
                        "w-14 pb-1.5 text-right font-normal transition-opacity",
                        !comparison && "opacity-50",
                      )}
                    >
                      Δ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const color = colors[r.i % colors.length];
                    const worse = r.delta !== null && r.delta >= 0.5;
                    const better = r.delta !== null && r.delta <= -0.5;
                    return (
                      <tr
                        key={r.s.id}
                        onPointerEnter={() => setDim(r.s.id)}
                        onPointerLeave={() => setDim(null)}
                        className="border-t border-hairline"
                      >
                        <th
                          scope="row"
                          className="py-2 pr-2 text-left font-normal text-foreground"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className="h-[3px] w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate font-mono text-[11.5px]">
                              {r.s.label}
                            </span>
                          </span>
                        </th>
                        <td className="py-2 text-right font-mono text-foreground tabular-nums">
                          {drawn && r.now !== null ? (
                            <Rolling
                              value={r.now}
                              format={whole}
                              motionSafe={motionSafe}
                            />
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right font-mono text-ink-2 tabular-nums">
                          {drawn && comparison && r.then !== null ? (
                            <Rolling
                              key={comparison.id}
                              value={r.then}
                              from={hydrated ? (r.now ?? r.then) : undefined}
                              format={whole}
                              motionSafe={motionSafe}
                            />
                          ) : (
                            <span className="text-ink-3">–</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "py-2 pl-2 text-right font-mono tabular-nums",
                            worse
                              ? "text-danger"
                              : better
                                ? "text-success"
                                : "text-ink-3",
                          )}
                        >
                          {drawn && comparison && r.delta !== null ? (
                            <span className="inline-flex items-center justify-end gap-0.5">
                              {worse ? (
                                <ArrowUpRight
                                  aria-hidden
                                  className="size-3 shrink-0"
                                />
                              ) : better ? (
                                <ArrowDownRight
                                  aria-hidden
                                  className="size-3 shrink-0"
                                />
                              ) : null}
                              <Rolling
                                key={comparison.id}
                                value={r.delta}
                                from={hydrated ? 0 : undefined}
                                format={signedPct}
                                motionSafe={motionSafe}
                              />
                            </span>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] leading-relaxed text-ink-3">
                {comparison
                  ? `Faint lines: the same window ${comparison.label.toLowerCase()}. Up is slower.`
                  : "Turn on a comparison to lay an earlier window under these lines."}
              </p>
              {ready ? null : (
                <p className="text-[11px] text-ink-3">
                  {status === "loading"
                    ? "Loading this window"
                    : "Showing the last result"}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
