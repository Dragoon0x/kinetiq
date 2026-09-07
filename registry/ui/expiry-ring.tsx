"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ExpiryRingProps = {
  /** Length of the countdown in seconds. */
  seconds: number;
  /** Pause and resume. @default true */
  running?: boolean;
  /** Seconds left when the ring starts warning. @default 10 */
  warnAt?: number;
  /** Fires once, from the tick that reaches zero. */
  onExpire?: () => void;
  /** Fires from the Resend button, which also restarts the countdown. */
  onResend?: () => void;
  /** Whole seconds left, emitted only when the number changes. */
  onTick?: (secondsLeft: number) => void;
  /** What is expiring. */
  label: string;
  className?: string;
};

/** Fine enough that a second never flips visibly late, coarse enough to be cheap. */
const TICK_MS = 100;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function clock(secondsLeft: number): string {
  const whole = Math.max(0, secondsLeft);
  const minutes = Math.min(99, Math.floor(whole / 60));
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function spoken(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const rest = secondsLeft % 60;
  if (minutes === 0) return `${rest} seconds remaining`;
  return `${minutes} minutes ${rest} seconds remaining`;
}

/**
 * One odometer wheel. Rolling a strip of ten beats swapping two keyed spans:
 * a countdown revisits the same digit every ten seconds, and a digit that
 * returns before its own exit has finished is a React key collision.
 */
function RollDigit({
  char,
  motionSafe,
}: {
  char: string;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ height: "1000%" }}
        initial={false}
        animate={{ y: `${Number(char) * -10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((digit) => (
          <span
            key={digit}
            className="flex h-[10%] items-center justify-center"
          >
            {digit}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A countdown ring that drains linearly — the one place a tween is more honest
 * than a spring, because a second is a second and no easing may borrow from it.
 * Inside, mm:ss rolls on `snap`: one wheel per digit, so only the place that
 * changed moves. Under the warn threshold the ring pulses on `drift`, slow and
 * wide rather than urgent, and the digits warm to warn. Zero stamps "Expired"
 * on `recoil` — a stamp hitting paper, not a celebration — and swaps the line
 * for a Resend button that restarts the run.
 *
 * The element is a `timer` with its live region off, so a screen reader is not
 * read a number every second; a separate polite region speaks only at the two
 * moments that matter, crossing the threshold and expiring. `running` pauses and
 * resumes without losing the elapsed time. Under reduced motion the pulse never
 * runs and the digits swap in place, but the ring still drains: a countdown is
 * information, not flourish.
 */
export function ExpiryRing({
  seconds,
  running = true,
  warnAt = 10,
  onExpire,
  onResend,
  onTick,
  label,
  className,
}: ExpiryRingProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const [elapsed, setElapsed] = React.useState(0);
  const [runId, setRunId] = React.useState(0);

  // The ticker owns the elapsed total. State only mirrors it for rendering, so
  // pausing keeps the ref and resuming carries on from where it stopped.
  const elapsedRef = React.useRef(0);
  const lastSecondRef = React.useRef<number | null>(null);

  const expireRef = React.useRef(onExpire);
  const tickRef = React.useRef(onTick);
  React.useEffect(() => {
    expireRef.current = onExpire;
    tickRef.current = onTick;
  });

  const totalMs = Math.max(0, seconds) * 1000;

  React.useEffect(() => {
    if (!running || totalMs === 0) return;
    if (elapsedRef.current >= totalMs) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsedRef.current = Math.min(totalMs, elapsedRef.current + (now - last));
      last = now;
      setElapsed(elapsedRef.current);
      const left = Math.ceil((totalMs - elapsedRef.current) / 1000);
      if (left !== lastSecondRef.current) {
        lastSecondRef.current = left;
        // Reported from the tick that caused it, never from a state updater.
        tickRef.current?.(left);
      }
      if (elapsedRef.current >= totalMs) {
        window.clearInterval(timer);
        expireRef.current?.();
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [running, runId, totalMs]);

  const remainingMs = Math.max(0, totalMs - elapsed);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const expired = totalMs === 0 || remainingMs <= 0;
  const warning = !expired && secondsLeft <= warnAt;
  const fraction = totalMs === 0 ? 0 : remainingMs / totalMs;
  const face = clock(secondsLeft);

  const restart = () => {
    elapsedRef.current = 0;
    lastSecondRef.current = null;
    setElapsed(0);
    setRunId((id) => id + 1);
    onResend?.();
  };

  // Silence for the whole run; one sentence at each threshold that matters.
  const alert = expired
    ? `${label} expired`
    : warning
      ? `${label} expires in under ${warnAt} seconds`
      : "";

  return (
    <div
      className={cn("flex w-full items-center gap-3", className)}
      role="timer"
      aria-live="off"
      aria-labelledby={labelId}
    >
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 40 40" aria-hidden className="size-full -rotate-90">
          <motion.g
            // A real starting keyframe, not `false`: a ring that mounts already
            // inside the warn window still has to start pulsing.
            initial={{ scale: 1 }}
            animate={motionSafe && warning ? { scale: 1.05 } : { scale: 1 }}
            transition={
              motionSafe && warning
                ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
                : springs.snap
            }
            // Only origin* keys survive motion's transform-origin rewrite on
            // SVG children; anything else pulses about the corner.
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-hairline-strong"
            />
            <motion.circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              className={cn(
                "transition-colors duration-200",
                expired
                  ? "text-transparent"
                  : warning
                    ? "text-warn"
                    : "text-primary",
              )}
              initial={false}
              animate={{ strokeDashoffset: 1 - fraction }}
              // Linear, and only as long as the gap between readings: a drain
              // that eases is a drain that lies about how much time is left.
              transition={{ duration: TICK_MS / 1000, ease: easings.linear }}
            />
          </motion.g>
        </svg>

        <span
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums transition-colors duration-200",
            expired ? "text-ink-3" : warning ? "text-warn" : "text-foreground",
          )}
        >
          <span aria-hidden className="inline-flex items-center">
            {face.split("").map((char, index) =>
              char === ":" ? (
                <span
                  key={index}
                  className="inline-flex h-[1.2em] w-[1ch] items-center justify-center"
                >
                  :
                </span>
              ) : (
                <RollDigit key={index} char={char} motionSafe={motionSafe} />
              ),
            )}
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          id={labelId}
          title={label}
          className="truncate text-sm font-medium text-foreground"
        >
          {label}
        </span>

        {expired ? (
          <div className="flex flex-wrap items-center gap-2">
            <motion.span
              className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-surface-2 px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
              initial={motionSafe ? { scale: 0.82 } : { opacity: 0 }}
              animate={motionSafe ? { scale: 1 } : { opacity: 1 }}
              transition={
                motionSafe
                  ? springs.recoil
                  : { duration: durations.fast, ease: easings.enter }
              }
              style={{ originX: 0.5, originY: 0.5 }}
            >
              Expired
            </motion.span>
            <button
              type="button"
              onClick={restart}
              className="inline-flex h-8 shrink-0 items-center rounded-2 border border-input px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Resend
            </button>
          </div>
        ) : (
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {running ? "Expires in" : "Paused"}
          </span>
        )}

        <span className="sr-only">
          {expired ? "Expired" : spoken(secondsLeft)}
        </span>
      </div>

      <span role="status" className="sr-only">
        {alert}
      </span>
    </div>
  );
}
