"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ToolChainStatus = "pending" | "running" | "done" | "failed";

export type ToolChainStep = {
  id: string;
  /** The tool's name, printed in mono. */
  name: string;
  /** What the call acts on, printed after the name. */
  detail?: string;
  status: ToolChainStatus;
  /** Why the step failed; shown under the name and read by the live region. */
  error?: string;
};

export type ToolChainProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The calls in chain order. Each link draws when the step above it is done. */
  steps: ToolChainStep[];
  /** Offers a Retry control on a failed step and fires from it. */
  onRetry?: (id: string) => void;
  /** Names the chain for assistive technology. */
  label: string;
  className?: string;
};

const NODE_TONE: Record<ToolChainStatus, string> = {
  pending: "border-hairline-strong",
  running: "border-cobalt-bright",
  done: "border-success",
  failed: "border-danger",
};

type ChainStepProps = {
  step: ToolChainStep;
  index: number;
  last: boolean;
  paused: boolean;
  motionSafe: boolean;
  onRetry?: (id: string) => void;
};

function ChainStep({
  step,
  index,
  last,
  paused,
  motionSafe,
  onRetry,
}: ChainStepProps) {
  const { status } = step;
  const done = status === "done";
  const failed = status === "failed";
  const running = status === "running";

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe, so the error block's height is known before it
    // is asked to open, and again if the error text wraps differently.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const draw = motionSafe ? springs.flick : { duration: 0 };
  const word = failed
    ? "Failed"
    : running
      ? "Running"
      : paused
        ? "Paused"
        : done
          ? "Done"
          : "Pending";
  const visibleWord = failed || running || paused;

  return (
    <li className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3">
      <span aria-hidden className="relative flex justify-center">
        <span
          className={cn(
            "relative z-10 mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border bg-surface-1 transition-colors duration-300",
            NODE_TONE[status],
          )}
        >
          {/* The fill grows from the centre on flick and the mark draws over
              it; both are instant under reduced motion, never absent. */}
          <motion.span
            className={cn(
              "absolute inset-0 rounded-full",
              failed ? "bg-danger" : "bg-success",
            )}
            initial={false}
            animate={{ scale: done || failed ? 1 : 0 }}
            transition={draw}
          />
          <motion.span
            className="absolute size-1.5 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{
              opacity: running ? (motionSafe ? [1, 0.3] : 0.7) : 0,
              scale: running && motionSafe ? [1, 1.5] : 1,
            }}
            transition={
              running && motionSafe
                ? {
                    duration: 0.8,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "reverse",
                  }
                : { duration: durations.fast }
            }
          />
          <svg
            viewBox="0 0 16 16"
            className="relative size-2.5 text-background"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={false}
              animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
              transition={draw}
            />
            <motion.path
              d="m4.5 4.5 7 7M11.5 4.5l-7 7"
              pathLength={1}
              initial={false}
              animate={{ pathLength: failed ? 1 : 0, opacity: failed ? 1 : 0 }}
              transition={draw}
            />
          </svg>
        </span>

        {!last ? (
          <span className="absolute inset-x-0 top-5 bottom-0 flex justify-center">
            <span className="relative h-full w-px bg-hairline-strong">
              {/* The link is earned: it grows from its top on glide only once
                  this step is done, so a paused chain shows where it stopped. */}
              <motion.span
                className="absolute inset-0 origin-top bg-cobalt-bright"
                initial={false}
                animate={{
                  scaleY: done || !motionSafe ? 1 : 0,
                  opacity: done ? 1 : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: { duration: durations.blink },
                      }
                    : { duration: durations.fast, ease: easings.enter }
                }
              />
            </span>
          </span>
        ) : null}
      </span>

      {/* The gap to the next step is padding here, not on the item, so the
          node column stretches the full row and the link reaches the next node. */}
      <div className={cn("flex min-w-0 flex-col", !last && "pb-4")}>
        <div
          className={cn(
            "flex h-5 items-center gap-2 transition-colors duration-300",
            paused ? "text-ink-3" : "text-foreground",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs">
            <span className="shrink-0 font-medium">
              <span className="sr-only">Link {index + 1}, </span>
              {step.name}
            </span>
            {step.detail ? (
              <span className="min-w-0 truncate text-ink-3" title={step.detail}>
                {step.detail}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium",
              !visibleWord && "sr-only",
              failed
                ? "text-danger"
                : running
                  ? "text-cobalt-bright"
                  : "text-ink-3",
            )}
          >
            {word}
          </span>
        </div>

        <motion.div
          initial={false}
          animate={{ height: failed ? measured : 0 }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.move }
          }
          className="overflow-hidden"
          aria-hidden={!failed}
          inert={!failed}
        >
          <div
            ref={innerRef}
            className="flex flex-wrap items-center gap-2 pt-1.5"
          >
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-danger">
              {step.error ?? "The call failed."}
            </p>
            {onRetry ? (
              <motion.button
                type="button"
                aria-label={`Retry ${step.name}`}
                onClick={() => onRetry(step.id)}
                initial={false}
                animate={{
                  opacity: failed ? 1 : 0,
                  y: failed || !motionSafe ? 0 : distances.nudge,
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                className={cn(
                  "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Retry
              </motion.button>
            ) : null}
          </div>
        </motion.div>
      </div>
    </li>
  );
}

/**
 * A vertical chain of tool calls where each link is earned. Every step is a
 * node beside its name; the connector beneath it grows from its top on
 * `glide` only once that step is done, no overshoot, because a link is a
 * surface extending rather than a switch. The running node's dot breathes at
 * the ambient tempo; a completed node fills on `flick` and its tick draws on
 * `flick`; a failed node fills danger with a cross, its error line opens to a
 * measured height on `glide`, and the chain pauses — the connector stays
 * undrawn and the steps beneath dim and read Paused. When the host offers
 * `onRetry`, a Retry control arrives on `snap` inside the error line.
 *
 * The chain is an ordered list whose items carry their status in words; the
 * live region says which link is running, where the chain paused and why,
 * and when it completes — once per change, never per tick. Under reduced
 * motion links appear whole, the dot holds at mid opacity, marks are drawn
 * whole, and the error line's height changes on a tween.
 */
export function ToolChain({
  ref,
  steps,
  onRetry,
  label,
  className,
}: ToolChainProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const total = steps.length;
  const failedAt = steps.findIndex((step) => step.status === "failed");
  const runningAt = steps.findIndex((step) => step.status === "running");
  const complete = total > 0 && steps.every((step) => step.status === "done");
  const failedStep = failedAt >= 0 ? steps[failedAt] : undefined;
  const runningStep = runningAt >= 0 ? steps[runningAt] : undefined;

  const announcement = failedStep
    ? `Chain paused at link ${failedAt + 1} of ${total}: ${failedStep.name} failed${
        failedStep.error ? `, ${failedStep.error}` : ""
      }`
    : complete
      ? `Chain complete, ${total} ${total === 1 ? "link" : "links"}`
      : runningStep
        ? `Link ${runningAt + 1} of ${total} running, ${runningStep.name}`
        : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {steps.filter((step) => step.status === "done").length} / {total}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-ink-3">No calls in the chain.</p>
      ) : (
        <ol aria-labelledby={labelId} className="flex flex-col">
          {steps.map((step, index) => (
            <ChainStep
              key={step.id}
              step={step}
              index={index}
              last={index === total - 1}
              paused={failedAt >= 0 && index > failedAt}
              motionSafe={motionSafe}
              onRetry={onRetry}
            />
          ))}
        </ol>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
