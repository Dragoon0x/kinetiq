"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GasTrackerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The current reading, in `unit`. */
  value: number;
  /** Earlier readings, oldest first. The current one is appended for the strip. */
  history?: number[];
  /** The ceiling. Crossing it colours the readout and the bars above it. */
  threshold: number;
  /** Columns in the strip. The grid is fixed, so a long run cannot overflow. @default 28 */
  capacity?: number;
  /** Unit printed after every figure. @default "gu" */
  unit?: string;
  /** Formats every figure on the card. @default one decimal place */
  format?: (value: number) => string;
  /** Names the tracker for assistive technology. @default "Network fee" */
  label?: string;
  /** Controlled cursor: an index into the drawn window, or null for live. */
  selectedIndex?: number | null;
  /** Initial cursor for uncontrolled use. @default null */
  defaultSelectedIndex?: number | null;
  /** Fires from the pointer, key, or Escape that moved the cursor. */
  onSelectedIndexChange?: (index: number | null) => void;
  className?: string;
};

const NO_HISTORY: number[] = [];

const FEE = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const defaultFormat = (value: number): string => FEE.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new face on `snap`. The column is ten faces tall, so
 * a `y` of a tenth of its own height is exactly one digit, and `1ch` columns
 * with `tabular-nums` mean a roll never nudges the layout beside it. Hidden from
 * assistive technology: the value is spoken once, by the strip.
 */
function RollingFigure({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right, so gaining a digit mounts a new leading column
        // instead of re-labelling every existing one.
        const key = text.length - index;
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.15em] items-center justify-center"
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

/**
 * A fee readout with its own recent past. The headline rolls on `snap` — only
 * the columns that changed move — while the strip beneath extends: each reading
 * arrives at the right of a fixed grid and its bar scales up from its base on
 * `glide`, because a bar finding its height is a quantity settling rather than a
 * switch flipping. A dashed ceiling crosses the strip; bars at or above it are
 * drawn in warn, and a crossing tints the headline and rewrites the caption.
 *
 * The strip is a scrubber and a real `role="slider"`: pointing reads the nearest
 * column, ArrowLeft and ArrowRight step through the run, Home and End jump to
 * the oldest and the newest reading, and Escape releases the cursor back to
 * live. The cursor column lights on `flick`, the physics of a caret landing.
 *
 * Nothing ticks inside the card — the host samples and writes `value`. Under
 * reduced motion the digits swap in place and the bars still extend on a tween,
 * because the history is information rather than flourish.
 */
export function GasTracker({
  ref,
  value,
  history = NO_HISTORY,
  threshold,
  capacity = 28,
  unit = "gu",
  format = defaultFormat,
  label = "Network fee",
  selectedIndex,
  defaultSelectedIndex = null,
  onSelectedIndexChange,
  className,
}: GasTrackerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const columns = Math.max(4, Math.trunc(capacity));
  // Named, not `window`: shadowing the global inside a client component is a
  // trap waiting for the first person who reaches for matchMedia in here.
  const readings = [...history, value].slice(-columns);
  const last = readings.length - 1;

  const [uncontrolled, setUncontrolled] = React.useState<number | null>(
    defaultSelectedIndex,
  );
  const isControlled = selectedIndex !== undefined;
  const rawCursor = isControlled ? selectedIndex : uncontrolled;
  const cursor =
    rawCursor === null ? null : Math.min(last, Math.max(0, rawCursor));

  const move = (next: number | null) => {
    if (next === cursor) return;
    if (!isControlled) setUncontrolled(next);
    onSelectedIndexChange?.(next);
  };

  // Headroom above the tallest reading so the ceiling line and the peak both
  // stay inside the strip whichever is higher.
  const peak = Math.max(threshold, ...readings.map((entry) => Math.abs(entry)));
  const span = peak > 0 ? peak * 1.15 : 1;

  const previous = history[history.length - 1];
  const delta = previous === undefined ? 0 : value - previous;
  const rising = delta > 0;
  const settled = Math.abs(delta) < 0.05;
  const over = value >= threshold;

  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = React.useState(false);

  const pointTo = (clientX: number) => {
    const node = stripRef.current;
    if (!node || readings.length === 0) return;
    const box = node.getBoundingClientRect();
    if (box.width <= 0) return;
    // The run is right-aligned in a grid of `columns`, so the pointer maps to a
    // grid column first and only then back to a reading.
    const column = Math.floor(((clientX - box.left) / box.width) * columns);
    const index = column - (columns - readings.length);
    if (index < 0 || index > last) return;
    move(index);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const from = cursor ?? last;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        move(Math.min(last, from + 1));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        move(Math.max(0, from - 1));
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(last);
        break;
      case "Escape":
        move(null);
        break;
      default:
        break;
    }
  };

  const readingIndex = cursor ?? last;
  const reading = readings[readingIndex] ?? value;
  const ceilingText = `${format(threshold)} ${unit} ceiling`;
  const valueText = `Reading ${readingIndex + 1} of ${readings.length}, ${format(
    reading,
  )} ${unit}, ${reading >= threshold ? "above" : "below"} the ${ceilingText}${
    cursor === null ? ", live" : ""
  }`;

  const caption =
    cursor === null
      ? over
        ? `Above the ${ceilingText}`
        : `Under the ${ceilingText}`
      : `Reading ${readingIndex + 1} of ${readings.length} · ${format(reading)} ${unit}`;

  const linePercent = Number(
    ((Math.min(threshold, span) / span) * 100).toFixed(2),
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate text-[11px] font-medium text-ink-2"
        >
          {label}
        </span>
        <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-2 px-2 font-mono text-[10px] text-ink-3 tabular-nums">
          {ceilingText}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span
          className={cn(
            "flex items-baseline gap-1.5 font-mono text-2xl leading-none font-medium transition-colors",
            over ? "text-warn" : "text-ink",
          )}
        >
          <RollingFigure text={format(value)} motionSafe={motionSafe} />
          <span className="text-[11px] font-normal text-ink-3">{unit}</span>
        </span>

        {/* Keyed by direction: a reversal mounts a new chip that enters from a
            nudge, rather than one arrow spinning through the horizontal. */}
        <motion.span
          key={settled ? "flat" : rising ? "up" : "down"}
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 font-mono text-[10px] tabular-nums",
            settled
              ? "bg-surface-2 text-ink-3"
              : rising
                ? "bg-cobalt-wash text-warn"
                : "bg-cobalt-wash text-success",
          )}
          initial={
            motionSafe
              ? { y: rising ? distances.nudge : -distances.nudge, opacity: 0 }
              : { opacity: 0 }
          }
          animate={{ y: 0, opacity: 1 }}
          transition={
            motionSafe
              ? springs.snap
              : { duration: durations.fast, ease: easings.enter }
          }
        >
          <svg
            viewBox="0 0 8 8"
            aria-hidden
            className="size-2 shrink-0"
            fill="currentColor"
          >
            {settled ? (
              <rect x="1" y="3.4" width="6" height="1.2" rx="0.6" />
            ) : rising ? (
              <path d="M4 1 7 6.5H1Z" />
            ) : (
              <path d="M4 7 1 1.5h6Z" />
            )}
          </svg>
          {settled ? "flat" : `${rising ? "+" : "−"}${format(Math.abs(delta))}`}
        </motion.span>
      </div>

      <div
        ref={stripRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, last)}
        aria-valuenow={readingIndex}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerMove={(event) => pointTo(event.clientX)}
        onPointerLeave={() => {
          // A cursor placed with the arrow keys outlives the mouse wandering
          // off; only a pointer-only reading is released on leave.
          if (!focused) move(null);
        }}
        className={cn(
          // Default stretch alignment, not items-end: the columns must fill the
          // row so each bar has a full-height box to scale inside.
          "relative grid h-16 gap-[2px] rounded-2 bg-surface-1 p-1 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {readings.map((entry, index) => {
          const height = Math.min(1, Math.max(0, Math.abs(entry) / span));
          const isCursor = index === readingIndex && cursor !== null;
          const hot = entry >= threshold;
          return (
            <span
              key={index}
              aria-hidden
              style={{
                gridColumnStart: columns - readings.length + 1 + index,
                gridRowStart: 1,
              }}
              className="relative flex h-full items-end"
            >
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-[2px] bg-cobalt-wash"
                initial={false}
                animate={{ opacity: isCursor ? 1 : 0 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.blink }
                }
              />
              <motion.span
                className={cn(
                  "relative block w-full origin-bottom rounded-[2px] transition-colors",
                  isCursor ? "bg-ink" : hot ? "bg-warn" : "bg-cobalt-bright",
                )}
                style={{ height: "100%" }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: height }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.base, ease: easings.enter }
                }
              />
            </span>
          );
        })}

        {/* The ceiling is measured against the bars' own box, not the padded
            strip, so the line and the bar tops share one scale. */}
        <span aria-hidden className="pointer-events-none absolute inset-1">
          <span
            style={{ bottom: `${linePercent}%` }}
            className="absolute inset-x-0 border-t border-dashed border-hairline-strong"
          />
        </span>
      </div>

      <p
        className={cn(
          "truncate font-mono text-[10px]",
          cursor === null && over ? "text-warn" : "text-ink-3",
        )}
        title={caption}
      >
        {caption}
      </p>

      {/* Derived from the crossing, so it speaks when the verdict changes and
          not once per sample. */}
      <span role="status" className="sr-only">
        {over
          ? `${label} above the ${ceilingText}.`
          : `${label} under the ${ceilingText}.`}
      </span>
    </div>
  );
}
