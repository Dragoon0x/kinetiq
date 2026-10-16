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
  ArrowUp,
  ChevronRight,
  CornerDownRight,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SpurAnswer = {
  text: string;
  /** Phrases in the text worth following, offered as dotted links. */
  phrases?: string[];
};

export type SpurTurn = {
  id: string;
  prompt: string;
  status: "loading" | "ready" | "empty" | "failed";
  answer?: SpurAnswer;
};

export type SpurColumn = {
  id: string;
  /** The phrase this column follows. The first column has none. */
  phrase?: string;
  /** The column it was opened from. */
  parentId?: string;
  turns: SpurTurn[];
};

export type SpurAnswerContext = {
  columnId: string;
  /** The phrase of the column being answered in. */
  phrase?: string;
  /** A new spur, or a follow-up asked in a column. */
  kind: "spur" | "ask";
};

export type SpurAnswerFor = (
  prompt: string,
  context: SpurAnswerContext,
) => SpurAnswer | null | Promise<SpurAnswer | null>;

export type SpurSpineStyle = "label" | "index" | "bar";
export type SpurStatus = "ready" | "loading" | "error";

export type SpurColumnsProps = {
  /** Controlled columns, left to right. */
  columns?: SpurColumn[];
  /** Initial columns when uncontrolled. @default defaultSpurColumns */
  defaultColumns?: SpurColumn[];
  /** Fires with every column after an open, a close, an ask or an answer. */
  onColumnsChange?: (columns: SpurColumn[]) => void;
  /** Answers a spur's phrase or a follow-up: an answer, null for nothing to say, or a promise of either (a rejection shows the failed state). @default defaultSpurAnswerFor */
  answerFor?: SpurAnswerFor;
  /** A follow-up was asked in a column. */
  onAsk?: (text: string, columnId: string) => void;
  /** A spur was opened from a phrase in a column. */
  onOpenSpur?: (
    phrase: string,
    fromColumnId: string,
    column: SpurColumn,
  ) => void;
  /** A spur (and any spurs opened from it) was folded away. */
  onCloseSpur?: (columnId: string) => void;
  /** Controlled active column id. */
  active?: string;
  /** Initial active column when uncontrolled. @default the last column */
  defaultActive?: string;
  /** Fires from the key, spine, chip or swipe that changed the active column. */
  onActiveChange?: (columnId: string) => void;
  /** The width a column needs to stay open, in px; narrower ones become spines. @default 280 */
  columnWidth?: number;
  /** A spine's width in px. @default 40 */
  spineWidth?: number;
  /** Spines read the phrase set vertically, show a large number, or a slim accent bar. @default "label" */
  spineStyle?: SpurSpineStyle;
  /** Phrase marks, the carried chip, spines, the active edge and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Below this container width (px) the columns become a stack you swipe. @default 520 */
  stackBelow?: number;
  /** Selecting words in an answer offers "Ask about this". @default true */
  allowSelection?: boolean;
  /** Longest selection, in characters, that can become a spur. @default 64 */
  maxPhrase?: number;
  /** The first column's heading. @default "Fernworks onboarding" */
  title?: string;
  /** Whether the thread has loaded. @default "ready" */
  status?: SpurStatus;
  /** "Try again" was pressed after the thread failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; each column scrolls inside it. @default 540 */
  height?: number;
  /** Read only: columns can be walked, nothing opened or asked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const ANSWERS: Record<string, SpurAnswer> = {
  "workspace roles": {
    text: "Fernworks has three roles. Admins manage billing, SSO and who can join. Members create and edit boards in any team they belong to. Viewers can read and comment but not edit. Change a role any time from Members in settings, and a team can override it for its own boards.",
    phrases: [
      "Viewers",
      "Members in settings",
      "override it for its own boards",
    ],
  },
  "guest seats": {
    text: "Guest seats let people outside your company see shared boards without a paid seat. Guests can comment and react, but they can't create boards or see anything not shared with them. Each workspace gets fifty guest seats; past that, guests count as members.",
    phrases: ["shared boards", "fifty guest seats"],
  },
  sso: {
    text: "Single sign-on lets people use your company login instead of a Fernworks password. Connect it under Security in settings with your identity provider's metadata. Once it's on, you can require it for everyone and turn on SCIM provisioning so accounts appear and disappear with your directory.",
    phrases: ["require it for everyone", "SCIM provisioning"],
  },
  "import your boards": {
    text: "Import takes CSV files and exports from most planning tools. Columns become fields, rows become cards, and a status column turns into lanes. Large imports run in the background, and you get a summary of anything that didn't map.",
    phrases: ["status column turns into lanes", "run in the background"],
  },
  "onboarding checklist": {
    text: "The checklist sits in the sidebar until it's done: name the workspace, invite your team, connect SSO, import a board and run your first standup. Each step links to where you do it, and admins can hide it for everyone.",
    phrases: ["run your first standup"],
  },
  "scim provisioning": {
    text: "SCIM keeps Fernworks in step with your directory. New hires get an account the moment they're added, leavers lose access when they're removed, and group changes update team membership overnight.",
    phrases: ["team membership"],
  },
  "require it for everyone": {
    text: "With SSO required, password sign-in disappears for members. Admins keep one backup password in case the identity provider is down, and guests still sign in with an email link.",
  },
  viewers: {
    text: "Viewers are free and unlimited. They see every board in the teams they belong to, can comment and react, and can be promoted to members whenever they need to edit.",
    phrases: ["promoted to members"],
  },
  "status column turns into lanes": {
    text: "Pick the column that holds each row's state, like To do, Doing and Done. Every distinct value becomes a lane, in the order it first appears; you can reorder lanes after the import.",
  },
  "run your first standup": {
    text: "Standup mode walks the board person by person: each card someone owns lights up, and a timer keeps every turn to a minute. Notes land on the cards they're about.",
  },
};

/** Canned answers for the default Fernworks thread, after a short think. */
export const defaultSpurAnswerFor: SpurAnswerFor = (prompt) => {
  const key = prompt.trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const wait = 650 + ((h >>> 0) % 450);
  return new Promise((resolve) => {
    setTimeout(() => resolve(ANSWERS[key] ?? null), wait);
  });
};

export const defaultSpurColumns: SpurColumn[] = [
  {
    id: "root",
    turns: [
      {
        id: "t0",
        prompt: "How do I get my team set up on Fernworks?",
        status: "ready",
        answer: {
          text: "Start by creating a workspace and choosing workspace roles for the people you invite. Guest seats are free for clients who only need to comment. If your company signs in with SSO, connect it before you invite anyone so accounts are created the right way. Then import your boards from spreadsheets or another tool, and work through the onboarding checklist in the sidebar; it takes about twenty minutes.",
          phrases: [
            "workspace roles",
            "Guest seats",
            "SSO",
            "import your boards",
            "onboarding checklist",
          ],
        },
      },
    ],
  },
  {
    id: "c-roles",
    phrase: "workspace roles",
    parentId: "root",
    turns: [
      {
        id: "t1",
        prompt: "Tell me more about “workspace roles”",
        status: "ready",
        answer: ANSWERS["workspace roles"],
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

const GAP = 8;
/** The viewport's padding, around the row of columns. */
const PAD = 8;

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

let idCounter = 0;
const nextId = (prefix: string) => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

/** Every column opened from `id`, at any depth, and `id` itself. */
const lineage = (columns: SpurColumn[], id: string) => {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of columns) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
};

type Layout = { widths: number[]; open: boolean[] };

/**
 * Which columns stay open: the active one and the rightmost always, then as
 * many more from the right as fit at `columnWidth`; the rest become spines.
 * Older open columns hold at `columnWidth`, and the newest takes the rest —
 * it is the one being read.
 */
function layoutFor(
  count: number,
  active: number,
  width: number,
  columnWidth: number,
  spineWidth: number,
): Layout {
  const open = Array.from({ length: count }, () => false);
  if (count === 0) return { widths: [], open };
  open[count - 1] = true;
  if (active >= 0 && active < count) open[active] = true;
  const fits = (k: number) =>
    k * columnWidth + (count - k) * spineWidth + (count - 1) * GAP <= width;
  let k = open.filter(Boolean).length;
  for (let i = count - 2; i >= 0; i -= 1) {
    if (open[i]) continue;
    if (fits(k + 1)) {
      open[i] = true;
      k += 1;
    }
  }
  const spines = count - k;
  const rest = width - spines * spineWidth - (count - 1) * GAP;
  // When even the minimum does not fit, the open columns share what there is.
  const held = Math.min(columnWidth, rest / Math.max(1, k));
  const last = Math.max(held, rest - held * (k - 1));
  return {
    widths: open.map((o, i) =>
      r1(!o ? spineWidth : i === count - 1 ? last : held),
    ),
    open,
  };
}

type Piece =
  | { kind: "text"; text: string }
  | { kind: "suggest"; text: string }
  | { kind: "spur"; text: string; columnId: string; number: number };

/** Splits an answer into plain text, suggested phrases and opened spurs. */
function piecesOf(
  text: string,
  suggested: string[],
  opened: { phrase: string; columnId: string; number: number }[],
): Piece[] {
  const lower = text.toLowerCase();
  type Hit = { start: number; end: number; piece: Piece };
  const hits: Hit[] = [];
  const taken = (s: number, e: number) =>
    hits.some((h) => s < h.end && e > h.start);
  for (const o of opened) {
    const at = lower.indexOf(o.phrase.toLowerCase());
    if (at < 0 || taken(at, at + o.phrase.length)) continue;
    hits.push({
      start: at,
      end: at + o.phrase.length,
      piece: {
        kind: "spur",
        text: text.slice(at, at + o.phrase.length),
        columnId: o.columnId,
        number: o.number,
      },
    });
  }
  for (const p of suggested) {
    const at = lower.indexOf(p.toLowerCase());
    if (at < 0 || taken(at, at + p.length)) continue;
    hits.push({
      start: at,
      end: at + p.length,
      piece: { kind: "suggest", text: text.slice(at, at + p.length) },
    });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor)
      out.push({ kind: "text", text: text.slice(cursor, h.start) });
    out.push(h.piece);
    cursor = h.end;
  }
  if (cursor < text.length)
    out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}

/** The first line box of a phrase: where a wrapped phrase starts. */
const firstRect = (node: HTMLElement) =>
  node.getClientRects()[0] ?? node.getBoundingClientRect();

/**
 * A phrase you can act on that still wraps like the words around it. A real
 * button is drawn as an inline block, which cannot break across lines; this is
 * a span with the button role, a tab stop, and Enter and Space.
 */
function InlineAction({
  label,
  disabled,
  onAct,
  className,
  children,
  ...data
}: {
  label: string;
  disabled?: boolean;
  onAct: (node: HTMLElement) => void;
  className?: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        if (!disabled) onAct(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAct(event.currentTarget);
        }
      }}
      className={cn(FOCUS_RING, className)}
      {...data}
    >
      {children}
    </span>
  );
}

type Ghost = {
  key: number;
  text: string;
  from: { x: number; y: number; w: number };
  to: { x: number; y: number; w: number };
  columnId: string;
  closing: boolean;
};

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * An assistant thread where any phrase becomes its own conversation. Choose a
 * suggested phrase in an answer, or select any words and "Ask about this": the
 * phrase is lifted out of the answer as a chip and carried across to the new
 * column's header on `springs.glide`, landing exactly where the header will
 * be because the layout is computed, not measured mid-flight — while the new
 * column grows in from nothing and the older ones narrow to readable spines on
 * the same spring. Escape folds the rightmost spur back: its chip flies home
 * into the phrase and the column closes on the exit ease.
 *
 * Every column has its own skeleton, empty and failed states and its own
 * follow-up composer; answers come from `answerFor`, which may return a promise.
 * Left and Right walk the columns. Under `stackBelow` the columns become a
 * stack that follows a sideways swipe 1:1, rubber-bands at the ends and
 * commits by projection on glide with the release velocity, with the trail
 * shown as chips. Under reduced motion nothing flies or slides; the phrase
 * marks and numbers still show.
 */
export function SpurColumns({
  columns,
  defaultColumns = defaultSpurColumns,
  onColumnsChange,
  answerFor = defaultSpurAnswerFor,
  onAsk,
  onOpenSpur,
  onCloseSpur,
  active,
  defaultActive,
  onActiveChange,
  columnWidth = 280,
  spineWidth = 40,
  spineStyle = "label",
  accent = "var(--accent-bright)",
  stackBelow = 520,
  allowSelection = true,
  maxPhrase = 64,
  title = "Fernworks onboarding",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: SpurColumnsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  /* ------------------------------- columns ------------------------------- */

  const [own, setOwn] = React.useState<SpurColumn[]>(defaultColumns);
  const cols = columns ?? own;
  const latest = React.useRef(cols);
  React.useEffect(() => {
    latest.current = cols;
  });
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const commit = React.useCallback(
    (update: (prev: SpurColumn[]) => SpurColumn[]) => {
      const next = update(latest.current);
      latest.current = next;
      if (columns === undefined) setOwn(next);
      onColumnsChange?.(next);
      return next;
    },
    [columns, onColumnsChange],
  );

  const [ownActive, setOwnActive] = React.useState<string | undefined>(
    defaultActive,
  );
  const activeId =
    active ??
    (ownActive && cols.some((c) => c.id === ownActive)
      ? ownActive
      : cols[cols.length - 1]?.id);
  const activeIndex = Math.max(
    0,
    cols.findIndex((c) => c.id === activeId),
  );

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  /* -------------------------------- sizing ------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    let raf = 0;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setWidth(Math.round(entry.contentRect.width));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSettled(true));
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [status]);

  const stacked = width > 0 && width < stackBelow;
  const layout = React.useMemo(
    () =>
      layoutFor(
        cols.length,
        activeIndex,
        width,
        Math.max(160, columnWidth),
        Math.max(24, spineWidth),
      ),
    [cols.length, activeIndex, width, columnWidth, spineWidth],
  );

  const setActiveColumn = React.useCallback(
    (id: string) => {
      if (active === undefined) setOwnActive(id);
      onActiveChange?.(id);
    },
    [active, onActiveChange],
  );

  /* -------------------------------- answers ------------------------------ */

  const setTurn = React.useCallback(
    (columnId: string, turnId: string, patch: Partial<SpurTurn>) => {
      commit((prev) =>
        prev.map((c) =>
          c.id !== columnId
            ? c
            : {
                ...c,
                turns: c.turns.map((t) =>
                  t.id === turnId ? { ...t, ...patch } : t,
                ),
              },
        ),
      );
    },
    [commit],
  );

  const resolve = React.useCallback(
    (column: SpurColumn, turn: SpurTurn, kind: "spur" | "ask") => {
      const prompt =
        kind === "spur" ? (column.phrase ?? turn.prompt) : turn.prompt;
      let result: ReturnType<SpurAnswerFor>;
      try {
        result = answerFor(prompt, {
          columnId: column.id,
          phrase: column.phrase,
          kind,
        });
      } catch {
        setTurn(column.id, turn.id, { status: "failed" });
        return;
      }
      Promise.resolve(result).then(
        (answer) => {
          if (!alive.current) return;
          const ok = answer && answer.text.trim().length > 0;
          setTurn(column.id, turn.id, {
            status: ok ? "ready" : "empty",
            answer: ok ? answer : undefined,
          });
          say(
            ok
              ? `Answered: ${column.phrase ?? "the question"}.`
              : `Nothing more on ${column.phrase ?? "that"} yet.`,
          );
        },
        () => {
          if (!alive.current) return;
          setTurn(column.id, turn.id, { status: "failed" });
          say(
            `The answer about ${column.phrase ?? "that"} didn't come through.`,
          );
        },
      );
    },
    [answerFor, say, setTurn],
  );

  /* ------------------------------ the flight ----------------------------- */

  const [ghost, setGhost] = React.useState<Ghost | null>(null);
  const [landed, setLanded] = React.useState<ReadonlySet<string>>(
    () => new Set(cols.map((c) => c.id)),
  );
  const [closing, setClosing] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const ghostKey = React.useRef(0);
  const phraseFocus = React.useRef<{
    id: string;
    parentId: string;
    phrase: string;
  } | null>(null);

  const relative = (rect: DOMRect) => {
    const box = rootRef.current?.getBoundingClientRect();
    return box
      ? {
          x: r1(rect.left - box.left),
          y: r1(rect.top - box.top),
          w: r1(rect.width),
        }
      : { x: 0, y: 0, w: rect.width };
  };

  /** Where a heading sits inside its column: every column has the same header. */
  const headerOffset = () => {
    const h = rootRef.current?.querySelector<HTMLElement>("[data-spur-h]");
    const col = h?.closest("section");
    if (!h || !col) return { dx: 13, dy: 30 };
    const a = h.getBoundingClientRect();
    const b = col.getBoundingClientRect();
    return { dx: r1(a.left - b.left), dy: r1(a.top - b.top) };
  };

  /** Where a column's header text sits once the layout has settled. */
  const headerTarget = (index: number, count: number, act: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    const view = viewportRef.current?.getBoundingClientRect();
    if (!box || !view) return null;
    const { dx, dy } = headerOffset();
    const offsetX = view.left - box.left + PAD + dx;
    const offsetY = view.top - box.top + PAD + dy;
    if (stacked) {
      return {
        x: r1(offsetX),
        y: r1(offsetY),
        w: r1(width - dx * 2 - 32),
      };
    }
    const next = layoutFor(
      count,
      act,
      width,
      Math.max(160, columnWidth),
      Math.max(24, spineWidth),
    );
    let left = 0;
    for (let i = 0; i < index; i += 1) left += (next.widths[i] ?? 0) + GAP;
    const scroll = viewportRef.current?.scrollLeft ?? 0;
    return {
      x: r1(offsetX + left - scroll),
      y: r1(offsetY),
      w: r1((next.widths[index] ?? columnWidth) - dx * 2 - 32),
    };
  };

  const openSpur = (
    rawPhrase: string,
    fromColumnId: string,
    source: DOMRect | null,
  ) => {
    if (disabled) return;
    const phrase = rawPhrase.replace(/\s+/g, " ").trim().slice(0, maxPhrase);
    if (!phrase) return;
    const existing = latest.current.find(
      (c) =>
        c.parentId === fromColumnId &&
        c.phrase?.toLowerCase() === phrase.toLowerCase(),
    );
    if (existing) {
      setActiveColumn(existing.id);
      focusHeader(existing.id);
      return;
    }
    const column: SpurColumn = {
      id: nextId(`${uid}-spur`),
      phrase,
      parentId: fromColumnId,
      turns: [
        {
          id: nextId("turn"),
          prompt: `Tell me more about “${phrase}”`,
          status: "loading",
        },
      ],
    };
    // Spurs stack to the right; the older columns give way as spines.
    const nextCols = [...latest.current, column];
    const target = headerTarget(
      nextCols.length - 1,
      nextCols.length,
      nextCols.length - 1,
    );
    commit(() => nextCols);
    setActiveColumn(column.id);
    onOpenSpur?.(phrase, fromColumnId, column);
    say(`Opened a column about ${phrase}.`);
    if (motionSafe && source && target) {
      ghostKey.current += 1;
      setLanded((s) => {
        const n = new Set(s);
        n.delete(column.id);
        return n;
      });
      setGhost({
        key: ghostKey.current,
        text: phrase,
        from: relative(source),
        to: target,
        columnId: column.id,
        closing: false,
      });
    } else {
      setLanded((s) => new Set(s).add(column.id));
      focusHeader(column.id);
    }
    const turn = column.turns[0];
    if (turn) resolve(column, turn, "spur");
  };

  const finishClose = (ids: Set<string>, rootId: string) => {
    commit((prev) => prev.filter((c) => !ids.has(c.id)));
    setClosing((s) => {
      const n = new Set(s);
      for (const id of ids) n.delete(id);
      return n;
    });
    onCloseSpur?.(rootId);
  };

  const closeSpur = (id: string) => {
    const all = latest.current;
    const column = all.find((c) => c.id === id);
    if (!column || !column.parentId || closing.has(id)) return;
    const ids = lineage(all, id);
    const parentId = column.parentId;
    setActiveColumn(parentId);
    say(`Folded ${column.phrase ?? "the column"} back into its answer.`);
    phraseFocus.current = {
      id,
      parentId,
      phrase: (column.phrase ?? "").toLowerCase(),
    };
    if (!motionSafe) {
      finishClose(ids, id);
      return;
    }
    setClosing((s) => new Set([...s, ...ids]));
    const header = document.getElementById(`${uid}-h-${id}`);
    const home = rootRef.current?.querySelector<HTMLElement>(
      `[data-spur-phrase="${CSS.escape(id)}"]`,
    );
    if (header && home) {
      ghostKey.current += 1;
      const from = relative(header.getBoundingClientRect());
      const to = relative(home.getBoundingClientRect());
      setGhost({
        key: ghostKey.current,
        text: column.phrase ?? "",
        from,
        to,
        columnId: id,
        closing: true,
      });
    }
    window.setTimeout(
      () => {
        if (alive.current) finishClose(ids, id);
      },
      Math.round(durations.slow * 1000),
    );
  };

  const focusHeader = (id: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`${uid}-h-${id}`)?.focus({ preventScroll: true });
    });
  };

  // After a fold, focus returns to the phrase it came from (or its column).
  React.useEffect(() => {
    const back = phraseFocus.current;
    if (!back || cols.some((c) => c.id === back.id)) return;
    phraseFocus.current = null;
    const raf = requestAnimationFrame(() => {
      const root = rootRef.current;
      const node =
        root?.querySelector<HTMLElement>(
          `[data-spur-col="${CSS.escape(back.parentId)}"][data-spur-text="${CSS.escape(back.phrase)}"]`,
        ) ?? document.getElementById(`${uid}-h-${back.parentId}`);
      node?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [cols, uid]);

  /* ------------------------------ selection ------------------------------ */

  const [floater, setFloater] = React.useState<{
    x: number;
    y: number;
    text: string;
    columnId: string;
    rect: DOMRect;
  } | null>(null);

  React.useEffect(() => {
    if (!allowSelection || disabled) return;
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        const root = rootRef.current;
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) {
          setFloater(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const host = (
          range.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement
        )?.closest<HTMLElement>("[data-spur-answer]");
        const text = sel.toString().replace(/\s+/g, " ").trim();
        if (
          !host ||
          !root.contains(host) ||
          text.length < 2 ||
          text.length > maxPhrase
        ) {
          setFloater(null);
          return;
        }
        const rect = range.getBoundingClientRect();
        const box = root.getBoundingClientRect();
        setFloater({
          x: r1(
            clamp(rect.left + rect.width / 2 - box.left, 64, box.width - 64),
          ),
          y: r1(Math.max(4, rect.top - box.top - 34)),
          text,
          columnId: host.dataset.spurAnswer ?? "",
          rect,
        });
      });
    };
    document.addEventListener("selectionchange", read);
    return () => {
      document.removeEventListener("selectionchange", read);
      cancelAnimationFrame(raf);
    };
  }, [allowSelection, disabled, maxPhrase]);

  /* ------------------------------ the stack ------------------------------ */

  const trackX = useMotionValue(0);
  const trackRun = React.useRef<AnimationPlaybackControls | null>(null);
  const dragBase = React.useRef(0);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    if (!stacked || dragging.current) return;
    const target = -activeIndex * width;
    trackRun.current?.stop();
    if (!motionSafe || !settled) {
      trackX.jump(target);
      return;
    }
    trackRun.current = animate(trackX, target, springs.glide);
  }, [activeIndex, motionSafe, settled, stacked, trackX, width]);

  React.useEffect(() => () => trackRun.current?.stop(), []);

  const swipe = useDrag({
    axis: "x",
    threshold: 6,
    disabled: !stacked,
    onStart: () => {
      dragging.current = true;
      trackRun.current?.stop();
      dragBase.current = trackX.get();
      setFloater(null);
    },
    onMove: ({ offset }) => {
      const raw = dragBase.current + offset.x;
      const min = -(cols.length - 1) * width;
      const x =
        raw > 0
          ? rubberband(raw, width)
          : raw < min
            ? min + rubberband(raw - min, width)
            : raw;
      trackX.set(r1(x));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const rest = project(trackX.get(), velocity.x, 0.995);
      const index = clamp(
        Math.round(-rest / Math.max(1, width)),
        0,
        cols.length - 1,
      );
      const id = cols[index]?.id;
      trackRun.current?.stop();
      trackRun.current = animate(trackX, -index * width, {
        ...springs.glide,
        velocity: velocity.x,
      });
      if (id && id !== activeId) {
        setActiveColumn(id);
        say(
          `Column ${index + 1} of ${cols.length}: ${cols[index]?.phrase ?? title}.`,
        );
      }
    },
    onCancel: () => {
      dragging.current = false;
      trackRun.current?.stop();
      trackRun.current = animate(trackX, -activeIndex * width, springs.glide);
    },
  });

  // The active chip scrolls into the trail's view; the page never moves.
  const trailRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const list = trailRef.current;
    const chip = activeId
      ? document.getElementById(`${uid}-chip-${activeId}`)
      : null;
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left - 12;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + 12;
  }, [activeId, stacked, uid]);

  /* ------------------------------ keyboard ------------------------------- */

  const onRootKey = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const typing = target.closest("input, textarea");
    if (event.key === "Escape") {
      if (floater) {
        event.preventDefault();
        setFloater(null);
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (target instanceof HTMLInputElement && target.value) {
        event.preventDefault();
        target.value = "";
        return;
      }
      const last = cols[cols.length - 1];
      if (last?.parentId && !closing.has(last.id)) {
        event.preventDefault();
        closeSpur(last.id);
      }
      return;
    }
    if (typing) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const next = clamp(
        activeIndex + (event.key === "ArrowLeft" ? -1 : 1),
        0,
        cols.length - 1,
      );
      const id = cols[next]?.id;
      if (!id) return;
      event.preventDefault();
      if (id !== activeId) {
        setActiveColumn(id);
        say(
          `Column ${next + 1} of ${cols.length}: ${cols[next]?.phrase ?? title}.`,
        );
      }
      focusHeader(id);
    }
  };

  /* -------------------------------- render ------------------------------- */

  const numberOf = (id: string) => cols.findIndex((c) => c.id === id);

  const renderAnswer = (column: SpurColumn, turn: SpurTurn) => {
    if (turn.status === "loading") {
      return (
        <div aria-hidden className="flex flex-col gap-2 py-1">
          {[92, 100, 64].map((w, i) =>
            motionSafe ? (
              // A light sweeps across while the answer is on its way; it
              // exists only while this turn is loading.
              <span
                key={i}
                className="relative h-2.5 overflow-hidden rounded-full bg-surface-2"
                style={{ width: `${w}%` }}
              >
                <motion.span
                  className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--sp-accent)_18%,transparent),transparent)]"
                  initial={{ x: "-100%" }}
                  animate={{ x: "220%" }}
                  transition={{
                    duration: 1.3,
                    ease: easings.linear,
                    repeat: Infinity,
                    delay: i * 0.12,
                  }}
                />
              </span>
            ) : (
              <span
                key={i}
                className="h-2.5 rounded-full bg-surface-2"
                style={{ width: `${w}%` }}
              />
            ),
          )}
        </div>
      );
    }
    if (turn.status === "failed") {
      return (
        <div className="flex flex-col items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_35%,var(--hairline))] bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))] p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] text-foreground">
            <TriangleAlert
              aria-hidden
              className="size-3.5 shrink-0 text-danger"
            />
            This answer didn&apos;t come through.
          </p>
          {disabled ? null : (
            <button
              type="button"
              onClick={() => {
                setTurn(column.id, turn.id, { status: "loading" });
                resolve(
                  column,
                  { ...turn, status: "loading" },
                  column.turns[0]?.id === turn.id && column.parentId
                    ? "spur"
                    : "ask",
                );
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-foreground hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3" />
              Try again
            </button>
          )}
        </div>
      );
    }
    if (turn.status === "empty" || !turn.answer) {
      return (
        <p className="rounded-2 border border-dashed border-hairline-strong px-2.5 py-2 text-[12px] text-ink-3">
          Nothing more on “{column.phrase ?? turn.prompt}” yet. Ask a follow-up
          below.
        </p>
      );
    }
    const opened = cols
      .filter((c) => c.parentId === column.id && c.phrase)
      .map((c) => ({
        phrase: c.phrase ?? "",
        columnId: c.id,
        number: numberOf(c.id) + 1,
      }));
    const pieces = piecesOf(
      turn.answer.text,
      turn.answer.phrases ?? [],
      opened,
    );
    return (
      <p
        data-spur-answer={column.id}
        className="text-[13px] leading-[22px] text-foreground"
      >
        {pieces.map((p, i) =>
          p.kind === "text" ? (
            <React.Fragment key={i}>{p.text}</React.Fragment>
          ) : p.kind === "suggest" ? (
            <InlineAction
              key={i}
              disabled={disabled}
              data-spur-col={column.id}
              data-spur-text={p.text.toLowerCase()}
              label={`Ask about ${p.text}`}
              onAct={(node) => openSpur(p.text, column.id, firstRect(node))}
              className={cn(
                "rounded-1 text-foreground underline decoration-[color-mix(in_oklab,var(--sp-accent)_70%,transparent)] decoration-dotted decoration-[1.5px] underline-offset-[3px] transition-colors hover:bg-[color-mix(in_oklab,var(--sp-accent)_10%,transparent)]",
                disabled ? "cursor-default no-underline" : "cursor-pointer",
              )}
            >
              {p.text}
            </InlineAction>
          ) : (
            <InlineAction
              key={i}
              data-spur-phrase={p.columnId}
              data-spur-col={column.id}
              data-spur-text={p.text.toLowerCase()}
              label={`${p.text}, open column ${p.number}`}
              onAct={() => {
                setActiveColumn(p.columnId);
                focusHeader(p.columnId);
              }}
              className={cn(
                "cursor-pointer rounded-1 bg-[color-mix(in_oklab,var(--sp-accent)_16%,transparent)] [box-decoration-break:clone] px-0.5 text-[var(--sp-ink)] transition-opacity",
                ghost && ghost.columnId === p.columnId && "opacity-40",
              )}
            >
              {p.text}
              <sup className="ml-0.5 font-mono text-[9px] font-semibold">
                {p.number}
              </sup>
            </InlineAction>
          ),
        )}
      </p>
    );
  };

  const renderColumn = (column: SpurColumn, index: number) => {
    const isOpen = stacked || !settled || (layout.open[index] ?? true);
    const isActive = column.id === activeId;
    const parent = column.parentId
      ? cols.find((c) => c.id === column.parentId)
      : undefined;
    const headerId = `${uid}-h-${column.id}`;
    const turnsCount = column.turns.length;
    const shown = landed.has(column.id);
    const isClosing = closing.has(column.id);
    const w = layout.widths[index] ?? columnWidth;

    const spine = (
      <button
        type="button"
        onClick={() => {
          setActiveColumn(column.id);
          focusHeader(column.id);
        }}
        aria-label={`Open column ${index + 1}: ${column.phrase ?? title}`}
        className={cn(
          "flex h-full w-full flex-col items-center gap-2 rounded-3 border border-hairline bg-surface-1 py-3 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS_IN,
        )}
      >
        {spineStyle === "bar" ? (
          <>
            <span className="font-mono text-[10px] font-semibold text-[var(--sp-ink)]">
              {index + 1}
            </span>
            <span className="w-1 flex-1 rounded-full bg-[color-mix(in_oklab,var(--sp-accent)_55%,transparent)]" />
          </>
        ) : spineStyle === "index" ? (
          <>
            <span className="font-mono text-[18px] leading-none font-semibold text-[var(--sp-ink)]">
              {index + 1}
            </span>
            <span aria-hidden className="flex flex-col gap-1">
              {Array.from({ length: Math.min(6, turnsCount) }, (_, i) => (
                <span key={i} className="size-1 rounded-full bg-ink-3" />
              ))}
            </span>
          </>
        ) : (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--sp-accent)_16%,transparent)] font-mono text-[10px] font-semibold text-[var(--sp-ink)]">
              {index + 1}
            </span>
            <span className="flex-1 overflow-hidden text-[12px] font-medium whitespace-nowrap [writing-mode:vertical-rl]">
              {column.phrase ?? title}
            </span>
          </>
        )}
      </button>
    );

    const body = (
      <section
        aria-labelledby={headerId}
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-3 border bg-card",
          isActive && !stacked
            ? "border-[color-mix(in_oklab,var(--sp-accent)_45%,var(--hairline))]"
            : "border-hairline",
        )}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-hairline px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[10px] text-ink-3">
              {parent ? (
                <>
                  <CornerDownRight aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">
                    From {parent.phrase ? `“${parent.phrase}”` : title}
                  </span>
                </>
              ) : (
                <>
                  <MessageSquareText aria-hidden className="size-3 shrink-0" />
                  Question
                </>
              )}
            </p>
            <h3
              id={headerId}
              data-spur-h=""
              tabIndex={-1}
              title={column.phrase ?? title}
              className={cn(
                "mt-0.5 truncate rounded-1 text-[13px] leading-[18px] font-semibold text-foreground transition-opacity duration-150",
                !shown && "opacity-0",
                FOCUS_IN,
              )}
            >
              {column.phrase ?? title}
            </h3>
          </div>
          {column.parentId && !disabled ? (
            <button
              type="button"
              aria-label={`Fold ${column.phrase ?? "this column"} back`}
              onClick={() => closeSpur(column.id)}
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </header>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 py-3">
          <ol role="list" className="flex flex-col gap-3">
            {column.turns.map((turn, t) => (
              <li key={turn.id} className="flex flex-col gap-2">
                {t > 0 || !column.parentId ? (
                  <p className="ml-6 self-end rounded-3 rounded-br-1 bg-surface-2 px-2.5 py-1.5 text-[12px] leading-[18px] text-foreground">
                    {turn.prompt}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--sp-accent)_14%,var(--card))] text-[var(--sp-ink)]"
                  >
                    <Sparkles className="size-3" />
                  </span>
                  <div
                    className="min-w-0 flex-1"
                    aria-busy={turn.status === "loading" || undefined}
                  >
                    {renderAnswer(column, turn)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {disabled ? null : (
          <form
            className="shrink-0 border-t border-hairline p-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const input = form.elements.namedItem(
                "q",
              ) as HTMLInputElement | null;
              const text = input?.value.trim() ?? "";
              if (!text) return;
              if (input) input.value = "";
              const turn: SpurTurn = {
                id: nextId("turn"),
                prompt: text,
                status: "loading",
              };
              const updated = commit((prev) =>
                prev.map((c) =>
                  c.id === column.id ? { ...c, turns: [...c.turns, turn] } : c,
                ),
              );
              onAsk?.(text, column.id);
              const fresh = updated.find((c) => c.id === column.id);
              if (fresh) resolve(fresh, turn, "ask");
            }}
          >
            <div className="flex items-center gap-1.5 rounded-2 border border-hairline bg-surface-2 py-0.5 pr-0.5 pl-2.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid">
              <label htmlFor={`${uid}-q-${column.id}`} className="sr-only">
                Ask about {column.phrase ?? title}
              </label>
              <input
                id={`${uid}-q-${column.id}`}
                name="q"
                autoComplete="off"
                placeholder={
                  column.phrase
                    ? `Ask about “${column.phrase}”`
                    : "Ask a follow-up"
                }
                className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-ink-3"
              />
              <button
                type="submit"
                aria-label="Send"
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-2 bg-[var(--sp-button)] text-white",
                  FOCUS_RING,
                )}
              >
                <ArrowUp aria-hidden className="size-3.5" />
              </button>
            </div>
          </form>
        )}
      </section>
    );

    if (stacked) {
      return (
        <div
          key={column.id}
          role="tabpanel"
          id={`${uid}-panel-${column.id}`}
          aria-labelledby={`${uid}-chip-${column.id}`}
          inert={!isActive || undefined}
          className="h-full shrink-0"
          style={{ width }}
        >
          {body}
        </div>
      );
    }

    return (
      <motion.div
        key={column.id}
        className="h-full shrink-0"
        initial={
          settled && motionSafe && !landed.has(column.id)
            ? { width: 0, opacity: 0 }
            : false
        }
        animate={
          isClosing
            ? { width: 0, opacity: 0 }
            : settled
              ? { width: w, opacity: 1 }
              : { opacity: 1 }
        }
        transition={
          isClosing
            ? { duration: durations.base, ease: easings.exit }
            : settled && motionSafe
              ? { width: springs.glide, opacity: { duration: durations.base } }
              : { duration: 0 }
        }
        style={
          settled
            ? undefined
            : { flex: isOpen ? "1 1 0%" : `0 0 ${spineWidth}px` }
        }
      >
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            {isOpen ? (
              <motion.div
                key="open"
                className="h-full"
                style={{ minWidth: Math.min(columnWidth, w) }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {body}
              </motion.div>
            ) : (
              <motion.div
                key="spine"
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {spine}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  const trail = stacked ? (
    <div
      ref={trailRef}
      role="tablist"
      aria-label="Trail"
      className="flex shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] px-3 pt-2.5 pb-1"
    >
      {cols.map((c, i) => {
        const on = c.id === activeId;
        return (
          <React.Fragment key={c.id}>
            {i > 0 ? (
              <ChevronRight
                aria-hidden
                className="size-3 shrink-0 text-ink-3"
              />
            ) : null}
            <button
              type="button"
              role="tab"
              id={`${uid}-chip-${c.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel-${c.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActiveColumn(c.id)}
              className={cn(
                "inline-flex h-7 max-w-40 shrink-0 items-center rounded-full border px-2.5 text-[11px] transition-colors",
                on
                  ? "border-transparent bg-[var(--sp-button)] text-white"
                  : "border-hairline text-ink-2 hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <span className="truncate">{c.phrase ?? "Question"}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  ) : null;

  return (
    <section
      ref={rootRef}
      aria-label={title}
      aria-busy={status === "loading" || undefined}
      onKeyDown={onRootKey}
      className={cn(
        "@container/spur-columns relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-surface-1 text-foreground",
        className,
      )}
      style={{
        height,
        ["--sp-accent" as string]: `oklch(from ${accent} 0.62 c h)`,
        ["--sp-button" as string]: `oklch(from ${accent} 0.54 c h)`,
        ["--sp-ink" as string]:
          "color-mix(in oklab, var(--sp-accent) 72%, var(--foreground))",
      }}
    >
      <p id={`${uid}-hint`} className="sr-only">
        Left and Right walk the columns. Escape folds the rightmost column back
        into its phrase.
      </p>
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This thread didn&apos;t load.
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
        <div aria-hidden className="flex flex-1 gap-2 p-2">
          {[0, 1].map((k) => (
            <div
              key={k}
              className="flex flex-1 flex-col gap-2.5 rounded-3 border border-hairline bg-card p-3"
            >
              {[40, 90, 100, 70].map((w, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2.5 rounded-full bg-surface-2",
                    motionSafe && "animate-pulse",
                  )}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {trail}
          <div
            ref={viewportRef}
            aria-describedby={`${uid}-hint`}
            className={cn(
              "relative flex-1 p-2",
              stacked
                ? "overflow-hidden"
                : "[scrollbar-width:thin] overflow-x-auto overflow-y-hidden",
            )}
          >
            {stacked ? (
              // The clip sits inside the padding, so a neighbour never peeks in.
              <div className="h-full overflow-hidden rounded-3">
                <motion.div
                  {...swipe}
                  className="flex h-full touch-pan-y"
                  style={{ x: trackX, width: width * cols.length }}
                >
                  {cols.map(renderColumn)}
                </motion.div>
              </div>
            ) : (
              <div className="flex h-full" style={{ gap: GAP }}>
                {cols.map(renderColumn)}
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {ghost ? (
          <motion.div
            key={ghost.key}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-30 truncate rounded-1 bg-[color-mix(in_oklab,var(--sp-accent)_18%,var(--card))] px-1 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-[var(--sp-ink)] shadow-md"
            initial={{
              x: ghost.from.x,
              y: ghost.from.y,
              width: ghost.from.w + 8,
              opacity: 1,
            }}
            animate={{
              x: ghost.to.x,
              y: ghost.to.y,
              width: ghost.closing
                ? ghost.to.w + 8
                : r1(
                    Math.max(40, Math.min(ghost.to.w, ghost.from.w * 1.06 + 8)),
                  ),
            }}
            exit={{ opacity: 0, transition: { duration: durations.fast } }}
            transition={springs.glide}
            onAnimationComplete={() => {
              const g = ghost;
              setGhost((cur) => (cur && cur.key === g.key ? null : cur));
              if (!g.closing) {
                setLanded((s) => new Set(s).add(g.columnId));
                focusHeader(g.columnId);
              }
            }}
          >
            {ghost.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {floater && !disabled ? (
          <motion.button
            key="ask"
            type="button"
            className={cn(
              "absolute top-0 left-0 z-20 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--sp-button)] px-3 text-[12px] font-medium whitespace-nowrap text-white shadow-lg",
              FOCUS_RING,
            )}
            style={{ left: floater.x, top: floater.y }}
            initial={
              motionSafe
                ? { opacity: 0, y: distances.nudge, scale: 0.96 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              const f = floater;
              setFloater(null);
              window.getSelection()?.removeAllRanges();
              openSpur(f.text, f.columnId, f.rect);
            }}
          >
            <Sparkles aria-hidden className="size-3.5" />
            Ask about this
          </motion.button>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
