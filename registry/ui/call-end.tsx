"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CallEndProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The room, printed and spoken. */
  callName: string;
  /** How many are on the call. @default 0 */
  people?: number;
  /** Elapsed seconds from the host; this component never reads a clock. */
  seconds: number;
  /** How long End must be held. @default 900 */
  holdMs?: number;
  /** Controlled ended state. */
  ended?: boolean;
  /** Initial ended state for uncontrolled usage. @default false */
  defaultEnded?: boolean;
  onEndedChange?: (ended: boolean) => void;
  /** Fires once when a hold completes, with the elapsed seconds at that moment. */
  onEnd?: (seconds: number) => void;
  /** Fires when a hold is released before it completes. */
  onCancel?: () => void;
  /** Fires as the hold starts and stops. */
  onHoldChange?: (holding: boolean) => void;
  /** Fires from the Rejoin control on the ended line. */
  onRejoin?: () => void;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const mmss = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const spoken = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const tail = `${rest} ${rest === 1 ? "second" : "seconds"}`;
  if (minutes === 0) return tail;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${tail}`;
};

const heads = (count: number): string =>
  `${count} ${count === 1 ? "person" : "people"} on the call`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Hang up, with a moment. Holding End drives a motion value from 0 to 1 at a
 * linear rate over `holdMs`, and that value is the ring's `pathLength`, so the
 * ring fills at the honest rate of the hold rather than at a spring's guess;
 * releasing early stops the animation and drains the ring on the exit ease,
 * and the hint says so, because a cancelled destructive action must report that
 * it cancelled. The call ends from the animation's own completion callback —
 * never from inside a state updater — and the bar leaves on the exit ease while
 * the frame glides to the ended line beneath it, whose height comes from a
 * ResizeObserver bound to the node when it arrives. Nothing about ending
 * bounces; only the Rejoin control arrives on `snap`.
 *
 * Space or Enter held fills the ring (a key repeat cannot restart it), the key
 * going up cancels, Escape cancels, and losing focus cancels. The progress is
 * never announced — a live percentage would talk over the hold — while a polite
 * status speaks one frozen sentence per change. Under reduced motion the ring
 * still fills, because it is the only signal the gesture is working, and the
 * bar cross-fades to the ended line instead of sliding.
 */
export function CallEnd({
  ref,
  callName,
  people = 0,
  seconds,
  holdMs = 900,
  ended,
  defaultEnded = false,
  onEndedChange,
  onEnd,
  onCancel,
  onHoldChange,
  onRejoin,
  className,
}: CallEndProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const [uncontrolledEnded, setUncontrolledEnded] =
    React.useState(defaultEnded);
  const isEnded = ended ?? uncontrolledEnded;

  const [holding, setHolding] = React.useState(false);
  const [hint, setHint] = React.useState<"idle" | "holding" | "cancelled">(
    "idle",
  );
  const [said, setSaid] = React.useState("");
  const [endedAt, setEndedAt] = React.useState(0);

  const progress = useMotionValue(0);
  const secondsRef = useLatest(seconds);
  const endRef = useLatest(onEnd);
  const cancelRef = useLatest(onCancel);
  const holdChangeRef = useLatest(onHoldChange);
  const endedChangeRef = useLatest(onEndedChange);
  const keyHeld = React.useRef(false);

  // Assigned in an effect rather than during render: the completion callback
  // fires long after commit, so it only needs to be fresh, never read early.
  const finish = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    finish.current = () => {
      const at = secondsRef.current;
      keyHeld.current = false;
      setHolding(false);
      setHint("idle");
      setEndedAt(at);
      if (ended === undefined) setUncontrolledEnded(true);
      setSaid(`The call ended after ${spoken(at)}`);
      endedChangeRef.current?.(true);
      endRef.current?.(at);
    };
  });

  // The fill is an `animate()` on a motion value, so the ring paints on the
  // compositor rather than through a re-render per frame; the cleanup stops it
  // the instant the hold breaks.
  React.useEffect(() => {
    if (!holding) {
      const drain = animate(progress, 0, {
        duration: durations.base,
        ease: easings.exit,
      });
      return () => drain.stop();
    }
    const fill = animate(progress, 1, {
      duration: Math.max(0.1, holdMs / 1000),
      ease: easings.linear,
      onComplete: () => finish.current(),
    });
    return () => fill.stop();
  }, [holding, holdMs, progress]);

  React.useEffect(() => {
    holdChangeRef.current?.(holding);
  }, [holding, holdChangeRef]);

  const startHold = () => {
    if (isEnded || holding) return;
    setHolding(true);
    setHint("holding");
    setSaid("Ending the call");
  };

  const cancelHold = () => {
    if (!holding) return;
    keyHeld.current = false;
    setHolding(false);
    setHint("cancelled");
    setSaid("Held for a moment, the call is still up");
    cancelRef.current?.();
  };

  const rejoin = () => {
    if (ended === undefined) setUncontrolledEnded(false);
    setHint("idle");
    setSaid("Back on the call");
    onEndedChange?.(false);
    onRejoin?.();
  };

  // The panel's height comes from the node when it arrives, not from a
  // mount-only effect reading a ref that is still null.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hintWords =
    hint === "holding"
      ? "Keep holding to end"
      : hint === "cancelled"
        ? "Held for a moment, not ended"
        : "Hold to end the call";

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
      >
        <div ref={innerRef} className="flex flex-col gap-2">
          {/* popLayout takes the leaving bar out of flow, so the frame glides
              to the ended line's height instead of first stacking both. */}
          <AnimatePresence initial={false} mode="popLayout">
            {isEnded ? (
              <motion.div
                key="ended"
                className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink-2">
                    Call ended
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {callName}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-xs text-ink-3 tabular-nums"
                >
                  {mmss(endedAt)}
                </span>
                <motion.button
                  type="button"
                  onClick={rejoin}
                  aria-label={`Rejoin ${callName}`}
                  className={cn(
                    "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-accent",
                    focusRing,
                  )}
                  initial={
                    motionSafe
                      ? { opacity: 0, x: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    motionSafe
                      ? springs.snap
                      : { duration: durations.fast, ease: easings.enter }
                  }
                >
                  Rejoin
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="live"
                role="group"
                aria-label={`${callName}, live, ${heads(people)}, ${spoken(seconds)} so far`}
                className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-2"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        y: -distances.step,
                        transition: exitFor(durations.base),
                      }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {callName}
                  </span>
                  <span aria-hidden className="truncate text-xs text-ink-3">
                    {heads(people)}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="shrink-0 font-mono text-xs text-ink-2 tabular-nums"
                >
                  {mmss(seconds)}
                </span>

                <span className="relative grid size-11 shrink-0 place-items-center">
                  <svg
                    viewBox="0 0 44 44"
                    aria-hidden
                    className="pointer-events-none absolute inset-0 size-full -rotate-90"
                  >
                    <circle
                      cx="22"
                      cy="22"
                      r="20.5"
                      fill="none"
                      className="text-hairline-strong"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <motion.circle
                      cx="22"
                      cy="22"
                      r="20.5"
                      fill="none"
                      className="text-danger"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      pathLength={1}
                      style={{ pathLength: progress }}
                    />
                  </svg>

                  <motion.button
                    type="button"
                    aria-label="Hold to end the call"
                    aria-describedby={hintId}
                    onPointerDown={startHold}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onPointerCancel={cancelHold}
                    onBlur={cancelHold}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        cancelHold();
                        return;
                      }
                      if (event.key !== " " && event.key !== "Enter") return;
                      // A held key repeats; the hold must not restart on each.
                      event.preventDefault();
                      if (event.repeat || keyHeld.current) return;
                      keyHeld.current = true;
                      startHold();
                    }}
                    onKeyUp={(event) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      cancelHold();
                    }}
                    className={cn(
                      "grid size-9 place-items-center rounded-full bg-danger/10 text-[11px] font-semibold text-danger transition-colors hover:bg-danger/20",
                      focusRing,
                    )}
                    initial={false}
                    animate={{ scale: motionSafe && holding ? 0.94 : 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    End
                  </motion.button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {isEnded ? null : (
            <p
              id={hintId}
              className={cn(
                "px-1 text-xs transition-colors",
                hint === "cancelled" ? "text-warn" : "text-ink-3",
              )}
            >
              {hintWords}
            </p>
          )}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
