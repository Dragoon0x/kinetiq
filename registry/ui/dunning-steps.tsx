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

export type DunningStep = {
  id: string;
  title: string;
  /** One short line: the channel and the tone. */
  detail?: string;
  /** Days after the due date this reminder goes out. */
  day: number;
};

export type DunningStepsProps = {
  ref?: React.Ref<HTMLDivElement>;
  steps: DunningStep[];
  /** Controlled count of steps that have gone out. */
  sent?: number;
  /** Initial count for uncontrolled usage. @default 0 */
  defaultSent?: number;
  /** Fires from the countdown's completion with the new count. */
  onSentChange?: (count: number) => void;
  /** Fires alongside `onSentChange` for the step that just went out. */
  onStepSent?: (index: number, step: DunningStep) => void;
  /** The clock. Only a prop or a host's button starts it. @default false */
  running?: boolean;
  /** Controlled pause. */
  paused?: boolean;
  /** Initial pause for uncontrolled usage. @default false */
  defaultPaused?: boolean;
  /** Fires from the Pause or Resume press. */
  onPausedChange?: (paused: boolean) => void;
  /** Milliseconds each ring takes to drain. @default 4000 */
  intervalMs?: number;
  /** Heading. @default "Reminders" */
  label?: string;
  /** @default "Pause" */
  pauseLabel?: string;
  /** @default "Resume" */
  resumeLabel?: string;
  className?: string;
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the ring stops draining where nobody is. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type StepState = "sent" | "next" | "upcoming";

const STATUS_WORD: Record<StepState, string> = {
  sent: "Sent",
  next: "Next",
  upcoming: "Upcoming",
};

/**
 * A vertical rail of reminder emails that escalate. Sent steps are stamped: a
 * tick that lands from 1.3× on `recoil`, whose ζ0.53 gives the two bounces of
 * a stamp hitting paper. The next step wears a ring that drains linearly
 * across `intervalMs`, and the rail segment leading to it fills at the same
 * rate from one motion value, so the rail visibly advances toward the next
 * reminder. When the ring runs out the send is reported from the animation's
 * completion callback and the next ring begins.
 *
 * The clock runs only while `running` is true, lives in an effect with
 * cleanup, stops while the document is hidden and resumes from where it stood.
 * Pause freezes the rail where it is — the ring holds its remainder and a
 * "Paused" word arrives on `snap` — and Resume continues from there. The list
 * is an ordered list whose next step carries `aria-current`, every state is a
 * visible word rather than a colour, and the pause control is a real pressed
 * button. Under reduced motion the ring still drains, because a countdown is
 * information, and the stamp appears without its bounce.
 */
export function DunningSteps({
  ref,
  steps,
  sent,
  defaultSent = 0,
  onSentChange,
  onStepSent,
  running = false,
  paused,
  defaultPaused = false,
  onPausedChange,
  intervalMs = 4000,
  label = "Reminders",
  pauseLabel = "Pause",
  resumeLabel = "Resume",
  className,
}: DunningStepsProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const labelId = React.useId();

  const [ownSent, setOwnSent] = React.useState(defaultSent);
  const sentCount = Math.min(steps.length, Math.max(0, sent ?? ownSent));
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const isPaused = paused ?? ownPaused;
  const [message, setMessage] = React.useState("");

  // 1 → 0 across intervalMs. A motion value, not state, is what makes pausing
  // free: stop the animation, resume from what is left, nothing re-renders.
  const remaining = useMotionValue(1);
  const progress = useTransform(remaining, (value) => 1 - value);

  const complete = useLatest(() => {
    const step = steps[sentCount];
    const next = sentCount + 1;
    if (sent === undefined) setOwnSent(next);
    onSentChange?.(next);
    if (step) {
      onStepSent?.(sentCount, step);
      setMessage(`${step.title} sent`);
    }
  });

  const lastSent = React.useRef(sentCount);
  const done = sentCount >= steps.length;

  React.useEffect(() => {
    // A new step starts a full ring; a stopped clock shows a full ring too.
    if (lastSent.current !== sentCount || !running) {
      lastSent.current = sentCount;
      remaining.set(1);
    }
    if (!running || isPaused || !visible || done) return;
    const controls = animate(remaining, 0, {
      // A countdown is information, not flourish: it drains under reduced
      // motion at the same linear rate.
      duration: (intervalMs / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => complete.current(),
    });
    return () => controls.stop();
  }, [
    sentCount,
    running,
    isPaused,
    visible,
    done,
    intervalMs,
    remaining,
    complete,
  ]);

  const togglePause = () => {
    const next = !isPaused;
    if (paused === undefined) setOwnPaused(next);
    onPausedChange?.(next);
    setMessage(next ? `${label} paused` : `${label} resumed`);
  };

  const wordSwap = motionSafe
    ? { ...springs.snap, opacity: { duration: durations.fast } }
    : { duration: durations.fast };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          id={labelId}
          className="min-w-0 truncate text-sm font-medium text-foreground"
        >
          {label}
        </span>
        <button
          type="button"
          aria-pressed={isPaused}
          disabled={done}
          onClick={togglePause}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-input bg-surface-0 px-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            isPaused && "border-hairline-strong bg-cobalt-wash",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="currentColor"
            className="size-3.5 shrink-0"
          >
            {isPaused ? (
              <path d="M5 3.5v9l7-4.5z" />
            ) : (
              <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" />
            )}
          </svg>
          {isPaused ? resumeLabel : pauseLabel}
        </button>
      </div>

      <ol aria-labelledby={labelId} className="flex flex-col">
        {steps.map((step, index) => {
          const state: StepState =
            index < sentCount
              ? "sent"
              : index === sentCount
                ? "next"
                : "upcoming";
          const last = index === steps.length - 1;
          const word =
            state === "next" && isPaused ? "Paused" : STATUS_WORD[state];
          return (
            <li
              key={step.id}
              aria-current={state === "next" ? "step" : undefined}
              className={cn("relative flex gap-3", !last && "pb-4")}
            >
              {!last ? (
                <span
                  aria-hidden
                  className="absolute top-6 bottom-0 left-3 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-hairline"
                >
                  {/* The segment out of the last sent node follows the ring;
                      earlier ones are full, later ones empty, and once every
                      step has gone the whole rail stays full. */}
                  <motion.span
                    className="absolute inset-0 origin-top bg-cobalt-bright"
                    style={
                      !done && index === sentCount - 1
                        ? { scaleY: progress }
                        : { scaleY: done || index < sentCount - 1 ? 1 : 0 }
                    }
                  />
                </span>
              ) : null}

              <span className="relative flex size-6 shrink-0 items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className={cn(
                    "absolute inset-0 size-full -rotate-90 transition-opacity",
                    state === "next" && isPaused && "opacity-50",
                  )}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={
                      state === "sent"
                        ? "text-cobalt-bright"
                        : "text-hairline-strong"
                    }
                  />
                  {state === "next" ? (
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray="1 1"
                      className="text-cobalt-bright"
                      style={{ strokeDashoffset: progress }}
                    />
                  ) : null}
                </svg>
                <AnimatePresence initial={false}>
                  {state === "sent" ? (
                    <motion.span
                      key="stamp"
                      aria-hidden
                      className="flex items-center justify-center text-cobalt-bright"
                      initial={
                        motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.recoil,
                              opacity: { duration: durations.blink },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3"
                      >
                        <path d="M3.4 8.4 6.4 11.4 12.6 4.8" />
                      </svg>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="dot"
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        state === "next" ? "bg-cobalt-bright" : "bg-ink-3/60",
                      )}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      transition={{ duration: durations.fast }}
                    />
                  )}
                </AnimatePresence>
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span
                    title={step.title}
                    className={cn(
                      "truncate text-sm font-medium transition-colors",
                      state === "upcoming" ? "text-ink-3" : "text-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="relative flex h-5 shrink-0 items-center overflow-hidden">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={word}
                        className={cn(
                          "inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10px] tracking-[0.08em] uppercase",
                          state === "sent" &&
                            "border-cobalt-bright/30 bg-cobalt-wash text-cobalt-bright",
                          state === "next" &&
                            !isPaused &&
                            "border-hairline-strong text-foreground",
                          state === "next" &&
                            isPaused &&
                            "border-warn/40 bg-warn/10 text-warn",
                          state === "upcoming" && "border-hairline text-ink-3",
                        )}
                        initial={
                          motionSafe
                            ? { y: distances.step, opacity: 0 }
                            : { opacity: 0 }
                        }
                        animate={{ y: 0, opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={wordSwap}
                      >
                        {word}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </div>
                <span className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
                  {step.detail ? `${step.detail} · ` : ""}Day {step.day}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <span role="status" className="sr-only">
        {message}
      </span>
    </div>
  );
}
