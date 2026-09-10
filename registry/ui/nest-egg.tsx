"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NestEggProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The opening balance. @default 0 */
  principal?: number;
  /** The monthly contribution. */
  monthly: number;
  /** The horizon in years; the plot has a point per year. @default 30 */
  years?: number;
  /** The rate chips in percent per year; the vertical scale fits the highest. @default [3, 5, 7, 9] */
  rates?: number[];
  /** Controlled annual rate in percent. */
  rate?: number;
  /** Initial annual rate for uncontrolled usage. @default the middle chip */
  defaultRate?: number;
  /** Fires from the chip press or key. */
  onRateChange?: (rate: number) => void;
  /** Controlled scrub position in years. */
  year?: number;
  /** Initial scrub position for uncontrolled usage. @default years */
  defaultYear?: number;
  /** Fires from the pointer or key that moved the cursor. */
  onYearChange?: (year: number) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the chart; heading and slider label. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the chart exists to show.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** Pixels of travel before a press becomes a drag and captures the pointer. */
const SLOP = 4;
/** Headroom above the highest curve, as a share of the plot. */
const TOP = 0.06;

/** Rounded before it reaches an attribute, so server and client agree. */
const r3 = (value: number) => Number(value.toFixed(3));
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Balance after `k` years of monthly contributions compounded monthly. */
function balanceAt(
  principal: number,
  monthly: number,
  rate: number,
  k: number,
) {
  const i = rate / 100 / 12;
  const n = 12 * k;
  if (i === 0) return principal + monthly * n;
  const growth = Math.pow(1 + i, n);
  return principal * growth + (monthly * (growth - 1)) / i;
}

/**
 * Where a key sends a roving position: arrows step one, Page keys step `page`
 * (only where a page is offered), Home and End reach the ends, anything else
 * is not ours. Shared by the chips and the slider so both agree.
 */
function keyTarget(
  key: string,
  at: number,
  last: number,
  page?: number,
): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return at + 1;
    case "ArrowLeft":
    case "ArrowDown":
      return at - 1;
    case "PageUp":
      return page === undefined ? null : at + page;
    case "PageDown":
      return page === undefined ? null : at - page;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap` as the cursor lands. Hidden
 * from assistive technology: the slider's value text carries the figure.
 */
function RollingNumber({
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
        // figure gains or loses a digit, and only the new column mounts.
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

type Gesture = { id: number; startX: number; dragging: boolean; rect: DOMRect };

/**
 * A chart of a balance compounding over the years: a principal plus a monthly
 * contribution, compounded monthly at the chosen rate. On mount the curve
 * draws itself from year zero with `pathLength` on `glide` over a dashed line
 * of the contributions alone, so the gap between them — the growth — is the
 * picture. The plot is a slider: pressing or dragging reads the value at the
 * nearest year, a cursor and a dot travelling to it on `snap`, and a callout
 * above rolls the year's balance with the contributed and growth split
 * beneath. Changing the rate through the chips morphs the path on `glide` —
 * every path has the same point count, so the curve bends rather than
 * blinks — while the vertical scale stays fixed to the highest offered rate,
 * so a higher rate visibly lifts the curve instead of rescaling it away.
 *
 * The chips are a radio group with a roving tabindex; the plot is a slider
 * whose arrows step a year, Page keys five, and Home and End reach the ends.
 * Pointer capture waits for four pixels of travel, so a plain press sets the
 * nearest year and a synthetic sweep cannot throw. A status line holds the
 * sentence at the last settled year during a drag and catches up on release.
 * Under reduced motion the curve is already drawn, a rate change swaps the
 * path, the cursor jumps, and the digits swap in place.
 */
export function NestEgg({
  ref,
  principal = 0,
  monthly,
  years = 30,
  rates = [3, 5, 7, 9],
  rate,
  defaultRate,
  onRateChange,
  year,
  defaultYear,
  onYearChange,
  format = defaultFormat,
  label,
  className,
}: NestEggProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolledRate, setUncontrolledRate] = React.useState(
    () => defaultRate ?? rates[Math.floor((rates.length - 1) / 2)] ?? 0,
  );
  const currentRate = rate ?? uncontrolledRate;
  const rateIndex = Math.max(0, rates.indexOf(currentRate));
  const [uncontrolledYear, setUncontrolledYear] = React.useState(
    () => defaultYear ?? years,
  );
  const currentYear = clamp(Math.round(year ?? uncontrolledYear), 0, years);

  // The scale is fixed to the highest chip, so every curve shares one frame.
  const ceiling = Math.max(
    1,
    ...rates.map((r) => balanceAt(principal, monthly, r, years)),
  );
  const xOf = (k: number) => r3((k / years) * 100);
  const yOf = (value: number) =>
    r3(100 - clamp(value / ceiling, 0, 1) * (100 - TOP * 100));

  const points = Array.from({ length: years + 1 }, (_, k) => ({
    x: xOf(k),
    y: yOf(balanceAt(principal, monthly, currentRate, k)),
  }));
  const paidPoints = Array.from({ length: years + 1 }, (_, k) => ({
    x: xOf(k),
    y: yOf(principal + monthly * 12 * k),
  }));
  const lineOf = (list: { x: number; y: number }[]) =>
    list.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const curve = lineOf(points);
  const paid = lineOf(paidPoints);
  // The growth is shaded as one closed path — the curve forward, the
  // contributions back — so it morphs with the curve instead of re-mounting.
  const region = `${curve} ${[...paidPoints]
    .reverse()
    .map((p) => `L ${p.x} ${p.y}`)
    .join(" ")} Z`;

  const balance = balanceAt(principal, monthly, currentRate, currentYear);
  const contributed = principal + monthly * 12 * currentYear;
  const growth = Math.max(0, balance - contributed);
  const cursor = points[currentYear] ?? { x: 0, y: 100 };
  const sentenceAt = (k: number, r = currentRate) => {
    const value = balanceAt(principal, monthly, r, k);
    const paidIn = principal + monthly * 12 * k;
    return `Year ${k}, ${format(value)}, contributed ${format(paidIn)}, growth ${format(
      Math.max(0, value - paidIn),
    )}`;
  };
  const sentence = sentenceAt(currentYear);

  // The status line lags the drag on purpose: it reads the year the pointer
  // settled on, never every year it passed through.
  const [settled, setSettled] = React.useState(sentence);

  const commitYear = (next: number) => {
    const clamped = clamp(Math.round(next), 0, years);
    if (clamped === currentYear) return;
    if (year === undefined) setUncontrolledYear(clamped);
    onYearChange?.(clamped);
  };
  const selectRate = (next: number) => {
    if (next === currentRate) return;
    if (rate === undefined) setUncontrolledRate(next);
    onRateChange?.(next);
    setSettled(sentenceAt(currentYear, next));
  };
  const focusRate = (at: number) => {
    const next = rates[clamp(at, 0, rates.length - 1)];
    if (next === undefined) return;
    document.getElementById(`${baseId}-rate-${next}`)?.focus();
    selectRate(next);
  };

  const yearAt = (clientX: number, rect: DOMRect) =>
    clamp(Math.round(((clientX - rect.left) / rect.width) * years), 0, years);
  const gesture = React.useRef<Gesture | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
      rect,
    };
    event.currentTarget.focus();
    const next = yearAt(event.clientX, rect);
    commitYear(next);
    setSettled(sentenceAt(next));
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag, and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commitYear(yearAt(event.clientX, active.rect));
  };
  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    if (active.dragging)
      setSettled(sentenceAt(yearAt(event.clientX, active.rect)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = keyTarget(event.key, currentYear, years, 5);
    if (next === null) return;
    event.preventDefault();
    const clamped = clamp(next, 0, years);
    commitYear(clamped);
    setSettled(sentenceAt(clamped));
  };

  // The callout is clamped against real widths, never assumed: the observer's
  // own callback reports both, so no layout is read during render.
  const laneRef = React.useRef<HTMLDivElement | null>(null);
  const calloutRef = React.useRef<HTMLDivElement | null>(null);
  const [widths, setWidths] = React.useState<{
    lane: number;
    callout: number;
  } | null>(null);
  React.useEffect(() => {
    const lane = laneRef.current;
    const callout = calloutRef.current;
    if (!lane || !callout || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setWidths({ lane: lane.offsetWidth, callout: callout.offsetWidth }),
    );
    observer.observe(lane);
    observer.observe(callout);
    return () => observer.disconnect();
  }, []);
  const calloutX = widths
    ? clamp(
        (cursor.x / 100) * widths.lane - widths.callout / 2,
        0,
        Math.max(0, widths.lane - widths.callout),
      )
    : 0;

  const snap = motionSafe ? springs.snap : { duration: 0 };
  const glide = motionSafe ? springs.glide : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="text-[11px] text-ink-3 tabular-nums">
            {format(principal)} in, {format(monthly)} a month, {years} years
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="Annual rate"
          className="flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {rates.map((r, i) => {
            const checked = r === currentRate;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                id={`${baseId}-rate-${r}`}
                aria-checked={checked}
                tabIndex={i === rateIndex ? 0 : -1}
                onClick={() => selectRate(r)}
                onKeyDown={(event) => {
                  const target =
                    event.key === " "
                      ? i
                      : keyTarget(event.key, i, rates.length - 1);
                  if (target === null) return;
                  event.preventDefault();
                  focusRate(target);
                }}
                className={cn(
                  "flex min-w-9 items-center justify-center rounded-full px-2 font-mono text-xs font-medium tabular-nums transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {r}%
              </button>
            );
          })}
        </div>
      </div>

      <div ref={laneRef} aria-hidden className="relative flex">
        <motion.div
          ref={calloutRef}
          className="flex flex-col gap-0.5 rounded-2 border border-hairline bg-surface-0 px-2 py-1.5 whitespace-nowrap shadow-raised"
          initial={false}
          animate={{ x: calloutX, opacity: widths ? 1 : 0 }}
          transition={snap}
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Year {currentYear}
          </span>
          <span className="font-mono text-base leading-none font-medium text-ink">
            <RollingNumber value={format(balance)} motionSafe={motionSafe} />
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            In {format(contributed)} · Growth {format(growth)}
          </span>
        </motion.div>
      </div>

      <div
        role="slider"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={years}
        aria-valuenow={currentYear}
        aria-valuetext={sentence}
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative h-40 w-full cursor-crosshair touch-none rounded-2 border border-hairline bg-surface-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <motion.path
            d={region}
            className="fill-cobalt-wash"
            stroke="none"
            initial={motionSafe ? { d: region, opacity: 0 } : false}
            animate={{ d: region, opacity: 1 }}
            transition={{
              d: glide,
              opacity: { duration: durations.slow, ease: easings.enter },
            }}
          />
          <path
            d={paid}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className="text-hairline-strong"
          />
          {/* The draw is a clip sweeping from year zero, not a dash: a
              `pathLength` dash and `vector-effect: non-scaling-stroke` disagree
              in a stretched box, and the curve ends up stopping a third of the
              way along and staying there. */}
          <defs>
            <clipPath id={`${baseId}-sweep`}>
              <motion.rect
                x="0"
                y="-20"
                height="140"
                initial={{ width: motionSafe ? 0 : 100 }}
                animate={{ width: 100 }}
                transition={glide}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${baseId}-sweep)`}>
            <motion.path
              d={curve}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="text-cobalt-bright"
              // Bent in place by the rate: the same point count keeps the
              // morph a morph, never a remount.
              initial={motionSafe ? { d: curve } : false}
              animate={{ d: curve }}
              transition={{ d: glide }}
            />
          </g>
        </svg>

        <motion.span
          className="absolute inset-y-0 w-px bg-ink-3/60"
          initial={false}
          animate={{ left: `${cursor.x}%` }}
          transition={snap}
        >
          <motion.span
            className="absolute left-0 size-0"
            initial={false}
            animate={{ top: `${cursor.y}%` }}
            transition={snap}
          >
            <span className="absolute -top-1.5 -left-1.5 block size-3 rounded-full border-2 border-surface-1 bg-cobalt-bright shadow-raised" />
          </motion.span>
        </motion.span>
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>Year 0</span>
        <span>Year {years}</span>
      </div>

      <span role="status" className="sr-only">
        {settled}
      </span>
    </div>
  );
}
