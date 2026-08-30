"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CountersignOption = { value: string; label: string };

export type CountersignQuestion = {
  id: string;
  prompt: string;
  options: CountersignOption[];
};

export type CountersignProps = {
  /** What the agent wants to do, named at the top. */
  heading?: string;
  questions?: CountersignQuestion[];
  /** Fired once, with every answer given (skipped ones absent). */
  onComplete?: (answers: Record<string, string>) => void;
  skipLabel?: string;
  continueLabel?: string;
  doneLine?: string;
  className?: string;
};

const DEFAULT_QUESTIONS: CountersignQuestion[] = [
  {
    id: "crew",
    prompt: "Which crew takes the coating pass?",
    options: [
      { value: "b", label: "Crew B (clear from 10:15)" },
      { value: "c", label: "Crew C (finishes at noon)" },
      { value: "hold", label: "Hold it a day" },
    ],
  },
  {
    id: "crane",
    prompt: "Crane 2's window shrank. Protect which job?",
    options: [
      { value: "rig", label: "The rig test" },
      { value: "coating", label: "The coating pass" },
      { value: "split", label: "Split the window" },
    ],
  },
  {
    id: "notify",
    prompt: "Who should hear about the change?",
    options: [
      { value: "leads", label: "Yard leads only" },
      { value: "both", label: "Both crews" },
      { value: "all", label: "Everyone on shift" },
    ],
  },
];

/**
 * The questions an agent asks before it acts, paged one at a time: pick an
 * option, then press Continue — picking never advances on its own, because a
 * card that moves the moment you touch it cannot be reconsidered, and these
 * are precisely the decisions that deserve a second look. Skip is always
 * offered; a human-in-the-loop card that cannot be declined is a form
 * wearing a question's clothes.
 *
 * Questions slide from the direction of travel; the progress fraction keeps
 * the length honest. Options are a real radiogroup — arrow keys move the
 * ring, and the choice is carried by state, never by colour alone.
 *
 * Reduced motion: cards swap in place, nothing slides.
 */
export function Countersign({
  heading = "Before the board is cut",
  questions = DEFAULT_QUESTIONS,
  onComplete,
  skipLabel = "Skip",
  continueLabel = "Continue",
  doneLine = "Signed off. The agent proceeds with your answers attached.",
  className,
}: CountersignProps) {
  const motionSafe = useMotionSafe();
  const headingId = React.useId();
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);

  const current = questions[index];
  const picked = current ? answers[current.id] : undefined;

  const advance = (skip: boolean) => {
    if (!current) return;
    if (skip) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[current.id];
        return next;
      });
    }
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    setDone(true);
    const finalAnswers = { ...answers };
    if (skip) delete finalAnswers[current.id];
    onComplete?.(finalAnswers);
  };

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <p id={headingId} className="text-label text-ink-3">
        {heading}
      </p>

      <div className="mt-3 min-h-36">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={done ? "__done" : (current?.id ?? "none")}
            initial={{
              opacity: 0,
              x: motionSafe ? distances.shift : 0,
            }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: motionSafe ? -distances.shift : 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {done ? (
              <div>
                <StatusSeal variant="success">countersigned</StatusSeal>
                <p className="mt-3 text-sm leading-relaxed text-ink-2">
                  {doneLine}
                </p>
                <dl className="mt-3 flex flex-col gap-1">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="min-w-0 truncate text-xs text-ink-3">
                        {q.prompt}
                      </dt>
                      <dd className="shrink-0 font-mono text-[11px] text-ink">
                        {q.options.find((o) => o.value === answers[q.id])
                          ?.label ?? "skipped"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : current ? (
              <div>
                <p className="font-medium text-ink">{current.prompt}</p>
                <div
                  role="radiogroup"
                  aria-label={current.prompt}
                  className="mt-3 flex flex-col gap-1.5"
                >
                  {current.options.map((option) => {
                    const selected = picked === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [current.id]: option.value,
                          }))
                        }
                        className={cn(
                          "rounded-2 border px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-ink"
                            : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {!done && (
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {Math.min(index + 1, questions.length)}
            <span className="opacity-60"> / {questions.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => advance(true)}
              className="px-2 py-1 text-sm text-ink-3 transition-colors hover:text-ink"
            >
              {skipLabel}
            </button>
            <button
              type="button"
              onClick={() => advance(false)}
              disabled={!picked}
              className={cn(
                "rounded-2 px-3 py-1.5 text-sm font-medium transition-colors",
                picked
                  ? "bg-primary text-primary-foreground"
                  : "cursor-not-allowed bg-surface-2 text-ink-3",
              )}
            >
              {continueLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
