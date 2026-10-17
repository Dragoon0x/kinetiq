"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  FileCode2,
  GitPullRequest,
  OctagonX,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Square,
  TableProperties,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type RunJournalKind = "note" | "decision" | "warning" | "error";

export type RunJournalEntry = {
  id: string;
  /** When the entry was begun, in ms. */
  at: number;
  /** The prose. `[[artifact-id]]` or `[[artifact-id|words]]` becomes a link to that artifact. */
  text: string;
  /** One line that stands in for the entry once it has condensed. */
  summary: string;
  /** Marks the margin: a decision, a warning or an error. @default "note" */
  kind?: RunJournalKind;
};

export type RunJournalArtifactKind =
  "file" | "migration" | "pr" | "log" | "table";

export type RunJournalArtifact = {
  id: string;
  label: string;
  href: string;
  /** Picks the chip's glyph. @default "file" */
  kind?: RunJournalArtifactKind;
};

export type RunJournalState = "writing" | "paused" | "failed" | "finished";
export type RunJournalNib = "nib" | "pencil" | "caret";
export type RunJournalStatus = "ready" | "loading" | "error";

export type RunJournalProps = {
  /** The journal, oldest first; the newest entry is the one being written. @default defaultRunJournalEntries (9) */
  entries?: RunJournalEntry[];
  /** What the prose can link to, listed again in the footer. @default defaultRunJournalArtifacts (5) */
  artifacts?: RunJournalArtifact[];
  /** Where the run stands. @default "writing" */
  state?: RunJournalState;
  /** Who is writing. @default "Waylight migration agent" */
  agent?: string;
  /** What the run is, under the agent's name. @default "Run 18 · orders → ledger schema" */
  run?: string;
  /** Shown while paused. @default "Waiting for approval of the cut-over plan." */
  pausedReason?: string;
  /** Shown when the run has failed. @default "Stopped: the orders table stayed locked for 30 seconds." */
  error?: string;
  /** The moment the journal is read, in ms; the header counts the run's length to it. @default the newest entry's time */
  now?: number;
  /** Minutes added to UTC before a time is printed. @default 0 */
  utcOffset?: number;
  /** How many of the newest entries stay written out; older ones condense to one line. @default 3 */
  condenseAfter?: number;
  /** Controlled ids of aged entries opened by hand. */
  expanded?: string[];
  /** Initial opened ids when uncontrolled. @default [] */
  defaultExpanded?: string[];
  /** A condensed entry was opened, or an opened one folded again. */
  onExpandEntry?: (id: string, open: boolean) => void;
  /** A link to an artifact was followed — in the prose or the footer. It stays an ordinary link. */
  onOpenArtifact?: (
    artifact: RunJournalArtifact,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => void;
  /** Stop was pressed while writing or paused. */
  onStop?: () => void;
  /** Resume was pressed while paused. */
  onResume?: () => void;
  /** What writes the newest line: a fountain-pen nib, a pencil tip, or a heavy caret. @default "nib" */
  nibStyle?: RunJournalNib;
  /** Wet ink, the nib, decision marks, links and the writing pill — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The journal's height, px; the entries scroll inside it. @default 520 */
  height?: number;
  /** Whether the journal has loaded. @default "ready" */
  status?: RunJournalStatus;
  /** Try again was pressed after the journal failed to load. */
  onReload?: () => void;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 14, 2);

export const defaultRunJournalArtifacts: RunJournalArtifact[] = [
  {
    id: "plan",
    label: "Cut-over plan",
    href: "#waylight-run-18/plan",
    kind: "file",
  },
  {
    id: "m0042",
    label: "Migration 0042",
    href: "#waylight-run-18/migration-0042",
    kind: "migration",
  },
  {
    id: "parked",
    label: "orders_parked",
    href: "#waylight-run-18/orders-parked",
    kind: "table",
  },
  {
    id: "pr",
    label: "Pull request 1186",
    href: "#waylight-run-18/pull-1186",
    kind: "pr",
  },
  { id: "log", label: "Run 18 log", href: "#waylight-run-18/log", kind: "log" },
];

/** Waylight's migration agent moving orders onto the ledger schema. */
export const defaultRunJournalEntries: RunJournalEntry[] = [
  {
    id: "rj-1",
    at: T0,
    text: "Started on the orders migration. Read [[plan|the cut-over plan]] and the current schema: 41 columns, 3.2 million rows, two foreign keys into payments.",
    summary: "Read the plan and the orders schema.",
  },
  {
    id: "rj-2",
    at: T0 + 3 * MIN,
    text: "Wrote [[m0042]] to add the ledger columns beside the old ones, so nothing ever reads a half-moved table.",
    summary: "Added the ledger columns beside the old ones.",
  },
  {
    id: "rj-3",
    at: T0 + 7 * MIN,
    kind: "decision",
    text: "Decided to backfill in batches of 50,000 rows instead of one pass. A single update would hold the table lock for about four minutes.",
    summary: "Chose 50,000-row batches over one long lock.",
  },
  {
    id: "rj-4",
    at: T0 + 14 * MIN,
    text: "Backfilled 1.1 million rows. Each batch takes 1.8 seconds and replica lag stays under a second.",
    summary: "Backfilled 1.1 million rows.",
  },
  {
    id: "rj-5",
    at: T0 + 19 * MIN,
    kind: "warning",
    text: "Found 212 orders in a currency the ledger does not know. Parked them in [[parked|a holding table]] rather than guess at a rate.",
    summary: "Parked 212 orders with unknown currencies.",
  },
  {
    id: "rj-6",
    at: T0 + 26 * MIN,
    text: "Finished the backfill: 3.2 million rows, and the checksums match on every batch.",
    summary: "Backfill finished; checksums match.",
  },
  {
    id: "rj-7",
    at: T0 + 29 * MIN,
    kind: "decision",
    text: "Switching reads to the new columns behind a flag, starting with 5% of traffic.",
    summary: "Moved 5% of reads to the ledger columns.",
  },
  {
    id: "rj-8",
    at: T0 + 34 * MIN,
    text: "No errors at 5% after five minutes, so I raised it to half. Opened [[pr]] to drop the old columns next week.",
    summary: "Half of reads on the ledger columns.",
  },
  {
    id: "rj-9",
    at: T0 + 38 * MIN,
    text: "Every read is on the ledger columns now. The old ones stay until the pull request merges; [[log|the run log]] has each batch.",
    summary: "All reads moved; the cleanup is in review.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;

const clock = (ms: number, offset: number) => {
  const d = new Date(ms + offset * MIN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

type Piece =
  { kind: "text"; text: string } | { kind: "link"; id: string; text: string };

/** Prose and `[[id|words]]` links. An unclosed `[[` (mid-stream) is held back until it closes. */
function parse(
  text: string,
  artifacts: Map<string, RunJournalArtifact>,
): Piece[] {
  const open = text.lastIndexOf("[[");
  const safe =
    open !== -1 && text.indexOf("]]", open) === -1 ? text.slice(0, open) : text;
  const out: Piece[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  for (const m of safe.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: safe.slice(last, at) });
    const id = (m[1] ?? "").trim();
    const words = m[2]?.trim() || artifacts.get(id)?.label || id;
    out.push({ kind: "link", id, text: words });
    last = at + m[0].length;
  }
  if (last < safe.length) out.push({ kind: "text", text: safe.slice(last) });
  return out;
}

const plain = (text: string, artifacts: Map<string, RunJournalArtifact>) =>
  parse(text, artifacts)
    .map((p) => p.text)
    .join("");

function ArtifactGlyph({ kind }: { kind?: RunJournalArtifactKind }) {
  const cls = "size-3.5 shrink-0";
  if (kind === "pr") return <GitPullRequest aria-hidden className={cls} />;
  if (kind === "migration") return <FileCode2 aria-hidden className={cls} />;
  if (kind === "log") return <ScrollText aria-hidden className={cls} />;
  if (kind === "table") return <TableProperties aria-hidden className={cls} />;
  return <FileCode2 aria-hidden className={cls} />;
}

/**
 * A box whose height follows its content on glide, measured, so an entry
 * that condenses to one line (or opens again) never jumps the journal.
 */
function Measured({
  glide,
  clip,
  children,
}: {
  glide: boolean;
  clip: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={clip ? { overflow: "clip", overflowClipMargin: 6 } : undefined}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/** Freshly written words arrive in the accent and dry to ink. */
function Wet({
  dryNow,
  children,
}: {
  dryNow: boolean;
  children: React.ReactNode;
}) {
  const [dry, setDry] = React.useState(dryNow);
  React.useEffect(() => {
    if (dryNow) return;
    let inner = 0;
    // Two frames: the wet colour has to paint once before it can dry.
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setDry(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [dryNow]);
  return (
    <span
      className={cn(
        "transition-colors duration-[600ms] ease-out",
        dry || dryNow ? "text-foreground" : "text-(--rj-accent)",
      )}
    >
      {children}
    </span>
  );
}

function NibShape({ style }: { style: RunJournalNib }) {
  if (style === "pencil") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 16 28"
        width={12}
        height={21}
        className="block overflow-visible"
      >
        <path
          d="M8 28 4.6 19.5h6.8Z"
          fill="oklch(from var(--warn) 0.82 0.08 h)"
        />
        <path d="M8 28 6.9 25.2h2.2Z" className="fill-ink" />
        <rect
          x={4.6}
          y={2}
          width={6.8}
          height={17.5}
          rx={1}
          fill="var(--rj-solid)"
        />
        <rect
          x={4.6}
          y={2}
          width={6.8}
          height={3.5}
          rx={1}
          className="fill-ink-3"
        />
        <path d="M8 5.5v14" stroke="oklch(1 0 0 / 0.35)" strokeWidth={1} />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 28"
      width={12}
      height={21}
      className="block overflow-visible"
    >
      <path
        d="M8 28 3 15.5Q2.4 12.6 4.3 11L5.8 9.8V2.5h4.4v7.3L11.7 11Q13.6 12.6 13 15.5Z"
        fill="var(--rj-solid)"
      />
      <path
        d="M8 27.4V15"
        stroke="var(--card)"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <circle cx={8} cy={14.2} r={1.3} fill="var(--card)" />
      <path d="M6 9.6h4" stroke="oklch(1 0 0 / 0.3)" strokeWidth={0.8} />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An agent's run written up as it goes: a journal of short paragraphs with
 * their times in the margin. The newest line is written by a pen nib that
 * rides the end of the text — after each chunk arrives the nib's target is
 * measured from a marker at the end of the words and it moves there on
 * `springs.flick` along the line and `springs.glide` when the text wraps,
 * leaning with its speed; the words it has just written arrive in the accent
 * and dry to ink. Only the newest `condenseAfter` entries stay written out:
 * as an entry ages past that it condenses on `springs.glide` into its one-line
 * summary, its measured height closing as the summary fades in, so the
 * journal stays short. A condensed line opens again on press or Enter.
 *
 * Up and Down move between entries, Home and End jump, Enter opens or folds
 * an aged entry, and links stay ordinary links. Paused lifts the nib away,
 * failed stops it and marks the margin, finished draws a closing rule. Under
 * 19rem the times move above each entry. Under reduced motion the nib sits at
 * the end of the text without travel, ink is drawn dry and condensing swaps
 * at once; every word and state still shows.
 */
export function RunJournal({
  entries = defaultRunJournalEntries,
  artifacts = defaultRunJournalArtifacts,
  state = "writing",
  agent = "Waylight migration agent",
  run = "Run 18 · orders → ledger schema",
  pausedReason = "Waiting for approval of the cut-over plan.",
  error = "Stopped: the orders table stayed locked for 30 seconds.",
  now,
  utcOffset = 0,
  condenseAfter = 3,
  expanded,
  defaultExpanded,
  onExpandEntry,
  onOpenArtifact,
  onStop,
  onResume,
  nibStyle = "nib",
  accent = "var(--accent-bright)",
  height = 520,
  status = "ready",
  onReload,
  className,
}: RunJournalProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";

  const byId = React.useMemo(
    () => new Map(artifacts.map((a) => [a.id, a])),
    [artifacts],
  );
  const keep = Math.max(1, Math.round(condenseAfter));
  const n = entries.length;
  const last = entries[n - 1];
  const writing = state === "writing";

  const [ownOpen, setOwnOpen] = React.useState<string[]>(
    () => defaultExpanded ?? [],
  );
  const openIds = new Set(expanded ?? ownOpen);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");

  const aged = (i: number) => i < n - keep;
  const condensed = (e: RunJournalEntry, i: number) =>
    aged(i) && !openIds.has(e.id);

  /* ----------------------------- announcements --------------------------- */

  // An entry is announced once, when the next one begins (it is complete),
  // and each change of state is announced from the render that sees it.
  const [heard, setHeard] = React.useState({ count: n, state });
  if (heard.count !== n || heard.state !== state) {
    const finished = n > heard.count ? entries[n - 2] : undefined;
    setHeard({ count: n, state });
    if (state !== heard.state) {
      setSaid(
        state === "paused"
          ? `Paused. ${pausedReason}`
          : state === "failed"
            ? `Run failed. ${error}`
            : state === "finished"
              ? `Run finished with ${n} ${n === 1 ? "entry" : "entries"}.`
              : "Writing again.",
      );
    } else if (finished) {
      setSaid(`${clock(finished.at, utcOffset)}. ${finished.summary}`);
    }
  }

  /* ------------------------------ wet ink -------------------------------- */

  const lastText = last?.text ?? "";
  const lastId = last?.id ?? "";
  // Where each recent chunk began, so every chunk dries on its own clock.
  const [ink, setInk] = React.useState({
    id: lastId,
    text: lastText,
    marks: [] as number[],
  });
  if (ink.id !== lastId || ink.text !== lastText) {
    const grew = ink.id === lastId && lastText.startsWith(ink.text);
    const fresh = ink.id !== lastId;
    setInk({
      id: lastId,
      text: lastText,
      marks: grew
        ? [...ink.marks, ink.text.length].slice(-6)
        : fresh && n > 0
          ? [0]
          : [],
    });
  }

  /* -------------------------------- toggling ------------------------------ */

  const toggle = (e: RunJournalEntry) => {
    const open = !openIds.has(e.id);
    const next = open
      ? [...openIds, e.id]
      : [...openIds].filter((id) => id !== e.id);
    if (expanded === undefined) setOwnOpen(next);
    setSaid(open ? `Opened: ${e.summary}` : `Folded: ${e.summary}`);
    onExpandEntry?.(e.id, open);
  };

  /* ------------------------------- keyboard ------------------------------- */

  const rowRefs = React.useRef(new Map<string, HTMLElement>());
  const rovingId =
    focusId && entries.some((e) => e.id === focusId)
      ? focusId
      : (last?.id ?? null);

  const onEntryKey = (
    event: React.KeyboardEvent,
    e: RunJournalEntry,
    i: number,
  ) => {
    if (event.target !== event.currentTarget) return;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = Math.min(n - 1, i + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if ((event.key === "Enter" || event.key === " ") && aged(i)) {
      event.preventDefault();
      toggle(e);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    const id = entries[next]?.id;
    if (!id) return;
    setFocusId(id);
    rowRefs.current.get(id)?.focus();
  };

  /* ------------------------------ focus rescue ---------------------------- */

  // Stop and Resume leave with the state they end; focus goes on to what is
  // still there (Stop, the state line, the journal) rather than the body.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const stopRef = React.useRef<HTMLButtonElement | null>(null);
  const lineRef = React.useRef<HTMLParagraphElement | null>(null);
  const rescue = React.useRef(false);
  React.useEffect(() => {
    if (!rescue.current) return;
    rescue.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    (stopRef.current ?? lineRef.current ?? rootRef.current)?.focus({
      preventScroll: true,
    });
  }, [state]);

  /* -------------------------------- scroll -------------------------------- */

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLOListElement | null>(null);
  const pinned = React.useRef(true);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
  };

  // While the reader is at the newest line, growth keeps it in view.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!listNode || !el) return;
    el.scrollTop = el.scrollHeight;
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(listNode);
    return () => ro.disconnect();
  }, [listNode]);

  /* ---------------------------------- nib --------------------------------- */

  const [proseNode, setProseNode] = React.useState<HTMLElement | null>(null);
  const endRef = React.useRef<HTMLSpanElement | null>(null);
  const nibX = useMotionValue(0);
  const nibY = useMotionValue(0);
  const velocity = useVelocity(nibX);
  const lean = useTransform(velocity, (v) =>
    r2(Math.max(-14, Math.min(14, v * 0.02))),
  );
  const tilt = useTransform(lean, (l) => r2(40 - l));
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const placed = React.useRef(false);

  const placedFor = React.useRef("");
  const place = React.useCallback(
    (animated: boolean) => {
      const end = endRef.current;
      const box = end?.parentElement;
      if (!box || !end) return;
      const b = box.getBoundingClientRect();
      const e = end.getBoundingClientRect();
      const x = r2(e.left - b.left);
      const y = r2(e.bottom - b.top - 4);
      for (const c of runs.current) c.stop();
      runs.current = [];
      const entry = end.dataset.rjFor ?? "";
      if (!animated || !placed.current) {
        nibX.jump(x);
        nibY.jump(y);
        placed.current = true;
        placedFor.current = entry;
        return;
      }
      if (placedFor.current !== entry) {
        // A new entry: the nib returns to the margin of its first line.
        placedFor.current = entry;
        nibX.jump(0);
        nibY.jump(r2(Math.min(y, 20)));
      }
      // Along the line the nib flicks after the words; a new line is a
      // longer, gliding move back to the margin.
      const wrapped = Math.abs(y - nibY.get()) > 2;
      const spring = wrapped ? springs.glide : springs.flick;
      runs.current = [animate(nibX, x, spring), animate(nibY, y, spring)];
    },
    [nibX, nibY],
  );

  React.useLayoutEffect(() => {
    place(motionSafe);
  }, [place, motionSafe, lastText, lastId, keep, state, nibStyle]);

  React.useEffect(() => {
    if (!proseNode) return;
    // Only a change of width re-flows the words under the nib; growth in
    // height is the writing itself, which the layout effect animates.
    let width = proseNode.clientWidth;
    const ro = new ResizeObserver(() => {
      if (proseNode.clientWidth === width) return;
      width = proseNode.clientWidth;
      place(false);
    });
    ro.observe(proseNode);
    return () => {
      ro.disconnect();
      for (const c of runs.current) c.stop();
      runs.current = [];
    };
  }, [proseNode, place]);

  /* ------------------------------- rendering ------------------------------ */

  const linkOf = (piece: Extract<Piece, { kind: "link" }>, key: React.Key) => {
    const art = byId.get(piece.id);
    if (!art) return <span key={key}>{piece.text}</span>;
    return (
      <a
        key={key}
        href={art.href}
        onClick={(event) => onOpenArtifact?.(art, event)}
        className={cn(
          "rounded-1 font-medium text-(--rj-accent) underline decoration-[color-mix(in_oklab,var(--rj-accent)_40%,transparent)] decoration-1 underline-offset-[3px] transition-colors hover:decoration-(--rj-accent)",
          FOCUS,
        )}
      >
        {piece.text}
      </a>
    );
  };

  /** Prose with links; text past each wet mark is drawn wet and dries on its own. */
  const prose = (text: string, marks: number[]) => {
    const pieces = parse(text, byId);
    const out: React.ReactNode[] = [];
    let at = 0;
    pieces.forEach((piece, i) => {
      if (piece.kind === "link") {
        out.push(linkOf(piece, `l${i}`));
        at += piece.text.length;
        return;
      }
      const t = piece.text;
      const end = at + t.length;
      const cuts = [at, ...marks.filter((m) => m > at && m < end), end];
      for (let c = 0; c < cuts.length - 1; c++) {
        const from = cuts[c] ?? at;
        const to = cuts[c + 1] ?? end;
        if (to <= from) continue;
        const slice = t.slice(from - at, to - at);
        const mark = [...marks].reverse().find((m) => m <= from);
        if (mark === undefined) out.push(slice);
        else
          out.push(
            <Wet key={`w${mark}-${i}`} dryNow={!motionSafe}>
              {slice}
            </Wet>,
          );
      }
      at = end;
    });
    return out;
  };

  const wetMarks =
    writing && ink.id === lastId
      ? ink.marks.map((m) => plain(lastText.slice(0, m), byId).length)
      : [];

  const marginMark = (kind: RunJournalKind | undefined) =>
    kind === "decision" ? (
      <span
        aria-hidden
        className="size-1.5 shrink-0 rotate-45 bg-(--rj-accent)"
      />
    ) : kind === "warning" ? (
      <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-warn" />
    ) : kind === "error" ? (
      <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-danger" />
    ) : null;

  const kindWord = (kind: RunJournalKind | undefined) =>
    kind === "decision"
      ? "Decision. "
      : kind === "warning"
        ? "Warning. "
        : kind === "error"
          ? "Error. "
          : "";

  const nib = (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ x: nibX, y: nibY }}
    >
      {nibStyle === "caret" ? (
        <motion.span
          className="absolute bottom-[1px] left-[1px] block w-[3px] rounded-full bg-(--rj-accent)"
          style={{ height: "1.15em" }}
          animate={{ opacity: state === "paused" ? 0.35 : 1 }}
          transition={{ duration: durations.base }}
        />
      ) : (
        <motion.span
          className="absolute bottom-0 left-[-6px] block"
          style={{ rotate: motionSafe ? tilt : 40, originX: 0.5, originY: 1 }}
        >
          <motion.span
            className="block"
            animate={
              state === "paused"
                ? {
                    y: motionSafe ? -10 : 0,
                    x: motionSafe ? 6 : 0,
                    opacity: 0.55,
                  }
                : state === "finished"
                  ? { y: motionSafe ? -6 : 0, opacity: 0 }
                  : { y: 0, x: 0, opacity: 1 }
            }
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            <NibShape style={nibStyle} />
          </motion.span>
        </motion.span>
      )}
    </motion.span>
  );

  const entryRow = (e: RunJournalEntry, i: number) => {
    const isLast = i === n - 1;
    const small = condensed(e, i);
    const time = clock(e.at, utcOffset);
    const failedHere = isLast && state === "failed";
    return (
      <li key={e.id}>
        <article
          ref={(node) => {
            if (node) rowRefs.current.set(e.id, node);
            else rowRefs.current.delete(e.id);
          }}
          tabIndex={e.id === rovingId ? 0 : -1}
          aria-posinset={i + 1}
          aria-setsize={n}
          aria-describedby={hintId}
          aria-label={`${time}. ${kindWord(e.kind)}${small ? `${e.summary} Condensed.` : plain(e.text, byId)}`}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusId(e.id);
          }}
          onKeyDown={(event) => onEntryKey(event, e, i)}
          className={cn(
            "relative grid grid-cols-1 gap-y-0.5 rounded-2 py-1.5 @min-[19rem]/run-journal:grid-cols-[2.75rem_minmax(0,1fr)] @min-[19rem]/run-journal:gap-x-3",
            FOCUS,
          )}
        >
          <div className="flex items-center gap-1.5 pt-px @min-[19rem]/run-journal:h-6 @min-[19rem]/run-journal:items-start @min-[19rem]/run-journal:pt-[5px]">
            <span className="font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
              {time}
            </span>
            {marginMark(failedHere ? "error" : e.kind)}
          </div>
          <Measured glide={motionSafe && !isLast} clip={!isLast}>
            {small ? (
              <motion.button
                type="button"
                tabIndex={-1}
                aria-expanded={false}
                onClick={() => toggle(e)}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="group/run-journal flex h-6 w-full min-w-0 items-center gap-1.5 rounded-1 text-left text-[13px] text-ink-2 transition-colors hover:text-foreground"
              >
                <span className="min-w-0 truncate" title={e.summary}>
                  {e.summary}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover/run-journal:translate-y-px"
                />
              </motion.button>
            ) : (
              <motion.div
                initial={aged(i) ? { opacity: motionSafe ? 0 : 1 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <p
                  ref={isLast ? setProseNode : undefined}
                  className={cn(
                    "relative text-[13.5px] leading-6 text-foreground",
                    (e.kind === "warning" ||
                      e.kind === "error" ||
                      failedHere) &&
                      "border-l-2 pl-2.5",
                    e.kind === "warning" && !failedHere && "border-warn",
                    (e.kind === "error" || failedHere) && "border-danger",
                  )}
                >
                  {prose(e.text, isLast ? wetMarks : [])}
                  {isLast ? (
                    <span
                      ref={endRef}
                      aria-hidden
                      data-rj-for={e.id}
                      className="inline-block h-[1em] w-0 align-baseline"
                    />
                  ) : null}
                  {isLast && state !== "failed" ? nib : null}
                </p>
                {aged(i) ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-expanded
                    onClick={() => toggle(e)}
                    className="mt-0.5 inline-flex h-6 items-center gap-1 rounded-1 text-[11px] text-ink-3 transition-colors hover:text-foreground"
                  >
                    <ChevronUp aria-hidden className="size-3.5" />
                    Fold
                  </button>
                ) : null}
                {isLast && state === "finished" ? (
                  <motion.span
                    aria-hidden
                    className="mt-2 block h-px w-24 bg-(--rj-accent)"
                    style={{ originX: 0 }}
                    initial={{ scaleX: motionSafe ? 0 : 1, opacity: 0.8 }}
                    animate={{ scaleX: 1, opacity: 0.8 }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                ) : null}
              </motion.div>
            )}
          </Measured>
        </article>
      </li>
    );
  };

  /* -------------------------------- chrome -------------------------------- */

  const pill =
    state === "writing"
      ? {
          text: "Writing",
          cls: "bg-(--rj-wash) text-(--rj-accent)",
          dot: "bg-(--rj-accent)",
        }
      : state === "paused"
        ? {
            text: "Paused",
            cls: "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn",
            dot: "bg-warn",
          }
        : state === "failed"
          ? {
              text: "Failed",
              cls: "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger",
              dot: "bg-danger",
            }
          : {
              text: "Finished",
              cls: "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success",
              dot: "bg-success",
            };

  const first = entries[0];
  const nowMs = now ?? last?.at ?? T0;
  const minutes = first ? Math.max(0, Math.round((nowMs - first.at) / MIN)) : 0;

  const smallButton = cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
    FOCUS,
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--rj-wash) text-(--rj-accent)"
        >
          <ScrollText className="size-4" />
        </span>
        <div className="min-w-0">
          <p
            id={titleId}
            className="truncate text-[13px] font-semibold text-foreground"
          >
            {agent}
          </p>
          <p className="truncate text-[12px] leading-4 text-ink-3">
            {run}
            {first ? (
              <span className="tabular-nums">{` · ${clock(first.at, utcOffset)}, ${minutes} min`}</span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {ready ? (
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
              pill.cls,
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", pill.dot)}
            />
            {pill.text}
          </span>
        ) : null}
        {state === "paused" && ready ? (
          <button
            type="button"
            onClick={() => {
              rescue.current = true;
              onResume?.();
            }}
            className={smallButton}
          >
            <Play aria-hidden className="size-3" />
            Resume
          </button>
        ) : null}
        {(state === "writing" || state === "paused") && ready ? (
          <button
            ref={stopRef}
            type="button"
            onClick={() => {
              rescue.current = true;
              onStop?.();
            }}
            className={smallButton}
          >
            <Square aria-hidden className="size-3" />
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );

  const stateLine =
    state === "paused" ? (
      <p
        ref={lineRef}
        tabIndex={-1}
        className={cn(
          "mt-1 flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] px-3 py-2 text-[12px] leading-5 text-foreground",
          FOCUS,
        )}
      >
        <Pause aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
        {`Paused — ${pausedReason.charAt(0).toLowerCase()}${pausedReason.slice(1)}`}
      </p>
    ) : state === "failed" ? (
      <p
        ref={lineRef}
        tabIndex={-1}
        className={cn(
          "mt-1 flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2 text-[12px] leading-5 text-foreground",
          FOCUS,
        )}
      >
        <OctagonX
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-danger"
        />
        {error}
      </p>
    ) : state === "finished" ? (
      <p
        ref={lineRef}
        tabIndex={-1}
        className={cn(
          "mt-1 flex items-center gap-2 rounded-2 px-1 text-[12px] leading-5 text-ink-2",
          FOCUS,
        )}
      >
        <CircleCheck aria-hidden className="size-3.5 shrink-0 text-success" />
        <span className="tabular-nums">
          {`Finished ${clock(nowMs, utcOffset)} · ${n} ${n === 1 ? "entry" : "entries"} · ${artifacts.length} ${artifacts.length === 1 ? "artifact" : "artifacts"}`}
        </span>
      </p>
    ) : null;

  const footer =
    artifacts.length > 0 && ready ? (
      <div className="border-t border-hairline px-4 py-2.5">
        <ul
          aria-label="Artifacts"
          className="flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] pr-6"
        >
          {artifacts.map((a) => (
            <li key={a.id} className="shrink-0">
              <a
                href={a.href}
                onClick={(event) => onOpenArtifact?.(a, event)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-[12px] whitespace-nowrap text-ink-2 transition-colors hover:border-hairline-strong hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                <ArtifactGlyph kind={a.kind} />
                {a.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const body =
    status === "loading" ? (
      <div
        className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-4"
        aria-busy="true"
      >
        {[0.92, 0.7, 0.84].map((w, i) => (
          <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.2 }}>
            <span className="h-3 w-9 shrink-0 rounded-1 bg-surface-2" />
            <span className="flex flex-1 flex-col gap-2">
              <span
                className="h-3 rounded-1 bg-surface-2"
                style={{ width: `${w * 100}%` }}
              />
              <span className="h-3 w-1/2 rounded-1 bg-surface-2" />
            </span>
          </div>
        ))}
        <p className="text-[12px] text-ink-3">Opening the journal…</p>
      </div>
    ) : status === "error" ? (
      <div className="m-4 flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <p className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          The run journal could not be loaded.
        </p>
        <button type="button" onClick={onReload} className={smallButton}>
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : (
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_16px)] px-4 pt-3 pb-4"
      >
        {n === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">
            The agent has not written anything yet.
          </p>
        ) : (
          <ol
            ref={setListNode}
            aria-label={`${agent}, journal`}
            className="flex flex-col gap-1"
          >
            {entries.map(entryRow)}
          </ol>
        )}
        {stateLine}
      </div>
    );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/run-journal relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground outline-none",
        className,
      )}
      style={
        {
          height,
          "--rj-accent": accent,
          "--rj-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
          "--rj-solid": `oklch(from ${accent} 0.5 c h)`,
        } as React.CSSProperties
      }
    >
      {header}
      {body}
      {footer}
      <p id={hintId} className="sr-only">
        Up and Down move between entries. Enter opens or folds an older entry.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
