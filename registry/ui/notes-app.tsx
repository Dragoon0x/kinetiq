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
  ChevronLeft,
  Hash,
  NotebookPen,
  Pin,
  RotateCcw,
  Search,
  SquarePen,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { BinLid } from "@/registry/ui/bin-lid";
import {
  BlockEditor,
  defaultEditorBlocks,
  type EditorBlock,
} from "@/registry/ui/block-editor";
import { PinPress } from "@/registry/ui/pin-press";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type NotesPin = "section" | "float" | "off";
export type NotesSearch = "field" | "expand" | "off";
export type NotesDensity = "compact" | "cozy" | "roomy";
export type NotesStatus = "ready" | "loading" | "error";

export type NoteRecord = {
  id: string;
  /** The note's name; an empty title reads "Untitled". */
  title: string;
  /** The body, as block-editor blocks. */
  blocks: EditorBlock[];
  /** Lower-case words without the #. */
  tags: string[];
  pinned?: boolean;
  /** Last edited, ms since the epoch. Editing stamps it with `now`. */
  updated: number;
};

export type NotesAppProps = {
  /** Where pinned notes go: under a Pinned heading, floated to the top of one list, or pinning is off (no pin, plain recency order). @default "section" */
  pin?: NotesPin;
  /** How search lives over the list: an open field, a magnifier that grows into the field, or none. @default "field" */
  search?: NotesSearch;
  /** Row height and how much each row says: title and date, a snippet line, or two lines and the tags. @default "cozy" */
  density?: NotesDensity;
  /** Controlled notes. */
  notes?: NoteRecord[];
  /** Initial notes when uncontrolled. @default defaultNotes */
  defaultNotes?: NoteRecord[];
  /** Fires from the edit, pin, tag, creation or deletion that changed the notes, with all of them. */
  onNotesChange?: (notes: NoteRecord[]) => void;
  /** Controlled open note id, or null. */
  note?: string | null;
  /** Initial open note when uncontrolled. @default the most recently edited */
  defaultNote?: string | null;
  onNoteChange?: (id: string | null) => void;
  /** Controlled tag filter, or null for every note. */
  tag?: string | null;
  /** Initial tag filter when uncontrolled. @default null */
  defaultTag?: string | null;
  onTagChange?: (tag: string | null) => void;
  /** Controlled search text. */
  query?: string;
  /** Initial search when uncontrolled. @default "" */
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** The moment dates are read against, and what an edit is stamped with (Date or ms). @default defaultNotesNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** A new note was made; it is already in the list and open. */
  onCreate?: (note: NoteRecord) => void;
  /** A note was thrown away, once its undo window ran out. */
  onDelete?: (note: NoteRecord) => void;
  onPinChange?: (id: string, pinned: boolean) => void;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: NotesStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Notes" */
  label?: string;
  /** Play the list's ticks and the clicks. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be written, pinned, tagged or deleted. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: Noor's Fieldline notes on a Friday morning                 */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;

/** Friday 2 October 2026, 09:41 UTC. */
export const defaultNotesNow = Date.UTC(2026, 9, 2, 9, 41);

const at = (dayOffset: number, hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Date.UTC(2026, 9, 2 + dayOffset, Number(h), Number(m));
};

const b = (
  id: string,
  type: EditorBlock["type"],
  text: string,
  checked?: boolean,
): EditorBlock => ({ id, type, text, ...(checked ? { checked } : {}) });

export const defaultNotes: NoteRecord[] = [
  {
    id: "survey",
    title: "North basin survey, day 2",
    blocks: defaultEditorBlocks.filter((x) => x.id !== "b1"),
    tags: ["field", "survey"],
    pinned: true,
    updated: at(0, "09:12"),
  },
  {
    id: "statement",
    title: "Coldbrook Bank statement checklist",
    blocks: [
      b(
        "s1",
        "paragraph",
        "September closes on **Monday**. Amara needs these before the review.",
      ),
      b("s2", "todo", "Match the Waylight Pay payouts to the ledger", true),
      b("s3", "todo", "Flag the two duplicate Basinworks invoices"),
      b("s4", "todo", "Export the card statement as `csv`"),
    ],
    tags: ["finance"],
    pinned: true,
    updated: at(-1, "11:05"),
  },
  {
    id: "vendor",
    title: "Basinworks vendor call",
    blocks: [
      b(
        "v1",
        "paragraph",
        "Pricing for the N-series loggers holds through March if we commit to 40 units.",
      ),
      b("v2", "subheading", "Actions"),
      b("v3", "todo", "Send the unit count to Amara"),
      b("v4", "todo", "Ask about the calibration kit", true),
      b(
        "v5",
        "quote",
        "Lead time is six weeks from the order, not from the deposit.",
      ),
    ],
    tags: ["meetings", "field"],
    updated: at(-1, "16:20"),
  },
  {
    id: "gauge",
    title: "Gauge N4 calibration log",
    blocks: [
      b(
        "g1",
        "paragraph",
        "Staff gauge against the flow meter, three passes each morning.",
      ),
      b(
        "g2",
        "paragraph",
        "Tue 1.21 · Wed 1.19 · Thu 1.80 after the rain. The meter drifted _0.04_ high on Wednesday.",
      ),
      b("g3", "todo", "Swap in the spare meter if it drifts again"),
    ],
    tags: ["field"],
    updated: at(-2, "14:40"),
  },
  {
    id: "release",
    title: "Ideas for the 3.1 release",
    blocks: [
      b(
        "r1",
        "paragraph",
        "Offline maps that keep a week of tiles. Survey crews lose signal past the ford.",
      ),
      b(
        "r2",
        "paragraph",
        "A quieter sync badge: only show it when something failed.",
      ),
    ],
    tags: ["work"],
    updated: at(-3, "10:15"),
  },
  {
    id: "reading",
    title: "Reading list",
    blocks: [
      b("l1", "todo", "Rivers of the north basin, chapters 4 to 6", true),
      b("l2", "todo", "The field guide to weirs"),
      b("l3", "quote", "Measure twice at the weir, once everywhere else."),
    ],
    tags: ["personal"],
    updated: at(-4, "21:30"),
  },
  {
    id: "groceries",
    title: "Groceries",
    blocks: [
      b("q1", "todo", "Oats"),
      b("q2", "todo", "Coffee beans, the Fernworks roast", true),
      b("q3", "todo", "Lemons"),
    ],
    tags: ["personal"],
    updated: at(-8, "18:05"),
  },
];

/* ------------------------------------------------------------------ */
/* Look and helpers                                                     */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  FOCUS,
);

type DensitySpec = { row: string; lines: 0 | 1 | 2; tags: boolean };
const DENSITY: Record<NotesDensity, DensitySpec> = {
  compact: { row: "py-2", lines: 0, tags: false },
  cozy: { row: "py-2.5", lines: 1, tags: false },
  roomy: { row: "py-3", lines: 2, tags: true },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const pad2 = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const WD = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MO = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const dayIndex = (ms: number, off: number) =>
  Math.floor((ms + off * MIN) / DAY);
const clock = (ms: number, off: number) => {
  const d = new Date(ms + off * MIN);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
/** Today's time, Yesterday, a weekday this week, or a date. */
const whenOf = (ms: number, nowMs: number, off: number) => {
  const diff = dayIndex(nowMs, off) - dayIndex(ms, off);
  if (diff <= 0) return clock(ms, off);
  if (diff === 1) return "Yesterday";
  const d = new Date(ms + off * MIN);
  if (diff < 7) return WD[d.getUTCDay()] ?? "";
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
/** The words a block's marks dress up, without the marks. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1$2");
const bodyOf = (n: NoteRecord) =>
  n.blocks
    .map((x) => plain(x.text))
    .filter(Boolean)
    .join(" ");
const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;
const snippetOf = (n: NoteRecord) =>
  plain(
    n.blocks.find(
      (x) => x.type !== "heading" && x.type !== "subheading" && x.text.trim(),
    )?.text ?? "",
  );
const panOf = (el?: Element | null) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};
const tagOf = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s,]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The words of `text`, with the searched words washed. */
function Marked({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const re = new RegExp(`(${words.map(escapeRe).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-1 bg-[color-mix(in_oklab,var(--warn)_30%,transparent)] text-foreground"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/** A number whose digits roll: up when it grows, down when it shrinks. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  if (seen.value !== value) {
    setSeen({ value, dir: value > seen.value ? 1 : -1 });
  }
  const dir = seen.value === value ? seen.dir : value > seen.value ? 1 : -1;
  const variants = {
    enter: (d: number) => ({ y: motionSafe ? d * 8 : 0, opacity: 0 }),
    rest: { y: 0, opacity: 1 },
    leave: (d: number) => ({
      y: motionSafe ? -d * 8 : 0,
      opacity: 0,
      transition: exitFor(durations.fast),
    }),
  };
  return (
    <span className="relative inline-grid overflow-hidden tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={`v${value}`}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="rest"
          exit="leave"
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          className="[grid-area:1/1]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function StackScreen({
  index,
  depth,
  level,
  motionSafe,
  children,
}: {
  index: number;
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // A pushed screen comes in from the right edge; the one beneath slides a
  // little over a quarter of the way left and dims, so a push reads as depth.
  const x = useTransform(depth, (d) =>
    motionSafe ? `${r2((index - d) * (index > d ? 100 : 28))}%` : "0%",
  );
  const dim = useTransform(depth, (d) =>
    r2(Math.min(1, Math.max(0, d - index)) * 0.3),
  );
  const on = index === level;
  return (
    <motion.div
      aria-hidden={!on || undefined}
      inert={!on}
      className="absolute inset-0 overflow-hidden bg-card"
      style={{ x, zIndex: index }}
      animate={motionSafe ? undefined : { opacity: on ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_100%,transparent)]"
        style={{ opacity: dim }}
      />
    </motion.div>
  );
}

/** The strip along a pushed screen's left edge that takes a back-swipe. */
function EdgeBack({
  width,
  level,
  depth,
  onGrab,
  onBack,
}: {
  width: number;
  level: number;
  depth: MotionValue<number>;
  onGrab: () => void;
  onBack: () => void;
}) {
  const dx = React.useRef(0);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => settle.current?.stop(), []);
  const drag = useDrag({
    axis: "x",
    threshold: 6,
    onStart: () => {
      dx.current = 0;
      settle.current?.stop();
      onGrab();
    },
    onMove: ({ offset }) => {
      dx.current = offset.x;
      const w = Math.max(1, width);
      // 1:1 back toward the screen beneath; pulled the other way it resists.
      const d =
        offset.x >= 0
          ? level - Math.min(offset.x, w) / w
          : level + rubberband(-offset.x, w * 0.4) / w;
      depth.set(Math.round(d * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const rest = project(dx.current, velocity.x, 0.99);
      if (rest > width / 2) {
        onBack();
        return;
      }
      settle.current = animate(depth, level, {
        ...springs.glide,
        velocity: -velocity.x / Math.max(1, width),
      });
    },
    onCancel: () => {
      settle.current = animate(depth, level, springs.glide);
    },
    onTap: (event) => {
      // The strip lies over the screen's left edge; a tap is meant for
      // whatever is under it.
      const strip = event.currentTarget as Element;
      const below = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((n) => n !== strip && !strip.contains(n));
      const target = below?.closest<HTMLElement>(
        "button, a[href], textarea, input, [tabindex]",
      );
      if (!target) return;
      if (target.matches("textarea, input")) target.focus();
      else target.click();
    },
  });
  return (
    <div
      aria-hidden
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        // Nothing here is clicked, so the strip may hold the pointer at once:
        // a mouse pull that leaves the 16px strip on its first move is
        // still this drag.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic pointer cannot be captured; the drag still works.
        }
      }}
      className="absolute inset-y-0 left-0 z-30 w-4 cursor-grab touch-pan-y"
    />
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

type Row = { note: NoteRecord; group: "pinned" | "notes" | null };

/**
 * A complete notes screen: tags, the notes list with search, and an editor
 * that is block-editor under the note's own title and tags. Pinning is
 * pin-press: the note's row lifts on snap and glides to the top — under a
 * Pinned heading, or floated over the rest (`pin`) — while the rows between
 * close the gap on glide, and an edited note glides to the top of its group
 * the same way. Deleting is bin-lid: the note goes in the bin and is only
 * removed when its undo ring has drained.
 *
 * Search matches titles, every block and tags, washes the words it found and
 * shows the sentence they are in; it is an open field or a magnifier that
 * grows into one (`search`). Below 640px the list and the note become a
 * stack with a 1:1 edge swipe back that commits by projection.
 *
 * The list is one tab stop (Up, Down, Home, End, Enter), `/` searches, and
 * Escape clears the search or goes back. Under reduced motion rows swap and
 * screens cross-fade in place; every pin, tag, count and highlight still
 * changes.
 */
export function NotesApp({
  pin = "section",
  search = "field",
  density = "cozy",
  notes,
  defaultNotes: initialNotes,
  onNotesChange,
  note,
  defaultNote,
  onNoteChange,
  tag,
  defaultTag = null,
  onTagChange,
  query,
  defaultQuery = "",
  onQueryChange,
  now = defaultNotesNow,
  zoneOffset = 0,
  onCreate,
  onDelete,
  onPinChange,
  status = "ready",
  onRetry,
  label = "Notes",
  sound = false,
  disabled = false,
  className,
}: NotesAppProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const nowMs = toMs(now);
  const off = zoneOffset;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const listHeadId = `${uid}-list`;
  const titleId = `${uid}-title`;
  const searchId = `${uid}-search`;
  const hintId = `${uid}-hint`;

  /* ------------------------------ the data ------------------------------ */

  const [ownNotes, setOwnNotes] = React.useState<NoteRecord[]>(
    () => initialNotes ?? defaultNotes,
  );
  const list = notes ?? ownNotes;
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  }, [list]);
  // Only a note made a moment ago arrives from above: a row that later moves
  // (a pin, an edit) must not replay its entrance when React re-runs it.
  const [recent, setRecent] = React.useState<string | null>(null);

  const [ownNote, setOwnNote] = React.useState<string | null>(() =>
    defaultNote !== undefined
      ? defaultNote
      : ([...list].sort((a, c) => c.updated - a.updated)[0]?.id ?? null),
  );
  const openId = note !== undefined ? note : ownNote;
  const open = openId ? list.find((n) => n.id === openId) : undefined;

  const [ownTag, setOwnTag] = React.useState<string | null>(defaultTag);
  const tagFilter = tag !== undefined ? tag : ownTag;
  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const q = query ?? ownQuery;

  const commit = (next: NoteRecord[]) => {
    listRef.current = next;
    if (notes === undefined) setOwnNotes(next);
    onNotesChange?.(next);
  };
  const patch = (id: string, fn: (n: NoteRecord) => NoteRecord) =>
    commit(listRef.current.map((n) => (n.id === id ? fn(n) : n)));

  const tags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of list)
      for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, c) => a[0].localeCompare(c[0]))
      .map(([name, count]) => ({ name, count }));
  }, [list]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (n: NoteRecord) => {
    if (tagFilter && !n.tags.includes(tagFilter)) return false;
    if (words.length === 0) return true;
    const hay = `${n.title} ${bodyOf(n)} ${n.tags.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const pinning = pin !== "off";
  const sorted = [...list].sort((a, c) => c.updated - a.updated);
  const shown = sorted.filter(matches);
  const pinnedRows = pinning ? shown.filter((n) => n.pinned) : [];
  const restRows = pinning ? shown.filter((n) => !n.pinned) : shown;
  const rows: Row[] = [
    ...pinnedRows.map((n) => ({
      note: n,
      group: pin === "section" ? ("pinned" as const) : null,
    })),
    ...restRows.map((n) => ({
      note: n,
      group: pin === "section" && pinnedRows.length ? ("notes" as const) : null,
    })),
  ];

  /** The sentence the search found, when it is not in the title. */
  const snippetFor = (n: NoteRecord) => {
    const first = words[0];
    if (!first || n.title.toLowerCase().includes(first)) return snippetOf(n);
    const block = n.blocks.find((x) =>
      plain(x.text).toLowerCase().includes(first),
    );
    if (!block) return snippetOf(n);
    const text = plain(block.text);
    const i = text.toLowerCase().indexOf(first);
    const from = Math.max(0, i - 36);
    return `${from > 0 ? "…" : ""}${text.slice(from).trim()}`;
  };

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const phone = mode === "phone";
  const desktop = mode === "desktop";

  const [phoneOpen, setPhoneOpen] = React.useState(false);
  const level = phone && phoneOpen && open ? 1 : 0;
  const depth = useMotionValue(level);
  const depthAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const wasPhone = React.useRef<boolean | null>(null);
  React.useLayoutEffect(() => {
    const arrived = wasPhone.current !== phone;
    wasPhone.current = phone;
    depthAnim.current?.stop();
    if (arrived || !motionSafe) depth.jump(level);
    else if (Math.abs(depth.get() - level) > 0.001) {
      depthAnim.current = animate(depth, level, springs.glide);
    }
  }, [level, phone, motionSafe, depth]);
  React.useEffect(() => () => depthAnim.current?.stop(), []);

  /* ------------------------------- state -------------------------------- */

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [focusRow, setFocusRow] = React.useState<string | null>(null);
  const [lifted, setLifted] = React.useState<string | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [draftTag, setDraftTag] = React.useState("");

  const seq = React.useRef(0);
  const rowsRef = React.useRef(new Map<string, HTMLButtonElement>());
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const searchButton = React.useRef<HTMLButtonElement | null>(null);
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [body, setBody] = React.useState<HTMLDivElement | null>(null);
  // The title and tags line up with the editor's text column, wherever the
  // editor's own gutter and centring put it.
  const [inset, setInset] = React.useState(20);
  const liftTimer = React.useRef<number | null>(null);
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );

  React.useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const node = next();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  React.useEffect(
    () => () => {
      if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
    },
    [],
  );

  React.useEffect(() => {
    if (!recent) return;
    const t = window.setTimeout(() => setRecent(null), 700);
    return () => window.clearTimeout(t);
  }, [recent]);

  React.useLayoutEffect(() => {
    if (!body) return;
    const read = () => {
      const text = body.querySelector<HTMLElement>(
        "li [data-raw], li textarea",
      );
      if (!text) return;
      const v = Math.round(
        text.getBoundingClientRect().left - body.getBoundingClientRect().left,
      );
      if (v > 0 && v < 480) setInset(v);
    };
    read();
    // The editor settles its own layout a frame after it arrives.
    const frame = window.requestAnimationFrame(read);
    const ro = new ResizeObserver(read);
    ro.observe(body);
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [body]);

  // The magnifier's field grows from the button: a clip that opens from the
  // right edge on snap, every frame rounded.
  const reveal = useMotionValue(search === "field" ? 1 : 0);
  const [fieldBox, setFieldBox] = React.useState<HTMLDivElement | null>(null);
  const [fieldW, setFieldW] = React.useState(240);
  React.useLayoutEffect(() => {
    if (!fieldBox) return;
    const read = () => setFieldW(Math.round(fieldBox.offsetWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(fieldBox);
    return () => ro.disconnect();
  }, [fieldBox]);
  const fieldClip = useTransform(reveal, (t) => {
    const k = Math.min(1, Math.max(0, t));
    const left = r2((1 - k) * Math.max(0, fieldW - 32));
    return `inset(0px 0px 0px ${left}px round 8px)`;
  });
  // Fully folded, the field is not drawn at all: the magnifier shows.
  const fieldShown = useTransform(reveal, (t) => (t < 0.02 ? 0 : 1));
  const expanded = search === "field" || searchOpen || q !== "";
  React.useEffect(() => {
    if (search !== "expand") {
      reveal.jump(search === "field" ? 1 : 0);
      return;
    }
    const target = expanded ? 1 : 0;
    if (!motionSafe) {
      reveal.jump(target);
      return;
    }
    const c = animate(
      reveal,
      target,
      expanded
        ? springs.snap
        : { duration: durations.fast, ease: easings.exit },
    );
    return () => c.stop();
  }, [search, expanded, motionSafe, reveal]);

  /* ------------------------------- actions ------------------------------ */

  const tick = (i: number, el?: Element | null) =>
    audio.play("tick", {
      pitch: r2(1.25 - Math.min(10, i) * 0.04),
      gain: 0.35,
      pan: panOf(el),
    });
  const click = (pitch: number, el?: Element | null) =>
    audio.play("click", { pitch, gain: 0.4, pan: panOf(el) });

  const setOpen = (id: string | null) => {
    if (note === undefined) setOwnNote(id);
    onNoteChange?.(id);
  };

  const openNote = (id: string, by?: Element | null) => {
    const n = listRef.current.find((x) => x.id === id);
    if (!n) return;
    setOpen(id);
    setFocusRow(id);
    if (phone) {
      setPhoneOpen(true);
      click(1.1, by);
      // The arriving screen's first control, not the title: focusing a field
      // would raise a phone's keyboard over a note opened to be read.
      focusNext.current = () =>
        root?.querySelector<HTMLElement>("[data-notes-back]");
    }
    say(`${n.title || "Untitled"} open.`);
  };

  const back = (by?: Element | null) => {
    if (!phone || !phoneOpen) return;
    click(0.9, by);
    setPhoneOpen(false);
    const id = openId;
    focusNext.current = () => (id ? rowsRef.current.get(id) : null);
  };

  const setQuery = (text: string) => {
    if (query === undefined) setOwnQuery(text);
    onQueryChange?.(text);
  };

  const chooseTag = (t: string | null, by?: Element | null, i = 0) => {
    tick(i, by);
    const next = tagFilter === t ? null : t;
    if (tag === undefined) setOwnTag(next);
    onTagChange?.(next);
    const count = listRef.current.filter(
      (n) => !next || n.tags.includes(next),
    ).length;
    say(
      next
        ? `#${next}, ${plural(count, "note")}.`
        : `All notes, ${plural(count, "note")}.`,
    );
  };

  const create = (by?: Element | null) => {
    if (disabled || status !== "ready") return;
    seq.current += 1;
    const id = `${idBase}-n${seq.current}`;
    const fresh: NoteRecord = {
      id,
      title: "",
      blocks: [{ id: `${id}-b1`, type: "paragraph", text: "" }],
      tags: tagFilter ? [tagFilter] : [],
      updated: nowMs,
    };
    commit([fresh, ...listRef.current]);
    setRecent(id);
    if (q) setQuery("");
    click(1.2, by);
    setOpen(id);
    setFocusRow(id);
    if (phone) setPhoneOpen(true);
    focusNext.current = () => titleRef.current;
    onCreate?.(fresh);
    say("New note.");
  };

  const togglePin = (id: string, pinned: boolean) => {
    const n = listRef.current.find((x) => x.id === id);
    if (!n) return;
    patch(id, (x) => ({ ...x, pinned }));
    onPinChange?.(id, pinned);
    if (motionSafe) {
      setLifted(id);
      if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
      liftTimer.current = window.setTimeout(() => setLifted(null), 420);
    }
    say(
      pinned
        ? `Pinned ${n.title || "Untitled"}.`
        : `Unpinned ${n.title || "Untitled"}.`,
    );
  };

  const remove = (id: string) => {
    const before = listRef.current;
    const n = before.find((x) => x.id === id);
    if (!n) return;
    const order = rows.map((r) => r.note.id);
    const i = order.indexOf(id);
    const nextId = order[i + 1] ?? order[i - 1] ?? null;
    commit(before.filter((x) => x.id !== id));
    onDelete?.(n);
    if (openId === id) {
      setOpen(nextId);
      if (phone) setPhoneOpen(false);
    }
    say(`Deleted ${n.title || "Untitled"}.`);
  };

  const addTag = (raw: string, by?: Element | null) => {
    if (!open || disabled) return;
    const t = tagOf(raw);
    if (!t || open.tags.includes(t)) {
      setDraftTag("");
      return;
    }
    patch(open.id, (x) => ({ ...x, tags: [...x.tags, t], updated: nowMs }));
    setDraftTag("");
    click(1.15, by);
    say(`Tagged ${t}.`);
  };
  const dropTag = (t: string, by?: Element | null) => {
    if (!open || disabled) return;
    patch(open.id, (x) => ({
      ...x,
      tags: x.tags.filter((y) => y !== t),
      updated: nowMs,
    }));
    click(0.9, by);
    say(`Removed tag ${t}.`);
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const go = (j: number) => {
      const r = rows[Math.min(rows.length - 1, Math.max(0, j))];
      if (!r) return;
      setFocusRow(r.note.id);
      const node = rowsRef.current.get(r.note.id);
      node?.focus();
      tick(j, node);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(rows.length - 1);
        return;
    }
  };

  /* ------------------------------- parts -------------------------------- */

  const count = shown.length;
  const listTitle = tagFilter ? `#${tagFilter}` : "All notes";

  const searchField = (
    <div ref={setFieldBox} className="relative h-8 w-full">
      <motion.div
        className="absolute inset-0"
        style={
          search === "expand"
            ? { clipPath: fieldClip, opacity: fieldShown }
            : undefined
        }
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
        />
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          aria-label="Search notes"
          aria-describedby={hintId}
          placeholder="Search notes"
          autoComplete="off"
          spellCheck={false}
          value={q}
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQuery(value);
          }}
          onBlur={() => {
            if (search === "expand" && !q) setSearchOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (q) {
                event.preventDefault();
                setQuery("");
                say("Search cleared.");
              } else if (search === "expand") {
                event.preventDefault();
                setSearchOpen(false);
                searchButton.current?.focus();
              }
            } else if (event.key === "ArrowDown") {
              const first = rows[0];
              if (!first) return;
              event.preventDefault();
              setFocusRow(first.note.id);
              rowsRef.current.get(first.note.id)?.focus();
            }
          }}
          className={cn(
            "h-full w-full rounded-2 border border-hairline bg-surface-1 pr-8 pl-8 text-[13px] text-foreground placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none",
            FOCUS_IN,
          )}
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            className={cn(
              "absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_IN,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </motion.div>
    </div>
  );

  const tagChips = (
    <div className="relative">
      <div
        role="group"
        aria-label="Filter by tag"
        className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-16px),transparent)] px-3 pb-2"
      >
        {[{ name: null as string | null, count: list.length }, ...tags].map(
          (t, i) => {
            const on = tagFilter === t.name;
            return (
              <button
                key={t.name ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={(event) => chooseTag(t.name, event.currentTarget, i)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
                  on
                    ? "border-cobalt-bright/50 bg-cobalt-wash text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {t.name ? `#${t.name}` : "All"}
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {t.count}
                </span>
              </button>
            );
          },
        )}
      </div>
    </div>
  );

  const sidebar = (
    <nav
      aria-label="Tags"
      className="flex h-full flex-col border-r border-hairline bg-surface-1"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
        <NotebookPen aria-hidden className="size-4 text-cobalt-bright" />
        <p className="truncate text-sm font-semibold">Fieldline notes</p>
      </div>
      <ul
        role="list"
        className="flex flex-1 [scrollbar-width:thin] flex-col gap-px overflow-y-auto overscroll-contain p-2"
      >
        {[{ name: null as string | null, count: list.length }, ...tags].map(
          (t, i) => {
            const on = tagFilter === t.name;
            return (
              <li key={t.name ?? "all"}>
                {i === 1 ? (
                  <p className="px-2 pt-3 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Tags
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={(event) => chooseTag(t.name, event.currentTarget, i)}
                  className={cn(
                    "relative flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[13px] transition-colors",
                    on
                      ? "text-foreground"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_IN,
                  )}
                >
                  {on ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${idBase}-tag`}
                      className="absolute inset-0 rounded-2 bg-cobalt-wash"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  {t.name ? (
                    <Hash
                      aria-hidden
                      className="relative size-3.5 shrink-0 text-ink-3"
                    />
                  ) : (
                    <NotebookPen
                      aria-hidden
                      className="relative size-3.5 shrink-0 text-ink-3"
                    />
                  )}
                  <span className="relative min-w-0 flex-1 truncate">
                    {t.name ?? "All notes"}
                  </span>
                  <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                    {t.count}
                  </span>
                </button>
              </li>
            );
          },
        )}
      </ul>
    </nav>
  );

  const roving =
    focusRow && rows.some((r) => r.note.id === focusRow)
      ? focusRow
      : ((openId && rows.some((r) => r.note.id === openId)
          ? openId
          : rows[0]?.note.id) ?? null);

  const listPane = (
    <section
      aria-labelledby={listHeadId}
      className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] bg-card"
    >
      <div className="relative flex h-14 items-center gap-2 border-b border-hairline px-3">
        <h2
          id={listHeadId}
          className="flex min-w-0 flex-1 items-baseline gap-2 truncate text-sm font-semibold"
        >
          <span className="truncate">{listTitle}</span>
          <span className="font-mono text-[11px] font-normal text-ink-3">
            <Roll value={count} motionSafe={motionSafe} />
            <span className="sr-only"> {count === 1 ? "note" : "notes"}</span>
          </span>
        </h2>
        {search === "expand" ? (
          <>
            <button
              ref={searchButton}
              type="button"
              aria-label="Search notes"
              aria-expanded={expanded}
              aria-controls={searchId}
              tabIndex={expanded ? -1 : 0}
              onClick={(event) => {
                click(1.05, event.currentTarget);
                setSearchOpen(true);
                focusNext.current = () => searchRef.current;
              }}
              className={cn(TOOL, expanded && "pointer-events-none opacity-0")}
            >
              <Search aria-hidden className="size-4" />
            </button>
            <div
              className={cn(
                "absolute inset-y-3 right-13 left-3",
                !expanded && "pointer-events-none",
              )}
              aria-hidden={!expanded || undefined}
            >
              {searchField}
            </div>
          </>
        ) : null}
        <button
          type="button"
          aria-label="New note"
          title="New note"
          disabled={disabled || status !== "ready"}
          onClick={(event) => create(event.currentTarget)}
          className={TOOL}
        >
          <SquarePen aria-hidden className="size-4" />
        </button>
      </div>
      <div>
        {search === "field" ? (
          <div className="px-3 pt-2.5 pb-2">{searchField}</div>
        ) : null}
        {!desktop ? (
          <div className={search === "field" ? "" : "pt-2.5"}>{tagChips}</div>
        ) : null}
      </div>
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-4 px-4 pt-3">
            {[70, 54, 82, 46, 64].map((w, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <span
                  className="block h-3.5 rounded-1 bg-surface-2"
                  style={{ width: `${w}%` }}
                />
                <span className="block h-3 w-4/5 rounded-1 bg-surface-2" />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-2 px-4 pt-4">
            <p className="text-[13px] text-foreground">Notes did not load.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 pt-4">
            <p className="text-[13px] text-foreground">
              {q
                ? `No notes match “${q.trim()}”`
                : tagFilter
                  ? `Nothing tagged ${tagFilter} yet`
                  : "No notes yet"}
            </p>
            {q ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          <ul
            role="list"
            aria-labelledby={listHeadId}
            aria-describedby={hintId}
            className="flex flex-col p-1.5"
          >
            {rows.map((r, i) => {
              const n = r.note;
              const on = n.id === openId;
              const head = r.group && r.group !== rows[i - 1]?.group;
              const snippet = snippetFor(n);
              const fresh = n.id === recent;
              return (
                <motion.li
                  key={n.id}
                  layout={motionSafe ? "position" : false}
                  className={cn("relative", lifted === n.id && "z-10")}
                  initial={
                    fresh
                      ? { opacity: 0, y: motionSafe ? -distances.step : 0 }
                      : false
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: lifted === n.id ? 1.02 : 1,
                  }}
                  transition={
                    motionSafe
                      ? {
                          layout: springs.glide,
                          scale: springs.snap,
                          y: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {head ? (
                    <h3 className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {r.group === "pinned" ? "Pinned" : "Notes"}
                    </h3>
                  ) : null}
                  <button
                    ref={(node) => {
                      if (node) rowsRef.current.set(n.id, node);
                      else rowsRef.current.delete(n.id);
                    }}
                    type="button"
                    tabIndex={n.id === roving ? 0 : -1}
                    aria-current={on ? "true" : undefined}
                    onFocus={() => setFocusRow(n.id)}
                    onKeyDown={(event) => onRowKey(event, i)}
                    onClick={(event) => openNote(n.id, event.currentTarget)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-2 px-2.5 text-left transition-[background-color,box-shadow]",
                      d.row,
                      on ? "bg-cobalt-wash" : "hover:bg-surface-2",
                      lifted === n.id &&
                        "bg-popover shadow-[0_8px_22px_color-mix(in_oklab,black_16%,transparent)]",
                      FOCUS_IN,
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      {pinning && n.pinned ? (
                        <Pin
                          aria-hidden
                          className="size-3 shrink-0 text-warn"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        <Marked text={n.title || "Untitled"} words={words} />
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                        {whenOf(n.updated, nowMs, off)}
                      </span>
                    </span>
                    {pinning && n.pinned ? (
                      <span className="sr-only">, pinned</span>
                    ) : null}
                    {d.lines > 0 || words.length ? (
                      <span
                        className={cn(
                          "text-xs leading-[18px] text-ink-3",
                          d.lines === 2 ? "line-clamp-2" : "line-clamp-1",
                        )}
                      >
                        {snippet ? (
                          <Marked text={snippet} words={words} />
                        ) : (
                          "No text yet"
                        )}
                      </span>
                    ) : null}
                    {d.tags && n.tags.length ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {n.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-surface-2 px-1.5 text-[10px] leading-4 text-ink-2"
                          >
                            #{t}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );

  const editorPane = (
    <section
      aria-label={open ? `Note: ${open.title || "Untitled"}` : "Note"}
      className="flex h-full min-w-0 flex-col bg-card"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-2 @min-[40rem]:px-3">
        {phone ? (
          <button
            type="button"
            aria-label="All notes"
            data-notes-back=""
            onClick={(event) => back(event.currentTarget)}
            className={TOOL}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-xs text-ink-3">
          {open ? (
            <>
              Edited {whenOf(open.updated, nowMs, off)}
              {dayIndex(open.updated, off) === dayIndex(nowMs, off)
                ? ""
                : ` ${clock(open.updated, off)}`}{" "}
              ·{" "}
              <span className="tabular-nums">
                {plural(wordsIn(bodyOf(open)), "word")}
              </span>
            </>
          ) : null}
        </p>
        {open && pinning ? (
          <PinPress
            key={`pin-${open.id}`}
            size="sm"
            compact={phone}
            name="Pin note"
            label="Pin"
            pressedLabel="Pinned"
            tag={!phone}
            pressed={!!open.pinned}
            onPressedChange={(p) => togglePin(open.id, p)}
            sound={sound}
            disabled={disabled || status !== "ready"}
          />
        ) : null}
        {open ? (
          <BinLid
            key={`bin-${open.id}`}
            iconOnly
            size="sm"
            window={4000}
            itemName={open.title || "Untitled"}
            onDelete={() => remove(open.id)}
            sound={sound}
            disabled={disabled || status !== "ready"}
          />
        ) : null}
      </div>
      {open ? (
        <motion.div
          key={open.id}
          className="flex flex-1 flex-col overflow-hidden"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <div
            className="flex shrink-0 flex-col gap-2 pt-4 pr-4"
            style={{ paddingLeft: inset }}
          >
            <input
              ref={titleRef}
              id={titleId}
              aria-label="Title"
              placeholder="Untitled"
              value={open.title}
              readOnly={disabled}
              onChange={(event) => {
                const value = event.currentTarget.value;
                patch(open.id, (x) => ({ ...x, title: value, updated: nowMs }));
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                bodyRef.current
                  ?.querySelector<HTMLTextAreaElement>("textarea")
                  ?.focus();
              }}
              className={cn(
                "-mx-1.5 h-9 w-[calc(100%+0.75rem)] rounded-2 bg-transparent px-1.5 text-xl font-semibold tracking-[-0.01em] text-foreground placeholder:text-ink-3",
                FOCUS_IN,
              )}
            />
            <ul
              role="list"
              aria-label="Tags"
              className="flex flex-wrap items-center gap-1.5"
            >
              <AnimatePresence initial={false}>
                {open.tags.map((t) => (
                  <motion.li
                    key={t}
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0, scale: motionSafe ? 0.8 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? { ...springs.snap, layout: springs.glide }
                        : { duration: durations.fast }
                    }
                    className="inline-flex h-7 items-center gap-0.5 rounded-full border border-hairline bg-surface-1 pr-0.5 pl-2.5 text-xs text-ink-2"
                  >
                    #{t}
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      disabled={disabled}
                      onClick={(event) => dropTag(t, event.currentTarget)}
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                        FOCUS_IN,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              <li className="inline-flex">
                <input
                  aria-label="Add tag"
                  placeholder="Add tag"
                  value={draftTag}
                  readOnly={disabled}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (/[,]/.test(value)) addTag(value, event.currentTarget);
                    else setDraftTag(value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag(draftTag, event.currentTarget);
                    } else if (event.key === "Backspace" && !draftTag) {
                      const last = open.tags[open.tags.length - 1];
                      if (last) {
                        event.preventDefault();
                        dropTag(last, event.currentTarget);
                      }
                    }
                  }}
                  className={cn(
                    "h-7 w-24 rounded-full border border-dashed border-hairline-strong bg-transparent px-2.5 text-xs text-foreground placeholder:text-ink-3",
                    FOCUS_IN,
                  )}
                />
              </li>
            </ul>
          </div>
          <div
            ref={(node) => {
              bodyRef.current = node;
              setBody(node);
            }}
            className="flex-1 overflow-hidden"
          >
            <BlockEditor
              key={open.id}
              blocks={open.blocks}
              onBlocksChange={(next) =>
                patch(open.id, (x) => ({ ...x, blocks: next, updated: nowMs }))
              }
              title={open.title || "Untitled"}
              label="Note body"
              status={status}
              onRetry={onRetry}
              readOnly={disabled}
              sound={sound}
              className="h-full grid-rows-[minmax(0,1fr)] rounded-none border-0 bg-transparent [&>header]:hidden"
            />
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <NotebookPen aria-hidden className="size-6 text-ink-3" />
          <p className="text-sm text-ink-2">
            {status === "loading"
              ? "Loading notes"
              : "Pick a note, or start a new one."}
          </p>
          {status === "ready" ? (
            <button
              type="button"
              onClick={(event) => create(event.currentTarget)}
              disabled={disabled}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
                FOCUS,
              )}
            >
              <SquarePen aria-hidden className="size-3.5" />
              New note
            </button>
          ) : null}
        </div>
      )}
    </section>
  );

  /* ------------------------------ the layout ---------------------------- */

  const listW = desktop ? 300 : 280;

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        const t = event.target;
        const typing =
          t instanceof HTMLElement &&
          (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
        if (event.key === "/" && !typing && search !== "off") {
          event.preventDefault();
          if (expanded && !(phone && phoneOpen)) {
            searchRef.current?.focus();
            return;
          }
          // The field arrives with the next render; focus follows it there.
          if (search === "expand") setSearchOpen(true);
          if (phone && phoneOpen) back(null);
          focusNext.current = () => searchRef.current;
          return;
        }
        if (phone && phoneOpen && !typing) {
          if (
            event.key === "Escape" ||
            (event.altKey && event.key === "ArrowLeft")
          ) {
            event.preventDefault();
            back(null);
          }
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {phone ? (
        <div className="relative h-full">
          <StackScreen
            index={0}
            depth={depth}
            level={level}
            motionSafe={motionSafe}
          >
            {listPane}
          </StackScreen>
          <StackScreen
            index={1}
            depth={depth}
            level={level}
            motionSafe={motionSafe}
          >
            {editorPane}
          </StackScreen>
          {level > 0 && motionSafe ? (
            <EdgeBack
              width={W}
              level={level}
              depth={depth}
              onGrab={() => depthAnim.current?.stop()}
              onBack={() => back(null)}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex h-full">
          {desktop ? (
            <div className="h-full w-[196px] shrink-0">{sidebar}</div>
          ) : null}
          <div
            className="h-full shrink-0 border-r border-hairline"
            style={{ width: listW }}
          >
            {listPane}
          </div>
          <div className="h-full min-w-0 flex-1">{editorPane}</div>
        </div>
      )}
      <p id={hintId} className="sr-only">
        {search === "off"
          ? "Up and Down move between notes and Enter opens one."
          : "Down from the search reaches the notes; Up and Down move between them and Enter opens one. Slash searches from anywhere."}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
