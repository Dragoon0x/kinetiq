"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CallState = "none" | "ringing" | "joined";

export type CallBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled call state. */
  state?: CallState;
  /** Initial state for uncontrolled use. @default "none" */
  defaultState?: CallState;
  onStateChange?: (state: CallState) => void;
  /** The room or caller the call belongs to; shown and spoken. */
  title: string;
  /** Names already in the call. Drives the count sentence and the disc. @default [] */
  participants?: string[];
  /** Seconds already elapsed when the bar joins. @default 0 */
  startSeconds?: number;
  /** Fires once per whole second while joined. */
  onElapsedChange?: (seconds: number) => void;
  /** Fires after the state settles on joined. */
  onJoin?: () => void;
  /** Fires after the state settles on none, with the run's final seconds. */
  onLeave?: (seconds: number) => void;
  /** Copy on the primary control while ringing. @default "Join" */
  joinLabel?: string;
  /** Holds both controls; a running call still counts and still reads. @default false */
  disabled?: boolean;
  className?: string;
};

/** An hour is longer than the demo can watch, and the run stops on unmount. */
const RUN_CEILING = 3600;

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

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** "12 seconds", "1 minute", "1 minute 12 seconds" — spoken, so never "1 seconds". */
const spokenLength = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const minutePart = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const secondPart = `${rest} ${rest === 1 ? "second" : "seconds"}`;
  if (minutes === 0) return secondPart;
  if (rest === 0) return minutePart;
  return `${minutePart} ${secondPart}`;
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "·";

type RunProps = { from: number; visible: boolean; onTick: (s: number) => void };

/**
 * One joined run. Mounting is the reset, so a second call can never inherit the
 * first one's elapsed figure. The count lives in a motion value driven linearly
 * — a second is a second and no easing may borrow from it — and a subscriber
 * steps it to whole seconds, which is why nothing anywhere reads a clock.
 */
function CallRun({ from, visible, onTick }: RunProps) {
  const elapsed = useMotionValue(from);
  const tickRef = useLatest(onTick);

  React.useEffect(() => {
    let last = Math.floor(elapsed.get());
    return elapsed.on("change", (value) => {
      const next = Math.max(0, Math.floor(value));
      if (next === last) return;
      last = next;
      tickRef.current(next);
    });
  }, [elapsed, tickRef]);

  React.useEffect(() => {
    if (!visible) return;
    const span = RUN_CEILING - elapsed.get();
    if (span <= 0) return;
    // A hidden tab holds the count where it stands rather than spending
    // minutes it never showed.
    const controls = animate(elapsed, RUN_CEILING, {
      duration: span,
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [visible, elapsed]);

  return null;
}

/**
 * A call, ongoing, in the header. The bar lives in flow: a wrapper glides its
 * measured height from zero to the row's border box on `glide` while the row
 * rides down from `distances.step`, so a call arriving pushes the thread rather
 * than covering whatever the host wrote there, and a room with no call reserves
 * nothing.
 *
 * Ringing and joined are two states of the same bar. While ringing, a halo
 * behind the primary control scales 1 → 1.6 and fades on a repeating tween —
 * the only thing in a header allowed to breathe. Joining stops the halo in the
 * same commit, swaps the control to a plain outlined Leave (hanging up never
 * celebrates), and starts an elapsed figure held in one motion value driven
 * linearly, stepped to whole seconds by a subscriber and paused with the tab.
 * Leaving glides the height back to zero on the exit ease.
 *
 * The mm:ss figure is plain text, not a live region, so nobody is read a number
 * every second; a polite status speaks one frozen sentence per change. Escape
 * declines a ringing call but never leaves a joined one, because hanging up has
 * to be deliberate. Under reduced motion the bar still opens and closes — a
 * call arriving is information — but on a tween, without travel or pulse.
 */
export function CallBar({
  ref,
  state,
  defaultState = "none",
  onStateChange,
  title,
  participants = [],
  startSeconds = 0,
  onElapsedChange,
  onJoin,
  onLeave,
  joinLabel = "Join",
  disabled = false,
  className,
}: CallBarProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const [uncontrolled, setUncontrolled] =
    React.useState<CallState>(defaultState);
  const isControlled = state !== undefined;
  const current = isControlled ? state : uncontrolled;
  const open = current !== "none";
  const start = Math.max(0, Math.round(startSeconds));

  // A run is identified by the state and the figure it counts from. Deriving
  // the id during render — rather than in an effect — is what makes the
  // elapsed figure reset in the same commit the call was joined in.
  const runKey = `${current}:${start}`;
  const [run, setRun] = React.useState(() => ({ key: runKey, id: 0 }));
  const entering = run.key !== runKey && current === "joined";
  const runId = entering ? run.id + 1 : run.id;
  if (run.key !== runKey) setRun({ key: runKey, id: runId });

  const [tick, setTick] = React.useState<{
    id: number;
    seconds: number;
  } | null>(null);
  const elapsed = tick && tick.id === runId ? tick.seconds : start;

  const tickOutRef = useLatest(onElapsedChange);
  const handleTick = (seconds: number) => {
    setTick({ id: runId, seconds });
    tickOutRef.current?.(seconds);
  };

  const inRoom = participants.length + (current === "joined" ? 1 : 0);
  const people = `${inRoom} ${inRoom === 1 ? "person" : "people"}`;
  const caller = participants[0];

  // Every spoken line is built in one string so the accessible-name algorithm
  // cannot join two text nodes with a stray space before the comma.
  const sentenceFor = (next: CallState, previous: CallState) => {
    if (next === "ringing") {
      return caller
        ? `${caller} is calling ${title}, with ${people} in the room.`
        : `A call is ringing in ${title}.`;
    }
    if (next === "joined") return `You joined the call in ${title}.`;
    if (previous === "joined")
      return `You left the call after ${spokenLength(elapsed)}.`;
    return `You declined the call in ${title}.`;
  };

  // Frozen at the moment of the change: a later render that merely re-derives
  // the sentence can never make the region repeat a past event.
  const [seen, setSeen] = React.useState({ state: current, id: runId });
  const [spoken, setSpoken] = React.useState("");
  if (seen.state !== current || seen.id !== runId) {
    setSpoken(sentenceFor(current, seen.state));
    setSeen({ state: current, id: runId });
  }

  const move = (next: CallState) => {
    if (!isControlled) setUncontrolled(next);
    onStateChange?.(next);
  };

  const join = () => {
    move("joined");
    // Never from inside an updater: the state settles first, then the host
    // hears about it.
    onJoin?.();
  };

  const hangUp = () => {
    const seconds = elapsed;
    move("none");
    onLeave?.(seconds);
  };

  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = rowRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The row is always mounted — inert while there is no call — so the
    // observer binds to a node that exists rather than to a ref that is null
    // until later, and the open height stays honest when the column narrows.
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setRowHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = open ? (rowHeight ?? "auto") : 0;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const control =
    "flex h-8 shrink-0 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height }}
        transition={glide}
      >
        <div
          ref={rowRef}
          role="group"
          aria-label={`Call in ${title}`}
          inert={!open || undefined}
          onKeyDown={(event) => {
            // Escape declines a call that is ringing; it never hangs up a
            // joined one, because leaving has to be deliberate.
            if (event.key !== "Escape" || current !== "ringing") return;
            event.preventDefault();
            move("none");
          }}
        >
          <motion.div
            className="flex items-center gap-2.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2"
            initial={false}
            animate={{
              opacity: open ? 1 : 0,
              y: open || !motionSafe ? 0 : -distances.step,
            }}
            transition={glide}
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
            >
              {initialsOf(caller ?? title)}
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm leading-snug font-medium">
                {title}
              </span>
              <span className="truncate text-xs leading-snug text-ink-3">
                {current === "joined"
                  ? `In the call · ${people}`
                  : inRoom > 0
                    ? `Ringing · ${people} waiting`
                    : "Ringing · no one has joined yet"}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              {current === "joined" ? (
                <>
                  <span className="font-mono text-xs text-ink-2 tabular-nums">
                    {clock(elapsed)}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={hangUp}
                    aria-label={`Leave the call in ${title}`}
                    className={cn(
                      control,
                      "border border-hairline-strong hover:bg-accent",
                    )}
                  >
                    Leave
                  </button>
                </>
              ) : (
                <>
                  <span className="relative flex items-center">
                    {open &&
                      (motionSafe ? (
                        <motion.span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
                          animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                          transition={{
                            duration: durations.page,
                            ease: easings.enter,
                            repeat: Infinity,
                            repeatDelay: 0.15,
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -inset-0.5 rounded-2 ring-2 ring-cobalt-wash"
                        />
                      ))}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={join}
                      aria-label={`${joinLabel} the call in ${title}`}
                      className={cn(
                        control,
                        "relative bg-primary text-primary-foreground hover:opacity-90",
                      )}
                    >
                      {joinLabel}
                    </button>
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => move("none")}
                    aria-label={`Decline the call in ${title}`}
                    className={cn(
                      control,
                      "w-8 justify-center border border-hairline-strong px-0 text-ink-3 hover:bg-accent hover:text-foreground",
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
                </>
              )}
            </span>
          </motion.div>
        </div>
      </motion.div>

      {current === "joined" ? (
        <CallRun
          key={`run-${runId}`}
          from={start}
          visible={visible}
          onTick={handleTick}
        />
      ) : null}

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
