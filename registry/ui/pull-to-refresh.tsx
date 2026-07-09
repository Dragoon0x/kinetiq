"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Pointer travel (px) before a downward press becomes a pull — protects taps and scroll flicks. */
const DRAG_THRESHOLD = 3;
/** How far past the detent the rubber-band keeps yielding before it goes nearly rigid. */
const MAX_PULL = 220;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Rubber-band resistance: the first pixels track ~1:1, then each further pixel
 * yields less, so the content grows sub-linearly and the detent takes real
 * intent to cross. Mirrors the bottom sheet's overshoot compression, curved.
 */
const resist = (delta: number): number => {
  if (delta <= 0) return 0;
  const give = 1 - clamp(delta / MAX_PULL, 0, 1) * 0.6;
  return delta * give;
};

type Phase = "idle" | "pulling" | "armed" | "refreshing";

type DragState = {
  pointerId: number;
  startY: number;
  engaged: boolean;
};

export type PullToRefreshProps = {
  onRefresh: () => Promise<void> | void;
  /** The scrollable content. New rows that mount after a refresh cascade in. */
  children: React.ReactNode;
  /** Pixels of pull past which release triggers a refresh. */
  threshold?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A pull-to-refresh surface. When the inner list sits at its top, dragging down
 * over-pulls the content against rubber-band resistance while a gauge in the
 * revealed top zone fills toward a calibrated detent. Cross the detent and the
 * indicator arms with a `snap` tick; release while armed and it settles to a
 * refreshing hold, calls `onRefresh`, then — when that resolves — glides home
 * and cascades the incoming rows in on `cascade`. Release short of the detent
 * and it springs back untriggered.
 *
 * One `pull` MotionValue drives the translate and the gauge; the gesture is
 * wired from raw pointer events (capture + a 3px threshold) so the list still
 * scrolls normally and `touch-none` only bites while a pull is live. A
 * focusable Refresh button and a polite live region make the feature operable
 * and legible without a pointer. Reduced motion keeps 1:1 dragging but eases
 * `pull` home with no spring overshoot, and the refreshed rows fade in once
 * instead of cascading.
 */
export function PullToRefresh({
  onRefresh,
  children,
  threshold = 72,
  className,
  "aria-label": ariaLabel = "Pull to refresh",
}: PullToRefreshProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** Guards the async release path from touching state after unmount. */
  const mountedRef = React.useRef(true);
  /** Latest phase for handlers that must not re-subscribe per render. */
  const phaseRef = React.useRef<Phase>("idle");

  const pull = useMotionValue(0);
  const [phase, setPhase] = React.useState<Phase>("idle");
  // Bumped when a refresh completes; keying the content on it replays the
  // enter animation over whatever the parent handed back as children.
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const detent = Math.max(1, threshold);

  const setPhaseBoth = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stopPull = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  // Gauge fill 0→1 as the pull approaches the detent; the arc + progress ring
  // read straight off it, so the indicator tracks the finger without a render.
  const fill = useTransform(pull, (v) => clamp(v / detent, 0, 1));
  const ringPath = useTransform(fill, (v) => `${v} 1`);
  const tickRotate = useTransform(fill, [0, 1], [0, 180]);
  // The top zone opens exactly as far as the content is pulled.
  const zoneHeight = useTransform(pull, (v) => Math.max(0, v));

  const settleHome = React.useCallback(() => {
    stopPull();
    if (motionSafe) {
      controlsRef.current = animate(pull, 0, springs.snap);
    } else {
      controlsRef.current = animate(pull, 0, { duration: durations.fast });
    }
  }, [motionSafe, pull, stopPull]);

  const runRefresh = React.useCallback(() => {
    if (phaseRef.current === "refreshing") return;
    stopPull();
    setPhaseBoth("refreshing");
    // Settle to a steady hold (~the detent) while the work runs.
    const holdTo = motionSafe ? springs.snap : { duration: durations.fast };
    controlsRef.current = animate(pull, detent, holdTo);

    const finish = () => {
      if (!mountedRef.current) return;
      setRefreshNonce((n) => n + 1);
      setPhaseBoth("idle");
      settleHome();
    };

    Promise.resolve(onRefresh()).then(finish, finish);
  }, [detent, motionSafe, onRefresh, pull, setPhaseBoth, settleHome, stopPull]);

  const atTop = (): boolean => (scrollRef.current?.scrollTop ?? 0) <= 0;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (phaseRef.current === "refreshing") return;
    // Only a candidate pull when the list is already at its top; otherwise this
    // is an ordinary scroll and must pass straight through.
    if (!atTop()) return;
    stopPull();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = event.clientY - drag.startY;

    if (!drag.engaged) {
      // Upward or sub-threshold movement: abandon the candidate so the inner
      // list scrolls normally, and never hijack an upward gesture.
      if (delta <= DRAG_THRESHOLD) {
        if (delta < 0) dragRef.current = null;
        return;
      }
      drag.engaged = true;
      // Capture now (not on down) so taps and scrolls are never swallowed.
      event.currentTarget.setPointerCapture(event.pointerId);
      setPhaseBoth("pulling");
    }

    // Content scrolled away from the top mid-pull (momentum): release it.
    if (!atTop() && pull.get() === 0) {
      dragRef.current = null;
      setPhaseBoth("idle");
      return;
    }

    const next = resist(delta);
    pull.set(next);

    const armed = next >= detent;
    const wasArmed = phaseRef.current === "armed";
    if (armed && !wasArmed) {
      setPhaseBoth("armed");
      // The detent "click": a crisp tick as the gauge locks in.
      if (motionSafe) {
        stopPull();
        controlsRef.current = animate(pull, [next, next + 6, next], springs.snap);
      }
    } else if (!armed && wasArmed) {
      setPhaseBoth("pulling");
    }
  };

  const endPull = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.engaged) return;

    if (pull.get() >= detent) {
      runRefresh();
    } else {
      setPhaseBoth("idle");
      settleHome();
    }
  };

  const armedOrRefreshing = phase === "armed" || phase === "refreshing";
  const statusText =
    phase === "refreshing"
      ? "REFRESHING"
      : phase === "armed"
        ? "RELEASE"
        : "PULL";
  const liveText =
    phase === "refreshing"
      ? "Refreshing…"
      : refreshNonce > 0
        ? "Updated"
        : "";

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        "bg-surface-1 border-hairline relative overflow-hidden rounded-3 border",
        className,
      )}
    >
      {/* Pulled-open indicator zone — its height is the live pull distance. */}
      <motion.div
        aria-hidden
        style={{ height: zoneHeight }}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden"
      >
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 pb-2.5">
          <div className="relative h-6 w-6">
            <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="var(--hairline-strong)"
                strokeWidth="2"
              />
              <motion.circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke={
                  armedOrRefreshing ? "var(--accent-bright)" : "var(--signal)"
                }
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                style={{ strokeDasharray: ringPath }}
              />
            </svg>
            {/* Tick that rotates a half-turn as the gauge fills, brightening on arm. */}
            <motion.span
              style={{ rotate: tickRotate }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span
                className={cn(
                  "h-2 w-px rounded-full",
                  armedOrRefreshing ? "bg-cobalt-bright" : "bg-signal",
                )}
              />
            </motion.span>
          </div>
          <span
            className={cn(
              "text-label tabular-nums",
              armedOrRefreshing ? "text-ink" : "text-ink-3",
            )}
          >
            {statusText}
          </span>
        </div>
      </motion.div>

      {/* Scrollable content. Translating it down by `pull` reveals the zone. */}
      <motion.div
        ref={scrollRef}
        style={{ y: pull, touchAction: phase === "idle" ? "auto" : "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPull}
        onPointerCancel={endPull}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <motion.div
          key={refreshNonce}
          initial={motionSafe ? "enter" : "flat"}
          animate="settle"
          variants={{
            enter: {},
            flat: { opacity: 0 },
            settle: {
              opacity: 1,
              // A cascade over direct children when motion is on; a single
              // fast fade when it is not.
              transition: motionSafe
                ? { staggerChildren: cascade(6), delayChildren: 0.02 }
                : { duration: durations.fast },
            },
          }}
        >
          {motionSafe
            ? React.Children.map(children, (child) => (
                <motion.div variants={rowVariants}>{child}</motion.div>
              ))
            : children}
        </motion.div>
      </motion.div>

      {/* Real, focusable control — the refresh path without a pointer. */}
      <button
        type="button"
        onClick={runRefresh}
        disabled={phase === "refreshing"}
        aria-label="Refresh"
        className={cn(
          "text-label absolute top-1.5 right-1.5 z-20 rounded-1 px-2 py-1",
          "text-ink-3 hover:text-ink disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
        )}
      >
        {phase === "refreshing" ? "…" : "Refresh"}
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {liveText}
      </span>
    </div>
  );
}

/** Each refreshed row arrives from a short nudge above; exits never spring. */
const rowVariants = {
  enter: { opacity: 0, y: -8 },
  settle: {
    opacity: 1,
    y: 0,
    transition: {
      y: springs.snap,
      opacity: { duration: durations.base, ease: easings.enter },
    },
  },
} satisfies Record<string, Transition | Record<string, unknown>>;
