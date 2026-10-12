"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  CircleCheck,
  Inbox,
  Minus,
  Plus,
  RotateCcw,
  SendHorizontal,
  TriangleAlert,
} from "lucide-react";

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

/** One answer: an option id, a yes or no, a short text, a number, or a date as "YYYY-MM-DD". Null is cleared. */
export type ThreadAnswer = string | number | boolean | null;

/** Answers by question id. A question with no key, or null, is unanswered. */
export type ThreadValue = Record<string, ThreadAnswer>;

/**
 * When a follow-up threads out of its parent's answer. `is` matches one or
 * more exact answers, `atLeast` a number, and `answered` any answer at all.
 * A follow-up with no `when` shows once its parent has any answer.
 */
export type ThreadWhen =
  | { is: ThreadAnswer | ThreadAnswer[] }
  | { atLeast: number }
  | { answered: true };

export type ThreadOption = { id: string; label: string };

type ThreadQuestionBase = {
  id: string;
  /** The question, as asked. */
  label: string;
  /** A line of help under it. */
  hint?: string;
  /** Marked when Submit is pressed without it. @default false */
  required?: boolean;
  /** For a follow-up: the parent answer that reveals it. @default any answer */
  when?: ThreadWhen;
  /**
   * How the summary writes this answer, with `{answer}` standing in for it;
   * a yes/no question may give one sentence per side. Falls back to
   * "Label: answer."
   */
  phrase?: string | { yes: string; no: string };
  /** Questions that thread out beneath this one once it is answered. */
  followUps?: ThreadQuestion[];
};

export type ThreadChoiceQuestion = ThreadQuestionBase & {
  kind: "choice";
  options: ThreadOption[];
};
export type ThreadYesNoQuestion = ThreadQuestionBase & { kind: "yesno" };
export type ThreadTextQuestion = ThreadQuestionBase & {
  kind: "text";
  placeholder?: string;
  /** @default 120 */
  maxLength?: number;
};
export type ThreadNumberQuestion = ThreadQuestionBase & {
  kind: "number";
  min?: number;
  max?: number;
  /** @default 1 */
  step?: number;
  /** Printed after the number, e.g. "L". */
  unit?: string;
};
export type ThreadDateQuestion = ThreadQuestionBase & {
  kind: "date";
  /** "YYYY-MM-DD" */
  min?: string;
  /** "YYYY-MM-DD" */
  max?: string;
};

export type ThreadQuestion =
  | ThreadChoiceQuestion
  | ThreadYesNoQuestion
  | ThreadTextQuestion
  | ThreadNumberQuestion
  | ThreadDateQuestion;

export type ThreadChange = {
  id: string;
  from: ThreadAnswer;
  to: ThreadAnswer;
  /** Follow-ups this answer revealed. */
  opened: number;
  /** Follow-ups this answer folded away. */
  folded: number;
};

export type ThreadLineStyle = "line" | "dots" | "none";
export type ThreadDensity = "compact" | "cozy" | "roomy";
export type ThreadAccent = "cobalt" | "signal" | "ink";
export type ThreadStatus = "ready" | "loading" | "error";

export type ThreadFieldsProps = {
  /** How follow-ups hang off their question: a solid thread line, a dotted one, or an indent alone. @default "line" */
  threadStyle?: ThreadLineStyle;
  /** Card padding, type size and control heights. @default "cozy" */
  density?: ThreadDensity;
  /** The colour of chosen answers and the thread: cobalt, signal or ink. @default "cobalt" */
  accent?: ThreadAccent;
  /** The question tree. Each question's `followUps` thread out of its answer. @default defaultThreadQuestions */
  questions?: ThreadQuestion[];
  /** Controlled answers by question id. */
  value?: ThreadValue;
  /** Initial answers when uncontrolled. @default defaultThreadValue */
  defaultValue?: ThreadValue;
  /** Fires from the press or key that changed an answer, with all answers and what opened or folded. */
  onChange?: (value: ThreadValue, change: ThreadChange) => void;
  /** Submit was pressed with every required question answered. Gets the answers and the summary as prose. */
  onSubmit?: (value: ThreadValue, summary: string) => void;
  /** Keep the answers of folded follow-ups, so they return if the thread reopens; off, they are cleared with the fold. @default true */
  keepFolded?: boolean;
  /** Write the answers as prose at the foot (or beside the thread when wide). @default true */
  showSummary?: boolean;
  /** Whether the questions have arrived. @default "ready" */
  status?: ThreadStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Incident report" */
  title?: string;
  /** The submit button's text. @default "Submit report" */
  submitLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the thread scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be answered or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Fieldline's incident report: six questions, each threading out follow-ups. */
export const defaultThreadQuestions: ThreadQuestion[] = [
  {
    id: "site",
    kind: "choice",
    label: "Which site?",
    required: true,
    phrase: "The incident was at {answer}.",
    options: [
      { id: "coldbrook", label: "Coldbrook" },
      { id: "basinworks", label: "Basinworks" },
      { id: "fernmoor", label: "Fernmoor" },
      { id: "harrow", label: "Harrow Yard" },
    ],
    followUps: [
      {
        id: "area",
        kind: "choice",
        label: "Which part of the site?",
        phrase: "It happened in the {answer}.",
        options: [
          { id: "pump", label: "pump house" },
          { id: "switch", label: "switch room" },
          { id: "yard", label: "yard" },
          { id: "intake", label: "intake" },
        ],
        followUps: [
          {
            id: "pumpId",
            kind: "text",
            when: { is: "pump" },
            label: "Which pump?",
            placeholder: "P-04",
            maxLength: 12,
            phrase: "Pump {answer} was involved.",
          },
        ],
      },
    ],
  },
  {
    id: "kind",
    kind: "choice",
    label: "What kind of incident?",
    required: true,
    phrase: "It was logged as a {answer}.",
    options: [
      { id: "injury", label: "injury" },
      { id: "nearmiss", label: "near miss" },
      { id: "spill", label: "spill" },
      { id: "fault", label: "equipment fault" },
    ],
    followUps: [
      {
        id: "injured",
        kind: "number",
        when: { is: "injury" },
        label: "How many people were hurt?",
        required: true,
        min: 1,
        max: 20,
        phrase: "Injured: {answer}.",
        followUps: [
          {
            id: "firstAid",
            kind: "yesno",
            label: "Was first aid given on site?",
            phrase: {
              yes: "First aid was given on site.",
              no: "No first aid was given on site.",
            },
          },
        ],
      },
      {
        id: "spillVolume",
        kind: "number",
        when: { is: "spill" },
        label: "Roughly how much spilled?",
        hint: "In litres; a bucket is about 10.",
        min: 0,
        max: 5000,
        step: 10,
        unit: "L",
        phrase: "About {answer} spilled.",
        followUps: [
          {
            id: "contained",
            kind: "yesno",
            label: "Was it contained on site?",
            required: true,
            phrase: {
              yes: "It was contained on site.",
              no: "It reached the drain.",
            },
          },
        ],
      },
      {
        id: "faultAsset",
        kind: "text",
        when: { is: "fault" },
        label: "Which asset failed?",
        placeholder: "Riser 2 valve actuator",
        phrase: "The failed asset was {answer}.",
      },
    ],
  },
  {
    id: "when",
    kind: "date",
    label: "When did it happen?",
    required: true,
    min: "2026-01-01",
    max: "2026-12-31",
    phrase: "It happened on {answer}.",
    followUps: [
      {
        id: "shift",
        kind: "choice",
        label: "During which shift?",
        phrase: "It was the {answer} shift.",
        options: [
          { id: "day", label: "day" },
          { id: "back", label: "back" },
          { id: "night", label: "night" },
        ],
      },
    ],
  },
  {
    id: "stopped",
    kind: "yesno",
    label: "Did work stop?",
    required: true,
    phrase: { yes: "Work stopped.", no: "Work carried on." },
    followUps: [
      {
        id: "downtime",
        kind: "number",
        when: { is: true },
        label: "For how long?",
        min: 0,
        max: 96,
        step: 0.5,
        unit: "h",
        phrase: "It was stopped for {answer}.",
      },
      {
        id: "whyNot",
        kind: "text",
        when: { is: false },
        label: "Why did it carry on?",
        placeholder: "The leak was isolated",
        phrase: "Work carried on because {answer}.",
      },
    ],
  },
  {
    id: "told",
    kind: "yesno",
    label: "Has the client been told?",
    phrase: {
      yes: "The client has been told.",
      no: "The client has not been told yet.",
    },
    followUps: [
      {
        id: "toldBy",
        kind: "text",
        when: { is: true },
        label: "Who told them?",
        placeholder: "Mara Lind",
        phrase: "{answer} told them.",
      },
      {
        id: "tellBy",
        kind: "date",
        when: { is: false },
        label: "When will they be told?",
        min: "2026-01-01",
        max: "2026-12-31",
        phrase: "They will be told by {answer}.",
      },
    ],
  },
  {
    id: "notes",
    kind: "text",
    label: "Anything the review should know?",
    placeholder: "Optional",
    maxLength: 160,
    phrase: "Note: {answer}",
  },
];

/** A spill at Coldbrook's pump house, half written up. */
export const defaultThreadValue: ThreadValue = {
  site: "coldbrook",
  area: "pump",
  kind: "spill",
  spillVolume: 40,
  when: "2026-10-09",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<ThreadAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

type DensitySpec = {
  card: string;
  gap: string;
  label: string;
  control: string;
  input: string;
  /** Space between a card and its replies. */
  top: string;
  indent: number;
};

const DENSITIES: Record<ThreadDensity, DensitySpec> = {
  compact: {
    card: "px-2.5 py-2 gap-1.5",
    gap: "gap-1.5",
    label: "text-[12px]",
    control: "h-6 text-[11px]",
    input: "h-7 text-[12px]",
    top: "pt-1.5",
    indent: 18,
  },
  cozy: {
    card: "px-3 py-2.5 gap-2",
    gap: "gap-2",
    label: "text-[13px]",
    control: "h-7 text-xs",
    input: "h-8 text-[13px]",
    top: "pt-2",
    indent: 22,
  },
  roomy: {
    card: "px-4 py-3.5 gap-2.5",
    gap: "gap-3",
    label: "text-sm",
    control: "h-8 text-[13px]",
    input: "h-9 text-sm",
    top: "pt-3",
    indent: 26,
  },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The control focus lands on in a card: the radio holding the tab stop or the
 * field, which carry `data-focus`; any button is the fallback.
 */
const primaryControl = (card: HTMLElement) =>
  card.querySelector<HTMLElement>("[data-focus]") ??
  card.querySelector<HTMLElement>("input, button");

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

/** Whether an answer counts: text must have letters, numbers must be finite. */
export const isAnswered = (
  question: ThreadQuestion,
  answer: ThreadAnswer | undefined,
): boolean => {
  if (answer === null || answer === undefined) return false;
  switch (question.kind) {
    case "choice":
      return (
        typeof answer === "string" &&
        question.options.some((o) => o.id === answer)
      );
    case "yesno":
      return typeof answer === "boolean";
    case "text":
      return typeof answer === "string" && answer.trim().length > 0;
    case "number":
      return typeof answer === "number" && Number.isFinite(answer);
    case "date":
      return typeof answer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answer);
  }
};

const matches = (when: ThreadWhen | undefined, answer: ThreadAnswer) => {
  if (!when) return true;
  if ("answered" in when) return true;
  if ("atLeast" in when) {
    return typeof answer === "number" && answer >= when.atLeast;
  }
  const list = Array.isArray(when.is) ? when.is : [when.is];
  return list.includes(answer);
};

/** The follow-ups a question's answer reveals right now. */
const openFollowUps = (
  question: ThreadQuestion,
  value: ThreadValue,
): ThreadQuestion[] => {
  const answer = value[question.id];
  if (!isAnswered(question, answer)) return [];
  return (question.followUps ?? []).filter((q) =>
    matches(q.when, answer ?? null),
  );
};

type Row = { question: ThreadQuestion; depth: number; parent: string | null };

/** Every question on screen, in thread order, with its depth. */
export const visibleThread = (
  questions: ThreadQuestion[],
  value: ThreadValue,
): Row[] => {
  const out: Row[] = [];
  const walk = (
    list: ThreadQuestion[],
    depth: number,
    parent: string | null,
  ) => {
    for (const q of list) {
      out.push({ question: q, depth, parent });
      walk(openFollowUps(q, value), depth + 1, q.id);
    }
  };
  walk(questions, 0, null);
  return out;
};

const allQuestions = (list: ThreadQuestion[]): ThreadQuestion[] =>
  list.flatMap((q) => [q, ...allQuestions(q.followUps ?? [])]);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
};

const formatNumber = (n: number, unit?: string) => {
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${text} ${unit}` : text;
};

/** An answer as words: option label, yes or no, "40 L", "9 October 2026". */
export const formatAnswer = (
  question: ThreadQuestion,
  answer: ThreadAnswer | undefined,
): string => {
  if (!isAnswered(question, answer)) return "";
  switch (question.kind) {
    case "choice":
      return question.options.find((o) => o.id === answer)?.label ?? "";
    case "yesno":
      return answer ? "yes" : "no";
    case "text":
      return typeof answer === "string" ? answer.trim() : "";
    case "number":
      return typeof answer === "number"
        ? formatNumber(answer, question.unit)
        : "";
    case "date":
      return typeof answer === "string" ? formatDate(answer) : "";
  }
};

const sentenceFor = (question: ThreadQuestion, answer: ThreadAnswer) => {
  const words = formatAnswer(question, answer);
  if (!words) return "";
  const phrase = question.phrase;
  if (phrase && typeof phrase === "object") {
    return answer ? phrase.yes : phrase.no;
  }
  if (phrase) return phrase.replace("{answer}", words);
  return `${question.label.replace(/\?$/, "")}: ${words}.`;
};

/** The answers as prose, in thread order, for hosts that file the report. */
export const summarizeThread = (
  questions: ThreadQuestion[],
  value: ThreadValue,
): string =>
  visibleThread(questions, value)
    .map(({ question }) => sentenceFor(question, value[question.id] ?? null))
    .filter(Boolean)
    .join(" ");

const KIND_WORD: Record<ThreadQuestion["kind"], string> = {
  choice: "one of",
  yesno: "yes or no",
  text: "short answer",
  number: "number",
  date: "date",
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Fold                                   */
/* ----------------------------------------------------------------------- */

/**
 * A block that unfolds to its height on `springs.glide` and folds away on the
 * exit ease. The 4px of negative margin give focus rings room inside the clip.
 */
function Fold({
  motionSafe,
  delay = 0,
  className,
  children,
}: {
  motionSafe: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: exitFor(motionSafe ? durations.base : durations.fast),
      }}
      transition={
        motionSafe
          ? {
              height: { ...springs.glide, delay },
              opacity: { duration: durations.base, ease: easings.enter, delay },
            }
          : {
              height: { duration: 0 },
              opacity: { duration: durations.fast },
            }
      }
      className={cn("-m-1 overflow-hidden p-1", className)}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

type ControlProps = {
  inert: boolean;
  invalid: boolean;
  motionSafe: boolean;
  spec: DensitySpec;
  describedBy: string | undefined;
  labelId: string;
};

/** Moves a roving tab stop within a radiogroup; returns the index to land on. */
const radioNav = (event: React.KeyboardEvent, i: number, n: number) => {
  if (event.key === "ArrowRight") return (i + 1) % n;
  if (event.key === "ArrowLeft") return (i - 1 + n) % n;
  if (event.key === "Home") return 0;
  if (event.key === "End") return n - 1;
  return null;
};

function ChoiceControl({
  question,
  answer,
  onAnswer,
  inert,
  invalid,
  motionSafe,
  spec,
  describedBy,
  labelId,
}: ControlProps & {
  question: ThreadChoiceQuestion;
  answer: ThreadAnswer | undefined;
  onAnswer: (answer: ThreadAnswer) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const checkedIndex = question.options.findIndex((o) => o.id === answer);
  const stop = checkedIndex >= 0 ? checkedIndex : 0;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-disabled={inert || undefined}
      className="-m-[3px] flex flex-wrap gap-1.5 p-[3px]"
    >
      {question.options.map((option, i) => {
        const checked = option.id === answer;
        return (
          <motion.button
            key={option.id}
            ref={(node) => {
              if (node) nodes.current.set(option.id, node);
              else nodes.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === stop ? 0 : -1}
            data-focus={i === stop ? "" : undefined}
            whileTap={inert || !motionSafe ? undefined : { scale: 0.96 }}
            transition={springs.flick}
            onClick={() => {
              if (inert) return;
              onAnswer(checked ? null : option.id);
            }}
            onKeyDown={(event) => {
              if (event.altKey) return;
              const to = radioNav(event, i, question.options.length);
              if (to === null) return;
              event.preventDefault();
              const target = question.options[to];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!inert) onAnswer(target.id);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border pr-2.5 pl-1.5 font-medium whitespace-nowrap transition-colors duration-200",
              spec.control,
              checked
                ? "border-[color-mix(in_oklab,var(--tf-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--tf-accent)_13%,transparent)] text-(--tf-accent)"
                : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-2",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              {checked ? (
                <svg aria-hidden viewBox="0 0 14 14" className="size-3">
                  <motion.path
                    d="M3 7.4 5.8 10 11 4.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              ) : (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-hairline-strong"
                />
              )}
            </span>
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
}

function YesNoControl({
  answer,
  onAnswer,
  inert,
  invalid,
  motionSafe,
  spec,
  describedBy,
  labelId,
}: ControlProps & {
  answer: ThreadAnswer | undefined;
  onAnswer: (answer: ThreadAnswer) => void;
}) {
  const nodes = React.useRef<(HTMLButtonElement | null)[]>([null, null]);
  const sides = [
    { id: "no", label: "No", value: false },
    { id: "yes", label: "Yes", value: true },
  ];
  const checked = typeof answer === "boolean" ? (answer ? 1 : 0) : -1;
  const stop = checked >= 0 ? checked : 0;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-disabled={inert || undefined}
      className={cn(
        "relative grid w-max grid-cols-2 rounded-full border border-hairline-strong p-0.5",
        inert && "cursor-not-allowed",
      )}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-[color-mix(in_oklab,var(--tf-accent)_14%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--tf-accent)_40%,transparent)] ring-inset"
        initial={false}
        animate={{
          x: checked === 1 ? "100%" : "0%",
          opacity: checked >= 0 ? 1 : 0,
          scale: checked >= 0 ? 1 : 0.85,
        }}
        transition={
          motionSafe
            ? { ...springs.snap, opacity: { duration: durations.fast } }
            : { duration: 0, opacity: { duration: durations.fast } }
        }
      />
      {sides.map((side, i) => (
        <button
          key={side.id}
          ref={(node) => {
            nodes.current[i] = node;
          }}
          type="button"
          role="radio"
          aria-checked={checked === i}
          tabIndex={i === stop ? 0 : -1}
          data-focus={i === stop ? "" : undefined}
          onClick={() => {
            if (inert) return;
            onAnswer(checked === i ? null : side.value);
          }}
          onKeyDown={(event) => {
            if (event.altKey) return;
            const to = radioNav(event, i, 2);
            if (to === null) return;
            event.preventDefault();
            nodes.current[to]?.focus();
            if (!inert) onAnswer(sides[to]?.value ?? null);
          }}
          className={cn(
            "relative z-10 inline-flex min-w-12 items-center justify-center rounded-full px-3 font-medium transition-colors duration-200",
            spec.control,
            checked === i ? "text-(--tf-accent)" : "text-ink-2",
            inert ? "cursor-not-allowed" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          {side.label}
        </button>
      ))}
    </div>
  );
}

const inputClass = (spec: DensitySpec, invalid: boolean) =>
  cn(
    "w-full min-w-0 rounded-2 border bg-surface-0 px-2.5 text-foreground placeholder:text-ink-3 transition-colors",
    spec.input,
    invalid
      ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
      : "border-hairline hover:border-hairline-strong focus-visible:border-hairline-strong",
    FOCUS_RING,
  );

function TextControl({
  question,
  answer,
  onAnswer,
  inert,
  invalid,
  spec,
  describedBy,
  labelId,
}: ControlProps & {
  question: ThreadTextQuestion;
  answer: ThreadAnswer | undefined;
  onAnswer: (answer: ThreadAnswer) => void;
}) {
  const text = typeof answer === "string" ? answer : "";
  const max = question.maxLength ?? 120;
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        maxLength={max}
        placeholder={question.placeholder}
        readOnly={inert}
        aria-disabled={inert || undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={question.required || undefined}
        autoComplete="off"
        data-focus=""
        onChange={(event) => {
          if (inert) return;
          const next = event.target.value;
          // Kept as typed, spaces and all; isAnswered trims when counting.
          onAnswer(next === "" ? null : next);
        }}
        className={cn(inputClass(spec, invalid), "max-w-[28rem]")}
      />
      <span
        aria-hidden
        className="hidden shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @min-[30rem]:inline"
      >
        {text.length}/{max}
      </span>
    </div>
  );
}

function NumberControl({
  question,
  answer,
  onAnswer,
  inert,
  invalid,
  motionSafe,
  spec,
  describedBy,
  labelId,
}: ControlProps & {
  question: ThreadNumberQuestion;
  answer: ThreadAnswer | undefined;
  onAnswer: (answer: ThreadAnswer) => void;
}) {
  const n = typeof answer === "number" ? answer : null;
  const step = question.step ?? 1;
  const min = question.min ?? Number.NEGATIVE_INFINITY;
  const max = question.max ?? Number.POSITIVE_INFINITY;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const bump = (dir: 1 | -1) => {
    if (inert) return;
    const base = n ?? (dir > 0 ? Math.max(0, question.min ?? 0) - step : 0);
    const next = clamp(Number((base + dir * step).toFixed(decimals)), min, max);
    onAnswer(next);
  };
  const stepper = (dir: 1 | -1) => {
    const Icon = dir > 0 ? Plus : Minus;
    const at = n !== null && (dir > 0 ? n >= max : n <= min);
    return (
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={dir > 0 ? "More" : "Less"}
        aria-disabled={inert || at || undefined}
        whileTap={inert || at || !motionSafe ? undefined : { scale: 0.9 }}
        transition={springs.flick}
        onClick={() => {
          if (!at) bump(dir);
        }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          spec.input,
          "aspect-square w-auto px-0",
          (inert || at) && "cursor-not-allowed opacity-50 hover:bg-transparent",
          FOCUS_RING,
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </motion.button>
    );
  };
  return (
    <div className="flex items-center gap-1.5">
      {stepper(-1)}
      <div className="relative w-28">
        <input
          type="number"
          inputMode="decimal"
          value={n ?? ""}
          min={question.min}
          max={question.max}
          step={step}
          readOnly={inert}
          aria-disabled={inert || undefined}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={question.required || undefined}
          data-focus=""
          onChange={(event) => {
            if (inert) return;
            const raw = event.target.value;
            if (raw === "") {
              onAnswer(null);
              return;
            }
            const next = Number(raw);
            if (Number.isFinite(next)) onAnswer(clamp(next, min, max));
          }}
          className={cn(
            inputClass(spec, invalid),
            "font-mono tabular-nums",
            question.unit && "pr-8",
          )}
        />
        {question.unit ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {question.unit}
          </span>
        ) : null}
      </div>
      {stepper(1)}
    </div>
  );
}

function DateControl({
  question,
  answer,
  onAnswer,
  inert,
  invalid,
  spec,
  describedBy,
  labelId,
}: ControlProps & {
  question: ThreadDateQuestion;
  answer: ThreadAnswer | undefined;
  onAnswer: (answer: ThreadAnswer) => void;
}) {
  const iso = typeof answer === "string" ? answer : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={iso}
        min={question.min}
        max={question.max}
        readOnly={inert}
        aria-disabled={inert || undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={question.required || undefined}
        data-focus=""
        onChange={(event) => {
          if (inert) return;
          const next = event.target.value;
          onAnswer(/^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null);
        }}
        className={cn(inputClass(spec, invalid), "w-auto font-mono")}
      />
      {iso ? (
        <span aria-hidden className="text-[11px] text-ink-3">
          {formatDate(iso)}
        </span>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

type CardProps = {
  question: ThreadQuestion;
  answer: ThreadAnswer | undefined;
  missing: boolean;
  depth: number;
  number: number;
  inert: boolean;
  motionSafe: boolean;
  spec: DensitySpec;
  uid: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onAnswer: (answer: ThreadAnswer) => void;
};

function QuestionCard({
  question,
  answer,
  missing,
  depth,
  number,
  inert,
  motionSafe,
  spec,
  uid,
  nodeRef,
  onAnswer,
}: CardProps) {
  const labelId = `${uid}-q-${question.id}`;
  const hintId = `${uid}-h-${question.id}`;
  const errId = `${uid}-e-${question.id}`;
  const describedBy =
    [question.hint ? hintId : null, missing ? errId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const answered = isAnswered(question, answer);
  const control = {
    inert,
    invalid: missing,
    motionSafe,
    spec,
    describedBy,
    labelId,
  };

  return (
    <div
      ref={nodeRef}
      role="group"
      aria-labelledby={labelId}
      data-card={question.id}
      className={cn(
        "flex flex-col rounded-3 border bg-surface-0 transition-colors duration-200",
        spec.card,
        missing
          ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
          : answered
            ? "border-hairline"
            : "border-hairline-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p
            id={labelId}
            className={cn(
              "font-medium break-words text-foreground",
              spec.label,
            )}
          >
            <span className="sr-only">
              {depth > 0 ? "Follow-up " : "Question "}
            </span>
            {question.label}
            {question.required ? (
              <span className="sr-only"> (required)</span>
            ) : null}
          </p>
          {question.hint ? (
            <p id={hintId} className="text-[11px] text-ink-3">
              {question.hint}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span
            aria-hidden
            className={cn(
              "font-mono text-[10px] tracking-[0.08em] uppercase",
              missing ? "text-danger" : "text-ink-3",
            )}
          >
            {question.required ? "req" : KIND_WORD[question.kind]}
          </span>
          <span
            aria-hidden
            className={cn(
              "flex size-4 items-center justify-center rounded-full font-mono text-[9px] tabular-nums",
              answered
                ? "bg-[color-mix(in_oklab,var(--tf-accent)_16%,transparent)] text-(--tf-accent)"
                : "bg-surface-2 text-ink-3",
            )}
          >
            {answered ? (
              <svg viewBox="0 0 14 14" className="size-2.5">
                <motion.path
                  d="M3 7.4 5.8 10 11 4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            ) : (
              number
            )}
          </span>
        </div>
      </div>

      {question.kind === "choice" ? (
        <ChoiceControl
          {...control}
          question={question}
          answer={answer}
          onAnswer={onAnswer}
        />
      ) : question.kind === "yesno" ? (
        <YesNoControl {...control} answer={answer} onAnswer={onAnswer} />
      ) : question.kind === "text" ? (
        <TextControl
          {...control}
          question={question}
          answer={answer}
          onAnswer={onAnswer}
        />
      ) : question.kind === "number" ? (
        <NumberControl
          {...control}
          question={question}
          answer={answer}
          onAnswer={onAnswer}
        />
      ) : (
        <DateControl
          {...control}
          question={question}
          answer={answer}
          onAnswer={onAnswer}
        />
      )}

      <AnimatePresence initial={false}>
        {missing ? (
          <motion.p
            key="err"
            id={errId}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            className="flex items-center gap-1 text-[11px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3" />
            Needs an answer before the report can go.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Thread                                  */
/* ----------------------------------------------------------------------- */

type ThreadProps = {
  questions: ThreadQuestion[];
  value: ThreadValue;
  missing: Set<string>;
  depth: number;
  numberOf: (id: string) => number;
  threadStyle: ThreadLineStyle;
  inert: boolean;
  motionSafe: boolean;
  spec: DensitySpec;
  uid: string;
  register: (id: string, node: HTMLDivElement | null) => void;
  onAnswer: (id: string, answer: ThreadAnswer) => void;
};

function Thread({
  questions,
  value,
  missing,
  depth,
  numberOf,
  threadStyle,
  inert,
  motionSafe,
  spec,
  uid,
  register,
  onAnswer,
}: ThreadProps) {
  return (
    <div className={cn("flex flex-col", spec.gap)}>
      {questions.map((question) => {
        const children = openFollowUps(question, value);
        return (
          <div key={question.id} className="flex flex-col">
            <QuestionCard
              question={question}
              answer={value[question.id]}
              missing={missing.has(question.id)}
              depth={depth}
              number={numberOf(question.id)}
              inert={inert}
              motionSafe={motionSafe}
              spec={spec}
              uid={uid}
              nodeRef={(node) => register(question.id, node)}
              onAnswer={(answer) => onAnswer(question.id, answer)}
            />
            <AnimatePresence initial={false}>
              {children.length > 0 ? (
                <Branch
                  key="branch"
                  motionSafe={motionSafe}
                  threadStyle={threadStyle}
                  spec={spec}
                >
                  <Replies
                    questions={children}
                    value={value}
                    missing={missing}
                    depth={depth + 1}
                    numberOf={numberOf}
                    threadStyle={threadStyle}
                    inert={inert}
                    motionSafe={motionSafe}
                    spec={spec}
                    uid={uid}
                    register={register}
                    onAnswer={onAnswer}
                  />
                </Branch>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** The indent and the thread line that draws down beside a question's replies. */
function Branch({
  motionSafe,
  threadStyle,
  spec,
  children,
}: {
  motionSafe: boolean;
  threadStyle: ThreadLineStyle;
  spec: DensitySpec;
  children: React.ReactNode;
}) {
  return (
    <Fold motionSafe={motionSafe}>
      <div
        className={cn("relative", spec.top)}
        style={{ paddingLeft: spec.indent }}
      >
        {threadStyle !== "none" ? (
          <motion.span
            aria-hidden
            className={cn(
              "absolute top-0 bottom-3 w-px",
              threadStyle === "line"
                ? "bg-(--tf-line)"
                : "bg-[repeating-linear-gradient(to_bottom,var(--tf-line)_0_2px,transparent_2px_5px)]",
            )}
            style={{ left: Math.round(spec.indent / 2) - 1, originY: 0 }}
            initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
            animate={motionSafe ? { scaleY: 1 } : { opacity: 1 }}
            exit={
              motionSafe
                ? { scaleY: 0, transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          />
        ) : null}
        {children}
      </div>
    </Fold>
  );
}

/** A question's replies: each lands in a cascade with its own elbow onto the line. */
function Replies(props: ThreadProps) {
  const { questions, motionSafe, threadStyle, spec, value } = props;
  const step = cascade(questions.length);
  return (
    <div className={cn("flex flex-col", spec.gap)}>
      <AnimatePresence initial={false}>
        {questions.map((question, i) => (
          <Fold key={question.id} motionSafe={motionSafe} delay={r3(i * step)}>
            <div className="relative">
              {threadStyle !== "none" ? (
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute top-[18px] h-px",
                    threadStyle === "line"
                      ? "bg-(--tf-line)"
                      : "bg-[repeating-linear-gradient(to_right,var(--tf-line)_0_2px,transparent_2px_5px)]",
                  )}
                  style={{
                    left: -(spec.indent - Math.round(spec.indent / 2) + 1),
                    width: spec.indent - Math.round(spec.indent / 2) + 1,
                    originX: 0,
                  }}
                  initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                  animate={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: r3(i * step + 0.12) }
                      : { duration: durations.fast }
                  }
                />
              ) : null}
              <Thread {...props} questions={[question]} value={value} />
            </div>
          </Fold>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A form whose follow-up questions thread out of answers. Every question is a
 * card; answering one unfolds its follow-ups indented beneath it like replies
 * in a thread, a thread line drawing down beside them on `springs.glide` as
 * each reply lands in a cascade with a short elbow ticking onto the line on
 * `springs.flick`. Changing an answer that no longer needs its replies folds
 * them away on the exit ease, the line retracting with them. Answers are
 * choice chips (a check draws on flick), a yes/no track whose pill slides on
 * `springs.snap`, a short text, a number with a stepper, or a date.
 *
 * The header counts "5 of 11 answered" on rolling digits with a progress bar
 * that glides, and the summary writes the answers as prose that updates as
 * you go, at the foot on a phone and beside the thread from 40rem. Submit
 * with a required question open marks each one, scrolls the first into view
 * and focuses it; with everything answered a Sent stamp lands on
 * `springs.recoil`.
 *
 * Controls keep their native semantics: chips and the yes/no track are
 * radiogroups (Left/Right, Home/End), the inputs are inputs. Up/Down move
 * between cards from any chip or button, and Alt+Up/Down from inside a text,
 * number or date field. Under reduced motion nothing unfolds or draws:
 * replies appear in place with a cross-fade and the count changes at once.
 */
export function ThreadFields({
  threadStyle = "line",
  density = "cozy",
  accent = "cobalt",
  questions = defaultThreadQuestions,
  value,
  defaultValue = defaultThreadValue,
  onChange,
  onSubmit,
  keepFolded = true,
  showSummary = true,
  status = "ready",
  onRetry,
  title = "Incident report",
  submitLabel = "Submit report",
  label,
  height = 540,
  disabled = false,
  className,
}: ThreadFieldsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const summaryId = `${uid}-summary`;

  const [own, setOwn] = React.useState<ThreadValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [submitted, setSubmitted] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [scrollReq, setScrollReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so the stamp and the summary
  // sentences already on the page never animate in.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());

  /* -------------------------------- data ------------------------------- */

  const rows = visibleThread(questions, current);
  const total = rows.length;
  const answered = rows.filter(({ question }) =>
    isAnswered(question, current[question.id]),
  ).length;
  const requiredOpen = rows.filter(
    ({ question }) =>
      question.required && !isAnswered(question, current[question.id]),
  );
  const missing = new Set(
    submitted ? requiredOpen.map(({ question }) => question.id) : [],
  );
  const order = rows.map(({ question }) => question.id);
  const numberOf = (id: string) => order.indexOf(id) + 1;
  const summary = summarizeThread(questions, current);
  const sentences = rows
    .map(({ question }) => ({
      id: question.id,
      text: sentenceFor(question, current[question.id] ?? null),
    }))
    .filter((s) => s.text);
  const byId = new Map(allQuestions(questions).map((q) => [q.id, q]));

  /* ------------------------------- changes ----------------------------- */

  const answer = (id: string, to: ThreadAnswer) => {
    if (inert) return;
    const question = byId.get(id);
    if (!question) return;
    const from = current[id] ?? null;
    if (from === to) return;
    const before = visibleThread(questions, current).map((r) => r.question.id);
    let next: ThreadValue = { ...current, [id]: to };
    const after = visibleThread(questions, next).map((r) => r.question.id);
    const opened = after.filter((k) => !before.includes(k)).length;
    const foldedIds = before.filter((k) => !after.includes(k));
    if (!keepFolded && foldedIds.length > 0) {
      next = { ...next };
      for (const k of foldedIds) delete next[k];
    }
    if (value === undefined) setOwn(next);
    onChange?.(next, { id, from, to, opened, folded: foldedIds.length });
    setSent(false);
    const words = formatAnswer(question, to);
    const n = after.filter((k) => {
      const q = byId.get(k);
      return q ? isAnswered(q, next[k]) : false;
    }).length;
    const parts = [
      words
        ? `${question.label.replace(/\?$/, "")}: ${words}.`
        : `${question.label.replace(/\?$/, "")} cleared.`,
    ];
    if (opened > 0) {
      parts.push(`${opened} follow-up${opened === 1 ? "" : "s"} opened below.`);
    }
    if (foldedIds.length > 0) {
      parts.push(
        `${foldedIds.length} follow-up${foldedIds.length === 1 ? "" : "s"} folded away.`,
      );
    }
    parts.push(`${n} of ${after.length} answered.`);
    setAnnouncement(parts.join(" "));
  };

  const submit = () => {
    if (inert || questions.length === 0) return;
    if (requiredOpen.length > 0) {
      setSubmitted(true);
      const first = requiredOpen[0];
      if (first) {
        setScrollReq((r) => ({
          id: first.question.id,
          seq: (r?.seq ?? 0) + 1,
        }));
      }
      setAnnouncement(
        `${requiredOpen.length} required question${requiredOpen.length === 1 ? "" : "s"} still open. First: ${first?.question.label ?? ""}`,
      );
      return;
    }
    setSubmitted(false);
    setSent(true);
    onSubmit?.(current, summary);
    setAnnouncement(`Report sent. ${answered} of ${total} answered.`);
  };

  // Scroll the first open required card into view, then focus its control —
  // after the marks have rendered, so the focused card is already red.
  React.useLayoutEffect(() => {
    if (!scrollReq) return;
    const node = cardNodes.current.get(scrollReq.id);
    const pane = scrollRef.current;
    if (!node || !pane) return;
    const top =
      node.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop -
      12;
    if (typeof pane.scrollTo === "function") {
      pane.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
    } else {
      pane.scrollTop = top;
    }
    primaryControl(node)?.focus({ preventScroll: true });
  }, [scrollReq, motionSafe]);

  /* ------------------------------ keyboard ----------------------------- */

  const focusCard = (id: string) => {
    const node = cardNodes.current.get(id);
    if (node) primaryControl(node)?.focus();
  };

  const onThreadKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target as HTMLElement;
    const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    // Fields keep their own Up/Down (a number steps, a date picks a part);
    // Alt lifts the arrows out to the thread.
    if (inField && !event.altKey) return;
    const card = target.closest<HTMLElement>("[data-card]");
    const id = card?.dataset.card;
    if (!id) return;
    const i = order.indexOf(id);
    if (i < 0) return;
    event.preventDefault();
    const to =
      order[
        clamp(i + (event.key === "ArrowDown" ? 1 : -1), 0, order.length - 1)
      ];
    if (to && to !== id) focusCard(to);
  };

  /* ------------------------------- render ------------------------------ */

  const spec = DENSITIES[density] ?? DENSITIES.cozy;
  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;
  const progress = total > 0 ? answered / total : 0;
  const empty = ready && questions.length === 0;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--tf-accent" as string]: accentColor,
        ["--tf-line" as string]: `color-mix(in oklab, ${accentColor} 55%, var(--hairline-strong))`,
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down arrows move between questions; hold Alt inside a text,
        number or date field. Left and Right pick an answer.
      </p>

      <header className="relative flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready && total > 0 ? (
          <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
            <span className="sr-only">
              {answered} of {total} answered
            </span>
            <Roll
              value={answered}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden>of {total}</span>
            <span aria-hidden className="hidden @min-[24rem]:inline">
              answered
            </span>
          </p>
        ) : null}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-hairline"
        />
        <motion.span
          aria-hidden
          className="absolute bottom-0 left-0 h-px w-full bg-(--tf-accent)"
          style={{ originX: 0 }}
          initial={false}
          animate={{ scaleX: ready ? progress : 0 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The questions didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className={cn("flex flex-col p-4", spec.gap)}>
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col rounded-3 border border-hairline",
                  spec.card,
                  i === 1 && "ml-6",
                )}
              >
                <span
                  className="h-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${42 + ((i * 17) % 30)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
                <span className="flex gap-1.5">
                  {Array.from({ length: 3 - (i % 2) }, (_, j) => (
                    <span
                      key={j}
                      className="h-6 rounded-full bg-surface-2 motion-safe:animate-pulse"
                      style={{
                        width: 52 + (((i + j) * 19) % 36),
                        animationDelay: `${i * 90 + j * 40}ms`,
                      }}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">No questions configured.</p>
            <p className="max-w-[26ch] text-[11px] text-ink-3">
              Give the form a question tree and its follow-ups will thread out
              of the answers.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-4 p-4",
              showSummary &&
                "@min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_14rem] @min-[40rem]:items-start",
            )}
          >
            <div
              role="group"
              aria-label={`${title}, questions`}
              aria-describedby={hintId}
              onKeyDown={onThreadKey}
              className="min-w-0"
            >
              <Thread
                questions={questions}
                value={current}
                missing={missing}
                depth={0}
                numberOf={numberOf}
                threadStyle={threadStyle}
                inert={inert}
                motionSafe={motionSafe}
                spec={spec}
                uid={uid}
                register={(id, node) => {
                  if (node) cardNodes.current.set(id, node);
                  else cardNodes.current.delete(id);
                }}
                onAnswer={answer}
              />
            </div>

            {showSummary ? (
              <aside
                aria-labelledby={summaryId}
                className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3 @min-[40rem]:sticky @min-[40rem]:top-0"
              >
                <p
                  id={summaryId}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Summary
                </p>
                <p className="text-[12px] leading-5 break-words text-ink-2">
                  <AnimatePresence initial={false}>
                    {sentences.length === 0 ? (
                      <motion.span
                        key="none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{ duration: durations.fast }}
                        className="text-ink-3"
                      >
                        Nothing answered yet.
                      </motion.span>
                    ) : (
                      // Inline text cannot be transformed, so a sentence only
                      // ever cross-fades: the prose wraps as prose.
                      sentences.map((s) => (
                        <motion.span
                          key={s.id}
                          initial={live ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                          className="inline"
                        >
                          {s.text}{" "}
                        </motion.span>
                      ))
                    )}
                  </AnimatePresence>
                </p>
              </aside>
            ) : null}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
        <p
          aria-hidden
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {!ready || empty
            ? ""
            : requiredOpen.length > 0
              ? `${requiredOpen.length} required open`
              : "ready to send"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {sent ? (
              <motion.span
                key="sent"
                role="img"
                aria-label="Sent"
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 0.6, rotate: -8 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="inline-flex h-7 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2.5 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
              >
                <CircleCheck aria-hidden className="size-3" />
                Sent
              </motion.span>
            ) : null}
          </AnimatePresence>
          <motion.button
            type="button"
            onClick={submit}
            aria-disabled={inert || empty || undefined}
            aria-describedby={hintId}
            whileTap={
              inert || empty || !motionSafe ? undefined : { scale: 0.97 }
            }
            transition={springs.flick}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
              inert || empty
                ? "cursor-not-allowed bg-surface-2 text-ink-3"
                : "bg-primary text-primary-foreground hover:opacity-90",
              FOCUS_RING,
            )}
          >
            {submitLabel}
            <SendHorizontal aria-hidden className="size-3.5" />
          </motion.button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
