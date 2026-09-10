"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LastSeenProps = {
  ref?: React.Ref<HTMLSpanElement>;
  /** Whose presence it is; opens the spoken sentence. */
  name: string;
  /** Minutes since they were last seen, from the host — never from a clock. */
  minutesAgo?: number;
  /** Swaps the label for a dot and the word Online. */
  online?: boolean;
  /** An already-formatted wall time ("14:52"), printed after the wording. */
  at?: string;
  /** Runs the internal count-up; the host owns the decision, not a clock. */
  ticking?: boolean;
  /** Milliseconds per added minute. @default 60000 */
  tickMs?: number;
  /** Leading words while offline. @default "Last seen" */
  label?: string;
  /** Override the wording ladder. */
  format?: (minutes: number) => string;
  /** Fires from an effect whenever the drawn reading changes. */
  onWordingChange?: (wording: string) => void;
  className?: string;
};

/** The house ladder: the wording re-writes itself as the total crosses a unit. */
const houseFormat = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return "just now";
  if (total === 1) return "a minute ago";
  if (total < 60) return `${total} minutes ago`;
  const hours = Math.floor(total / 60);
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
};

/** Only a crossing of these is worth speaking; the minute climb is not. */
const unitOf = (minutes: number): "minutes" | "hours" | "days" =>
  minutes < 60 ? "minutes" : minutes < 1440 ? "hours" : "days";

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/**
 * A wording, not a clock. Minutes arrive as a prop and the component only adds
 * to them from a ticker it is asked to run — an effect with cleanup that stops
 * while the tab is hidden and while the person is online — so nothing reads
 * `Date.now()` and the label renders the same on the server as in the browser.
 * As the total crosses each threshold the wording re-writes itself: just now, a
 * minute ago, four minutes ago, an hour ago, two days ago. The old words leave
 * upward and the new ones arrive from below on `glide`, stacked in a single grid
 * cell and cross-faded rather than queued with `mode="wait"`, so a fast ticker
 * can never leave the reading a step behind.
 *
 * Coming online swaps the whole label for a filled dot and the word Online, the
 * dot landing on `recoil` — the only celebration in a component that otherwise
 * just counts, and the word is always beside it, so the dot is never the signal
 * on its own. What is spoken is quieter than what is drawn: a polite region
 * announces the online swap and unit crossings and stays silent for the
 * minute-by-minute climb. Reduced motion cross-fades the wording in place and
 * lands the dot at full size; the count still runs, because elapsed time is
 * information.
 */
export function LastSeen({
  ref,
  name,
  minutesAgo = 0,
  online = false,
  at,
  ticking = false,
  tickMs = 60000,
  label = "Last seen",
  format,
  onWordingChange,
  className,
}: LastSeenProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The base is the parent's; the extra is ours. Adjusting during render (rather
  // than from an effect) means a new base never draws one frame of stale count.
  const [count, setCount] = React.useState(() => ({
    base: minutesAgo,
    extra: 0,
  }));
  if (count.base !== minutesAgo) setCount({ base: minutesAgo, extra: 0 });

  const running = ticking && !online && visible;
  React.useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setCount((prev) => ({ ...prev, extra: prev.extra + 1 })),
      Math.max(200, tickMs),
    );
    return () => window.clearInterval(timer);
  }, [running, tickMs]);

  const minutes = count.base + count.extra;
  const wording = (format ?? houseFormat)(minutes);
  const reading = online ? "online" : wording;
  const sentence = online
    ? `${name} is online`
    : at
      ? `${name} was last seen ${wording}, at ${at}`
      : `${name} was last seen ${wording}`;

  // Frozen at the moment of the change, and only for changes worth hearing.
  const unit = unitOf(minutes);
  const [seen, setSeen] = React.useState(() => ({ online, unit, sentence }));
  if (seen.online !== online || seen.unit !== unit) {
    setSeen({ online, unit, sentence });
  }

  const wordingRef = useLatest(onWordingChange);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    wordingRef.current?.(reading);
  }, [reading, wordingRef]);

  return (
    <span
      ref={ref}
      className={cn("inline-flex max-w-full items-center", className)}
    >
      {/* role="img" makes the subtree presentational, so the live region below
          is a sibling rather than a child of the label. */}
      <span role="img" aria-label={sentence} className="grid overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.span
            key={reading}
            initial={
              motionSafe ? { y: "100%", opacity: 0 } : { y: 0, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { y: "-100%", opacity: 0, transition: exitFor() }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
            className="col-start-1 row-start-1 flex items-center gap-1.5 text-xs whitespace-nowrap"
          >
            {online ? (
              <>
                <motion.span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-success"
                  initial={motionSafe ? { scale: 0.4 } : { scale: 1 }}
                  animate={{ scale: 1 }}
                  transition={
                    motionSafe ? springs.recoil : { duration: durations.fast }
                  }
                />
                <span className="font-medium text-foreground">Online</span>
              </>
            ) : (
              <span className="text-ink-3">
                <span className="text-ink-2">{label}</span> {wording}
                {at ? ` · ${at}` : ""}
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </span>
  );
}
