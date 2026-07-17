"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Step = {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
};

export type StepperFlowProps = {
  ref?: React.Ref<HTMLOListElement>;
  steps: Step[];
  /** Active step index, 0-based. Steps before it read as complete. */
  current: number;
  /** Fires when a completed or current step is clicked. */
  onStepChange?: (index: number) => void;
  className?: string;
};

function CheckMark({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      initial={motionSafe ? { scale: 0.4 } : false}
      animate={{ scale: 1 }}
      transition={motionSafe ? springs.recoil : { duration: 0 }}
    >
      <motion.path
        d="M4 8.5 6.8 11 12 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{
          duration: motionSafe ? durations.base : 0,
          ease: easings.enter,
        }}
      />
    </motion.svg>
  );
}

/**
 * A wizard stepper. As the active step advances, the connector into each cleared
 * step fills on `glide` and its node stamps a check on `recoil`; the current
 * node holds a ring and any earlier node can be clicked to step back. Under
 * reduced motion the fills and checks land with no draw.
 */
export function StepperFlow({
  ref,
  steps,
  current,
  onStepChange,
  className,
}: StepperFlowProps) {
  const motionSafe = useMotionSafe();
  const count = steps.length;

  return (
    <div className={cn("relative", className)}>
      {/* Connector segments run behind the nodes at their centre line. */}
      <div className="absolute top-4 right-0 left-0 -translate-y-1/2" aria-hidden>
        {steps.slice(1).map((step, idx) => {
          const i = idx + 1;
          const leftPct = ((i - 1 + 0.5) / count) * 100;
          const widthPct = (1 / count) * 100;
          const filled = current >= i;
          return (
            <div
              key={step.id}
              className="bg-hairline-strong absolute h-0.5"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            >
              <motion.div
                className="bg-cobalt h-full origin-left"
                initial={false}
                animate={{ scaleX: filled ? 1 : 0 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </div>
          );
        })}
      </div>

      <ol ref={ref} className="relative flex">
        {steps.map((step, i) => {
          const state =
            i < current ? "done" : i === current ? "current" : "todo";
          const reachable = i <= current;
          return (
            <li
              key={step.id}
              className="flex flex-1 flex-col items-center gap-2 text-center"
            >
              <button
                type="button"
                onClick={() => reachable && onStepChange?.(i)}
                disabled={!reachable}
                aria-current={state === "current" ? "step" : undefined}
                aria-label={
                  typeof step.label === "string"
                    ? `Step ${i + 1}: ${step.label}`
                    : `Step ${i + 1}`
                }
                className={cn(
                  "focus-visible:ring-cobalt-bright/50 grid size-8 place-items-center rounded-full border-2 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 focus-visible:outline-none",
                  state === "done" &&
                    "border-cobalt bg-cobalt text-white",
                  state === "current" &&
                    "border-cobalt text-cobalt bg-surface-0",
                  state === "todo" &&
                    "border-hairline-strong text-ink-3 bg-surface-0",
                  reachable && "cursor-pointer",
                )}
              >
                {state === "done" ? (
                  <CheckMark motionSafe={motionSafe} />
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>
              <div className="flex flex-col gap-0.5">
                <span
                  className={cn(
                    "text-xs font-medium",
                    state === "todo" ? "text-ink-3" : "text-ink",
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="text-ink-3 hidden text-[11px] sm:block">
                    {step.description}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
