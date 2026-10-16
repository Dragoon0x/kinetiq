"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Bookmark,
  BookmarkCheck,
  CornerDownRight,
  GitBranch,
  Pencil,
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
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type QuestionTrailOption = { value: string; label: string };

export type QuestionTrailQuestion = {
  id: string;
  /** The question, as the host asks it. */
  prompt: string;
  /** A short name for the answer's button and announcements. @default the prompt */
  short?: string;
  /** Pick from options, or type. @default "choice" when there are options, else "text" */
  kind?: "choice" | "text";
  options?: QuestionTrailOption[];
  /** Hint inside the text field. */
  placeholder?: string;
  /** May be skipped. @default false */
  optional?: boolean;
  /**
   * Where to go next: one question id, a map from answer value to id (a
   * branch), or null to end. Omit it to go to the next question in the list.
   */
  next?: string | null | Record<string, string | null>;
  /** For text answers: return a sentence saying what is wrong, or null. */
  validate?: (text: string) => string | null;
};

/** Question id → the answer's value; "" is a skipped optional question. */
export type QuestionTrailAnswers = Record<string, string>;

export type QuestionTrailSaved = {
  answers: QuestionTrailAnswers;
  /** The question waiting for an answer, or null when the trail is complete. */
  at: string | null;
};

export type QuestionTrailBubbleStyle = "soft" | "outline" | "plain";
export type QuestionTrailDensity = "compact" | "regular" | "roomy";
export type QuestionTrailStatus = "ready" | "loading" | "error";

export type QuestionTrailProps = {
  /** The questions; the first one starts the trail. @default defaultQuestionTrailQuestions */
  questions?: QuestionTrailQuestion[];
  /** Controlled answers. */
  value?: QuestionTrailAnswers;
  /** Initial answers when uncontrolled; the trail opens at the first unanswered question. @default {} */
  defaultValue?: QuestionTrailAnswers;
  /** Fires from the press, Enter or Skip that changed an answer, with every answer kept. */
  onValueChange?: (answers: QuestionTrailAnswers) => void;
  /** Fires once per answer given, with the question, its value and every answer. */
  onAnswer?: (
    questionId: string,
    value: string,
    answers: QuestionTrailAnswers,
  ) => void;
  /** Fires when the last question on the path is answered, with the answers and the path's ids. */
  onComplete?: (answers: QuestionTrailAnswers, path: string[]) => void;
  /** Fires when an earlier answer is opened again. */
  onRewind?: (questionId: string) => void;
  /** Fires from Save for later with the answers and the question waiting. */
  onSave?: (saved: QuestionTrailSaved) => void;
  /** Keeps a saved trail in this device's storage under this key and picks it up after mount. */
  storageKey?: string;
  /** Filled bubbles, hairline bubbles, or a plain transcript. @default "soft" */
  bubbleStyle?: QuestionTrailBubbleStyle;
  /** Gaps, padding and type size. @default "regular" */
  density?: QuestionTrailDensity;
  /** Answer chips, the composer's focus and the save mark — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long the host "types" before a new question arrives, in ms. @default 420 */
  typingDelay?: number;
  /** Who is asking. @default "Basinworks" */
  host?: string;
  /** The intake's heading. @default "Book a call-out" */
  title?: string;
  /** The host's last line once every question is answered. */
  closing?: string | ((answers: QuestionTrailAnswers) => string);
  /** Whether the questions have arrived. @default "ready" */
  status?: QuestionTrailStatus;
  /** "Try again" was pressed after the questions failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px; the trail scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be answered or changed. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const opts = (...list: [string, string][]): QuestionTrailOption[] =>
  list.map(([value, label]) => ({ value, label }));

/** A Basinworks plumbing call-out: what is wrong, how soon, and how to reach you. */
export const defaultQuestionTrailQuestions: QuestionTrailQuestion[] = [
  {
    id: "trouble",
    short: "the trouble",
    prompt: "Hello. What's the trouble?",
    options: opts(
      ["leak", "A leak"],
      ["hot", "No hot water"],
      ["drain", "Blocked drain"],
      ["other", "Something else"],
    ),
    next: { leak: "source", hot: "boiler", drain: "drain", other: "describe" },
  },
  {
    id: "source",
    short: "where it leaks",
    prompt: "Where is the water coming from?",
    options: opts(
      ["ceiling", "Through a ceiling"],
      ["sink", "Under a sink"],
      ["outside", "Outside"],
    ),
    next: "urgency",
  },
  {
    id: "boiler",
    short: "the fault code",
    prompt: "Is the boiler showing a fault code?",
    kind: "text",
    placeholder: "e.g. F28, or none",
    next: "urgency",
  },
  {
    id: "drain",
    short: "which drain",
    prompt: "Which drain is blocked?",
    options: opts(
      ["kitchen", "Kitchen sink"],
      ["toilet", "Toilet"],
      ["gully", "Outside gully"],
    ),
    next: "urgency",
  },
  {
    id: "describe",
    short: "what's happening",
    prompt: "Tell us what's happening, in a line or two.",
    kind: "text",
    placeholder: "What you've noticed",
    next: "urgency",
  },
  {
    id: "urgency",
    short: "how soon",
    prompt: "How soon do you need someone?",
    options: opts(
      ["today", "Today"],
      ["week", "This week"],
      ["flexible", "Whenever suits"],
    ),
  },
  {
    id: "home",
    short: "when you're home",
    prompt: "When is someone home to let us in?",
    options: opts(
      ["mornings", "Mornings"],
      ["afternoons", "Afternoons"],
      ["any", "Any time"],
    ),
  },
  {
    id: "phone",
    short: "your number",
    prompt: "What's the best number to reach you?",
    kind: "text",
    placeholder: "07700 900123",
    validate: (text) =>
      text.replace(/\D/g, "").length >= 7
        ? null
        : "Enter a number with at least seven digits.",
  },
  {
    id: "notes",
    short: "notes",
    prompt: "Anything we should know before we arrive?",
    kind: "text",
    placeholder: "Parking, pets, a gate code…",
    optional: true,
    next: null,
  },
];

const DEFAULT_ANSWERS: QuestionTrailAnswers = {};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DENSITY: Record<
  QuestionTrailDensity,
  { px: string; item: string; bubble: string; text: string; chip: string }
> = {
  compact: {
    px: "px-3",
    item: "pb-2.5",
    bubble: "px-2.5 py-1.5",
    text: "text-[12px] leading-[18px]",
    chip: "h-7 px-2.5 text-[12px]",
  },
  regular: {
    px: "px-4",
    item: "pb-3.5",
    bubble: "px-3 py-2",
    text: "text-[13px] leading-5",
    chip: "h-8 px-3 text-[13px]",
  },
  roomy: {
    px: "px-5",
    item: "pb-5",
    bubble: "px-3.5 py-2.5",
    text: "text-sm leading-6",
    chip: "h-9 px-3.5 text-sm",
  },
};

const kindOf = (q: QuestionTrailQuestion) =>
  q.kind ?? (q.options && q.options.length > 0 ? "choice" : "text");

const labelOf = (q: QuestionTrailQuestion, value: string) =>
  value === ""
    ? "Skipped"
    : (q.options?.find((o) => o.value === value)?.label ?? value);

type Step = { id: string | null; branch?: string };

/** Where an answer leads, and the words of a branch when it was one. */
function nextOf(
  questions: QuestionTrailQuestion[],
  q: QuestionTrailQuestion,
  value: string,
): Step {
  const index = questions.findIndex((x) => x.id === q.id);
  const following = questions[index + 1]?.id ?? null;
  if (q.next === null) return { id: null };
  if (typeof q.next === "string") return { id: q.next };
  if (q.next && typeof q.next === "object") {
    const to = q.next[value];
    return {
      id: to === undefined ? following : to,
      branch: labelOf(q, value),
    };
  }
  return { id: following };
}

type Entry = {
  q: QuestionTrailQuestion;
  answer?: string;
  /** The earlier answer that sent the trail here, when it was a branch. */
  branch?: string;
};

/**
 * The trail as answered so far: from the first question, following each
 * answer, stopping at the question being re-answered, the first question
 * without an answer, or the end. Answers off the path stay kept.
 */
function walk(
  questions: QuestionTrailQuestion[],
  answers: QuestionTrailAnswers,
  stopAt: string | null,
): { entries: Entry[]; complete: boolean } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let q = questions[0];
  let branch: string | undefined;
  while (q && !seen.has(q.id)) {
    seen.add(q.id);
    const answer = answers[q.id];
    entries.push({ q, answer, branch });
    if (q.id === stopAt || answer === undefined) {
      return { entries, complete: false };
    }
    const step = nextOf(questions, q, answer);
    if (step.id === null) return { entries, complete: true };
    q = byId.get(step.id);
    branch = step.branch;
  }
  return { entries, complete: entries.length > 0 };
}

/** How long the trail will probably be: the path so far, then the first option onward. */
function expectedLength(
  questions: QuestionTrailQuestion[],
  answers: QuestionTrailAnswers,
): number {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  let q = questions[0];
  while (q && !seen.has(q.id)) {
    seen.add(q.id);
    const value = answers[q.id] ?? q.options?.[0]?.value ?? "";
    const step = nextOf(questions, q, value);
    q = step.id === null ? undefined : byId.get(step.id);
  }
  return seen.size;
}

const defaultClosing = (answers: QuestionTrailAnswers) =>
  answers.phone
    ? `That's everything. We'll ring ${answers.phone} to agree a time.`
    : "That's everything. We'll be in touch to agree a time.";

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

type Look = {
  style: QuestionTrailBubbleStyle;
  d: (typeof DENSITY)[QuestionTrailDensity];
};

function hostBubble(look: Look) {
  if (look.style === "plain")
    return cn("border-l-2 border-hairline-strong py-0.5 pl-3 text-foreground");
  return cn(
    "rounded-3 rounded-bl-1 text-foreground",
    look.d.bubble,
    look.style === "soft"
      ? "bg-surface-2"
      : "border border-hairline-strong bg-transparent",
  );
}

function chipClass(look: Look, skipped: boolean) {
  if (look.style === "plain")
    return cn(
      "h-auto gap-1.5 rounded-1 px-1 py-0.5 text-(--qt-accent) underline-offset-4 hover:underline",
      skipped && "text-ink-3 italic",
    );
  return cn(
    "rounded-full",
    look.d.chip,
    look.style === "soft"
      ? skipped
        ? "bg-surface-2 text-ink-3 italic"
        : "bg-(--qt-solid) text-primary-foreground hover:bg-(--qt-solid)/90"
      : skipped
        ? "border border-dashed border-hairline-strong text-ink-3 italic"
        : "border border-(--qt-accent) text-(--qt-accent) hover:bg-(--qt-wash)",
  );
}

/** Three dots while the host writes; only ever mounted for `typingDelay` ms. */
function Typing({ look, motionSafe }: { look: Look; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center gap-1",
        look.style === "plain" ? "py-1.5 pl-3" : cn(hostBubble(look), "py-2.5"),
      )}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          animate={motionSafe ? { y: [0, -3, 0], opacity: [0.5, 1, 0.5] } : {}}
          transition={{
            duration: 0.84,
            ease: easings.move,
            repeat: Infinity,
            delay: i * 0.14,
          }}
        />
      ))}
    </span>
  );
}

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/** The host's bubble rises from its tail corner on snap — only when it is new. */
function Bubble({
  id,
  armed,
  motionSafe,
  className,
  children,
}: {
  id: string;
  armed: boolean;
  motionSafe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [fresh] = React.useState(armed && motionSafe);
  return (
    <motion.p
      id={id}
      className={className}
      style={{ originX: 0, originY: 1 }}
      initial={fresh ? { scale: 0.92 } : false}
      animate={{ scale: 1 }}
      transition={springs.snap}
    >
      {children}
    </motion.p>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Composers                                */
/* ----------------------------------------------------------------------- */

function ChoiceComposer({
  q,
  uid,
  promptId,
  current,
  look,
  motionSafe,
  disabled,
  autoFocus,
  onAnswer,
  onKeep,
}: {
  q: QuestionTrailQuestion;
  uid: string;
  promptId: string;
  current?: string;
  look: Look;
  motionSafe: boolean;
  disabled: boolean;
  autoFocus: boolean;
  onAnswer: (value: string) => void;
  onKeep: () => void;
}) {
  const options = q.options ?? [];
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const first =
    current !== undefined && options.some((o) => o.value === current)
      ? current
      : options[0]?.value;
  const [focusable, setFocusable] = React.useState(first);
  // Bound to the composer's own arrival: its effect runs once the options exist.
  React.useEffect(() => {
    if (autoFocus && first) {
      refs.current.get(first)?.focus({ preventScroll: true });
    }
  }, [autoFocus, first]);

  const move = (event: React.KeyboardEvent, index: number) => {
    const n = options.length;
    const map: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    if (event.key === "Escape" && current !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onKeep();
      return;
    }
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const option = options[((to % n) + n) % n];
    if (!option) return;
    setFocusable(option.value);
    refs.current.get(option.value)?.focus();
  };

  return (
    <div
      role="group"
      aria-labelledby={promptId}
      className="flex flex-wrap justify-end gap-1.5"
    >
      {options.map((o, i) => {
        const was = o.value === current;
        return (
          <motion.span
            key={o.value}
            layoutId={`${uid}-${q.id}-${o.value}`}
            transition={{
              layout: motionSafe ? springs.glide : { duration: 0 },
            }}
            className="inline-flex rounded-full"
          >
            <button
              ref={(el) => {
                refs.current.set(o.value, el);
              }}
              type="button"
              tabIndex={o.value === focusable ? 0 : -1}
              aria-disabled={disabled || undefined}
              aria-describedby={was ? `${uid}-${q.id}-was` : undefined}
              onClick={() => {
                if (!disabled) onAnswer(o.value);
              }}
              onKeyDown={(event) => move(event, i)}
              onFocus={() => setFocusable(o.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors",
                look.d.chip,
                FOCUS,
                was
                  ? "border-(--qt-accent) bg-(--qt-wash) text-foreground"
                  : "border-hairline-strong bg-surface-1 text-foreground hover:border-(--qt-accent) hover:bg-(--qt-wash)",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {o.label}
              {was ? (
                <span
                  id={`${uid}-${q.id}-was`}
                  className="font-mono text-[9px] tracking-[0.08em] text-(--qt-accent) uppercase"
                >
                  now
                </span>
              ) : null}
            </button>
          </motion.span>
        );
      })}
    </div>
  );
}

function TextComposer({
  q,
  promptId,
  current,
  look,
  disabled,
  autoFocus,
  onAnswer,
  onKeep,
}: {
  q: QuestionTrailQuestion;
  promptId: string;
  current?: string;
  look: Look;
  disabled: boolean;
  autoFocus: boolean;
  onAnswer: (value: string) => void;
  onKeep: () => void;
}) {
  const [draft, setDraft] = React.useState(current ?? "");
  const [problem, setProblem] = React.useState<string | null>(null);
  const field = React.useRef<HTMLInputElement | null>(null);
  const errorId = `${promptId}-error`;
  React.useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const send = () => {
    if (disabled) return;
    const text = draft.trim();
    if (!text) {
      setProblem(
        q.optional
          ? null
          : "Type an answer, or go back and change an earlier one.",
      );
      if (q.optional) onAnswer("");
      return;
    }
    const wrong = q.validate?.(text) ?? null;
    setProblem(wrong);
    if (!wrong) onAnswer(text);
  };

  return (
    <form
      className="flex w-full flex-col items-end gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex w-full max-w-[19rem] items-center gap-1.5">
        <input
          ref={field}
          value={draft}
          readOnly={disabled}
          placeholder={q.placeholder}
          aria-labelledby={promptId}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
            if (problem) setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && current !== undefined) {
              event.preventDefault();
              event.stopPropagation();
              onKeep();
            }
          }}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-full border bg-surface-0 px-3.5 text-foreground placeholder:text-ink-3",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--qt-accent) focus-visible:outline-solid",
            look.d.text,
            problem ? "border-danger" : "border-input",
          )}
        />
        <button
          type="submit"
          aria-disabled={disabled || undefined}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--qt-solid) text-primary-foreground transition-colors hover:bg-(--qt-solid)/90",
            FOCUS,
          )}
        >
          <SendHorizontal aria-hidden className="size-4" />
          <span className="sr-only">Send</span>
        </button>
      </div>
      {problem ? (
        <p
          id={errorId}
          className="flex items-center gap-1 text-[11px] leading-4 text-danger"
        >
          <TriangleAlert aria-hidden className="size-3 shrink-0" />
          {problem}
        </p>
      ) : q.optional ? (
        <button
          type="button"
          onClick={() => {
            if (!disabled) onAnswer("");
          }}
          className={cn(
            "inline-flex h-7 items-center rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          Skip this one
        </button>
      ) : null}
    </form>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Fold = { from: number; to: number };

/**
 * A conversational intake, one question at a time. Each question arrives
 * as a bubble — three typing dots first, then the bubble rises a `step` on
 * `springs.snap` from its tail corner — and the answer becomes a chip under
 * it: the option you picked travels into place on `glide`. Every earlier
 * chip is a button. Pressing one rewinds: the later bubbles fold back up
 * into it bottom-first in a `cascade`, their heights closing on glide while
 * their words lift away on the exit ease, and the chip opens back into its
 * composer with the old answer marked. Answering again replays the trail
 * forward — each later question that still applies re-arrives with its kept
 * answer until one has none — so a changed branch only asks what is new.
 * Questions reached through a branch say which answer led there.
 *
 * Options are a group of buttons with roving focus (arrows move, Enter
 * sends, Escape keeps the old answer); text questions are a labelled field
 * with Send. Save for later hands the trail to the host and, with
 * `storageKey`, to this device. Under reduced motion nothing travels or
 * types: bubbles and chips fade in and out, and the replay still re-deals
 * in order.
 */
export function QuestionTrail({
  questions = defaultQuestionTrailQuestions,
  value,
  defaultValue = DEFAULT_ANSWERS,
  onValueChange,
  onAnswer,
  onComplete,
  onRewind,
  onSave,
  storageKey,
  bubbleStyle = "soft",
  density = "regular",
  accent = "var(--accent-bright)",
  typingDelay = 420,
  host = "Basinworks",
  title = "Book a call-out",
  closing = defaultClosing,
  status = "ready",
  onRetry,
  height = 520,
  disabled = false,
  className,
}: QuestionTrailProps) {
  const motionSafe = useMotionSafe();
  const armed = useCommitted();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const look: Look = { style: bubbleStyle, d };

  const [own, setOwn] = React.useState<QuestionTrailAnswers>(defaultValue);
  const answers = value ?? own;
  const [editing, setEditing] = React.useState<string | null>(null);
  const { entries, complete } = walk(questions, answers, editing);
  const target = entries.length + (complete ? 1 : 0);
  const [shownCount, setShownCount] = React.useState(target);
  if (shownCount > target) setShownCount(target);
  const visible = Math.min(shownCount, target);
  const [fold, setFold] = React.useState<Fold>({ from: target, to: target });
  const [kept, setKept] = React.useState<string[]>([]);
  const [saved, setSaved] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusWanted, setFocusWanted] = React.useState<string | null>(null);
  const trailRef = React.useRef<HTMLDivElement | null>(null);

  const pending = visible < target ? (entries[visible] ?? null) : null;
  const closingPending = visible < target && visible === entries.length;
  // A new question (or the closing line) is typed first; a kept one replays.
  const typing =
    motionSafe &&
    visible < target &&
    (closingPending || (pending !== null && pending.answer === undefined));

  /* ------------------------------ the reveal ----------------------------- */

  React.useEffect(() => {
    if (shownCount >= target) return;
    const entry = entries[shownCount];
    const fresh = !entry || entry.answer === undefined;
    const wait = fresh
      ? motionSafe
        ? Math.max(0, typingDelay)
        : 60
      : motionSafe
        ? 260
        : 40;
    const t = window.setTimeout(() => setShownCount((c) => c + 1), wait);
    return () => window.clearTimeout(t);
    // The entries are derived from these; the effect re-arms per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownCount, target, motionSafe, typingDelay, editing]);

  // The newest item stays in view: the trail scrolls its own box, never the page.
  React.useEffect(() => {
    const box = trailRef.current;
    if (!box) return;
    const id = window.requestAnimationFrame(() => {
      if (editing) {
        const node = box.querySelector<HTMLElement>(
          `[data-qt-item="${editing}"]`,
        );
        if (node) {
          box.scrollTo({
            top: Math.max(0, node.offsetTop - 12),
            behavior: motionSafe ? "smooth" : "auto",
          });
        }
        return;
      }
      box.scrollTo({
        top: box.scrollHeight,
        behavior: motionSafe ? "smooth" : "auto",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [visible, typing, editing, motionSafe]);

  /* ------------------------------ storage ------------------------------- */

  React.useEffect(() => {
    if (!storageKey) return;
    let stored: QuestionTrailSaved | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      stored = raw ? (JSON.parse(raw) as QuestionTrailSaved) : null;
    } catch {
      stored = null;
    }
    if (!stored || typeof stored.answers !== "object" || !stored.answers)
      return;
    const kept: QuestionTrailAnswers = {};
    for (const q of questions) {
      const v = stored.answers[q.id];
      if (typeof v === "string") kept[q.id] = v;
    }
    // Applied on the next frame: the stored trail is outside data arriving.
    const id = window.requestAnimationFrame(() => {
      if (value === undefined) setOwn(kept);
      const next = walk(questions, kept, null);
      setShownCount(next.entries.length + (next.complete ? 1 : 0));
      setRestored(true);
      onValueChange?.(kept);
    });
    return () => window.cancelAnimationFrame(id);
    // Picks up once per key; later saves are written by Save for later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* ------------------------------ handlers ------------------------------ */

  const say = (text: string) => setAnnouncement(text);

  const commit = (q: QuestionTrailQuestion, v: string) => {
    if (disabled) return;
    const next = { ...answers, [q.id]: v };
    if (value === undefined) setOwn(next);
    const walked = walk(questions, next, null);
    const at = walked.entries.findIndex((e) => e.q.id === q.id);
    const replay = walked.entries
      .slice(at + 1)
      .filter((e) => e.answer !== undefined)
      .map((e) => e.q.id);
    setEditing(null);
    setKept(replay);
    setSaved(false);
    setShownCount(at + 1);
    const waiting = walked.entries.find((e) => e.answer === undefined);
    setFocusWanted(walked.complete ? "closing" : (waiting?.q.id ?? null));
    const word = labelOf(q, v);
    say(
      `${word}.${replay.length ? ` ${replay.length} kept ${replay.length === 1 ? "answer" : "answers"} replayed.` : ""}${
        walked.complete
          ? " That's every question."
          : waiting
            ? ` Next: ${waiting.q.prompt}`
            : ""
      }`,
    );
    onValueChange?.(next);
    onAnswer?.(q.id, v, next);
    if (walked.complete) {
      onComplete?.(
        next,
        walked.entries.map((e) => e.q.id),
      );
    }
  };

  const rewind = (q: QuestionTrailQuestion) => {
    if (disabled) return;
    const at = entries.findIndex((e) => e.q.id === q.id);
    if (at < 0) return;
    setFold({ from: visible, to: at + 1 });
    setEditing(q.id);
    setShownCount(at + 1);
    setKept([]);
    setFocusWanted(q.id);
    say(
      `Changing ${q.short ?? q.prompt}. Later answers are kept and replay when you answer.`,
    );
    onRewind?.(q.id);
  };

  const keep = (q: QuestionTrailQuestion) => {
    const v = answers[q.id];
    if (v === undefined) return;
    commit(q, v);
  };

  const save = () => {
    if (disabled || status !== "ready") return;
    const waiting = entries.find((e) => e.answer === undefined);
    const payload: QuestionTrailSaved = {
      answers,
      at: complete ? null : (editing ?? waiting?.q.id ?? null),
    };
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Storage full or blocked: the host still has the trail.
      }
    }
    setSaved(true);
    say("Saved. You can pick up where you left off.");
    onSave?.(payload);
  };

  const closingNode = React.useCallback(
    (node: HTMLParagraphElement | null) => {
      if (node && focusWanted === "closing")
        node.focus({ preventScroll: true });
    },
    [focusWanted],
  );

  /* ------------------------------ rendering ----------------------------- */

  // Kept answers still count while one is being changed: nothing is lost.
  const answered = walk(questions, answers, null).entries.filter(
    (e) => e.answer !== undefined,
  ).length;
  const expected = Math.max(entries.length, expectedLength(questions, answers));
  const progress = complete ? 1 : expected > 0 ? answered / expected : 0;
  const closingText =
    typeof closing === "function" ? closing(answers) : closing;

  const item = (e: Entry, i: number) => {
    const promptId = `${uid}-p-${e.q.id}`;
    const isEditing = e.q.id === editing;
    const waiting = e.answer === undefined || isEditing;
    const wasKept = kept.includes(e.q.id);
    return (
      <motion.li
        key={e.q.id}
        data-qt-item={e.q.id}
        custom={fold}
        className={cn("relative flex flex-col gap-2", d.item)}
        style={{ overflow: "clip", overflowClipMargin: 6 }}
        variants={{
          arrive: { opacity: 0, y: motionSafe ? distances.step : 0 },
          shown: { opacity: 1, y: 0, height: "auto" },
          fold: (f: Fold) => {
            const lag =
              Math.max(0, f.from - 1 - i) * cascade(Math.max(2, f.from - f.to));
            return {
              opacity: 0,
              height: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: motionSafe
                ? {
                    height: { ...springs.glide, delay: lag },
                    opacity: {
                      duration: durations.fast,
                      ease: easings.exit,
                      delay: lag,
                    },
                    y: {
                      duration: durations.fast,
                      ease: easings.exit,
                      delay: lag,
                    },
                  }
                : { duration: durations.fast },
            };
          },
        }}
        initial="arrive"
        animate="shown"
        exit="fold"
        transition={
          motionSafe
            ? {
                y: springs.snap,
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : { duration: durations.fast }
        }
      >
        {e.branch ? (
          <span className="flex items-center gap-1 text-[11px] leading-4 text-ink-3">
            <GitBranch aria-hidden className="size-3 shrink-0" />
            Because you said {e.branch}
          </span>
        ) : null}
        <Bubble
          id={promptId}
          armed={armed}
          motionSafe={motionSafe}
          className={cn("max-w-[86%] self-start", d.text, hostBubble(look))}
        >
          <span className="sr-only">{host} asks: </span>
          {e.q.prompt}
          {e.q.optional ? (
            <span className="ml-1.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
              optional
            </span>
          ) : null}
        </Bubble>
        <div className="relative flex justify-end">
          <AnimatePresence initial={false} mode="popLayout">
            {waiting ? (
              <motion.div
                key="composer"
                className="flex w-full justify-end"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                {kindOf(e.q) === "choice" ? (
                  <ChoiceComposer
                    q={e.q}
                    uid={uid}
                    promptId={promptId}
                    current={isEditing ? e.answer : undefined}
                    look={look}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    autoFocus={focusWanted === e.q.id}
                    onAnswer={(v) => commit(e.q, v)}
                    onKeep={() => keep(e.q)}
                  />
                ) : (
                  <TextComposer
                    q={e.q}
                    promptId={promptId}
                    current={isEditing ? e.answer : undefined}
                    look={look}
                    disabled={disabled}
                    autoFocus={focusWanted === e.q.id}
                    onAnswer={(v) => commit(e.q, v)}
                    onKeep={() => keep(e.q)}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`chip-${e.answer}`}
                className="flex max-w-[86%] items-center justify-end gap-2"
                initial={
                  kindOf(e.q) === "choice"
                    ? false
                    : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                {wasKept ? (
                  <motion.span
                    className="font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: durations.base, delay: 0.1 }}
                  >
                    kept
                  </motion.span>
                ) : null}
                <motion.button
                  layoutId={
                    kindOf(e.q) === "choice"
                      ? `${uid}-${e.q.id}-${e.answer ?? ""}`
                      : undefined
                  }
                  type="button"
                  onClick={() => rewind(e.q)}
                  aria-disabled={disabled || undefined}
                  aria-label={`Change ${e.q.short ?? e.q.prompt}: ${labelOf(e.q, e.answer ?? "")}`}
                  transition={{
                    layout: motionSafe ? springs.glide : { duration: 0 },
                  }}
                  className={cn(
                    "group/question-trail inline-flex max-w-full min-w-0 items-center gap-1.5 text-left transition-colors",
                    chipClass(look, e.answer === ""),
                    FOCUS,
                    disabled && "cursor-default",
                  )}
                >
                  {look.style === "plain" ? (
                    <CornerDownRight
                      aria-hidden
                      className="size-3.5 shrink-0"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">
                    {labelOf(e.q, e.answer ?? "")}
                  </span>
                  <Pencil
                    aria-hidden
                    className="size-3 shrink-0 opacity-0 transition-opacity group-hover/question-trail:opacity-70 group-focus-visible/question-trail:opacity-70"
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.li>
    );
  };

  const body =
    status === "loading" ? (
      <div aria-busy="true" className={cn("flex flex-col gap-3 py-4", d.px)}>
        <p className="sr-only">Loading the questions.</p>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2">
            <span className="h-9 w-3/4 rounded-3 bg-surface-2" />
            <span className="h-8 w-1/3 self-end rounded-full bg-surface-2/70" />
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The questions did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Your answers so far are kept. Try again in a moment.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <ol
        role="list"
        aria-label="Conversation"
        className={cn("flex flex-col pt-4", d.px)}
      >
        {restored ? (
          <li className={cn("flex justify-center", d.item)}>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              Picked up where you left off
            </span>
          </li>
        ) : null}
        <AnimatePresence initial={false} custom={fold}>
          {entries.slice(0, visible).map((e, i) => item(e, i))}
          {complete && visible > entries.length ? (
            <motion.li
              key="closing"
              custom={fold}
              className={cn("flex flex-col gap-2", d.item)}
              style={{ overflow: "clip" }}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                height: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              <p
                ref={closingNode}
                tabIndex={-1}
                className={cn(
                  "max-w-[86%] self-start outline-none",
                  d.text,
                  hostBubble(look),
                )}
              >
                <span className="sr-only">{host} says: </span>
                {closingText}
              </p>
              <span className="self-start font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                {answered} {answered === 1 ? "answer" : "answers"} · tap any to
                change it
              </span>
            </motion.li>
          ) : null}
          {typing ? (
            <motion.li
              key="typing"
              aria-hidden
              className={cn("flex", d.item)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{ duration: durations.fast }}
            >
              <Typing look={look} motionSafe={motionSafe} />
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ol>
    );

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "@container/question-trail flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        d.text,
        className,
      )}
      style={
        {
          height,
          "--qt-accent": accent,
          "--qt-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
          "--qt-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-hairline py-3",
          d.px,
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--qt-wash) font-mono text-[11px] font-medium text-(--qt-accent)"
        >
          {host
            .split(/\s+/)
            .map((w) => w[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">
            {host} · answers kept as you go
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          aria-disabled={disabled || status !== "ready" || undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] font-medium transition-colors",
            saved
              ? "border-(--qt-accent)/50 text-(--qt-accent)"
              : "border-input text-foreground hover:bg-surface-2",
            FOCUS,
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={saved ? "saved" : "save"}
              className="inline-flex"
              initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            >
              {saved ? (
                <BookmarkCheck aria-hidden className="size-3.5" />
              ) : (
                <Bookmark aria-hidden className="size-3.5" />
              )}
            </motion.span>
          </AnimatePresence>
          <span className="sr-only @min-[22rem]/question-trail:not-sr-only">
            {saved ? "Saved" : "Save for later"}
          </span>
        </button>
      </header>

      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-hairline py-2",
          d.px,
        )}
      >
        <span
          aria-hidden
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="absolute inset-0 rounded-full bg-(--qt-accent)"
            style={{ originX: 0 }}
            initial={false}
            animate={{ scaleX: Number(progress.toFixed(3)) }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
          {complete ? "Complete" : `${answered} of ${expected}`}
        </span>
      </div>

      <div
        ref={trailRef}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {body}
      </div>

      <footer
        className={cn(
          "flex shrink-0 items-center gap-2 border-t border-hairline py-2 text-[11px] leading-4 text-ink-3",
          d.px,
        )}
      >
        {editing ? (
          <span>Changing an earlier answer · Escape keeps it</span>
        ) : saved ? (
          <span>Saved · pick up where you left off any time</span>
        ) : (
          <span>Tap an answer to change it; later ones are kept.</span>
        )}
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
