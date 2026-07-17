"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RetryStatus = "idle" | "loading" | "success" | "error";

export type RetryPulseProps = {
  /** Controlled status. */
  status: RetryStatus;
  /** Fired on activation while idle or errored. */
  onRetry?: () => void;
  /** Idle label. @default "Submit" */
  label?: string;
  /** Errored label. @default "Retry" */
  retryLabel?: string;
  className?: string;
};

const ANNOUNCE: Record<RetryStatus, string> = {
  idle: "",
  loading: "Working",
  success: "Succeeded",
  error: "Failed — retry available",
};

/**
 * An action that carries its own outcome. Failing snaps the button sideways
 * once — a short, damped shake, not a wobble — and offers the retry; retrying
 * spins a bearing where the label was; succeeding stamps a check that draws
 * itself and lands on the recoil spring. The four states swap through one slot,
 * so the control never changes width under your cursor.
 *
 * The button reports `aria-busy` while it works and each outcome through a
 * polite live region, so the state is spoken, not just coloured. Reduced motion
 * keeps every state and announcement but drops the shake, the spin, and the
 * draw — the icons are simply there.
 */
export function RetryPulse({
  status,
  onRetry,
  label = "Submit",
  retryLabel = "Retry",
  className,
}: RetryPulseProps) {
  const motionSafe = useMotionSafe();
  const shakeX = useMotionValue(0);

  // A failure shakes the control once. Keyed on the status so re-entering the
  // error state re-shakes without a remount.
  React.useEffect(() => {
    if (status !== "error" || !motionSafe) return;
    const controls = animate(shakeX, [0, -5, 5, -4, 4, -2, 2, 0], {
      duration: durations.slow,
      ease: easings.move,
    });
    return () => controls.stop();
  }, [status, motionSafe, shakeX]);

  const busy = status === "loading";
  const clickable = status === "idle" || status === "error";
  const text =
    status === "idle"
      ? label
      : status === "error"
        ? retryLabel
        : status === "success"
          ? "Done"
          : "Working";

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <motion.button
        type="button"
        style={{ x: shakeX }}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={busy ? "Working" : text}
        onClick={() => {
          if (clickable) onRetry?.();
        }}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-2 px-3.5 text-sm font-medium transition-colors",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-default",
          status === "success"
            ? "bg-success/15 text-success"
            : status === "error"
              ? "bg-danger/15 text-danger"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          className,
        )}
      >
        <span className="relative flex size-4 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {status === "loading" && (
              <motion.svg
                key="spin"
                viewBox="0 0 16 16"
                className="absolute size-4"
                fill="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.blink } }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeOpacity={0.25}
                  strokeWidth={2}
                />
                <motion.path
                  d="M8 2 A6 6 0 0 1 14 8"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  animate={motionSafe ? { rotate: 360 } : undefined}
                  style={{ transformOrigin: "8px 8px" }}
                  transition={{ duration: 0.8, ease: easings.linear, repeat: Infinity }}
                />
              </motion.svg>
            )}
            {status === "success" && (
              <motion.svg
                key="check"
                viewBox="0 0 16 16"
                className="absolute size-4"
                fill="none"
                initial={{ scale: motionSafe ? 0.4 : 1 }}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.recoil : { duration: 0 }}
              >
                <motion.path
                  d="M3.5 8.4 L6.6 11.5 L12.5 4.5"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: motionSafe ? 0 : 1 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? { duration: durations.fast, ease: easings.enter, delay: 0.05 }
                      : { duration: 0 }
                  }
                />
              </motion.svg>
            )}
            {status === "error" && (
              <motion.svg
                key="alert"
                viewBox="0 0 16 16"
                className="absolute size-4"
                fill="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.blink } }}
              >
                <path
                  d="M8 4.5 V8.5 M8 11 h0.01"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        {text}
      </motion.button>

      <span role="status" aria-live="polite" className="sr-only">
        {ANNOUNCE[status]}
      </span>
    </div>
  );
}
