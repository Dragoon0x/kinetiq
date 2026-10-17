"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  CalendarDays,
  CornerDownLeft,
  FileText,
  Flag,
  Laptop,
  Link,
  Receipt,
  RotateCcw,
  Search,
  SearchX,
  Sparkles,
  TriangleAlert,
  User,
  X,
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

export type FallthroughAskAccent = "cobalt" | "plum" | "mint" | "ink";
export type FallthroughSourceStyle = "chips" | "list" | "notes";
export type AskIcon =
  "calendar" | "receipt" | "laptop" | "user" | "link" | "flag" | "page";

export type AskCommand = {
  id: string;
  label: string;
  icon: AskIcon;
  /** A key shown at the row's end. */
  shortcut?: string;
  /** Extra words it answers to. */
  keywords?: string[];
};

export type AskPage = {
  id: string;
  title: string;
  /** Where it lives: "People › Time off". */
  path: string;
  /** A line from it; also searched for related pages. */
  excerpt?: string;
  keywords?: string[];
};

export type AskAnswer = {
  id: string;
  /** Words or phrases that make this the answer (lowercase). */
  keywords: string[];
  /** The answer, with [1]-style marks pointing into `sources`. */
  text: string;
  /** Page ids it drew on, in mark order. */
  sources: string[];
};

export type FallthroughAskHandle = {
  /** Asks the assistant (the field's query, or this one). */
  ask: (query?: string) => void;
  /** Folds the answer back into its row. */
  fold: () => void;
  /** Puts focus in the field. */
  focus: () => void;
};

export type FallthroughAskProps = {
  ref?: React.Ref<FallthroughAskHandle>;
  /** Commands the palette runs. @default defaultAskCommands */
  commands?: AskCommand[];
  /** Pages it opens and the answers cite. @default defaultAskPages */
  pages?: AskPage[];
  /** Answers it can give without a host. @default defaultAskAnswers */
  answers?: AskAnswer[];
  /** Page ids listed for an empty query. @default ["leave", "expenses", "first-week"] */
  recent?: string[];
  /** Controlled query. */
  query?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultQuery?: string;
  /** Fires on every keystroke with the new query. */
  onQueryChange?: (query: string) => void;
  /** A command or page was chosen. */
  onSelect?: (item: { kind: "command" | "page"; id: string }) => void;
  /** The visitor asked. Return a promise of an answer (or null for none) to answer yourself; a rejection shows the error state. Otherwise the palette answers from `answers`. */
  onAsk?: (query: string) => Promise<AskAnswer | null> | void;
  /** A source page was opened from an answer. */
  onOpenSource?: (pageId: string, answerId: string | null) => void;
  /** The assistant settled: an answer, no answer, or an error. */
  onAnswer?: (
    state: "answered" | "none" | "error",
    answer: AskAnswer | null,
  ) => void;
  /** How long the palette reads before answering from `answers`, in ms. @default 1200 */
  thinkingMs?: number;
  /** The tallest the answer grows before it scrolls inside, in px. @default 200 */
  answerHeight?: number;
  /** How sources show: page chips, a numbered list, or footnote marks. @default "chips" */
  sourceStyle?: FallthroughSourceStyle;
  /** Highlight, ask disc and citations. A name or any CSS colour. @default "cobalt" */
  accent?: FallthroughAskAccent | (string & {});
  /** Who answers. @default "Handbook assistant" */
  assistantName?: string;
  /** The field's placeholder. @default "Search or ask the handbook" */
  placeholder?: string;
  /** The palette's tallest height, in px. @default 460 */
  maxHeight?: number;
  /** The field's accessible name. @default "Search the Fernworks handbook" */
  label?: string;
  /** Read only: nothing can be typed, chosen or asked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultAskCommands: AskCommand[] = [
  {
    id: "book-time-off",
    label: "Book time off",
    icon: "calendar",
    shortcut: "T",
    keywords: ["holiday", "leave", "vacation"],
  },
  {
    id: "new-expense",
    label: "New expense claim",
    icon: "receipt",
    shortcut: "E",
    keywords: ["receipt", "claim"],
  },
  { id: "request-equipment", label: "Request equipment", icon: "laptop" },
  { id: "open-profile", label: "Open my profile", icon: "user" },
  { id: "copy-link", label: "Copy page link", icon: "link" },
  { id: "report-problem", label: "Report a problem", icon: "flag" },
];

export const defaultAskPages: AskPage[] = [
  {
    id: "leave",
    title: "Leave and holidays",
    path: "People › Time off",
    excerpt: "25 days a year plus public holidays, booked through Time off.",
  },
  {
    id: "holiday-calendar",
    title: "Holiday calendar 2026",
    path: "People › Time off",
    excerpt: "Studio closures and the carry-over deadline.",
  },
  {
    id: "parental",
    title: "Parental leave",
    path: "People › Time off",
    excerpt: "Pay, timing and keeping in touch.",
  },
  {
    id: "expenses",
    title: "Expenses and travel",
    path: "Money › Expenses",
    excerpt: "Claim within 30 days with a receipt.",
  },
  {
    id: "client-trips",
    title: "Client trips",
    path: "Money › Expenses",
    excerpt: "Booking, client codes and rebilling.",
  },
  {
    id: "equipment",
    title: "Laptops and equipment",
    path: "Workplace › Equipment",
    excerpt: "A laptop on day one and a home-office budget.",
  },
  {
    id: "remote",
    title: "Working remotely",
    path: "Workplace",
    excerpt: "Core hours, travel days and the office.",
  },
  {
    id: "first-week",
    title: "Your first week",
    path: "Start here",
    excerpt: "Accounts, a buddy and your first project.",
  },
  {
    id: "security",
    title: "Security basics",
    path: "Workplace › Security",
    excerpt: "Passkeys, devices and reporting a lost laptop.",
  },
];

export const defaultAskAnswers: AskAnswer[] = [
  {
    id: "carry-over",
    keywords: ["carry", "roll over", "unused", "leftover", "left over"],
    text: "You can carry up to 5 unused days into next year [1]. They have to be taken by 31 March, or they lapse unless your lead agrees an exception in writing [2]. Days you carry over are used first, before the new year’s allowance [1]. If you are leaving, unused days are paid out with your final salary instead [1].",
    sources: ["leave", "holiday-calendar"],
  },
  {
    id: "client-travel",
    keywords: ["train", "travel", "ticket", "taxi", "mileage", "flight"],
    text: "Book standard class and claim it within 30 days with the receipt attached [1]. Add the client’s code so the trip can be rebilled [2]; first class needs a director’s sign-off [1]. Travel time outside your hours counts as working time, so log it on the trip [2].",
    sources: ["expenses", "client-trips"],
  },
  {
    id: "equipment",
    keywords: ["laptop", "monitor", "keyboard", "chair", "equipment", "desk"],
    text: "Everyone gets a laptop on day one and a home-office budget of 400 [1]. Order anything else through Request equipment; extras over the budget need your lead’s approval [2]. Laptops are replaced every three years, or sooner if one fails [1].",
    sources: ["equipment", "remote"],
  },
  {
    id: "parental",
    keywords: ["parental", "maternity", "paternity", "baby", "adoption"],
    text: "Primary carers get 26 weeks at full pay and second carers 8 weeks [1]. Tell People Ops 15 weeks before the due date so cover can be planned [1].",
    sources: ["parental"],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ICONS: Record<AskIcon, typeof FileText> = {
  calendar: CalendarDays,
  receipt: Receipt,
  laptop: Laptop,
  user: User,
  link: Link,
  flag: Flag,
  page: FileText,
};

const ACCENTS: Record<FallthroughAskAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** A module constant, so the default never changes identity between renders. */
const DEFAULT_RECENT = ["leave", "expenses", "first-week"];

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "is",
  "are",
  "can",
  "do",
  "does",
  "how",
  "what",
  "when",
  "where",
  "who",
  "why",
  "many",
  "much",
  "my",
  "i",
  "we",
  "our",
  "with",
  "over",
  "into",
  "from",
]);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A substring scores best; otherwise the letters in order, close together. */
const fuzzy = (label: string, query: string) => {
  const l = label.toLowerCase();
  const q = norm(query);
  if (!q) return null;
  const at = l.indexOf(q);
  if (at >= 0) {
    const hits: number[] = [];
    for (let i = at; i < at + q.length; i++) hits.push(i);
    return { score: 200 - at + (at === 0 || l[at - 1] === " " ? 40 : 0), hits };
  }
  const q2 = q.replace(/ /g, "");
  let i = 0;
  let first = -1;
  let last = -1;
  let score = 0;
  const hits: number[] = [];
  for (let j = 0; j < l.length && i < q2.length; j++) {
    if (l[j] !== q2[i]) continue;
    if (first < 0) first = j;
    score += (last === j - 1 ? 6 : 1) + (j === 0 || l[j - 1] === " " ? 4 : 0);
    hits.push(j);
    last = j;
    i++;
  }
  if (i < q2.length) return null;
  if (last - first + 1 > q2.length * 2.2 + 2) return null;
  return { score, hits };
};

const keywordHit = (keywords: string[] | undefined, query: string) => {
  const q = norm(query);
  return q.length >= 3 && (keywords ?? []).some((k) => k.startsWith(q));
};

const wordsOf = (query: string) =>
  norm(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

const resolveLocal = (answers: AskAnswer[], query: string) => {
  const q = ` ${norm(query)} `;
  let best: AskAnswer | null = null;
  let top = 0;
  for (const a of answers) {
    const s = a.keywords.filter((k) => q.includes(k)).length;
    if (s > top) {
      top = s;
      best = a;
    }
  }
  return best;
};

/** "[1]" marks split out of a sentence, so they can be drawn as chips;
 * the space before a mark goes, so it sits against its word. */
const splitMarks = (sentence: string) =>
  sentence
    .replace(/\s+(\[\d+\])/g, "$1")
    .split(/(\[\d+\])/g)
    .filter((part) => part.length > 0);

const sentencesOf = (text: string) =>
  text
    .match(/[^.!?]+(?:\[\d+\])?[.!?]+(?:\s|$)|[^.!?]+$/g)
    ?.map((s) => s.trim()) ?? [text];

const plainText = (text: string) => text.replace(/\s*\[\d+\]/g, "");

type AskState = "thinking" | "answered" | "none" | "error";

type Option =
  | { kind: "command"; id: string; item: AskCommand; hits: number[] }
  | { kind: "page"; id: string; item: AskPage; hits: number[] };

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>;
  const set = new Set(hits);
  const parts: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);
    const prev = parts[parts.length - 1];
    if (prev && prev.on === on) prev.s += text[i];
    else parts.push({ s: text[i] ?? "", on });
  }
  return (
    <>
      {parts.map((p, i) =>
        p.on ? (
          <span key={i} className="font-semibold text-foreground">
            {p.s}
          </span>
        ) : (
          <React.Fragment key={i}>{p.s}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * A command palette that never dead-ends. Typing filters commands and pages
 * with fuzzy matching and a highlight pill that slides between rows on
 * `snap`; every query ends with an ask row, and a query that matches nothing
 * turns the empty row into it. Enter unfolds the ask row in place on
 * `glide` into an answer card: while it reads, the pages it is reading
 * arrive one by one on `snap`; the answer then rises sentence by sentence
 * with its citation marks, and the sources settle into `sourceStyle`.
 *
 * Results and the answer stay one arrow apart — the field is a combobox and
 * the ask row is an option whose answer it describes — Tab walks the
 * sources, and Escape folds the answer, keeping the typed query. No answer
 * and error states keep it too, and each still offers a next step. Under
 * 30rem the answer takes the whole palette while it holds the highlight.
 */
export function FallthroughAsk({
  ref,
  commands = defaultAskCommands,
  pages = defaultAskPages,
  answers = defaultAskAnswers,
  recent = DEFAULT_RECENT,
  query: queryProp,
  defaultQuery = "",
  onQueryChange,
  onSelect,
  onAsk,
  onOpenSource,
  onAnswer,
  thinkingMs = 1200,
  answerHeight = 200,
  sourceStyle = "chips",
  accent = "cobalt",
  assistantName = "Handbook assistant",
  placeholder = "Search or ask the handbook",
  maxHeight = 460,
  label = "Search the Fernworks handbook",
  disabled = false,
  className,
}: FallthroughAskProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-results`;
  const askListId = `${uid}-ask`;
  const askOptId = `${uid}-ask-opt`;
  const answerTextId = `${uid}-answer`;
  const hintId = `${uid}-hint`;

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const query = queryProp ?? ownQuery;
  const q = norm(query);

  /* ------------------------------- results ------------------------------- */

  const { options, matched, related } = React.useMemo(() => {
    if (!q) {
      const rec = recent
        .map((id) => pages.find((p) => p.id === id))
        .filter((p): p is AskPage => !!p)
        .map<Option>((p) => ({ kind: "page", id: p.id, item: p, hits: [] }));
      const cmds = commands.map<Option>((c) => ({
        kind: "command",
        id: c.id,
        item: c,
        hits: [],
      }));
      return {
        options: [...rec, ...cmds],
        matched: [...rec, ...cmds],
        related: false,
      };
    }
    const cmd = commands
      .map((c) => {
        const f = fuzzy(c.label, q);
        if (f)
          return {
            o: { kind: "command" as const, id: c.id, item: c, hits: f.hits },
            s: f.score,
          };
        if (keywordHit(c.keywords, q))
          return {
            o: { kind: "command" as const, id: c.id, item: c, hits: [] },
            s: 10,
          };
        return null;
      })
      .filter((x) => x !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.o as Option);
    const pg = pages
      .map((p) => {
        const f = fuzzy(p.title, q);
        if (f)
          return {
            o: { kind: "page" as const, id: p.id, item: p, hits: f.hits },
            s: f.score,
          };
        if (keywordHit(p.keywords, q))
          return {
            o: { kind: "page" as const, id: p.id, item: p, hits: [] },
            s: 10,
          };
        return null;
      })
      .filter((x) => x !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.o as Option);
    if (cmd.length + pg.length > 0)
      return {
        options: [...cmd, ...pg],
        matched: [...cmd, ...pg],
        related: false,
      };
    // Nothing matches: pages that share a word stay one arrow away.
    const words = wordsOf(q);
    const rel = pages
      .filter((p) => {
        const hay =
          `${p.title} ${p.excerpt ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase();
        return words.some((w) => hay.includes(w));
      })
      .slice(0, 3)
      .map<Option>((p) => ({ kind: "page", id: p.id, item: p, hits: [] }));
    return { options: rel, matched: [] as Option[], related: true };
  }, [q, commands, pages, recent]);

  const noMatch = !!q && matched.length === 0;
  const hasAsk = !!q;
  // One order of stops for the arrows: the ask row leads when nothing
  // matched, and trails the results when something did.
  const stops: string[] = hasAsk
    ? noMatch
      ? ["ask", ...options.map((o) => `${o.kind}:${o.id}`)]
      : [...options.map((o) => `${o.kind}:${o.id}`), "ask"]
    : options.map((o) => `${o.kind}:${o.id}`);

  const [active, setActive] = React.useState<string | null>(null);
  const [seenQ, setSeenQ] = React.useState(q);
  // A new query puts the highlight on its first stop: the ask row when
  // nothing matched, the best result otherwise.
  if (seenQ !== q) {
    setSeenQ(q);
    setActive(stops[0] ?? null);
  }
  const current =
    active && stops.includes(active) ? active : (stops[0] ?? null);

  /* --------------------------------- ask --------------------------------- */

  const [expanded, setExpanded] = React.useState(false);
  const [askState, setAskState] = React.useState<AskState>("thinking");
  const [answer, setAnswer] = React.useState<AskAnswer | null>(null);
  const [asked, setAsked] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");
  const token = React.useRef(0);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const settle = (t: number, next: AskAnswer | null, failed = false) => {
    if (t !== token.current) return;
    if (failed) {
      setAskState("error");
      setAnnouncement(
        "Couldn’t reach the assistant. Your question is still in the field.",
      );
      onAnswer?.("error", null);
      return;
    }
    setAnswer(next);
    setAskState(next ? "answered" : "none");
    onAnswer?.(next ? "answered" : "none", next);
    setAnnouncement(
      next
        ? `Answer: ${plainText(next.text)}`
        : "The handbook doesn’t cover this yet.",
    );
  };

  const ask = (text?: string) => {
    if (disabled) return;
    const asking = norm(text ?? query);
    if (!asking) return;
    if (text !== undefined && text !== query) {
      if (queryProp === undefined) setOwnQuery(text);
      onQueryChange?.(text);
      setSeenQ(norm(text));
    }
    window.clearTimeout(timer.current);
    const t = ++token.current;
    setAsked(asking);
    setExpanded(true);
    setActive("ask");
    setAskState("thinking");
    setAnswer(resolveLocal(answers, asking));
    setAnnouncement(`Asking ${assistantName}.`);
    const result = onAsk?.(asking);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<AskAnswer | null>).then(
        (a) => settle(t, a ?? null),
        () => settle(t, null, true),
      );
    } else {
      timer.current = window.setTimeout(
        () => settle(t, resolveLocal(answers, asking)),
        Math.max(0, thinkingMs),
      );
    }
  };

  const fold = () => {
    if (!expanded) return;
    window.clearTimeout(timer.current);
    token.current++;
    setExpanded(false);
    setAnnouncement("Answer folded.");
  };

  /* -------------------------------- typing ------------------------------- */

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const setQuery = (text: string) => {
    if (queryProp === undefined) setOwnQuery(text);
    onQueryChange?.(text);
    // An answer belongs to the question it answered.
    if (expanded) {
      window.clearTimeout(timer.current);
      token.current++;
      setExpanded(false);
    }
  };

  const choose = (stop: string) => {
    if (disabled) return;
    if (stop === "ask") {
      if (expanded && norm(asked) === q) fold();
      else ask();
      return;
    }
    const [kind, id] = stop.split(":") as ["command" | "page", string];
    onSelect?.({ kind, id });
    const name =
      kind === "command"
        ? commands.find((c) => c.id === id)?.label
        : pages.find((p) => p.id === id)?.title;
    setAnnouncement(`${name ?? "Item"} opened.`);
  };

  const reveal = (stop: string) => {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(
      `[data-fa-stop="${CSS.escape(stop)}"]`,
    );
    if (!body || !el) return;
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < b.top + 4) body.scrollTop -= b.top + 4 - r.top;
    else if (r.bottom > b.bottom - 4)
      body.scrollTop += r.bottom - (b.bottom - 4);
  };

  const move = (delta: number) => {
    if (stops.length === 0) return;
    const i = current ? stops.indexOf(current) : -1;
    const next = stops[Math.min(stops.length - 1, Math.max(0, i + delta))];
    if (!next) return;
    setActive(next);
    window.requestAnimationFrame(() => reveal(next));
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      if (stops[0]) setActive(stops[0]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (current) choose(current);
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        fold();
      } else if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      }
    }
  };

  React.useImperativeHandle(ref, () => ({
    ask: (text) => ask(text),
    fold: () => fold(),
    focus: () => inputRef.current?.focus({ preventScroll: true }),
  }));

  /* --------------------------- measured height --------------------------- */

  const [contentEl, setContentEl] = React.useState<HTMLDivElement | null>(null);
  const [contentH, setContentH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!contentEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const h =
        entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect.height ?? 0;
      setContentH(Math.round(h));
    });
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [contentEl]);

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as FallthroughAskAccent]
    : accent;
  const answerFocus = expanded && current === "ask";
  const sourcePages = (answer?.sources ?? [])
    .map((id) => pages.find((p) => p.id === id))
    .filter((p): p is AskPage => !!p);
  const reading = answer
    ? sourcePages
    : options
        .slice(0, 2)
        .map((o) => (o.kind === "page" ? o.item : null))
        .filter((p): p is AskPage => !!p);
  const closest =
    (options.find((o) => o.kind === "page")?.item as AskPage | undefined) ??
    pages.find((p) => p.id === recent[0]);
  const bodyMax = Math.max(120, maxHeight - 48 - 36);

  const optionRow = (o: Option) => {
    const stop = `${o.kind}:${o.id}`;
    const on = current === stop;
    const Icon =
      o.kind === "command" ? (ICONS[o.item.icon] ?? FileText) : FileText;
    return (
      <div
        key={stop}
        id={`${uid}-${stop}`}
        role="option"
        aria-selected={on}
        data-fa-stop={stop}
        onPointerMove={() => {
          if (!on) setActive(stop);
        }}
        onClick={() => choose(stop)}
        className="relative flex h-10 cursor-pointer items-center gap-3 rounded-2 px-2.5 select-none"
      >
        {on ? (
          <motion.span
            layoutId={`${uid}-pill`}
            aria-hidden
            className="absolute inset-0 rounded-2 bg-[var(--fa-wash)]"
            transition={{ layout: motionSafe ? springs.snap : { duration: 0 } }}
          />
        ) : null}
        <span
          aria-hidden
          className={cn(
            "relative inline-flex size-7 shrink-0 items-center justify-center rounded-2",
            on ? "bg-card text-[var(--fa-ink)]" : "bg-surface-2 text-ink-2",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="relative flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-[13.5px] text-ink-2">
            <Highlighted
              text={o.kind === "command" ? o.item.label : o.item.title}
              hits={o.hits}
            />
          </span>
          {o.kind === "page" ? (
            <span className="hidden truncate text-[11.5px] text-ink-3 @[26rem]:inline">
              {o.item.path}
            </span>
          ) : null}
        </span>
        {o.kind === "command" && o.item.shortcut ? (
          <kbd className="relative hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3 @[22rem]:inline-flex">
            {o.item.shortcut}
          </kbd>
        ) : null}
        {on ? (
          <CornerDownLeft
            aria-hidden
            className="relative size-3.5 shrink-0 text-ink-3"
          />
        ) : null}
      </div>
    );
  };

  const groups = (() => {
    if (options.length === 0) return null;
    if (!q) {
      const rec = options.filter((o) => o.kind === "page");
      const cmd = options.filter((o) => o.kind === "command");
      return [
        { label: "Recent", items: rec },
        { label: "Commands", items: cmd },
      ];
    }
    if (related) return [{ label: "Related pages", items: options }];
    return [
      { label: "Commands", items: options.filter((o) => o.kind === "command") },
      { label: "Pages", items: options.filter((o) => o.kind === "page") },
    ];
  })();

  const results = groups ? (
    <div
      role="listbox"
      id={listId}
      aria-label="Results"
      className={cn(
        "flex flex-col gap-0.5",
        // Under 30rem the answer has the palette while it holds the highlight.
        answerFocus && "@max-[30rem]:hidden",
      )}
    >
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div
            key={g.label}
            role="group"
            aria-labelledby={`${uid}-g-${g.label}`}
          >
            <p
              id={`${uid}-g-${g.label}`}
              role="presentation"
              className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {g.label}
            </p>
            {g.items.map(optionRow)}
          </div>
        ))}
    </div>
  ) : null;

  const askOn = current === "ask";
  const sentences = answer ? sentencesOf(answer.text) : [];
  const step = cascade(Math.max(2, sentences.length + sourcePages.length));

  const sourceButtons =
    askState === "answered" && answer && sourcePages.length > 0 ? (
      sourceStyle === "list" ? (
        <ol className="flex flex-col gap-1" aria-label="Sources">
          {sourcePages.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                opacity: {
                  duration: durations.base,
                  delay: (sentences.length + i) * step,
                },
                y: { ...springs.snap, delay: (sentences.length + i) * step },
              }}
            >
              <button
                type="button"
                onClick={() => onOpenSource?.(p.id, answer.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2 border border-hairline bg-card px-2.5 py-1.5 text-left hover:border-[var(--fa-ink)]",
                  FOCUS,
                )}
              >
                <span className="font-mono text-[10px] text-[var(--fa-ink)] tabular-nums">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-medium">
                    {p.title}
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {p.path}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink-3"
                />
              </button>
            </motion.li>
          ))}
        </ol>
      ) : sourceStyle === "notes" ? (
        <motion.p
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11.5px] text-ink-3"
          aria-label="Sources"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: durations.base,
            delay: sentences.length * step,
          }}
        >
          {sourcePages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenSource?.(p.id, answer.id)}
              className={cn(
                "inline-flex items-baseline gap-1 rounded-1 underline decoration-hairline-strong underline-offset-2 hover:text-foreground hover:decoration-[var(--fa-ink)]",
                FOCUS,
              )}
            >
              <span className="font-mono text-[10px] text-[var(--fa-ink)]">
                {i + 1}
              </span>
              {p.title}
            </button>
          ))}
        </motion.p>
      ) : (
        <div
          className="flex flex-wrap gap-1.5"
          aria-label="Sources"
          role="group"
        >
          {sourcePages.map((p, i) => (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => onOpenSource?.(p.id, answer.id)}
              initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: {
                  duration: durations.base,
                  delay: (sentences.length + i) * step,
                },
                scale: {
                  ...springs.snap,
                  delay: (sentences.length + i) * step,
                },
              }}
              className={cn(
                "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-card pr-2.5 pl-1.5 text-[12px] hover:border-[var(--fa-ink)]",
                FOCUS,
              )}
            >
              <span className="inline-flex size-4.5 items-center justify-center rounded-full bg-[var(--fa-wash)] font-mono text-[9.5px] text-[var(--fa-ink)]">
                {i + 1}
              </span>
              <span className="truncate">{p.title}</span>
            </motion.button>
          ))}
        </div>
      )
    ) : null;

  const askBlock = hasAsk ? (
    <div
      key="ask"
      className={cn(
        "rounded-3 border transition-[background-color,border-color] duration-200",
        expanded
          ? "my-1 border-[color-mix(in_oklab,var(--fa-ink)_30%,transparent)] bg-[color-mix(in_oklab,var(--fa-ink)_7%,var(--popover))]"
          : "border-transparent",
      )}
    >
      <div role="listbox" id={askListId} aria-label="Ask">
        <div
          id={askOptId}
          role="option"
          aria-selected={askOn}
          aria-label={
            expanded
              ? `${assistantName}, answer to “${asked}”${
                  askState === "thinking"
                    ? ", reading"
                    : askState === "none"
                      ? ", no answer"
                      : askState === "error"
                        ? ", couldn’t answer"
                        : ""
                }. Escape folds it.`
              : `Ask the handbook about “${q}”`
          }
          aria-describedby={expanded ? answerTextId : undefined}
          data-fa-stop="ask"
          onPointerMove={() => {
            if (!askOn) setActive("ask");
          }}
          onClick={() => choose("ask")}
          className="relative flex h-11 cursor-pointer items-center gap-3 rounded-3 px-2.5 select-none"
        >
          {askOn && !expanded ? (
            <motion.span
              layoutId={`${uid}-pill`}
              aria-hidden
              className="absolute inset-0 rounded-3 bg-[var(--fa-wash)]"
              transition={{
                layout: motionSafe ? springs.snap : { duration: 0 },
              }}
            />
          ) : null}
          <motion.span
            aria-hidden
            className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--fa-ink)] text-background"
            initial={false}
            animate={{ rotate: expanded && motionSafe ? 180 : 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <Sparkles className="size-3.5" />
          </motion.span>
          <span className="relative flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-medium text-foreground">
              {expanded ? assistantName : "Ask the handbook"}
            </span>
            <span className="truncate text-[12px] text-ink-3">
              {`“${expanded ? asked : q}”`}
            </span>
          </span>
          <span className="relative shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            {expanded
              ? askState === "thinking"
                ? "Reading"
                : askState === "answered"
                  ? "esc folds"
                  : askState === "none"
                    ? "No answer"
                    : "Offline"
              : askOn
                ? "↵ Ask"
                : ""}
          </span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="card"
            className={cn(
              "overflow-hidden",
              !answerFocus && "@max-[30rem]:hidden",
            )}
            initial={{ height: 0, opacity: motionSafe ? 1 : 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: motionSafe
                ? springs.glide
                : { duration: durations.fast },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                fold();
                inputRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            <div
              className="flex flex-col gap-3 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-14px),transparent)] px-3 pt-1 pb-3"
              style={{ maxHeight: Math.max(100, answerHeight) }}
            >
              {askState === "thinking" ? (
                <div className="flex flex-col gap-2.5" aria-busy="true">
                  <div className="flex flex-col gap-1.5">
                    {[92, 78, 54].map((w, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={cn(
                          "h-2.5 rounded-full bg-[color-mix(in_oklab,var(--fa-ink)_16%,var(--color-surface-2))]",
                          motionSafe && "animate-pulse",
                        )}
                        style={{
                          width: `${w}%`,
                          animationDelay: `${i * 140}ms`,
                        }}
                      />
                    ))}
                  </div>
                  {reading.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-ink-3">Reading</span>
                      {reading.map((p, i) => (
                        <motion.span
                          key={p.id}
                          className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-hairline bg-card px-2 text-[11.5px] text-ink-2"
                          initial={{
                            opacity: 0,
                            y: motionSafe ? distances.nudge : 0,
                          }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            opacity: {
                              duration: durations.base,
                              delay: 0.15 + i * 0.22,
                            },
                            y: { ...springs.snap, delay: 0.15 + i * 0.22 },
                          }}
                        >
                          <FileText aria-hidden className="size-3 shrink-0" />
                          <span className="truncate">{p.title}</span>
                        </motion.span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : askState === "answered" && answer ? (
                <>
                  <p
                    id={answerTextId}
                    className="text-[13.5px] leading-relaxed text-foreground"
                  >
                    {sentences.map((s, i) => (
                      <motion.span
                        key={i}
                        className="inline"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: durations.slow,
                          ease: easings.enter,
                          delay: i * step,
                        }}
                      >
                        {splitMarks(s).map((part, j) => {
                          const m = part.match(/^\[(\d+)\]$/);
                          if (!m)
                            return (
                              <React.Fragment key={j}>{part}</React.Fragment>
                            );
                          return (
                            <motion.sup
                              key={j}
                              className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--fa-wash)] px-1 align-[0.45em] font-mono text-[9px] leading-none text-[var(--fa-ink)]"
                              initial={{
                                scale: motionSafe ? 0.4 : 1,
                                opacity: 0,
                              }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{
                                scale: {
                                  ...springs.flick,
                                  delay: i * step + 0.12,
                                },
                                opacity: {
                                  duration: durations.fast,
                                  delay: i * step + 0.12,
                                },
                              }}
                            >
                              <span aria-hidden>{m[1]}</span>
                              <span className="sr-only">{` source ${m[1]}`}</span>
                            </motion.sup>
                          );
                        })}
                        {i < sentences.length - 1 ? " " : ""}
                      </motion.span>
                    ))}
                  </p>
                  {sourceButtons}
                </>
              ) : askState === "none" ? (
                <div
                  id={answerTextId}
                  className="flex flex-col items-start gap-2"
                >
                  <p className="text-[13.5px] leading-relaxed text-foreground">
                    The handbook doesn’t cover this yet.
                  </p>
                  {closest ? (
                    <button
                      type="button"
                      onClick={() => onOpenSource?.(closest.id, null)}
                      className={cn(
                        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 text-[12px] hover:border-[var(--fa-ink)]",
                        FOCUS,
                      )}
                    >
                      <span className="text-ink-3">Closest:</span>
                      <span className="truncate">{closest.title}</span>
                      <ArrowUpRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-ink-3"
                      />
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  id={answerTextId}
                  className="flex flex-col items-start gap-2"
                >
                  <p className="inline-flex items-center gap-2 text-[13.5px] text-foreground">
                    <TriangleAlert
                      aria-hidden
                      className="size-4 shrink-0 text-danger"
                    />
                    Couldn’t reach the assistant.
                  </p>
                  <p className="text-[12px] text-ink-3">
                    Your question is still in the field.
                  </p>
                  <button
                    type="button"
                    onClick={() => ask(asked)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] text-ink-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Retry
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline-strong bg-popover text-foreground",
        // The field has no ring of its own: the palette wears it.
        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
        "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--foreground)_38%,transparent),0_2px_8px_color-mix(in_oklab,var(--foreground)_8%,transparent)]",
        className,
      )}
      style={
        {
          maxHeight,
          "--fa-ink": accentInk,
          "--fa-wash": "color-mix(in oklab, var(--fa-ink) 13%, transparent)",
        } as React.CSSProperties
      }
    >
      <p id={hintId} className="sr-only">
        Up and Down move through the results and the ask row, Enter opens or
        asks, Tab reaches an answer’s sources, Escape folds the answer.
      </p>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-3.5">
        <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={stops.length > 0}
          aria-controls={hasAsk ? `${listId} ${askListId}` : listId}
          aria-activedescendant={
            current
              ? current === "ask"
                ? askOptId
                : `${uid}-${current}`
              : undefined
          }
          aria-autocomplete="list"
          aria-describedby={hintId}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const text = event.currentTarget.value;
            setQuery(text);
          }}
          onKeyDown={onInputKey}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-ink-3"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear"
            // Escape clears from the keyboard; Tab goes on to the sources.
            tabIndex={-1}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus({ preventScroll: true });
            }}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : (
          <kbd className="inline-flex h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3">
            esc
          </kbd>
        )}
      </div>

      <motion.div
        ref={bodyRef}
        className="overflow-x-hidden overflow-y-auto overscroll-contain"
        initial={false}
        animate={{
          height: contentH === null ? "auto" : Math.min(contentH, bodyMax),
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        style={{ maxHeight: bodyMax }}
      >
        <div ref={setContentEl} className="flex flex-col p-1.5">
          {noMatch ? (
            <>
              <motion.p
                key="none"
                className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base }}
              >
                <SearchX aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{`Nothing matches “${q}”`}</span>
              </motion.p>
              {askBlock}
              {results}
            </>
          ) : (
            <>
              {results}
              {askBlock}
            </>
          )}
        </div>
      </motion.div>

      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-hairline px-3.5 font-mono text-[10px] tracking-[0.04em] text-ink-3">
        <span className="truncate">
          <span className="hidden @[24rem]:inline">↑↓ move · ↵ open · </span>
          esc {expanded ? "folds" : "clears"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Sparkles aria-hidden className="size-3 text-[var(--fa-ink)]" />
          <span className="hidden truncate @[18rem]:inline">
            {assistantName}
          </span>
        </span>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
