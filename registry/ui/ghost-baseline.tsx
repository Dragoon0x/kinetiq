"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, History, RotateCcw, TriangleAlert } from "lucide-react";

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

/** The colour a ghost is drawn in, from the ink and status tokens. */
export type GhostTone = "ink" | "muted" | "warn" | "success" | "danger";

/** One comparison series, aligned hour for hour with today's. */
export type GhostBaselineSeries = {
  id: string;
  /** Legend name, e.g. "Same day last week". */
  label: string;
  /** Short form for the readout and narrow legends, e.g. "Last week". */
  short: string;
  /** One value per hour, in the same order as today's. */
  values: number[];
  /** The ghost's colour; ghosts tell apart by tone, today by accent. @default "ink" */
  tone?: GhostTone;
};

export type GhostChange = { id: string; enabled: boolean };
export type GhostStyle = "line" | "area" | "dots";
export type GhostCurve = "smooth" | "step";
export type GhostAccent = "cobalt" | "signal" | "success";
export type GhostStatus = "ready" | "loading" | "error";

/** Which way an anomalous hour departs from the enabled ghosts. */
export type GhostDeparture = "above" | "below" | "apart";

/** The comparison under the crosshair, as the readout and the slider say it. */
export type GhostReading = {
  index: number;
  label: string;
  /** Null for an hour today has not reached. */
  today: number | null;
  ghosts: {
    id: string;
    short: string;
    value: number;
    /** Today minus the ghost; null when today has no value yet. */
    delta: number | null;
    /** The delta as a percentage of the ghost. */
    percent: number | null;
  }[];
  departure: GhostDeparture | null;
};

export type GhostBaselineProps = {
  /** How a ghost is drawn: a translucent line, a line with a faint fill, or one dot per hour. @default "line" */
  ghostStyle?: GhostStyle;
  /** The line's shape: a smooth curve through the hours, or steps that hold each hour's value. @default "smooth" */
  curve?: GhostCurve;
  /** Today's colour: cobalt, the signal tone, or green. The highlight band takes it too. @default "cobalt" */
  accent?: GhostAccent;
  /** Today's series, one value per hour from the first label; it may stop short of the baselines. @default defaultGhostToday */
  today?: number[];
  /** The comparison series, keyed by id, in legend order. @default defaultGhostBaselines */
  baselines?: Record<string, GhostBaselineSeries>;
  /** The hour labels, one per index; the longest series sets how many are used. @default defaultGhostLabels */
  labels?: string[];
  /** Controlled: the ids of the ghosts shown. */
  value?: string[];
  /** Initial ghosts shown when uncontrolled. @default ["lastWeek"] */
  defaultValue?: string[];
  /** Fires from the switch that showed or hid a ghost, with the whole set. */
  onChange?: (value: string[], change: GhostChange) => void;
  /** Controlled: how far today may stray from every ghost, in percent, before an hour is an anomaly. */
  tolerance?: number;
  /** Initial tolerance when uncontrolled. @default 12 */
  defaultTolerance?: number;
  /** Fires from the slider that moved the tolerance. */
  onToleranceChange?: (tolerance: number) => void;
  /** The slider's range and step, in percent. @default { min: 2, max: 40, step: 1 } */
  toleranceRange?: { min: number; max: number; step: number };
  /** The hour under the crosshair changed, or null when it cleared. */
  onScrub?: (index: number | null) => void;
  /** Formats every value the chart prints or speaks. @default rounded, with thousands separators */
  format?: (value: number) => string;
  /** Printed after each formatted value, e.g. "%" or " ms". @default "" */
  unit?: string;
  /** Whether the series have arrived. @default "ready" */
  status?: GhostStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Completed checkouts" */
  title?: string;
  /** Under the heading: what the numbers are. @default "Basinworks checkout, per hour" */
  caption?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the plot takes what the header and legend leave. @default 520 */
  height?: number;
  /** Read only: no ghost or tolerance can change. The readout still scrubs. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A checkout day's shape: quiet overnight, a lunch peak, a bigger one after work. */
const SHAPE = [
  42, 31, 24, 19, 18, 22, 38, 71, 118, 154, 176, 189, 204, 198, 181, 172, 169,
  178, 196, 214, 203, 168, 121, 76,
];

const seeded = (seed: number, scale: number, jitter: number, n = 24) => {
  const rand = mulberry32(seed);
  return SHAPE.slice(0, n).map((v) =>
    Math.round(v * scale * (1 + (rand() * 2 - 1) * jitter)),
  );
};

/** "00:00" through "23:00". */
export const defaultGhostLabels: string[] = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, "0")}:00`,
);

/** Three seeded baselines for Basinworks checkout: last week, last month and the forecast. */
export const defaultGhostBaselines: Record<string, GhostBaselineSeries> = {
  lastWeek: {
    id: "lastWeek",
    label: "Same day last week",
    short: "Last week",
    values: seeded(1654, 0.97, 0.03),
    tone: "ink",
  },
  lastMonth: {
    id: "lastMonth",
    label: "Last month",
    short: "Last month",
    values: seeded(1655, 0.93, 0.04),
    tone: "muted",
  },
  forecast: {
    id: "forecast",
    label: "Forecast",
    short: "Forecast",
    values: seeded(1656, 1.03, 0.015),
    tone: "warn",
  },
};

/**
 * Today up to 17:00: a payment timeout cut 09:00 short and a promo email
 * lifted 14:00, so two hours stray from every baseline at the default tolerance.
 */
export const defaultGhostToday: number[] = (() => {
  const values = seeded(1657, 1.02, 0.02, 18);
  values[8] = Math.round((values[8] ?? 0) * 0.72);
  values[14] = Math.round((values[14] ?? 0) * 1.3);
  return values;
})();

export const defaultGhostValue: string[] = ["lastWeek"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const TONES: Record<GhostTone, string> = {
  ink: "var(--ink)",
  muted: "var(--ink-3)",
  warn: "var(--warn)",
  success: "var(--success)",
  danger: "var(--danger)",
};

const ACCENTS: Record<GhostAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

/** Plot insets: room for the y labels on the left and the hour labels below. */
const PAD = { top: 14, right: 10, bottom: 22, left: 34 } as const;
/** Where a ghost settles after it has drawn in at full strength. */
const GHOST_OPACITY = 0.55;
/** Pointer travel before a press becomes a scrub, so taps still register. */
const DRAG_SLOP = 4;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r3 = (v: number) => Number(v.toFixed(3));
const f1 = (v: number) => v.toFixed(1);
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const defaultFormat = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

type Pt = { x: number; y: number };

/** A line through the points: Catmull-Rom beziers, or mid-hour steps. */
function linePath(pts: Pt[], curve: GhostCurve): string {
  const first = pts[0];
  if (!first) return "";
  let d = `M${f1(first.x)} ${f1(first.y)}`;
  if (pts.length === 1) return d;
  if (curve === "step") {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const mid = (a.x + b.x) / 2;
      d += ` L${f1(mid)} ${f1(a.y)} L${f1(mid)} ${f1(b.y)}`;
    }
    const last = pts[pts.length - 1];
    if (last) d += ` L${f1(last.x)} ${f1(last.y)}`;
    return d;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2.x)} ${f1(p2.y)}`;
  }
  return d;
}

/** Closes a line against a horizontal edge, so it fills to the top or bottom. */
function areaPath(pts: Pt[], curve: GhostCurve, edge: number): string {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return "";
  return `${linePath(pts, curve)} L${f1(last.x)} ${f1(edge)} L${f1(first.x)} ${f1(edge)} Z`;
}

/** A round step for a span of values, aiming at about four gridlines. */
function niceStep(span: number): number {
  const raw = Math.max(span, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/**
 * Border-box size of a node, measured in the observer callback so the first
 * paint is honest without any layout read during render.
 */
function useBoxSize(node: HTMLElement | null) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return size;
}

/**
 * Pointer capture throws when the id is not an active pointer, which is what
 * a synthetic sweep produces. The gesture works without it.
 */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointers have no capture target; the gesture continues.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

const ghostsOf = (
  baselines: Record<string, GhostBaselineSeries>,
  ids: string[],
): GhostBaselineSeries[] =>
  Object.values(baselines).filter((g) => ids.includes(g.id));

/** Which way an hour departs from a set of ghosts, if it is outside every one. */
function departureAt(
  value: number,
  ghosts: GhostBaselineSeries[],
  index: number,
  tolerance: number,
): GhostDeparture | null {
  if (ghosts.length === 0) return null;
  let above = 0;
  let below = 0;
  for (const ghost of ghosts) {
    const base = ghost.values[index];
    if (base === undefined || base === 0) return null;
    if ((Math.abs(value - base) / Math.abs(base)) * 100 <= tolerance) {
      return null;
    }
    if (value > base) above += 1;
    else below += 1;
  }
  return above === ghosts.length
    ? "above"
    : below === ghosts.length
      ? "below"
      : "apart";
}

/**
 * The hours where today departs from every enabled ghost by more than the
 * tolerance, for hosts that count or list them elsewhere.
 */
export function findGhostAnomalies(
  today: number[],
  baselines: Record<string, GhostBaselineSeries>,
  enabled: string[],
  tolerance: number,
): number[] {
  const ghosts = ghostsOf(baselines, enabled);
  const out: number[] = [];
  today.forEach((value, index) => {
    if (departureAt(value, ghosts, index, tolerance)) out.push(index);
  });
  return out;
}

const signed = (v: number, text: string) => `${v < 0 ? "-" : "+"}${text}`;

const DEPARTURE_WORD: Record<GhostDeparture, string> = {
  above: "above every baseline",
  below: "below every baseline",
  apart: "away from every baseline",
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

/** Digits roll on `springs.snap`; signs, separators and units stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        const pos = chars.length - 1 - i;
        if (!/\d/.test(c)) {
          return (
            <span
              key={`s${pos}`}
              className="inline-block"
              style={{ height: `${DIGIT_H}em` }}
            >
              {c}
            </span>
          );
        }
        return (
          <span
            key={`d${pos}`}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Legend switch                              */
/* ----------------------------------------------------------------------- */

function LegendSwitch({
  ghost,
  on,
  tabIndex,
  inert,
  motionSafe,
  nodeRef,
  onToggle,
  onFocus,
  onNav,
}: {
  ghost: GhostBaselineSeries;
  on: boolean;
  tabIndex: number;
  inert: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
}) {
  const tone = TONES[ghost.tone ?? "ink"];
  return (
    <button
      ref={nodeRef}
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={inert || undefined}
      tabIndex={tabIndex}
      onClick={onToggle}
      onFocus={onFocus}
      onKeyDown={onNav}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-2 rounded-full border pr-2.5 pl-1.5 text-xs whitespace-nowrap transition-colors duration-150",
        on
          ? "border-hairline-strong bg-surface-1 text-foreground"
          : "border-hairline text-ink-2",
        inert ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className="relative h-3.5 w-6 shrink-0 rounded-full transition-colors duration-150"
        style={{
          background: on
            ? `color-mix(in oklab, ${tone} ${ghost.tone === "muted" ? 90 : 70}%, var(--bg-1))`
            : "var(--hairline-strong)",
        }}
      >
        <motion.span
          className="absolute top-0.5 left-0 size-2.5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
          initial={false}
          animate={{ x: on ? 12 : 2 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </span>
      <span
        aria-hidden
        className="h-0.5 w-3 shrink-0 rounded-full"
        style={{ background: tone, opacity: on ? GHOST_OPACITY + 0.2 : 0.35 }}
      />
      <span className="hidden @min-[44rem]:inline">{ghost.label}</span>
      <span className="@min-[44rem]:hidden">{ghost.short}</span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Tolerance slider                            */
/* ----------------------------------------------------------------------- */

function ToleranceSlider({
  value,
  min,
  max,
  step,
  inert,
  motionSafe,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  inert: boolean;
  motionSafe: boolean;
  onChange: (next: number) => void;
}) {
  const [track, setTrack] = React.useState<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const snap = (raw: number) =>
    clamp(Math.round((raw - min) / step) * step + min, min, max);

  const fromClientX = (clientX: number): number => {
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snap(min + t * (max - min));
  };

  const set = (next: number) => {
    if (inert || next === value) return;
    onChange(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = snap(value + step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = snap(value - step);
    } else if (event.key === "PageUp") next = snap(value + step * 5);
    else if (event.key === "PageDown") next = snap(value - step * 5);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    set(next);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Tolerance
      </span>
      <div
        ref={setTrack}
        role="slider"
        tabIndex={0}
        aria-label="Anomaly tolerance"
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} percent`}
        aria-disabled={inert || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (inert || event.button !== 0) return;
          event.preventDefault();
          capturePointer(event.currentTarget, event.pointerId);
          setDragging(true);
          set(fromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          set(fromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          releasePointer(event.currentTarget, event.pointerId);
          setDragging(false);
        }}
        onPointerCancel={(event) => {
          releasePointer(event.currentTarget, event.pointerId);
          setDragging(false);
        }}
        className={cn(
          "relative h-6 w-24 touch-none rounded-full",
          inert ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2"
        />
        <motion.span
          aria-hidden
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-(--gb-accent)"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={motionSafe && !dragging ? springs.snap : { duration: 0 }}
        />
        <span aria-hidden className="absolute inset-y-0 right-[7px] left-[7px]">
          <motion.span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--gb-accent) bg-card"
            initial={false}
            animate={{ left: `${pct}%` }}
            transition={
              motionSafe && !dragging ? springs.snap : { duration: 0 }
            }
          />
        </span>
      </div>
      <span className="w-9 font-mono text-[11px] text-foreground tabular-nums">
        <Roll text={`${value}%`} motionSafe={motionSafe} />
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Readout                                 */
/* ----------------------------------------------------------------------- */

function Readout({
  reading,
  parked,
  tolerance,
  format,
  unit,
  motionSafe,
  baselines,
}: {
  reading: GhostReading | null;
  /** True when nothing is under the crosshair and the readout shows the latest hour. */
  parked: boolean;
  tolerance: number;
  format: (v: number) => string;
  unit: string;
  motionSafe: boolean;
  baselines: Record<string, GhostBaselineSeries>;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {parked ? "Latest" : "At"}
        </span>
        <span className="font-mono text-[11px] text-ink-2 tabular-nums">
          {reading?.label ?? "--:--"}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-foreground">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-(--gb-accent)"
          />
          Today
        </span>
        {reading?.today === null || reading?.today === undefined ? (
          <span className="font-mono text-[13px] text-ink-3">
            {reading ? "not yet" : "–"}
          </span>
        ) : (
          <Roll
            text={`${format(reading.today)}${unit}`}
            motionSafe={motionSafe}
            className="font-mono text-[13px] font-medium text-foreground"
          />
        )}
      </div>
      {reading && reading.ghosts.length === 0 ? (
        <p className="text-[11px] text-ink-3">
          Show a baseline to compare against it.
        </p>
      ) : null}
      {reading?.ghosts.map((row) => {
        const tone = TONES[baselines[row.id]?.tone ?? "ink"];
        const up = row.delta !== null && row.delta > 0;
        return (
          <div key={row.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
                <span
                  aria-hidden
                  className="h-0.5 w-2 shrink-0 rounded-full"
                  style={{ background: tone, opacity: GHOST_OPACITY + 0.2 }}
                />
                <span className="truncate">{row.short}</span>
              </span>
              <Roll
                text={`${format(row.value)}${unit}`}
                motionSafe={motionSafe}
                className="font-mono text-[12px] text-ink-2"
              />
            </div>
            <div className="flex items-baseline justify-end gap-2 pl-3.5">
              {row.delta === null || row.percent === null ? (
                <span className="font-mono text-[11px] text-ink-3">–</span>
              ) : (
                <>
                  <Roll
                    text={signed(
                      row.delta,
                      `${format(Math.abs(row.delta))}${unit}`,
                    )}
                    motionSafe={motionSafe}
                    className={cn(
                      "font-mono text-[11px]",
                      up ? "text-(--gb-accent)" : "text-ink-2",
                    )}
                  />
                  <Roll
                    text={signed(
                      row.percent,
                      `${Math.abs(row.percent).toFixed(1)}%`,
                    )}
                    motionSafe={motionSafe}
                    className={cn(
                      "font-mono text-[11px]",
                      up ? "text-(--gb-accent)" : "text-ink-3",
                    )}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
      <AnimatePresence initial={false}>
        {reading?.departure ? (
          <motion.p
            key="departure"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.flick, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="flex items-start gap-1.5 rounded-2 bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 py-1.5 text-[11px] leading-snug text-foreground"
          >
            <CircleAlert
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-warn"
            />
            <span>
              Anomaly: {DEPARTURE_WORD[reading.departure]} by more than{" "}
              {tolerance}%.
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A metric chart with its comparisons drawn as ghosts. Today is the solid
 * line; each baseline in the legend is a switch that, when turned on, draws
 * its ghost across the plot on `springs.glide` (`pathLength` 0 to 1) at full
 * strength and then fades to its ghost opacity, so a new comparison arrives
 * as a line being drawn rather than a layer being switched on. Between today
 * and the ghosts two bands fill: a shaded band wherever today falls below
 * every shown ghost, and an accent band wherever it rises above all of them.
 * Both bands are one path each, so adding or removing a ghost morphs their
 * edges on `springs.glide` instead of redrawing them.
 *
 * Hovering or pressing the plot, or scrubbing it with the keyboard, drops a
 * crosshair on the nearest hour on `springs.flick` and the readout compares
 * today to each ghost — the value, the signed delta and the percentage —
 * with every digit rolling on `springs.snap`. Hours where today departs from
 * every ghost by more than the tolerance are anomalies: a ring draws around
 * each on `springs.flick`, and dragging the tolerance slider changes which
 * hours qualify, rings drawing and fading as they do.
 *
 * The plot is a slider: Left and Right step an hour, Home and End jump to the
 * ends, Escape clears the crosshair, and `aria-valuetext` speaks the whole
 * comparison. The legend is a group of switches with one tab stop (arrows
 * move, Space or Enter toggles), and the tolerance is a slider of its own.
 * Every change is announced. Under reduced motion ghosts appear whole at
 * their ghost opacity, bands and rings cross-fade, the crosshair jumps and
 * the digits change in place.
 */
export function GhostBaseline({
  ghostStyle = "line",
  curve = "smooth",
  accent = "cobalt",
  today = defaultGhostToday,
  baselines = defaultGhostBaselines,
  labels = defaultGhostLabels,
  value,
  defaultValue = defaultGhostValue,
  onChange,
  tolerance,
  defaultTolerance = 12,
  onToleranceChange,
  toleranceRange = { min: 2, max: 40, step: 1 },
  onScrub,
  format = defaultFormat,
  unit = "",
  status = "ready",
  onRetry,
  title = "Completed checkouts",
  caption = "Basinworks checkout, per hour",
  label,
  height = 520,
  disabled = false,
  className,
}: GhostBaselineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const clipBelowId = `${uid}-below`;
  const clipAboveId = `${uid}-above`;

  const [ownValue, setOwnValue] = React.useState<string[]>(defaultValue);
  const enabled = value ?? ownValue;
  const [ownTolerance, setOwnTolerance] = React.useState(defaultTolerance);
  const tol = tolerance ?? ownTolerance;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [active, setActive] = React.useState<number | null>(null);
  const [activeLegend, setActiveLegend] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [plate, setPlate] = React.useState<HTMLDivElement | null>(null);
  const { width, height: plotH } = useBoxSize(plate);
  // False for the server render and hydration, so a ghost already on the
  // page never draws itself in; true for ghosts switched on later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const legendNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const dragRef = React.useRef<{ pointerId: number; startX: number } | null>(
    null,
  );
  // The parent hears about a scrub from the handler that caused it, once per
  // hour reached, however many pointer moves land on the same one.
  const activeRef = React.useRef<number | null>(null);
  const scrubRef = React.useRef(onScrub);
  React.useEffect(() => {
    scrubRef.current = onScrub;
  }, [onScrub]);

  /* -------------------------------- data ------------------------------- */

  const all = React.useMemo(() => Object.values(baselines), [baselines]);
  const ghosts = React.useMemo(
    () => ghostsOf(baselines, enabled),
    [baselines, enabled],
  );
  const count = Math.max(today.length, ...all.map((g) => g.values.length), 0);
  const hasData = today.length >= 2 && all.length > 0;
  const lastToday = today.length - 1;

  const extent = React.useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of today) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    for (const g of all) {
      for (const v of g.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min)) return { lo: 0, hi: 1, ticks: [0, 1] };
    const span = max - min;
    const step = niceStep(span);
    let lo = Math.floor((min - span * 0.08) / step) * step;
    if (min >= 0) lo = Math.max(0, lo);
    const hi = Math.max(
      lo + step,
      Math.ceil((max + span * 0.06) / step) * step,
    );
    const ticks: number[] = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(r3(t));
    return { lo, hi, ticks };
  }, [today, all]);

  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = Math.max(plotH - PAD.top - PAD.bottom, 1);
  const xAt = (i: number) =>
    count <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (count - 1)) * innerW;
  const yAt = (v: number) =>
    PAD.top + (1 - (v - extent.lo) / (extent.hi - extent.lo)) * innerH;
  const top = PAD.top;
  const bottom = PAD.top + innerH;
  const plotted = width > 0 && plotH > 0;

  const pointsOf = (values: number[]): Pt[] =>
    values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

  const todayPts = pointsOf(today);
  const todayLine = linePath(todayPts, curve);

  /** The envelope of the shown ghosts across today's hours. */
  const envelope = React.useMemo(() => {
    if (ghosts.length === 0) return null;
    const lo: number[] = [];
    const hi: number[] = [];
    for (let i = 0; i < today.length; i += 1) {
      const vals = ghosts
        .map((g) => g.values[i])
        .filter((v): v is number => v !== undefined);
      const t = today[i] ?? 0;
      lo.push(vals.length ? Math.min(...vals) : t);
      hi.push(vals.length ? Math.max(...vals) : t);
    }
    return { lo, hi };
  }, [today, ghosts]);

  const aboveToday = areaPath(todayPts, curve, top);
  const belowToday = areaPath(todayPts, curve, bottom);
  const belowEnvelopeLo = envelope
    ? areaPath(pointsOf(envelope.lo), curve, bottom)
    : "";
  const aboveEnvelopeHi = envelope
    ? areaPath(pointsOf(envelope.hi), curve, top)
    : "";

  const anomalies = React.useMemo(
    () => findGhostAnomalies(today, baselines, enabled, tol),
    [today, baselines, enabled, tol],
  );

  const readingAt = (index: number): GhostReading | null => {
    if (index < 0 || index >= count) return null;
    const t = today[index];
    const todayValue = t === undefined ? null : t;
    return {
      index,
      label: labels[index] ?? `#${index + 1}`,
      today: todayValue,
      ghosts: ghosts
        .map((g) => {
          const base = g.values[index];
          if (base === undefined) return null;
          const delta = todayValue === null ? null : todayValue - base;
          return {
            id: g.id,
            short: g.short,
            value: base,
            delta,
            percent:
              delta === null ? null : base === 0 ? null : (delta / base) * 100,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
      departure:
        todayValue === null
          ? null
          : departureAt(todayValue, ghosts, index, tol),
    };
  };

  const shownIndex = active ?? lastToday;
  const reading = hasData ? readingAt(shownIndex) : null;

  const speak = (r: GhostReading | null): string => {
    if (!r) return "";
    const parts = [r.label];
    parts.push(
      r.today === null ? "today not yet" : `today ${format(r.today)}${unit}`,
    );
    for (const g of r.ghosts) {
      if (g.percent === null)
        parts.push(`${g.short} ${format(g.value)}${unit}`);
      else {
        parts.push(
          `${Math.abs(g.percent).toFixed(0)} percent ${g.percent < 0 ? "below" : "above"} ${g.short.toLowerCase()}`,
        );
      }
    }
    if (r.departure) parts.push("anomaly");
    return parts.join(", ");
  };

  /* ------------------------------- changes ----------------------------- */

  const toggle = (id: string) => {
    if (inert) return;
    const ghost = baselines[id];
    if (!ghost) return;
    const on = !enabled.includes(id);
    const next = on
      ? all.map((g) => g.id).filter((g) => g === id || enabled.includes(g))
      : enabled.filter((g) => g !== id);
    if (value === undefined) setOwnValue(next);
    onChange?.(next, { id, enabled: on });
    const n = findGhostAnomalies(today, baselines, next, tol).length;
    setAnnouncement(
      `${ghost.label} ${on ? "shown" : "hidden"}. ${next.length} of ${all.length} baselines. ${n} ${n === 1 ? "anomaly" : "anomalies"}.`,
    );
  };

  const changeTolerance = (next: number) => {
    if (inert) return;
    if (tolerance === undefined) setOwnTolerance(next);
    onToleranceChange?.(next);
    const n = findGhostAnomalies(today, baselines, enabled, next).length;
    setAnnouncement(
      `Tolerance ${next} percent. ${n} ${n === 1 ? "anomaly" : "anomalies"}.`,
    );
  };

  const setActiveIndex = (next: number | null) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
    scrubRef.current?.(next);
  };

  /* ------------------------------- scrubber ---------------------------- */

  const indexFromClientX = (clientX: number): number | null => {
    if (!plate || count === 0) return null;
    const x = clientX - plate.getBoundingClientRect().left;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < count; i += 1) {
      const distance = Math.abs(xAt(i) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  const scrubTo = (clientX: number) => {
    const index = indexFromClientX(clientX);
    if (index !== null) setActiveIndex(index);
  };

  const onPlotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasData) return;
    const from = active ?? lastToday;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(count - 1, from + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, from - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        if (active === null) return;
        event.preventDefault();
        setActiveIndex(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setActiveIndex(next);
  };

  /* -------------------------------- legend ----------------------------- */

  const legendIds = all.map((g) => g.id);
  const legendActive =
    activeLegend && legendIds.includes(activeLegend)
      ? activeLegend
      : (legendIds[0] ?? null);

  const onLegendNav = (event: React.KeyboardEvent, id: string) => {
    const i = legendIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = legendIds.length - 1;
    else return;
    event.preventDefault();
    const target = legendIds[clamp(to, 0, legendIds.length - 1)];
    if (target) legendNodes.current.get(target)?.focus();
  };

  /* -------------------------------- render ----------------------------- */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const activePt = active === null ? undefined : { x: xAt(active) };
  const crosshairTransition = motionSafe ? springs.flick : { duration: 0 };
  const morph = motionSafe ? springs.glide : { duration: 0 };
  const latest = today[lastToday];
  const valueText = reading ? speak(reading) : `${title}: no data`;
  const dotStep = cascade(Math.min(count, 24));

  const xTicks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 6 === 0 || i === count - 1) xTicks.push(i);
  }

  const renderGhost = (ghost: GhostBaselineSeries, order: number) => {
    const tone = TONES[ghost.tone ?? "ink"];
    const pts = pointsOf(ghost.values);
    const line = linePath(pts, curve);
    const drawIn = live && motionSafe;
    if (ghostStyle === "dots") {
      return (
        <motion.g
          key={ghost.id}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        >
          {pts.map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              fill={tone}
              initial={drawIn ? { opacity: 0, r: 0 } : false}
              animate={{ opacity: GHOST_OPACITY, r: 2.4 }}
              transition={
                drawIn
                  ? {
                      r: { ...springs.flick, delay: r3(i * dotStep) },
                      opacity: {
                        duration: durations.fast,
                        delay: r3(i * dotStep),
                      },
                    }
                  : { duration: durations.fast }
              }
            />
          ))}
        </motion.g>
      );
    }
    return (
      <motion.g
        key={ghost.id}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      >
        {ghostStyle === "area" ? (
          <motion.path
            d={areaPath(pts, curve, bottom)}
            fill={tone}
            initial={drawIn ? { opacity: 0 } : false}
            animate={{ opacity: 0.08 }}
            transition={
              drawIn
                ? {
                    duration: durations.slow,
                    ease: easings.enter,
                    delay: durations.slow,
                  }
                : { duration: durations.fast }
            }
          />
        ) : null}
        <motion.path
          d={line}
          fill="none"
          stroke={tone}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={drawIn ? { pathLength: 0, opacity: 1 } : false}
          animate={{ pathLength: 1, opacity: GHOST_OPACITY }}
          transition={
            drawIn
              ? {
                  pathLength: { ...springs.glide, delay: r3(order * 0.04) },
                  opacity: {
                    duration: durations.slow,
                    ease: easings.enter,
                    delay: durations.slow,
                  },
                }
              : { duration: durations.fast }
          }
        />
      </motion.g>
    );
  };

  const legend = (
    <div
      role="group"
      aria-label="Baselines"
      aria-describedby={hintId}
      className="-m-[3px] flex min-w-0 flex-wrap items-center gap-1.5 p-[3px]"
    >
      {all.map((ghost) => (
        <LegendSwitch
          key={ghost.id}
          ghost={ghost}
          on={enabled.includes(ghost.id)}
          tabIndex={legendActive === ghost.id ? 0 : -1}
          inert={inert}
          motionSafe={motionSafe}
          nodeRef={(node) => {
            if (node) legendNodes.current.set(ghost.id, node);
            else legendNodes.current.delete(ghost.id);
          }}
          onToggle={() => toggle(ghost.id)}
          onFocus={() => setActiveLegend(ghost.id)}
          onNav={(event) => onLegendNav(event, ghost.id)}
        />
      ))}
    </div>
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
      style={{ height, ["--gb-accent" as string]: accentVar }}
    >
      <p id={hintId} className="sr-only">
        Arrows move between baselines. Space or Enter shows or hides one.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">{caption}</p>
        </div>
        {ready && hasData ? (
          <div className="flex shrink-0 flex-col items-end">
            <p className="flex items-baseline gap-1.5">
              <span className="sr-only">
                Latest, {labels[lastToday] ?? ""}:{" "}
                {latest === undefined ? "" : `${format(latest)}${unit}`}
              </span>
              <Roll
                text={latest === undefined ? "–" : `${format(latest)}${unit}`}
                motionSafe={motionSafe}
                className="font-mono text-[15px] font-medium text-foreground"
              />
              <span
                aria-hidden
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {labels[lastToday] ?? ""}
              </span>
            </p>
            <p
              className={cn(
                "flex items-center gap-1 text-[11px] transition-colors duration-150",
                anomalies.length > 0 ? "text-warn" : "text-ink-3",
              )}
            >
              <span className="sr-only">
                {anomalies.length}{" "}
                {anomalies.length === 1 ? "anomaly" : "anomalies"}
              </span>
              <CircleAlert aria-hidden className="size-3" />
              <Roll
                text={String(anomalies.length)}
                motionSafe={motionSafe}
                className="font-mono"
              />
              <span aria-hidden>
                {anomalies.length === 1 ? "anomaly" : "anomalies"}
              </span>
            </p>
          </div>
        ) : null}
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{
                  width: 92 + ((i * 29) % 40),
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
          <div className="relative flex-1 overflow-hidden rounded-3 bg-surface-1">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="absolute inset-x-4 h-px bg-hairline"
                style={{ top: `${18 + i * 22}%` }}
              />
            ))}
            <span
              className="absolute inset-x-6 top-[42%] h-6 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: "120ms" }}
            />
          </div>
          <p className="sr-only" role="status">
            Loading {title}.
          </p>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The series didn&apos;t load.
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
      ) : !hasData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <History aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">
            Not enough history for a baseline.
          </p>
          <p className="max-w-[26ch] text-[12px] text-ink-3">
            Ghosts appear once a comparable day has at least two hours of data.
          </p>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2">
            {legend}
            <ToleranceSlider
              value={tol}
              min={toleranceRange.min}
              max={toleranceRange.max}
              step={toleranceRange.step}
              inert={inert}
              motionSafe={motionSafe}
              onChange={changeTolerance}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3">
              <div
                role="slider"
                tabIndex={0}
                aria-label={`${title}, by hour`}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.max(count - 1, 0)}
                aria-valuenow={shownIndex}
                aria-valuetext={valueText}
                onKeyDown={onPlotKeyDown}
                onFocus={() => {
                  if (active === null) setActiveIndex(lastToday);
                }}
                onBlur={() => setActiveIndex(null)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  dragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                  };
                  scrubTo(event.clientX);
                }}
                onPointerMove={(event) => {
                  const held = dragRef.current;
                  // Captured only once the press has become a drag; capturing
                  // on pointerdown swallows the click a tap is made of.
                  if (
                    held &&
                    held.pointerId === event.pointerId &&
                    Math.abs(event.clientX - held.startX) > DRAG_SLOP
                  ) {
                    capturePointer(event.currentTarget, event.pointerId);
                  }
                  scrubTo(event.clientX);
                }}
                onPointerUp={(event) => {
                  releasePointer(event.currentTarget, event.pointerId);
                  dragRef.current = null;
                }}
                onPointerCancel={(event) => {
                  releasePointer(event.currentTarget, event.pointerId);
                  dragRef.current = null;
                }}
                onPointerLeave={() => {
                  // A held drag keeps the crosshair; a bare hover gives it up.
                  if (!dragRef.current) setActiveIndex(null);
                }}
                className={cn(
                  "relative min-h-0 flex-1 rounded-3 border border-hairline bg-surface-1",
                  FOCUS_RING,
                )}
                // pan-y keeps the page scrollable through the plot; horizontal
                // travel belongs to the crosshair.
                style={{ touchAction: "pan-y" }}
              >
                <div ref={setPlate} className="absolute inset-0">
                  {plotted ? (
                    <svg
                      aria-hidden
                      width={width}
                      height={plotH}
                      viewBox={`0 0 ${width} ${plotH}`}
                      className="block overflow-visible"
                    >
                      <defs>
                        <clipPath id={clipAboveId}>
                          <motion.path
                            initial={false}
                            animate={{ d: aboveToday }}
                            transition={morph}
                          />
                        </clipPath>
                        <clipPath id={clipBelowId}>
                          <motion.path
                            initial={false}
                            animate={{ d: belowToday }}
                            transition={morph}
                          />
                        </clipPath>
                      </defs>

                      {extent.ticks.map((t) => {
                        const y = yAt(t);
                        return (
                          <g key={t}>
                            <line
                              x1={PAD.left}
                              x2={width - PAD.right}
                              y1={y}
                              y2={y}
                              stroke="var(--hairline)"
                              strokeWidth={1}
                            />
                            <text
                              x={PAD.left - 6}
                              y={y + 3}
                              textAnchor="end"
                              fill="var(--ink-3)"
                              className="font-mono text-[9px] tabular-nums"
                            >
                              {format(t)}
                            </text>
                          </g>
                        );
                      })}

                      {xTicks.map((i) => (
                        <text
                          key={i}
                          x={xAt(i)}
                          y={plotH - 7}
                          textAnchor={
                            i === 0
                              ? "start"
                              : i === count - 1
                                ? "end"
                                : "middle"
                          }
                          fill="var(--ink-3)"
                          className="font-mono text-[9px] tabular-nums"
                        >
                          {labels[i] ?? ""}
                        </text>
                      ))}

                      {/* The bands: today below every ghost, shaded; today
                          above every ghost, lit in the accent. Each is the
                          region under or over the envelope clipped by the
                          region over or under today, so one path per band
                          morphs as ghosts come and go. */}
                      <AnimatePresence initial={false}>
                        {envelope ? (
                          <motion.g
                            key="bands"
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
                          >
                            <g clipPath={`url(#${clipAboveId})`}>
                              <motion.path
                                initial={false}
                                animate={{ d: belowEnvelopeLo }}
                                transition={morph}
                                fill="color-mix(in oklab, var(--ink) 14%, transparent)"
                              />
                            </g>
                            <g clipPath={`url(#${clipBelowId})`}>
                              <motion.path
                                initial={false}
                                animate={{ d: aboveEnvelopeHi }}
                                transition={morph}
                                fill="color-mix(in oklab, var(--gb-accent) 24%, transparent)"
                              />
                            </g>
                          </motion.g>
                        ) : null}
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {ghosts.map((ghost, order) =>
                          renderGhost(ghost, order),
                        )}
                      </AnimatePresence>

                      <motion.path
                        d={todayLine}
                        fill="none"
                        stroke="var(--gb-accent)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.glide : { duration: 0 }
                        }
                      />
                      {todayPts[lastToday] ? (
                        <circle
                          cx={todayPts[lastToday].x}
                          cy={todayPts[lastToday].y}
                          r={3.5}
                          fill="var(--gb-accent)"
                          stroke="var(--bg-1)"
                          strokeWidth={2}
                        />
                      ) : null}

                      <AnimatePresence initial={false}>
                        {anomalies.map((i) => {
                          const p = todayPts[i];
                          if (!p) return null;
                          return (
                            <motion.circle
                              key={i}
                              cx={p.x}
                              cy={p.y}
                              r={7}
                              fill="none"
                              stroke="var(--warn)"
                              strokeWidth={1.75}
                              initial={
                                motionSafe
                                  ? { pathLength: 0, opacity: 0 }
                                  : { opacity: 0 }
                              }
                              animate={{ pathLength: 1, opacity: 1 }}
                              exit={{
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }}
                              transition={
                                motionSafe
                                  ? {
                                      pathLength: springs.flick,
                                      opacity: { duration: durations.blink },
                                    }
                                  : { duration: durations.fast }
                              }
                            />
                          );
                        })}
                      </AnimatePresence>

                      {activePt ? (
                        <g>
                          <motion.line
                            initial={false}
                            animate={{ x1: activePt.x, x2: activePt.x }}
                            transition={crosshairTransition}
                            y1={top - 6}
                            y2={bottom}
                            stroke="var(--ink-3)"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                          />
                          {ghosts.map((g) => {
                            const v =
                              active === null ? undefined : g.values[active];
                            if (v === undefined) return null;
                            return (
                              <motion.circle
                                key={g.id}
                                initial={false}
                                animate={{ cx: activePt.x, cy: yAt(v) }}
                                transition={crosshairTransition}
                                r={3}
                                fill={TONES[g.tone ?? "ink"]}
                                stroke="var(--bg-1)"
                                strokeWidth={1.5}
                              />
                            );
                          })}
                          {reading?.today !== null &&
                          reading?.today !== undefined ? (
                            <motion.circle
                              initial={false}
                              animate={{
                                cx: activePt.x,
                                cy: yAt(reading.today),
                              }}
                              transition={crosshairTransition}
                              r={4}
                              fill="var(--gb-accent)"
                              stroke="var(--bg-1)"
                              strokeWidth={2}
                            />
                          ) : null}
                        </g>
                      ) : null}
                    </svg>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-hairline px-4 py-3 @min-[40rem]:w-[13rem] @min-[40rem]:overflow-y-auto @min-[40rem]:border-t-0 @min-[40rem]:border-l">
              <Readout
                reading={reading}
                parked={active === null}
                tolerance={tol}
                format={format}
                unit={unit}
                motionSafe={motionSafe}
                baselines={baselines}
              />
            </div>
          </div>

          {/* Every hour, spelled out: the chart means something with no pointer. */}
          <ul className="sr-only">
            {today.map((v, i) => (
              <li key={i}>
                {labels[i] ?? i}: {format(v)}
                {unit}
                {anomalies.includes(i) ? ", anomaly" : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
