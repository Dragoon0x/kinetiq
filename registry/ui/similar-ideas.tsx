"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Bell,
  BellRing,
  ChevronUp,
  Lightbulb,
  MessageSquare,
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

export type SimilarIdeaStatus = "review" | "planned" | "shipped";

export type SimilarIdea = {
  id: string;
  title: string;
  /** A sentence or two of detail; also searched, at a lower weight. */
  body: string;
  status: SimilarIdeaStatus;
  votes: number;
  comments: number;
  /** The visitor has voted for it. */
  voted?: boolean;
  /** The visitor hears when it moves. */
  following?: boolean;
  /** Last activity, in ms since the epoch. */
  updated: number;
  /** For shipped ideas: the release it shipped in. */
  shippedIn?: string;
  /** The visitor's own note, once a draft has been folded in. */
  note?: string;
};

export type SimilarMatchStyle = "bar" | "dots" | "ring";
export type SimilarDensity = "compact" | "regular" | "roomy";
export type SimilarStatusPalette = "signal" | "cool" | "mono";
export type SimilarStatus = "ready" | "loading" | "error";

export type SimilarIdeasProps = {
  /** Controlled ideas. Votes, follows, notes and new ideas come back through `onIdeasChange`. */
  ideas?: SimilarIdea[];
  /** Initial ideas when uncontrolled. @default defaultSimilarIdeas (14, Coldbrook's roadmap) */
  defaultIdeas?: SimilarIdea[];
  /** Fires with every idea after a vote, a follow or a post. */
  onIdeasChange?: (ideas: SimilarIdea[]) => void;
  /** Controlled draft title — what the field holds. */
  value?: string;
  /** Initial draft title when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires on every keystroke, and when a vote or a post clears the field. */
  onValueChange?: (value: string) => void;
  /** A vote was cast (true, with your draft as `comment` when there was one) or taken back (false). */
  onVote?: (ideaId: string, voted: boolean, comment?: string) => void;
  /** Post was pressed: a new idea from the field and the details. */
  onSubmitNew?: (idea: { title: string; details: string }) => void;
  /** The follow bell was pressed (or Shift+Enter on a match). */
  onFollow?: (ideaId: string, following: boolean) => void;
  /** A search settled, with the ids of the similar ideas it found (empty when none) — for counting ideas that found a home. */
  onMatches?: (ideaIds: string[]) => void;
  /** How the match strength reads: a thin bar with its percentage, five dots, or a small ring. @default "bar" */
  matchStyle?: SimilarMatchStyle;
  /** Row height, padding and type. @default "regular" */
  density?: SimilarDensity;
  /** Status colours: amber, cobalt and green; three cool hues; or ink, with the glyph telling them apart. @default "signal" */
  statusPalette?: SimilarStatusPalette;
  /** The most similar ideas shown at once. @default 4 */
  maxMatches?: number;
  /** How alike an idea must be to show, 0 to 1. @default 0.2 */
  minScore?: number;
  /** How long the quiet spinner turns after the last keystroke before matches rise, ms. @default 320 */
  searchDelayMs?: number;
  /** The product whose roadmap this is. @default "Coldbrook" */
  product?: string;
  /** The field's placeholder. @default "Describe your idea in a line" */
  placeholder?: string;
  /** The moment ages count from (Date or ms). @default defaultSimilarIdeasNow */
  now?: number | Date;
  /** Whether the ideas have arrived. @default "ready" */
  status?: SimilarStatus;
  /** "Try again" was pressed after the ideas failed to load. */
  onRetry?: () => void;
  /** Tallest the panel grows before it scrolls inside, px. @default 540 */
  maxHeight?: number;
  /** Nothing can be typed, voted, followed or posted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** A fixed morning, so ages render the same everywhere. */
export const defaultSimilarIdeasNow = Date.UTC(2026, 9, 15, 9, 0);
const N = defaultSimilarIdeasNow;

export const defaultSimilarIdeas: SimilarIdea[] = [
  {
    id: "scheduled-exports",
    title: "Scheduled exports to CSV",
    body: "Send a CSV of any report on a schedule, daily, weekly or monthly, to a list of addresses or a shared folder.",
    status: "planned",
    votes: 214,
    comments: 38,
    updated: N - 2 * DAY,
  },
  {
    id: "dashboard-pdf",
    title: "Export dashboards as PDF",
    body: "One press for a PDF of a dashboard with its filters applied, for board packs.",
    status: "shipped",
    votes: 389,
    comments: 61,
    updated: N - 19 * DAY,
    shippedIn: "4.10",
  },
  {
    id: "mobile-dark",
    title: "Dark mode in the mobile app",
    body: "Follow the phone's theme at night, the way the web app already does.",
    status: "review",
    votes: 156,
    comments: 22,
    updated: N - 5 * DAY,
  },
  {
    id: "security-keys",
    title: "Sign in with security keys",
    body: "Two-step sign-in with a hardware key as well as codes.",
    status: "planned",
    votes: 98,
    comments: 12,
    updated: N - 9 * DAY,
  },
  {
    id: "bulk-tags",
    title: "Bulk edit tags on records",
    body: "Select many records and add or remove tags in one go.",
    status: "review",
    votes: 77,
    comments: 9,
    updated: N - 3 * DAY,
  },
  {
    id: "monday-email",
    title: "Recurring report emails",
    body: "Email a report to my team every Monday morning without opening the app.",
    status: "review",
    votes: 64,
    comments: 7,
    updated: N - 1 * DAY,
  },
  {
    id: "mentions",
    title: "Mentions in comments",
    body: "Type @ and a name in any comment to notify that person.",
    status: "shipped",
    votes: 241,
    comments: 30,
    updated: N - 41 * DAY,
    shippedIn: "4.8",
  },
  {
    id: "fiscal-year",
    title: "Custom fiscal year start",
    body: "Let reports start the year in April or July instead of January.",
    status: "planned",
    votes: 132,
    comments: 18,
    updated: N - 6 * DAY,
  },
  {
    id: "record-keys",
    title: "Keyboard shortcuts in the record view",
    body: "Move between records and change fields without the mouse.",
    status: "review",
    votes: 45,
    comments: 4,
    updated: N - 12 * DAY,
  },
  {
    id: "live-formulas",
    title: "Keep formulas in spreadsheet exports",
    body: "When a table is exported, keep its totals as live formulas instead of fixed values.",
    status: "review",
    votes: 51,
    comments: 6,
    updated: N - 8 * DAY,
  },
  {
    id: "audit-export",
    title: "Audit log export",
    body: "Download the audit log as a CSV for any date range.",
    status: "planned",
    votes: 87,
    comments: 11,
    updated: N - 4 * DAY,
  },
  {
    id: "offline-notes",
    title: "Offline mode for field notes",
    body: "Write notes with no signal and sync them when the phone is back online.",
    status: "review",
    votes: 120,
    comments: 15,
    updated: N - 2 * DAY,
  },
  {
    id: "read-only-link",
    title: "Share a read-only link to a dashboard",
    body: "Send a link that opens a dashboard without a seat, and expires.",
    status: "shipped",
    votes: 302,
    comments: 44,
    updated: N - 27 * DAY,
    shippedIn: "4.11",
  },
  {
    id: "rate-headers",
    title: "Rate limit headers on the API",
    body: "Return the remaining calls and the reset time with every response.",
    status: "review",
    votes: 33,
    comments: 3,
    updated: N - 15 * DAY,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Matching                                 */
/* ----------------------------------------------------------------------- */

const STOP = new Set(
  "a an the to of for on in and or with my our i we be is it as by at from can could would should please add allow let me us any all every this that there when so are was do does have has into out up its it's".split(
    " ",
  ),
);

/** Words people use for the same thing, as stems. */
const SYNONYMS = [
  ["schedul", "recurr", "weekly", "daily", "monthly", "automat", "routin"],
  ["csv", "spreadsheet", "sheet", "tabl"],
  ["email", "mail", "inbox"],
  ["export", "download"],
  ["pdf", "print"],
  ["dark", "night", "theme"],
  ["mobil", "phone"],
  ["share", "link"],
  ["tag", "label"],
  ["shortcut", "keyboard", "hotkey"],
  ["offlin", "sync", "signal"],
  ["notif", "alert", "mention"],
  ["sign", "login", "auth"],
  ["dashboard", "report"],
];

const stem = (word: string) => {
  for (const suffix of ["ing", "ed", "es", "s", "e"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
};

const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

const groupOf = (t: string) =>
  t.length < 3
    ? -1
    : SYNONYMS.findIndex((g) =>
        g.some((root) => t.startsWith(root) || root.startsWith(t)),
      );

const similarity = (a: string, b: string) => {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return 0.85;
  }
  const g = groupOf(a);
  return g !== -1 && g === groupOf(b) ? 0.7 : 0;
};

type Match = { id: string; score: number };

/**
 * How much of the query an idea already covers: each query word takes its
 * best match in the title, or 60% of its best in the body, and the words
 * are averaged. Exact stems count fully, shared prefixes nearly, synonyms
 * most of the way.
 */
function matchIdeas(
  ideas: SimilarIdea[],
  query: string,
  minScore: number,
  max: number,
): Match[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const out: Match[] = [];
  for (const idea of ideas) {
    const title = tokens(idea.title);
    const body = tokens(idea.body);
    let sum = 0;
    for (const word of q) {
      let best = 0;
      for (const t of title) best = Math.max(best, similarity(word, t));
      for (const t of body) best = Math.max(best, 0.6 * similarity(word, t));
      sum += best;
    }
    const score = Math.round((sum / q.length) * 100) / 100;
    if (score >= minScore) out.push({ id: idea.id, score: Math.min(1, score) });
  }
  const votes = new Map(ideas.map((i) => [i.id, i.votes]));
  return out
    .sort(
      (a, b) =>
        b.score - a.score || (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0),
    )
    .slice(0, Math.max(1, Math.round(max)));
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const STATUS_LABEL: Record<SimilarIdeaStatus, string> = {
  review: "Under review",
  planned: "Planned",
  shipped: "Shipped",
};
const STATUS_ORDER: SimilarIdeaStatus[] = ["review", "planned", "shipped"];

const PALETTE: Record<
  SimilarStatusPalette,
  Record<SimilarIdeaStatus, string>
> = {
  signal: {
    review: "var(--warn)",
    planned: "var(--accent-bright)",
    shipped: "var(--success)",
  },
  cool: {
    review: "oklch(from var(--accent-bright) l c 215)",
    planned: "var(--accent-bright)",
    shipped: "oklch(from var(--accent-bright) l c 305)",
  },
  mono: {
    review: "var(--ink-2)",
    planned: "var(--ink-2)",
    shipped: "var(--ink-2)",
  },
};

const DENSITY: Record<
  SimilarDensity,
  { row: string; text: string; gap: string; pad: string; vote: string }
> = {
  compact: {
    row: "py-2 pr-2.5 pl-2",
    text: "text-[12.5px] leading-[18px]",
    gap: "gap-2.5",
    pad: "p-3",
    vote: "w-10 py-1",
  },
  regular: {
    row: "py-2.5 pr-3 pl-2.5",
    text: "text-[13px] leading-5",
    gap: "gap-3",
    pad: "p-4",
    vote: "w-11 py-1.5",
  },
  roomy: {
    row: "py-3.5 pr-3.5 pl-3",
    text: "text-[13px] leading-[22px]",
    gap: "gap-3.5",
    pad: "p-5",
    vote: "w-12 py-2",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

function ago(at: number, now: number): string {
  const days = Math.max(0, Math.round((now - at) / DAY));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}

/** The status glyph: an open dashed ring, a half-filled ring, a filled tick. */
function StatusGlyph({ status }: { status: SimilarIdeaStatus }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
      {status === "review" ? (
        <circle
          cx="6"
          cy="6"
          r="4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="2.2 1.6"
        />
      ) : status === "planned" ? (
        <>
          <circle
            cx="6"
            cy="6"
            r="4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M6 1.4 A4.6 4.6 0 0 1 6 10.6 Z" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="6" cy="6" r="5.3" fill="currentColor" />
          <path
            d="M3.6 6.2 L5.3 7.8 L8.4 4.5"
            fill="none"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-card"
          />
        </>
      )}
    </svg>
  );
}

function StatusChip({
  status,
  palette,
}: {
  status: SimilarIdeaStatus;
  palette: SimilarStatusPalette;
}) {
  const color = PALETTE[palette][status];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] leading-none font-medium whitespace-nowrap transition-colors"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      <StatusGlyph status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A number whose digits roll toward the way it moved, on snap. */
function Rolling({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const text = String(value);
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const dir = shown.dir;
  return (
    <span
      className={cn(
        "relative inline-flex h-4 justify-center overflow-clip tabular-nums",
        className,
      )}
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? d * 9 : 0,
            }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 9 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
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

function Strength({
  score,
  style,
  motionSafe,
  fill = false,
}: {
  score: number;
  style: SimilarMatchStyle;
  motionSafe: boolean;
  /** Stretch the bar across its line (the narrow layout's own match line). */
  fill?: boolean;
}) {
  const pct = Math.round(score * 100);
  const grow = motionSafe ? { ...springs.glide, delay: 0.08 } : { duration: 0 };
  if (style === "dots") {
    const lit = Math.max(1, Math.round(score * 5));
    return (
      <span aria-hidden className="flex shrink-0 items-center gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="size-[5px] rounded-full"
            initial={false}
            animate={{
              backgroundColor:
                i < lit ? "var(--accent-bright)" : "var(--hairline-strong)",
              scale: i < lit ? 1 : 0.8,
            }}
            transition={{
              backgroundColor: { duration: durations.fast, delay: i * 0.03 },
              scale: motionSafe
                ? { ...springs.snap, delay: i * 0.03 }
                : { duration: 0 },
            }}
          />
        ))}
      </span>
    );
  }
  if (style === "ring") {
    const r = 6.5;
    const c = 2 * Math.PI * r;
    return (
      <span aria-hidden className="flex shrink-0 items-center gap-1.5">
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            strokeWidth="2"
            className="stroke-hairline-strong"
          />
          <motion.circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-cobalt-bright"
            strokeDasharray={`${r2(c)} ${r2(c)}`}
            initial={{ strokeDashoffset: r2(c) }}
            animate={{ strokeDashoffset: r2(c * (1 - score)) }}
            transition={grow}
          />
        </svg>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {pct}%
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center gap-1.5",
        fill ? "min-w-0 flex-1" : "shrink-0",
      )}
    >
      <span
        className={cn(
          "relative h-1 overflow-clip rounded-full bg-hairline-strong",
          fill ? "min-w-0 flex-1" : "w-10",
        )}
      >
        <motion.span
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: r2(score) }}
          transition={grow}
        />
      </span>
      <span className="w-7 text-right font-mono text-[10px] text-ink-3 tabular-nums">
        {pct}%
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The component                              */
/* ----------------------------------------------------------------------- */

type Results = { q: string; list: Match[] };
type Receipt = { id: string; kind: "voted" | "posted"; n: number };
type Flight = { n: number; text: string; from: DOMRect };

/**
 * An idea panel that checks the roadmap while you type. After three letters a
 * quiet spinner turns at the end of the field for `searchDelayMs`, then the
 * ideas most like yours rise up from below the field — 16px on
 * `springs.glide`, in `cascade()` order — each with its status, its votes and
 * how strongly it matches, the strength filling as it lands. Ideas that stop
 * matching fade out on the exit tween and the rest glide to their new seats.
 *
 * Voting folds your draft into the idea as your comment: the draft lifts off
 * the field as a pill and glides into the row's note line, the vote count
 * rolls on snap and the comment badge lands on recoil, and the other matches
 * step aside. With nothing similar the list gives way to a clean submit.
 *
 * The field is a real combobox: Up and Down move through the matches, Enter
 * votes, Shift+Enter follows, Escape clears the highlight and then the
 * field. Under reduced motion rows appear in place and the draft cross-fades
 * into its note; counts and strengths still change.
 */
export function SimilarIdeas({
  ideas,
  defaultIdeas,
  onIdeasChange,
  value,
  defaultValue = "",
  onValueChange,
  onVote,
  onSubmitNew,
  onFollow,
  onMatches,
  matchStyle = "bar",
  density = "regular",
  statusPalette = "signal",
  maxMatches = 4,
  minScore = 0.2,
  searchDelayMs = 320,
  product = "Coldbrook",
  placeholder = "Describe your idea in a line",
  now = defaultSimilarIdeasNow,
  status = "ready",
  onRetry,
  maxHeight = 540,
  disabled = false,
  className,
}: SimilarIdeasProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const fieldId = `${uid}-field`;
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const detailsId = `${uid}-details`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ready = status === "ready";

  /* -------------------------------- state -------------------------------- */

  const [ownIdeas, setOwnIdeas] = React.useState<SimilarIdea[]>(
    () => defaultIdeas ?? defaultSimilarIdeas,
  );
  const list = ideas ?? ownIdeas;
  const [ownValue, setOwnValue] = React.useState(defaultValue);
  const query = value ?? ownValue;
  const [details, setDetails] = React.useState("");
  const [results, setResults] = React.useState<Results | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const q = query.trim();
  const long = q.length >= 3 && ready;

  // A query that drops under three letters clears the matches; one that
  // grows past it starts the spinner. Decided where the value changes, so a
  // host typing into a controlled field gets the same as a keystroke here.
  const [seenQuery, setSeenQuery] = React.useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    if (query.trim().length >= 3 && ready) {
      setSearching(true);
      if (receipt) setReceipt(null);
    } else {
      setSearching(false);
      setResults(null);
      setActive(-1);
    }
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const flyerRef = React.useRef<HTMLDivElement | null>(null);
  const noteRef = React.useRef<HTMLParagraphElement | null>(null);
  const optionNodes = React.useRef(new Map<string, HTMLElement>());
  const latestIdeas = React.useRef(list);
  const latestOnMatches = React.useRef(onMatches);
  React.useEffect(() => {
    latestIdeas.current = list;
    latestOnMatches.current = onMatches;
  });

  React.useEffect(() => {
    if (!long) return;
    const t = window.setTimeout(() => {
      const found = matchIdeas(latestIdeas.current, q, minScore, maxMatches);
      setResults({ q, list: found });
      setSearching(false);
      latestOnMatches.current?.(found.map((m) => m.id));
      setActive(-1);
      setSaid((s) => ({
        n: s.n + 1,
        text:
          found.length === 0
            ? "No similar ideas. You can post it as a new one."
            : `${plural(found.length, "similar idea", "similar ideas")}. Up and Down to look, Enter to vote.`,
      }));
    }, searchDelayMs);
    return () => window.clearTimeout(t);
  }, [long, q, minScore, maxMatches, searchDelayMs]);

  /* ------------------------------ callbacks ------------------------------ */

  const writeIdeas = (next: SimilarIdea[]) => {
    if (ideas === undefined) setOwnIdeas(next);
    onIdeasChange?.(next);
  };

  const writeValue = (next: string) => {
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  };

  const byId = (id: string) => list.find((i) => i.id === id);

  const matches = (results?.list ?? [])
    .map((m) => ({ match: m, idea: byId(m.id) }))
    .filter(
      (x): x is { match: Match; idea: SimilarIdea } => x.idea !== undefined,
    );
  const receiptIdea = receipt ? byId(receipt.id) : undefined;
  const showingReceipt = receiptIdea !== undefined && q.length === 0;
  const listOpen = !showingReceipt && long && matches.length > 0;
  const noMatch =
    !showingReceipt &&
    long &&
    !searching &&
    results !== null &&
    matches.length === 0;
  const activeIdea = listOpen ? matches[active]?.idea : undefined;

  const moveActive = (to: number) => {
    if (!listOpen) return;
    const n = matches.length;
    const next = ((to % n) + n) % n;
    setActive(next);
    const id = matches[next]?.idea.id;
    if (id) optionNodes.current.get(id)?.scrollIntoView({ block: "nearest" });
  };

  const vote = (idea: SimilarIdea) => {
    if (disabled) return;
    if (idea.status === "shipped") {
      say(
        `${idea.title} already shipped${idea.shippedIn ? ` in ${idea.shippedIn}` : ""}.`,
      );
      return;
    }
    if (idea.voted) {
      writeIdeas(
        list.map((i) =>
          i.id === idea.id
            ? { ...i, voted: false, votes: Math.max(0, i.votes - 1) }
            : i,
        ),
      );
      onVote?.(idea.id, false);
      say(`Vote taken back from ${idea.title}.`);
      return;
    }
    const note = [q, details.trim()].filter(Boolean).join(" — ");
    writeIdeas(
      list.map((i) =>
        i.id === idea.id
          ? {
              ...i,
              voted: true,
              votes: i.votes + 1,
              comments: note ? i.comments + 1 : i.comments,
              note: note || i.note,
              updated: nowMs,
            }
          : i,
      ),
    );
    onVote?.(idea.id, true, note || undefined);
    if (note) {
      const from = inputRef.current?.getBoundingClientRect();
      if (from && motionSafe) {
        setFlight({ n: (flight?.n ?? 0) + 1, text: note, from });
      }
      setReceipt({ id: idea.id, kind: "voted", n: (receipt?.n ?? 0) + 1 });
      setDetails("");
      writeValue("");
      setResults(null);
      setActive(-1);
      say(`Voted for ${idea.title}. Your note was added as a comment.`);
    } else {
      say(`Voted for ${idea.title}.`);
    }
  };

  const follow = (idea: SimilarIdea) => {
    if (disabled) return;
    const next = !idea.following;
    writeIdeas(
      list.map((i) => (i.id === idea.id ? { ...i, following: next } : i)),
    );
    onFollow?.(idea.id, next);
    say(next ? `Following ${idea.title}.` : `Stopped following ${idea.title}.`);
  };

  const post = () => {
    if (disabled || q.length < 3) {
      if (q.length < 3) {
        inputRef.current?.focus();
        say("Describe the idea in a few words first.");
      }
      return;
    }
    const id = `idea-${list.length + 1}-${q.length}`;
    const fresh: SimilarIdea = {
      id,
      title: q.charAt(0).toUpperCase() + q.slice(1),
      body: details.trim(),
      status: "review",
      votes: 1,
      comments: 0,
      voted: true,
      following: true,
      updated: nowMs,
    };
    writeIdeas([fresh, ...list]);
    onSubmitNew?.({ title: fresh.title, details: details.trim() });
    setReceipt({ id, kind: "posted", n: (receipt?.n ?? 0) + 1 });
    setDetails("");
    writeValue("");
    setResults(null);
    setActive(-1);
    inputRef.current?.focus();
    say(`Posted ${fresh.title}. It is under review and you follow it.`);
  };

  /* ------------------------------- the pill ------------------------------ */

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fo = useMotionValue(1);

  React.useLayoutEffect(() => {
    if (!flight) return;
    const root = rootRef.current;
    const flyer = flyerRef.current;
    const note = noteRef.current;
    if (!root || !flyer || !note) {
      const t = window.setTimeout(() => setFlight(null), 0);
      return () => window.clearTimeout(t);
    }
    const rootBox = root.getBoundingClientRect();
    const sx = r2(flight.from.left - rootBox.left + 10);
    const sy = r2(flight.from.top - rootBox.top + flight.from.height / 2 - 13);
    fx.jump(sx);
    fy.jump(sy);
    fs.jump(1);
    fo.jump(1);
    // The first frame is painted from the values motion rendered with:
    // write the start onto the node so it already sits on the field.
    flyer.style.transform = `translateX(${sx}px) translateY(${sy}px)`;
    flyer.style.visibility = "visible";
    const running: AnimationPlaybackControls[] = [];
    const t = window.setTimeout(() => {
      running.push(
        animate(0, 1, {
          ...springs.glide,
          onUpdate: (p) => {
            // The receipt row is gliding into place and its note line is
            // opening while the pill flies, so the target is read each
            // frame: the pill lands where the note IS, not where it was.
            const rb = root.getBoundingClientRect();
            const nb = note.getBoundingClientRect();
            const tx = nb.left - rb.left - 6;
            const ty = nb.top - rb.top + nb.height / 2 - 13;
            fx.set(r2(sx + (tx - sx) * p));
            // A shallow arc: the pill dips toward the row as it goes.
            fy.set(r2(sy + (ty - sy) * p - Math.sin(p * Math.PI) * 10));
            fs.set(Number((1 - 0.08 * p).toFixed(4)));
            if (p > 0.82) fo.set(r2(Math.max(0, 1 - (p - 0.82) / 0.18)));
          },
          onComplete: () => setFlight(null),
        }),
      );
    }, 40);
    return () => {
      window.clearTimeout(t);
      for (const c of running) c.stop();
    };
  }, [flight, fx, fy, fs, fo]);

  /* ------------------------------ keyboard ------------------------------- */

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!listOpen) return;
      event.preventDefault();
      const d1 = event.key === "ArrowDown" ? 1 : -1;
      moveActive(
        active === -1 ? (d1 > 0 ? 0 : matches.length - 1) : active + d1,
      );
    } else if ((event.key === "Home" || event.key === "End") && active >= 0) {
      event.preventDefault();
      moveActive(event.key === "Home" ? 0 : matches.length - 1);
    } else if (event.key === "Enter") {
      if (activeIdea) {
        event.preventDefault();
        if (event.shiftKey) follow(activeIdea);
        else vote(activeIdea);
      } else if (noMatch) {
        event.preventDefault();
        post();
      }
    } else if (event.key === "Escape") {
      if (active >= 0) {
        event.preventDefault();
        setActive(-1);
      } else if (query) {
        event.preventDefault();
        writeValue("");
      }
    }
  };

  /* ------------------------------- render -------------------------------- */

  const followed = list.filter((i) => i.following);
  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    n: list.filter((i) => i.status === s).length,
  }));
  const rows: {
    idea: SimilarIdea;
    score: number | null;
    index: number;
  }[] = showingReceipt
    ? [{ idea: receiptIdea, score: null, index: 0 }]
    : matches.map((m, index) => ({
        idea: m.idea,
        score: m.match.score,
        index,
      }));
  const step = cascade(Math.max(1, rows.length));

  const iconButton = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-40",
    FOCUS_RING,
  );

  const row = (entry: (typeof rows)[number]) => {
    const { idea, score, index } = entry;
    const isActive = listOpen && index === active;
    const shipped = idea.status === "shipped";
    const asOption = !showingReceipt;
    const tab = asOption ? -1 : 0;
    const name = `${idea.title}, ${STATUS_LABEL[idea.status].toLowerCase()}, ${plural(idea.votes, "vote", "votes")}${score !== null ? `, ${Math.round(score * 100)}% match` : ""}${idea.voted ? ", you voted" : ""}${idea.following ? ", following" : ""}`;
    return (
      <motion.div
        key={idea.id}
        ref={(node: HTMLDivElement | null) => {
          if (node) optionNodes.current.set(idea.id, node);
          else optionNodes.current.delete(idea.id);
        }}
        id={`${uid}-opt-${idea.id}`}
        role={asOption ? "option" : undefined}
        aria-selected={asOption ? isActive : undefined}
        aria-label={asOption ? name : undefined}
        layout={motionSafe ? "position" : false}
        initial={
          motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0, y: 0 }
        }
        animate={{ opacity: searching && asOption ? 0.55 : 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          y: motionSafe
            ? { ...springs.glide, delay: index * step }
            : { duration: 0 },
          opacity: {
            duration: motionSafe ? durations.base : durations.fast,
            ease: easings.enter,
            delay: motionSafe ? index * step : 0,
          },
        }}
        onPointerEnter={() => {
          if (asOption) setActive(index);
        }}
        className={cn(
          "relative flex items-start rounded-3",
          d.row,
          d.gap,
          d.text,
        )}
      >
        {isActive ? (
          <motion.span
            layoutId={`${uid}-active`}
            aria-hidden
            className="absolute inset-0 rounded-3 bg-surface-2"
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
        <button
          type="button"
          tabIndex={tab}
          aria-label={
            shipped
              ? `${idea.title} shipped${idea.shippedIn ? ` in ${idea.shippedIn}` : ""}`
              : idea.voted
                ? `Take back your vote for ${idea.title}`
                : `Vote for ${idea.title}`
          }
          aria-pressed={shipped ? undefined : Boolean(idea.voted)}
          aria-disabled={shipped || disabled || undefined}
          onClick={(event) => {
            event.stopPropagation();
            vote(idea);
          }}
          className={cn(
            "relative z-[1] flex shrink-0 flex-col items-center gap-0.5 rounded-2 border text-[12px] font-medium transition-colors",
            d.vote,
            idea.voted
              ? "border-transparent bg-primary text-primary-foreground"
              : shipped
                ? "cursor-default border-hairline text-ink-3"
                : "border-hairline-strong bg-card text-foreground hover:border-cobalt-bright/60",
            FOCUS_RING,
          )}
        >
          <ChevronUp aria-hidden className="size-3.5" />
          <Rolling value={idea.votes} motionSafe={motionSafe} />
        </button>
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col gap-1">
          <p
            title={idea.title}
            className="truncate font-medium text-foreground"
          >
            {idea.title}
          </p>
          <p className="hidden truncate text-[12px] text-ink-3 @min-[34rem]/similar-ideas:block">
            {idea.body}
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-3">
            <StatusChip status={idea.status} palette={statusPalette} />
            {shipped && idea.shippedIn ? (
              <span className="hidden whitespace-nowrap @min-[24rem]/similar-ideas:inline">
                in {idea.shippedIn}
              </span>
            ) : null}
            <span className="hidden items-center gap-1 whitespace-nowrap @min-[24rem]/similar-ideas:inline-flex">
              <MessageSquare aria-hidden className="size-3 shrink-0" />
              <motion.span
                key={`c-${idea.comments}`}
                className="inline-block tabular-nums"
                initial={showingReceipt && motionSafe ? { scale: 1.35 } : false}
                animate={{ scale: 1 }}
                transition={{ ...springs.recoil, delay: 0.42 }}
                style={{ originX: 0.5, originY: 0.5 }}
              >
                {idea.comments}
              </motion.span>
            </span>
            <span className="hidden whitespace-nowrap @min-[26rem]/similar-ideas:inline">
              {ago(idea.updated, nowMs)}
            </span>
            {score !== null ? (
              <span className="ml-auto hidden @min-[26rem]/similar-ideas:flex">
                <Strength
                  score={score}
                  style={matchStyle}
                  motionSafe={motionSafe}
                />
              </span>
            ) : null}
          </div>
          {score !== null ? (
            // On a phone the strength gets a line of its own rather than
            // wrapping onto whatever is left of the meta line.
            <div className="flex items-center gap-2 text-[10px] text-ink-3 @min-[26rem]/similar-ideas:hidden">
              <span className="shrink-0">Match</span>
              <Strength
                score={score}
                style={matchStyle}
                motionSafe={motionSafe}
                fill
              />
            </div>
          ) : null}
          {showingReceipt && idea.note ? (
            <motion.div
              initial={
                motionSafe
                  ? { height: 0, opacity: 0 }
                  : { height: "auto", opacity: 0 }
              }
              animate={{ height: "auto", opacity: 1 }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, delay: flight ? 0.32 : 0 },
              }}
              className="overflow-clip"
            >
              <p className="mt-1.5 flex gap-2 rounded-2 border border-hairline bg-surface-0 px-2.5 py-1.5 text-[12px] text-ink-2">
                <span className="shrink-0 text-ink-3">Your note</span>
                <span
                  ref={noteRef}
                  className="min-w-0 truncate text-foreground"
                >
                  {idea.note}
                </span>
              </p>
            </motion.div>
          ) : null}
        </div>
        <button
          type="button"
          tabIndex={tab}
          aria-label={
            idea.following
              ? `Stop following ${idea.title}`
              : `Follow ${idea.title}`
          }
          aria-pressed={Boolean(idea.following)}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            follow(idea);
          }}
          className={cn(
            iconButton,
            "relative z-[1]",
            idea.following && "text-cobalt-bright",
          )}
        >
          <motion.span
            key={idea.following ? "on" : "off"}
            className="inline-flex"
            initial={motionSafe && idea.following ? { rotate: -18 } : false}
            animate={{ rotate: 0 }}
            transition={springs.recoil}
            style={{ originX: 0.5, originY: 0.1 }}
          >
            {idea.following ? (
              <BellRing aria-hidden className="size-4" />
            ) : (
              <Bell aria-hidden className="size-4" />
            )}
          </motion.span>
        </button>
      </motion.div>
    );
  };

  /* The region under the field grows and shrinks on its measured height. */
  const [regionNode, setRegionNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [regionH, setRegionH] = React.useState(0);
  React.useEffect(() => {
    if (!regionNode) return;
    const ro = new ResizeObserver(() => setRegionH(regionNode.offsetHeight));
    ro.observe(regionNode);
    return () => ro.disconnect();
  }, [regionNode]);

  const regionHeader = showingReceipt
    ? receipt?.kind === "posted"
      ? "Posted · under review · you follow it"
      : "Your vote and note were added"
    : listOpen
      ? `${plural(matches.length, "similar idea", "similar ideas")} · vote to add your note`
      : "";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container/similar-ideas relative isolate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash text-cobalt-bright"
        >
          <Lightbulb className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${uid}-title`} className="truncate text-sm font-semibold">
            Suggest an idea
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {product} roadmap · {plural(list.length, "idea", "ideas")} ·{" "}
            {counts[1]?.n ?? 0} planned
          </p>
        </div>
      </header>

      <motion.div
        layoutScroll
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] @min-[44rem]/similar-ideas:grid-cols-[minmax(0,1fr)_13rem]">
          <div className={cn("flex min-w-0 flex-col gap-3", d.pad)}>
            <label
              htmlFor={fieldId}
              className="text-[11px] font-medium text-ink-2"
            >
              Your idea
            </label>
            <div className="relative -mt-1.5">
              <input
                ref={inputRef}
                id={fieldId}
                type="text"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIdea ? `${uid}-opt-${activeIdea.id}` : undefined
                }
                aria-describedby={hintId}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled || status === "loading"}
                value={query}
                placeholder={
                  status === "loading" ? "Loading ideas…" : placeholder
                }
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  writeValue(text);
                }}
                onKeyDown={onFieldKeyDown}
                className={cn(
                  "h-10 w-full rounded-3 border border-hairline-strong bg-surface-0 pr-10 pl-3 text-[14px] text-foreground transition-colors placeholder:text-ink-3",
                  "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                  "disabled:opacity-60",
                )}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-3"
              >
                {searching ? (
                  motionSafe ? (
                    <motion.svg
                      viewBox="0 0 16 16"
                      className="size-4"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1.1,
                        ease: "linear",
                        repeat: Infinity,
                      }}
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        strokeWidth="1.6"
                        className="stroke-hairline-strong"
                      />
                      <path
                        d="M8 2 A6 6 0 0 1 14 8"
                        fill="none"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        className="stroke-ink-2"
                      />
                    </motion.svg>
                  ) : (
                    <motion.span
                      className="font-mono text-[12px] tracking-[0.2em]"
                      animate={{ opacity: [0.35, 1, 0.35] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    >
                      ···
                    </motion.span>
                  )
                ) : null}
              </span>
            </div>

            {status === "error" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-3 border border-hairline px-3 py-2.5 text-[12px] text-ink-2">
                <TriangleAlert
                  aria-hidden
                  className="size-3.5 shrink-0 text-danger"
                />
                <span className="min-w-0 flex-1">
                  The roadmap did not load, so nothing can be matched yet.
                </span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}

            <motion.div
              initial={false}
              animate={{ height: regionH }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              className="-mx-1 overflow-clip px-1"
              style={{ overflowClipMargin: 6 }}
            >
              <div ref={setRegionNode} className="flex flex-col gap-1.5">
                {regionHeader ? (
                  <p className="flex items-center gap-2 px-1 pt-0.5 text-[11px] text-ink-3">
                    <span className="min-w-0 truncate">{regionHeader}</span>
                  </p>
                ) : null}
                {noMatch ? (
                  <motion.div
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.glide,
                            opacity: { duration: durations.base },
                          }
                        : { duration: durations.fast }
                    }
                    className="flex items-start gap-3 rounded-3 border border-dashed border-hairline-strong px-3 py-3"
                  >
                    <Lightbulb
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-cobalt-bright"
                    />
                    <div className="min-w-0 text-[12.5px]">
                      <p className="font-medium text-foreground">
                        No one has asked this yet.
                      </p>
                      <p className="text-ink-3">
                        Post it and others can vote for it.
                      </p>
                    </div>
                  </motion.div>
                ) : null}
                <div
                  id={listId}
                  role={showingReceipt ? undefined : "listbox"}
                  aria-label={showingReceipt ? undefined : "Similar ideas"}
                  className="relative flex flex-col gap-0.5"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {rows.map(row)}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={detailsId}
                className="text-[11px] font-medium text-ink-2"
              >
                Details{" "}
                <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <textarea
                id={detailsId}
                rows={2}
                value={details}
                disabled={disabled}
                placeholder="What would it let you do?"
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setDetails(text);
                }}
                className={cn(
                  "w-full resize-none rounded-3 border border-hairline-strong bg-surface-0 px-3 py-2 text-[13px] text-foreground transition-colors placeholder:text-ink-3",
                  "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 text-[11px] text-ink-3">
                {listOpen
                  ? "Enter votes · Shift+Enter follows"
                  : noMatch
                    ? "Enter posts it"
                    : "Similar ideas appear as you type"}
              </p>
              <button
                type="button"
                onClick={post}
                aria-disabled={disabled || q.length < 3 || undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-2 px-3.5 text-[12px] font-medium transition-colors",
                  listOpen
                    ? "border border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground"
                    : "bg-primary text-primary-foreground",
                  (disabled || q.length < 3) && "opacity-50",
                  FOCUS_RING,
                )}
              >
                {listOpen ? "Post as new anyway" : "Post idea"}
              </button>
            </div>
          </div>

          <aside
            aria-label="Roadmap"
            className="hidden border-l border-hairline bg-surface-0/60 p-4 @min-[44rem]/similar-ideas:flex @min-[44rem]/similar-ideas:flex-col @min-[44rem]/similar-ideas:gap-5"
          >
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-ink-2">Roadmap</p>
              <ul className="flex flex-col gap-1.5">
                {counts.map((c) => (
                  <li
                    key={c.status}
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: PALETTE[statusPalette][c.status] }}
                  >
                    <StatusGlyph status={c.status} />
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {STATUS_LABEL[c.status]}
                    </span>
                    <Rolling
                      value={c.n}
                      motionSafe={motionSafe}
                      className="font-mono text-[11px] text-foreground"
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-ink-2">
                Following{" "}
                <span className="font-normal text-ink-3 tabular-nums">
                  {followed.length}
                </span>
              </p>
              {followed.length === 0 ? (
                <p className="text-[12px] text-ink-3">
                  Follow an idea to hear when it moves.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {followed.map((i) => (
                      <motion.li
                        key={i.id}
                        layout={motionSafe ? "position" : false}
                        initial={{
                          opacity: 0,
                          x: motionSafe ? distances.step : 0,
                        }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          layout: springs.glide,
                          x: motionSafe ? springs.glide : { duration: 0 },
                          opacity: { duration: durations.base },
                        }}
                        className="flex items-center gap-2 text-[12px]"
                        style={{ color: PALETTE[statusPalette][i.status] }}
                      >
                        <StatusGlyph status={i.status} />
                        <span
                          title={i.title}
                          className="min-w-0 flex-1 truncate text-foreground"
                        >
                          {i.title}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </aside>
        </div>
      </motion.div>

      {flight ? (
        <motion.div
          ref={flyerRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 z-20 flex h-[26px] max-w-[60%] items-center rounded-full border border-cobalt-bright/40 bg-cobalt-wash px-2.5 text-[12px] whitespace-nowrap text-foreground shadow-[0_10px_24px_-12px_color-mix(in_oklab,black_45%,transparent)]"
          style={{
            x: fx,
            y: fy,
            scale: fs,
            opacity: fo,
            originX: 0,
            originY: 0.5,
          }}
        >
          <span className="truncate">{flight.text}</span>
        </motion.div>
      ) : null}

      <p id={hintId} className="sr-only">
        Up and Down move through similar ideas, Enter votes for the highlighted
        one and adds your text as a comment, Shift with Enter follows it, Escape
        clears.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
