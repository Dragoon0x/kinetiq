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

export type UndoToastProps = {
  /** Shows the toast. Raise it after the edit has already been applied. */
  open: boolean;
  /** What was done — one short line, past tense. */
  message: string;
  /** Action copy. @default "Undo" */
  actionLabel?: string;
  /** Milliseconds until it dismisses itself; 0 or less keeps it up. @default 5000 */
  duration?: number;
  /** Fires when the action is taken — restore the thing here. */
  onAction?: () => void;
  /** Fires when the ring runs out, the toast is closed, or a restore finishes. */
  onDismiss?: () => void;
  /** Overrides the default bottom-centre placement inside the nearest relative parent. */
  className?: string;
};

/** How long the restored line stays legible before the toast lifts away. */
const RESTORED_HOLD_MS = 900;

/** Keeps callbacks out of effect dependencies so a re-render never restarts the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type ToastPanelProps = {
  message: string;
  actionLabel: string;
  duration: number;
  onAction?: () => void;
  onDismiss?: () => void;
};

/**
 * The panel is its own component so that mounting resets the countdown and the
 * restored state — a second toast is a second panel, not a stale one re-used.
 */
function ToastPanel({
  message,
  actionLabel,
  duration,
  onAction,
  onDismiss,
}: ToastPanelProps) {
  const motionSafe = useMotionSafe();
  const [restored, setRestored] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const dismissRef = useLatest(onDismiss);

  // 1 → 0 across `duration`. Holding the remainder in a motion value (not
  // state) is what makes pausing free: stop the animation, resume from what
  // is left, and nothing re-renders in between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);

  React.useEffect(() => {
    if (restored || paused || duration <= 0) return;
    const controls = animate(remaining, 0, {
      // A countdown is information, not flourish, so the ring drains at the
      // same linear rate under reduced motion.
      duration: (duration / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => dismissRef.current?.(),
    });
    return () => controls.stop();
  }, [restored, paused, duration, remaining, dismissRef]);

  React.useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(
      () => dismissRef.current?.(),
      RESTORED_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [restored, dismissRef]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <motion.div
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      initial={motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: motionSafe ? -distances.step : 0,
        transition: exitFor(),
      }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: fade }
          : { duration: durations.fast }
      }
      className={cn(
        "pointer-events-auto border-hairline-strong bg-popover text-popover-foreground shadow-raised",
        "flex w-full items-center gap-2.5 rounded-3 border px-3 py-2.5",
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center">
        <motion.svg
          viewBox="0 0 24 24"
          aria-hidden
          className="col-start-1 row-start-1 size-5"
          animate={{ opacity: restored ? 0 : paused ? 0.5 : 1 }}
          transition={fade}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <motion.circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            className="text-cobalt-bright"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 12 12)"
            style={{ strokeDashoffset: ringOffset }}
          />
        </motion.svg>
        <motion.svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="col-start-1 row-start-1 size-4 text-success"
          animate={{ opacity: restored ? 1 : 0 }}
          transition={fade}
        >
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </motion.svg>
      </span>

      {/* Both lines share one grid cell so the cross-fade never collapses the
          panel between them, and no height is reserved for a state. */}
      <span className="grid min-w-0 flex-1">
        <motion.span
          aria-hidden={restored}
          className="col-start-1 row-start-1 text-sm leading-snug"
          animate={{ opacity: restored ? 0 : 1 }}
          transition={fade}
        >
          {message}
        </motion.span>
        <motion.span
          aria-hidden={!restored}
          className="col-start-1 row-start-1 text-sm leading-snug font-medium"
          animate={{ opacity: restored ? 1 : 0 }}
          transition={fade}
        >
          Restored
        </motion.span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <motion.button
          type="button"
          disabled={restored}
          aria-hidden={restored}
          onClick={() => {
            if (restored) return;
            setRestored(true);
            onAction?.();
          }}
          animate={{ opacity: restored ? 0 : 1 }}
          transition={fade}
          className={cn(
            "flex h-7 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {actionLabel}
        </motion.button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss?.()}
          className={cn(
            "flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-3.5 shrink-0"
          >
            <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </span>
    </motion.div>
  );
}

/**
 * Undo, before the ring runs out. The toast rises on `recoil` — ζ0.53 gives the
 * two bounces of something landing on the stack — while a ring beside the
 * message drains linearly across `duration`. Hovering or focusing the toast
 * stops the ring where it stands and leaving resumes it from there, so reading
 * the message never costs you the window to act.
 *
 * Taking the action cross-fades the panel to a restored line and lifts it away;
 * running out dismisses on the exit ease, which accelerates rather than springs.
 * It is a `role="status"` region with a real button, so the action is one Tab
 * away. Under reduced motion the panel fades in place and the ring still drains,
 * because the countdown is information rather than decoration.
 *
 * Renders absolutely inside the nearest positioned ancestor — give the surface
 * it belongs to `relative` so the toast stays with its content.
 */
export function UndoToast({
  open,
  message,
  actionLabel = "Undo",
  duration = 5000,
  onAction,
  onDismiss,
  className,
}: UndoToastProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center",
        className,
      )}
    >
      {/* Keyed by message: a second archive replaces the panel outright, which
          restarts the countdown instead of inheriting the old one's remainder. */}
      <AnimatePresence mode="wait">
        {open ? (
          <ToastPanel
            key={message}
            message={message}
            actionLabel={actionLabel}
            duration={duration}
            onAction={onAction}
            onDismiss={onDismiss}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
