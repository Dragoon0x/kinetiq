"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChecklistStep = {
  id: string;
  title: string;
  description?: string;
};

export type LaunchChecklistProps = {
  title?: string;
  steps: ChecklistStep[];
  /** Controlled set of completed step ids. */
  completed?: string[];
  defaultCompleted?: string[];
  onCompletedChange?: (completed: string[]) => void;
  /** Fires once, when the final step completes. */
  onComplete?: () => void;
  className?: string;
};

/**
 * Onboarding checklist: ticks draw themselves, a strikethrough slides across
 * finished steps, remaining rows compact upward on `glide`, and completing
 * the last step lands a CALIBRATED stamp with `recoil` — no confetti in the
 * lab.
 */
export function LaunchChecklist({
  title = "Launch checklist",
  steps,
  completed: controlledCompleted,
  defaultCompleted = [],
  onCompletedChange,
  onComplete,
  className,
}: LaunchChecklistProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledCompleted, setUncontrolledCompleted] =
    React.useState<string[]>(defaultCompleted);
  const completed = controlledCompleted ?? uncontrolledCompleted;
  const completedSet = React.useMemo(() => new Set(completed), [completed]);
  const done = steps.length > 0 && completed.length === steps.length;
  const firedComplete = React.useRef(done);

  const toggle = (id: string) => {
    const next = completedSet.has(id)
      ? completed.filter((c) => c !== id)
      : [...completed, id];
    if (controlledCompleted === undefined) setUncontrolledCompleted(next);
    onCompletedChange?.(next);
    if (next.length === steps.length && steps.length > 0) {
      if (!firedComplete.current) {
        firedComplete.current = true;
        onComplete?.();
      }
    } else {
      firedComplete.current = false;
    }
  };

  // Remaining steps compact upward; completed steps settle below them.
  const ordered = React.useMemo(
    () => [
      ...steps.filter((s) => !completedSet.has(s.id)),
      ...steps.filter((s) => completedSet.has(s.id)),
    ],
    [steps, completedSet],
  );

  return (
    <div
      className={cn(
        "border-border bg-card relative w-full max-w-md rounded-3 border",
        className,
      )}
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className="text-muted-foreground font-mono text-xs tabular-nums"
          aria-hidden
        >
          {completed.length}/{steps.length}
        </span>
      </div>

      {/* progress track with one notch per step */}
      <div
        role="progressbar"
        aria-label={`${title} progress`}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed.length}
        aria-valuetext={`${completed.length} of ${steps.length} steps complete`}
        className="border-border relative mx-4 mt-3 h-1.5 rounded-full border"
      >
        <motion.span
          className="bg-primary absolute inset-y-0 left-0 rounded-full"
          initial={false}
          animate={{
            width: `${steps.length === 0 ? 0 : (completed.length / steps.length) * 100}%`,
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
        {steps.slice(0, -1).map((_, index) => (
          <span
            key={index}
            aria-hidden
            className="bg-border absolute inset-y-0 w-px"
            style={{ left: `${((index + 1) / steps.length) * 100}%` }}
          />
        ))}
      </div>

      <ul className="p-2">
        {ordered.map((step) => {
          const isDone = completedSet.has(step.id);
          return (
            <motion.li
              key={step.id}
              layout={motionSafe ? "position" : false}
              transition={springs.glide}
              className="rounded-2"
            >
              <label
                className={cn(
                  "hover:bg-accent flex cursor-pointer items-start gap-3 rounded-2 px-2 py-2.5 transition-colors",
                  isDone && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggle(step.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "border-input mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-1 border transition-colors",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                    isDone && "border-primary bg-primary",
                  )}
                >
                  <svg viewBox="0 0 12 12" className="size-3">
                    <motion.path
                      d="M2.5 6.5 L5 9 L9.5 3.5"
                      fill="none"
                      stroke="var(--primary-foreground)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={false}
                      animate={{ pathLength: isDone ? 1 : 0 }}
                      transition={
                        motionSafe ? springs.flick : { duration: 0 }
                      }
                    />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="relative block text-sm font-medium">
                    {step.title}
                    <motion.span
                      aria-hidden
                      className="bg-muted-foreground absolute top-1/2 left-0 h-px w-full origin-left"
                      initial={false}
                      animate={{ scaleX: isDone ? 1 : 0 }}
                      transition={
                        motionSafe
                          ? { duration: durations.base, ease: easings.enter }
                          : { duration: 0 }
                      }
                    />
                  </span>
                  {step.description && (
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {step.description}
                    </span>
                  )}
                </span>
              </label>
            </motion.li>
          );
        })}
      </ul>

      <AnimatePresence>
        {done && (
          <motion.div
            key="stamp"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={
              motionSafe
                ? { opacity: 0, scale: 1.4, rotate: -14 }
                : { opacity: 0 }
            }
            animate={
              motionSafe
                ? { opacity: 1, scale: 1, rotate: -8 }
                : { opacity: 1 }
            }
            exit={{ opacity: 0, transition: { duration: durations.fast } }}
            transition={motionSafe ? springs.recoil : { duration: durations.fast }}
          >
            <span className="border-primary text-primary bg-card/80 rounded-1 border-2 px-4 py-1 font-mono text-lg font-bold tracking-[0.2em] uppercase backdrop-blur-sm">
              Calibrated
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {done ? "All steps complete — calibrated." : ""}
      </span>
    </div>
  );
}
