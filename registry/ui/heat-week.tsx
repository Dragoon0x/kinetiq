"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CellReading = {
  /** Row index into `days`. */
  day: number;
  /** Hour of the day, 0–23. */
  hour: number;
  value: number;
};

export type HeatWeekProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** One row per day, one reading per hour; a short row reads as gaps. */
  values: number[][];
  /** Row names in full, spoken and abbreviated for the rail. */
  days?: string[];
  /** Value at or above which a cell reads warn. @default 0.8 of the peak */
  hotAt?: number;
  /** Printed after every value. @default "rps" */
  unit?: string;
  /** The same unit, spoken in full. @default "requests per second" */
  unitLong?: string;
  /** Controlled isolated row index. */
  day?: number | null;
  /** Initial isolated row for uncontrolled usage. @default null */
  defaultDay?: number | null;
  /** Fires from the press or key that isolated or released a day. */
  onDayChange?: (day: number | null) => void;
  /** The cell under pointer or focus; also fires on the first commit. */
  onCellChange?: (cell: CellReading | null) => void;
  /** Renders every value, so a host changes units in one place. */
  format?: (value: number) => string;
  /** Names the grid. @default "Week" */
  label?: string;
  className?: string;
};

const HOURS = 24;

const WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const clock = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

/** Three decimals before an opacity reaches a motion value: an unrounded ratio
 *  serialises differently in Node and the browser. */
const round3 = (value: number): number => Number(value.toFixed(3));

type Peak = { hour: number; value: number } | null;

/**
 * Every hour of the week, coloured. Each cell carries one hour's reading as
 * opacity over a single token — cobalt below the hot mark, warn at or above it
 * — so the week reads in both themes without a hex anywhere. The cells warm on
 * arrival column by column, staggered by `cascade(24)` rather than across all
 * 168 cells, because a per-cell stagger would take three seconds and read as
 * lag rather than as a sweep.
 *
 * Hovering or focusing a cell lifts it on `flick` and reads it back in the
 * header; the outgoing and incoming readings stack in one grid cell and
 * cross-fade, so travelling the week on the arrow keys never blanks the line.
 * Selecting a day's row header isolates it: the other six rows fade to a
 * quarter on a tween while the header reads that day's peak.
 *
 * It is a real `role="grid"` — each row a `role="row"`, its first cell a
 * `role="rowheader"` that carries the isolation, the rest `role="gridcell"`.
 * Arrow keys move in two dimensions, Home and End reach the ends of a row,
 * Ctrl+Home and Ctrl+End the corners of the week, and Enter or Space isolates
 * the focused cell's day. Every cell names itself as one sentence, so the heat
 * is available in words and not only as colour. Under reduced motion the cells
 * arrive at their intensity with no stagger and no lift — the heat is the
 * information, the sweep was the flourish.
 */
export function HeatWeek({
  ref,
  values,
  days = WEEK,
  hotAt,
  unit = "rps",
  unitLong = "requests per second",
  day,
  defaultDay = null,
  onDayChange,
  onCellChange,
  format,
  label = "Week",
  className,
}: HeatWeekProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownDay, setOwnDay] = React.useState<number | null>(defaultDay);
  const isolated = day !== undefined ? day : ownDay;

  const [focusCell, setFocusCell] = React.useState({ row: 0, col: 0 });
  const [hover, setHover] = React.useState<CellReading | null>(null);
  const [focused, setFocused] = React.useState<CellReading | null>(null);

  const rows = React.useMemo(
    () =>
      days.map((name, index) => ({
        name,
        readings: Array.from({ length: HOURS }, (_, hour) => {
          const row = values[index];
          const value = row?.[hour];
          return typeof value === "number" && Number.isFinite(value)
            ? value
            : null;
        }),
      })),
    [days, values],
  );

  // Plain loops rather than callbacks: a `let` assigned inside a closure keeps
  // its declared type here, which is what the peak lookups need.
  const dayPeaks = React.useMemo<Peak[]>(
    () =>
      rows.map((row) => {
        let best: Peak = null;
        for (let hour = 0; hour < row.readings.length; hour += 1) {
          const value = row.readings[hour];
          if (value === null || value === undefined) continue;
          if (best === null || value > best.value) best = { hour, value };
        }
        return best;
      }),
    [rows],
  );

  const peak = React.useMemo(() => {
    let best: { row: number; hour: number; value: number } | null = null;
    for (let index = 0; index < dayPeaks.length; index += 1) {
      const dayBest = dayPeaks[index];
      if (!dayBest) continue;
      if (best === null || dayBest.value > best.value) {
        best = { row: index, hour: dayBest.hour, value: dayBest.value };
      }
    }
    return best;
  }, [dayPeaks]);

  const top = peak ? peak.value : 0;
  const hot = hotAt ?? top * 0.8;

  const print = React.useCallback(
    (value: number) => (format ? format(value) : String(Math.round(value))),
    [format],
  );

  const active = hover ?? focused;
  const isolatedName = isolated === null ? null : (days[isolated] ?? null);
  const isolatedPeak = isolated === null ? null : (dayPeaks[isolated] ?? null);

  const reading = active
    ? `${(days[active.day] ?? "").slice(0, 3)} ${clock(active.hour)} · ${print(active.value)} ${unit}`
    : isolatedName && isolatedPeak
      ? `${isolatedName.slice(0, 3)} · peak ${print(isolatedPeak.value)} ${unit} at ${clock(isolatedPeak.hour)}`
      : peak
        ? `Peak ${(days[peak.row] ?? "").slice(0, 3)} ${clock(peak.hour)} · ${print(peak.value)} ${unit}`
        : "No readings this week.";

  // The spoken line is frozen at the moment isolation changes, so a controlled
  // host is never announced ahead of its own answer; setting during render
  // means this pass already reads the NEW freeze.
  const isolationKey = isolated === null ? "all" : String(isolated);
  const [spoken, setSpoken] = React.useState({
    key: isolationKey,
    sentence: "",
  });
  if (spoken.key !== isolationKey) {
    const name = isolated === null ? null : (days[isolated] ?? null);
    const best = isolated === null ? null : (dayPeaks[isolated] ?? null);
    setSpoken({
      key: isolationKey,
      sentence:
        name && best
          ? `${name} isolated. Peak ${print(best.value)} ${unitLong} at ${clock(best.hour)}.`
          : name
            ? `${name} isolated, with no readings.`
            : `All ${days.length} days shown.`,
    });
  }

  const cellRef = React.useRef(onCellChange);
  React.useEffect(() => {
    cellRef.current = onCellChange;
  });
  // A reading is a state, not an event: it reports from the first commit too,
  // so a host that mounts beside the grid is never a frame behind it.
  const activeDay = active ? active.day : null;
  const activeHour = active ? active.hour : null;
  const activeValue = active ? active.value : null;
  React.useEffect(() => {
    if (activeDay === null || activeHour === null || activeValue === null) {
      cellRef.current?.(null);
      return;
    }
    cellRef.current?.({ day: activeDay, hour: activeHour, value: activeValue });
  }, [activeDay, activeHour, activeValue]);

  const setIsolated = (next: number | null) => {
    if (day === undefined) setOwnDay(next);
    onDayChange?.(next);
  };

  const cellId = (row: number, col: number) => `${baseId}-c-${row}-${col}`;

  const moveFocus = (row: number, col: number) => {
    const nextRow = Math.min(rows.length - 1, Math.max(0, row));
    const nextCol = Math.min(HOURS, Math.max(0, col));
    setFocusCell({ row: nextRow, col: nextCol });
    document.getElementById(cellId(nextRow, nextCol))?.focus();
  };

  const onCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    row: number,
    col: number,
  ) => {
    const jump = event.ctrlKey || event.metaKey;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(row, col + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(row, col - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(row + 1, col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(row - 1, col);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(jump ? 0 : row, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(jump ? rows.length - 1 : row, HOURS);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsolated(isolated === row ? null : row);
    }
  };

  const stagger = cascade(HOURS);
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const warmth = { duration: durations.base, ease: easings.enter } as const;
  const lift = motionSafe ? springs.flick : { duration: 0 };

  const focusRow = Math.min(rows.length - 1, Math.max(0, focusCell.row));
  const focusCol = Math.min(HOURS, Math.max(0, focusCell.col));

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        {/* One cell, two readings, cross-faded: arrow-key travel across the
            week must never leave the line empty for a frame. */}
        <span aria-hidden className="grid min-w-0 justify-items-end">
          <AnimatePresence initial={false}>
            <motion.span
              key={reading}
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {reading}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        role="grid"
        aria-label={`${label} by hour`}
        className="flex flex-col gap-[2px]"
      >
        {rows.map((row, rowIndex) => {
          const dim = isolated === null || isolated === rowIndex ? 1 : 0.22;
          const best = dayPeaks[rowIndex] ?? null;
          const chosen = isolated === rowIndex;
          return (
            <div
              key={`${rowIndex}-${row.name}`}
              role="row"
              className="flex items-center gap-[2px]"
            >
              <div
                role="rowheader"
                id={cellId(rowIndex, 0)}
                tabIndex={rowIndex === focusRow && focusCol === 0 ? 0 : -1}
                aria-selected={chosen}
                aria-label={
                  best
                    ? `${row.name}, ${chosen ? "showing this day alone" : "isolate this day"}. Peak ${print(best.value)} ${unitLong} at ${clock(best.hour)}.`
                    : `${row.name}, no readings.`
                }
                onClick={() => setIsolated(chosen ? null : rowIndex)}
                onKeyDown={(event) => onCellKeyDown(event, rowIndex, 0)}
                onFocus={() => setFocusCell({ row: rowIndex, col: 0 })}
                className={cn(
                  "w-9 shrink-0 cursor-pointer rounded-1 pr-1 text-right font-mono text-[10px] transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring",
                  chosen ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {row.name.slice(0, 3)}
              </div>

              {row.readings.map((value, hour) => {
                const share = value !== null && top > 0 ? value / top : 0;
                const intensity = value === null ? 0 : 0.08 + 0.92 * share;
                const isHot = value !== null && value >= hot;
                const isActive =
                  active !== null &&
                  active.day === rowIndex &&
                  active.hour === hour;
                return (
                  <div
                    key={hour}
                    role="gridcell"
                    id={cellId(rowIndex, hour + 1)}
                    tabIndex={
                      rowIndex === focusRow && focusCol === hour + 1 ? 0 : -1
                    }
                    aria-label={
                      value === null
                        ? `${row.name} ${clock(hour)}, no reading.`
                        : `${row.name} ${clock(hour)}, ${print(value)} ${unitLong}.`
                    }
                    onPointerEnter={() =>
                      setHover(
                        value === null ? null : { day: rowIndex, hour, value },
                      )
                    }
                    onPointerLeave={() =>
                      setHover((previous) =>
                        previous !== null &&
                        previous.day === rowIndex &&
                        previous.hour === hour
                          ? null
                          : previous,
                      )
                    }
                    onFocus={() => {
                      setFocusCell({ row: rowIndex, col: hour + 1 });
                      setFocused(
                        value === null ? null : { day: rowIndex, hour, value },
                      );
                    }}
                    onBlur={() =>
                      setFocused((previous) =>
                        previous !== null &&
                        previous.day === rowIndex &&
                        previous.hour === hour
                          ? null
                          : previous,
                      )
                    }
                    onKeyDown={(event) =>
                      onCellKeyDown(event, rowIndex, hour + 1)
                    }
                    className={cn(
                      "relative aspect-square min-w-0 flex-1 rounded-[2px] bg-hairline outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      isActive && "z-10",
                      // Reduced motion loses the lift, so the held cell is
                      // marked with a ring instead — the readout must never be
                      // the only sign of which cell it belongs to.
                      isActive && !motionSafe && "ring-1 ring-ink",
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className={cn(
                        "absolute inset-0 rounded-[2px]",
                        isHot ? "bg-warn" : "bg-cobalt-bright",
                      )}
                      initial={{ opacity: 0, scale: 1 }}
                      animate={{
                        opacity: round3(intensity * dim),
                        scale: isActive && motionSafe ? 1.35 : 1,
                      }}
                      // The warm-in sweeps by column; the lift is its own
                      // spring so a hover never waits on the sweep's delay.
                      transition={{
                        opacity: motionSafe
                          ? { ...warmth, delay: hour * stagger }
                          : warmth,
                        scale: lift,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        aria-hidden
        className="flex items-center gap-[2px] font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span className="w-9 shrink-0" />
        <span className="flex min-w-0 flex-1 justify-between">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
