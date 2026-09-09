"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InterestDripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The balance at day 0. */
  principal: number;
  /** Annual percentage yield as a fraction — 0.0305 for 3.05%. */
  rate: number;
  /** Runs the accrual timer. It pauses itself while the tab is hidden. @default false */
  playing?: boolean;
  /** Milliseconds between ticks. @default 900 */
  tickMs?: number;
  /** Simulated days advanced per tick — an hour by default, so the drip is fractions. @default 1 / 24 */
  stepDays?: number;
  /** How far the projection line looks ahead. @default 365 */
  horizonDays?: number;
  /** Formats the balance and the daily rate. */
  format?: (value: number) => string;
  /** Names the balance. */
  label: string;
  /** Fires from each timer tick with the compounded balance and elapsed days. */
  onTick?: (balance: number, days: number) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure that is the whole instrument.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Chart geometry: samples along the curve, its drawn height, its inset. */
const SAMPLES = 24;
const CHART_H = 64;
const INSET = 4;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the timer. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digit columns that roll to the new figure on `snap`. Each column is a strip
 * of ten faces moved by a percentage of its own height, so one `y` is exactly
 * one digit and the layout never shifts. Hidden from assistive technology: the
 * figure's sr-only text already carries the amount as one string.
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
        // balance gains a digit and only the new column mounts.
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
 * A savings balance with the interest accruing in front of you. While
 * `playing`, a timer advances simulated time by `stepDays` every `tickMs`; the
 * balance compounds at `rate` and two faint sub-cent digits tick up by
 * fractions, each tick a soft pulse — signal ink fading back to muted over
 * `durations.slow`. When a whole cent rolls over, the figure's cent column
 * rolls on `snap`. Hovering or focusing the figure raises a card with the daily
 * rate, arriving from `distances.nudge` on the enter ease.
 *
 * Beneath, a projection line draws the compounding path to `horizonDays`: the
 * elapsed part is solid and extends on `glide` as days pass, a marker riding
 * the frontier; the rest is dashed. Changing `rate` morphs the path on `glide`.
 * The timer lives in an effect with cleanup, runs only while playing and the
 * tab is visible, and never reads a clock — time here is counted, not sampled.
 *
 * The figure is a button described by the rate sentence, the chart is an image
 * with a sentence for a name, and a polite live region reports each whole day
 * and each pause rather than every tick. Under reduced motion the pulse is
 * already colour only; the cent column swaps, the card fades without travel,
 * and the line's length swaps on a tween. The drip still drips.
 */
export function InterestDrip({
  ref,
  principal,
  rate,
  playing = false,
  tickMs = 900,
  stepDays = 1 / 24,
  horizonDays = 365,
  format = defaultFormat,
  label,
  onTick,
  className,
}: InterestDripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const tipId = `${baseId}-rate`;
  const clipId = `${baseId}-clip`;

  const [days, setDays] = React.useState(0);
  const [ticks, setTicks] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);

  // A timer in a hidden tab is a battery leak, and a balance that jumps when
  // the tab comes back is a lie about when the money arrived — so it pauses.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const balanceAt = (at: number) =>
    principal * Math.pow(1 + Math.max(0, rate), at / 365);
  const balanceRef = useLatest(balanceAt);
  const tickRef = useLatest(onTick);
  const daysRef = useLatest(days);

  React.useEffect(() => {
    if (!playing || !visible) return;
    // Counted locally so a burst of ticks between renders cannot double-read
    // a stale value; the ref only seeds the run.
    let elapsed = daysRef.current;
    const timer = window.setInterval(
      () => {
        elapsed += stepDays;
        setDays(elapsed);
        setTicks((count) => count + 1);
        tickRef.current?.(balanceRef.current(elapsed), elapsed);
      },
      Math.max(60, tickMs),
    );
    return () => window.clearInterval(timer);
  }, [playing, visible, tickMs, stepDays, daysRef, tickRef, balanceRef]);

  // The chart's width is measured so a stroke is one pixel and a dash is a
  // dash — a stretched viewBox would smear both.
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = React.useState(320);
  React.useEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const balance = balanceAt(days);
  const earned = Math.max(0, balance - principal);
  // Rounded first: 12480.37 × 100 lands a hair under an integer in floating
  // point, and a floor there would print a cent that never existed.
  const cents = Math.round(balance * 1e6) / 1e4;
  const wholeCents = Math.floor(cents);
  const sub = Math.min(99, Math.max(0, Math.floor((cents - wholeCents) * 100)));
  const shown = format(wholeCents / 100);
  const daily = balance * (Math.pow(1 + Math.max(0, rate), 1 / 365) - 1);
  const apy = `${(Math.max(0, rate) * 100).toFixed(2)}% APY`;
  const rateSentence = `${format(daily)} a day at ${apy}`;

  const horizon = Math.max(1, horizonDays);
  const projected = balanceAt(horizon);
  const rise = Math.max(projected - principal, 1e-9);
  const width = Math.max(1, chartWidth);
  const points = Array.from({ length: SAMPLES + 1 }, (_, index) => {
    const at = (index / SAMPLES) * horizon;
    const x = (index / SAMPLES) * width;
    const y =
      CHART_H -
      INSET -
      ((balanceAt(at) - principal) / rise) * (CHART_H - 2 * INSET);
    // Rounded before it becomes an attribute: pow can differ in its last
    // digits between runtimes, and a mismatched `d` is a hydration error.
    return `${Number(x.toFixed(3))} ${Number(y.toFixed(3))}`;
  });
  const path = `M ${points.join(" L ")}`;
  const elapsedShare = Math.min(1, days / horizon);
  const frontierX = elapsedShare * width;
  const frontierY =
    CHART_H - INSET - ((balance - principal) / rise) * (CHART_H - 2 * INSET);

  const showTip = hovered || focused || pinned;
  const wholeDay = Math.floor(days);
  const dayLine = `Day ${wholeDay}. Balance ${format(balanceAt(wholeDay))}, earned ${format(
    Math.max(0, balanceAt(wholeDay) - principal),
  )}.`;
  const announcement = playing
    ? wholeDay > 0
      ? dayLine
      : ""
    : days > 0
      ? `Paused. Balance ${format(balance)}, earned ${format(earned)} over ${days.toFixed(1)} days.`
      : "";

  const lineTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {apy}
        </span>
      </div>

      <div className="relative">
        <button
          type="button"
          aria-describedby={tipId}
          aria-pressed={pinned}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setPinned(false);
          }}
          onClick={() => setPinned((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPinned(false);
              setHovered(false);
            }
          }}
          className={cn(
            "-mx-1 flex items-end gap-1 rounded-2 px-1 py-0.5 text-left outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="font-mono text-2xl leading-none font-medium text-ink">
            <span className="sr-only">{format(balance)}</span>
            <RollingNumber value={shown} motionSafe={motionSafe} />
          </span>
          {/* The drip: two faint digits past the cent, stacked so a pulse is
              signal ink fading over muted ink — colour only, in any mode. */}
          <span
            aria-hidden
            className="mb-0.5 grid font-mono text-xs leading-none tabular-nums"
          >
            <span className="col-start-1 row-start-1 text-ink-3">
              {String(sub).padStart(2, "0")}
            </span>
            <motion.span
              key={ticks}
              className="col-start-1 row-start-1 text-signal"
              initial={{ opacity: ticks > 0 ? 1 : 0 }}
              animate={{ opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            >
              {String(sub).padStart(2, "0")}
            </motion.span>
          </span>
        </button>
        <span id={tipId} className="sr-only">
          {rateSentence}
        </span>

        <AnimatePresence>
          {showTip ? (
            <motion.span
              aria-hidden
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
              className="pointer-events-none absolute top-full left-0 z-10 mt-1 max-w-full truncate rounded-2 border border-hairline bg-popover px-2 py-1 font-mono text-[11px] text-popover-foreground tabular-nums shadow-sm"
            >
              {rateSentence}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-ink-3">
        <span>
          earned{" "}
          <span className="font-mono font-medium text-success tabular-nums">
            {format(earned)}
          </span>
        </span>
        <span className="font-mono tabular-nums">day {days.toFixed(1)}</span>
      </div>

      <div ref={chartRef} className="relative w-full">
        <svg
          role="img"
          aria-label={`Projected ${format(projected)} after ${horizon} days at ${apy}`}
          viewBox={`0 0 ${Number(width.toFixed(3))} ${CHART_H}`}
          style={{ height: CHART_H }}
          className="block w-full overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                x={0}
                y={0}
                height={CHART_H}
                initial={false}
                animate={{ width: frontierX }}
                transition={lineTransition}
              />
            </clipPath>
          </defs>
          <motion.path
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            className="text-hairline-strong"
            initial={false}
            animate={{ d: path }}
            transition={lineTransition}
          />
          <motion.path
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            className="text-cobalt-bright"
            clipPath={`url(#${clipId})`}
            initial={false}
            animate={{ d: path }}
            transition={lineTransition}
          />
        </svg>
        {/* The frontier marker is HTML, not SVG, so it stays a circle at any
            chart width and can ride the line on percentages. */}
        <motion.span
          aria-hidden
          className="absolute size-2 rounded-full border-2 border-cobalt-bright bg-surface-1"
          style={{ marginLeft: -4, marginTop: -4 }}
          initial={false}
          animate={{
            left: `${(elapsedShare * 100).toFixed(2)}%`,
            top: `${((frontierY / CHART_H) * 100).toFixed(2)}%`,
          }}
          transition={lineTransition}
        />
      </div>

      <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-ink-3 tabular-nums">
        <span>day 0</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${horizon}-${rate}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            day {horizon} · {format(projected)}
          </motion.span>
        </AnimatePresence>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
