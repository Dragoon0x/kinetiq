"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BurnState = "ahead" | "on pace" | "fast" | "spent";

export type BurnReading = {
  /** Budget spent over budget elapsed, rounded to two decimals. */
  rate: number;
  state: BurnState;
  /** Budget left in minutes, rounded to one decimal. */
  minutesLeft: number;
  /** Minutes left at window end if this rate holds, rounded to one decimal. */
  projectedMinutes: number;
  /** Hours until the budget is gone at this rate; null when it outlasts the window. */
  hoursToExhaustion: number | null;
};

export type SloBurnProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Share of the error budget left, 0–1. */
  remaining: number;
  /** Share of the compliance window elapsed, 0–1. */
  elapsed: number;
  /** The whole budget in minutes. @default 43.2 */
  budgetMinutes?: number;
  /** Length of the compliance window in hours. @default 720 */
  windowHours?: number;
  /** The objective, printed in the header. @default 99.9 */
  objective?: number;
  /** Burn rate at or above which the meter reads fast. @default 2 */
  fastAt?: number;
  /** Top of the burn-rate line; the marker clamps here. @default 10 */
  maxRate?: number;
  /** Controlled state of the projection switch. */
  projected?: boolean;
  /** Initial projection state for uncontrolled usage. @default false */
  defaultProjected?: boolean;
  /** Fires from the press or key that flipped the switch. */
  onProjectedChange?: (projected: boolean) => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onBurnChange?: (reading: BurnReading) => void;
  /** Names the meter. @default "Error budget" */
  label?: string;
  className?: string;
};

const STATE_WORD: Record<BurnState, string> = {
  ahead: "Ahead",
  "on pace": "On pace",
  fast: "Fast",
  spent: "Spent",
};

/** Three decimals before a share reaches a style: an unrounded ratio serialises
 *  differently in Node and the browser, which is a hydration error. */
const pct = (share: number): string =>
  `${Number((Math.min(1, Math.max(0, share)) * 100).toFixed(3))}%`;

const minutePhrase = (minutes: number): string =>
  `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

/** Hours read as hours up to two days, then as days — a burn measured in
 *  hundreds of hours tells nobody anything. */
const spanPhrase = (hours: number): string => {
  if (hours >= 48) {
    const days = Math.round((hours / 24) * 10) / 10;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};

const spanShort = (hours: number): string =>
  hours >= 48 ? `${Math.round((hours / 24) * 10) / 10} d` : `${hours} h`;

/**
 * How fast the budget goes. The bar holds what is left of the error budget and
 * drains from the right on `glide` — a quantity settling, never a bounce,
 * because spending a budget may not celebrate — while a pace rule stands where
 * the budget should be at this point in the window and slides on `snap`. Fill
 * short of the rule is the whole reading: the service is spending faster than
 * the window allows.
 *
 * Beneath it a burn-rate line carries a marker from zero to `maxRate` with the
 * fast mark ticked; above `fastAt` the bar, the marker and the rate chip turn
 * warn and the chip pulses on a mirrored tween — the one ambient loop here, and
 * it runs only while the burn is fast. The `Project` switch extends a ghost
 * region to where the budget lands at window end if this rate holds, and the
 * readout adds the time to exhaustion.
 *
 * Both bars are real `role="meter"`s whose `aria-valuetext` is a sentence, the
 * state word is printed rather than left to colour, and the switch is a real
 * `role="switch"` reached by Tab and flipped with Enter or Space. Every figure
 * comes from props, so nothing here reads a clock. Under reduced motion the
 * fill still drains and the markers still take their places — a budget is
 * information — on tweens, with no travel and no pulse.
 */
export function SloBurn({
  ref,
  remaining,
  elapsed,
  budgetMinutes = 43.2,
  windowHours = 720,
  objective = 99.9,
  fastAt = 2,
  maxRate = 10,
  projected,
  defaultProjected = false,
  onProjectedChange,
  onBurnChange,
  label = "Error budget",
  className,
}: SloBurnProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [ownProjected, setOwnProjected] = React.useState(defaultProjected);
  const showProjection = projected !== undefined ? projected : ownProjected;

  const left = Math.min(1, Math.max(0, remaining));
  const through = Math.min(1, Math.max(0, elapsed));
  const rate = through > 0 ? Math.round(((1 - left) / through) * 100) / 100 : 0;
  const state: BurnState =
    left <= 0
      ? "spent"
      : rate >= fastAt
        ? "fast"
        : rate >= 1
          ? "on pace"
          : "ahead";
  const fast = state === "fast" || state === "spent";

  const minutesLeft = Math.round(left * budgetMinutes * 10) / 10;
  // What is left at window end if this rate holds: today's pace, run forward.
  const projectedLeft = Math.max(0, left - rate * (1 - through));
  const projectedMinutes = Math.round(projectedLeft * budgetMinutes * 10) / 10;

  // A budget with something left at window end is not "exhausted in 228 days":
  // it simply outlasts the window, which is the only honest way to say it.
  const holds = left > 0 && projectedLeft > 0;
  const hoursToExhaustion =
    rate > 0 && left > 0 && !holds
      ? Math.round(((left * windowHours) / rate) * 10) / 10
      : null;

  const paceLeft = 1 - through;
  const rateShare = Math.min(1, rate / Math.max(1, maxRate));
  const overScale = rate > maxRate;

  const tail =
    left <= 0
      ? ", and the budget is spent"
      : holds || hoursToExhaustion === null
        ? ", holding past the end of the window at this rate"
        : `, exhausted in about ${spanPhrase(hoursToExhaustion)}`;

  const budgetPhrase = `${minutePhrase(minutesLeft)} of ${minutePhrase(Math.round(budgetMinutes * 10) / 10)} of error budget left`;

  const valueText =
    rate === 0
      ? `${budgetPhrase}, with no budget spent yet in this window.`
      : `${budgetPhrase}, burning ${rate} times the budgeted rate${tail}.`;

  const rateText = overScale
    ? `${rate} times the budgeted rate, past the top of the scale.`
    : rate === 0
      ? "No budget spent in this window yet."
      : `${rate} times the budgeted rate, ${rate >= fastAt ? "above" : "below"} the fast mark of ${fastAt} times.`;

  // A band crossing is a settled event, so the freeze starts on the current
  // band and speaks nothing on the first commit. Setting during render means
  // this pass already reads the NEW freeze rather than the one it replaced.
  const [spoken, setSpoken] = React.useState({ key: state, sentence: "" });
  if (spoken.key !== state) {
    setSpoken({
      key: state,
      sentence:
        state === "spent"
          ? "Error budget spent. Every further failure is over the objective."
          : state === "fast"
            ? `Burning fast, ${rate} times the budgeted rate, ${minutePhrase(minutesLeft)} left.`
            : state === "on pace"
              ? `Burn back on pace, ${rate} times the budgeted rate.`
              : `Burn back under the budgeted rate, at ${rate} times.`,
    });
  }

  const burnRef = React.useRef(onBurnChange);
  React.useEffect(() => {
    burnRef.current = onBurnChange;
  });
  // The reading is a state, not an event: a host that mounts mid-incident sees
  // the same numbers the meter does, from the first commit.
  React.useEffect(() => {
    burnRef.current?.({
      rate,
      state,
      minutesLeft,
      projectedMinutes,
      hoursToExhaustion,
    });
  }, [rate, state, minutesLeft, projectedMinutes, hoursToExhaustion]);

  const setProjected = (next: boolean) => {
    if (projected === undefined) setOwnProjected(next);
    onProjectedChange?.(next);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const slide = motionSafe ? springs.snap : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label} · {objective}%
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
          {minutesLeft} min left
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={Math.round(budgetMinutes * 10) / 10}
        aria-valuenow={minutesLeft}
        aria-valuetext={valueText}
        className="relative h-3 w-full overflow-clip rounded-full bg-hairline-strong [contain:paint]"
      >
        <motion.span
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
            state === "spent"
              ? "bg-danger"
              : state === "fast"
                ? "bg-warn"
                : "bg-cobalt-bright",
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Number(left.toFixed(6)) }}
          transition={settle}
        />

        {/* The projection is drawn as the slice this rate would take next, not
            as a second bar: it belongs to the same track it eats into. */}
        <AnimatePresence initial={false}>
          {showProjection && projectedLeft < left ? (
            <motion.span
              key="projection"
              aria-hidden
              className="absolute inset-y-0 rounded-full bg-surface-0/70"
              style={{
                left: pct(projectedLeft),
                width: pct(left - projectedLeft),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            />
          ) : null}
        </AnimatePresence>

        {/* Where the budget should stand at this point in the window. */}
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-px bg-ink"
          initial={false}
          animate={{ left: pct(paceLeft) }}
          transition={slide}
        />
      </div>

      <div
        aria-hidden
        className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>{Math.round(through * 100)}% of window</span>
        <span>
          {showProjection
            ? `${projectedMinutes} min at window end`
            : left <= 0
              ? "budget spent"
              : hoursToExhaustion === null
                ? "no burn"
                : holds
                  ? "holds to window end"
                  : `out in ${spanShort(hoursToExhaustion)}`}
        </span>
      </div>

      <div
        role="meter"
        aria-label="Burn rate"
        aria-valuemin={0}
        aria-valuemax={maxRate}
        aria-valuenow={Math.min(maxRate, rate)}
        aria-valuetext={rateText}
        className="relative h-1.5 w-full overflow-clip rounded-full bg-hairline [contain:paint]"
      >
        <motion.span
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
            fast ? "bg-warn" : "bg-cobalt",
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Number(rateShare.toFixed(6)) }}
          transition={settle}
        />
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-ink-3"
          style={{ left: pct(fastAt / Math.max(1, maxRate)) }}
        />
      </div>

      <div
        aria-hidden
        className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>0×</span>
        <span>fast {fastAt}×</span>
        <span>{maxRate}×</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-8 min-w-0 items-center gap-2">
          <motion.span
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 px-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
              state === "spent"
                ? "bg-danger/15 text-danger"
                : state === "fast"
                  ? "bg-warn/15 text-warn"
                  : "bg-surface-2 text-ink",
            )}
            initial={false}
            // Two keyframes, mirrored: a spring would drop a middle frame. A
            // spent budget holds still — only an active fast burn pulses.
            animate={{ opacity: state === "fast" && motionSafe ? 0.55 : 1 }}
            transition={
              state === "fast" && motionSafe
                ? {
                    duration: durations.page,
                    ease: easings.move,
                    repeat: Infinity,
                    repeatType: "mirror",
                  }
                : fade
            }
          >
            {overScale ? `${maxRate}×+` : `${rate}×`}
          </motion.span>
          <span
            className={cn(
              "min-w-0 truncate text-[11px] font-medium transition-colors",
              state === "spent"
                ? "text-danger"
                : state === "fast"
                  ? "text-warn"
                  : "text-ink-2",
            )}
          >
            {STATE_WORD[state]}
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={showProjection}
          aria-label="Project to window end"
          onClick={() => setProjected(!showProjection)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong pr-2.5 pl-1 transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors",
              showProjection ? "bg-cobalt-bright" : "bg-hairline-strong",
            )}
          >
            <motion.span
              className="block size-3 rounded-full bg-surface-0"
              initial={false}
              animate={{ x: showProjection ? 12 : 0 }}
              transition={slide}
            />
          </span>
          <span className="font-mono text-[10px] font-medium text-ink">
            Project
          </span>
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
