"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type SaveMarkProps = {
  /** Which of the five save states to show. */
  state: SaveState;
  /** Epoch ms of the last save. Drives the relative time in the saved state. */
  savedAt?: number;
  /** Fires from the Retry action in the error state. */
  onRetry?: () => void;
  className?: string;
};

/** How often the relative time re-reads the clock while a save is on screen. */
const CLOCK_MS = 10_000;
/** Below this, "just now" is the truthful answer. */
const JUST_NOW_S = 45;
const SAVING_DOTS = [0, 1, 2];

/** A shake is a refusal, not a celebration: four beats, no overshoot, once. */
const SHAKE = [0, -4, 4, -3, 0];

function relative(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  if (seconds < JUST_NOW_S) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * An autosave indicator that tells the truth about time. Unsaved breathes on
 * `drift` — slow enough to read as waiting rather than as alarm; saving bounces
 * three dots on `snap`, each a beat out of phase so the group reads as work in
 * progress; saved draws its check with `pathLength` on `flick`, the fastest
 * spring in the set, because a confirmation should already be over by the time
 * you look at it. Error shakes once on a tween and offers Retry.
 *
 * "Saved just now" relaxes into a live "Saved 2m ago" from a timer that only
 * runs while a save is on screen — the clock is never read during render, so the
 * server and the first client paint agree. The chip is a polite `status` region
 * whose spoken text changes on state, not on every tick, so the relative time
 * never turns into a stream of announcements. Under reduced motion nothing
 * bounces or breathes: the states simply swap, and the check still appears.
 */
export function SaveMark({
  state,
  savedAt,
  onRetry,
  className,
}: SaveMarkProps) {
  const motionSafe = useMotionSafe();
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (state !== "saved" || !savedAt) return;
    // Only a timer callback reads the clock, never render.
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [state, savedAt]);

  // Before the first tick — and after a fresh save moves savedAt past the last
  // reading — "just now" is the honest label.
  const since =
    now !== null && savedAt ? relative(Math.max(0, now - savedAt)) : "just now";

  const visible =
    state === "saved"
      ? `Saved ${since}`
      : state === "saving"
        ? "Saving"
        : state === "dirty"
          ? "Unsaved changes"
          : state === "error"
            ? "Save failed"
            : "No changes";

  // The spoken text drops the relative time, so a polite region announces the
  // state once instead of re-announcing every clock tick.
  const spoken =
    state === "saved"
      ? "Saved"
      : state === "error"
        ? "Save failed"
        : state === "saving"
          ? "Saving"
          : state === "dirty"
            ? "Unsaved changes"
            : "No changes";

  const shaking = motionSafe && state === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-8 max-w-full items-center rounded-full border border-hairline bg-surface-1 pr-3 pl-2.5",
        className,
      )}
    >
      <motion.div
        className="flex min-w-0 items-center gap-2"
        initial={false}
        animate={shaking ? { x: SHAKE } : { x: 0 }}
        // Keyframe arrays never run on a spring — a spring silently drops the
        // middle of one — so the shake is a tween and the settle is flick.
        transition={
          shaking
            ? { duration: durations.base, ease: easings.move }
            : springs.flick
        }
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {state === "saving" ? (
            <span className="flex w-4 items-center justify-center gap-0.5">
              {SAVING_DOTS.map((index) => (
                <motion.span
                  key={index}
                  className="size-1 rounded-full bg-primary"
                  // An explicit initial, not `false`: a mount animation is what
                  // repeat loops, and `false` would leave the dots parked.
                  initial={{ y: 0 }}
                  animate={motionSafe ? { y: -2 } : { y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          repeat: Infinity,
                          repeatType: "mirror",
                          // A beat of offset per dot: in phase they would read
                          // as one bar sliding, not as three.
                          delay: index * 0.12,
                        }
                      : { duration: 0 }
                  }
                />
              ))}
            </span>
          ) : state === "saved" ? (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="size-4 text-success"
            >
              <motion.path
                d="M3.4 8.4 6.4 11.4 12.6 4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                // The draw is the confirmation, so it survives reduced motion as
                // an instant, complete tick rather than as nothing at all.
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={springs.flick}
              />
            </svg>
          ) : state === "error" ? (
            <svg viewBox="0 0 16 16" aria-hidden className="size-4 text-danger">
              <path
                d="M8 1.8 15 14.2H1zM8 6.2v3.4M8 11.9v.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : state === "dirty" ? (
            <motion.span
              className="size-2 rounded-full bg-warn"
              // Same reason as the saving dots: the breath is a repeating mount
              // animation, so it needs a real starting keyframe.
              initial={{ scale: 1, opacity: 1 }}
              animate={
                motionSafe ? { scale: 1.3, opacity: 0.65 } : { scale: 1 }
              }
              transition={
                motionSafe
                  ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
                  : { duration: 0 }
              }
              style={{ originX: 0.5, originY: 0.5 }}
            />
          ) : (
            <span className="size-2 rounded-full border border-hairline-strong" />
          )}
        </span>

        <span className="min-w-0 text-xs font-medium">
          <motion.span
            key={visible}
            aria-hidden
            className={cn(
              // Truncates rather than wrapping: the chip is one line tall, so
              // an overlong label has to clip, not spill out of the box.
              "block truncate",
              state === "error"
                ? "text-danger"
                : state === "saved"
                  ? "text-ink-2"
                  : "text-foreground",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {visible}
          </motion.span>
          <span className="sr-only">{spoken}</span>
        </span>

        {state === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-1 text-xs font-medium text-danger underline underline-offset-2 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Retry
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}
