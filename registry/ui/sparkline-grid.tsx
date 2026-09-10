"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SparkMetric = {
  id: string;
  name: string;
  /** Printed after every reading; a word unit is spaced, a symbol is not. */
  unit: string;
  /** The seeded window, oldest first. */
  series: number[];
  /** Marks the tile as anomalous — a word in the markup, not only a colour. */
  anomaly?: boolean;
  /** One sentence shown when the tile is open. */
  note?: string;
};

export type SparklineGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The tiles, in reading order. */
  metrics: SparkMetric[];
  /** Tiles per row; the arrow-key geometry follows it exactly. @default 2 */
  columns?: number;
  /** Controlled expanded tile. */
  expandedId?: string | null;
  /** Initial expanded tile for uncontrolled usage. @default null */
  defaultExpandedId?: string | null;
  /** Fires from the press or key that expanded or folded a tile. */
  onExpandedChange?: (id: string | null) => void;
  /** Fires as hover or focus moves, and with null when both leave. */
  onActiveChange?: (id: string | null) => void;
  /** Renders every reading in the grid. */
  format?: (value: number, unit: string) => string;
  /** Names the grid for assistive technology. @default "Metrics" */
  label?: string;
  className?: string;
};

const VIEW_W = 100;
const VIEW_H = 24;
const PAD = 3;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A word unit takes a space, a symbol does not: "41 jobs", "3.4%". */
const defaultFormat = (value: number, unit: string): string =>
  `${Number(value.toFixed(1))}${/^[a-z]/i.test(unit) ? " " : ""}${unit}`;

const sampleWord = (count: number): string =>
  count === 1 ? "sample" : "samples";

/**
 * Three decimals before a coordinate reaches an attribute: the browser and the
 * server can disagree in the last digits, and a differing `d` is a hydration
 * error rather than a rounding one.
 */
function linePath(series: number[]): string {
  if (series.length < 2) return "";
  const low = Math.min(...series);
  const span = Math.max(...series) - low || 1;
  const inner = VIEW_H - PAD * 2;
  return series
    .map((value, index) => {
      const x = Number(((index / (series.length - 1)) * VIEW_W).toFixed(3));
      const y = Number(
        (VIEW_H - PAD - ((value - low) / span) * inner).toFixed(3),
      );
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

type Stats = {
  last: number;
  first: number;
  low: number;
  high: number;
  mean: number;
};

function statsOf(series: number[]): Stats {
  const sum = series.reduce((total, value) => total + value, 0);
  return {
    first: series[0] ?? 0,
    last: series[series.length - 1] ?? 0,
    low: series.length > 0 ? Math.min(...series) : 0,
    high: series.length > 0 ? Math.max(...series) : 0,
    mean: series.length > 0 ? Number((sum / series.length).toFixed(2)) : 0,
  };
}

/** The open tile's readings, so every figure the line draws is also a word. */
function TileBody({
  bodyRef,
  metric,
  stats,
  format,
}: {
  bodyRef: (node: HTMLDivElement | null) => void;
  metric: SparkMetric;
  stats: Stats;
  format: (value: number, unit: string) => string;
}) {
  const rows = [
    { key: "Low", value: format(stats.low, metric.unit) },
    { key: "High", value: format(stats.high, metric.unit) },
    { key: "Mean", value: format(stats.mean, metric.unit) },
    { key: "Samples", value: String(metric.series.length) },
  ];
  return (
    <div ref={bodyRef} className="px-2 pb-2">
      <dl className="flex flex-col gap-0.5 border-t border-hairline pt-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline gap-2">
            <dt className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-3">
              {row.key}
            </dt>
            <dd className="shrink-0 font-mono text-[10px] text-ink tabular-nums">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {metric.note ? (
        <p className="pt-1.5 font-mono text-[10px] leading-snug text-ink-2">
          {metric.note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Six metrics at a glance, each one tile. Every line draws itself left to right
 * — `pathLength={1}`, a constant dash pattern and one numeric
 * `strokeDashoffset` easing on `glide` — staggered across the grid by
 * `cascade()`, and it draws again whenever a new window replaces the series
 * because each path is keyed by its own readings.
 *
 * Pressing a tile expands it IN PLACE: the tile keeps its cell, its line grows
 * taller, and a ResizeObserver-measured body glides open underneath with the
 * last, low, high, mean and sample count. Nothing reserves that space while the
 * tile is shut. A metric flagged as anomalous takes one wash — three keyframes,
 * therefore a tween — and prints the word beside its name, so the flag survives
 * both reduced motion and a colour-blind reading.
 *
 * It is a real grid: one roving tabindex, Left and Right within a row, Up and
 * Down between rows keeping the column, Home and End to the row's ends, Control
 * with Home or End to the first or last tile, Enter or Space to open.
 */
export function SparklineGrid({
  ref,
  metrics,
  columns = 2,
  expandedId,
  defaultExpandedId = null,
  onExpandedChange,
  onActiveChange,
  format = defaultFormat,
  label = "Metrics",
  className,
}: SparklineGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const cols = Math.max(1, Math.round(columns));
  const [ownExpanded, setOwnExpanded] = React.useState<string | null>(
    defaultExpandedId,
  );
  const isControlled = expandedId !== undefined;
  const openId = isControlled ? expandedId : ownExpanded;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState(0);

  // The observer attaches to the body when the node ARRIVES, never in a
  // mount-only effect reading a ref that is null until the tile opens.
  const observer = React.useRef<ResizeObserver | null>(null);
  const bodyRef = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const next = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setBodyHeight(entry.contentRect.height);
    });
    next.observe(node);
    observer.current = next;
  }, []);
  React.useEffect(
    () => () => {
      observer.current?.disconnect();
    },
    [],
  );

  const activeId = hoverId ?? focusId;
  const activeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    activeRef.current = onActiveChange;
  });
  const firstActive = React.useRef(true);
  React.useEffect(() => {
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    activeRef.current?.(activeId);
  }, [activeId]);

  const setOpen = (id: string | null) => {
    if (!isControlled) setOwnExpanded(id);
    onExpandedChange?.(id);
  };

  const openMetric = metrics.find((metric) => metric.id === openId) ?? null;
  const openSamples = openMetric ? openMetric.series.length : 0;

  // Frozen in the render that commits the change, so the region speaks the
  // tile that is now open rather than the one it replaced.
  const speechKey = openId ?? "none";
  const [spoken, setSpoken] = React.useState({ key: speechKey, sentence: "" });
  if (spoken.key !== speechKey) {
    setSpoken({
      key: speechKey,
      sentence: openMetric
        ? `${openMetric.name} expanded, ${openSamples} ${sampleWord(openSamples)}.`
        : "Tile folded.",
    });
  }

  const rows: SparkMetric[][] = [];
  for (let index = 0; index < metrics.length; index += cols) {
    rows.push(metrics.slice(index, index + cols));
  }

  const moveTo = (index: number) => {
    const clamped = Math.min(metrics.length - 1, Math.max(0, index));
    if (clamped < 0) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-tile-${clamped}`)?.focus();
  };

  const onTileKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const column = index % cols;
    const rowStart = index - column;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (column < cols - 1) moveTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (column > 0) moveTo(index - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (index + cols < metrics.length) moveTo(index + cols);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index - cols >= 0) moveTo(index - cols);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(event.ctrlKey ? 0 : rowStart);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(event.ctrlKey ? metrics.length - 1 : rowStart + cols - 1);
    }
  };

  const stagger = cascade(Math.max(metrics.length, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const growTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const roving = Math.min(focusIndex, Math.max(0, metrics.length - 1));

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div role="grid" aria-label={label} className="flex flex-col gap-2">
        {rows.map((row, rowIndex) => (
          <div
            key={`${baseId}-row-${rowIndex}`}
            role="row"
            className="flex items-start gap-2"
          >
            {row.map((metric, cell) => {
              const index = rowIndex * cols + cell;
              const open = metric.id === openId;
              const stats = statsOf(metric.series);
              const delta = Number((stats.last - stats.first).toFixed(2));
              const signature = metric.series.join(",");
              const bodyId = `${baseId}-body-${metric.id}`;
              const deltaWords =
                delta === 0
                  ? "level"
                  : `${delta > 0 ? "up" : "down"} ${format(Math.abs(delta), metric.unit)}`;

              return (
                <div
                  key={metric.id}
                  role="gridcell"
                  className="min-w-0 flex-1 basis-0"
                >
                  <div
                    className={cn(
                      "relative overflow-clip rounded-3 border bg-surface-1 transition-colors [contain:paint]",
                      metric.anomaly
                        ? "border-warn"
                        : open
                          ? "border-hairline-strong"
                          : "border-hairline",
                      metric.id === activeId && "bg-surface-2",
                    )}
                  >
                    {/* One wash per window, keyed by the readings so a repeat
                        of the same window never replays it. Three keyframes,
                        therefore a tween — a spring drops the middle one. */}
                    {metric.anomaly && motionSafe ? (
                      <motion.span
                        key={`${metric.id}-${signature}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-warn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.28, 0] }}
                        transition={{
                          duration: durations.page,
                          times: [0, 0.16, 1],
                          ease: easings.exit,
                        }}
                      />
                    ) : null}

                    <button
                      id={`${baseId}-tile-${index}`}
                      type="button"
                      aria-expanded={open}
                      aria-controls={bodyId}
                      aria-label={`${metric.name}, ${format(stats.last, metric.unit)}, ${deltaWords} across ${metric.series.length} ${sampleWord(metric.series.length)}${metric.anomaly ? ", anomaly" : ""}.`}
                      tabIndex={index === roving ? 0 : -1}
                      onFocus={() => {
                        setFocusIndex(index);
                        setFocusId(metric.id);
                      }}
                      onBlur={() =>
                        setFocusId((previous) =>
                          previous === metric.id ? null : previous,
                        )
                      }
                      onPointerEnter={() => setHoverId(metric.id)}
                      onPointerLeave={() =>
                        setHoverId((previous) =>
                          previous === metric.id ? null : previous,
                        )
                      }
                      onClick={() => setOpen(open ? null : metric.id)}
                      onKeyDown={(event) => onTileKeyDown(event, index)}
                      className={cn(
                        "relative flex w-full flex-col gap-1 p-2 text-left",
                        focusRing,
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex w-full items-center gap-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          {metric.name}
                        </span>
                        {metric.anomaly ? (
                          <span className="shrink-0 font-mono text-[9px] font-medium text-warn">
                            anomaly
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className="flex w-full items-baseline gap-1.5"
                      >
                        <span className="min-w-0 truncate font-mono text-sm font-medium text-ink tabular-nums">
                          {format(stats.last, metric.unit)}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                          {deltaWords}
                        </span>
                      </span>
                      <motion.span
                        aria-hidden
                        className="block w-full"
                        initial={false}
                        animate={{ height: open ? 44 : 22 }}
                        transition={growTransition}
                      >
                        <svg
                          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                          preserveAspectRatio="none"
                          className="size-full"
                        >
                          {/* Drawn by a clip that sweeps across the tile, not
                              by a dash: `pathLength` normalisation and
                              `vector-effect: non-scaling-stroke` disagree in a
                              stretched box, and the finished line comes out
                              short of its own last reading. */}
                          <defs>
                            <clipPath id={`${baseId}-sweep-${metric.id}`}>
                              <motion.rect
                                x="0"
                                y={-VIEW_H}
                                height={VIEW_H * 3}
                                initial={{ width: motionSafe ? 0 : VIEW_W }}
                                animate={{ width: VIEW_W }}
                                transition={
                                  motionSafe
                                    ? {
                                        ...springs.glide,
                                        delay: index * stagger,
                                      }
                                    : fade
                                }
                              />
                            </clipPath>
                          </defs>
                          <g clipPath={`url(#${baseId}-sweep-${metric.id})`}>
                            <motion.path
                              key={`${metric.id}-${signature}`}
                              d={linePath(metric.series)}
                              fill="none"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                              className={
                                metric.anomaly
                                  ? "stroke-warn"
                                  : "stroke-cobalt-bright"
                              }
                              initial={{ opacity: motionSafe ? 1 : 0 }}
                              animate={{ opacity: 1 }}
                              transition={fade}
                            />
                          </g>
                        </svg>
                      </motion.span>
                    </button>

                    <motion.div
                      id={bodyId}
                      className="overflow-clip [contain:paint]"
                      initial={false}
                      animate={{ height: open ? bodyHeight : 0 }}
                      transition={growTransition}
                    >
                      {open ? (
                        <TileBody
                          bodyRef={bodyRef}
                          metric={metric}
                          stats={stats}
                          format={format}
                        />
                      ) : null}
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
