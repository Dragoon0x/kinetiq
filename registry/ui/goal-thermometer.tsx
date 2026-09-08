"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GoalEntry = {
  id: string;
  label: string;
  amount: number;
};

export type GoalState = "under" | "near" | "over";

export type GoalThermometerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Expenses in the order they landed; their sum is the fill. */
  entries: GoalEntry[];
  /** The cap the tube tops out at. */
  cap: number;
  /** Fraction of the cap where the tube warns and the bulb glows. @default 0.85 */
  warnAt?: number;
  /** Formats the total, the cap, the scale and every chip. */
  format?: (value: number) => string;
  /** Names the goal, printed above the tube and read as the meter's label. */
  label: string;
  /** Tick labels up the scale. @default 4 */
  marks?: number;
  /** Fires from the effect that sees a threshold cross, never during render. */
  onStateChange?: (state: GoalState) => void;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** Seconds for one breath of the bulb's halo. */
const GLOW_S = 1.9;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

/**
 * A vertical thermometer for a spend cap. The mercury is the sum of the
 * entries, so the fill rises with each expense: the column's height animates on
 * `glide` — a quantity settling, never a switch flipping — and the total above
 * it counts up on the same spring through a motion value, so the digits move
 * without re-rendering the rows beside them.
 *
 * Every expense leaves a hairline tick on the rail at its cumulative height,
 * the newest carrying a chip with its label and amount that lands with a `snap`
 * on its offset and then rides upward with the meniscus, gliding in step with
 * the fill as later expenses arrive. Past `warnAt` the tube turns warn and the
 * bulb glows on a mirrored opacity tween that runs only while the tab is
 * visible; past the cap it turns danger and the readout names the overage —
 * nothing bounces there, because going over is not a celebration.
 *
 * It is a `role="meter"`: `aria-valuenow` stays inside the cap (a meter may not
 * report past its maximum) while `aria-valuetext` says the real sentence, and a
 * hidden list carries every expense so the ticks stay decoration rather than
 * the only reading. Under reduced motion the fill still rises and the total
 * still counts, on a tween, and the halo holds a static ring.
 */
export function GoalThermometer({
  ref,
  entries,
  cap,
  warnAt = 0.85,
  format = defaultFormat,
  label,
  marks = 4,
  onStateChange,
  className,
}: GoalThermometerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-entries`;

  const spent = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.amount),
    0,
  );
  const span = cap > 0 ? cap : 1;
  const fraction = spent / span;
  const filled = clamp(fraction, 0, 1);
  const over = Math.max(0, spent - cap);
  const state: GoalState =
    over > 0 ? "over" : fraction >= warnAt ? "near" : "under";

  // An ambient loop in a hidden tab is a battery leak, so the halo stops.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The parent hears about a crossing from the effect that saw it, never from
  // inside a state updater or during render.
  const reportRef = React.useRef(onStateChange);
  React.useEffect(() => {
    reportRef.current = onStateChange;
  }, [onStateChange]);
  const lastState = React.useRef<GoalState | null>(null);
  React.useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    reportRef.current?.(state);
  }, [state]);

  // The readout counts on the same spring as the fill, driven by a motion value
  // so a running total never re-renders the instrument around it.
  const counted = useMotionValue(spent);
  const readout = useTransform(counted, (value) => format(Math.max(0, value)));
  React.useEffect(() => {
    if (!motionSafe) {
      // Reduced motion still reports the total — only the travel is dropped.
      counted.set(spent);
      return;
    }
    const controls = animate(counted, spent, springs.glide);
    return () => controls.stop();
  }, [counted, spent, motionSafe]);

  // Cumulative heights: where each expense left the mercury standing.
  const ticks: { id: string; label: string; amount: number; at: number }[] = [];
  let running = 0;
  for (const entry of entries) {
    running += Math.max(0, entry.amount);
    ticks.push({
      id: entry.id,
      label: entry.label,
      amount: entry.amount,
      at: clamp(running / span, 0, 1),
    });
  }
  const latest = ticks[ticks.length - 1] ?? null;

  const tone =
    state === "over"
      ? "bg-danger"
      : state === "near"
        ? "bg-warn"
        : "bg-cobalt-bright";
  const text =
    state === "over"
      ? "text-danger"
      : state === "near"
        ? "text-warn"
        : "text-cobalt-bright";
  const sentence =
    state === "over"
      ? `Over the cap by ${format(over)}`
      : entries.length === 0
        ? "Nothing spent yet"
        : state === "near"
          ? `Near the cap · ${format(Math.max(0, cap - spent))} left`
          : `${format(Math.max(0, cap - spent))} left`;

  const glowing = state !== "under";
  const scaleMarks = Array.from({ length: marks }, (_, i) => (i + 1) / marks);
  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          cap {format(cap)}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono text-xl leading-none font-medium tabular-nums",
            text,
          )}
        >
          <span className="sr-only">{format(spent)}</span>
          <motion.span aria-hidden>{readout}</motion.span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={sentence}
            className={cn(
              "shrink-0 text-[11px] font-medium",
              state === "under" ? "text-ink-3" : text,
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {sentence}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="flex h-52 items-stretch gap-2">
        {/* Scale: labels sit against the tube's own range, which starts above
            the bulb — the bulb is always full, so it is not part of the run. */}
        <div className="relative w-14 shrink-0">
          <div className="absolute inset-x-0 top-0 bottom-9">
            {scaleMarks.map((mark) => (
              <span
                key={mark}
                aria-hidden
                style={{ bottom: percent(mark) }}
                className="absolute right-0 flex translate-y-1/2 items-center gap-1 font-mono text-[9px] text-ink-3 tabular-nums"
              >
                {format(cap * mark)}
                <span className="h-px w-1.5 bg-hairline-strong" />
              </span>
            ))}
          </div>
        </div>

        <div
          role="meter"
          aria-labelledby={labelId}
          aria-describedby={listId}
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={Number(clamp(spent, 0, cap).toFixed(2))}
          aria-valuetext={`${format(spent)} of ${format(cap)} spent. ${sentence}.`}
          className="flex w-9 shrink-0 flex-col items-center"
        >
          <div
            className={cn(
              "relative w-5 flex-1 overflow-hidden rounded-t-full border border-b-0 bg-surface-2 transition-colors",
              state === "over" ? "border-danger" : "border-hairline-strong",
            )}
          >
            <motion.span
              aria-hidden
              className={cn("absolute inset-x-0 bottom-0", tone)}
              initial={{ height: "0%" }}
              animate={{ height: percent(filled) }}
              transition={fillTransition}
            />
            <span
              aria-hidden
              style={{ bottom: percent(warnAt) }}
              className="absolute inset-x-0 border-t border-dashed border-hairline-strong"
            />
          </div>

          {/* The bulb is always full, the way a real one is. */}
          <div className="relative grid size-9 shrink-0 place-items-center">
            <motion.span
              aria-hidden
              style={{ scale: 1.3 }}
              className={cn(
                "col-start-1 row-start-1 size-9 rounded-full",
                state === "over" ? "bg-danger" : "bg-warn",
              )}
              initial={false}
              animate={{
                opacity: glowing
                  ? motionSafe && visible
                    ? [0.16, 0.42]
                    : 0.3
                  : 0,
              }}
              transition={
                glowing && motionSafe && visible
                  ? {
                      duration: GLOW_S,
                      ease: easings.move,
                      repeat: Infinity,
                      repeatType: "mirror",
                    }
                  : { duration: durations.base, ease: easings.enter }
              }
            />
            <span
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 size-8 rounded-full border transition-colors",
                tone,
                state === "over" ? "border-danger" : "border-hairline-strong",
              )}
            />
          </div>
        </div>

        {/* Rail — one tick per expense at the height it left the mercury. */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-x-0 top-0 bottom-9">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-px bg-hairline"
            />

            {ticks.map((tick, index) => (
              <motion.span
                key={tick.id}
                aria-hidden
                style={{ bottom: percent(tick.at) }}
                className="absolute left-0 h-px w-2 origin-left bg-hairline-strong"
                initial={
                  motionSafe
                    ? { opacity: 0, scaleX: 0.2 }
                    : { opacity: 0, scaleX: 1 }
                }
                animate={{
                  opacity: index === ticks.length - 1 ? 1 : 0.55,
                  scaleX: 1,
                }}
                transition={
                  motionSafe
                    ? {
                        ...springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              />
            ))}

            <AnimatePresence initial={false}>
              {latest ? (
                <motion.div
                  key="latest"
                  aria-hidden
                  className="absolute inset-x-0 flex translate-y-1/2 pl-3"
                  initial={
                    motionSafe
                      ? {
                          opacity: 0,
                          x: -distances.step,
                          bottom: percent(latest.at),
                        }
                      : { opacity: 0, bottom: percent(latest.at) }
                  }
                  animate={{ opacity: 1, x: 0, bottom: percent(latest.at) }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.glide,
                          x: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5 rounded-2 border border-hairline bg-surface-0 px-1.5 py-0.5">
                    <span className="min-w-0 truncate text-[10px] text-ink-2">
                      {latest.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums">
                      {format(latest.amount)}
                    </span>
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* The ticks are decoration; the expenses themselves stay readable. */}
      <ol id={listId} className="sr-only">
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.label}, {format(entry.amount)}
          </li>
        ))}
      </ol>

      {/* One announcement per crossing, not one per expense. */}
      <p aria-live="polite" className="sr-only">
        {state === "under" ? "" : sentence}
      </p>
    </div>
  );
}
