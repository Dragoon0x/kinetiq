"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RetryAttemptStatus = "running" | "failed" | "succeeded";

export type RetryAttempt = {
  id: string;
  /** How this attempt differed from the last, in a few words. */
  label: string;
  status: RetryAttemptStatus;
  /** What the attempt met, read on its rung. */
  error?: string;
};

export type RetryLadderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The attempts so far, oldest first. The host appends a running one from `onRetry`. */
  attempts: RetryAttempt[];
  /** How the next attempt will differ, printed beside the control. */
  next?: string;
  /** Rungs the ladder allows; the control retires when reached. @default 4 */
  maxAttempts?: number;
  /** Fires from the control. */
  onRetry?: () => void;
  /** Copy on the control. @default "Retry" */
  retryLabel?: string;
  /** Names the ladder for assistive technology. */
  label: string;
  className?: string;
};

const RUNG_TONE: Record<RetryAttemptStatus, string> = {
  running: "bg-cobalt-bright",
  failed: "bg-danger",
  succeeded: "bg-success",
};

const WORD_TONE: Record<RetryAttemptStatus, string> = {
  running: "text-cobalt-bright",
  failed: "text-danger",
  succeeded: "text-success",
};

const WORD: Record<RetryAttemptStatus, string> = {
  running: "Running",
  failed: "Failed",
  succeeded: "Succeeded",
};

/** The ladder's width in px; the rails sit at its two edges. */
const LADDER = 28;

function Rung({
  attempt,
  number,
  motionSafe,
}: {
  attempt: RetryAttempt;
  number: number;
  motionSafe: boolean;
}) {
  const { status } = attempt;
  const running = status === "running";
  const succeeded = status === "succeeded";
  const failed = status === "failed";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <li
      className="grid items-start gap-x-3"
      style={{ gridTemplateColumns: `${LADDER}px minmax(0, 1fr)` }}
    >
      <span aria-hidden className="relative flex h-5 items-center">
        {/* The rung draws across the rails from its left on glide: an
            attempt starting is a surface extending, not a switch. */}
        <motion.span
          className={cn(
            "h-0.5 w-full origin-left rounded-full transition-colors duration-300",
            RUNG_TONE[status],
          )}
          initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.enter }
          }
        />
        <motion.span
          className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cobalt-bright"
          initial={false}
          animate={{
            opacity: running ? (motionSafe ? [1, 0.3] : 0.7) : 0,
            scale: running && motionSafe ? [1, 1.6] : 1,
          }}
          transition={
            running && motionSafe
              ? {
                  duration: 0.8,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "reverse",
                }
              : { duration: durations.fast }
          }
        />
        <motion.span
          className="absolute top-1/2 left-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-success text-background"
          initial={false}
          animate={{
            opacity: succeeded ? 1 : 0,
            scale: succeeded || !motionSafe ? 1 : 0.6,
          }}
          transition={motionSafe ? springs.flick : { duration: durations.fast }}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={false}
              animate={{ pathLength: succeeded ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </motion.span>
      </span>

      <motion.div
        className="flex min-w-0 flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fade}
      >
        <div className="flex h-5 items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
            <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
              <span className="sr-only">Attempt </span>
              {number}
            </span>
            <span
              className="min-w-0 truncate text-foreground"
              title={attempt.label}
            >
              {attempt.label}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium transition-colors duration-300",
              WORD_TONE[status],
            )}
          >
            {WORD[status]}
          </span>
        </div>
        {failed ? (
          <motion.p
            className="text-[11px] leading-relaxed text-danger"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fade}
          >
            {attempt.error ?? "The attempt failed."}
          </motion.p>
        ) : null}
      </motion.div>
    </li>
  );
}

/**
 * A retry control that keeps its history in sight. Past attempts stack upward
 * as the rungs of a ladder, oldest at the bottom, and each rung reads its
 * number, how that attempt differed, and the error it met — in words. When
 * the host appends a running attempt a new rung draws across the rails from
 * its left on `glide`, no overshoot, while the ladder grows to a height
 * measured by a ResizeObserver on `glide`; the running rung's dot breathes at
 * the ambient tempo. A failure turns the rung danger on a colour tween and
 * its error line fades in; a success turns it green and a tick lands on
 * `flick`. The control squashes on `flick` when pressed and is disabled
 * while an attempt runs; once an attempt succeeds or `maxAttempts` is reached
 * a plain line says so and the control retires.
 *
 * The rungs are an ordered list, oldest first in the DOM and reversed only
 * visually; the live region announces each attempt's start and outcome once.
 * Under reduced motion rungs fade in whole, the dot holds at mid opacity,
 * the ladder's height changes on a tween and nothing squashes.
 */
export function RetryLadder({
  ref,
  attempts,
  next,
  maxAttempts = 4,
  onRetry,
  retryLabel = "Retry",
  label,
  className,
}: RetryLadderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const nextId = `${baseId}-next`;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe and again for every rung that lands, so the
    // ladder grows with its history instead of reserving room for it.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = attempts.length;
  const last = count > 0 ? attempts[count - 1] : undefined;
  const running = last?.status === "running";
  const succeeded = last?.status === "succeeded";
  const exhausted = !succeeded && !running && count >= maxAttempts;

  const announcement = !last
    ? ""
    : last.status === "running"
      ? `Attempt ${count} running: ${last.label}`
      : last.status === "failed"
        ? `Attempt ${count} failed${last.error ? `: ${last.error}` : ""}`
        : `Succeeded on attempt ${count}`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] tabular-nums">
          <span className="text-foreground">{count}</span>
          <span className="text-ink-3">&nbsp;/ {maxAttempts}</span>
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        {/* A flex column so the list's padding and gaps are all inside the
            measurement, and nothing collapses through the wrapper. */}
        <div ref={innerRef} className="flex flex-col">
          {count === 0 ? (
            <p className="text-xs text-ink-3">No attempts yet.</p>
          ) : (
            <ol
              aria-labelledby={labelId}
              className="relative flex flex-col-reverse gap-3 py-1"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-px bg-hairline-strong"
              />
              <span
                aria-hidden
                style={{ left: LADDER - 1 }}
                className="absolute inset-y-0 w-px bg-hairline-strong"
              />
              {attempts.map((attempt, index) => (
                <Rung
                  key={attempt.id}
                  attempt={attempt}
                  number={index + 1}
                  motionSafe={motionSafe}
                />
              ))}
            </ol>
          )}
        </div>
      </motion.div>

      {count === 0 ? null : succeeded ? (
        <p className="text-xs text-ink-3">Succeeded on attempt {count}.</p>
      ) : exhausted ? (
        <p className="text-xs text-ink-3">Out of attempts after {count}.</p>
      ) : (
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            disabled={running}
            aria-describedby={next ? nextId : undefined}
            onClick={() => {
              if (!running) onRetry?.();
            }}
            whileTap={motionSafe ? { scaleX: 1.02, scaleY: 0.96 } : undefined}
            transition={springs.flick}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
              "disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {retryLabel}
          </motion.button>
          {next ? (
            <span
              id={nextId}
              className="min-w-0 truncate text-xs text-ink-3"
              title={next}
            >
              Next: {next}
            </span>
          ) : null}
        </div>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
