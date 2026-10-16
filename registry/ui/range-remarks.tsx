"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronRight,
  FileCode,
  History,
  Lightbulb,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type RangeDiffLine = {
  kind: "context" | "add" | "del";
  text: string;
  /** Line number before the change. Counted from the top when omitted. */
  old?: number;
  /** Line number after the change. Counted from the top when omitted. */
  new?: number;
};

export type RangeDiff = {
  /** The file's path, shown in the header. */
  path: string;
  lines: RangeDiffLine[];
};

export type RangeComment = {
  id: string;
  author: string;
  /** When it was posted, in ms since the epoch. */
  at: number;
  text: string;
};

export type RangeThread = {
  id: string;
  /** First line of the range, an index into `diff.lines`. */
  start: number;
  /** Last line of the range, an index into `diff.lines`. */
  end: number;
  comments: RangeComment[];
  resolved?: boolean;
  /** The lines changed after the comment was made. */
  outdated?: boolean;
  /** Replacement text for the range, one string with line breaks. */
  suggestion?: string;
};

export type RangeSelection = { start: number; end: number };
export type RangeBracketStyle = "bracket" | "bar" | "brace";
export type RangeDensity = "compact" | "regular" | "roomy";
export type RangeEditorTheme = "plain" | "paper" | "night";
export type RangeStatus = "ready" | "loading" | "error";

export type RangeRemarksProps = {
  /** The file under review. @default defaultRangeDiff */
  diff?: RangeDiff;
  /** Controlled threads. */
  threads?: RangeThread[];
  /** Initial threads when uncontrolled. @default defaultRangeThreads */
  defaultThreads?: RangeThread[];
  /** Fires with every thread after a comment, a reply or a resolve. */
  onThreadsChange?: (threads: RangeThread[]) => void;
  /** Controlled range of lines, or null. */
  selection?: RangeSelection | null;
  /** Initial range when uncontrolled. @default null */
  defaultSelection?: RangeSelection | null;
  /** Fires from the drag or key that changed the range. */
  onSelectionChange?: (selection: RangeSelection | null) => void;
  /** A comment was posted on a range (a new thread, or a reply when `threadId` is given). */
  onComment?: (range: RangeSelection, text: string, threadId?: string) => void;
  /** A suggested change was posted on a range. */
  onSuggest?: (range: RangeSelection, suggestion: string, text: string) => void;
  /** A thread was resolved (true) or reopened (false). */
  onResolve?: (threadId: string, resolved: boolean) => void;
  /** A square bracket with caps, a solid bar, or a curly brace pointing at the range's middle. @default "bracket" */
  bracketStyle?: RangeBracketStyle;
  /** Line height (18/20/24px) and code type. @default "regular" */
  density?: RangeDensity;
  /** The page's own surfaces, a warm paper tint, or a dark editor in either theme. @default "plain" */
  editorTheme?: RangeEditorTheme;
  /** Wrap long lines: below a 30rem container, always, or never. @default "auto" */
  wrap?: "auto" | "always" | "never";
  /** The name new comments are posted under. @default "Noor Haddad" */
  author?: string;
  /** The moment relative times count from (Date or ms). @default defaultRangeNow */
  now?: number | Date;
  /** Whether the diff has arrived. @default "ready" */
  status?: RangeStatus;
  /** "Try again" was pressed after the diff failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the diff scrolls inside it. @default 540 */
  height?: number;
  /** Read only: threads can be read, nothing posted or resolved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultRangeNow = Date.UTC(2026, 9, 14, 13, 10);
const N = defaultRangeNow;

const SOURCE: [RangeDiffLine["kind"], string][] = [
  ["context", 'import { sleep } from "./sleep";'],
  ["context", ""],
  ["del", "const BASE_MS = 1000;"],
  ["add", "const BASE_MS = 500;"],
  ["add", "const CAP_MS = 30_000;"],
  ["context", ""],
  ["context", "export function delay(attempt: number, rand: () => number) {"],
  ["del", "  return BASE_MS * 2 ** attempt;"],
  ["add", "  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** attempt);"],
  ["add", "  return Math.round(rand() * ceiling);"],
  ["context", "}"],
  ["context", ""],
  ["context", "export async function withRetry<T>("],
  ["context", "  task: () => Promise<T>,"],
  ["del", "  attempts = 5,"],
  ["add", "  attempts = 6,"],
  ["context", "): Promise<T> {"],
  ["context", "  for (let attempt = 0; ; attempt += 1) {"],
  ["context", "    try {"],
  ["context", "      return await task();"],
  ["context", "    } catch (error) {"],
  ["add", "      if (!isRetryable(error)) throw error;"],
  ["context", "      if (attempt + 1 >= attempts) throw error;"],
  ["context", "      await sleep(delay(attempt, Math.random));"],
  ["context", "    }"],
  ["context", "  }"],
  ["context", "}"],
];

/** Fieldline's retry helper, pull request #418: jittered, capped backoff. */
export const defaultRangeDiff: RangeDiff = {
  path: "fieldline/uploader/src/retry/backoff.ts",
  lines: SOURCE.map(([kind, text]) => ({ kind, text })),
};

export const defaultRangeThreads: RangeThread[] = [
  {
    id: "rt1",
    start: 8,
    end: 9,
    comments: [
      {
        id: "rt1a",
        author: "Ines Marlow",
        at: N - 3 * 60 * MIN,
        text: "Full jitter can return 0 ms. Floor it at half the ceiling?",
      },
      {
        id: "rt1b",
        author: "Tomas Brandt",
        at: N - 2 * 60 * MIN,
        text: "Equal jitter spreads a little less, but nothing fires instantly. I'm for it.",
      },
    ],
    suggestion:
      "  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** attempt);\n  return Math.round(ceiling / 2 + rand() * (ceiling / 2));",
  },
  {
    id: "rt2",
    start: 3,
    end: 4,
    resolved: true,
    comments: [
      {
        id: "rt2a",
        author: "Priya Raman",
        at: N - 26 * 60 * MIN,
        text: "Name the cap after the upload timeout so the two move together.",
      },
      {
        id: "rt2b",
        author: "Noor Haddad",
        at: N - 25 * 60 * MIN,
        text: "Done in the next commit.",
      },
    ],
  },
  {
    id: "rt3",
    start: 14,
    end: 15,
    outdated: true,
    comments: [
      {
        id: "rt3a",
        author: "Kenji Ito",
        at: N - 50 * MIN,
        text: "Six attempts at a 30 s cap is over two minutes of waiting. Intended?",
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  RangeDensity,
  { line: number; code: string; text: string }
> = {
  compact: { line: 18, code: "11.5px", text: "text-[12px] leading-[18px]" },
  regular: { line: 20, code: "12px", text: "text-[13px] leading-5" },
  roomy: { line: 24, code: "13px", text: "text-[13px] leading-[22px]" },
};

/** Each editor theme is a set of variables the diff reads; night is dark in both page themes. */
const THEME: Record<RangeEditorTheme, Record<string, string>> = {
  plain: {
    "--rr-bg": "var(--card)",
    "--rr-gutter": "var(--bg-0)",
    "--rr-fg": "var(--ink)",
    "--rr-num": "var(--ink-3)",
    "--rr-kw": "var(--accent-bright)",
    "--rr-str": "var(--signal)",
    "--rr-lit": "var(--warn)",
    "--rr-com": "var(--ink-3)",
    "--rr-add": "color-mix(in oklab, var(--success) 13%, transparent)",
    "--rr-del": "color-mix(in oklab, var(--danger) 12%, transparent)",
    "--rr-line": "var(--hairline)",
  },
  paper: {
    "--rr-bg": "color-mix(in oklab, var(--card) 91%, var(--warn))",
    "--rr-gutter": "color-mix(in oklab, var(--card) 84%, var(--warn))",
    "--rr-fg": "var(--ink)",
    "--rr-num": "color-mix(in oklab, var(--ink-3) 80%, var(--warn))",
    "--rr-kw": "color-mix(in oklab, var(--accent-bright) 70%, var(--danger))",
    "--rr-str": "color-mix(in oklab, var(--signal) 75%, var(--ink))",
    "--rr-lit": "color-mix(in oklab, var(--warn) 80%, var(--ink))",
    "--rr-com": "var(--ink-3)",
    "--rr-add": "color-mix(in oklab, var(--success) 14%, transparent)",
    "--rr-del": "color-mix(in oklab, var(--danger) 12%, transparent)",
    "--rr-line": "color-mix(in oklab, var(--warn) 22%, transparent)",
  },
  // Night is the accent's hue at fixed lightness, so it is the same dark
  // editor on a light page and a dark one.
  night: {
    "--rr-bg": "oklch(from var(--accent-bright) 0.2 0.014 h)",
    "--rr-gutter": "oklch(from var(--accent-bright) 0.175 0.014 h)",
    "--rr-fg": "oklch(from var(--accent-bright) 0.93 0.008 h)",
    "--rr-num": "oklch(from var(--accent-bright) 0.6 0.02 h)",
    "--rr-kw": "oklch(from var(--accent-bright) 0.76 0.12 h)",
    "--rr-str": "oklch(from var(--signal) 0.8 0.1 h)",
    "--rr-lit": "oklch(from var(--warn) 0.83 0.11 h)",
    "--rr-com": "oklch(from var(--accent-bright) 0.6 0.02 h)",
    "--rr-add": "oklch(from var(--success) 0.62 0.12 h / 0.2)",
    "--rr-del": "oklch(from var(--danger) 0.6 0.16 h / 0.18)",
    "--rr-line": "oklch(from var(--accent-bright) 1 0 h / 0.08)",
  },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const KEYWORDS = new Set(
  "const let var function return if else await async import from export for while new true false null undefined throw try catch type interface extends of in".split(
    " ",
  ),
);

/** Enough colour to read code by: comments, strings, numbers, keywords. */
function tint(code: string): React.ReactNode[] {
  const re =
    /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of code.matchAll(re)) {
    const at = m.index ?? 0;
    const whole = m[0];
    if (at > last) out.push(code.slice(last, at));
    if (m[1]) {
      out.push(
        <span key={k++} className="text-(--rr-com) italic">
          {whole}
        </span>,
      );
    } else if (m[2]) {
      out.push(
        <span key={k++} className="text-(--rr-str)">
          {whole}
        </span>,
      );
    } else if (m[3]) {
      out.push(
        <span key={k++} className="text-(--rr-lit)">
          {whole}
        </span>,
      );
    } else if (m[4] && KEYWORDS.has(whole)) {
      out.push(
        <span key={k++} className="text-(--rr-kw)">
          {whole}
        </span>,
      );
    } else out.push(whole);
    last = at + whole.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** The bracket's path in its 16px gutter strip, from y `t` to y `b`. */
function bracketPath(style: RangeBracketStyle, t: number, b: number): string {
  const top = r1(Math.min(t, b) + 2);
  const bottom = r1(Math.max(t, b) - 2);
  const span = Math.max(4, bottom - top);
  if (style === "bar") return `M8 ${top + 1} V ${r1(top + span - 1)}`;
  if (style === "brace") {
    const m = r1(top + span / 2);
    const k = r1(Math.min(5, span / 4));
    return `M12 ${top} Q8 ${top} 8 ${r1(top + k)} V ${r1(m - k)} Q8 ${m} 4 ${m} Q8 ${m} 8 ${r1(m + k)} V ${r1(bottom - k)} Q8 ${bottom} 12 ${bottom}`;
  }
  return `M12 ${top} H 7 V ${bottom} H 12`;
}

type Geo = {
  tops: number[];
  bottoms: number[];
  gutter: number;
  height: number;
};

/** Fills in old and new line numbers, counted from the top, where a line has none. */
function numberLines(source: RangeDiffLine[]): RangeDiffLine[] {
  const out: RangeDiffLine[] = [];
  let o = 0;
  let n = 0;
  for (const line of source) {
    if (line.kind !== "add") o += 1;
    if (line.kind !== "del") n += 1;
    out.push({
      ...line,
      old: line.kind === "add" ? undefined : (line.old ?? o),
      new: line.kind === "del" ? undefined : (line.new ?? n),
    });
  }
  return out;
}

function Avatar({ name, you }: { name: string; you: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-semibold",
        you
          ? "bg-cobalt-wash text-cobalt-bright"
          : "bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** A textarea that grows with its text, using an invisible twin to size the cell. */
function Composer({
  focusKey,
  label,
  placeholder,
  value,
  mono,
  onChange,
  onSubmit,
  onCancel,
}: {
  focusKey: string;
  label: string;
  placeholder: string;
  value: string;
  mono?: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const text = mono
    ? "font-mono text-[12px] leading-5 whitespace-pre"
    : "text-[13px] leading-5";
  return (
    <div className="grid rounded-2 border border-hairline-strong bg-card">
      <textarea
        data-rr-focus={focusKey}
        aria-label={label}
        rows={1}
        value={value}
        placeholder={placeholder}
        spellCheck={!mono}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Ours: the box closes, and nothing behind it.
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          "max-h-40 resize-none overflow-auto rounded-2 bg-transparent px-2.5 py-1.5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
          text,
          FOCUS_RING,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "invisible max-h-40 overflow-hidden px-2.5 py-1.5 break-words [grid-area:1/1]",
          mono ? text : `${text} whitespace-pre-wrap`,
        )}
      >
        {`${value} `}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The diff                                 */
/* ----------------------------------------------------------------------- */

type Draft = {
  range: RangeSelection;
  text: string;
  suggest: boolean;
  suggestion: string;
};

/**
 * A code review diff where comments cover ranges of lines. Pressing in the
 * comment gutter and dragging grows a bracket across the lines you mean: its
 * live end is under the pointer 1:1, the covered lines tint as it passes
 * them, and on release the end settles onto the last line's edge on snap
 * with the throw's velocity. Letting go unfolds a comment box under the
 * range's last line — its measured height opens on glide while it swings
 * down from its top edge on the same spring — with a "Suggest change" mode
 * that starts from the range's own text.
 *
 * Existing threads sit after their last line with their bracket in the
 * gutter, brightening with their lines while the thread is hovered or
 * focused; resolved and outdated threads fold to a one-line summary on
 * glide. The diff is a `role="grid"` with one roving line: Up and Down move,
 * Shift with an arrow grows the same bracket a line at a time, Enter or C
 * opens the box, Escape clears. Long lines wrap below a 30rem container.
 * Under reduced motion brackets and boxes appear at rest; ranges, tints and
 * counts still change.
 */
export function RangeRemarks({
  diff = defaultRangeDiff,
  threads,
  defaultThreads,
  onThreadsChange,
  selection,
  defaultSelection = null,
  onSelectionChange,
  onComment,
  onSuggest,
  onResolve,
  bracketStyle = "bracket",
  density = "regular",
  editorTheme = "plain",
  wrap = "auto",
  author = "Noor Haddad",
  now = defaultRangeNow,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: RangeRemarksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const dens = DENSITY[density] ?? DENSITY.regular;
  const lineH = dens.line;

  /* ------------------------------- lines -------------------------------- */

  const lines = React.useMemo(() => numberLines(diff.lines), [diff.lines]);
  const last = Math.max(0, lines.length - 1);
  const adds = lines.filter((l) => l.kind === "add").length;
  const dels = lines.filter((l) => l.kind === "del").length;
  const numberOf = (i: number) => {
    const l = lines[i];
    return l ? (l.new ?? l.old ?? i + 1) : i + 1;
  };
  const rangeLabel = (r: RangeSelection) => {
    const a = numberOf(Math.min(r.start, r.end));
    const b = numberOf(Math.max(r.start, r.end));
    return a === b ? `line ${a}` : `lines ${a}–${b}`;
  };

  /* ------------------------------- state -------------------------------- */

  const [ownThreads, setOwnThreads] = React.useState<RangeThread[]>(
    () => defaultThreads ?? defaultRangeThreads,
  );
  const list = threads ?? ownThreads;
  const [ownSel, setOwnSel] = React.useState<RangeSelection | null>(
    defaultSelection,
  );
  const sel = selection !== undefined ? selection : ownSel;
  const [cursor, setCursor] = React.useState(() => sel?.end ?? 0);
  const [anchor, setAnchor] = React.useState<number | null>(sel?.start ?? null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(
        (defaultThreads ?? threads ?? defaultRangeThreads)
          .filter((t) => !t.resolved && !t.outdated)
          .map((t) => t.id),
      ),
  );
  const [hot, setHot] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [dragging, setDragging] = React.useState(false);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [viewW, setViewW] = React.useState(0);
  const [fadeRight, setFadeRight] = React.useState(false);
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const counter = React.useRef(0);
  const dragInfo = React.useRef<{ anchor: number; down: boolean } | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);

  const bTop = useMotionValue(0);
  const bBottom = useMotionValue(0);
  const liveBracket = useTransform(
    [bTop, bBottom] as MotionValue<number>[],
    ([t = 0, b = 0]: number[]) =>
      Math.abs(b - t) < 1 ? "" : bracketPath(bracketStyle, t, b),
  );

  const range = sel
    ? { start: Math.min(sel.start, sel.end), end: Math.max(sel.start, sel.end) }
    : null;
  const openCount = list.filter((t) => !t.resolved).length;

  /* ------------------------------ geometry ------------------------------ */

  // Every line row's top and bottom inside the scroll content, read after
  // layout and whenever the content changes size (wrapping, a box opening).
  const measure = React.useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const rows = content.querySelectorAll<HTMLElement>("[data-rr-line]");
    const tops: number[] = [];
    const bottoms: number[] = [];
    rows.forEach((row) => {
      const i = Number(row.dataset.rrLine);
      tops[i] = row.offsetTop;
      bottoms[i] = row.offsetTop + row.offsetHeight;
    });
    const gutterCell = content.querySelector<HTMLElement>("[data-rr-gutter]");
    const gutter = gutterCell ? gutterCell.offsetLeft : 72;
    const next: Geo = { tops, bottoms, gutter, height: content.offsetHeight };
    setGeo((g) =>
      g &&
      g.gutter === next.gutter &&
      g.height === next.height &&
      g.tops.length === tops.length &&
      g.tops.every((v, i) => v === tops[i] && g.bottoms[i] === bottoms[i])
        ? g
        : next,
    );
    const scroller = scrollRef.current;
    if (scroller) {
      setViewW(scroller.clientWidth);
      setFadeRight(
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1,
      );
    }
  }, []);

  React.useLayoutEffect(() => {
    measure();
  });

  React.useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(content);
    if (scroller) ro.observe(scroller);
    return () => ro.disconnect();
  }, [measure, status]);

  React.useEffect(() => {
    const list = runs;
    return () => {
      for (const c of list.current) c.stop();
      scrollRun.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-rr-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    }
    const scroller = scrollRef.current;
    if (!scroller) return;
    // Bring it into view inside the diff, never the page.
    const sr = scroller.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    let top = scroller.scrollTop;
    if (nr.top < sr.top + 4) top -= sr.top + 4 - nr.top;
    else if (nr.bottom > sr.bottom - 4) top += nr.bottom - (sr.bottom - 4);
    top = Math.max(0, Math.round(top));
    if (top === scroller.scrollTop) return;
    scrollRun.current?.stop();
    if (!motionSafe) {
      scroller.scrollTop = top;
      return;
    }
    scrollRun.current = animate(scroller.scrollTop, top, {
      ...springs.glide,
      onUpdate: (v) => {
        scroller.scrollTop = Math.round(v);
      },
    });
  }, [focusAsk, motionSafe]);

  /** Where the live bracket should rest for a range. */
  const restFor = (r: RangeSelection | null) => {
    if (!r || !geo) return null;
    const a = Math.min(r.start, r.end);
    const b = Math.max(r.start, r.end);
    const top = geo.tops[a];
    const bottom = geo.bottoms[b];
    return top === undefined || bottom === undefined ? null : { top, bottom };
  };

  // The live bracket follows the range: settled on snap, or set at once.
  const restKey =
    range && geo
      ? `${range.start}:${range.end}:${geo.tops[range.start]}:${geo.bottoms[range.end]}`
      : "";
  React.useEffect(() => {
    if (dragging) return;
    const rest = restFor(range);
    if (!rest) {
      bTop.jump(0);
      bBottom.jump(0);
      return;
    }
    for (const c of runs.current) c.stop();
    if (!motionSafe || (bTop.get() === 0 && bBottom.get() === 0)) {
      bTop.jump(rest.top);
      bBottom.jump(rest.bottom);
      runs.current = [];
      return;
    }
    runs.current = [
      animate(bTop, rest.top, springs.snap),
      animate(bBottom, rest.bottom, springs.snap),
    ];
    // The rest key carries the range and its measured edges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restKey, dragging, motionSafe]);

  /* ------------------------------- actions ------------------------------ */

  const writeThreads = (next: RangeThread[]) => {
    if (threads === undefined) setOwnThreads(next);
    onThreadsChange?.(next);
  };

  const setSelection = (next: RangeSelection | null) => {
    if (selection === undefined) setOwnSel(next);
    onSelectionChange?.(next);
  };

  const newId = (kind: string) => {
    const taken = new Set([
      ...list.map((t) => t.id),
      ...list.flatMap((t) => t.comments.map((c) => c.id)),
    ]);
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-${kind}${counter.current}`;
    } while (taken.has(id));
    return id;
  };

  const openBox = (r: RangeSelection) => {
    if (locked) return;
    const norm = {
      start: Math.min(r.start, r.end),
      end: Math.max(r.start, r.end),
    };
    setDraft((d) => ({
      range: norm,
      text: d?.text ?? "",
      suggest: false,
      suggestion: "",
    }));
    ask("draft");
    say(`Comment on ${rangeLabel(norm)}.`);
  };

  const closeBox = (refocus = true) => {
    const at = draft?.range.end ?? cursor;
    setDraft(null);
    if (refocus) ask(`line:${at}`);
  };

  const post = () => {
    if (!draft || locked) return;
    const text = draft.text.trim();
    const suggestion = draft.suggest
      ? draft.suggestion.replace(/\s+$/, "")
      : "";
    if (!text && !suggestion) {
      say("Write a comment or a suggestion first.");
      return;
    }
    const thread: RangeThread = {
      id: newId("thread"),
      start: draft.range.start,
      end: draft.range.end,
      comments: [
        {
          id: newId("c"),
          author,
          at: nowMs,
          text: text || "Suggested change.",
        },
      ],
      ...(suggestion ? { suggestion } : {}),
    };
    writeThreads([...list, thread]);
    setExpanded((e) => new Set(e).add(thread.id));
    setFresh((f) => new Set(f).add(thread.id));
    setDraft(null);
    setSelection(null);
    setAnchor(null);
    ask(`thread:${thread.id}`);
    say(
      `${suggestion ? "Suggestion" : "Comment"} posted on ${rangeLabel(draft.range)}.`,
    );
    if (suggestion) onSuggest?.(draft.range, suggestion, text);
    else onComment?.(draft.range, text);
  };

  const reply = (thread: RangeThread) => {
    if (locked) return;
    const text = (replies[thread.id] ?? "").trim();
    if (!text) return;
    const comment: RangeComment = { id: newId("c"), author, at: nowMs, text };
    writeThreads(
      list.map((t) =>
        t.id === thread.id ? { ...t, comments: [...t.comments, comment] } : t,
      ),
    );
    setReplies((r) => ({ ...r, [thread.id]: "" }));
    setFresh((f) => new Set(f).add(comment.id));
    say(`Reply posted on ${rangeLabel(thread)}.`);
    onComment?.({ start: thread.start, end: thread.end }, text, thread.id);
  };

  const toggleResolved = (thread: RangeThread) => {
    if (locked) return;
    const next = !thread.resolved;
    writeThreads(
      list.map((t) => (t.id === thread.id ? { ...t, resolved: next } : t)),
    );
    setExpanded((e) => {
      const n = new Set(e);
      if (next) n.delete(thread.id);
      else n.add(thread.id);
      return n;
    });
    ask(`thread:${thread.id}`);
    say(
      next
        ? `Thread on ${rangeLabel(thread)} resolved.`
        : `Thread on ${rangeLabel(thread)} reopened.`,
    );
    onResolve?.(thread.id, next);
  };

  const toggleExpanded = (thread: RangeThread) => {
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(thread.id)) n.delete(thread.id);
      else n.add(thread.id);
      return n;
    });
  };

  const lineAt = (clientY: number) => {
    const content = contentRef.current;
    if (!content || !geo) return null;
    const y = clientY - content.getBoundingClientRect().top;
    let found = 0;
    for (let i = 0; i <= last; i += 1) {
      const top = geo.tops[i];
      if (top !== undefined && top <= y) found = i;
    }
    return {
      index: found,
      y: clamp(y, geo.tops[0] ?? 0, geo.bottoms[last] ?? y),
    };
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: locked,
    onStart: ({ event }) => {
      const hit = lineAt(event.clientY - 0);
      if (!hit) return;
      const start = clamp(dragInfo.current?.anchor ?? hit.index, 0, last);
      dragInfo.current = { anchor: start, down: true };
      for (const c of runs.current) c.stop();
      runs.current = [];
      setDragging(true);
      setDraft(null);
      bTop.jump(geo?.tops[start] ?? 0);
      bBottom.jump(geo?.bottoms[start] ?? 0);
    },
    onMove: ({ point }) => {
      const info = dragInfo.current;
      const hit = lineAt(point.y);
      if (!info || !hit || !geo) return;
      const a = info.anchor;
      // The live end is under the pointer 1:1; the far end holds the anchor.
      if (hit.index >= a) {
        bTop.set(geo.tops[a] ?? 0);
        bBottom.set(r1(Math.max(hit.y, (geo.tops[a] ?? 0) + 6)));
      } else {
        bBottom.set(geo.bottoms[a] ?? 0);
        bTop.set(r1(Math.min(hit.y, (geo.bottoms[a] ?? 0) - 6)));
      }
      const next = {
        start: Math.min(a, hit.index),
        end: Math.max(a, hit.index),
      };
      if (!range || next.start !== range.start || next.end !== range.end) {
        setSelection(next);
        setCursor(hit.index);
      }
    },
    onEnd: ({ velocity }) => {
      const info = dragInfo.current;
      dragInfo.current = null;
      if (!info) return;
      const r = range ?? { start: info.anchor, end: info.anchor };
      const rest = restFor(r);
      setDragging(false);
      setAnchor(info.anchor);
      if (rest) {
        for (const c of runs.current) c.stop();
        runs.current = motionSafe
          ? [
              animate(bTop, rest.top, {
                ...springs.snap,
                velocity: velocity.y,
              }),
              animate(bBottom, rest.bottom, {
                ...springs.snap,
                velocity: velocity.y,
              }),
            ]
          : [];
        if (!motionSafe) {
          bTop.jump(rest.top);
          bBottom.jump(rest.bottom);
        }
      }
      openBox(r);
    },
    onCancel: () => {
      dragInfo.current = null;
      setDragging(false);
    },
    onTap: (event) => {
      dragInfo.current = null;
      const hit = lineAt(event.clientY);
      if (!hit) return;
      const r = { start: hit.index, end: hit.index };
      setSelection(r);
      setAnchor(hit.index);
      setCursor(hit.index);
      openBox(r);
    },
  });

  const onGutterDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("[data-rr-gutter]")) return;
    const hit = lineAt(event.clientY);
    dragInfo.current = hit ? { anchor: hit.index, down: false } : null;
    drag.onPointerDown(event);
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !target.matches("[data-rr-focus^='line:']")
    ) {
      return;
    }
    const k = event.key;
    if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
      event.preventDefault();
      const to =
        k === "Home"
          ? 0
          : k === "End"
            ? last
            : clamp(cursor + (k === "ArrowDown" ? 1 : -1), 0, last);
      setCursor(to);
      ask(`line:${to}`);
      if (event.shiftKey && !locked) {
        const a = anchor ?? cursor;
        setAnchor(a);
        const next = { start: Math.min(a, to), end: Math.max(a, to) };
        setSelection(next);
        say(`${rangeLabel(next)} selected.`);
      } else if (!draft) {
        setAnchor(null);
        if (sel) setSelection(null);
      }
      return;
    }
    if (
      (k === "Enter" || k === "c" || k === "C") &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      const r = range ?? { start: cursor, end: cursor };
      if (!range) {
        setSelection(r);
        setAnchor(cursor);
      }
      openBox(r);
      return;
    }
    if (k === "Escape" && (sel || draft)) {
      event.preventDefault();
      setDraft(null);
      setSelection(null);
      setAnchor(null);
      say("Selection cleared.");
    }
  };

  /* -------------------------------- render ------------------------------ */

  const wraps = wrap === "always";
  const never = wrap === "never";
  const codeWrap = wraps
    ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
    : never
      ? "whitespace-pre"
      : "whitespace-pre @max-[30rem]/range-remarks:whitespace-pre-wrap @max-[30rem]/range-remarks:[overflow-wrap:anywhere]";
  const rowCols = wraps
    ? "grid-cols-[2.25rem_1rem_0.875rem_minmax(0,1fr)] @min-[30rem]/range-remarks:grid-cols-[2.25rem_2.25rem_1rem_0.875rem_minmax(0,1fr)]"
    : never
      ? "grid-cols-[2.25rem_2.25rem_1rem_0.875rem_minmax(max-content,1fr)]"
      : "grid-cols-[2.25rem_1rem_0.875rem_minmax(0,1fr)] @min-[30rem]/range-remarks:grid-cols-[2.25rem_2.25rem_1rem_0.875rem_minmax(max-content,1fr)]";
  const oldCol = never ? "" : "hidden @min-[30rem]/range-remarks:block";
  // Wrapping needs rows as wide as the box; scrolling needs them as wide as
  // the longest line.
  const contentW = wraps
    ? "w-full"
    : never
      ? "w-max min-w-full"
      : "w-full @min-[30rem]/range-remarks:w-max @min-[30rem]/range-remarks:min-w-full";
  const sticky = viewW > 0 ? { width: viewW } : undefined;

  const threadsAfter = new Map<number, RangeThread[]>();
  for (const t of list) {
    const end = clamp(Math.max(t.start, t.end), 0, last);
    const arr = threadsAfter.get(end);
    if (arr) arr.push(t);
    else threadsAfter.set(end, [t]);
  }
  const inThread = (i: number) =>
    list.find(
      (t) =>
        t.id === hot &&
        i >= Math.min(t.start, t.end) &&
        i <= Math.max(t.start, t.end),
    );

  const renderThread = (t: RangeThread) => {
    const open = expanded.has(t.id);
    const r = {
      start: Math.min(t.start, t.end),
      end: Math.max(t.start, t.end),
    };
    const first = t.comments[0];
    const label = rangeLabel(r);
    const bodyId = `${uid}-t-${t.id}`;
    const isFresh = fresh.has(t.id);
    const replyText = replies[t.id] ?? "";
    const original = lines
      .slice(r.start, r.end + 1)
      .filter((l) => l.kind !== "del");
    return (
      <motion.div
        key={t.id}
        role="row"
        className="relative"
        initial={
          isFresh ? { opacity: 0, y: motionSafe ? -distances.nudge : 0 } : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <div
          role="gridcell"
          aria-colspan={5}
          className="sticky left-0 px-2 py-1.5"
          style={sticky}
        >
          <section
            aria-label={`Thread on ${label}`}
            data-rr-thread={t.id}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setHot(t.id);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse")
                setHot((h) => (h === t.id ? null : h));
            }}
            onFocus={() => setHot(t.id)}
            onBlur={(event) => {
              const to = event.relatedTarget;
              if (!(to instanceof Node && event.currentTarget.contains(to))) {
                setHot((h) => (h === t.id ? null : h));
              }
            }}
            className={cn(
              "overflow-hidden rounded-3 border bg-card text-foreground shadow-[0_2px_10px_color-mix(in_oklab,black_6%,transparent)] transition-colors",
              hot === t.id
                ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)]"
                : "border-hairline-strong",
            )}
          >
            <button
              type="button"
              data-rr-focus={`thread:${t.id}`}
              aria-expanded={open}
              aria-controls={open ? bodyId : undefined}
              onClick={() => toggleExpanded(t)}
              className={cn(
                "flex w-full items-center gap-2 rounded-3 px-3 py-2 text-left",
                FOCUS_IN,
              )}
            >
              <motion.span
                aria-hidden
                className="inline-flex shrink-0 text-ink-3"
                initial={false}
                animate={{ rotate: open ? 90 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <ChevronRight className="size-3.5" />
              </motion.span>
              <span className="shrink-0 rounded-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] leading-4 text-ink-2">
                {label.replace("lines", "L").replace("line", "L")}
              </span>
              <span
                title={
                  open
                    ? first?.author
                    : `${first?.author ?? ""}: ${first?.text ?? ""}`
                }
                className="min-w-0 flex-1 truncate text-[12px] text-ink-2"
              >
                <span className="font-medium text-foreground">
                  {first?.author ?? ""}
                </span>
                {open ? "" : ` · ${first?.text ?? ""}`}
              </span>
              {t.outdated ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline px-1.5 py-0.5 text-[10.5px] leading-3 text-ink-3">
                  <History aria-hidden className="size-3" />
                  Outdated
                </span>
              ) : null}
              {t.resolved ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-success">
                  <Check aria-hidden className="size-3.5" />
                  <span className="hidden @min-[30rem]/range-remarks:inline">
                    Resolved
                  </span>
                </span>
              ) : !open && t.comments.length > 1 ? (
                <span className="shrink-0 text-[11px] text-ink-3">
                  <span aria-hidden>{t.comments.length}</span>
                  <span className="sr-only">
                    {plural(t.comments.length, "comment", "comments")}
                  </span>
                </span>
              ) : null}
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  key="body"
                  id={bodyId}
                  className="overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          height: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <div className="flex flex-col gap-2.5 border-t border-hairline px-3 py-2.5">
                    <ol role="list" className="flex flex-col gap-2.5">
                      {t.comments.map((c) => (
                        <motion.li
                          key={c.id}
                          className="flex gap-2"
                          initial={
                            fresh.has(c.id)
                              ? {
                                  opacity: 0,
                                  y: motionSafe ? distances.nudge : 0,
                                }
                              : false
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={
                            motionSafe
                              ? {
                                  y: springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        >
                          <Avatar name={c.author} you={c.author === author} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-baseline gap-1.5">
                              <span
                                title={c.author}
                                className="truncate text-[12px] font-medium"
                              >
                                {c.author}
                              </span>
                              <span className="shrink-0 text-[11px] text-ink-3">
                                {ago(c.at, nowMs)}
                              </span>
                            </p>
                            <p
                              className={cn(
                                "break-words text-ink-2",
                                dens.text,
                              )}
                            >
                              {c.text}
                            </p>
                          </div>
                        </motion.li>
                      ))}
                    </ol>
                    {t.suggestion ? (
                      <div className="overflow-hidden rounded-2 border border-hairline">
                        <p className="flex items-center gap-1.5 border-b border-hairline bg-surface-1 px-2.5 py-1 text-[11px] text-ink-2">
                          <Lightbulb
                            aria-hidden
                            className="size-3.5 shrink-0 text-warn"
                          />
                          Suggested change
                        </p>
                        <pre className="overflow-x-auto bg-card py-1 font-mono text-[11.5px] leading-5">
                          {original.map((l, i) => (
                            <span
                              key={`o${i}`}
                              className="block bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-2.5 whitespace-pre text-ink-2"
                            >
                              <span aria-hidden className="mr-2 text-danger">
                                −
                              </span>
                              {l.text}
                            </span>
                          ))}
                          {t.suggestion.split("\n").map((s, i) => (
                            <span
                              key={`n${i}`}
                              className="block bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2.5 whitespace-pre text-foreground"
                            >
                              <span aria-hidden className="mr-2 text-success">
                                +
                              </span>
                              {s}
                            </span>
                          ))}
                        </pre>
                      </div>
                    ) : null}
                    {!t.resolved && !locked ? (
                      <Composer
                        focusKey={`reply:${t.id}`}
                        label={`Reply on ${label}`}
                        placeholder="Reply"
                        value={replyText}
                        onChange={(text) =>
                          setReplies((rr) => ({ ...rr, [t.id]: text }))
                        }
                        onSubmit={() => reply(t)}
                        onCancel={() => {
                          setReplies((rr) => ({ ...rr, [t.id]: "" }));
                          ask(`thread:${t.id}`);
                        }}
                      />
                    ) : null}
                    {!locked ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleResolved(t)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          {t.resolved ? (
                            <RotateCcw
                              aria-hidden
                              className="size-3.5 shrink-0"
                            />
                          ) : (
                            <Check aria-hidden className="size-3.5 shrink-0" />
                          )}
                          {t.resolved ? "Reopen" : "Resolve"}
                        </button>
                        {!t.resolved ? (
                          <button
                            type="button"
                            aria-disabled={!replyText.trim() || undefined}
                            onClick={() => reply(t)}
                            className={cn(
                              "inline-flex h-7 items-center rounded-2 bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity aria-disabled:opacity-45",
                              FOCUS_RING,
                            )}
                          >
                            Reply
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </div>
      </motion.div>
    );
  };

  const draftRow = (d: Draft) => {
    const label = rangeLabel(d.range);
    const seed = lines
      .slice(d.range.start, d.range.end + 1)
      .filter((l) => l.kind !== "del")
      .map((l) => l.text)
      .join("\n");
    return (
      <motion.div
        key="draft"
        role="row"
        className="overflow-hidden"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <div
          role="gridcell"
          aria-colspan={5}
          className="sticky left-0 px-2 py-1.5"
          style={sticky}
        >
          <motion.section
            aria-label={`Comment on ${label}`}
            className="flex flex-col gap-2 rounded-3 border border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-card p-2.5 text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_10%,transparent)]"
            initial={motionSafe ? { rotateX: -8 } : false}
            animate={{ rotateX: 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            style={{ transformPerspective: 700, originY: 0, originX: 0.5 }}
          >
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
              <span className="rounded-1 bg-cobalt-wash px-1.5 py-0.5 font-mono text-[10.5px] leading-4 text-cobalt-bright">
                {label.replace("lines", "L").replace("line", "L")}
              </span>
              {d.suggest ? "Suggest a change" : "New comment"}
            </p>
            {d.suggest ? (
              <Composer
                focusKey="suggestion"
                label={`Suggested replacement for ${label}`}
                placeholder="Replacement lines"
                value={d.suggestion}
                mono
                onChange={(text) =>
                  setDraft((x) => (x ? { ...x, suggestion: text } : x))
                }
                onSubmit={post}
                onCancel={() => closeBox()}
              />
            ) : null}
            <Composer
              focusKey="draft"
              label={`Comment on ${label}`}
              placeholder={
                d.suggest ? "Why this change (optional)" : "Leave a comment"
              }
              value={d.text}
              onChange={(text) => setDraft((x) => (x ? { ...x, text } : x))}
              onSubmit={post}
              onCancel={() => closeBox()}
            />
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                aria-pressed={d.suggest}
                onClick={() => {
                  setDraft((x) =>
                    x
                      ? {
                          ...x,
                          suggest: !x.suggest,
                          suggestion: x.suggestion || seed,
                        }
                      : x,
                  );
                  if (!d.suggest) ask("suggestion");
                }}
                className={cn(
                  "mr-auto inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] transition-colors",
                  d.suggest
                    ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Lightbulb aria-hidden className="size-3.5 shrink-0" />
                Suggest
              </button>
              <button
                type="button"
                onClick={() => {
                  closeBox();
                  setSelection(null);
                  setAnchor(null);
                }}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                aria-disabled={
                  (!d.text.trim() && !(d.suggest && d.suggestion.trim())) ||
                  undefined
                }
                onClick={post}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity aria-disabled:opacity-45",
                  FOCUS_RING,
                )}
              >
                {d.suggest ? "Suggest" : "Comment"}
              </button>
            </div>
          </motion.section>
        </div>
      </motion.div>
    );
  };

  const brackets = geo
    ? list
        .map((t) => {
          const a = clamp(Math.min(t.start, t.end), 0, last);
          const b = clamp(Math.max(t.start, t.end), 0, last);
          const top = geo.tops[a];
          const bottom = geo.bottoms[b];
          if (top === undefined || bottom === undefined) return null;
          return { t, d: bracketPath(bracketStyle, top, bottom) };
        })
        .filter((x): x is { t: RangeThread; d: string } => !!x)
    : [];

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/range-remarks flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{ height, ...(THEME[editorTheme] as React.CSSProperties) }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <FileCode aria-hidden className="size-4 shrink-0 text-ink-3" />
        <p
          id={titleId}
          title={diff.path}
          className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-foreground [direction:rtl]"
        >
          <span className="[unicode-bidi:plaintext]">{diff.path}</span>
        </p>
        <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
          <span className="text-success">+{adds}</span>
          <span className="text-danger">−{dels}</span>
          <span className="text-ink-3">· {openCount} open</span>
        </span>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move between lines. Shift with an arrow selects a range.
        Enter or C comments on it, Escape clears it. In a comment box, Control
        or Command with Enter posts.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">This diff didn&apos;t load.</p>
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
      ) : (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
              if (more !== fadeRight) setFadeRight(more);
            }}
            className="relative flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-(--rr-bg) text-(--rr-fg)"
          >
            <div
              ref={contentRef}
              role="grid"
              aria-labelledby={titleId}
              aria-describedby={hintId}
              aria-multiselectable
              onKeyDown={onGridKeyDown}
              onPointerDown={onGutterDown}
              onPointerMove={drag.onPointerMove}
              onPointerUp={drag.onPointerUp}
              onPointerCancel={drag.onPointerCancel}
              onLostPointerCapture={drag.onLostPointerCapture}
              className={cn("relative flex flex-col py-1.5", contentW)}
              style={{ fontSize: dens.code }}
            >
              {status === "loading"
                ? Array.from({ length: 14 }, (_, i) => (
                    <div
                      key={i}
                      aria-hidden
                      className="flex items-center gap-3 px-3"
                      style={{ height: lineH }}
                    >
                      <span className="h-2 w-5 rounded-full bg-surface-2" />
                      <span
                        className="h-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                        style={{ width: `${18 + ((i * 37) % 55)}%` }}
                      />
                    </div>
                  ))
                : lines.map((line, i) => {
                    const inSel = !!range && i >= range.start && i <= range.end;
                    const lit = inThread(i);
                    const isCursor = i === cursor;
                    const kindWord =
                      line.kind === "add"
                        ? "added"
                        : line.kind === "del"
                          ? "removed"
                          : "unchanged";
                    const after = threadsAfter.get(i) ?? [];
                    return (
                      <React.Fragment key={i}>
                        <div
                          role="row"
                          aria-selected={inSel}
                          data-rr-line={i}
                          className={cn(
                            "group/range-remarks-line relative grid font-mono",
                            rowCols,
                            line.kind === "add" && "bg-(--rr-add)",
                            line.kind === "del" && "bg-(--rr-del)",
                          )}
                          style={{ minHeight: lineH, lineHeight: `${lineH}px` }}
                        >
                          {inSel || lit ? (
                            <span
                              aria-hidden
                              className={cn(
                                "pointer-events-none absolute inset-0",
                                inSel
                                  ? "bg-[color-mix(in_oklab,var(--accent-bright)_16%,transparent)]"
                                  : "bg-[color-mix(in_oklab,var(--accent-bright)_8%,transparent)]",
                              )}
                            />
                          ) : null}
                          <span
                            aria-hidden
                            className={cn(
                              "bg-(--rr-gutter) pr-1.5 text-right text-[0.9em] text-(--rr-num) tabular-nums select-none",
                              oldCol,
                            )}
                          >
                            {line.old ?? ""}
                          </span>
                          <span
                            aria-hidden
                            className="bg-(--rr-gutter) pr-1.5 text-right text-[0.9em] text-(--rr-num) tabular-nums select-none"
                          >
                            {line.new ?? ""}
                          </span>
                          <span
                            aria-hidden
                            data-rr-gutter=""
                            onPointerEnter={(event) => {
                              if (event.pointerType !== "mouse") return;
                              const over = list.find(
                                (t) =>
                                  i >= Math.min(t.start, t.end) &&
                                  i <= Math.max(t.start, t.end),
                              );
                              if (over) setHot(over.id);
                            }}
                            onPointerLeave={(event) => {
                              if (event.pointerType !== "mouse") return;
                              setHot(null);
                            }}
                            className={cn(
                              "relative flex touch-pan-x justify-center bg-(--rr-gutter) select-none",
                              locked ? "cursor-default" : "cursor-row-resize",
                            )}
                          >
                            {!locked ? (
                              <span
                                className={cn(
                                  "pointer-events-none mt-[3px] flex size-3.5 items-center justify-center rounded-1 bg-cobalt-bright text-white opacity-0 transition-opacity",
                                  "group-hover/range-remarks-line:opacity-100",
                                )}
                              >
                                <Plus className="size-2.5" strokeWidth={3} />
                              </span>
                            ) : null}
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              "text-center select-none",
                              line.kind === "add"
                                ? "text-success"
                                : line.kind === "del"
                                  ? "text-danger"
                                  : "text-(--rr-num)",
                            )}
                          >
                            {line.kind === "add"
                              ? "+"
                              : line.kind === "del"
                                ? "−"
                                : ""}
                          </span>
                          <span
                            role="gridcell"
                            tabIndex={ready && isCursor ? 0 : -1}
                            data-rr-focus={`line:${i}`}
                            aria-label={`Line ${line.new ?? line.old ?? i + 1}, ${kindWord}: ${line.text.trim() || "blank"}`}
                            aria-describedby={hintId}
                            onFocus={() => {
                              if (cursor !== i) setCursor(i);
                            }}
                            onClick={() => {
                              setCursor(i);
                            }}
                            className={cn(
                              "relative min-w-0 pr-4 pl-1",
                              codeWrap,
                              FOCUS_IN,
                            )}
                          >
                            {line.text ? tint(line.text) : " "}
                          </span>
                        </div>
                        {after.map((t) => renderThread(t))}
                        <AnimatePresence initial={false}>
                          {draft && draft.range.end === i
                            ? draftRow(draft)
                            : null}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}

              {ready && geo ? (
                <svg
                  aria-hidden
                  className="pointer-events-none absolute top-0 overflow-visible"
                  style={{ left: geo.gutter, width: 16, height: geo.height }}
                >
                  {brackets.map(({ t, d }) => (
                    <path
                      key={t.id}
                      d={d}
                      fill="none"
                      strokeWidth={bracketStyle === "bar" ? 3.5 : 1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={t.outdated ? "2 3" : undefined}
                      className={cn(
                        "transition-[stroke,opacity] duration-150",
                        hot === t.id
                          ? "stroke-cobalt-bright opacity-100"
                          : t.resolved || t.outdated
                            ? "stroke-(--rr-num) opacity-60"
                            : "stroke-(--rr-num) opacity-90",
                      )}
                    />
                  ))}
                  <motion.path
                    d={liveBracket}
                    fill="none"
                    strokeWidth={bracketStyle === "bar" ? 4 : 2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "stroke-cobalt-bright",
                      range ? "opacity-100" : "opacity-0",
                    )}
                  />
                </svg>
              ) : null}
            </div>
          </div>
          {/* More code waits past the right edge: the edge fades. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-(--rr-bg) to-transparent transition-opacity duration-200",
              fadeRight ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
