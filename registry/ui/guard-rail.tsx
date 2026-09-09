"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GuardRailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** How close the conversation stands to the line: 0 is far, 1 or more has crossed. */
  proximity: number;
  /** The line's name, printed at the rail's end. */
  boundary: string;
  /** Why the line stopped the thread, shown when crossed. */
  reason?: string;
  /** Fraction past which the rail turns warn. @default 0.7 */
  warnAt?: number;
  /** Names the rail for assistive technology. */
  label: string;
  className?: string;
};

type Tone = "clear" | "near" | "crossed";

const round3 = (value: number): number => Number(value.toFixed(3));

const MARKER_TONE: Record<Tone, string> = {
  clear: "bg-cobalt-bright",
  near: "bg-warn",
  crossed: "bg-danger",
};

/**
 * A rail that shows how close a conversation stands to a boundary. The rail
 * ends at the line — a short bar named for the policy — and a round marker
 * sits on it at `proximity` with a fill behind it. Both are placed by
 * percentage inside a lane one marker narrower than the rail, so nothing is
 * measured and the marker at 1 rests exactly against the line. Each message
 * moves them on `glide`; past `warnAt` they take the warn tone on a colour
 * tween.
 *
 * A value of 1 or more is a crossing: that last stretch runs on `recoil`, so
 * the marker hits the line, overshoots into it and bounces back to rest
 * against it; the line flashes once and a reason unfolds beneath in a frame
 * whose height a ResizeObserver measures. Dropping below 1 folds the reason
 * and returns the marker on `glide`. Under reduced motion the marker and
 * fill still move, on a tween, because the distance is information; the
 * crossing does not bounce.
 */
export function GuardRail({
  ref,
  proximity,
  boundary,
  reason,
  warnAt = 0.7,
  label,
  className,
}: GuardRailProps) {
  const motionSafe = useMotionSafe();

  const value = Math.max(0, proximity);
  const crossed = value >= 1;
  const clamped = Math.min(1, value);
  const tone: Tone = crossed ? "crossed" : clamped >= warnAt ? "near" : "clear";
  const percent = round3(clamped * 100);

  // Only the move that crosses the line bounces; a step back and every step
  // short of the line glide. Adjusting during render keeps the choice in the
  // same commit as the value that made it.
  const [seenCrossed, setSeenCrossed] = React.useState(crossed);
  const [hit, setHit] = React.useState(false);
  if (seenCrossed !== crossed) {
    setSeenCrossed(crossed);
    setHit(crossed);
  }

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const move = motionSafe
    ? hit
      ? springs.recoil
      : springs.glide
    : { duration: durations.base, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const announcement = crossed
    ? `Crossed ${boundary}${reason ? `: ${reason}` : ""}`
    : tone === "near"
      ? `Near ${boundary}`
      : "";

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("flex w-full flex-col", className)}
    >
      <div className="flex flex-col gap-1.5">
        <div
          role="meter"
          aria-label={`Distance to ${boundary}`}
          aria-valuenow={Number(clamped.toFixed(2))}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuetext={
            crossed
              ? `Crossed ${boundary}`
              : `${Math.round(clamped * 100)} percent of the way to ${boundary}`
          }
          className="flex h-4 items-center"
        >
          <div className="relative h-4 w-full">
            {/* The clip box ends where the line stands, so the recoil's
                overshoot reads as the marker pushing into the line and never
                as a marker past the frame's edge. */}
            <div aria-hidden className="absolute inset-0 overflow-hidden">
              <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-2" />
              {/* The lane is one marker narrower than the rail, so 100% puts
                  the marker's right edge on the line rather than past it. */}
              <div className="absolute inset-y-0 right-4 left-0">
                <motion.span
                  className={cn(
                    "absolute top-1/2 box-content h-2 -translate-y-1/2 rounded-full pr-2 transition-colors duration-300",
                    MARKER_TONE[tone],
                  )}
                  initial={false}
                  animate={{ width: `${percent}%` }}
                  transition={move}
                />
                <motion.span
                  className={cn(
                    "absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-surface-0 shadow-sm transition-colors duration-300",
                    MARKER_TONE[tone],
                  )}
                  initial={false}
                  animate={{ left: `${percent}%` }}
                  transition={move}
                />
              </div>
              {/* The flash is keyed to the crossing, not the value, so a
                  later change while crossed cannot re-trigger it; it lives
                  in the clip box so its bloom stops at the line. */}
              <AnimatePresence initial={false}>
                {crossed ? (
                  <motion.span
                    key="flash"
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 rounded-full bg-danger"
                    initial={{ opacity: 0.7, scale: motionSafe ? 0.6 : 1 }}
                    animate={{ opacity: 0, scale: motionSafe ? 1.6 : 1 }}
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                ) : null}
              </AnimatePresence>
            </div>

            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 right-0 h-4 w-0.5 -translate-y-1/2 rounded-full transition-colors duration-300",
                crossed ? "bg-danger" : "bg-ink",
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-ink-3">In bounds</span>
          <span
            className={cn(
              "min-w-0 truncate font-medium transition-colors duration-300",
              crossed ? "text-danger" : "text-ink-2",
            )}
            title={boundary}
          >
            {boundary}
          </span>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col">
          <AnimatePresence initial={false}>
            {crossed && reason ? (
              <motion.p
                key="reason"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ ...fade, delay: motionSafe ? 0.2 : 0 }}
                className="mt-3 rounded-2 border border-danger/40 bg-surface-1 px-3 py-2 text-xs leading-relaxed text-ink-2"
              >
                <span className="font-medium text-danger">Stopped. </span>
                {reason}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
