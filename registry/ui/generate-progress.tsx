"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GenerateStage = {
  /** Stable identity. */
  id: string;
  /** Slides in beside the node when the stage begins. */
  label: string;
  /** What the stage is doing, shown under the name once it has begun. */
  note?: string;
};

export type GenerateProgressProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered stages of the generation. */
  stages: GenerateStage[];
  /** Index of the stage in flight. Below 0 is waiting; `stages.length` means every stage has landed. */
  stage: number;
  /** 0..1 inside the current stage. @default 0 */
  progress?: number;
  /** Names the progressbar for assistive technology. */
  label: string;
  /** The header word once every stage has landed. @default "Done" */
  doneLabel?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A digit column that rolls to its value on `snap`. Ten faces tall, so a
 * `y` percentage of its own height moves exactly one face. Hidden from
 * assistive technology: the progressbar already speaks the stage.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when
        // the number gains a digit.
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type StageState = "ahead" | "current" | "done";

/**
 * Stages, not a spinner. A vertical rail with one node per stage; the host
 * drives `stage` and `progress` and the component keeps no clock. A stage's
 * name is the event: it slides in beside its node from `distances.step` on
 * `snap` — one crisp overshoot, an indicator arriving — as the model reaches
 * it, and its note fades in underneath. Stages ahead show only their node, so
 * the reader can count what is left without being told what it is.
 *
 * The fill between nodes grows top-down on `glide` to the stage's fraction, a
 * landed node fills cobalt and draws its tick on `flick`, and the header's
 * counter rolls its digit on `snap` beside a word that says Waiting, Working,
 * or Done. The header is the progressbar, the rail is a list with
 * `aria-current` on the stage in flight, and the live region speaks once per
 * stage change, never per step. Under reduced motion names fade in place,
 * fills tween, ticks appear whole — every fill still shows, because progress
 * is information.
 */
export function GenerateProgress({
  ref,
  stages,
  stage,
  progress = 0,
  label,
  doneLabel = "Done",
  className,
}: GenerateProgressProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const count = stages.length;
  const waiting = stage < 0;
  const done = count > 0 && stage >= count;
  const landed = Math.min(count, Math.max(0, stage));
  // Rounded before it reaches a transform or a readout: a float that came
  // from the host's clock arithmetic must paint the same on both sides.
  const within = done
    ? 1
    : Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 1000;
  const percent = Math.round(within * 100);
  const current = waiting || done ? undefined : stages[stage];
  const counter = waiting ? 0 : done ? count : Math.min(count, stage + 1);

  const word = done ? doneLabel : waiting ? "Waiting" : "Working";
  const valueText = done
    ? `${doneLabel}, ${count} stages`
    : waiting
      ? "Waiting"
      : `${current?.label ?? ""}, stage ${stage + 1} of ${count}, ${percent} percent`;
  // Derived from the stage alone, so the region speaks once as each stage
  // begins and once at the end — never as the fraction moves.
  const announcement = done
    ? doneLabel
    : current
      ? `${current.label}, stage ${stage + 1} of ${count}`
      : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const fillSpring = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={landed}
        aria-valuetext={valueText}
        className="flex h-6 items-center justify-between gap-3"
      >
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span
          aria-hidden
          className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-ink-3"
        >
          <span className="flex items-center tabular-nums">
            <span className="text-ink">
              <RollingNumber value={String(counter)} motionSafe={motionSafe} />
            </span>
            <span>&nbsp;/ {count}</span>
          </span>
          <span className="grid text-right">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={word}
                className={cn(
                  "col-start-1 row-start-1 tracking-[0.08em] uppercase",
                  done ? "text-success" : waiting ? "text-ink-3" : "text-ink-2",
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {word}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </div>

      <ol className="flex flex-col">
        {stages.map((item, index) => {
          const state: StageState =
            index < stage ? "done" : index === stage ? "current" : "ahead";
          const last = index === count - 1;
          const fill = state === "done" ? 1 : state === "current" ? within : 0;
          const begun = state !== "ahead";
          return (
            <li
              key={item.id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex gap-3"
            >
              <span
                aria-hidden
                className="flex w-4 shrink-0 flex-col items-center"
              >
                <span
                  className={cn(
                    "relative grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                    state === "done"
                      ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
                      : state === "current"
                        ? "border-cobalt-bright bg-surface-1"
                        : "border-hairline-strong bg-surface-1",
                  )}
                >
                  {state === "current" ? (
                    <motion.span
                      key="pulse"
                      className="size-1.5 rounded-full bg-cobalt-bright"
                      initial={{ opacity: 1 }}
                      // A breath at the ambient tempo while the stage works;
                      // under reduced motion the dot simply holds.
                      animate={
                        motionSafe ? { opacity: [1, 0.35] } : { opacity: 1 }
                      }
                      transition={
                        motionSafe
                          ? {
                              duration: 0.9,
                              ease: "easeInOut",
                              repeat: Infinity,
                              repeatType: "reverse",
                            }
                          : { duration: 0 }
                      }
                    />
                  ) : null}
                  {state === "done" ? (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-2.5"
                    >
                      <motion.path
                        d="M3.5 8.5 6.5 11.5 12.5 4.5"
                        initial={
                          motionSafe ? { pathLength: 0 } : { opacity: 0 }
                        }
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={
                          motionSafe
                            ? springs.flick
                            : { duration: durations.fast }
                        }
                      />
                    </svg>
                  ) : null}
                </span>
                {!last ? (
                  <span className="relative w-px flex-1 bg-hairline-strong">
                    <motion.span
                      className="absolute inset-0 origin-top bg-cobalt-bright"
                      initial={false}
                      animate={{ scaleY: fill }}
                      transition={fillSpring}
                    />
                  </span>
                ) : null}
              </span>

              <span
                className={cn("flex min-w-0 flex-1 flex-col", !last && "pb-4")}
              >
                <span className="flex h-4 items-center text-sm leading-none">
                  <AnimatePresence initial={false}>
                    {begun ? (
                      <motion.span
                        key="name"
                        className={cn(
                          "truncate font-medium transition-colors duration-200",
                          state === "done" ? "text-ink-2" : "text-foreground",
                        )}
                        initial={
                          motionSafe
                            ? { opacity: 0, x: -distances.step }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? { ...springs.snap, opacity: fade }
                            : { duration: durations.fast }
                        }
                      >
                        {item.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {/* The name is already in the tree once it has begun; the
                      hidden word only adds the verdict, or names a stage the
                      sighted reader can only count. */}
                  <span className="sr-only">
                    {state === "done"
                      ? ", done"
                      : state === "ahead"
                        ? `${item.label}, not started`
                        : ""}
                  </span>
                </span>
                {item.note ? (
                  <span
                    aria-hidden
                    className="flex h-4 items-center text-xs leading-none text-ink-3"
                  >
                    <AnimatePresence initial={false}>
                      {begun ? (
                        <motion.span
                          key="note"
                          className="truncate"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          // The note follows the name in, a beat behind it.
                          transition={{ ...fade, delay: durations.fast }}
                        >
                          {item.note}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
