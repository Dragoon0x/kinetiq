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

export type AppealStep = {
  value: string;
  /** The stage, as a short line. */
  label: string;
  /** One quieter line under it. */
  note?: string;
};

export type AppealDecision = "pending" | "restored" | "upheld";

export type AppealCardProps = {
  ref?: React.Ref<HTMLElement>;
  /** Whose message is under appeal. */
  author: string;
  /** The removed line, quoted on the card. */
  messageText: string;
  /** The room the message was removed from. @default "Coldbrook" */
  room?: string;
  /** The house rule the removal cited. @default "Room rule 3" */
  reason?: string;
  /** The review's stages, in order. */
  steps?: AppealStep[];
  /** Controlled count of stamped steps, 0 to `steps.length`. */
  step?: number;
  /** Initial stamped count for uncontrolled use. @default 0 */
  defaultStep?: number;
  /** Fires when sending the appeal stamps the first step. */
  onStepChange?: (step: number) => void;
  /** Controlled appeal note. */
  note?: string;
  /** Initial note for uncontrolled use. @default "" */
  defaultNote?: string;
  onNoteChange?: (note: string) => void;
  /** Fires from Send appeal with the trimmed note. */
  onSubmit?: (note: string) => void;
  /** Cap on the note. @default 180 */
  maxLength?: number;
  /** The outcome. Only the host sets it. @default "pending" */
  decision?: AppealDecision;
  /** One line under the decision. */
  decisionNote?: string;
  /** Fires once when a decision first lands, after the state settles. */
  onDecisionShown?: (decision: Exclude<AppealDecision, "pending">) => void;
  /** Holds the textarea and the control. @default false */
  disabled?: boolean;
  className?: string;
};

const DEFAULT_STEPS: AppealStep[] = [
  {
    value: "sent",
    label: "Appeal sent",
    note: "Your note goes to the room's moderators",
  },
  {
    value: "read",
    label: "Read by a moderator",
    note: "Someone who did not remove it reads it",
  },
  {
    value: "second",
    label: "Second moderator agrees",
    note: "Two moderators settle an appeal",
  },
];

/** No sentence may carry two full stops because the words already ended in one. */
const sentence = (text: string) => `${text.trim().replace(/[.!?]+$/, "")}.`;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * One stage of the review. The stamp is a landing, so it arrives from 1.5 on
 * `recoil` — ζ0.53's two visible bounces — while the tick draws its pathLength
 * on `flick`. `AnimatePresence initial={false}` is what keeps a card that
 * mounts mid-review from stamping every step it inherited at once.
 */
function StepMark({
  done,
  motionSafe,
}: {
  done: boolean;
  motionSafe: boolean;
}) {
  return (
    <span className="relative grid size-5 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2">
      <span
        aria-hidden
        className="col-start-1 row-start-1 size-1.5 rounded-full bg-ink-3/50"
      />
      <AnimatePresence initial={false}>
        {done ? (
          <motion.span
            key="done"
            aria-hidden
            initial={motionSafe ? { scale: 1.5, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? springs.recoil : FADE}
            style={{ originX: 0.5, originY: 0.5 }}
            className="absolute inset-0 grid place-items-center rounded-full border border-success/60 bg-success/15 text-success"
          >
            <motion.svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
            >
              <motion.path
                d="M3.5 8.4 6.6 11.5 12.5 5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </motion.svg>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/**
 * Ask for another look. The card quotes the removed line — struck, dimmed, and
 * chipped `Removed` so the state is never colour alone — and carries the review
 * under it as a list whose stages stamp in turn: the disc lands on `recoil`,
 * the tick draws on `flick`, and the rail down to the next stage fills on
 * `glide`.
 *
 * Writing into a real textarea and sending stamps the first stage. When the
 * host answers, the decision slides in from 8px on `snap` inside a
 * ResizeObserver-measured height that opens **in flow**, never floating over
 * whatever the host wrote under the card. Approval restores with a wash: a
 * cobalt bar sweeps the quote once on a `slow` tween while the strike lifts and
 * the chip turns to `Restored`. A refusal gets none of it — no wash, no scale,
 * no bounce — because a decision that goes against you must not celebrate.
 *
 * A polite region speaks one frozen sentence per change, and never
 * optimistically: the outcome is only spoken once `decision` has actually said
 * so. Under reduced motion the stamps still stamp and the restore still
 * restores, on tweens, with nothing travelling.
 */
export function AppealCard({
  ref,
  author,
  messageText,
  room = "Coldbrook",
  reason = "Room rule 3",
  steps = DEFAULT_STEPS,
  step,
  defaultStep = 0,
  onStepChange,
  note,
  defaultNote = "",
  onNoteChange,
  onSubmit,
  maxLength = 180,
  decision = "pending",
  decisionNote,
  onDecisionShown,
  disabled = false,
  className,
}: AppealCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headId = `${baseId}-head`;
  const noteId = `${baseId}-note`;
  const hintId = `${baseId}-hint`;

  const [uncontrolledStep, setUncontrolledStep] = React.useState(defaultStep);
  const stepControlled = step !== undefined;
  const reached = Math.max(
    0,
    Math.min(steps.length, stepControlled ? step : uncontrolledStep),
  );

  const [uncontrolledNote, setUncontrolledNote] = React.useState(defaultNote);
  const noteControlled = note !== undefined;
  const draft = noteControlled ? note : uncontrolledNote;

  const [submitted, setSubmitted] = React.useState<string | null>(null);
  const restored = decision === "restored";
  const decided = decision !== "pending";

  const send = () => {
    const trimmed = draft.trim();
    if (!trimmed || reached > 0 || disabled) return;
    setSubmitted(trimmed);
    if (!stepControlled) setUncontrolledStep(1);
    onStepChange?.(1);
    onSubmit?.(trimmed);
  };

  const setDraft = (next: string) => {
    if (!noteControlled) setUncontrolledNote(next);
    onNoteChange?.(next);
  };

  // Read through a ref so the host hears about a decision once, from the
  // decision alone, rather than every time an unrelated prop changes.
  const shownRef = React.useRef(onDecisionShown);
  React.useEffect(() => {
    shownRef.current = onDecisionShown;
  });
  React.useEffect(() => {
    if (decision === "pending") return;
    shownRef.current?.(decision);
  }, [decision]);

  // The spoken sentence is frozen at the moment of the change, so a fast run of
  // steps cannot leave the reading a stage behind.
  const spokenKey = `${reached}:${decision}`;
  const [spoken, setSpoken] = React.useState(() => ({
    key: spokenKey,
    text: "",
  }));
  if (spoken.key !== spokenKey) {
    const stage = steps[reached - 1];
    setSpoken({
      key: spokenKey,
      text: restored
        ? `Appeal approved. The message is back in ${room}.`
        : decision === "upheld"
          ? "Appeal declined. The message stays removed."
          : reached === 0
            ? ""
            : reached === 1
              ? "Appeal sent."
              : stage
                ? sentence(stage.label)
                : "",
    });
  }

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const remaining = Math.max(0, maxLength - draft.length);
  const canSend = !disabled && reached === 0 && draft.trim().length > 0;

  return (
    <section
      ref={ref}
      aria-labelledby={headId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headId} className="min-w-0 truncate text-sm font-semibold">
          Appeal in {room}
        </h3>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase transition-colors",
            restored
              ? "border-success/50 text-success"
              : "border-hairline-strong text-ink-3",
          )}
        >
          {restored ? "Restored" : "Removed"}
        </span>
      </div>

      <blockquote className="relative overflow-hidden rounded-2 border border-hairline bg-surface-2 p-2.5">
        <p className="mb-1 text-[11px] leading-snug text-ink-3">
          {`${author} · removed under ${reason}`}
        </p>
        <motion.p
          className={cn(
            "text-sm leading-snug",
            restored ? "text-ink" : "text-ink-2 line-through",
          )}
          animate={{ opacity: restored ? 1 : 0.75 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {messageText}
        </motion.p>

        {/* The wash: one sweep across the quote when the appeal is approved.
            Under reduced motion it flashes the ground instead of travelling,
            because the restore itself is information. */}
        <AnimatePresence>
          {restored ? (
            <motion.span
              key="wash"
              aria-hidden
              initial={motionSafe ? { x: "-110%" } : { opacity: 0.55 }}
              animate={motionSafe ? { x: "110%" } : { opacity: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                duration: durations.slow,
                ease: motionSafe ? easings.move : easings.exit,
              }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 skew-x-12 bg-cobalt-wash"
            />
          ) : null}
        </AnimatePresence>
      </blockquote>

      <ol role="list" className="flex flex-col">
        {steps.map((stage, index) => {
          const done = index < reached;
          return (
            <li key={stage.value} className="flex gap-2.5">
              <span className="flex flex-col items-center">
                <StepMark done={done} motionSafe={motionSafe} />
                {index < steps.length - 1 ? (
                  <span className="relative my-1 w-px flex-1 overflow-hidden bg-hairline-strong">
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 origin-top bg-success"
                      initial={false}
                      animate={
                        motionSafe
                          ? { scaleY: index + 1 < reached ? 1 : 0 }
                          : { opacity: index + 1 < reached ? 1 : 0 }
                      }
                      transition={motionSafe ? springs.glide : FADE}
                    />
                  </span>
                ) : null}
              </span>

              <span
                className={cn(
                  "flex min-w-0 flex-1 flex-col",
                  index < steps.length - 1 && "pb-3",
                )}
              >
                {/* One string, so the accessible name cannot gain a stray
                    space before the comma. */}
                <span className="sr-only">
                  {`Step ${index + 1} of ${steps.length}, ${stage.label.toLowerCase()}, ${done ? "done" : "waiting"}.`}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "text-xs leading-snug font-medium transition-colors",
                    done ? "text-ink" : "text-ink-3",
                  )}
                >
                  {stage.label}
                </span>
                {stage.note ? (
                  <span
                    aria-hidden
                    className="text-[11px] leading-snug text-ink-3"
                  >
                    {stage.note}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Measured, in flow, and widened by a hair so a focus ring inside it is
          not clipped by the overflow the height animation needs. */}
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="-mx-1 overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col gap-2 px-1">
          {reached === 0 ? (
            <>
              <label
                htmlFor={noteId}
                className="text-[11px] font-medium text-ink-2"
              >
                Why should this be looked at again?
              </label>
              <textarea
                id={noteId}
                rows={2}
                value={draft}
                disabled={disabled}
                maxLength={maxLength}
                aria-describedby={hintId}
                onChange={(event) => setDraft(event.target.value)}
                className={cn(
                  "w-full resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-2 text-sm leading-snug outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                )}
              />
              <span id={hintId} className="sr-only">
                {`Up to ${maxLength} characters.`}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span
                  aria-hidden
                  className="font-mono text-[10px] text-ink-3 tabular-nums"
                >
                  {remaining} left
                </span>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={send}
                  className={cn(
                    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                  )}
                >
                  Send appeal
                </button>
              </div>
            </>
          ) : submitted ? (
            <p className="text-[11px] leading-snug text-ink-3">
              <span className="font-medium text-ink-2">Your note. </span>
              {submitted}
            </p>
          ) : null}

          <AnimatePresence initial={false}>
            {decided ? (
              <motion.div
                key={decision}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={motionSafe ? springs.snap : FADE}
                className={cn(
                  "flex items-start gap-2 rounded-2 border p-2.5",
                  restored
                    ? "border-success/50 bg-success/10"
                    : "border-hairline-strong bg-surface-2",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    "mt-px size-4 shrink-0",
                    restored ? "text-success" : "text-ink-3",
                  )}
                >
                  {restored ? (
                    <path d="M3.5 8.4 6.6 11.5 12.5 5" />
                  ) : (
                    <path d="M8 3.5v5.5M8 12h.01" />
                  )}
                </svg>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs leading-snug font-medium">
                    {restored ? `Restored to ${room}` : "The removal stands"}
                  </span>
                  {decisionNote ? (
                    <span className="text-[11px] leading-snug text-ink-3">
                      {decisionNote}
                    </span>
                  ) : null}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </section>
  );
}
