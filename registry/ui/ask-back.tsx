"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  Check,
  FileText,
  RotateCcw,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type AskBackOption = {
  value: string;
  label: string;
  /** A short line under the label in the `tile` chip style. */
  detail?: string;
};

export type AskBackQuestion = {
  id: string;
  /** The question, as the assistant asks it. */
  prompt: string;
  /** The brief's label for the answer: one or two words. */
  short: string;
  /** Two to four choices. */
  options: AskBackOption[];
  /** The option value used when the question is skipped. */
  assumption: string;
  /** Why the assistant is asking, in a few words. */
  why?: string;
};

export type AskBackAnswer = {
  value: string;
  label: string;
  /** Answered on the stated assumption, by Skip or Write it now. */
  assumed?: boolean;
};

/** Question id → its settled answer. A missing id is an open question. */
export type AskBackAnswers = Record<string, AskBackAnswer>;

export type AskBackChipStyle = "pill" | "tile" | "line";
export type AskBackBriefPlacement = "dock" | "top" | "side";
export type AskBackStatus = "ready" | "loading" | "error";

export type AskBackProps = {
  /** The visitor's open request, at the top of the thread. @default "Draft the Q3 report for Basinworks." */
  request?: string;
  /** What the assistant needs to know first: two to four questions. @default defaultAskBackQuestions */
  questions?: AskBackQuestion[];
  /** Controlled answers. */
  value?: AskBackAnswers;
  /** Initial answers when uncontrolled. @default {} */
  defaultValue?: AskBackAnswers;
  /** Fires from the press, key, skip or reopen that changed the answers, with all of them. */
  onValueChange?: (answers: AskBackAnswers) => void;
  /** A question was answered by a chip or in the visitor's own words. */
  onAnswer?: (
    questionId: string,
    answer: AskBackAnswer,
    answers: AskBackAnswers,
  ) => void;
  /** A question was skipped and answered on its assumption. */
  onSkip?: (questionId: string, assumedValue: string) => void;
  /** Write it now: every open question was answered on its assumption. */
  onSkipAll?: (answers: AskBackAnswers) => void;
  /** A brief slot was pressed and its question reopened. */
  onBriefEdit?: (questionId: string) => void;
  /** Every question is settled; the answer starts to stream. */
  onComplete?: (answers: AskBackAnswers) => void;
  /** A follow-up was sent after the brief was complete. */
  onSend?: (text: string) => void;
  /** The real answer, streamed once the brief is complete. @default defaultAskBackAnswer */
  answer?: string | ((answers: AskBackAnswers) => string);
  /** How fast the answer streams, in words a second. @default 22 */
  streamRate?: number;
  /** Rounded chips, boxed tiles with a detail line, or underlined text options. @default "pill" */
  chipStyle?: AskBackChipStyle;
  /** Where the brief is pinned: above the composer, under the header, or in a side column on wide surfaces. @default "dock" */
  briefPlacement?: AskBackBriefPlacement;
  /** Chosen chips, the brief's stamp and the flight — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The model answering, shown in the header. @default "Fernworks Model 3" */
  model?: string;
  /** The surface's heading. @default "Q3 report" */
  title?: string;
  /** Whether the questions have arrived. @default "ready" */
  status?: AskBackStatus;
  /** "Try again" was pressed after the questions failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px; the thread scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be answered, skipped or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** A Basinworks quarterly report: who reads it, what it covers, what leads, how long. */
export const defaultAskBackQuestions: AskBackQuestion[] = [
  {
    id: "audience",
    prompt: "Who reads it first?",
    short: "Audience",
    why: "Sets the tone and how much detail to keep.",
    options: [
      { value: "board", label: "Board", detail: "Decisions and risk" },
      {
        value: "leadership",
        label: "Leadership team",
        detail: "Numbers and owners",
      },
      { value: "company", label: "Whole company", detail: "Plain, with wins" },
      { value: "investors", label: "Investors", detail: "Growth and outlook" },
    ],
    assumption: "leadership",
  },
  {
    id: "period",
    prompt: "Which period should it cover?",
    short: "Period",
    why: "Decides which numbers sit side by side.",
    options: [
      { value: "q3", label: "Q3 only", detail: "July to September" },
      { value: "qoq", label: "Q3 against Q2", detail: "With the change" },
      { value: "ytd", label: "Year to date", detail: "January to September" },
    ],
    assumption: "qoq",
  },
  {
    id: "lead",
    prompt: "What should it lead with?",
    short: "Lead with",
    why: "The first paragraph is the one that gets read.",
    options: [
      { value: "margin", label: "Margin", detail: "Operating margin" },
      { value: "revenue", label: "Revenue", detail: "Contracts and renewals" },
      { value: "volume", label: "Water treated", detail: "Litres and leakage" },
      { value: "outages", label: "Outages", detail: "Count and restore time" },
    ],
    assumption: "margin",
  },
  {
    id: "length",
    prompt: "How long should it be?",
    short: "Length",
    options: [
      { value: "page", label: "One page", detail: "Five short sections" },
      { value: "three", label: "Three pages", detail: "With the tables" },
      {
        value: "notes",
        label: "Speaker notes",
        detail: "For a ten-minute slot",
      },
    ],
    assumption: "page",
  },
];

const LEADS: Record<string, string> = {
  margin:
    "Operating margin reached 31.4% in Q3, up 2.2 points on Q2, as the Fernhill plant ran at full load for its first whole quarter.",
  revenue:
    "Revenue was $41.8M in Q3, 6% above Q2, with renewals across the eastern basin carrying most of the gain.",
  volume:
    "The network treated 214 billion litres in Q3, 4% more than Q2, while leakage fell to 11.2%.",
  outages:
    "Unplanned outages fell to three in Q3 from seven in Q2, and the average restore took 2 h 40 min.",
};

const PERIODS: Record<string, string> = {
  q3: "The rest of this report keeps to July, August and September.",
  qoq: "Each section sets Q3 beside Q2 and says what moved.",
  ytd: "Year to date, the network is 3% ahead of plan on volume and level on cost.",
};

const LENGTHS: Record<string, string> = {
  page: "On one page: summary, operations, customers, people, and what is next.",
  three:
    "Over three pages, with the plant tables and the renewal list attached.",
  notes: "As speaker notes, one beat a minute, ten in all.",
};

/** The report body, written to the brief. Invented numbers, steady wording. */
export const defaultAskBackAnswer = (answers: AskBackAnswers): string => {
  const lead = LEADS[answers.lead?.value ?? "margin"] ?? LEADS.margin ?? "";
  const period = PERIODS[answers.period?.value ?? "qoq"] ?? "";
  const length = LENGTHS[answers.length?.value ?? "page"] ?? "";
  const reader = answers.audience?.value ?? "leadership";
  const close =
    reader === "board"
      ? "Two decisions are asked of the board: the Fernhill second stage and the eastern tariff review."
      : reader === "investors"
        ? "Guidance for the year holds, with the second Fernhill stage funded from cash."
        : reader === "company"
          ? "Thank you to the night crews who brought the eastern mains back in record time."
          : "Owners for each open item are named at the end of every section.";
  return [lead, `${period} ${close}`, length].join("\n\n");
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Further than this from the floor and the thread counts as scrolled up. */
const FLOOR = 40;
/** When a flight hands over to its slot, and when it is gone, in ms. */
const LAND_MS = 400;
const FLIGHT_MS = 640;
const EMPTY: AskBackAnswers = {};

type Box = { x: number; y: number; w: number; h: number };

type Flight = {
  key: string;
  qid: string;
  label: string;
  assumed: boolean;
  from: Box;
  to: Box;
  /** Lands in the narrow badge: shrink and fade rather than settle into a slot. */
  badge: boolean;
  delay: number;
  /** The slot shows its value; the flight is fading out over it. */
  landed: boolean;
};

const boxOf = (el: Element, root: DOMRect): Box => {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left - root.left),
    y: Math.round(r.top - root.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
};

const shown = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.offsetWidth > 0 && el.offsetHeight > 0;

const WHITE = /^\s+$/;

/** The text up to and including its `n`th word, whitespace kept. */
function wordsUpTo(parts: string[], n: number): string {
  let seen = 0;
  let out = "";
  for (const part of parts) {
    if (WHITE.test(part)) {
      if (seen >= n) break;
      out += part;
    } else {
      if (seen >= n) break;
      out += part;
      seen += 1;
    }
  }
  return out;
}

/** A small count whose digit rolls up or down on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block leading-4"
          initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -8 : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A plain CSS pulse: it costs nothing while the stream waits off screen. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse rounded-full bg-(--ab-accent) motion-reduce:animate-none"
    />
  );
}

/** The "Complete" stamp: drops onto the brief on recoil, tilted like a hand stamp. */
function Stamp({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 inline-flex h-6 items-center gap-1 rounded-2 border-2 border-(--ab-accent) bg-card px-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-(--ab-accent) uppercase shadow-[0_2px_10px_color-mix(in_oklab,black_12%,transparent)]",
        className,
      )}
      initial={
        motionSafe
          ? { opacity: 0, scale: 1.5, rotate: -16 }
          : { opacity: 0, scale: 1, rotate: -8 }
      }
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.9 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={
        motionSafe
          ? {
              scale: springs.recoil,
              rotate: springs.recoil,
              opacity: { duration: durations.blink },
            }
          : { duration: durations.base }
      }
    >
      <Check aria-hidden className="size-3" strokeWidth={3} />
      Complete
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An assistant that asks before it answers. The visitor's open request opens
 * the thread; the assistant replies with two to four questions as chip sets,
 * and a brief pinned to the surface collects the answers. Settling a chip
 * lifts a copy of it off the chip and flies it into its brief slot — x and y
 * on `glide`, its box morphing to the slot — where the value cross-fades in
 * as it lands. When the last answer lands the brief is stamped Complete on
 * `recoil` and the real answer streams in under the questions.
 *
 * Each chip set is a radiogroup: arrow keys move the tentative pick, Enter or
 * Space settles it. Skip answers a question on its stated assumption, Write it
 * now answers every open one that way, and a brief slot reopens its question.
 * Backspace in an empty composer reopens the last settled question; typing
 * and Enter answers the open question in the visitor's own words. Under
 * reduced motion nothing flies or bounces: values cross-fade into the brief,
 * the stamp fades in at rest and the answer appears whole.
 */
export function AskBack({
  request = "Draft the Q3 report for Basinworks.",
  questions = defaultAskBackQuestions,
  value,
  defaultValue = EMPTY,
  onValueChange,
  onAnswer,
  onSkip,
  onSkipAll,
  onBriefEdit,
  onComplete,
  onSend,
  answer = defaultAskBackAnswer,
  streamRate = 22,
  chipStyle = "pill",
  briefPlacement = "dock",
  accent = "var(--accent-bright)",
  model = "Fernworks Model 3",
  title = "Q3 report",
  status = "ready",
  onRetry,
  height = 520,
  disabled = false,
  className,
}: AskBackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const briefListId = `${uid}-brief`;

  const [own, setOwn] = React.useState<AskBackAnswers>(defaultValue);
  const answers = value ?? own;
  const [order, setOrder] = React.useState<string[]>(() =>
    questions.filter((q) => defaultValue[q.id]).map((q) => q.id),
  );
  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [draft, setDraft] = React.useState("");
  const [followUps, setFollowUps] = React.useState<
    { id: string; text: string }[]
  >([]);
  const [briefOpen, setBriefOpen] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLOListElement | null>(null);
  const pinned = React.useRef(false);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const focusReq = React.useRef<string | null>(null);
  const landTimers = React.useRef(new Map<string, number>());
  const flightCount = React.useRef(0);
  const followCount = React.useRef(0);

  const ready = status === "ready";
  const live = ready && !disabled;
  const total = questions.length;
  const settled = questions.filter((q) => answers[q.id]).length;
  const flying = new Set(flights.filter((f) => !f.landed).map((f) => f.qid));
  const allSettled = total > 0 && settled === total;
  const complete = allSettled && flying.size === 0;
  const openQ = questions.find((q) => !answers[q.id]);

  /* ------------------------------- stream -------------------------------- */

  const body = React.useMemo(
    () =>
      allSettled
        ? typeof answer === "function"
          ? answer(answers)
          : answer
        : "",
    [allSettled, answer, answers],
  );
  const parts = React.useMemo(
    () => body.split(/(\s+)/).filter((p) => p.length > 0),
    [body],
  );
  const wordTotal = parts.filter((p) => !WHITE.test(p)).length;
  // A new brief starts a new answer: the stream resets in the render that
  // sees the brief change, never on a guessed frame afterwards.
  const streamKey = complete ? body : "";
  const [stream, setStream] = React.useState({ key: streamKey, n: 0 });
  if (stream.key !== streamKey) setStream({ key: streamKey, n: 0 });
  const streamedWords = !motionSafe ? wordTotal : Math.min(stream.n, wordTotal);
  const writing = complete && streamedWords < wordTotal;

  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  React.useEffect(() => {
    if (!complete || !motionSafe || wordTotal === 0) return;
    const node = rootRef.current;
    if (!node) return;
    const step = Math.max(1, Math.round(Math.max(1, streamRate) / 10));
    let n = 0;
    let seen = true;
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const tick = () => {
      n = Math.min(wordTotal, n + step);
      setStream({ key: streamKey, n });
      if (n >= wordTotal) {
        stop();
        say("Report written.");
      }
    };
    const sync = () => {
      stop();
      if (seen && !document.hidden && n < wordTotal) {
        timer = window.setInterval(tick, 100);
      }
    };
    // The stream only advances where it can be read.
    const io = new IntersectionObserver(([entry]) => {
      seen = !!entry?.isIntersecting;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [complete, motionSafe, streamKey, streamRate, wordTotal, say]);

  /* ------------------------------ scrolling ------------------------------ */

  const glideTo = React.useCallback(
    (top: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      scrollAnim.current?.stop();
      scrollAnim.current = null;
      const target = Math.round(
        Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight)),
      );
      if (!motionSafe || Math.abs(target - el.scrollTop) < 2) {
        el.scrollTop = target;
        return;
      }
      scrollAnim.current = animate(el.scrollTop, target, {
        ...springs.glide,
        onUpdate: (v) => {
          el.scrollTop = Math.round(v);
        },
        onComplete: () => {
          scrollAnim.current = null;
        },
      });
    },
    [motionSafe],
  );

  /** Brings a node inside the thread into view, scrolling only the thread. */
  const reveal = React.useCallback(
    (node: HTMLElement) => {
      const el = scrollerRef.current;
      if (!el || !el.contains(node)) return;
      const top =
        node.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop;
      const bottom = top + node.offsetHeight;
      if (top < el.scrollTop + 8) glideTo(top - 12);
      else if (bottom > el.scrollTop + el.clientHeight - 8)
        glideTo(bottom - el.clientHeight + 16);
    },
    [glideTo],
  );

  // The answer arriving is the reason the thread exists: glide down to it.
  React.useEffect(() => {
    if (!complete) return;
    const el = scrollerRef.current;
    if (!el) return;
    pinned.current = true;
    glideTo(el.scrollHeight);
  }, [complete, glideTo]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < FLOOR;
  };

  // A streaming answer keeps the floor in view while the reader is there.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!listNode || !el) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current && !scrollAnim.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(listNode);
    const cancel = () => {
      scrollAnim.current?.stop();
      scrollAnim.current = null;
    };
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchstart", cancel, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", cancel);
      el.removeEventListener("touchstart", cancel);
      cancel();
    };
  }, [listNode]);

  // Focus asked for by a handler lands once the render that made its target
  // has committed.
  React.useEffect(() => {
    const want = focusReq.current;
    if (!want) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-ab-focus="${CSS.escape(want)}"]`,
    );
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: true });
    reveal(node.closest<HTMLElement>("[data-ab-question]") ?? node);
  });

  React.useEffect(() => {
    const timers = landTimers.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      scrollAnim.current?.stop();
    };
  }, []);

  /* ------------------------------- actions ------------------------------- */

  const commit = (next: AskBackAnswers) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** Where an answer to `qid` lands: its visible brief slot, else the badge. */
  const targetFor = (
    qid: string,
  ): { el: HTMLElement; badge: boolean } | null => {
    const root = rootRef.current;
    if (!root) return null;
    for (const el of root.querySelectorAll<HTMLElement>(
      `[data-ab-slot-value="${CSS.escape(qid)}"]`,
    )) {
      if (shown(el)) return { el, badge: false };
    }
    for (const el of root.querySelectorAll<HTMLElement>("[data-ab-badge]")) {
      if (shown(el)) return { el, badge: true };
    }
    return null;
  };

  const land = (key: string) =>
    setFlights((list) =>
      list.some((f) => f.key === key && !f.landed)
        ? list.map((f) => (f.key === key ? { ...f, landed: true } : f))
        : list,
    );

  const drop = (key: string) => {
    landTimers.current.delete(`${key}:land`);
    landTimers.current.delete(`${key}:drop`);
    setFlights((list) => {
      const next = list.filter((f) => f.key !== key);
      return next.length === list.length ? list : next;
    });
  };

  const launch = (
    items: {
      qid: string;
      label: string;
      assumed: boolean;
      source: Box | null;
    }[],
  ) => {
    const root = rootRef.current;
    if (!motionSafe || !root) return;
    const rootBox = root.getBoundingClientRect();
    const step = cascade(items.length);
    const made: Flight[] = [];
    items.forEach((item, i) => {
      const target = targetFor(item.qid);
      if (!item.source || !target) return;
      flightCount.current += 1;
      const key = `f${flightCount.current}`;
      const to = boxOf(target.el, rootBox);
      made.push({
        key,
        qid: item.qid,
        label: item.label,
        assumed: item.assumed,
        from: item.source,
        to: target.badge
          ? {
              x: to.x + Math.round(to.w / 2) - 12,
              y: to.y + Math.round(to.h / 2) - 8,
              w: 24,
              h: 16,
            }
          : to,
        badge: target.badge,
        delay: Number((i * step).toFixed(3)),
        landed: false,
      });
      // The slot takes over while the glide is in its last stretch, so the
      // value cross-fades in under the arriving chip rather than after it.
      const start = i * step * 1000;
      landTimers.current.set(
        `${key}:land`,
        window.setTimeout(() => land(key), start + LAND_MS),
      );
      landTimers.current.set(
        `${key}:drop`,
        window.setTimeout(() => drop(key), start + FLIGHT_MS),
      );
    });
    if (made.length) setFlights((list) => [...list, ...made]);
  };

  const sourceBox = (el: Element | null): Box | null => {
    const root = rootRef.current;
    if (!root || !el) return null;
    return boxOf(el, root.getBoundingClientRect());
  };

  type Settle = {
    q: AskBackQuestion;
    answer: AskBackAnswer;
    source: Box | null;
  };

  const settleMany = (list: Settle[], via: "pick" | "skip" | "all") => {
    if (!live || list.length === 0) return;
    const next = { ...answers };
    for (const s of list) next[s.q.id] = s.answer;
    commit(next);
    setOrder((o) => [
      ...o.filter((id) => !list.some((s) => s.q.id === id)),
      ...list.map((s) => s.q.id),
    ]);
    setPicks((p) => {
      const copy = { ...p };
      for (const s of list) delete copy[s.q.id];
      return copy;
    });
    launch(
      list.map((s) => ({
        qid: s.q.id,
        label: s.answer.label,
        assumed: !!s.answer.assumed,
        source: s.source,
      })),
    );
    const count = questions.filter((q) => next[q.id]).length;
    const done = count === total;
    const first = list[0];
    const lead =
      via === "all"
        ? `${list.length} answered on assumptions.`
        : first
          ? `${first.q.short}: ${first.answer.label.replace(/[.!?]+$/, "")}${first.answer.assumed ? ", assumed" : ""}.`
          : "";
    say(
      `${lead} ${count} of ${total} settled.${done ? (motionSafe ? " Brief complete. Writing the report." : " Brief complete. Report written.") : ""}`,
    );
    for (const s of list) {
      if (via === "pick") onAnswer?.(s.q.id, s.answer, next);
      else if (via === "skip") onSkip?.(s.q.id, s.answer.value);
    }
    if (via === "all") onSkipAll?.(next);
    if (done) {
      pinned.current = true;
      onComplete?.(next);
    }
  };

  const choose = (
    q: AskBackQuestion,
    option: AskBackOption,
    el: HTMLElement | null,
  ) => {
    const current = answers[q.id];
    if (current && current.value === option.value && !current.assumed) return;
    settleMany(
      [
        {
          q,
          answer: { value: option.value, label: option.label },
          source: sourceBox(el),
        },
      ],
      "pick",
    );
  };

  const assumedOf = (q: AskBackQuestion): AskBackAnswer => {
    const option =
      q.options.find((o) => o.value === q.assumption) ?? q.options[0];
    return {
      value: option?.value ?? q.assumption,
      label: option?.label ?? q.assumption,
      assumed: true,
    };
  };

  const chipFor = (q: AskBackQuestion, optionValue: string) =>
    rootRef.current?.querySelector(
      `[data-ab-chip="${CSS.escape(`${q.id}:${optionValue}`)}"]`,
    ) ?? null;

  const skip = (q: AskBackQuestion) => {
    const a = assumedOf(q);
    settleMany(
      [{ q, answer: a, source: sourceBox(chipFor(q, a.value)) }],
      "skip",
    );
  };

  const skipAll = () => {
    const open = questions.filter((q) => !answers[q.id]);
    settleMany(
      open.map((q) => {
        const a = assumedOf(q);
        return { q, answer: a, source: sourceBox(chipFor(q, a.value)) };
      }),
      "all",
    );
  };

  const reopen = (qid: string, via: "brief" | "key") => {
    if (!live) return;
    const q = questions.find((x) => x.id === qid);
    const was = answers[qid];
    if (!q || !was) return;
    const next = { ...answers };
    delete next[qid];
    commit(next);
    setOrder((o) => o.filter((id) => id !== qid));
    setPicks((p) => ({ ...p, [qid]: was.value }));
    setFlights((list) => list.filter((f) => f.qid !== qid));
    setBriefOpen(false);
    focusReq.current = `chip:${qid}:${was.value}`;
    say(`Reopened: ${q.short}. ${settled - 1} of ${total} settled.`);
    if (via === "brief") onBriefEdit?.(qid);
  };

  const lastSettled = (): string | undefined => {
    const kept = order.filter((id) => answers[id]);
    return (
      kept[kept.length - 1] ??
      [...questions].reverse().find((q) => answers[q.id])?.id
    );
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !live) return;
    if (openQ) {
      const field = composerRef.current;
      const box = sourceBox(field);
      const source = box
        ? {
            x: box.x + 8,
            y: box.y + Math.max(0, Math.round((box.h - 28) / 2)),
            w: Math.min(box.w - 16, 220),
            h: 28,
          }
        : null;
      setDraft("");
      settleMany(
        [{ q: openQ, answer: { value: `own:${text}`, label: text }, source }],
        "pick",
      );
      return;
    }
    followCount.current += 1;
    setFollowUps((f) => [...f, { id: `u${followCount.current}`, text }]);
    setDraft("");
    pinned.current = true;
    say("Sent.");
    onSend?.(text);
  };

  /* ------------------------------- render -------------------------------- */

  const optionKeys = (
    event: React.KeyboardEvent<HTMLElement>,
    q: AskBackQuestion,
    index: number,
  ) => {
    const n = q.options.length;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = (index + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = (index - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to < 0) return;
    event.preventDefault();
    const option = q.options[to];
    if (!option) return;
    setPicks((p) => ({ ...p, [q.id]: option.value }));
    focusReq.current = `chip:${q.id}:${option.value}`;
  };

  const chipClass = (state: "answer" | "pick" | "rest", dim: boolean) => {
    if (chipStyle === "line") {
      return cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-1 px-1 text-[13px] underline decoration-1 underline-offset-[6px] transition-colors",
        state === "answer"
          ? "font-medium text-(--ab-accent) decoration-(--ab-accent) decoration-2"
          : state === "pick"
            ? "text-foreground decoration-(--ab-accent) decoration-dashed"
            : cn(
                "decoration-hairline-strong hover:text-foreground hover:decoration-ink-3",
                dim ? "text-ink-3" : "text-ink-2",
              ),
      );
    }
    if (chipStyle === "tile") {
      return cn(
        "flex w-full items-start gap-2 rounded-2 border px-2.5 py-2 text-left transition-colors",
        state === "answer"
          ? "border-(--ab-accent) bg-(--ab-wash)"
          : state === "pick"
            ? "border-dashed border-(--ab-accent) bg-surface-1"
            : cn(
                "border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
                dim && "opacity-60",
              ),
      );
    }
    return cn(
      "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
      state === "answer"
        ? "border-transparent bg-(--ab-solid) font-medium text-primary-foreground"
        : state === "pick"
          ? "border-dashed border-(--ab-accent) bg-(--ab-wash) text-foreground"
          : cn(
              "border-hairline-strong bg-surface-1 text-foreground hover:bg-surface-2",
              dim && "text-ink-3",
            ),
    );
  };

  const questionBlock = (q: AskBackQuestion, qi: number) => {
    const a = answers[q.id];
    const pick = picks[q.id];
    const checked = pick ?? a?.value;
    const promptId = `${uid}-q-${qi}`;
    const current = !a && openQ?.id === q.id;
    const ownWords = a && !q.options.some((o) => o.value === a.value);
    const tabbable =
      q.options.find((o) => o.value === checked)?.value ?? q.options[0]?.value;
    return (
      <motion.div
        key={q.id}
        data-ab-question={q.id}
        initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? {
                y: { ...springs.snap, delay: qi * cascade(total) },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: qi * cascade(total),
                },
              }
            : { duration: durations.fast }
        }
        className={cn(
          "rounded-3 border p-2.5 transition-colors @min-[30rem]/ask-back:p-3",
          current
            ? "border-(--ab-line) bg-surface-1"
            : "border-hairline bg-transparent",
        )}
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn(
              "mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold transition-colors",
              a
                ? "bg-(--ab-solid) text-primary-foreground"
                : current
                  ? "bg-(--ab-wash) text-(--ab-accent)"
                  : "bg-surface-2 text-ink-3",
            )}
          >
            {a ? <Check className="size-3" strokeWidth={3} /> : qi + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p
              id={promptId}
              className="text-[13px] font-medium text-foreground"
            >
              {q.prompt}
            </p>
            {q.why && !a ? (
              <p className="mt-0.5 text-[11px] leading-4 text-ink-3">{q.why}</p>
            ) : null}
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={promptId}
          aria-describedby={hintId}
          aria-disabled={!live || undefined}
          className={cn(
            "mt-2 @min-[26rem]/ask-back:pl-7",
            chipStyle === "tile"
              ? "grid grid-cols-1 gap-1.5 @min-[26rem]/ask-back:grid-cols-2"
              : chipStyle === "line"
                ? "flex flex-wrap gap-x-3 gap-y-1"
                : "flex flex-wrap gap-1.5",
          )}
        >
          {q.options.map((option, oi) => {
            const isAnswer = !!a && a.value === option.value && !pick;
            const isPick = pick === option.value;
            const state = isAnswer ? "answer" : isPick ? "pick" : "rest";
            return (
              <motion.button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked === option.value}
                aria-label={`${option.label}${isAnswer ? (a?.assumed ? ", assumed" : ", settled") : ""}`}
                tabIndex={option.value === tabbable ? 0 : -1}
                data-ab-chip={`${q.id}:${option.value}`}
                data-ab-focus={`chip:${q.id}:${option.value}`}
                aria-disabled={!live || undefined}
                onKeyDown={(e) => optionKeys(e, q, oi)}
                onClick={(e) => {
                  if (!live) return;
                  choose(q, option, e.currentTarget);
                  // A key press (no pointer behind the click) carries on to
                  // the next open question, so the keyboard path flows.
                  if (e.detail === 0) {
                    const next = questions.find(
                      (x) => x.id !== q.id && !answers[x.id],
                    );
                    const first = next?.options[0];
                    if (next && first) {
                      focusReq.current = `chip:${next.id}:${picks[next.id] ?? first.value}`;
                    }
                  }
                }}
                whileTap={motionSafe && live ? { scale: 0.96 } : undefined}
                transition={springs.flick}
                className={cn(
                  chipClass(state, !!a && !isAnswer),
                  a?.assumed && isAnswer && "border-dashed",
                  !live && "cursor-not-allowed",
                  FOCUS,
                )}
              >
                {chipStyle === "tile" ? (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                        isAnswer || isPick
                          ? "border-(--ab-accent)"
                          : "border-hairline-strong",
                      )}
                    >
                      {isAnswer || isPick ? (
                        <span className="size-1.5 rounded-full bg-(--ab-accent)" />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {option.label}
                      </span>
                      {option.detail ? (
                        <span className="truncate text-[11px] text-ink-3">
                          {option.detail}
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    {isAnswer && chipStyle === "line" ? (
                      <Check aria-hidden className="size-3.5 shrink-0" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                )}
              </motion.button>
            );
          })}
        </div>

        {a && !a.assumed && !ownWords ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 @min-[26rem]/ask-back:pl-7">
            {a ? (
              <span className="text-ink-3">
                {a.assumed ? `Assumed: ${a.label}` : `Your words: ${a.label}`}
                {" · pick one to change it"}
              </span>
            ) : (
              <button
                type="button"
                aria-disabled={!live || undefined}
                onClick={() => skip(q)}
                className={cn(
                  "inline-flex h-6 items-center rounded-1 text-ink-3 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-foreground",
                  FOCUS,
                )}
              >
                Skip · assume {assumedOf(q).label}
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  const slot = (q: AskBackQuestion, layout: "cell" | "row") => {
    const a = answers[q.id];
    const landed = !!a && !flying.has(q.id);
    return (
      <button
        key={q.id}
        type="button"
        aria-label={
          a
            ? `${q.short}: ${a.label}${a.assumed ? ", assumed" : ""}. Reopen`
            : `${q.short}: open`
        }
        aria-disabled={!a || !live || undefined}
        onClick={() => {
          if (a) reopen(q.id, "brief");
        }}
        className={cn(
          "flex min-w-0 flex-col items-start rounded-2 border px-2 py-1 text-left transition-colors",
          layout === "row" && "w-full",
          landed
            ? cn(
                "bg-card",
                a?.assumed
                  ? "border-dashed border-hairline-strong"
                  : "border-(--ab-line)",
              )
            : "border-hairline bg-transparent",
          a && live ? "hover:bg-surface-2" : "cursor-default",
          FOCUS,
        )}
      >
        <span className="flex h-3.5 w-full items-center gap-1 font-mono text-[10px] leading-3.5 tracking-[0.06em] text-ink-3 uppercase">
          <span className="truncate">{q.short}</span>
          {a?.assumed && landed ? (
            <span className="ml-auto shrink-0 normal-case">assumed</span>
          ) : null}
        </span>
        <span
          data-ab-slot-value={q.id}
          className="relative block h-5 w-full overflow-hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={landed ? `v:${a?.value}` : "empty"}
              className={cn(
                "absolute inset-0 truncate text-[13px] leading-5",
                landed
                  ? cn("text-foreground", a?.assumed && "text-ink-2 italic")
                  : "text-ink-3",
              )}
              title={landed ? a?.label : undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {landed ? a?.label : "—"}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
    );
  };

  const count = (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums transition-opacity",
        // The stamp lands on the count; the count steps aside under it.
        complete && "opacity-0",
      )}
    >
      <Rolling value={settled} motionSafe={motionSafe} />
      <span aria-hidden>of {total}</span>
      <span className="sr-only">{`${settled} of ${total} settled`}</span>
    </span>
  );

  /** The brief as a strip (or a narrow badge), for the dock and top placements. */
  const briefBar = (where: "dock" | "top", hideWide: boolean) => (
    <div
      className={cn(
        "relative shrink-0 px-3",
        where === "dock"
          ? "border-t border-hairline pt-2.5"
          : "border-b border-hairline py-2.5",
        hideWide && "@min-[40rem]/ask-back:hidden",
      )}
    >
      <div
        role="group"
        aria-label="Brief"
        className={cn(
          "relative hidden flex-col gap-1.5 rounded-3 border p-1.5 transition-colors @min-[26rem]/ask-back:flex @min-[34rem]/ask-back:flex-row",
          complete
            ? "border-(--ab-line) bg-(--ab-wash)"
            : "border-hairline bg-surface-1",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 px-1 pt-0.5 @min-[34rem]/ask-back:w-18 @min-[34rem]/ask-back:flex-col @min-[34rem]/ask-back:items-start @min-[34rem]/ask-back:justify-center @min-[34rem]/ask-back:gap-0.5 @min-[34rem]/ask-back:pt-0">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <FileText aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            Brief
          </span>
          <span className="ml-auto @min-[34rem]/ask-back:ml-0">{count}</span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5 @min-[34rem]/ask-back:grid-cols-[repeat(var(--ab-n),minmax(0,1fr))]">
          {questions.map((q) => slot(q, "cell"))}
        </div>
        <AnimatePresence initial={false}>
          {complete ? (
            <Stamp
              key="stamp"
              motionSafe={motionSafe}
              className="top-0.5 right-1 @min-[34rem]/ask-back:top-auto @min-[34rem]/ask-back:right-auto @min-[34rem]/ask-back:bottom-1.5 @min-[34rem]/ask-back:left-0.5"
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="relative flex items-center gap-2 @min-[26rem]/ask-back:hidden">
        <button
          type="button"
          data-ab-badge
          aria-expanded={briefOpen}
          aria-controls={briefListId}
          aria-label={`Brief, ${settled} of ${total} settled${complete ? ", complete" : ""}`}
          onClick={() => setBriefOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && briefOpen) {
              e.preventDefault();
              e.stopPropagation();
              setBriefOpen(false);
            }
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
            complete
              ? "border-transparent bg-(--ab-solid) text-primary-foreground"
              : "border-hairline-strong bg-surface-1 text-foreground hover:bg-surface-2",
            FOCUS,
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={complete ? "done" : "brief"}
              aria-hidden
              className="inline-flex"
              initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {complete ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <FileText className="size-3.5" />
              )}
            </motion.span>
          </AnimatePresence>
          <span aria-hidden>Brief</span>
          <span
            aria-hidden
            className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums"
          >
            <Rolling value={settled} motionSafe={motionSafe} />/{total}
          </span>
        </button>
        <span className="min-w-0 truncate text-[11px] text-ink-3">
          {complete
            ? "Complete · tap to change"
            : openQ
              ? `Next: ${openQ.short}`
              : "Landing…"}
        </span>
        <AnimatePresence>
          {briefOpen ? (
            <motion.div
              key="list"
              id={briefListId}
              role="group"
              aria-label="Brief"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setBriefOpen(false);
                  rootRef.current
                    ?.querySelector<HTMLElement>("[data-ab-badge]")
                    ?.focus();
                }
              }}
              initial={{
                opacity: 0,
                y: motionSafe
                  ? where === "dock"
                    ? distances.step
                    : -distances.step
                  : 0,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe
                  ? where === "dock"
                    ? distances.nudge
                    : -distances.nudge
                  : 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "absolute inset-x-0 z-20 flex flex-col gap-1.5 rounded-3 border border-hairline-strong bg-popover p-2 shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]",
                where === "dock" ? "bottom-full mb-2" : "top-full mt-2",
              )}
            >
              {questions.map((q) => slot(q, "row"))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  const sideColumn = (
    <aside
      role="group"
      aria-label="Brief"
      className={cn(
        "relative hidden w-52 shrink-0 flex-col gap-2 overflow-y-auto border-l border-hairline p-3 transition-colors @min-[40rem]/ask-back:flex",
        complete ? "bg-(--ab-wash)" : "bg-surface-0",
      )}
    >
      <div className="flex items-center gap-2">
        <FileText aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <span className="text-[12px] font-medium text-foreground">Brief</span>
        <span className="ml-auto">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {questions.map((q) => slot(q, "row"))}
      </div>
      <p className="mt-auto text-[11px] leading-4 text-ink-3">
        {complete
          ? "Every answer is in. Press one to change it."
          : "Answers land here as you settle them."}
      </p>
      <AnimatePresence initial={false}>
        {complete ? (
          <Stamp
            key="stamp"
            motionSafe={motionSafe}
            className="top-2 right-2"
          />
        ) : null}
      </AnimatePresence>
    </aside>
  );

  const reportHead = questions
    .map((q) => answers[q.id]?.label)
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  const thread =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-4 p-4">
        <p className="sr-only">Loading the questions.</p>
        <span
          aria-hidden
          className="h-9 w-3/5 self-end rounded-3 bg-surface-2"
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden
            className="flex flex-col gap-2 rounded-3 border border-hairline p-3"
          >
            <span className="h-4 w-1/2 rounded-1 bg-surface-2" />
            <div className="flex gap-1.5">
              <span className="h-8 w-20 rounded-full bg-surface-2" />
              <span className="h-8 w-28 rounded-full bg-surface-2" />
              <span className="h-8 w-16 rounded-full bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The questions did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Your request is kept. Try again in a moment.
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
        ref={setListNode}
        role="list"
        aria-label="Conversation"
        className="flex flex-col gap-4 px-3 pt-4 pb-6 @min-[30rem]/ask-back:px-4"
      >
        <li className="flex flex-col items-end gap-1">
          <span className="sr-only">You: </span>
          <p className="max-w-[86%] rounded-3 rounded-br-1 bg-(--ab-wash) px-3 py-2 text-[13px] leading-5 text-foreground">
            {request}
          </p>
        </li>

        <li className="flex flex-col gap-2.5">
          <span className="sr-only">{model}: </span>
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--ab-wash) text-[11px] font-semibold text-(--ab-accent)"
            >
              {model.charAt(0)}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="min-w-0 text-[13px] leading-5 text-foreground">
                Before I write it,{" "}
                {total === 1
                  ? "one quick question"
                  : `${total} quick questions`}{" "}
                so the report fits.
              </p>
              {openQ ? (
                <button
                  type="button"
                  aria-disabled={!live || undefined}
                  onClick={skipAll}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-full border border-hairline-strong px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  Write it now on assumptions
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 @min-[30rem]/ask-back:pl-8">
            {questions.map((q, i) => questionBlock(q, i))}
          </div>
        </li>

        <AnimatePresence initial={false}>
          {complete ? (
            <motion.li
              key="answer"
              className="flex flex-col gap-1.5"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              <span className="sr-only">{model}: </span>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--ab-wash) text-[11px] font-semibold text-(--ab-accent)"
                >
                  {model.charAt(0)}
                </span>
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {title}
                  {reportHead ? ` · ${reportHead}` : ""}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  {writing ? "Writing" : "Written"}
                </span>
              </div>
              <p
                aria-busy={writing || undefined}
                className="text-[13px] leading-6 whitespace-pre-line text-foreground @min-[30rem]/ask-back:pl-8"
              >
                {wordsUpTo(parts, streamedWords)}
                {writing ? <Caret /> : null}
              </p>
            </motion.li>
          ) : null}
        </AnimatePresence>

        {followUps.map((f) => (
          <li key={f.id} className="flex flex-col items-end">
            <span className="sr-only">You: </span>
            <p className="max-w-[86%] rounded-3 rounded-br-1 bg-(--ab-wash) px-3 py-2 text-[13px] leading-5 text-foreground">
              {f.text}
            </p>
          </li>
        ))}
      </ol>
    );

  const placeholder = !ready
    ? "Waiting for the questions"
    : openQ
      ? `Or type your own: ${openQ.short}`
      : writing
        ? "Writing the report…"
        : "Ask for changes";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={title}
      className={cn(
        "@container/ask-back relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--ab-accent": accent,
          "--ab-n": Math.max(1, total),
          "--ab-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
          "--ab-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
          "--ab-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[30rem]/ask-back:px-4">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--ab-wash) text-(--ab-accent)"
        >
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">
            {model} · asks before it answers
          </p>
        </div>
        <span className="hidden h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase @min-[22rem]/ask-back:inline-flex">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              complete ? "bg-(--ab-accent)" : "bg-signal",
            )}
          />
          {complete ? (writing ? "Writing" : "Answered") : "Clarifying"}
        </span>
      </header>

      {ready && briefPlacement === "top" ? briefBar("top", false) : <div />}

      <div className="flex overflow-hidden">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        >
          {thread}
        </div>
        {ready && briefPlacement === "side" ? sideColumn : null}
      </div>

      {ready && briefPlacement !== "top" ? (
        briefBar("dock", briefPlacement === "side")
      ) : (
        <div />
      )}

      <form
        className={cn(
          "flex items-end gap-2 p-3",
          briefPlacement === "top" && "border-t border-hairline",
          briefPlacement === "side" &&
            "@min-[40rem]/ask-back:border-t @min-[40rem]/ask-back:border-hairline",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="grid min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1">
          <textarea
            ref={composerRef}
            aria-label={
              openQ
                ? `Answer ${openQ.short} in your own words`
                : `Message ${model}`
            }
            aria-describedby={hintId}
            rows={1}
            value={draft}
            readOnly={!live}
            aria-disabled={!live || undefined}
            placeholder={placeholder}
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft(text);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              } else if (e.key === "Backspace" && draft.length === 0 && live) {
                const last = lastSettled();
                if (last) {
                  e.preventDefault();
                  reopen(last, "key");
                }
              }
            }}
            className={cn(
              "max-h-24 resize-none overflow-y-auto rounded-3 bg-transparent px-3 py-[7px] text-[13px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
              FOCUS_IN,
            )}
          />
          <span
            aria-hidden
            className="invisible max-h-24 overflow-hidden px-3 py-[7px] text-[13px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
          >
            {`${draft} `}
          </span>
        </div>
        <button
          type="submit"
          aria-label={openQ ? "Answer" : "Send"}
          aria-disabled={!live || !draft.trim() || undefined}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-(--ab-solid) text-primary-foreground transition-opacity aria-disabled:opacity-40",
            FOCUS,
          )}
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
      </form>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      >
        {flights.map((f) => (
          <motion.div
            key={f.key}
            className={cn(
              "absolute top-0 left-0 flex items-center overflow-hidden px-2 text-[13px] leading-5 font-medium whitespace-nowrap shadow-[0_8px_20px_color-mix(in_oklab,black_18%,transparent)]",
              chipStyle === "tile" ? "rounded-2" : "rounded-full",
              f.assumed
                ? "border border-dashed border-(--ab-accent) bg-card text-(--ab-accent)"
                : "bg-(--ab-solid) text-primary-foreground",
            )}
            initial={{
              x: f.from.x,
              y: f.from.y,
              width: f.from.w,
              height: f.from.h,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: f.to.x,
              y: f.to.y,
              width: f.to.w,
              height: f.to.h,
              opacity: [1, 1, 0],
              scale: [1, 1.06, 1],
            }}
            transition={{
              x: { ...springs.glide, delay: f.delay },
              y: { ...springs.glide, delay: f.delay },
              width: { ...springs.glide, delay: f.delay },
              height: { ...springs.glide, delay: f.delay },
              // The lift and the hand-over to the slot are tweens: a spring
              // takes exactly two keyframes.
              scale: {
                duration: 0.42,
                times: [0, 0.4, 1],
                ease: easings.move,
                delay: f.delay,
              },
              opacity: {
                duration: FLIGHT_MS / 1000,
                times: [0, LAND_MS / FLIGHT_MS, 1],
                ease: "linear",
                delay: f.delay,
              },
            }}
          >
            <span className="truncate">{f.label}</span>
          </motion.div>
        ))}
      </div>

      <p id={hintId} className="sr-only">
        Arrow keys move between choices, Enter settles one. Backspace in an
        empty message box reopens the last answer.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
