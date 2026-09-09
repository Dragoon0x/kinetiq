"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailStep = {
  id: string;
  text: string;
  /** Who did it, printed in small caps before the text. */
  agent?: string;
  /** Names this step as a checkpoint; it becomes a stop on the rail. */
  checkpoint?: string;
};

export type CheckpointRailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The run so far, oldest first. */
  steps: RailStep[];
  /**
   * Fires from a stop press or key with the checkpoint step's id and how
   * many steps follow it. Keep `steps` up to and including that id.
   */
  onRewind?: (stepId: string, discarded: number) => void;
  /** Names the rail and the list. */
  label: string;
  className?: string;
};

/** Per-row exit delays, read at exit time through AnimatePresence's custom. */
type FoldPlan = Record<string, number>;

type Rewind = { label: string; discarded: number; kept: number };

const pct = (value: number) => `${Number(value.toFixed(3))}%`;

/**
 * A rail of checkpoints above the steps of a run. Steps that carry a
 * checkpoint label are stops spaced evenly along the track; a head ring
 * rides the track at the latest stop, or half a slot past it while the run
 * continues, and the fill behind it reads how far the run has gone.
 * Pressing an earlier stop rewinds: the head slides back on `glide` and the
 * fill retracts with it — one slide, no overshoot — while every step after
 * that checkpoint folds up, its height closing on `glide` as its text lifts
 * by `distances.step` on the exit ease, in a `cascade()` that runs from the
 * bottom up so the run visibly unwinds. Stops past the rewind fade and the
 * remaining stops re-space on `glide`. The host owns the steps and truncates
 * them from `onRewind`; new rows fade in from `distances.nudge`.
 *
 * The stops are buttons in a labelled group with a roving tabindex — Left
 * and Right step, Home and End jump, Enter and Space rewind — the current
 * stop is `aria-current`, and the live region speaks once per checkpoint
 * taken and once per rewind. Under reduced motion the head and fill swap on
 * a tween, rows fold on a tween with no lift and no stagger, and stops fade.
 */
export function CheckpointRail({
  ref,
  steps,
  onRewind,
  label,
  className,
}: CheckpointRailProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const stopRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(0);
  const [plan, setPlan] = React.useState<FoldPlan>({});
  const [rewind, setRewind] = React.useState<Rewind | null>(null);

  const stops = steps
    .map((step, index) => ({ step, index }))
    .filter((entry) => entry.step.checkpoint !== undefined);
  const count = stops.length;
  const lastStop = stops[count - 1];
  const lastIsStop =
    lastStop !== undefined && lastStop.index === steps.length - 1;

  // Slots are shares of the track, rounded so the server and browser agree;
  // the head sits half a slot past the last stop while the run continues.
  const slot = (k: number) =>
    Number((((k + 1) / (count + 1)) * 100).toFixed(3));
  const head =
    steps.length === 0
      ? 0
      : Number(
          (((count + (lastIsStop ? 0 : 0.5)) / (count + 1)) * 100).toFixed(3),
        );

  const focusIndex = Math.min(focused, Math.max(0, count - 1));
  const moveTo = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    setFocused(clamped);
    stopRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(count - 1);
        break;
      default:
        break;
    }
  };

  const rewindTo = (stepIndex: number) => {
    const target = steps[stepIndex];
    if (!target || stepIndex === steps.length - 1) return;
    const discarded = steps.length - stepIndex - 1;
    const gap = motionSafe ? cascade(discarded) : 0;
    const next: FoldPlan = {};
    // The bottom row leaves first: its delay is zero and each row above waits
    // one more beat, so the run unwinds toward the checkpoint.
    steps.slice(stepIndex + 1).forEach((step, offset) => {
      next[step.id] = Number(((discarded - 1 - offset) * gap).toFixed(3));
    });
    setPlan(next);
    setRewind({
      label: target.checkpoint ?? target.text,
      discarded,
      kept: stepIndex + 1,
    });
    onRewind?.(target.id, discarded);
  };

  const last = steps[steps.length - 1];
  const announcement =
    rewind && steps.length <= rewind.kept
      ? `Rewound to ${rewind.label}, ${rewind.discarded} ${
          rewind.discarded === 1 ? "step" : "steps"
        } discarded`
      : last?.checkpoint
        ? `Checkpoint taken: ${last.checkpoint}`
        : "";

  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {steps.length} {steps.length === 1 ? "step" : "steps"} · {count}{" "}
          {count === 1 ? "checkpoint" : "checkpoints"}
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        className="relative mx-2 h-12"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-3.5 h-px bg-hairline-strong"
        />
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-3.5 h-px origin-left bg-cobalt-bright"
          initial={false}
          animate={{ scaleX: Number((head / 100).toFixed(3)) }}
          transition={move}
        />

        <AnimatePresence initial={false}>
          {stops.map((entry, k) => {
            const current = k === count - 1;
            const discards = steps.length - entry.index - 1;
            const name = current
              ? `${entry.step.checkpoint}, current checkpoint ${k + 1} of ${count}`
              : `Rewind to ${entry.step.checkpoint}, checkpoint ${k + 1} of ${count}, discards ${discards} ${
                  discards === 1 ? "step" : "steps"
                }`;
            return (
              <motion.button
                key={entry.step.id}
                ref={(node) => {
                  stopRefs.current[k] = node;
                }}
                type="button"
                aria-label={name}
                aria-current={current ? "step" : undefined}
                tabIndex={focusIndex === k ? 0 : -1}
                onFocus={() => setFocused(k)}
                onClick={() => rewindTo(entry.index)}
                onKeyDown={(event) => onKeyDown(event, k)}
                style={{ maxWidth: `calc(${pct(100 / (count + 1))} - 4px)` }}
                className={cn(
                  "absolute top-0 flex h-12 -translate-x-1/2 flex-col items-center gap-1.5 rounded-2 px-1 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
                initial={{ left: pct(slot(k)), opacity: 0 }}
                animate={{ left: pct(slot(k)), opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={{ ...move, opacity: fade }}
              >
                <span className="grid h-7 shrink-0 place-items-center">
                  <motion.span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-full border-2 border-cobalt-bright transition-colors duration-300",
                      current ? "bg-cobalt-bright" : "bg-surface-1",
                    )}
                    whileHover={
                      motionSafe && !current ? { scale: 1.3 } : undefined
                    }
                    transition={springs.flick}
                  />
                </span>
                <span
                  aria-hidden
                  title={entry.step.checkpoint}
                  className={cn(
                    "max-w-full truncate text-[10px] leading-none font-medium",
                    current ? "text-foreground" : "text-ink-3",
                  )}
                >
                  {entry.step.checkpoint}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-3.5 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-transparent"
          initial={false}
          animate={{ left: pct(head), opacity: steps.length === 0 ? 0 : 1 }}
          transition={{ ...move, opacity: fade }}
        />
      </div>

      {steps.length === 0 ? (
        <p className="text-xs text-ink-3">No steps yet.</p>
      ) : (
        <ol aria-labelledby={labelId} className="flex flex-col">
          <AnimatePresence initial={false} custom={plan}>
            {steps.map((step) => (
              <motion.li
                key={step.id}
                className="overflow-hidden"
                initial={{
                  opacity: 0,
                  height: 0,
                  y: motionSafe ? distances.nudge : 0,
                }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                variants={{
                  exit: (delays: FoldPlan) => {
                    const delay = delays[step.id] ?? 0;
                    return {
                      opacity: 0,
                      height: 0,
                      y: motionSafe ? -distances.step : 0,
                      transition: {
                        height: motionSafe
                          ? { ...springs.glide, delay }
                          : { duration: durations.fast, ease: easings.move },
                        opacity: { ...exitFor(), delay },
                        y: { ...exitFor(), delay },
                      },
                    };
                  },
                }}
                exit="exit"
                transition={{ ...move, opacity: fade }}
              >
                <div className="flex items-start gap-2 py-1 text-xs">
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    <span
                      aria-hidden
                      className={cn(
                        "rounded-full",
                        step.checkpoint
                          ? "size-2.5 border-2 border-cobalt-bright bg-cobalt-bright"
                          : "size-1.5 bg-ink-3",
                      )}
                    />
                  </span>
                  {step.agent ? (
                    <span className="w-14 shrink-0 truncate pt-px font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {step.agent}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 text-foreground">
                    {step.text}
                    {step.checkpoint ? (
                      <span className="ml-1.5 inline-flex h-4 items-center rounded-full bg-cobalt-wash px-1.5 align-middle font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
                        {step.checkpoint}
                      </span>
                    ) : null}
                  </span>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
