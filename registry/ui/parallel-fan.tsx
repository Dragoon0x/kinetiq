"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FanAttemptStatus = "running" | "done" | "failed";

export type FanAttempt = {
  id: string;
  /** Short caption under the node. */
  label: string;
  /** The model behind the attempt; read to assistive technology. */
  model?: string;
  /** 0..1, the ring's fill. */
  progress: number;
  /** @default "running" */
  status?: FanAttemptStatus;
  /** 0..1, printed as a whole percentage once the attempt is done. */
  score?: number;
};

export type ParallelFanProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Two to six attempts in fan order. */
  attempts: FanAttempt[];
  /** Whether the fan is open; false stacks every attempt on the root. */
  spread: boolean;
  /** The attempt gathered to the centre; the rest fade. */
  winner?: string;
  /** Fires from an attempt press or key. */
  onSelect?: (id: string) => void;
  /** The root node's caption. */
  task: string;
  /** Names the group. */
  label: string;
  className?: string;
};

/** The stage is 100 × 62.5 units (8:5); every position is a share of it. */
const VIEW_H = 62.5;
const ROOT = { x: 50, y: 54 };
const RADII = { x: 36, y: 40 };
const GATHER = { x: 50, y: 30 };
const ARC = { start: 200, end: 340 };

/** A point on the arc, rounded so the server and the browser agree. */
const arcPoint = (index: number, count: number) => {
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const angle = ((ARC.start + (ARC.end - ARC.start) * t) * Math.PI) / 180;
  return {
    x: Number((ROOT.x + RADII.x * Math.cos(angle)).toFixed(3)),
    y: Number((ROOT.y + RADII.y * Math.sin(angle)).toFixed(3)),
  };
};

const pct = (value: number) => `${Number(value.toFixed(3))}%`;
const topPct = (y: number) => pct((y / VIEW_H) * 100);

/**
 * A fan of parallel attempts spreading from one root. Opening the fan sends
 * each attempt from the root to its place on the arc on `glide` in a
 * `cascade()` stagger while its spoke draws behind it with `pathLength`, so
 * the fan opens as one gesture. Each attempt's ring fills on `glide` — a
 * quantity settling — and prints its score once done. Naming a winner
 * gathers that node to the centre on `glide`, its ring landing on `recoil`,
 * its spoke following; the others fade on the exit ease with their spokes.
 * Positions are polar maths rounded to three decimals and laid out as
 * percentages, and the spokes are an SVG underlay with a non-scaling stroke,
 * so the fan fits any width without a measurement.
 *
 * The attempts are buttons in a labelled group with a roving tabindex —
 * Left and Right step, Home and End jump, Enter and Space pick — and the
 * live region speaks on spread, on each settle and on the gather, never per
 * tick. Under reduced motion attempts appear in place, spokes appear whole,
 * rings fill on a tween and the winner cross-fades to the centre.
 */
export function ParallelFan({
  ref,
  attempts,
  spread,
  winner,
  onSelect,
  task,
  label,
  className,
}: ParallelFanProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(0);

  const count = attempts.length;
  const gap = cascade(count);
  const gathered = winner !== undefined;
  const settled = attempts.filter((a) => (a.status ?? "running") !== "running");
  const winning = attempts.find((a) => a.id === winner);

  const moveTo = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    setFocused(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(count - 1);
        break;
      default:
        break;
    }
  };

  const scoreOf = (attempt: FanAttempt) =>
    attempt.score === undefined ? undefined : Math.round(attempt.score * 100);

  const announcement = gathered
    ? `Gathered ${winning?.label ?? winner}${
        winning && scoreOf(winning) !== undefined
          ? `, score ${scoreOf(winning)} percent`
          : ""
      }`
    : spread
      ? settled.length === 0
        ? `Fanned out, ${count} attempts`
        : `${settled.length} of ${count} attempts done`
      : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {settled.length} / {count}
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        className="relative aspect-[8/5] w-full overflow-hidden rounded-3 border border-hairline bg-surface-1"
      >
        <svg
          aria-hidden
          viewBox={`0 0 100 ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full text-hairline-strong"
        >
          {attempts.map((attempt, index) => {
            const point = arcPoint(index, count);
            const isWinner = attempt.id === winner;
            const end = isWinner ? GATHER : point;
            const faded = gathered && !isWinner;
            return (
              <motion.line
                key={attempt.id}
                x1={ROOT.x}
                y1={ROOT.y}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pathLength={1}
                initial={false}
                animate={{
                  x2: spread ? end.x : ROOT.x,
                  y2: spread ? end.y : ROOT.y,
                  pathLength: spread && !faded ? 1 : 0,
                  opacity: spread && !faded ? 1 : 0,
                }}
                transition={
                  !motionSafe
                    ? { duration: durations.fast }
                    : faded
                      ? exitFor()
                      : {
                          ...springs.glide,
                          delay: spread ? Number((index * gap).toFixed(3)) : 0,
                          opacity: fade,
                        }
                }
              />
            );
          })}
        </svg>

        <span
          aria-hidden
          className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-hairline-strong bg-surface-2"
          style={{ left: pct(ROOT.x), top: topPct(ROOT.y) }}
        >
          <span className="size-2 rounded-full bg-ink-3" />
        </span>

        {attempts.map((attempt, index) => {
          const point = arcPoint(index, count);
          const status = attempt.status ?? "running";
          const isWinner = attempt.id === winner;
          const faded = gathered && !isWinner;
          const target = !spread ? ROOT : isWinner ? GATHER : point;
          const progress = Number(
            Math.min(1, Math.max(0, attempt.progress)).toFixed(3),
          );
          const score = scoreOf(attempt);
          const words = [
            attempt.label,
            attempt.model,
            status,
            score !== undefined ? `score ${score} percent` : undefined,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <motion.button
              key={attempt.id}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              aria-label={words}
              aria-pressed={isWinner}
              tabIndex={focused === index ? 0 : -1}
              inert={!spread || faded}
              onFocus={() => setFocused(index)}
              onClick={() => onSelect?.(attempt.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none",
                "rounded-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
              initial={false}
              animate={{
                left: pct(target.x),
                top: topPct(target.y),
                opacity: spread && !faded ? 1 : 0,
                scale:
                  !spread && motionSafe
                    ? 0.6
                    : isWinner && motionSafe
                      ? 1.12
                      : 1,
              }}
              transition={
                !motionSafe
                  ? {
                      duration: durations.fast,
                      left: { duration: 0 },
                      top: { duration: 0 },
                    }
                  : faded
                    ? exitFor()
                    : {
                        ...springs.glide,
                        delay:
                          spread && !gathered
                            ? Number((index * gap).toFixed(3))
                            : 0,
                        opacity: fade,
                        scale: isWinner ? springs.recoil : springs.glide,
                      }
              }
            >
              <span
                aria-hidden
                className={cn(
                  "relative grid size-11 place-items-center rounded-full bg-surface-0 transition-colors duration-300",
                  isWinner
                    ? "text-success"
                    : status === "failed"
                      ? "text-danger"
                      : status === "done"
                        ? "text-ink"
                        : "text-cobalt-bright",
                )}
              >
                <svg
                  viewBox="0 0 44 44"
                  className="absolute inset-0 size-full -rotate-90"
                >
                  <circle
                    cx="22"
                    cy="22"
                    r="19"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.2"
                    strokeWidth="3"
                  />
                  <motion.circle
                    cx="22"
                    cy="22"
                    r="19"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    initial={false}
                    animate={{
                      strokeDashoffset: Number((1 - progress).toFixed(3)),
                    }}
                    // Progress is information, so it still fills under reduced motion.
                    transition={
                      motionSafe
                        ? springs.glide
                        : { duration: durations.base, ease: easings.enter }
                    }
                  />
                </svg>
                {status === "failed" ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="relative size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                  </svg>
                ) : score !== undefined ? (
                  <span className="relative font-mono text-[11px] font-medium text-foreground tabular-nums">
                    {score}
                  </span>
                ) : (
                  <motion.span
                    className="relative size-1.5 rounded-full bg-current"
                    initial={false}
                    animate={{ opacity: motionSafe ? [1, 0.3] : 0.7 }}
                    transition={
                      motionSafe
                        ? {
                            duration: 0.8,
                            ease: "easeInOut",
                            repeat: Infinity,
                            repeatType: "reverse",
                          }
                        : { duration: 0 }
                    }
                  />
                )}
              </span>
              <span
                aria-hidden
                title={attempt.label}
                className={cn(
                  "max-w-full truncate text-[10px] leading-none font-medium",
                  isWinner ? "text-foreground" : "text-ink-3",
                )}
              >
                {attempt.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex h-5 items-center gap-2 text-xs">
        <span className="shrink-0 text-ink-3">Task</span>
        <span className="min-w-0 truncate text-foreground" title={task}>
          {task}
        </span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
