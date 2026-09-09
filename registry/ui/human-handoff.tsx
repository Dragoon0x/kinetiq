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

export type HandoffStage = "model" | "waiting" | "human";

export type HandoffPerson = {
  name: string;
  /** The team they answer for, printed under the name. */
  team?: string;
};

export type HumanHandoffProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who holds the thread; the host advances it. */
  stage: HandoffStage;
  /** The model's invented name, printed while it answers and as the seat's initials. */
  model: string;
  /** Who takes over; the seat's initials come from the name. */
  person: HandoffPerson;
  /** Why the thread is being handed off, shown from the waiting stage on. */
  reason: string;
  /** Fires from the interval with each counted second; the last value is the frozen wait. */
  onWaitChange?: (seconds: number) => void;
  /** Fires from the cancel control while waiting. */
  onCancel?: () => void;
  /** Copy on the cancel control. @default "Cancel handoff" */
  cancelLabel?: string;
  /** Names the card for assistive technology. */
  label: string;
  className?: string;
};

/** Keeps the callback out of the timer's dependencies so a re-render never restarts a second. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last =
    parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
};

const formatWait = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

/**
 * A card that says who holds the thread. One seat shows the holder: while
 * the model answers, its avatar; when the host moves the stage to waiting,
 * that avatar leaves to the left by `distances.shift` on the exit ease
 * (exits never spring) and an empty dashed seat breathes in its place while
 * a readout counts the wait. When the person arrives their avatar slides in
 * from the right on `snap` — one crisp overshoot, a switch of holder — and a
 * ring lands around the seat on `recoil`; the count freezes.
 *
 * The count is a chain of one-second timeouts that runs only while the stage
 * is waiting and stops while the tab is hidden, so a wait never finishes
 * unseen. Nothing reads a clock during render. Under reduced motion the
 * avatars cross-fade in place and the count still counts, because the wait
 * is information.
 */
export function HumanHandoff({
  ref,
  stage,
  model,
  person,
  reason,
  onWaitChange,
  onCancel,
  cancelLabel = "Cancel handoff",
  label,
  className,
}: HumanHandoffProps) {
  const motionSafe = useMotionSafe();
  const waitRef = useLatest(onWaitChange);

  const [seconds, setSeconds] = React.useState(0);
  // The count belongs to one wait: a return to the model starts the next
  // one from zero. Adjusting during render keeps the reset in the same
  // commit as the stage change instead of a frame behind it.
  const [seenStage, setSeenStage] = React.useState(stage);
  if (seenStage !== stage) {
    setSeenStage(stage);
    if (stage === "model") setSeconds(0);
  }

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (stage !== "waiting" || !visible) return;
    const timer = window.setTimeout(() => {
      const next = seconds + 1;
      setSeconds(next);
      waitRef.current?.(next);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [stage, visible, seconds, waitRef]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const slide = motionSafe ? distances.shift : 0;

  const lines: Record<HandoffStage, { name: string; sub: string }> = {
    model: { name: model, sub: "Answering" },
    waiting: {
      name: "A person is taking over",
      sub: person.team ? `Queue · ${person.team}` : "Finding a person",
    },
    human: { name: person.name, sub: person.team ?? "Support" },
  };

  const announcement =
    stage === "waiting"
      ? "Finding a person"
      : stage === "human"
        ? `${person.name}${person.team ? ` from ${person.team}` : ""} has joined, waited ${seconds} seconds`
        : `${model} is answering`;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative size-10 shrink-0" aria-hidden>
          <AnimatePresence initial={false}>
            {stage === "model" ? (
              <motion.span
                key="model"
                className="absolute inset-0 grid place-items-center rounded-2 border border-hairline-strong bg-cobalt-wash font-mono text-xs font-semibold text-cobalt-bright"
                initial={{ opacity: 0, x: -slide }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -slide, transition: exitFor() }}
                transition={
                  motionSafe ? { ...springs.snap, opacity: fade } : fade
                }
              >
                {initials(model)}
              </motion.span>
            ) : null}
            {stage === "waiting" ? (
              <motion.span
                key="waiting"
                className="absolute inset-0 rounded-full border-2 border-dashed border-hairline-strong"
                initial={{ opacity: 0 }}
                animate={
                  motionSafe
                    ? {
                        opacity: [0.35, 1],
                        transition: {
                          duration: 1.1,
                          ease: easings.move,
                          repeat: Infinity,
                          repeatType: "mirror",
                        },
                      }
                    : { opacity: 1, transition: fade }
                }
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              />
            ) : null}
            {stage === "human" ? (
              <motion.span
                key="human"
                className="absolute inset-0"
                initial={{ opacity: 0, x: slide }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slide, transition: exitFor() }}
                transition={
                  motionSafe ? { ...springs.snap, opacity: fade } : fade
                }
              >
                <span className="absolute inset-0 grid place-items-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">
                  {initials(person.name)}
                </span>
                {/* The ring lands after the avatar arrives: ζ0.53 gives the
                    two bounces of something settling into place. */}
                <motion.span
                  className="absolute -inset-0.5 rounded-full border-2 border-success"
                  initial={
                    motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          delay: 0.12,
                          opacity: { ...fade, delay: 0.12 },
                        }
                      : fade
                  }
                />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>

        {/* Every stage's lines share one cell so the swap never changes the
            row's height; only the active pair is visible or readable. */}
        <span className="grid min-w-0 flex-1">
          {(Object.keys(lines) as HandoffStage[]).map((key) => {
            const active = key === stage;
            return (
              <motion.span
                key={key}
                aria-hidden={!active}
                className="col-start-1 row-start-1 flex min-w-0 flex-col"
                initial={false}
                animate={{ opacity: active ? 1 : 0 }}
                transition={fade}
              >
                <span
                  title={lines[key].name}
                  className="truncate text-sm font-semibold"
                >
                  {lines[key].name}
                </span>
                <span
                  title={lines[key].sub}
                  className="truncate text-xs text-ink-2"
                >
                  {lines[key].sub}
                </span>
              </motion.span>
            );
          })}
        </span>

        {stage !== "model" ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums transition-colors duration-300",
              stage === "waiting" ? "text-warn" : "text-ink-3",
            )}
          >
            {stage === "human" ? "waited " : ""}
            {formatWait(seconds)}
          </span>
        ) : null}
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col">
          <AnimatePresence initial={false}>
            {stage !== "model" ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
                className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3"
              >
                <p className="min-w-0 text-xs leading-relaxed text-ink-2">
                  {reason}
                </p>
                {stage === "waiting" ? (
                  <button
                    type="button"
                    onClick={() => onCancel?.()}
                    className={cn(
                      "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    {cancelLabel}
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
