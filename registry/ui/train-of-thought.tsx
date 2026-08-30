"use client";

import * as React from "react";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThoughtStep = {
  id: string;
  /** The step itself, one clause. */
  text: string;
  /** Plain step, a search with a count, or a mono code/tool line. */
  kind?: "step" | "search" | "code";
  /** Small trailing detail — a hit count, a filename. */
  detail?: string;
  /** Marked while this step is the one in flight. */
  active?: boolean;
};

export type TrainOfThoughtProps = {
  /** The summary line on the chip, e.g. "Thought for 4 seconds". */
  summary?: string;
  steps?: ThoughtStep[];
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const DEFAULT_STEPS: ThoughtStep[] = [
  { id: "t1", text: "Reading the overnight event rows" },
  {
    id: "t2",
    text: "Searching crane holds",
    kind: "search",
    detail: "2 holds",
  },
  { id: "t3", text: 'plan.cut({ yard: "north", rev: 3 })', kind: "code" },
  { id: "t4", text: "Writing the morning summary", active: true },
];

/**
 * The agent's working shown as a trace: a quiet summary chip — "Thought for
 * 4 seconds" — that opens into the steps it actually took, cascading in as
 * plain clauses, searches with their hit counts, and mono tool lines. The
 * chip is the honest default: reasoning is available, never performed at the
 * reader, and the active step carries a breathing marker so a live trace
 * reads as live.
 *
 * Reduced motion: the drawer opens instantly, steps print in place, and the
 * active marker holds at mid-opacity.
 */
export function TrainOfThought({
  summary = "Thought for 4 seconds",
  steps = DEFAULT_STEPS,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
}: TrainOfThoughtProps) {
  const motionSafe = useMotionSafe();
  const panelId = React.useId();
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const step = cascade(steps.length);

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={cn("w-full max-w-md", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="group inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        <span>{summary}</span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          className="text-ink-3 transition-colors group-hover:text-ink"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: motionSafe ? 0 : 1 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: 0 }
            }
            className="overflow-hidden"
          >
            <ol className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l border-hairline pt-1 pb-0.5 pl-4">
              {steps.map((item, index) => (
                <motion.li
                  key={item.id}
                  initial={{
                    opacity: motionSafe ? 0 : 1,
                    x: motionSafe ? -distances.nudge : 0,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: index * step,
                        }
                      : { duration: 0 }
                  }
                  className="flex min-w-0 items-baseline gap-2"
                >
                  {item.active && (
                    <motion.span
                      aria-hidden
                      className="size-1.5 shrink-0 self-center rounded-full bg-primary"
                      animate={
                        motionSafe
                          ? { opacity: [0.35, 1, 0.35] }
                          : { opacity: 0.7 }
                      }
                      transition={
                        motionSafe
                          ? {
                              duration: 1.4,
                              ease: "easeInOut",
                              repeat: Infinity,
                            }
                          : { duration: 0 }
                      }
                    />
                  )}
                  <span
                    className={cn(
                      "min-w-0 text-sm leading-relaxed",
                      item.kind === "code"
                        ? "truncate font-mono text-[12px] text-ink-2"
                        : item.active
                          ? "text-ink"
                          : "text-ink-2",
                    )}
                  >
                    {item.text}
                  </span>
                  {item.detail && (
                    <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px font-mono text-[10px] tracking-[0.04em] text-ink-3">
                      {item.detail}
                    </span>
                  )}
                  <span className="sr-only">
                    {item.kind === "search" ? "search step" : undefined}
                  </span>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
