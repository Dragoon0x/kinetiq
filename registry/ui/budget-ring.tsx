"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BudgetRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seconds allowed. */
  timeBudget: number;
  /** Seconds spent; clamped to the budget for the arc. */
  timeUsed: number;
  /** Cost allowed, in the host's unit. */
  costBudget: number;
  /** Cost spent. */
  costUsed: number;
  /** Prints a cost. @default two decimals followed by " cr" */
  format?: (cost: number) => string;
  /** Remaining fraction at which each ring warns. The inner ring's default is higher, so it warns first. @default { time: 0.2, cost: 0.35 } */
  warnAt?: { time?: number; cost?: number };
  /** Names the instrument. */
  label: string;
  className?: string;
};

type Tone = "fine" | "warn" | "spent";

/** Outer ring is time, inner ring is cost; both share one stroke so they read as a pair. */
const TIME_RADIUS = 42;
const COST_RADIUS = 30;
const STROKE = 8;

// A fixed locale: the server and the browser must print the same digits, or
// the readout would not hydrate.
const cents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (cost: number) => `${cents.format(cost)} cr`;

const round6 = (n: number) => Number(n.toFixed(6));
const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const timeWords = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (rest || !minutes)
    parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
};

const toneOf = (fraction: number, warnAt: number): Tone =>
  fraction <= 0 ? "spent" : fraction <= warnAt ? "warn" : "fine";

const STROKE_TONE: Record<Tone, Record<"time" | "cost", string>> = {
  fine: { time: "text-cobalt-bright", cost: "text-signal" },
  warn: { time: "text-warn", cost: "text-warn" },
  spent: { time: "text-danger", cost: "text-danger" },
};

const DOT_TONE: Record<Tone, Record<"time" | "cost", string>> = {
  fine: { time: "bg-cobalt-bright", cost: "bg-signal" },
  warn: { time: "bg-warn", cost: "bg-warn" },
  spent: { time: "bg-danger", cost: "bg-danger" },
};

const WORD: Record<Tone, string> = { fine: "", warn: "Low", spent: "Spent" };
const WORD_TONE: Record<Tone, string> = {
  fine: "text-ink-3",
  warn: "text-warn",
  spent: "text-danger",
};

function Ring({
  radius,
  fraction,
  tone,
  which,
  motionSafe,
}: {
  radius: number;
  fraction: number;
  tone: Tone;
  which: "time" | "cost";
  motionSafe: boolean;
}) {
  return (
    <>
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="text-hairline-strong"
      />
      {/* What remains is the arc; it drains on `glide` with no overshoot, and
          still drains under reduced motion because the remainder is
          information. */}
      <motion.circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap={fraction > 0 && fraction < 1 ? "round" : "butt"}
        pathLength={1}
        className={cn(
          "transition-colors duration-300",
          STROKE_TONE[tone][which],
        )}
        initial={false}
        animate={{ pathLength: fraction }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.enter }
        }
      />
      {/* A tone change flashes a halo once — an opacity tween, so it reads
          the same under reduced motion — keyed so each crossing flashes. */}
      <AnimatePresence initial={false}>
        {tone !== "fine" ? (
          <motion.circle
            key={tone}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE + 4}
            className={STROKE_TONE[tone][which]}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Two nested rings: the outer is the time budget, the inner the cost budget.
 * Each arc is what remains, draining clockwise from twelve on `glide` as the
 * host reports spend — a quantity settling, never overshooting. Each ring
 * has its own warn threshold and the inner ring's default is the higher one,
 * so on a run where cost keeps pace with time the inner ring turns warn
 * first; a crossing into warn or spent flashes a halo once on a tween. The
 * fractions are rounded before they reach the arcs, so the server and the
 * browser draw the same paths.
 *
 * The legend rows are two `role="meter"`s with whole-number values and value
 * text in words; the live region says only that a budget is low or spent, so
 * it never re-announces a tick. Under reduced motion the arcs drain on a
 * tween and the tones swap.
 */
export function BudgetRing({
  ref,
  timeBudget,
  timeUsed,
  costBudget,
  costUsed,
  format = defaultFormat,
  warnAt,
  label,
  className,
}: BudgetRingProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const timeSpan = timeBudget > 0 ? timeBudget : 1;
  const costSpan = costBudget > 0 ? costBudget : 1;
  const timeLeft = clamp(timeBudget - timeUsed, timeSpan);
  const costLeft =
    Math.round(clamp(costBudget - costUsed, costSpan) * 100) / 100;
  const timeFraction = round6(timeLeft / timeSpan);
  const costFraction = round6(costLeft / costSpan);
  const timeTone = toneOf(timeFraction, warnAt?.time ?? 0.2);
  const costTone = toneOf(costFraction, warnAt?.cost ?? 0.35);

  const announcement =
    costTone === "spent"
      ? "Cost budget spent"
      : timeTone === "spent"
        ? "Time budget spent"
        : costTone === "warn" && timeTone === "warn"
          ? "Cost and time budgets low"
          : costTone === "warn"
            ? "Cost budget low"
            : timeTone === "warn"
              ? "Time budget low"
              : "";

  const rows = [
    {
      which: "time" as const,
      name: "Time",
      tone: timeTone,
      left: formatTime(timeLeft),
      of: formatTime(timeBudget),
      now: Math.round(timeLeft),
      max: Math.round(timeBudget),
      text: `${timeWords(timeLeft)} left of ${timeWords(timeBudget)}`,
    },
    {
      which: "cost" as const,
      name: "Cost",
      tone: costTone,
      left: format(costLeft),
      of: format(costBudget),
      now: Math.round(costLeft * 100),
      max: Math.round(costBudget * 100),
      text: `${format(costLeft)} left of ${format(costBudget)}`,
    },
  ];

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {formatTime(timeUsed)} · {format(Math.round(costUsed * 100) / 100)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative aspect-square w-32 max-w-full shrink-0">
          <svg viewBox="0 0 100 100" aria-hidden className="size-full">
            {/* Rotated as a group so twelve o'clock is the start and the arcs
                need no transform of their own. */}
            <g transform="rotate(-90 50 50)">
              <Ring
                radius={TIME_RADIUS}
                fraction={timeFraction}
                tone={timeTone}
                which="time"
                motionSafe={motionSafe}
              />
              <Ring
                radius={COST_RADIUS}
                fraction={costFraction}
                tone={costTone}
                which="cost"
                motionSafe={motionSafe}
              />
            </g>
          </svg>
          <span
            aria-hidden
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <span
              className={cn(
                "font-mono text-base leading-none font-semibold tabular-nums transition-colors",
                timeTone === "fine" ? "text-foreground" : WORD_TONE[timeTone],
              )}
            >
              {formatTime(timeLeft)}
            </span>
            <span className="mt-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
              left
            </span>
          </span>
        </div>

        <dl className="flex min-w-0 flex-1 basis-40 flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.which}
              role="meter"
              aria-label={`${row.name} budget`}
              aria-valuemin={0}
              aria-valuemax={row.max}
              aria-valuenow={row.now}
              aria-valuetext={row.text}
              className="flex h-9 items-center gap-2.5 rounded-2 border border-hairline bg-surface-1 px-2.5"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full transition-colors duration-300",
                  DOT_TONE[row.tone][row.which],
                )}
              />
              <dt className="w-9 shrink-0 text-xs font-medium">{row.name}</dt>
              <dd className="flex min-w-0 flex-1 items-baseline gap-1 font-mono text-xs tabular-nums">
                <span className="truncate text-foreground">{row.left}</span>
                <span className="truncate text-ink-3">of {row.of}</span>
              </dd>
              <AnimatePresence mode="wait" initial={false}>
                {WORD[row.tone] ? (
                  <motion.span
                    key={row.tone}
                    className={cn(
                      "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                      WORD_TONE[row.tone],
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      transition: { duration: durations.fast },
                    }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    {WORD[row.tone]}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          ))}
        </dl>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
