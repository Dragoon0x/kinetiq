"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PerformancePeriod = {
  id: string;
  /** Short tab copy — "1M", "1Y", "All". */
  label: string;
  /** An already-formatted start label; the chart never reads a clock. */
  since: string;
  /** Closes, oldest first. Two or more are needed to draw. */
  points: number[];
};

export type PerformanceLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  periods: PerformancePeriod[];
  /** Controlled period id. */
  value?: string;
  /** Initial period for uncontrolled usage. @default the first period */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Formats the current value and the start chip's opening figure. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Plate height in px; the width is fluid. @default 132 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const defaultFormat = (value: number) => currency.format(value);

/**
 * The plate is a 100×100 viewBox stretched to fit, so every marker can be
 * placed in percentages of the container instead of pixels that could overhang
 * a 342px column. `vectorEffect` keeps the trace one hairline wide despite the
 * non-uniform scale.
 */
const PAD_X = 3;
const PAD_Y = 9;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap`. The column is ten
 * faces tall, so a `y` of a tenth of its own height is exactly one digit, and
 * the slot's `1ch` width means a changing number never reflows the row.
 */
function RollingFigure({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // number gains or loses a digit.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type Plotted = { x: number; y: number };

function plot(points: number[]): {
  path: Plotted[];
  low: number;
  high: number;
} {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    if (point < low) low = point;
    if (point > high) high = point;
  }
  const span = high - low || 1;
  const innerW = 100 - PAD_X * 2;
  const innerH = 100 - PAD_Y * 2;
  const path = points.map((point, index) => ({
    x:
      points.length === 1
        ? PAD_X + innerW / 2
        : PAD_X + (index / (points.length - 1)) * innerW,
    y: 100 - PAD_Y - ((point - low) / span) * innerH,
  }));
  return { path, low, high };
}

/**
 * Since when, and how far. A period selector drives a trace that is redrawn
 * rather than cross-faded: switching remounts a clip rectangle at zero width
 * which opens across the plate on a `durations.page` tween, wiping the new line
 * and its fill in from the left exactly as a chart is read. Nothing ghosts
 * underneath, because the old series is already gone when the wipe starts.
 *
 * The pill under the chosen period is one element travelling on a `useId()`
 * prefixed `layoutId`, so it moves on `snap` with a single crisp overshoot. The
 * return figure beside the heading rolls its digits on the same spring and its
 * caret turns to match the sign, while the start marker labels itself once the
 * wipe has passed: a mono chip fades out of the dot carrying that period's
 * start date and opening value.
 *
 * The selector is a real `tablist` with a roving tabindex — Left and Right
 * step, Home and End jump, focus activates — and the plate is its panel with an
 * `aria-label` sentence that states the whole period, so the trace means
 * something without sight of it. Under reduced motion the new trace is simply
 * there, complete: the chart is information, and information is not withheld.
 */
export function PerformanceLine({
  ref,
  periods,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  label,
  height = 132,
  className,
  "aria-label": ariaLabel,
}: PerformanceLineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const clipId = `${baseId}-wipe`;
  const fillId = `${baseId}-fill`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? periods[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const currentId = isControlled ? value : uncontrolled;
  const activeIndex = Math.max(
    0,
    periods.findIndex((period) => period.id === currentId),
  );
  const period = periods[activeIndex];

  const geometry = React.useMemo(() => {
    const points = period?.points ?? [];
    if (points.length < 2) return null;
    const { path, low, high } = plot(points);
    const line = path
      .map((node, index) => `${index === 0 ? "M" : "L"}${node.x} ${node.y}`)
      .join(" ");
    const first = path[0]!;
    const last = path[path.length - 1]!;
    return {
      line,
      area: `${line} L${last.x} 100 L${first.x} 100 Z`,
      first,
      last,
      low,
      high,
      open: points[0]!,
      close: points[points.length - 1]!,
    };
  }, [period]);

  const change =
    geometry && geometry.open !== 0
      ? ((geometry.close - geometry.open) / Math.abs(geometry.open)) * 100
      : 0;
  const up = change >= 0;
  const tone = up ? "text-success" : "text-danger";
  const printedChange = `${up ? "+" : "-"}${Math.abs(change).toFixed(2)}%`;

  const select = (id: string) => {
    if (id === currentId) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(periods.length - 1, Math.max(0, index));
    const target = periods[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-tab-${target.id}`)?.focus();
    select(target.id);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(periods.length - 1);
    }
  };

  const summary = geometry
    ? `${period?.label ?? ""} performance: ${format(geometry.open)} on ${period?.since ?? ""} to ${format(geometry.close)}, low ${format(geometry.low)}, high ${format(geometry.high)}, ${up ? "up" : "down"} ${Math.abs(change).toFixed(2)} percent.`
    : "No data for this period.";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? (
          <div id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </div>
        ) : null}

        <div
          role="tablist"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : ariaLabel}
          className="flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {periods.map((item, index) => {
            const selected = item.id === currentId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative flex min-w-10 items-center justify-center rounded-full px-2.5 font-mono text-[11px] transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "text-foreground"
                    : "text-ink-3 hover:text-foreground",
                )}
              >
                {selected &&
                  (motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${baseId}-pill`}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ))}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-xl text-foreground tabular-nums">
          {geometry ? format(geometry.close) : "—"}
        </span>
        <span className={cn("flex items-center gap-1.5", tone)}>
          <motion.svg
            aria-hidden
            viewBox="0 0 12 12"
            className="size-3 shrink-0"
            fill="currentColor"
            style={{ originX: 0.5, originY: 0.5 }}
            initial={false}
            animate={{ rotate: up ? 0 : 180 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <path d="M6 2 10.5 9.5h-9Z" />
          </motion.svg>
          <span className="font-mono text-sm font-medium">
            <RollingFigure value={printedChange} motionSafe={motionSafe} />
          </span>
        </span>
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={period ? `${baseId}-tab-${period.id}` : undefined}
        tabIndex={0}
        className="relative w-full rounded-3 border border-hairline bg-surface-1 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        style={{ height }}
      >
        <svg
          role="img"
          aria-label={summary}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <defs>
            <linearGradient
              id={fillId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              className={tone}
            >
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <clipPath id={clipId}>
              {/* Remounting on the period id restarts the wipe; scaling from a
                  left origin keeps it a transform rather than an animated
                  attribute, which SVG clips handle far more predictably. */}
              <motion.rect
                key={period?.id ?? "empty"}
                x={0}
                y={0}
                width={100}
                height={100}
                style={{ originX: 0, originY: 0.5 }}
                initial={motionSafe ? { scaleX: 0 } : false}
                animate={{ scaleX: 1 }}
                transition={
                  motionSafe
                    ? { duration: durations.page, ease: easings.enter }
                    : { duration: 0 }
                }
              />
            </clipPath>
          </defs>

          {geometry ? (
            <g clipPath={`url(#${clipId})`}>
              <path d={geometry.area} fill={`url(#${fillId})`} />
              {/* The opening level, so "how far" has something to be far from. */}
              <line
                x1={PAD_X}
                y1={geometry.first.y}
                x2={100 - PAD_X}
                y2={geometry.first.y}
                className="text-hairline-strong"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={geometry.line}
                fill="none"
                className={tone}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
        </svg>

        {geometry ? (
          <>
            <span
              aria-hidden
              className={cn(
                "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-1 bg-current",
                tone,
              )}
              style={{
                left: `${geometry.last.x}%`,
                top: `${geometry.last.y}%`,
              }}
            />
            <span
              aria-hidden
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong bg-surface-0"
              style={{
                left: `${geometry.first.x}%`,
                top: `${geometry.first.y}%`,
              }}
            />
            <motion.span
              // Remounts with the period so the chip re-labels itself; the
              // delay lets the wipe get clear of the marker first.
              key={period?.id ?? "empty"}
              aria-hidden
              className="absolute -translate-y-1/2 rounded-2 border border-hairline bg-surface-0/90 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-ink-3"
              style={{
                left: `${geometry.first.x}%`,
                top: `${Math.min(86, Math.max(14, geometry.first.y))}%`,
                marginLeft: 8,
              }}
              initial={
                motionSafe
                  ? { opacity: 0, x: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: durations.page * 0.8,
                      opacity: {
                        duration: durations.fast,
                        delay: durations.page * 0.8,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              {period?.since} · {format(geometry.open)}
            </motion.span>
          </>
        ) : null}
      </div>

      {/* Shorter than the chart's own label on purpose: this fires on every
          switch, and an announcement should say what changed, not re-read the
          whole series. */}
      <span role="status" className="sr-only">
        {geometry
          ? `${period?.label ?? ""}: ${up ? "up" : "down"} ${Math.abs(change).toFixed(2)} percent since ${period?.since ?? ""}, now ${format(geometry.close)}.`
          : "No data for this period."}
      </span>
    </div>
  );
}
