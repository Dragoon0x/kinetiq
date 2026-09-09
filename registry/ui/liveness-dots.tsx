"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LivenessPoint = { x: number; y: number };
export type LivenessStatus = "idle" | "running" | "passed" | "failed";

export type LivenessDotsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Where the dot stops, in order, as 0–100 percentages of the stage. */
  positions?: LivenessPoint[];
  /** How long the dot waits at each stop. @default 1600 */
  windowMs?: number;
  /** Controlled state of the check. */
  status?: LivenessStatus;
  /** Initial state for uncontrolled usage. @default "idle" */
  defaultStatus?: LivenessStatus;
  /** Fires from the press or the timer that moved the check. */
  onStatusChange?: (status: LivenessStatus) => void;
  /** Fires as each stop is caught or missed. */
  onResolve?: (index: number, caught: boolean) => void;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Six seeded stops around a ring, nudged so the path never reads as a clock. */
const DEFAULT_POSITIONS: LivenessPoint[] = [
  { x: 50, y: 18 },
  { x: 80, y: 34 },
  { x: 78, y: 70 },
  { x: 46, y: 84 },
  { x: 20, y: 66 },
  { x: 24, y: 30 },
];
const CENTRE: LivenessPoint = { x: 50, y: 50 };

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab cannot follow anything, so the window waits with it. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** Rounded before it reaches an attribute: a caller's float must hydrate. */
const fixed = (value: number) => Number(value.toFixed(3));

/**
 * Follow the dot. Begin sends a dot to the first of N stops on `glide`, where
 * it waits for `windowMs` before moving on. Catching it — the pointer
 * entering it, a press, or Space and Enter while it holds focus — stamps the
 * stop: a ring lands there on `recoil`, the one bounce in the check, and
 * stays. A stop left uncaught is marked with a still, dashed ring and the dot
 * moves on; a miss is not a landing, so nothing bounces. When the last stop
 * resolves, a clean run draws a closed loop through every stop with
 * `pathLength` on `glide` and a tick lands at the centre; any miss ends in a
 * plain count and a Try again.
 *
 * The dot is a real button that takes focus when the check starts and keeps
 * it as it travels, so the keyboard path is the same press at each stop. The
 * window lives in an effect with cleanup and waits while the tab is hidden.
 * Under reduced motion the dot swaps between stops, rings and the loop appear
 * in place, and the window is unchanged.
 */
export function LivenessDots({
  ref,
  positions = DEFAULT_POSITIONS,
  windowMs = 1600,
  status,
  defaultStatus = "idle",
  onStatusChange,
  onResolve,
  label,
  className,
  "aria-label": ariaLabel,
}: LivenessDotsProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<LivenessStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const current = isControlled ? status : uncontrolled;
  const running = current === "running";
  const passed = current === "passed";
  const failed = current === "failed";

  const [step, setStep] = React.useState(0);
  const [phase, setPhase] = React.useState<"travel" | "wait">("travel");
  const [results, setResults] = React.useState<boolean[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const [run, setRun] = React.useState(0);
  const dotRef = React.useRef<HTMLButtonElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const retryRef = React.useRef<HTMLButtonElement>(null);
  const handoffRef = React.useRef(false);
  // Which stop last resolved, keyed by run: a pointer entering and a click
  // can land on the same stop before React re-renders between them, and a
  // restarted check must not inherit the old run's last stop.
  const resolvedRef = React.useRef("");

  // A run that starts through props resets here, during render, against the
  // committed status — so a controlled host and the Begin press share one path.
  const [seenStatus, setSeenStatus] = React.useState(current);
  if (seenStatus !== current) {
    setSeenStatus(current);
    if (current === "running") {
      setRun((count) => count + 1);
      setStep(0);
      setPhase("travel");
      setResults([]);
    }
  }

  const total = positions.length;
  const caughtCount = results.filter(Boolean).length;
  const target = running ? (positions[step] ?? CENTRE) : CENTRE;

  const move = (next: LivenessStatus) => {
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
  };

  const resolve = (caught: boolean) => {
    const ticket = `${run}:${step}`;
    if (!running || resolvedRef.current === ticket) return;
    resolvedRef.current = ticket;
    const next = [...results, caught];
    setResults(next);
    onResolve?.(step, caught);
    if (step + 1 < total) {
      setAnnouncement(
        `${caught ? "Caught" : "Missed"} ${step + 1} of ${total}`,
      );
      setStep(step + 1);
      setPhase("travel");
      return;
    }
    const clean = next.every(Boolean);
    const count = next.filter(Boolean).length;
    setAnnouncement(
      clean
        ? "Liveness confirmed"
        : `Check failed. ${count} of ${total} caught.`,
    );
    handoffRef.current = true;
    move(clean ? "passed" : "failed");
  };

  // The timer reads the latest resolve so a re-render never restarts the window.
  const resolveRef = React.useRef(resolve);
  React.useEffect(() => {
    resolveRef.current = resolve;
  });

  // With motion the window opens when the dot arrives; without it the dot is
  // already there, so the window opens with the step and never waits on a
  // zero-length animation to report in.
  const waiting = running && visible && (phase === "wait" || !motionSafe);
  React.useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => resolveRef.current(false), windowMs);
    return () => window.clearTimeout(timer);
  }, [waiting, step, windowMs]);

  // Focus follows the check: onto the dot as it starts, and back to Try again
  // or the stage as it ends, so it never falls to the body with the dot.
  React.useEffect(() => {
    if (!handoffRef.current) return;
    handoffRef.current = false;
    if (running) dotRef.current?.focus();
    else (retryRef.current ?? stageRef.current)?.focus();
  }, [running]);

  const begin = () => {
    handoffRef.current = true;
    setAnnouncement("");
    move("running");
  };

  const loopPath = positions
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${fixed(point.x)} ${fixed(point.y)}`,
    )
    .join(" ")
    .concat(" Z");

  const hint = passed
    ? "Liveness confirmed."
    : failed
      ? `${caughtCount} of ${total} caught. Try again.`
      : running
        ? "Catch it at each stop."
        : "Follow the dot with your pointer, or press it as it stops.";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : (
          <span />
        )}
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {caughtCount} / {total}
        </span>
      </div>

      <div
        ref={stageRef}
        tabIndex={-1}
        className="relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-3 border border-hairline bg-surface-2 outline-none"
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 size-full"
        >
          {positions.map((point, index) => (
            <circle
              key={index}
              cx={fixed(point.x)}
              cy={fixed(point.y)}
              r="1.2"
              className="fill-ink-3/40"
            />
          ))}
          {results.map((caught, index) => {
            const point = positions[index];
            if (!point) return null;
            return caught ? (
              <motion.circle
                key={index}
                cx={fixed(point.x)}
                cy={fixed(point.y)}
                r="5"
                fill="none"
                strokeWidth="2"
                className="stroke-success"
                style={{ originX: 0.5, originY: 0.5 }}
                initial={
                  motionSafe ? { scale: 1.8, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.blink },
                      }
                    : { duration: durations.fast }
                }
              />
            ) : (
              <motion.circle
                key={index}
                cx={fixed(point.x)}
                cy={fixed(point.y)}
                r="5"
                fill="none"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                className="stroke-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              />
            );
          })}
          {passed ? (
            <motion.path
              d={loopPath}
              fill="none"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className="stroke-success"
              pathLength={1}
              initial={
                motionSafe ? { pathLength: 0, opacity: 1 } : { opacity: 0 }
              }
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
            />
          ) : null}
        </svg>

        {running ? (
          <motion.button
            ref={dotRef}
            type="button"
            aria-label={`Dot, stop ${step + 1} of ${total}. Press to catch it.`}
            onClick={() => resolve(true)}
            onPointerEnter={() => resolve(true)}
            style={{ x: "-50%", y: "-50%" }}
            initial={{ left: `${CENTRE.x}%`, top: `${CENTRE.y}%` }}
            animate={{ left: `${target.x}%`, top: `${target.y}%` }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            onAnimationComplete={() => {
              if (phase === "travel") setPhase("wait");
            }}
            className={cn(
              "absolute size-6 cursor-pointer rounded-full bg-cobalt-bright shadow-raised outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />
        ) : null}

        {!running ? (
          <div className="absolute inset-0 grid place-items-center">
            {passed ? (
              <motion.span
                aria-hidden
                className="grid size-12 place-items-center rounded-full bg-success/15 text-success"
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        delay: durations.slow,
                        opacity: {
                          duration: durations.blink,
                          delay: durations.slow,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5 shrink-0"
                >
                  <motion.path
                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                    initial={motionSafe ? { pathLength: 0 } : { pathLength: 1 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.flick, delay: durations.slow }
                        : { duration: 0 }
                    }
                  />
                </svg>
              </motion.span>
            ) : (
              <button
                ref={retryRef}
                type="button"
                onClick={begin}
                className={cn(
                  "flex h-9 items-center justify-center rounded-2 px-4 text-sm font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  failed
                    ? "border border-hairline-strong bg-surface-1 text-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
                )}
              >
                {failed ? "Try again" : "Begin check"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div aria-hidden className="flex gap-1">
        {positions.map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 min-w-0 flex-1 rounded-full transition-colors",
              results[index] === true
                ? "bg-success"
                : results[index] === false
                  ? "bg-danger/60"
                  : running && index === step
                    ? "bg-cobalt-bright"
                    : "bg-hairline-strong",
            )}
          />
        ))}
      </div>

      <div className="flex min-w-0 items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={hint}
            className={cn(
              "min-w-0 flex-1 text-xs",
              failed ? "text-warn" : "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {hint}
          </motion.span>
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
