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

export type LatencyBucket = {
  /** Lower edge of the bucket, in `unit`. */
  from: number;
  /** Upper edge; omit on the last bucket to make it open-ended. */
  to?: number;
  /** How many requests landed in it. */
  count: number;
};

export type Percentile = "p50" | "p95" | "p99";

export type BucketReading = {
  index: number;
  from: number;
  /** Null on an open-ended bucket. */
  to: number | null;
  count: number;
  /** Share of the whole window, 0–1, rounded to six decimals. */
  share: number;
};

export type PercentileMarks = Record<Percentile, number>;

export type LatencyHistProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered buckets; the last one may leave `to` off to run open-ended. */
  buckets: LatencyBucket[];
  /** Controlled pinned percentile. */
  pinned?: Percentile | null;
  /** Initial pin for uncontrolled usage. @default null */
  defaultPinned?: Percentile | null;
  /** Fires from the press or key that pinned or released a percentile. */
  onPinnedChange?: (pinned: Percentile | null) => void;
  /** The computed marks — a reading, so it also fires on the first commit. */
  onPercentilesChange?: (marks: PercentileMarks) => void;
  /** The bucket under pointer or focus; also fires on the first commit. */
  onBucketChange?: (bucket: BucketReading | null) => void;
  /** Printed after every latency figure. @default "ms" */
  unit?: string;
  /** The same unit, spoken in full. @default "milliseconds" */
  unitLong?: string;
  /** The window these buckets cover, printed in the header. */
  windowLabel?: string;
  /** Names the chart and its bar list. @default "Latency" */
  label?: string;
  /** Plot height in px; the width is fluid. @default 96 */
  height?: number;
  className?: string;
};

const QUANTILES: Record<Percentile, number> = {
  p50: 0.5,
  p95: 0.95,
  p99: 0.99,
};
const ORDER: Percentile[] = ["p50", "p95", "p99"];

/** An explicit locale: the visitor's would format differently from the server's. */
const counts = new Intl.NumberFormat("en-US");

const requestPhrase = (count: number): string =>
  `${counts.format(count)} ${count === 1 ? "request" : "requests"}`;

/** Three decimals before any percentage reaches a style — an unrounded ratio
 *  serialises differently in Node and the browser, which is a hydration error
 *  rather than a rounding one. */
const pct = (value: number): string =>
  `${Number(Math.min(100, Math.max(0, value)).toFixed(3))}%`;

const sharePhrase = (share: number): string => {
  const percent = share * 100;
  if (share > 0 && percent < 1) return "less than 1 percent of the window";
  return `${Math.round(percent)} percent of the window`;
};

type Bin = {
  from: number;
  to: number | null;
  /** Numeric width, used only for placing a mark inside the bucket. */
  span: number;
  count: number;
};

type Mark = {
  /** The latency the percentile lands on, already rounded. */
  value: number;
  /** Index of the bucket it falls in. */
  index: number;
  /** Position across the bins as a share, 0–1. */
  position: number;
};

/** Walks the cumulative counts and lands the quantile inside its bucket. */
function markAt(bins: Bin[], total: number, quantile: number): Mark | null {
  if (total <= 0 || bins.length === 0) return null;
  const target = quantile * total;
  let cumulative = 0;
  for (let index = 0; index < bins.length; index += 1) {
    const bin = bins[index];
    if (!bin) continue;
    const next = cumulative + bin.count;
    if (next >= target || index === bins.length - 1) {
      const within =
        bin.count > 0
          ? Math.min(1, Math.max(0, (target - cumulative) / bin.count))
          : 1;
      return {
        value: Math.round(bin.from + bin.span * within),
        index,
        position: (index + within) / bins.length,
      };
    }
    cumulative = next;
  }
  return null;
}

/**
 * Where the requests fall. Each bucket is a bar that scales up from its own
 * baseline on `glide` in a `cascade()` sweep, so a distribution arrives as one
 * gesture and a new window re-shapes the same bars rather than mounting a new
 * chart. The p50, p95 and p99 marks stand on the same axis and slide to their
 * new places on `snap` — an indicator changing position, one crisp overshoot.
 *
 * Hover or focus a bar and the header reads the bucket back; the outgoing and
 * incoming readings stack in one grid cell and cross-fade rather than swapping
 * through `mode="wait"`, so arrow-key travel can never blank the line. Pressing
 * a percentile chip pins it: the bars at or below the mark keep their tone while
 * everything past it drops to the hairline, and a wash runs to the mark.
 *
 * The bars are a real list of buttons with a roving tabindex — Left and Right
 * step, Home and End jump, Enter or Space latches a reading — and every bar
 * names itself as one sentence, so the distribution is available in words and
 * not only as a shape. Under reduced motion the bars still take their heights,
 * because a distribution is information, but on a tween with no stagger and
 * nothing that travels.
 */
export function LatencyHist({
  ref,
  buckets,
  pinned,
  defaultPinned = null,
  onPinnedChange,
  onPercentilesChange,
  onBucketChange,
  unit = "ms",
  unitLong = "milliseconds",
  windowLabel,
  label = "Latency",
  height = 96,
  className,
}: LatencyHistProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownPin, setOwnPin] = React.useState<Percentile | null>(defaultPinned);
  const pin = pinned !== undefined ? pinned : ownPin;

  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [latchIndex, setLatchIndex] = React.useState<number | null>(null);
  const [hoverPin, setHoverPin] = React.useState<Percentile | null>(null);

  const bins = React.useMemo<Bin[]>(
    () =>
      buckets.map((bucket, index) => {
        const previous = buckets[index - 1];
        const span =
          bucket.to != null
            ? bucket.to - bucket.from
            : previous
              ? bucket.from - previous.from
              : bucket.from;
        return {
          from: bucket.from,
          to: bucket.to ?? null,
          span: Math.max(1, span),
          count: Math.max(0, bucket.count),
        };
      }),
    [buckets],
  );

  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const tallest = bins.reduce((high, bin) => Math.max(high, bin.count), 0);

  const marks = React.useMemo(() => {
    const out = {} as Record<Percentile, Mark | null>;
    for (const name of ORDER) out[name] = markAt(bins, total, QUANTILES[name]);
    return out;
  }, [bins, total]);

  const p50 = marks.p50?.value ?? 0;
  const p95 = marks.p95?.value ?? 0;
  const p99 = marks.p99?.value ?? 0;

  const activeIndex = hoverIndex ?? focusIndex ?? latchIndex;
  const activeBin = activeIndex === null ? undefined : bins[activeIndex];

  const readBin = (bin: Bin): string =>
    bin.to === null
      ? `${bin.from} ${unit} and over`
      : `${bin.from}–${bin.to} ${unit}`;

  const speakBin = (bin: Bin, index: number): string => {
    const share = total > 0 ? bin.count / total : 0;
    const range =
      bin.to === null
        ? `${bin.from} ${unitLong} and over`
        : `${bin.from} to ${bin.to} ${unitLong}`;
    return `${range}, ${requestPhrase(bin.count)}, ${sharePhrase(share)}. Bucket ${index + 1} of ${bins.length}.`;
  };

  // A held chip reads its own mark in the same cell rather than growing a
  // label on the rule: a tag on a mark near the right edge would hang outside
  // the plot, and an overlay never leaves the component's own box.
  const heldPin = hoverPin ?? pin;
  const heldMark = heldPin ? marks[heldPin] : null;
  const reading =
    activeBin && activeIndex !== null
      ? `${readBin(activeBin)} · ${counts.format(activeBin.count)} req`
      : total === 0
        ? "No requests in this window."
        : heldPin && heldMark
          ? `${heldPin} · ${heldMark.value} ${unit}`
          : `p50 ${p50} · p95 ${p95} · p99 ${p99} ${unit}`;

  // The spoken line is frozen at the moment the pin changes, so a controlled
  // host is never announced ahead of its own answer. Setting during render
  // means this pass already reads the NEW freeze.
  const pinKey = pin ?? "none";
  const [spoken, setSpoken] = React.useState({ key: pinKey, sentence: "" });
  if (spoken.key !== pinKey) {
    const mark = pin ? marks[pin] : null;
    setSpoken({
      key: pinKey,
      sentence:
        pin && mark
          ? `Pinned ${pin} at ${mark.value} ${unitLong}. ${Math.round(QUANTILES[pin] * 100)} percent of requests are at or below it.`
          : "Pin released.",
    });
  }

  const callbacks = React.useRef({ onPercentilesChange, onBucketChange });
  React.useEffect(() => {
    callbacks.current = { onPercentilesChange, onBucketChange };
  });

  // Marks and the active bucket are readings, not events: they report from the
  // first commit too, so a host that mounts with data shows the same numbers
  // the chart does.
  React.useEffect(() => {
    callbacks.current.onPercentilesChange?.({ p50, p95, p99 });
  }, [p50, p95, p99]);

  React.useEffect(() => {
    const bin = activeIndex === null ? undefined : bins[activeIndex];
    if (!bin || activeIndex === null) {
      callbacks.current.onBucketChange?.(null);
      return;
    }
    callbacks.current.onBucketChange?.({
      index: activeIndex,
      from: bin.from,
      to: bin.to,
      count: bin.count,
      share: total > 0 ? Number((bin.count / total).toFixed(6)) : 0,
    });
  }, [activeIndex, bins, total]);

  const setPin = (next: Percentile | null) => {
    if (pinned === undefined) setOwnPin(next);
    onPinnedChange?.(next);
  };

  const focusBar = (index: number) => {
    const clamped = Math.min(bins.length - 1, Math.max(0, index));
    if (!bins[clamped]) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-bar-${clamped}`)?.focus();
  };

  const onBarKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusBar(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusBar(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusBar(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusBar(bins.length - 1);
    }
  };

  const rovingIndex =
    focusIndex !== null && bins[focusIndex]
      ? focusIndex
      : latchIndex !== null && bins[latchIndex]
        ? latchIndex
        : 0;

  const stagger = cascade(Math.max(bins.length, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const pinMark = pin ? marks[pin] : null;
  const last = bins[bins.length - 1];
  const axisTo = last
    ? last.to === null
      ? `${last.from}+`
      : `${last.to}`
    : "0";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
          {windowLabel ? ` · ${windowLabel}` : ""}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          {counts.format(total)} req
        </span>
      </div>

      {/* One cell, two readings, cross-faded: arrow-key travel through the
          bars must never leave the line empty for a frame. */}
      <div aria-hidden className="grid h-4 items-center">
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
      </div>

      <div className="relative w-full" style={{ height }}>
        {/* The wash reaches the pinned mark, so "at or below" is a region and
            not an inference from two tones. */}
        <AnimatePresence initial={false}>
          {pinMark ? (
            <motion.span
              key="pin-wash"
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 rounded-1 bg-cobalt-wash"
              // The width is in the initial too: motion would otherwise
              // interpolate from a computed 0px to a percentage on mount.
              initial={{ opacity: 0, width: pct(pinMark.position * 100) }}
              animate={{ opacity: 1, width: pct(pinMark.position * 100) }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.snap : fade}
            />
          ) : null}
        </AnimatePresence>

        <ol
          role="list"
          aria-label={`${label} distribution`}
          className="absolute inset-0 flex items-end gap-[2px]"
        >
          {bins.map((bin, index) => {
            const share = tallest > 0 ? bin.count / tallest : 0;
            const drawn = bin.count > 0 ? Math.max(0.02, share) : 0;
            const past = pinMark ? index > pinMark.index : false;
            const isActive = activeIndex === index;
            return (
              <li
                key={`${bin.from}-${index}`}
                className="h-full min-w-0 flex-1"
              >
                <button
                  type="button"
                  id={`${baseId}-bar-${index}`}
                  tabIndex={index === rovingIndex ? 0 : -1}
                  aria-pressed={latchIndex === index}
                  aria-label={speakBin(bin, index)}
                  onPointerEnter={() => setHoverIndex(index)}
                  onPointerLeave={() =>
                    setHoverIndex((previous) =>
                      previous === index ? null : previous,
                    )
                  }
                  onFocus={() => setFocusIndex(index)}
                  onBlur={() =>
                    setFocusIndex((previous) =>
                      previous === index ? null : previous,
                    )
                  }
                  onClick={() =>
                    setLatchIndex((previous) =>
                      previous === index ? null : index,
                    )
                  }
                  onKeyDown={(event) => onBarKeyDown(event, index)}
                  className={cn(
                    "relative flex h-full w-full items-end rounded-1 transition-colors outline-none",
                    isActive ? "bg-accent" : "hover:bg-accent",
                    "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring",
                  )}
                >
                  <span className="relative block h-full w-full">
                    <motion.span
                      className={cn(
                        "absolute inset-0 origin-bottom rounded-1 transition-colors",
                        past
                          ? "bg-hairline-strong"
                          : isActive
                            ? "bg-cobalt"
                            : "bg-cobalt-bright",
                      )}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: Number(drawn.toFixed(6)) }}
                      transition={
                        motionSafe ? { ...grow, delay: index * stagger } : grow
                      }
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Rules ride above the bars and take no pointer events, so a mark can
            never steal a bucket's hover. */}
        {ORDER.map((name) => {
          const mark = marks[name];
          if (!mark) return null;
          const lit = heldPin === name;
          return (
            <motion.span
              key={name}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 flex w-0 justify-center"
              initial={false}
              animate={{ left: pct(mark.position * 100) }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <motion.span
                className={cn(
                  "block h-full w-px transition-colors",
                  lit ? "bg-ink" : "bg-ink-3/50",
                )}
                initial={false}
                animate={{ scaleX: lit ? 2 : 1 }}
                transition={motionSafe ? springs.flick : fade}
              />
            </motion.span>
          );
        })}
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>
          {bins[0]?.from ?? 0} {unit}
        </span>
        <span className="mx-2 h-px flex-1 bg-hairline" />
        <span>
          {axisTo} {unit}
        </span>
      </div>

      <div role="group" aria-label="Percentile marks" className="flex gap-1.5">
        {ORDER.map((name) => {
          const mark = marks[name];
          const on = pin === name;
          return (
            <button
              key={name}
              type="button"
              disabled={!mark}
              aria-pressed={on}
              aria-label={`Pin ${name} at ${mark ? mark.value : 0} ${unitLong}.`}
              onClick={() => setPin(on ? null : name)}
              onPointerEnter={() => setHoverPin(name)}
              onPointerLeave={() =>
                setHoverPin((previous) => (previous === name ? null : previous))
              }
              onFocus={() => setHoverPin(name)}
              onBlur={() =>
                setHoverPin((previous) => (previous === name ? null : previous))
              }
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-between gap-1 rounded-2 border px-2 font-mono text-[10px] transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                "disabled:opacity-50",
                on
                  ? "border-transparent bg-cobalt-bright text-primary-foreground"
                  : "border-hairline-strong text-ink hover:bg-accent",
              )}
            >
              <span className="shrink-0 tracking-[0.08em] uppercase">
                {name}
              </span>
              <span className="min-w-0 truncate tabular-nums">
                {mark ? mark.value : 0} {unit}
              </span>
            </button>
          );
        })}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
