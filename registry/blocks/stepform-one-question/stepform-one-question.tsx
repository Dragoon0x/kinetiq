"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RadioGroup, RadioGroupItem } from "@/registry/ui/radio-group";
import { StageProgress } from "@/registry/ui/stage-progress";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OneQuestionChoice = {
  value: string;
  label: string;
  description?: string;
};

export type OneQuestion = {
  id: string;
  /** Short name for the progress rail. */
  label: string;
  /** The question itself, set large. */
  prompt: string;
  help?: string;
  /** A free-text answer, or one of a small set. */
  kind: "text" | "choice";
  placeholder?: string;
  options?: OneQuestionChoice[];
  optional?: boolean;
};

export type StepformOneQuestionProps = {
  eyebrow?: string;
  headline?: string;
  questions?: OneQuestion[];
  /** Heading over the final summary. */
  summaryTitle?: string;
  submitLabel?: string;
  doneTitle?: string;
  doneCopy?: string;
  onSubmit?: (answers: Record<string, string>) => void;
  /** Fires on every keystroke and choice, so a page can mirror answers live. */
  onAnswerChange?: (id: string, value: string) => void;
  className?: string;
};

const DEFAULT_QUESTIONS: OneQuestion[] = [
  {
    id: "yard",
    label: "Yard",
    prompt: "What should we call your yard?",
    help: "Whatever the crew already calls it. You can rename it later.",
    kind: "text",
    placeholder: "North basin",
  },
  {
    id: "crews",
    label: "Crews",
    prompt: "How many crews run a normal morning?",
    kind: "choice",
    options: [
      { value: "one", label: "One", description: "A single board is plenty." },
      {
        value: "two",
        label: "Two or three",
        description: "Handoffs matter most.",
      },
      {
        value: "many",
        label: "More than three",
        description: "You need the floor view.",
      },
    ],
  },
  {
    id: "pain",
    label: "The argument",
    prompt: "What does the morning usually argue about?",
    help: "One line is enough — it decides which board you start on.",
    kind: "text",
    placeholder: "Who has the crane at ten",
    optional: true,
  },
];

/**
 * The long ask, asked one question at a time: each prompt gets the whole
 * frame, Enter carries you forward, and the rail keeps the length honest so
 * nobody feels ambushed. The shell's contribution is the pacing — a single
 * question in flight, the answer held, the way back always open, and a
 * summary of everything before it is sent. Selection never advances on its
 * own: a form that moves by itself is a form you cannot review.
 */
export function StepformOneQuestion({
  eyebrow = "Waylight · getting set up",
  headline = "Three questions, one at a time.",
  questions = DEFAULT_QUESTIONS,
  summaryTitle = "Before we send it",
  submitLabel = "Send it",
  doneTitle = "That is everything.",
  doneCopy = "Your first board is being cut now. It lands in your inbox before the next shift.",
  onSubmit,
  onAnswerChange,
  className,
}: StepformOneQuestionProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const promptRef = React.useRef<HTMLParagraphElement>(null);
  const movedRef = React.useRef(false);

  const total = questions.length;
  const reviewing = index === total;
  const current = reviewing ? undefined : questions[index];

  // Focus follows the frame, but never on first paint — landing on the page
  // must not yank the viewport to the form.
  React.useEffect(() => {
    if (!movedRef.current) return;
    // The field is owned by trace-input, so reach it through the stage
    // rather than threading a ref into a primitive that does not take one.
    const field = stageRef.current?.querySelector<HTMLInputElement>(
      "[data-question-field] input",
    );
    if (field) field.focus();
    else promptRef.current?.focus();
  }, [index]);

  const stages = React.useMemo(
    () => [
      ...questions.map((question) => ({
        id: question.id,
        label: question.label,
      })),
      { id: "__review", label: "Review" },
    ],
    [questions],
  );

  const move = (next: number, dir: number) => {
    movedRef.current = true;
    setDirection(dir);
    setError(null);
    setIndex(next);
  };

  const advance = (event: React.FormEvent) => {
    event.preventDefault();
    if (reviewing) {
      setSent(true);
      onSubmit?.(answers);
      return;
    }
    if (!current) return;
    const value = answers[current.id]?.trim() ?? "";
    if (!value && !current.optional) {
      setError(
        current.kind === "choice"
          ? "Pick one to carry on."
          : "This one we need.",
      );
      return;
    }
    move(index + 1, 1);
  };

  const answer = (id: string, value: string) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [id]: value }));
    onAnswerChange?.(id, value);
  };

  const enter = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>

        <div className="mt-10 rounded-4 border border-hairline bg-surface-1 p-6 shadow-raised sm:p-8">
          <StageProgress
            stages={stages}
            current={Math.min(index, stages.length - 1)}
            progress={sent ? 1 : undefined}
            aria-label="Setup progress"
          />

          <form onSubmit={advance} className="mt-8">
            {/* One question holds the frame; the reserve keeps the card from
                jumping as answers swap in and out. The finished frame drops it
                — that settle is the form being over. */}
            <div ref={stageRef} className={cn(!sent && "min-h-52")}>
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={
                    sent
                      ? "__sent"
                      : reviewing
                        ? "__review"
                        : (current?.id ?? "")
                  }
                  initial={{
                    opacity: 0,
                    x: motionSafe ? direction * distances.shift : 0,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: motionSafe ? -direction * distances.shift : 0,
                    transition: exitFor(
                      motionSafe ? durations.base : durations.fast,
                    ),
                  }}
                  transition={enter}
                >
                  {sent ? (
                    <div>
                      <StatusSeal variant="success">sent</StatusSeal>
                      <p className="mt-4 text-2xl font-semibold tracking-tight text-balance text-ink">
                        {doneTitle}
                      </p>
                      <p className="mt-2 leading-relaxed text-ink-2">
                        {doneCopy}
                      </p>
                    </div>
                  ) : reviewing ? (
                    <div>
                      <p
                        ref={promptRef}
                        tabIndex={-1}
                        className="text-2xl font-semibold tracking-tight text-balance text-ink outline-none"
                      >
                        {summaryTitle}
                      </p>
                      <dl className="mt-5 flex flex-col gap-3">
                        {questions.map((question) => (
                          <div
                            key={question.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-3"
                          >
                            <dt className="text-sm text-ink-3">
                              {question.label}
                            </dt>
                            <dd className="min-w-0 font-mono text-sm break-words text-ink">
                              {labelFor(question, answers[question.id]) || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : current ? (
                    <div>
                      <p
                        ref={promptRef}
                        tabIndex={-1}
                        className="text-2xl font-semibold tracking-tight text-balance text-ink outline-none sm:text-3xl"
                      >
                        {current.prompt}
                      </p>
                      {current.help && (
                        <p className="mt-2 text-sm leading-relaxed text-ink-3">
                          {current.help}
                        </p>
                      )}
                      <div className="mt-6">
                        {current.kind === "text" ? (
                          <div data-question-field>
                            <TraceInput
                              label={current.prompt}
                              labelHidden
                              placeholder={current.placeholder}
                              value={answers[current.id] ?? ""}
                              onChange={(event) =>
                                answer(current.id, event.target.value)
                              }
                              error={error ?? undefined}
                            />
                          </div>
                        ) : (
                          <>
                            <RadioGroup
                              aria-label={current.prompt}
                              value={answers[current.id] ?? ""}
                              onValueChange={(value) =>
                                answer(current.id, value)
                              }
                            >
                              {(current.options ?? []).map((option) => (
                                <RadioGroupItem
                                  key={option.value}
                                  value={option.value}
                                  description={option.description}
                                >
                                  {option.label}
                                </RadioGroupItem>
                              ))}
                            </RadioGroup>
                            {error && (
                              <p className="mt-2 flex items-center gap-2 text-xs text-destructive">
                                <span
                                  aria-hidden
                                  className="h-px w-3 shrink-0 bg-destructive"
                                />
                                {error}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            {!sent && (
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-hairline pt-5">
                <button
                  type="button"
                  onClick={() => move(index - 1, -1)}
                  disabled={index === 0}
                  className="text-sm text-ink-3 underline underline-offset-4 transition-colors enabled:hover:text-ink disabled:opacity-40"
                >
                  Back
                </button>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
                    {Math.min(index + 1, stages.length)} / {stages.length}
                  </span>
                  <PressureButton type="submit">
                    {reviewing ? submitLabel : "Next"}
                  </PressureButton>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

/** Choices read back by their label; text answers read back as typed. */
function labelFor(question: OneQuestion, value: string | undefined) {
  if (!value) return "";
  if (question.kind !== "choice") return value;
  return question.options?.find((o) => o.value === value)?.label ?? value;
}
