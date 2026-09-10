"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AwayTimerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The member, shown and spoken. */
  name: string;
  /** The away period counted from, in seconds. Changing it restarts the run. @default 600 */
  seconds?: number;
  /** Controlled away state. */
  away?: boolean;
  /** Initial away state for uncontrolled use. @default false */
  defaultAway?: boolean;
  onAwayChange?: (away: boolean) => void;
  /** The away note shown beside the countdown. @default "Back shortly" */
  note?: string;
  /** Remainder at which the ring and figure warm to warn. @default 60 */
  warnSeconds?: number;
  /** Fires once when the remainder reaches zero. */
  onExpire?: () => void;
  /** Fires from the timer each time the whole second changes. */
  onRemainingChange?: (seconds: number) => void;
  /** Holds the control; the countdown still runs and still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the run. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const clock = (value: number) => {
  const whole = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

const periodPhrase = (value: number) => {
  const whole = Math.max(0, Math.round(value));
  if (whole >= 60) {
    const minutes = Math.round(whole / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${whole} ${whole === 1 ? "second" : "seconds"}`;
};

type RunProps = {
  seconds: number;
  warn: boolean;
  visible: boolean;
  motionSafe: boolean;
  onTick: (left: number) => void;
  onEnd: () => void;
};

/**
 * One away run. Mounting is the reset: the remainder starts at the period the
 * props named, so a second run can never inherit the first one's remainder.
 * The whole component reads from this single motion value, which is why the
 * ring and the figure can never disagree — and why no clock is read anywhere.
 */
function AwayRun({
  seconds,
  warn,
  visible,
  motionSafe,
  onTick,
  onEnd,
}: RunProps) {
  const left = useMotionValue(seconds);
  const tickRef = useLatest(onTick);
  const endRef = useLatest(onEnd);
  // A run that is already leaving must stop counting: its remaining frames
  // would otherwise report ticks — and an expiry — against the run that
  // replaced it.
  const present = useIsPresent();
  const offset = useTransform(left, (value) =>
    Math.max(0, Math.min(1, 1 - value / Math.max(1, seconds))),
  );

  React.useEffect(() => {
    let last = Math.ceil(left.get());
    return left.on("change", (value) => {
      const next = Math.max(0, Math.ceil(value));
      if (next === last) return;
      last = next;
      tickRef.current(next);
    });
  }, [left, tickRef]);

  React.useEffect(() => {
    if (!visible || !present) return;
    const remaining = left.get();
    if (remaining <= 0) return;
    const controls = animate(left, 0, {
      // A countdown is information: it drains at the same linear rate whatever
      // the motion preference, and a hidden tab holds it where it stands.
      duration: remaining,
      ease: easings.linear,
      onComplete: () => endRef.current(),
    });
    return () => controls.stop();
  }, [visible, present, left, endRef]);

  return (
    <motion.svg
      viewBox="0 0 44 44"
      aria-hidden
      className={cn(
        "absolute inset-0 size-full transition-colors",
        warn ? "text-warn" : "text-cobalt-bright",
      )}
      initial={motionSafe ? { opacity: 0, scale: 0.94 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      style={{ originX: 0.5, originY: 0.5 }}
    >
      <circle
        cx="22"
        cy="22"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <motion.circle
        cx="22"
        cy="22"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        transform="rotate(-90 22 22)"
        style={{ strokeDashoffset: offset }}
      />
    </motion.svg>
  );
}

/**
 * Back in ten. Going away dims the disc, hangs a small clock on its corner in
 * place of the presence dot, and draws a ring that drains linearly across the
 * period — the one place a tween is more honest than a spring, because a minute
 * is a minute and no easing may borrow from it. The remainder lives in a single
 * motion value the ring reads directly and the mm:ss figure steps from, so the
 * two can never disagree, and nothing anywhere reads a clock during render.
 * Inside the last `warnSeconds` the arc and the figure warm to warn — colour
 * only, no pulse.
 *
 * Expiry returns the presence dot with a pop: the arc leaves on the exit ease
 * and the dot mounts from 0.4 on `recoil`, ζ0.53's two visible bounces, the one
 * celebratory move the component has. Coming back early plays the same pop,
 * because the dot returning is the event either way. The period comes from
 * `seconds` and the run restarts when it changes or when away is set again; a
 * hidden tab holds the whole run where it stands rather than spending minutes it
 * never showed.
 *
 * The state is a visible sentence — `Away · Back in ten · 0:41`, or `Online` —
 * so the ring, the dim and the dot are never the only signal, and the figure is
 * plain text rather than a live region so nobody is read a number every second.
 * A polite status region speaks only the two moments that matter. Under reduced
 * motion nothing pops and nothing travels, but the ring still drains and the
 * figure still counts.
 */
export function AwayTimer({
  ref,
  name,
  seconds = 600,
  away,
  defaultAway = false,
  onAwayChange,
  note = "Back shortly",
  warnSeconds = 60,
  onExpire,
  onRemainingChange,
  disabled = false,
  className,
}: AwayTimerProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const period = Math.max(1, Math.round(seconds));
  const [uncontrolled, setUncontrolled] = React.useState(defaultAway);
  const isControlled = away !== undefined;
  const isAway = isControlled ? away : uncontrolled;

  // A run is identified by the away state and the period it counts from.
  // Deriving it during render — rather than in an effect — is what makes the
  // remainder reset in the same commit the period changed in.
  const runKey = `${isAway ? "away" : "back"}:${period}`;
  const [run, setRun] = React.useState(() => ({
    key: runKey,
    id: 0,
    ended: false,
  }));
  if (run.key !== runKey) {
    // Changing the period while the member is online is not a run: bumping the
    // id there would re-announce "is back" for a state that never left.
    const touchesAway = run.key.startsWith("away") || runKey.startsWith("away");
    setRun({
      key: runKey,
      id: touchesAway ? run.id + 1 : run.id,
      ended: false,
    });
  }
  const counting = isAway && !run.ended;

  const [tick, setTick] = React.useState<{ id: number; left: number } | null>(
    null,
  );
  const left = tick && tick.id === run.id ? tick.left : period;
  const warn = counting && left <= Math.max(0, Math.round(warnSeconds));

  const expireRef = useLatest(onExpire);
  const tickOutRef = useLatest(onRemainingChange);

  const setAwayState = (next: boolean) => {
    if (!isControlled) setUncontrolled(next);
    onAwayChange?.(next);
  };

  const handleEnd = () => {
    // Never from inside the updater: the state settles first, then the host
    // hears about it.
    setRun((prev) => ({ ...prev, ended: true }));
    setAwayState(false);
    expireRef.current?.();
  };

  const handleTick = (value: number) => {
    setTick({ id: run.id, left: value });
    tickOutRef.current?.(value);
  };

  const toggle = () => {
    if (counting) {
      setAwayState(false);
      return;
    }
    // An expired run that the host has not cleared restarts in place.
    if (isAway && run.ended) setRun((prev) => ({ ...prev, ended: false }));
    setAwayState(true);
  };

  // The spoken sentence is frozen at the moment the state changed, so a fast
  // set-away and come-back never leaves the announcement one step behind.
  const spokenKey = `${run.id}:${counting ? "away" : "back"}`;
  const [spoken, setSpoken] = React.useState(() => ({
    key: spokenKey,
    text: "",
  }));
  if (spoken.key !== spokenKey) {
    setSpoken({
      key: spokenKey,
      text: counting
        ? `${name} is away for ${periodPhrase(period)}`
        : `${name} is back`,
    });
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`${name} presence`}
      className={cn(
        "flex w-full items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span className="relative grid size-11 shrink-0 place-items-center">
        <motion.span
          aria-hidden
          className="grid size-9 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
          animate={{ opacity: counting ? 0.55 : 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("")}
        </motion.span>

        <AnimatePresence initial={false}>
          {counting ? (
            <AwayRun
              key={`run-${run.id}`}
              seconds={period}
              warn={warn}
              visible={visible}
              motionSafe={motionSafe}
              onTick={handleTick}
              onEnd={handleEnd}
            />
          ) : null}
        </AnimatePresence>

        <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center">
          <AnimatePresence initial={false}>
            {counting ? (
              <motion.span
                key="clock"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className={cn(
                  "col-start-1 row-start-1 grid size-4 place-items-center rounded-full border border-hairline bg-surface-0 transition-colors",
                  warn ? "text-warn" : "text-ink-2",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  className="size-2.5"
                >
                  <path d="M8 4.5V8l2.2 1.6" />
                </svg>
              </motion.span>
            ) : (
              <motion.span
                key="dot"
                aria-hidden
                // The one celebratory move: the dot coming back lands with
                // recoil's two bounces. Exactly two keyframes, as a spring
                // requires.
                initial={
                  motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? springs.recoil
                    : { duration: durations.fast, ease: easings.enter }
                }
                style={{ originX: 0.5, originY: 0.5 }}
                className="col-start-1 row-start-1 size-3 rounded-full border-2 border-surface-0 bg-success"
              />
            )}
          </AnimatePresence>
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-snug font-medium">
          {name}
        </span>
        <span
          className={cn(
            "truncate text-xs leading-snug transition-colors",
            warn ? "text-warn" : "text-ink-3",
          )}
        >
          {counting ? (
            <>
              Away · {note} ·{" "}
              <span className="font-mono tabular-nums">{clock(left)}</span>
            </>
          ) : (
            "Online"
          )}
        </span>
      </span>

      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          disabled && "opacity-50",
        )}
      >
        {counting ? "I am back" : "Set away"}
      </button>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken.text}
      </span>
    </div>
  );
}
