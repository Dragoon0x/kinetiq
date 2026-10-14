"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type Transition,
} from "motion/react";
import {
  CircleCheck,
  Crosshair,
  Inbox,
  Lock,
  LockOpen,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TeaserPointKind = "actual" | "forecast";

/** One month of the report's series. */
export type TeaserPoint = {
  /** Short month, e.g. "Jul". */
  month: string;
  value: number;
  kind: TeaserPointKind;
  /** The band's floor around a forecast point. */
  low?: number;
  /** The band's ceiling around a forecast point. */
  high?: number;
};

/** One row of the region table. */
export type TeaserRegion = {
  id: string;
  name: string;
  /** The last actual month's number. */
  actual: number;
  /** Next month's forecast. */
  forecast: number;
};

/**
 * The parts of the report a feature can live on: the three tiles, the
 * forecast half of the chart, and the region table.
 */
export type TeaserAnchor =
  "next-month" | "quarter" | "confidence" | "outlook" | "regions";

export type TeaserReport = {
  /** The heading inside the frame, e.g. "Bookings forecast". */
  title: string;
  /** What is counted, under the heading. */
  metric: string;
  /** Oldest first: the actual months, then the forecast months. */
  series: TeaserPoint[];
  regions: TeaserRegion[];
  /** How sure the model is, 0 to 1; the Confidence tile. */
  confidence: number;
};

/** Something the plan unlocks, pinned to a part of the report. */
export type TeaserFeature = {
  id: string;
  label: string;
  /** One line under the label in the card. */
  detail?: string;
  anchor: TeaserAnchor;
};

/** A chip that glides the lens to a feature. */
export type TeaserSpot = {
  id: string;
  label: string;
  /** The feature's id. */
  feature: string;
};

/** Where the lens is, as fractions of the report's width and height. */
export type TeaserPosition = { x: number; y: number };

export type TeaserAccent = "cobalt" | "signal" | "ink";
export type TeaserStatus = "ready" | "loading" | "error";

export type TeaserLensProps = {
  /** The report under the frost: a series, a region table and a confidence. @default defaultTeaserReport */
  report?: TeaserReport;
  /** What the plan unlocks, each pinned to a part of the report; listed in the card. @default defaultTeaserFeatures */
  features?: TeaserFeature[];
  /** The chips that glide the lens to a feature. @default defaultTeaserSpots */
  spots?: TeaserSpot[];
  /** Controlled: whether the report is still behind the frost. */
  locked?: boolean;
  /** Initial lock when uncontrolled. @default true */
  defaultLocked?: boolean;
  /** Unlock was pressed. When uncontrolled the frost lifts at once. */
  onUnlock?: () => void;
  /** The lens reached a feature for the first time, with every feature seen so far. */
  onFeatureSeen?: (feature: TeaserFeature, seen: string[]) => void;
  /** The lens's radius in px. @default 110 */
  lensRadius?: number;
  /** The frost's blur in px. @default 6 */
  frost?: number;
  /** The forecast's colour, which the rim and the ticks share. @default "cobalt" */
  accent?: TeaserAccent;
  /** The plan the viewer is on, in the lock badge. @default "Free plan" */
  plan?: string;
  /** The unlock button's text. @default "Unlock Forecasting" */
  unlockLabel?: string;
  /** Whether the report has arrived. @default "ready" */
  status?: TeaserStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Forecasting" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the report takes what the header, the chips and the card leave. @default 540 */
  height?: number;
  /** Read only: the lens does not move and nothing unlocks. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Coldbrook Analytics' bookings forecast: six months booked, three ahead. */
export const defaultTeaserReport: TeaserReport = {
  title: "Bookings forecast",
  metric: "Confirmed bookings per month",
  series: [
    { month: "Apr", value: 962, kind: "actual" },
    { month: "May", value: 1004, kind: "actual" },
    { month: "Jun", value: 1088, kind: "actual" },
    { month: "Jul", value: 1131, kind: "actual" },
    { month: "Aug", value: 1176, kind: "actual" },
    { month: "Sep", value: 1209, kind: "actual" },
    { month: "Oct", value: 1284, kind: "forecast", low: 1210, high: 1352 },
    { month: "Nov", value: 1318, kind: "forecast", low: 1222, high: 1410 },
    { month: "Dec", value: 1308, kind: "forecast", low: 1190, high: 1426 },
  ],
  regions: [
    { id: "north", name: "North Basin", actual: 412, forecast: 441 },
    { id: "fernmoor", name: "Fernmoor", actual: 298, forecast: 322 },
    { id: "harbour", name: "Harbour", actual: 236, forecast: 247 },
    { id: "ridgeway", name: "Ridgeway", actual: 171, forecast: 183 },
    { id: "lowfield", name: "Lowfield", actual: 92, forecast: 91 },
  ],
  confidence: 0.82,
};

export const defaultTeaserFeatures: TeaserFeature[] = [
  {
    id: "next",
    label: "Next month's number",
    detail: "October's bookings, with the change on September.",
    anchor: "next-month",
  },
  {
    id: "outlook",
    label: "Three-month outlook",
    detail: "The dashed line and its band, a quarter ahead.",
    anchor: "outlook",
  },
  {
    id: "confidence",
    label: "Confidence score",
    detail: "How sure the model is, refreshed nightly.",
    anchor: "confidence",
  },
  {
    id: "regions",
    label: "Region breakdown",
    detail: "Every region's forecast beside its actual.",
    anchor: "regions",
  },
];

export const defaultTeaserSpots: TeaserSpot[] = [
  { id: "see-next", label: "See next month", feature: "next" },
  { id: "three-out", label: "Three months out", feature: "outlook" },
  { id: "how-sure", label: "How sure is it", feature: "confidence" },
  { id: "compare", label: "Compare regions", feature: "regions" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<TeaserAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink-2)",
};

/** The rim's softness: the frost thins over this many px around the lens. */
const FEATHER = 14;
/** How far an arrow moves the lens, as a fraction of the report. */
const STEP = 0.05;
const BIG_STEP = 0.2;
/** How far outside a part the lens's centre may be and still count as over it. */
const REACH = 0.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));
const noopSubscribe = () => () => {};

/** 1284 to "1,284" the same way on the server and the client. */
const thousands = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const signed = (ratio: number) =>
  `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(1)}%`;

type Rect = { x: number; y: number; w: number; h: number };

/** What the tiles and the table say, read off the report. */
const digest = (report: TeaserReport) => {
  const actual = report.series.filter((p) => p.kind === "actual");
  const forecast = report.series.filter((p) => p.kind === "forecast");
  const last = actual[actual.length - 1]?.value ?? 0;
  const next = forecast[0]?.value ?? 0;
  const quarter = forecast.slice(0, 3).reduce((a, p) => a + p.value, 0);
  return {
    last,
    next,
    nextMonth: forecast[0]?.month ?? "",
    lastMonth: actual[actual.length - 1]?.month ?? "",
    change: last > 0 ? next / last - 1 : 0,
    quarter,
    quarterMonths: forecast.slice(0, 3).map((p) => p.month),
    forecastStart: actual.length,
  };
};

/* ----------------------------------------------------------------------- */
/*                                  Chart                                   */
/* ----------------------------------------------------------------------- */

const PAD = { l: 6, r: 8, t: 10, b: 16 };

function Chart({
  series,
  width,
  height,
  draw,
  motionSafe,
}: {
  series: TeaserPoint[];
  width: number;
  height: number;
  /** Draw the lines in when they mount. */
  draw: boolean;
  motionSafe: boolean;
}) {
  const n = series.length;
  if (n < 2 || width < 40 || height < 40) return null;
  const innerW = width - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of series) {
    lo = Math.min(lo, p.low ?? p.value);
    hi = Math.max(hi, p.high ?? p.value);
  }
  const span = Math.max(1, hi - lo);
  lo -= span * 0.18;
  hi += span * 0.1;
  const x = (i: number) => r3(PAD.l + (i * innerW) / (n - 1));
  const y = (v: number) => r3(PAD.t + innerH - ((v - lo) / (hi - lo)) * innerH);

  const firstForecast = series.findIndex((p) => p.kind === "forecast");
  const split = firstForecast === -1 ? n - 1 : firstForecast - 1;
  const actualPts = series.slice(0, split + 1);
  const forecastPts = series.slice(Math.max(0, split));

  const path = (pts: TeaserPoint[], offset: number) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(offset + i)} ${y(p.value)}`)
      .join(" ");
  const actualD = path(actualPts, 0);
  const forecastD = path(forecastPts, Math.max(0, split));

  const bandPts = forecastPts.filter((p) => p.low !== undefined);
  const band =
    bandPts.length > 0 && firstForecast !== -1
      ? [
          `${x(split)},${y(series[split]?.value ?? 0)}`,
          ...forecastPts
            .slice(1)
            .map((p, i) => `${x(split + 1 + i)},${y(p.high ?? p.value)}`),
          ...forecastPts
            .slice(1)
            .reverse()
            .map((p, i) => {
              const idx = split + forecastPts.length - 1 - i;
              return `${x(idx)},${y(p.low ?? p.value)}`;
            }),
        ].join(" ")
      : null;

  const every = n > 9 ? 2 : 1;
  const grid = [0.25, 0.5, 0.75].map((f) => r3(PAD.t + innerH * f));
  const lineT: Transition = motionSafe
    ? { ...springs.drift, delay: 0 }
    : { duration: 0 };
  const fadeT: Transition = motionSafe
    ? { duration: durations.slow, ease: easings.enter, delay: durations.base }
    : { duration: 0 };

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="absolute inset-0 block"
    >
      {grid.map((gy) => (
        <line
          key={gy}
          x1={PAD.l}
          x2={width - PAD.r}
          y1={gy}
          y2={gy}
          stroke="var(--hairline-strong)"
          strokeWidth={1}
        />
      ))}
      {firstForecast !== -1 ? (
        <line
          x1={x(split)}
          x2={x(split)}
          y1={PAD.t}
          y2={PAD.t + innerH}
          stroke="var(--hairline-strong)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      ) : null}
      {band ? (
        <motion.polygon
          points={band}
          fill="color-mix(in oklab, var(--tl-accent) 14%, transparent)"
          initial={draw ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={fadeT}
        />
      ) : null}
      <motion.path
        d={actualD}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={lineT}
      />
      {firstForecast !== -1 ? (
        <motion.path
          d={forecastD}
          fill="none"
          stroke="var(--tl-accent)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 4"
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe ? { ...springs.drift, delay: 0.18 } : { duration: 0 }
          }
        />
      ) : null}
      {series.map((p, i) => {
        if (p.kind !== "forecast" && i !== split) return null;
        return (
          <motion.circle
            key={p.month + i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === split ? 2.4 : 2.8}
            fill={i === split ? "var(--ink)" : "var(--tl-accent)"}
            initial={draw ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={fadeT}
          />
        );
      })}
      {series.map((p, i) =>
        i % every === 0 || i === n - 1 ? (
          <text
            key={`m-${p.month}-${i}`}
            x={x(i)}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill={p.kind === "forecast" ? "var(--tl-accent)" : "var(--ink-3)"}
          >
            {p.month}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Report                                   */
/* ----------------------------------------------------------------------- */

type ReportProps = {
  report: TeaserReport;
  /** Measured by the sharp copy; the frosted copy draws to the same size. */
  chartSize: { w: number; h: number } | null;
  chartRef?: (node: HTMLDivElement | null) => void;
  draw: boolean;
  motionSafe: boolean;
};

function Tile({
  anchor,
  label,
  value,
  sub,
  tone,
}: {
  anchor: TeaserAnchor;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div
      data-anchor={anchor}
      className="flex min-w-0 flex-col gap-0.5 rounded-2 border border-hairline bg-surface-0 px-2.5 py-2"
    >
      <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-[15px] text-foreground tabular-nums">
          {value}
        </span>
        {sub ? (
          <span
            className={cn(
              "truncate font-mono text-[10px] tabular-nums",
              tone === "success"
                ? "text-success"
                : tone === "danger"
                  ? "text-danger"
                  : "text-ink-3",
            )}
          >
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Report({
  report,
  chartSize,
  chartRef,
  draw,
  motionSafe,
}: ReportProps) {
  const d = digest(report);
  const n = report.series.length;
  const splitPct =
    n > 1 ? (Math.max(0, d.forecastStart - 1) / (n - 1)) * 100 : 0;
  const step = cascade(report.regions.length);

  return (
    <div className="flex h-full w-full flex-col gap-2.5 p-3 @min-[30rem]:p-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {report.title}
          </p>
          <p className="truncate text-[11px] text-ink-3">{report.metric}</p>
        </div>
        <p
          aria-hidden
          className="hidden shrink-0 items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:flex"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 bg-ink" />
            Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 border-t border-dashed border-(--tl-accent)" />
            Forecast
          </span>
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2">
        <Tile
          anchor="next-month"
          label={d.nextMonth ? `${d.nextMonth} forecast` : "Next month"}
          value={thousands(d.next)}
          sub={signed(d.change)}
          tone={d.change >= 0 ? "success" : "danger"}
        />
        <Tile
          anchor="quarter"
          label="Quarter"
          value={thousands(d.quarter)}
          sub={d.quarterMonths.length ? d.quarterMonths.join("-") : undefined}
        />
        <Tile
          anchor="confidence"
          label="Confidence"
          value={`${Math.round(report.confidence * 100)}%`}
          sub={
            report.confidence >= 0.75
              ? "high"
              : report.confidence >= 0.5
                ? "fair"
                : "low"
          }
        />
      </div>

      <div ref={chartRef} className="relative min-h-[72px] flex-1">
        {chartSize ? (
          <Chart
            series={report.series}
            width={chartSize.w}
            height={chartSize.h}
            draw={draw}
            motionSafe={motionSafe}
          />
        ) : null}
        <div
          data-anchor="outlook"
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ left: `${r3(splitPct)}%` }}
        />
      </div>

      <div data-anchor="regions" className="shrink-0">
        <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] items-center gap-x-2 border-b border-hairline pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[26rem]:grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_3.5rem]">
          <span>Region</span>
          <span className="hidden text-right @min-[26rem]:block">
            {d.lastMonth || "Actual"}
          </span>
          <span className="text-right text-(--tl-accent)">
            {d.nextMonth || "Forecast"}
          </span>
          <span className="text-right">Change</span>
        </div>
        {report.regions.map((region, i) => {
          const change =
            region.actual > 0 ? region.forecast / region.actual - 1 : 0;
          return (
            <motion.div
              key={region.id}
              initial={
                draw && motionSafe ? { opacity: 0, y: distances.nudge } : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: r3(0.2 + i * step) }
                  : { duration: 0 }
              }
              className="grid h-6 grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] items-center gap-x-2 border-b border-hairline text-[11px] last:border-b-0 @min-[26rem]:grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_3.5rem]"
            >
              <span className="truncate text-foreground">{region.name}</span>
              <span className="hidden text-right font-mono text-ink-2 tabular-nums @min-[26rem]:block">
                {thousands(region.actual)}
              </span>
              <span className="text-right font-mono text-foreground tabular-nums">
                {thousands(region.forecast)}
              </span>
              <span
                className={cn(
                  "text-right font-mono text-[10px] tabular-nums",
                  change >= 0 ? "text-success" : "text-danger",
                )}
              >
                {signed(change)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Feature row                                */
/* ----------------------------------------------------------------------- */

function Tick({
  seen,
  motionSafe,
  unlocked,
}: {
  seen: boolean;
  motionSafe: boolean;
  /** All ticks land together when the frost lifts. */
  unlocked: boolean;
}) {
  const on = seen || unlocked;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        on
          ? "border-(--tl-accent) bg-[color-mix(in_oklab,var(--tl-accent)_16%,transparent)] text-(--tl-accent)"
          : "border-hairline-strong text-transparent",
      )}
    >
      {on ? (
        <svg viewBox="0 0 14 14" className="size-2.5">
          <motion.path
            d="M3 7.4 5.8 10 11 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A locked-feature teaser with a lens. The report sits under a frost: a
 * blurred copy of itself masked by a circle the pointer carries, so the chart
 * and the table are sharp inside the lens only, with a soft rim where the
 * frost thins. The lens follows the pointer directly; the spot chips send it
 * gliding to a feature on `springs.glide`, and arrows nudge it on
 * `springs.snap`. The card beside the report lists what the plan unlocks,
 * and each tick draws on `springs.flick` the first time the lens passes over
 * that part of the report, so the viewer earns the list by looking.
 *
 * Unlock lifts the frost from the lens outward: the mask's circle grows on
 * `springs.glide` until it clears the frame, the rim fades, the lock badge
 * leaves on the exit ease and an unlocked mark lands on `springs.recoil`.
 *
 * The lens is a two-dimensional slider: arrows move it, Shift+arrows move
 * it further, Home centres it and End takes it to the next feature not yet
 * seen; its value text says where it is and what it is over. Under reduced
 * motion the lens is placed instantly and the frost cross-fades away.
 */
export function TeaserLens({
  report = defaultTeaserReport,
  features = defaultTeaserFeatures,
  spots = defaultTeaserSpots,
  locked,
  defaultLocked = true,
  onUnlock,
  onFeatureSeen,
  lensRadius = 110,
  frost = 6,
  accent = "cobalt",
  plan = "Free plan",
  unlockLabel = "Unlock Forecasting",
  status = "ready",
  onRetry,
  title = "Forecasting",
  label,
  height = 540,
  disabled = false,
  className,
}: TeaserLensProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cardId = `${uid}-card`;
  const hintId = `${uid}-hint`;

  const [ownLocked, setOwnLocked] = React.useState(defaultLocked);
  const isLocked = locked ?? ownLocked;
  const ready = status === "ready";
  const hasData = report.series.length > 1;
  const inert = disabled || !ready;

  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [chartSize, setChartSize] = React.useState<{
    w: number;
    h: number;
  } | null>(null);
  const [pos, setPos] = React.useState<TeaserPosition>({ x: 0.5, y: 0.5 });
  const [over, setOver] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState<string[]>([]);
  const [lifting, setLifting] = React.useState(false);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, true for anything that
  // mounts later, so the chart only draws itself in on a live load.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const sharpRef = React.useRef<HTMLDivElement | null>(null);
  const [chartEl, setChartEl] = React.useState<HTMLDivElement | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const sizeRef = React.useRef(size);
  const posRef = React.useRef<TeaserPosition>({ x: 0.5, y: 0.5 });
  const placedRef = React.useRef(false);
  const anchorsRef = React.useRef(new Map<TeaserAnchor, Rect>());
  const seenRef = React.useRef<string[]>([]);
  const overRef = React.useRef<string | null>(null);
  const dragRef = React.useRef<number | null>(null);
  const liftedRef = React.useRef(isLocked);

  // A lock change is noticed in render: relocking clears the list of seen
  // features, unlocking keeps the frost mounted while it lifts.
  const [prevLocked, setPrevLocked] = React.useState(isLocked);
  if (prevLocked !== isLocked) {
    setPrevLocked(isLocked);
    if (isLocked) {
      setSeen([]);
      setLifting(false);
    } else if (motionSafe && size) {
      setLifting(true);
    }
  }

  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const lr = useMotionValue(lensRadius);
  const rIn = useTransform(lr, (r) => Math.max(0, r - FEATHER / 2));
  const rOut = useTransform(lr, (r) => r + FEATHER / 2);
  const mask = useMotionTemplate`radial-gradient(circle at ${lx}px ${ly}px, transparent ${rIn}px, black ${rOut}px)`;
  const rimX = useTransform(
    [lx, lr],
    ([x, r]: number[]) => (x ?? 0) - (r ?? 0),
  );
  const rimY = useTransform(
    [ly, lr],
    ([y, r]: number[]) => (y ?? 0) - (r ?? 0),
  );
  const rimD = useTransform(lr, (r) => r * 2);

  const byId = React.useMemo(
    () => new Map(features.map((f) => [f.id, f])),
    [features],
  );
  const featuresRef = React.useRef(features);
  const lockedRef = React.useRef(isLocked);
  const onSeenRef = React.useRef(onFeatureSeen);
  React.useEffect(() => {
    featuresRef.current = features;
    lockedRef.current = isLocked;
    onSeenRef.current = onFeatureSeen;
    seenRef.current = seen;
  });

  const lensActive = isLocked && ready && hasData && !disabled && !lifting;

  /* ------------------------------ geometry ----------------------------- */

  /**
   * Which part of the report the lens's centre is over: the nearest one, and
   * only within half a radius of it, so a lens parked between two tiles
   * counts for one of them, never both.
   */
  const check = React.useCallback(() => {
    const x = lx.get();
    const y = ly.get();
    const reach = lr.get() * REACH;
    const anchors = anchorsRef.current;
    let first: TeaserFeature | null = null;
    let nearest = Infinity;
    for (const f of featuresRef.current) {
      const a = anchors.get(f.anchor);
      if (!a) continue;
      const dx = Math.max(a.x - x, 0, x - (a.x + a.w));
      const dy = Math.max(a.y - y, 0, y - (a.y + a.h));
      const d = Math.hypot(dx, dy);
      if (d <= reach && d < nearest) {
        nearest = d;
        first = f;
      }
    }
    const overId = first?.id ?? null;
    if (overId === overRef.current) return;
    overRef.current = overId;
    setOver(overId);
    if (!lockedRef.current || !first) return;
    if (seenRef.current.includes(first.id)) {
      setAnnouncement(`Lens over ${first.label}.`);
      return;
    }
    const next = [...seenRef.current, first.id];
    seenRef.current = next;
    setSeen(next);
    setAnnouncement(
      `Lens over ${first.label}. ${next.length} of ${featuresRef.current.length} seen.`,
    );
    onSeenRef.current?.(first, next);
  }, [lx, ly, lr]);

  useMotionValueEvent(lx, "change", check);
  useMotionValueEvent(ly, "change", check);

  /** Puts the lens at a fraction of the report: at once, or on a spring. */
  const place = React.useCallback(
    (at: TeaserPosition, how: "set" | Transition) => {
      const next = { x: clamp(at.x, 0, 1), y: clamp(at.y, 0, 1) };
      posRef.current = next;
      const s = sizeRef.current;
      if (!s) return;
      const px = r3(next.x * s.w);
      const py = r3(next.y * s.h);
      lx.stop();
      ly.stop();
      if (how === "set" || !motionSafe) {
        lx.set(px);
        ly.set(py);
      } else {
        animate(lx, px, how);
        animate(ly, py, how);
      }
    },
    [lx, ly, motionSafe],
  );

  // One observer sizes the stage; the lens keeps its place as a fraction.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = {
        w: Math.round(stage.clientWidth),
        h: Math.round(stage.clientHeight),
      };
      sizeRef.current = next;
      setSize((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ready, hasData]);

  React.useEffect(() => {
    if (!chartEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = {
        w: Math.round(chartEl.clientWidth),
        h: Math.round(chartEl.clientHeight),
      };
      setChartSize((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    });
    ro.observe(chartEl);
    return () => ro.disconnect();
  }, [chartEl]);

  // The parts of the report are measured after every size change, and the
  // lens starts over the first spot's feature.
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    const sharp = sharpRef.current;
    if (!stage || !sharp || !size) return;
    const sr = stage.getBoundingClientRect();
    const map = new Map<TeaserAnchor, Rect>();
    for (const node of sharp.querySelectorAll<HTMLElement>("[data-anchor]")) {
      const a = node.dataset.anchor as TeaserAnchor | undefined;
      if (!a) continue;
      const r = node.getBoundingClientRect();
      map.set(a, {
        x: r.left - sr.left,
        y: r.top - sr.top,
        w: r.width,
        h: r.height,
      });
    }
    anchorsRef.current = map;
    if (!placedRef.current) {
      placedRef.current = true;
      const firstSpot = spots[0];
      const feature = firstSpot ? byId.get(firstSpot.feature) : undefined;
      const a = feature ? map.get(feature.anchor) : undefined;
      const start = a
        ? { x: (a.x + a.w / 2) / size.w, y: (a.y + a.h / 2) / size.h }
        : { x: 0.5, y: 0.5 };
      setPos(start);
      place(start, "set");
    } else {
      place(posRef.current, "set");
    }
    check();
  }, [size, chartSize, spots, byId, place, check]);

  /* ------------------------------ lock state --------------------------- */

  const cover = () => {
    const s = sizeRef.current;
    if (!s) return 0;
    const x = lx.get();
    const y = ly.get();
    return Math.hypot(Math.max(x, s.w - x), Math.max(y, s.h - y)) + FEATHER;
  };

  // Unlocking opens the mask from the lens outward until it clears the frame;
  // locking again puts the frost back around a lens of the asked size.
  React.useEffect(() => {
    const was = liftedRef.current;
    liftedRef.current = isLocked;
    if (was === isLocked) return;
    if (isLocked) {
      seenRef.current = [];
      lr.set(lensRadius);
      return;
    }
    if (!motionSafe || !sizeRef.current) return;
    const controls = animate(lr, cover(), {
      ...springs.glide,
      onComplete: () => setLifting(false),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

  React.useEffect(() => {
    if (!isLocked || lifting) return;
    if (lr.get() === lensRadius) return;
    const controls = animate(
      lr,
      lensRadius,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => controls.stop();
  }, [lensRadius, isLocked, lifting, motionSafe, lr]);

  // A lens that is wider now may already be over a part.
  useMotionValueEvent(lr, "change", check);

  const unlock = () => {
    if (inert || !isLocked) return;
    if (locked === undefined) setOwnLocked(false);
    onUnlock?.();
    setAnnouncement(`${title} unlocked. The report is clear.`);
  };

  /* ------------------------------- moving ------------------------------ */

  const centreOf = (featureId: string): TeaserPosition | null => {
    const f = byId.get(featureId);
    const a = f ? anchorsRef.current.get(f.anchor) : undefined;
    const s = sizeRef.current;
    if (!a || !s) return null;
    return { x: (a.x + a.w / 2) / s.w, y: (a.y + a.h / 2) / s.h };
  };

  const goTo = (featureId: string, how: Transition) => {
    const at = centreOf(featureId);
    const f = byId.get(featureId);
    if (!at || !f) return;
    if (overRef.current === f.id)
      setAnnouncement(`Lens already over ${f.label}.`);
    setPos(at);
    place(at, how);
  };

  const nudge = (dx: number, dy: number) => {
    const at = {
      x: clamp(posRef.current.x + dx, 0, 1),
      y: clamp(posRef.current.y + dy, 0, 1),
    };
    setPos(at);
    place(at, springs.snap);
  };

  const onStageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!lensActive) return;
    const step = event.shiftKey ? BIG_STEP : STEP;
    switch (event.key) {
      case "ArrowLeft":
        nudge(-step, 0);
        break;
      case "ArrowRight":
        nudge(step, 0);
        break;
      case "ArrowUp":
        nudge(0, -step);
        break;
      case "ArrowDown":
        nudge(0, step);
        break;
      case "Home": {
        const at = { x: 0.5, y: 0.5 };
        setPos(at);
        place(at, springs.glide);
        setAnnouncement("Lens centred.");
        break;
      }
      case "End": {
        const next = features.find((f) => !seen.includes(f.id)) ?? features[0];
        if (next) goTo(next.id, springs.glide);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const localPoint = (event: React.PointerEvent): TeaserPosition => {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      x: r.width > 0 ? clamp((event.clientX - r.left) / r.width, 0, 1) : 0.5,
      y: r.height > 0 ? clamp((event.clientY - r.top) / r.height, 0, 1) : 0.5,
    };
  };

  const onStageMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!lensActive) return;
    if (event.pointerType !== "mouse" && dragRef.current === null) return;
    place(localPoint(event), "set");
  };

  const onStageDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!lensActive || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture; the lens still tracks.
    }
    dragRef.current = event.pointerId;
    place(localPoint(event), "set");
  };

  const onStageUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured, or nothing to release.
    }
    dragRef.current = null;
    setPos(posRef.current);
  };

  const onStageLeave = () => {
    if (dragRef.current !== null) return;
    setPos(posRef.current);
  };

  /* ------------------------------- chips ------------------------------- */

  const chipKeys = spots.map((s) => s.id);
  const activeChipId =
    activeChip && chipKeys.includes(activeChip)
      ? activeChip
      : (chipKeys[0] ?? null);

  const onChipKey = (event: React.KeyboardEvent, id: string) => {
    const i = chipKeys.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = chipKeys.length - 1;
    else return;
    event.preventDefault();
    const target = chipKeys[clamp(to, 0, chipKeys.length - 1)];
    if (target) chipNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const overFeature = over ? byId.get(over) : undefined;
  const seenCount = features.filter((f) => seen.includes(f.id)).length;
  const valueText = `${Math.round(pos.x * 100)}% across, ${Math.round(pos.y * 100)}% down${
    overFeature ? `, over ${overFeature.label}` : ""
  }`;
  const showFrost = hasData && ready && (isLocked || lifting);
  const chipStep = cascade(spots.length);

  const unlockButton = (
    <button
      type="button"
      onClick={unlock}
      aria-disabled={inert || undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
        inert
          ? "cursor-not-allowed bg-surface-2 text-ink-3"
          : "bg-primary text-primary-foreground hover:bg-cobalt-bright",
        FOCUS_RING,
      )}
    >
      <Sparkles aria-hidden className="size-3.5" />
      {unlockLabel}
    </button>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--tl-accent" as string]: ACCENTS[accent] ?? ACCENTS.cobalt,
      }}
    >
      <p id={hintId} className="sr-only">
        Arrows move the lens, Shift and arrows move it further, Home centres it,
        End goes to the next feature not yet seen.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {ready && hasData
              ? isLocked
                ? "Look around the report, then unlock it."
                : "On your plan."
              : status === "loading"
                ? "Loading the report"
                : status === "error"
                  ? "The report did not load"
                  : "Nothing to forecast yet"}
          </p>
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {isLocked ? (
            <motion.span
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.step : 0,
                transition: exitFor(durations.base),
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 font-mono text-[10px] tracking-[0.08em] text-warn uppercase"
            >
              <Lock aria-hidden className="size-3" />
              <span>
                Locked
                <span className="hidden @min-[30rem]:inline">
                  {" "}
                  &middot; {plan}
                </span>
              </span>
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={motionSafe ? { opacity: 0, scale: 0.7 } : { opacity: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
            >
              <LockOpen aria-hidden className="size-3" />
              Unlocked
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      {status === "loading" ? (
        <div
          aria-hidden
          className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 @min-[40rem]:flex-row"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: 84 + ((i * 29) % 40),
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-3 border border-hairline p-3">
              <span className="h-4 w-40 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    className="h-12 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
              <span className="min-h-[72px] flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className="h-5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 110}ms` }}
                />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 @min-[40rem]:w-[15rem]">
            <span className="h-4 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The report didn&apos;t load.
          </p>
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
          {/* ------------------------- report side ------------------------ */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative shrink-0 px-4 pb-2.5">
              <AnimatePresence initial={false} mode="wait">
                {isLocked && hasData ? (
                  <motion.div
                    key="chips"
                    role="toolbar"
                    aria-label="Spots to look at"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {spots.map((spot, i) => {
                      const feature = byId.get(spot.feature);
                      const done = feature ? seen.includes(feature.id) : false;
                      const current = feature ? over === feature.id : false;
                      return (
                        <motion.button
                          key={spot.id}
                          ref={(node) => {
                            if (node) chipNodes.current.set(spot.id, node);
                            else chipNodes.current.delete(spot.id);
                          }}
                          type="button"
                          tabIndex={activeChipId === spot.id ? 0 : -1}
                          aria-pressed={current}
                          aria-disabled={!lensActive || undefined}
                          onFocus={() => setActiveChip(spot.id)}
                          onKeyDown={(event) => onChipKey(event, spot.id)}
                          onClick={() => {
                            if (!lensActive) return;
                            goTo(spot.feature, springs.glide);
                          }}
                          initial={
                            live && motionSafe
                              ? { opacity: 0, y: distances.nudge }
                              : false
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            ...springs.glide,
                            delay: r3(i * chipStep),
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }}
                          className={cn(
                            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                            current
                              ? "border-(--tl-accent) bg-[color-mix(in_oklab,var(--tl-accent)_14%,transparent)] text-foreground"
                              : done
                                ? "border-hairline bg-surface-2 text-ink-2 hover:text-foreground"
                                : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-foreground",
                            !lensActive && "cursor-not-allowed",
                            FOCUS_RING,
                          )}
                        >
                          {done ? (
                            <Tick
                              seen
                              unlocked={false}
                              motionSafe={motionSafe}
                            />
                          ) : (
                            <Crosshair
                              aria-hidden
                              className="size-3.5 text-ink-3"
                            />
                          )}
                          {spot.label}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.p
                    key="clear"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className="flex h-7 items-center gap-1.5 text-xs text-ink-2"
                  >
                    {hasData ? (
                      <>
                        <CircleCheck
                          aria-hidden
                          className="size-3.5 text-success"
                        />
                        The whole report, no lens needed.
                      </>
                    ) : (
                      <span className="text-ink-3">
                        A forecast needs two months of bookings.
                      </span>
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="min-h-0 flex-1 px-4 pb-4">
              {!hasData ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 text-center">
                  <Inbox aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-ink-2">No forecast yet.</p>
                  <p className="text-[11px] text-ink-3">
                    It arrives after the first full month of bookings.
                  </p>
                </div>
              ) : (
                <div
                  ref={stageRef}
                  role={lensActive ? "slider" : undefined}
                  tabIndex={lensActive ? 0 : -1}
                  aria-label={lensActive ? "Lens" : undefined}
                  aria-describedby={lensActive ? hintId : undefined}
                  aria-valuemin={lensActive ? 0 : undefined}
                  aria-valuemax={lensActive ? 100 : undefined}
                  aria-valuenow={
                    lensActive ? Math.round(pos.x * 100) : undefined
                  }
                  aria-valuetext={lensActive ? valueText : undefined}
                  onKeyDown={onStageKey}
                  onPointerMove={onStageMove}
                  onPointerDown={onStageDown}
                  onPointerUp={onStageUp}
                  onPointerCancel={onStageUp}
                  onPointerLeave={onStageLeave}
                  className={cn(
                    "relative h-full w-full overflow-hidden rounded-3 border border-hairline bg-surface-1 select-none",
                    lensActive && "cursor-crosshair",
                    FOCUS_RING,
                  )}
                  style={{ touchAction: lensActive ? "none" : undefined }}
                >
                  {/* The sharp report. Behind the frost it is scenery, so it
                      is hidden from readers until it unlocks. */}
                  <div
                    ref={sharpRef}
                    aria-hidden={isLocked || undefined}
                    className="absolute inset-0"
                  >
                    <Report
                      report={report}
                      chartSize={chartSize}
                      chartRef={setChartEl}
                      draw={live}
                      motionSafe={motionSafe}
                    />
                  </div>

                  <AnimatePresence initial={false}>
                    {showFrost ? (
                      <motion.div
                        key="frost"
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(
                            motionSafe ? durations.fast : durations.slow,
                          ),
                        }}
                        transition={{
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                        className="pointer-events-none absolute inset-0"
                        style={{ maskImage: mask, WebkitMaskImage: mask }}
                      >
                        <div
                          className="absolute inset-0 scale-[1.02]"
                          style={{ filter: `blur(${Math.max(0, frost)}px)` }}
                        >
                          <Report
                            report={report}
                            chartSize={chartSize}
                            draw={false}
                            motionSafe={false}
                          />
                        </div>
                        <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg-1)_58%,transparent)]" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {isLocked && ready ? (
                      <motion.div
                        key="rim"
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.base),
                        }}
                        transition={{
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                        className="pointer-events-none absolute top-0 left-0 rounded-full border border-[color-mix(in_oklab,var(--tl-accent)_70%,transparent)] shadow-[0_0_0_6px_color-mix(in_oklab,var(--tl-accent)_10%,transparent),0_18px_40px_-18px_color-mix(in_oklab,var(--bg-0)_90%,transparent)]"
                        style={{ x: rimX, y: rimY, width: rimD, height: rimD }}
                      >
                        <span className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-(--tl-accent) opacity-60" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* --------------------------- the card ------------------------- */}
          <aside
            aria-labelledby={cardId}
            className="flex shrink-0 flex-col gap-2.5 border-t border-hairline px-4 pt-2.5 pb-3 @min-[40rem]:w-[15rem] @min-[40rem]:border-t-0 @min-[40rem]:border-l @min-[40rem]:pt-0 @min-[40rem]:pb-4"
          >
            {/* Below 40rem the chips carry the labels and the ticks, so the
                list is read but not shown and the card is one row. */}
            <div className="hidden items-center justify-between gap-3 @min-[40rem]:flex">
              <p id={cardId} className="text-[13px] font-semibold">
                What unlocks
              </p>
              <p
                aria-hidden
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {isLocked
                  ? `${seenCount} of ${features.length} seen`
                  : "All yours"}
              </p>
            </div>

            <ul
              role="list"
              aria-label="Features"
              className="sr-only @min-[40rem]:not-sr-only @min-[40rem]:flex @min-[40rem]:min-h-0 @min-[40rem]:flex-1 @min-[40rem]:flex-col @min-[40rem]:gap-2 @min-[40rem]:overflow-y-auto"
            >
              {features.map((feature) => {
                const isSeen = seen.includes(feature.id);
                const current = over === feature.id && isLocked;
                return (
                  <li
                    key={feature.id}
                    className={cn(
                      "flex items-start gap-2 rounded-2 border px-2 py-1.5 transition-colors",
                      current
                        ? "border-[color-mix(in_oklab,var(--tl-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--tl-accent)_10%,transparent)]"
                        : "border-transparent",
                    )}
                  >
                    <span className="mt-px">
                      <Tick
                        seen={isSeen}
                        unlocked={!isLocked}
                        motionSafe={motionSafe}
                      />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[12px] leading-4 transition-colors duration-200",
                          isSeen || !isLocked
                            ? "text-foreground"
                            : "text-ink-2",
                        )}
                      >
                        {feature.label}
                        {isSeen && isLocked ? (
                          <span className="sr-only">, seen</span>
                        ) : null}
                      </span>
                      {feature.detail ? (
                        <span className="hidden text-[11px] leading-4 text-ink-3 @min-[40rem]:block">
                          {feature.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex shrink-0 items-center justify-between gap-3 @min-[40rem]:flex-col @min-[40rem]:items-stretch">
              <AnimatePresence initial={false} mode="popLayout">
                {isLocked ? (
                  <motion.div
                    key="cta"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 @min-[40rem]:flex-col @min-[40rem]:items-stretch @min-[40rem]:gap-2"
                  >
                    <p className="hidden text-[11px] text-ink-3 @min-[40rem]:block">
                      {plan} shows the lens. The plan above shows it all.
                    </p>
                    <p
                      aria-hidden
                      className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:hidden"
                    >
                      {seenCount} of {features.length} seen
                    </p>
                    {unlockButton}
                  </motion.div>
                ) : (
                  <motion.p
                    key="done"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            delay: durations.base,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    className="flex h-8 items-center gap-1.5 text-xs text-success"
                  >
                    <CircleCheck aria-hidden className="size-4" />
                    {title} is on your plan.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
