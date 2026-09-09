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

export type EarningsFigures = { eps: number; revenue: number };

export type EarningsVerdict = "beat" | "miss" | "inline";

export type EarningsCountdownProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What is being reported ("Fernworks Q3"); labels the card. */
  label: string;
  /** Seconds until the report when the clock is seeded; changing it re-seeds the clock. */
  seconds: number;
  /** Seconds the full ring represents. @default 259200 (three days) */
  window?: number;
  /** Ticks the clock. @default false */
  running?: boolean;
  /** The consensus figures. */
  estimate: EarningsFigures;
  /** The reported figures; providing them lands the results. */
  actual?: EarningsFigures;
  /** Prints earnings per share. */
  format?: (value: number) => string;
  /** Prints revenue. */
  formatRevenue?: (value: number) => string;
  /** Fires from the tick that reached zero. */
  onElapsed?: () => void;
  /** Fires from the effect that observed the actual figures arrive. */
  onLand?: (verdict: EarningsVerdict) => void;
  className?: string;
};

/** Explicit locales keep the server's strings and the client's identical. */
const perShare = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => perShare.format(value);
const defaultFormatRevenue = (value: number) => compact.format(value);

const VERDICT_WORDS: Record<EarningsVerdict, string> = {
  beat: "Beat",
  miss: "Miss",
  inline: "In line",
};

/** EPS decides to the cent; a tie hands the call to revenue. */
const judge = (
  estimate: EarningsFigures,
  actual: EarningsFigures,
): EarningsVerdict => {
  const eps = Math.round((actual.eps - estimate.eps) * 100);
  if (eps !== 0) return eps > 0 ? "beat" : "miss";
  const revenue = actual.revenue - estimate.revenue;
  if (Math.abs(revenue) < Math.abs(estimate.revenue) * 0.001) return "inline";
  return revenue > 0 ? "beat" : "miss";
};

const pad = (value: number) => String(value).padStart(2, "0");

const split = (total: number) => ({
  days: Math.floor(total / 86400),
  hours: Math.floor((total % 86400) / 3600),
  minutes: Math.floor((total % 3600) / 60),
  seconds: total % 60,
});

const readoutOf = (total: number) => {
  const { days, hours, minutes, seconds } = split(total);
  return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
};

const wordsOf = (total: number) => {
  const { days, hours, minutes, seconds } = split(total);
  return `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`;
};

/** Keeps callbacks out of effect dependencies so a re-render never restarts the clock. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their faces on `snap`. Each column is ten faces
 * tall and `1ch` wide, so a changing digit never reflows the row. With `rollIn`
 * the columns mount at zero and roll up to the figure — the way a result
 * arrives — instead of appearing already settled.
 */
function RollingFigure({
  value,
  motionSafe,
  rollIn = false,
}: {
  value: string;
  motionSafe: boolean;
  rollIn?: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) {
          // `whitespace-pre` keeps the readout's spaces: a lone space is all
          // an inline-block holds, and collapsing would print "2d14h06m12s".
          return (
            <span key={key} className="inline-block whitespace-pre">
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
              initial={rollIn && motionSafe ? { y: "0%" } : false}
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

/**
 * Results, in three days. A ring drains toward the report — its fraction is
 * the seconds left over `window` — while a mono readout rolls its digit
 * columns on `snap` as each second lands. The clock is the component's own:
 * seeded from `seconds`, driven by `running`, ticking in an effect with its
 * own interval that halts entirely while the document is hidden, and never
 * reading the wall clock during render.
 *
 * When results land the ring closes on `snap` and turns success, the actual
 * figures roll in on the same spring, and a verdict chip appears — "Beat"
 * lands on `recoil` because a beat is a landing, while "Miss" and "In line"
 * arrive on `snap` with no bounce, because a miss is not to be celebrated.
 * Reaching zero without results swaps the readout to "Due" and holds.
 *
 * The readout is a `role="timer"` with `aria-live="off"` whose label carries
 * the time in words; milestones alone — the clock starting, results due,
 * results landing — go through a polite status line. Under reduced motion
 * the digits swap, the ring still drains second by second, and the verdict
 * fades in with no travel.
 */
export function EarningsCountdown({
  ref,
  label,
  seconds,
  window: fullWindow = 259200,
  running = false,
  estimate,
  actual,
  format = defaultFormat,
  formatRevenue = defaultFormatRevenue,
  onElapsed,
  onLand,
  className,
}: EarningsCountdownProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const seedOf = (value: number) => Math.max(0, Math.floor(value));
  const [remaining, setRemaining] = React.useState(() => seedOf(seconds));
  // A new seed re-seeds the clock from render, so the first paint after the
  // change already shows the new time rather than one stale tick of the old.
  const [seed, setSeed] = React.useState(seconds);
  if (seed !== seconds) {
    setSeed(seconds);
    setRemaining(seedOf(seconds));
  }

  const remainingRef = React.useRef(remaining);
  React.useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);
  const elapsedRef = useLatest(onElapsed);
  const landRef = useLatest(onLand);

  const verdict = actual ? judge(estimate, actual) : null;
  const landed = verdict !== null;
  const due = !landed && remaining === 0;
  const ticking = running && !landed && remaining > 0;

  React.useEffect(() => {
    if (!ticking) return;
    let timer: number | null = null;
    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer !== null || document.visibilityState === "hidden") return;
      timer = window.setInterval(() => {
        const next = Math.max(0, remainingRef.current - 1);
        remainingRef.current = next;
        setRemaining(next);
        if (next === 0) {
          stop();
          elapsedRef.current?.();
        }
      }, 1000);
    };
    // A hidden tab does not tick: the clock is a display of time, not a
    // schedule, and a burst of catch-up rolls would be a lie about what it saw.
    const onVisibility = () =>
      document.visibilityState === "hidden" ? stop() : start();
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ticking, elapsedRef]);

  React.useEffect(() => {
    if (verdict) landRef.current?.(verdict);
  }, [verdict, landRef]);

  // The ratio reaches the ring's stroke-dasharray on both sides of hydration,
  // so it is settled to six decimals before motion serialises it.
  const fraction =
    fullWindow > 0
      ? Number(Math.min(1, Math.max(0, remaining / fullWindow)).toFixed(6))
      : 0;
  const readout = readoutOf(remaining);
  const timerLabel = landed
    ? `${label} results reported`
    : due
      ? `${label} results due`
      : `${wordsOf(remaining)} until ${label} results`;

  const announcement =
    landed && actual
      ? `Results landed: ${VERDICT_WORDS[verdict].toLowerCase()}. Earnings per share ${format(actual.eps)} against ${format(estimate.eps)} estimated.`
      : due
        ? "Results due"
        : running
          ? "Clock running"
          : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const figure = "font-mono text-sm font-medium text-ink tabular-nums";
  const term = "text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase";

  const actualCell = (
    value: number | undefined,
    print: (v: number) => string,
  ) =>
    value === undefined ? (
      <span role="img" aria-label="Not yet reported" className="text-ink-3">
        —
      </span>
    ) : (
      <>
        <span className="sr-only">{print(value)}</span>
        <RollingFigure value={print(value)} motionSafe={motionSafe} rollIn />
      </>
    );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "@container flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex h-6 shrink-0 items-center">
          <AnimatePresence initial={false}>
            {verdict ? (
              <motion.span
                key={verdict}
                aria-hidden
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-medium",
                  verdict === "beat"
                    ? "bg-success/12 text-success"
                    : verdict === "miss"
                      ? "bg-danger/12 text-danger"
                      : "bg-surface-2 text-ink-2",
                )}
                initial={
                  !motionSafe
                    ? { opacity: 0 }
                    : verdict === "beat"
                      ? { opacity: 0, scale: 0.6 }
                      : { opacity: 0, y: distances.nudge }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                // A beat is a landing and gets recoil's two bounces; a miss
                // arrives on snap and is not celebrated.
                transition={
                  !motionSafe
                    ? { duration: durations.fast }
                    : verdict === "beat"
                      ? { ...springs.recoil, opacity: fade }
                      : { ...springs.snap, opacity: fade }
                }
              >
                {VERDICT_WORDS[verdict]}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      {/* The figure steps down a size in a narrow card: fourteen mono
          characters beside the ring do not fit a phone's column at xl. */}
      <div className="flex items-center gap-3 @[22rem]:gap-4">
        <svg
          viewBox="0 0 48 48"
          aria-hidden
          className="size-16 shrink-0 -rotate-90"
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="4"
          />
          <motion.circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className={cn(
              "transition-colors",
              landed ? "text-success" : "text-cobalt-bright",
            )}
            initial={false}
            animate={{ pathLength: landed ? 1 : fraction }}
            // The drain is information, so it still moves under reduced
            // motion — as a short tween rather than a spring.
            transition={
              motionSafe
                ? landed
                  ? springs.snap
                  : springs.glide
                : { duration: durations.fast }
            }
          />
        </svg>

        <div
          role="timer"
          aria-live="off"
          aria-label={timerLabel}
          className="grid min-w-0 flex-1"
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={landed ? "landed" : due ? "due" : "counting"}
              className="col-start-1 row-start-1 font-mono text-lg leading-none font-semibold text-ink tabular-nums @[22rem]:text-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {landed ? (
                "Reported"
              ) : due ? (
                "Due"
              ) : (
                <RollingFigure value={readout} motionSafe={motionSafe} />
              )}
            </motion.span>
          </AnimatePresence>
          <span className="mt-1.5 text-[11px] text-ink-3">
            {landed
              ? "Results are in"
              : due
                ? "Awaiting the report"
                : "Until results"}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-3">
        <div className="flex flex-col gap-0.5">
          <dt className={term}>Estimate EPS</dt>
          <dd className={figure}>{format(estimate.eps)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={term}>Actual EPS</dt>
          <dd className={figure}>{actualCell(actual?.eps, format)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={term}>Estimate revenue</dt>
          <dd className={figure}>{formatRevenue(estimate.revenue)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={term}>Actual revenue</dt>
          <dd className={figure}>
            {actualCell(actual?.revenue, formatRevenue)}
          </dd>
        </div>
      </dl>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
