"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LatencyState = "idle" | "waiting" | "done";

export type LatencyBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Where the wait is. */
  state?: LatencyState;
  /** Milliseconds since the request, from the host's clock; frozen by the host at done. */
  elapsedMs?: number;
  /** Sets the fill curve: `t / (t + budgetMs / 4)`. @default 1200 */
  budgetMs?: number;
  /** Past this the bar and readout turn warn. @default 2000 */
  warnAfterMs?: number;
  /** Draws a tick at the typical wait. */
  typicalMs?: number;
  /** What is being waited on; names the timer. */
  label: string;
  className?: string;
};

/** The fill for a wait of `ms` against a curve constant `k`: quick at first, never done on its own. */
const curve = (ms: number, k: number): number =>
  Number((Math.max(0, ms) / (Math.max(0, ms) + k)).toFixed(3));

/**
 * A slim bar that measures the wait for the first token and then says what it
 * was. The host owns the clock — it passes `state` and `elapsedMs` — so the
 * bar never reads time itself. While waiting, the fill follows `t / (t + k)`,
 * an asymptote that rises fast and never reaches the end on its own, smoothed
 * on `glide` because a wait is a quantity settling, not a switch. When the
 * first token lands the fill snaps to full on `snap`, one crisp overshoot
 * clipped by the track, and a check draws on `flick` beside the readout. Past
 * `warnAfterMs` the bar and readout turn warn, and the readout gains the word
 * slow so colour never carries it alone.
 *
 * The readout is a `role="timer"` with live announcements off, so ticks are
 * never spoken; a status region announces the settled time once. Under
 * reduced motion the fill still fills — a wait is information — on a short
 * tween, done arrives without the snap, and the check appears whole.
 */
export function LatencyBar({
  ref,
  state = "idle",
  elapsedMs = 0,
  budgetMs = 1200,
  warnAfterMs = 2000,
  typicalMs,
  label,
  className,
}: LatencyBarProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const k = Math.max(1, budgetMs / 4);
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  const target =
    state === "done" ? 1 : state === "waiting" ? curve(elapsed, k) : 0;
  const slow = state !== "idle" && elapsed > warnAfterMs;
  const seconds = (elapsed / 1000).toFixed(2);
  const typicalAt =
    typeof typicalMs === "number" && typicalMs > 0
      ? Number((curve(typicalMs, k) * 100).toFixed(3))
      : null;

  const fill = useMotionValue(0);

  React.useEffect(() => {
    const from = fill.get();
    // A new wait starts from empty: draining the old reading would read as
    // the model going backwards.
    if (target < from - 0.5) {
      fill.set(0);
      if (target === 0) return;
    }
    const transition =
      state === "done"
        ? motionSafe
          ? springs.snap
          : { duration: durations.fast, ease: easings.enter }
        : motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.move };
    const controls = animate(fill, target, transition);
    return () => controls.stop();
  }, [fill, target, state, motionSafe]);

  const tone =
    state === "done" && !slow
      ? "bg-success"
      : slow
        ? "bg-warn"
        : "bg-cobalt-bright";
  const readoutTone =
    state === "idle"
      ? "text-ink-3"
      : slow
        ? "text-warn"
        : state === "done"
          ? "text-success"
          : "text-foreground";
  const announcement =
    state === "done"
      ? `First token in ${seconds} s${slow ? ", slow" : ""}`
      : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span
          id={labelId}
          className="min-w-0 truncate text-sm font-medium"
          title={label}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("size-3.5 shrink-0", readoutTone)}
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={false}
              animate={{
                pathLength: state === "done" ? 1 : 0,
                opacity: state === "done" ? 1 : 0,
              }}
              // The check is the confirmation: it draws on flick, and appears
              // whole rather than not at all under reduced motion.
              transition={
                motionSafe
                  ? { ...springs.flick, opacity: { duration: durations.blink } }
                  : { duration: 0 }
              }
            />
          </svg>
          <span
            role="timer"
            aria-live="off"
            aria-labelledby={labelId}
            className={cn(
              "font-mono text-xs tabular-nums transition-colors",
              state === "done" ? "font-medium" : "font-normal",
              readoutTone,
            )}
          >
            {seconds} s
          </span>
          {slow ? (
            <span className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
              slow
            </span>
          ) : null}
        </span>
      </div>

      <div
        aria-hidden
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
      >
        <motion.div
          className={cn(
            "absolute inset-0 origin-left rounded-full transition-colors",
            tone,
          )}
          style={{ scaleX: fill }}
        />
        {typicalAt !== null ? (
          <span
            style={{ left: `${typicalAt}%` }}
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-ink"
          />
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
