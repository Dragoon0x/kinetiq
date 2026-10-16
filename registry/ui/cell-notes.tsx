"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  MessageSquarePlus,
  RotateCcw,
  StickyNote,
  TriangleAlert,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CellNotesValue = string | number | null;

export type CellNotesColumn = {
  /** Width in px. @default 96 */
  width?: number;
  /** How numbers in the column are written; text is shown as it is. @default "text" */
  kind?: "text" | "money" | "number" | "percent";
};

export type CellNoteReply = {
  id: string;
  author: string;
  /** When it was posted, in ms since the epoch. */
  at: number;
  text: string;
};

export type CellNote = {
  id: string;
  /** The cell it lives in, as a reference: "C4". */
  cell: string;
  author: string;
  at: number;
  text: string;
  replies: CellNoteReply[];
  resolved?: boolean;
};

export type CellNotesCornerStyle = "fold" | "flag" | "dot";
export type CellNotesDensity = "compact" | "regular" | "roomy";
export type CellNotesStatus = "ready" | "loading" | "error";

export type CellNotesProps = {
  /** The sheet, row by row. Row 1 is the sheet's own heading row. @default defaultCellNotesCells */
  cells?: CellNotesValue[][];
  /** Column widths and kinds, A first. @default defaultCellNotesColumns */
  columns?: CellNotesColumn[];
  /** Row numbers (from 1) drawn bold, like headings and totals. @default [1, 9] */
  strongRows?: number[];
  /** Controlled notes. */
  notes?: CellNote[];
  /** Initial notes when uncontrolled. @default defaultCellNotes */
  defaultNotes?: CellNote[];
  /** Fires with every note after an add, a reply or a resolve. */
  onNotesChange?: (notes: CellNote[]) => void;
  /** Controlled active cell, as a reference. */
  active?: string;
  /** Initial active cell when uncontrolled. @default "B2" */
  defaultActive?: string;
  /** Fires from the click or key that moved the active cell. */
  onActiveChange?: (cell: string) => void;
  /** Controlled open note (its id), or null. */
  open?: string | null;
  /** Initial open note when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires when a note card opens or closes. */
  onOpenChange?: (noteId: string | null) => void;
  /** A note was added to a cell. It is already in the list. */
  onAdd?: (note: CellNote) => void;
  /** A reply was posted on a note. */
  onReply?: (noteId: string, reply: CellNoteReply) => void;
  /** A note was resolved (true) or reopened (false). */
  onResolve?: (noteId: string, resolved: boolean) => void;
  /** A folded paper corner that unfolds into the card, a flat flag, or a dot. @default "fold" */
  cornerStyle?: CellNotesCornerStyle;
  /** Row height (28/32/38px), cell type and card width. @default "regular" */
  density?: CellNotesDensity;
  /** Corners, the active outline, the card's top edge and Reply — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Locale for numbers and money. @default "en-US" */
  locale?: string;
  /** Currency for money columns. @default "USD" */
  currency?: string;
  /** The name new notes and replies are posted under. @default "Noor Haddad" */
  author?: string;
  /** The moment relative times count from (Date or ms). @default defaultCellNotesNow */
  now?: number | Date;
  /** The sheet's name. @default "Fernworks · FY27 budget" */
  title?: string;
  /** Whether the sheet has arrived. @default "ready" */
  status?: CellNotesStatus;
  /** "Try again" was pressed after the sheet failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the grid and the notes scroll inside it. @default 540 */
  height?: number;
  /** Read only: notes open and read, nothing is added, replied to or resolved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultCellNotesNow = Date.UTC(2026, 9, 14, 11, 40);
const N = defaultCellNotesNow;

const lines: [string, number, number, number, number][] = [
  ["Payroll", 412000, 418000, 431000, 436000],
  ["Contractors", 64000, 58000, 72000, 49000],
  ["Cloud hosting", 38500, 41200, 44900, 47300],
  ["Field equipment", 22000, 6500, 31000, 8200],
  ["Travel", 18400, 21900, 16300, 24800],
  ["Training", 9000, 9000, 12500, 7000],
  ["Office", 26000, 26000, 26000, 26000],
];

/** The Fernworks FY27 operating budget, a quarter per column. */
export const defaultCellNotesCells: CellNotesValue[][] = (() => {
  const rows: CellNotesValue[][] = [
    ["Line item", "Q1", "Q2", "Q3", "Q4", "Total"],
  ];
  const sums = [0, 0, 0, 0, 0];
  for (const [name, ...q] of lines) {
    const total = q.reduce((a, b) => a + b, 0);
    q.forEach((v, i) => {
      sums[i] = (sums[i] ?? 0) + v;
    });
    sums[4] = (sums[4] ?? 0) + total;
    rows.push([name, ...q, total]);
  }
  rows.push(["Total", ...sums]);
  return rows;
})();

export const defaultCellNotesColumns: CellNotesColumn[] = [
  { width: 128, kind: "text" },
  { width: 88, kind: "money" },
  { width: 88, kind: "money" },
  { width: 88, kind: "money" },
  { width: 88, kind: "money" },
  { width: 100, kind: "money" },
];

export const defaultCellNotes: CellNote[] = [
  {
    id: "cn1",
    cell: "C4",
    author: "Ines Marlow",
    at: N - 5 * 60 * MIN,
    text: "Hosting jumps in Q2. Is that the Basinworks migration?",
    replies: [
      {
        id: "cn1a",
        author: "Tomas Brandt",
        at: N - 4 * 60 * MIN,
        text: "Yes. Both regions run side by side for six weeks.",
      },
      {
        id: "cn1b",
        author: "Ines Marlow",
        at: N - 3 * 60 * MIN,
        text: "Then mark it one-off so it doesn't carry into FY28.",
      },
    ],
  },
  {
    id: "cn2",
    cell: "E5",
    author: "Priya Raman",
    at: N - 70 * MIN,
    text: "Q4 equipment looks low for the two new field sites.",
    replies: [],
  },
  {
    id: "cn3",
    cell: "B3",
    author: "Kenji Ito",
    at: N - 26 * 60 * MIN,
    text: "Two contracts end in March, so Q2 should drop.",
    replies: [
      {
        id: "cn3a",
        author: "Noor Haddad",
        at: N - 25 * 60 * MIN,
        text: "It does. Resolving.",
      },
    ],
    resolved: true,
  },
  {
    id: "cn4",
    cell: "F9",
    author: "Tomas Brandt",
    at: N - 22 * MIN,
    text: "The total is 2% over the cap. Which line gives?",
    replies: [
      {
        id: "cn4a",
        author: "Noor Haddad",
        at: N - 9 * MIN,
        text: "Training and travel, I think.",
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const NARROW = 640;
const ROW_HEAD = 36;
const COL_HEAD = 24;
/** The corner's leg, and where the card's unfold starts. */
const CORNER: Record<CellNotesDensity, number> = {
  compact: 7,
  regular: 8,
  roomy: 9,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  CellNotesDensity,
  { row: number; cell: string; card: number; text: string; pad: string }
> = {
  compact: {
    row: 28,
    cell: "text-[12px]",
    card: 248,
    text: "text-[12px] leading-[18px]",
    pad: "p-2.5",
  },
  regular: {
    row: 32,
    cell: "text-[13px]",
    card: 264,
    text: "text-[13px] leading-5",
    pad: "p-3",
  },
  roomy: {
    row: 38,
    cell: "text-[13px]",
    card: 288,
    text: "text-[13px] leading-[22px]",
    pad: "p-3.5",
  },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

const letter = (col: number) => {
  let n = col;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};
const refOf = (row: number, col: number) => `${letter(col)}${row + 1}`;
function parseRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1] ?? "") col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

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

/**
 * The card's clip while it unfolds from one corner: the rectangle cut by a
 * crease running diagonally across it, `d` pixels from the corner along each
 * edge. At `d` = the corner's leg it is the corner triangle; past w + h it is
 * the whole card.
 */
function unfoldPolygon(d: number, w: number, h: number, right: boolean) {
  const pts: [number, number][] = [
    [0, 0],
    [Math.min(d, w), 0],
  ];
  if (d > w) pts.push([w, Math.min(d - w, h)]);
  if (d > h) pts.push([Math.min(d - h, w), h]);
  pts.push([0, Math.min(d, h)]);
  const out = pts.map(([x, y]) => `${r1(right ? w - x : x)}px ${r1(y)}px`);
  return `polygon(${out.join(", ")})`;
}

/** The lip of paper along the crease: a thin triangle that shrinks as it opens. */
function flapPolygon(
  d: number,
  w: number,
  h: number,
  lip: number,
  right: boolean,
) {
  const a: [number, number] = d <= w ? [d, 0] : [w, d - w];
  const b: [number, number] = d <= h ? [0, d] : [d - h, h];
  const mx = (a[0] + b[0]) / 2 - lip * 0.7;
  const my = (a[1] + b[1]) / 2 - lip * 0.7;
  const pts: [number, number][] = [a, b, [mx, my]];
  const out = pts.map(([x, y]) => `${r1(right ? w - x : x)}px ${r1(y)}px`);
  return `polygon(${out.join(", ")})`;
}

/* ----------------------------------------------------------------------- */
/*                                  Corner                                  */
/* ----------------------------------------------------------------------- */

/**
 * The mark in an annotated cell's top-right corner. The fold is two
 * triangles: the cut corner (the cell's page turned back) and the flap
 * lying over it. Resolving folds the flap back flat on snap.
 */
function Corner({
  cornerStyle,
  size,
  resolved,
  motionSafe,
}: {
  cornerStyle: CellNotesCornerStyle;
  size: number;
  resolved: boolean;
  motionSafe: boolean;
}) {
  const t = motionSafe ? springs.snap : { duration: 0 };
  if (cornerStyle === "dot") {
    return (
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 right-1 size-[7px] rounded-full border-[1.5px] transition-colors",
          resolved
            ? "border-ink-3 bg-transparent"
            : "border-(--cn-accent) bg-(--cn-accent)",
        )}
        initial={false}
        animate={{ scale: resolved ? 0.8 : 1 }}
        transition={t}
      />
    );
  }
  if (cornerStyle === "flag") {
    return (
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 right-0 transition-colors",
          resolved ? "bg-ink-3/45" : "bg-(--cn-accent)",
        )}
        style={{
          width: size,
          height: size,
          clipPath: "polygon(0 0, 100% 0, 100% 100%)",
          originX: 1,
          originY: 0,
        }}
        initial={false}
        animate={{ scale: resolved ? 0.75 : 1 }}
        transition={t}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 right-0"
      style={{ width: size + 1, height: size + 1 }}
    >
      <motion.span
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--cn-accent)_28%,var(--bg-0))]"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
        initial={false}
        animate={{ opacity: resolved ? 0 : 1 }}
        transition={motionSafe ? { duration: durations.fast } : { duration: 0 }}
      />
      <motion.span
        className={cn(
          "absolute inset-0 transition-colors",
          resolved ? "bg-ink-3/40" : "bg-(--cn-accent)",
        )}
        style={{
          clipPath: "polygon(0 0, 100% 100%, 0 100%)",
          originX: 0,
          originY: 0,
        }}
        initial={false}
        animate={
          resolved
            ? { scaleX: 0.5, scaleY: 0.5, opacity: 0.8 }
            : { scaleX: 1, scaleY: 1, opacity: 1 }
        }
        transition={t}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The card                                 */
/* ----------------------------------------------------------------------- */

/**
 * A note's card. It opens out of its corner: one value `u` runs 0→1 on
 * glide and both the clip (a diagonal crease sweeping across the card) and
 * the paper's lip along the crease are rebuilt from it each frame. It folds
 * back on the exit ease before it leaves.
 */
function NoteCard({
  x,
  y,
  width,
  right,
  corner,
  withFlap,
  motionSafe,
  labelledBy,
  onKeyDown,
  children,
}: {
  x: number;
  y: number;
  width: number;
  right: boolean;
  corner: number;
  withFlap: boolean;
  motionSafe: boolean;
  labelledBy: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const u = useMotionValue(motionSafe ? 0 : 1);
  const fade = useMotionValue(motionSafe ? 1 : 0);
  const w = useMotionValue(width);
  const h = useMotionValue(120);
  const side = useMotionValue(right ? 1 : 0);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const clip = useTransform(
    [u, w, h, side] as MotionValue<number>[],
    ([v = 0, ww = 0, hh = 0, s = 0]: number[]) =>
      v >= 0.999
        ? "none"
        : unfoldPolygon(corner + v * (ww + hh - corner), ww, hh, s > 0.5),
  );
  const flap = useTransform(
    [u, w, h, side] as MotionValue<number>[],
    ([v = 0, ww = 0, hh = 0, s = 0]: number[]) =>
      flapPolygon(
        corner + v * (ww + hh - corner),
        ww,
        hh,
        Math.max(0, (1 - v) * 16),
        s > 0.5,
      ),
  );
  const flapOpacity = useTransform(u, (v) =>
    withFlap && motionSafe ? Number(clamp((1 - v) * 3, 0, 1).toFixed(3)) : 0,
  );

  React.useEffect(() => {
    side.jump(right ? 1 : 0);
  }, [right, side]);
  React.useEffect(() => {
    w.jump(width);
  }, [width, w]);

  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      h.jump(node.offsetHeight);
      w.jump(node.offsetWidth);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [h, w]);

  // Opening: unfold on glide (or fade in place under reduced motion).
  React.useEffect(() => {
    if (!isPresent) return;
    if (!motionSafe) {
      u.jump(1);
      const c = animate(fade, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
      return () => c.stop();
    }
    fade.jump(1);
    const c = animate(u, 1, springs.glide);
    return () => c.stop();
  }, [isPresent, motionSafe, u, fade]);

  // Closing: fold back on the exit ease, then leave.
  React.useEffect(() => {
    if (isPresent) return;
    const done = () => safeToRemove?.();
    const c = motionSafe
      ? animate(u, 0, {
          duration: durations.base * 0.75,
          ease: easings.exit,
          onComplete: done,
        })
      : animate(fade, 0, { duration: durations.fast, onComplete: done });
    return () => c.stop();
  }, [isPresent, motionSafe, u, fade, safeToRemove]);

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="absolute z-[6] drop-shadow-[0_8px_18px_color-mix(in_oklab,black_16%,transparent)]"
      style={{ left: x, top: y, width, opacity: fade }}
    >
      <motion.div
        ref={bodyRef}
        className="relative overflow-hidden rounded-3 border border-t-2 border-hairline-strong border-t-(--cn-accent) bg-popover"
        style={{ clipPath: clip }}
      >
        {children}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--cn-accent)_40%,var(--card))]"
          style={{ clipPath: flap, opacity: flapOpacity }}
        />
      </motion.div>
    </motion.div>
  );
}

function Avatar({ name, you }: { name: string; you: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-semibold",
        you
          ? "bg-[color-mix(in_oklab,var(--cn-accent)_16%,transparent)] text-(--cn-ink)"
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
  textClass,
  onChange,
  onSubmit,
}: {
  focusKey: string;
  label: string;
  placeholder: string;
  value: string;
  textClass: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid rounded-2 border border-hairline-strong bg-card">
      <textarea
        data-cn-focus={focusKey}
        aria-label={label}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const text = event.currentTarget.value;
          onChange(text);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          "max-h-24 resize-none overflow-y-auto rounded-2 bg-transparent px-2.5 py-1.5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
          textClass,
          FOCUS_RING,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "invisible max-h-24 overflow-hidden px-2.5 py-1.5 break-words whitespace-pre-wrap [grid-area:1/1]",
          textClass,
        )}
      >
        {`${value} `}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The sheet                                 */
/* ----------------------------------------------------------------------- */

/**
 * A spreadsheet whose notes live in their cells. Every annotated cell carries
 * a corner in its top-right; opening a note grows its card out of that corner
 * — one value on glide drives a diagonal crease sweeping across the card's
 * clip and a lip of paper along it, so the card reads as a note unfolding
 * from the cell — and closing folds it back on the exit ease. Replies stack
 * inside the card, each landing from 4px on snap while the card's height
 * follows. Resolving folds the corner back flat on snap.
 *
 * It is a real `role="grid"` with one roving cell whose outline travels cell
 * to cell on snap: arrows move, Home and End reach the row's ends, Ctrl with
 * Home or End the sheet's, Shift+F2 opens the active cell's note (or starts
 * one), Enter opens an existing note, Escape closes the card and returns
 * focus to its cell. A sidebar lists every note in sheet order and becomes a
 * sheet below a 40rem container. Under reduced motion cards fade in place,
 * the outline jumps and corners swap flat at once; every note, count and
 * state still shows.
 */
export function CellNotes({
  cells = defaultCellNotesCells,
  columns = defaultCellNotesColumns,
  strongRows = [1, 9],
  notes,
  defaultNotes,
  onNotesChange,
  active,
  defaultActive = "B2",
  onActiveChange,
  open,
  defaultOpen = null,
  onOpenChange,
  onAdd,
  onReply,
  onResolve,
  cornerStyle = "fold",
  density = "regular",
  accent = "var(--accent-bright)",
  locale = "en-US",
  currency = "USD",
  author = "Noor Haddad",
  now = defaultCellNotesNow,
  title = "Fernworks · FY27 budget",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: CellNotesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const cardTitleId = `${uid}-card`;
  const sheetTitleId = `${uid}-sheet`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const dens = DENSITY[density] ?? DENSITY.regular;
  const rowH = dens.row;
  const corner = CORNER[density] ?? 8;

  const nRows = cells.length;
  const nCols = Math.max(1, ...cells.map((r) => r.length), columns.length);
  const widths = Array.from({ length: nCols }, (_, i) =>
    Math.round(columns[i]?.width ?? 96),
  );
  const lefts = widths.reduce<number[]>(
    (acc, w, i) => [...acc, (acc[i] ?? ROW_HEAD) + w],
    [ROW_HEAD],
  );
  const gridW = lefts[nCols] ?? ROW_HEAD;
  const gridH = COL_HEAD + nRows * rowH;
  const strong = new Set(strongRows);

  const money = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency],
  );
  const plain = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );
  const show = (value: CellNotesValue, col: number) => {
    if (value === null || value === "") return "";
    if (typeof value === "string") return value;
    const kind = columns[col]?.kind ?? "text";
    if (kind === "money") return money.format(value);
    if (kind === "percent") return `${plain.format(value * 100)}%`;
    return plain.format(value);
  };

  /* ------------------------------- state -------------------------------- */

  const [ownNotes, setOwnNotes] = React.useState<CellNote[]>(
    () => defaultNotes ?? defaultCellNotes,
  );
  const list = notes ?? ownNotes;
  const byCell = React.useMemo(() => {
    const map = new Map<string, CellNote>();
    for (const n of list) {
      const p = parseRef(n.cell);
      if (p) map.set(refOf(p.row, p.col), n);
    }
    return map;
  }, [list]);
  const ordered = React.useMemo(
    () =>
      [...list]
        .map((n) => ({ n, p: parseRef(n.cell) }))
        .filter(
          (x): x is { n: CellNote; p: { row: number; col: number } } => !!x.p,
        )
        .sort((a, b) => a.p.row - b.p.row || a.p.col - b.p.col)
        .map((x) => x.n),
    [list],
  );

  const [ownActive, setOwnActive] = React.useState(defaultActive);
  const activeRef = (active ?? ownActive).toUpperCase();
  const at = parseRef(activeRef) ?? { row: 1, col: 1 };
  const aRow = clamp(at.row, 0, Math.max(0, nRows - 1));
  const aCol = clamp(at.col, 0, nCols - 1);
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = open !== undefined ? open : ownOpen;
  const [creating, setCreating] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [narrow, setNarrow] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [viewW, setViewW] = React.useState(0);
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const [arrival, setArrival] = React.useState({ status, n: 0 });
  if (arrival.status !== status) {
    setArrival({
      status,
      n: ready && arrival.status === "loading" ? arrival.n + 1 : arrival.n,
    });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const counter = React.useRef(0);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const sheetY = useMotionValue(0);

  const openNote = openId ? (list.find((n) => n.id === openId) ?? null) : null;
  const cardCell = openNote
    ? parseRef(openNote.cell)
    : creating
      ? parseRef(creating)
      : null;
  const openCount = list.filter((n) => !n.resolved).length;

  /* ------------------------------- effects ------------------------------ */

  React.useEffect(() => {
    const root = rootRef.current;
    const scroller = scrollRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      setNarrow(root.clientWidth < NARROW);
      if (scroller) setViewW(scroller.clientWidth);
    });
    ro.observe(root);
    if (scroller) ro.observe(scroller);
    return () => ro.disconnect();
  }, [status]);

  if (!narrow && sheetOpen) setSheetOpen(false);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-cn-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    }
  }, [focusAsk]);

  React.useEffect(
    () => () => {
      scrollRun.current?.stop();
    },
    [],
  );

  /* -------------------------------- layout ------------------------------ */

  const cardW = Math.round(
    clamp(dens.card, 200, Math.max(200, (viewW || 720) - ROW_HEAD - 12)),
  );
  const placement = (() => {
    if (!cardCell) return null;
    const left = lefts[cardCell.col] ?? ROW_HEAD;
    const right = left + (widths[cardCell.col] ?? 96);
    const top = COL_HEAD + cardCell.row * rowH;
    if (right + 2 + cardW <= gridW + 2) {
      return { x: right + 2, y: top, right: false };
    }
    if (left - 2 - cardW >= ROW_HEAD) {
      return { x: left - 2 - cardW, y: top, right: true };
    }
    // Neither side has room: under the cell, held inside the sheet.
    const x = clamp(right - cardW, ROW_HEAD, Math.max(ROW_HEAD, gridW - cardW));
    return { x, y: top + rowH + 2, right: x + cardW >= right - 1 };
  })();

  /** Glides the grid so a box in its content is in view, clear of the sticky heads. */
  const reveal = (x: number, y: number, w: number, h: number) => {
    const el = scrollRef.current;
    if (!el) return;
    let left = el.scrollLeft;
    let top = el.scrollTop;
    if (x - ROW_HEAD < left) left = x - ROW_HEAD - 4;
    else if (x + w > left + el.clientWidth) left = x + w - el.clientWidth + 6;
    if (y - COL_HEAD < top) top = y - COL_HEAD - 4;
    else if (y + h > top + el.clientHeight) top = y + h - el.clientHeight + 6;
    left = Math.max(0, Math.round(left));
    top = Math.max(0, Math.round(top));
    if (left === el.scrollLeft && top === el.scrollTop) return;
    scrollRun.current?.stop();
    if (!motionSafe) {
      el.scrollLeft = left;
      el.scrollTop = top;
      return;
    }
    const fromL = el.scrollLeft;
    const fromT = el.scrollTop;
    scrollRun.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollLeft = Math.round(fromL + (left - fromL) * v);
        el.scrollTop = Math.round(fromT + (top - fromT) * v);
      },
    });
  };

  // An opened card is brought into view once it has its height.
  const cardKey = placement ? `${openId ?? creating}` : null;
  React.useEffect(() => {
    if (!placement || !cardKey) return;
    const raf = requestAnimationFrame(() => {
      const card =
        scrollRef.current?.querySelector<HTMLElement>("[role='dialog']");
      reveal(placement.x, placement.y, cardW, card?.offsetHeight ?? 160);
    });
    return () => cancelAnimationFrame(raf);
    // The card's place is what matters; the helpers are stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  /* ------------------------------- actions ------------------------------ */

  const writeNotes = (next: CellNote[]) => {
    if (notes === undefined) setOwnNotes(next);
    onNotesChange?.(next);
  };

  const setOpen = (id: string | null) => {
    if (id === openId) return;
    if (open === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };

  const moveTo = (row: number, col: number, focus = true) => {
    const r = clamp(row, 0, nRows - 1);
    const c = clamp(col, 0, nCols - 1);
    const ref = refOf(r, c);
    if (ref !== activeRef) {
      if (active === undefined) setOwnActive(ref);
      onActiveChange?.(ref);
    }
    if (focus) ask(`cell:${ref}`);
    reveal(lefts[c] ?? ROW_HEAD, COL_HEAD + r * rowH, widths[c] ?? 96, rowH);
  };

  const openCard = (ref: string, from?: HTMLElement | null) => {
    const note = byCell.get(ref);
    opener.current =
      from ??
      rootRef.current?.querySelector<HTMLElement>(
        `[data-cn-focus="cell:${CSS.escape(ref)}"]`,
      ) ??
      null;
    if (note) {
      setCreating(null);
      setOpen(note.id);
      ask(note.resolved || locked ? "card-close" : `reply:${note.id}`);
      say(
        `Note on ${ref} by ${note.author}, ${plural(note.replies.length, "reply", "replies")}${note.resolved ? ", resolved" : ""}.`,
      );
    } else {
      if (locked) {
        say(`${ref} has no note.`);
        return;
      }
      setOpen(null);
      setCreating(ref);
      ask("new");
      say(`New note on ${ref}.`);
    }
  };

  const closeCard = (refocus = true) => {
    const back = opener.current;
    opener.current = null;
    setOpen(null);
    setCreating(null);
    if (refocus) {
      if (back && back.isConnected) back.focus({ preventScroll: true });
      else ask(`cell:${activeRef}`);
    }
  };

  const newId = (kind: string) => {
    const taken = new Set([
      ...list.map((n) => n.id),
      ...list.flatMap((n) => n.replies.map((r) => r.id)),
    ]);
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-${kind}${counter.current}`;
    } while (taken.has(id));
    return id;
  };

  const postNew = () => {
    if (!creating || locked) return;
    const text = (drafts.__new ?? "").trim();
    if (!text) {
      say("Write the note before posting.");
      return;
    }
    const note: CellNote = {
      id: newId("note"),
      cell: creating,
      author,
      at: nowMs,
      text,
      replies: [],
    };
    writeNotes([...list, note]);
    setDrafts((d) => ({ ...d, __new: "" }));
    setFresh((f) => new Set(f).add(note.id));
    setCreating(null);
    if (open === undefined) setOwnOpen(note.id);
    onOpenChange?.(note.id);
    ask(`reply:${note.id}`);
    say(`Note added to ${note.cell}.`);
    onAdd?.(note);
  };

  const postReply = (note: CellNote) => {
    if (locked) return;
    const text = (drafts[note.id] ?? "").trim();
    if (!text) return;
    const reply: CellNoteReply = {
      id: newId("reply"),
      author,
      at: nowMs,
      text,
    };
    writeNotes(
      list.map((n) =>
        n.id === note.id ? { ...n, replies: [...n.replies, reply] } : n,
      ),
    );
    setDrafts((d) => ({ ...d, [note.id]: "" }));
    setFresh((f) => new Set(f).add(reply.id));
    say(`Reply posted on ${note.cell}.`);
    onReply?.(note.id, reply);
  };

  const toggleResolved = (note: CellNote) => {
    if (locked) return;
    const next = !note.resolved;
    writeNotes(
      list.map((n) => (n.id === note.id ? { ...n, resolved: next } : n)),
    );
    say(
      next
        ? `Note on ${note.cell} resolved.`
        : `Note on ${note.cell} reopened.`,
    );
    ask(next ? "card-close" : `reply:${note.id}`);
    onResolve?.(note.id, next);
  };

  const chooseFromList = (note: CellNote) => {
    const p = parseRef(note.cell);
    if (!p) return;
    moveTo(p.row, p.col, false);
    if (narrow) setSheetOpen(false);
    opener.current = null;
    setCreating(null);
    setOpen(note.id);
    ask(note.resolved || locked ? "card-close" : `reply:${note.id}`);
    say(`Note on ${note.cell} by ${note.author}.`);
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !target.closest("[data-cn-focus^='cell:']")
    ) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(aRow, aCol + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(aRow, aCol - 1);
        return;
      case "ArrowDown":
        event.preventDefault();
        moveTo(aRow + 1, aCol);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(aRow - 1, aCol);
        return;
      case "Home":
        event.preventDefault();
        moveTo(mod ? 0 : aRow, 0);
        return;
      case "End":
        event.preventDefault();
        moveTo(mod ? nRows - 1 : aRow, nCols - 1);
        return;
      case "F2":
        if (event.shiftKey) {
          event.preventDefault();
          openCard(activeRef);
        }
        return;
      case "Enter":
        if (byCell.has(activeRef)) {
          event.preventDefault();
          openCard(activeRef);
        }
        return;
      case "Escape":
        if (openId || creating) {
          event.preventDefault();
          closeCard();
        }
        return;
      default:
        return;
    }
  };

  const onCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Ours: the card closes and focus goes home to its cell.
      event.preventDefault();
      event.stopPropagation();
      closeCard();
    }
  };

  /* -------------------------------- render ------------------------------ */

  const outlineX = lefts[aCol] ?? ROW_HEAD;
  const outlineY = COL_HEAD + aRow * rowH;
  const outlineW = widths[aCol] ?? 96;
  const activeValue = show(cells[aRow]?.[aCol] ?? null, aCol);
  const activeNote = byCell.get(activeRef);
  const template = `${ROW_HEAD}px ${widths.map((w) => `${w}px`).join(" ")}`;

  const cardBody = () => {
    const ref = openNote?.cell.toUpperCase() ?? creating ?? "";
    const smallBtn = cn(
      "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
      FOCUS_RING,
    );
    const primary = cn(
      "inline-flex h-7 items-center rounded-2 bg-(--cn-button) px-2.5 text-[12px] font-medium text-white transition-opacity aria-disabled:opacity-45",
      FOCUS_RING,
    );
    return (
      <div className={cn("flex flex-col gap-2.5", dens.pad)}>
        <div className="flex items-center gap-2">
          <span className="rounded-1 bg-[color-mix(in_oklab,var(--cn-accent)_14%,transparent)] px-1.5 py-0.5 font-mono text-[11px] leading-4 text-(--cn-ink)">
            {ref}
          </span>
          <p
            id={cardTitleId}
            className="min-w-0 flex-1 truncate text-[12px] font-semibold"
          >
            {openNote ? `Note on ${ref}` : `New note on ${ref}`}
          </p>
          {openNote?.resolved ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-success">
              <Check aria-hidden className="size-3" />
              Resolved
            </span>
          ) : null}
          <button
            type="button"
            data-cn-focus="card-close"
            aria-label="Close note"
            onClick={() => closeCard()}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
        {openNote ? (
          <>
            <ol
              role="list"
              className="flex max-h-48 flex-col gap-2.5 overflow-y-auto"
            >
              {[
                {
                  id: openNote.id,
                  author: openNote.author,
                  at: openNote.at,
                  text: openNote.text,
                },
                ...openNote.replies,
              ].map((c) => (
                <motion.li
                  key={c.id}
                  className="flex gap-2"
                  initial={
                    fresh.has(c.id) && c.id !== openNote.id
                      ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
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
                        className="truncate text-[12px] font-medium text-foreground"
                      >
                        {c.author}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3">
                        {ago(c.at, nowMs)}
                      </span>
                    </p>
                    <p className={cn("break-words text-ink-2", dens.text)}>
                      {c.text}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>
            {!openNote.resolved && !locked ? (
              <Composer
                focusKey={`reply:${openNote.id}`}
                label={`Reply on ${ref}`}
                placeholder="Reply"
                value={drafts[openNote.id] ?? ""}
                textClass={dens.text}
                onChange={(text) =>
                  setDrafts((d) => ({ ...d, [openNote.id]: text }))
                }
                onSubmit={() => postReply(openNote)}
              />
            ) : null}
            {!locked ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleResolved(openNote)}
                  className={smallBtn}
                >
                  {openNote.resolved ? (
                    <RotateCcw aria-hidden className="size-3.5 shrink-0" />
                  ) : (
                    <Check aria-hidden className="size-3.5 shrink-0" />
                  )}
                  {openNote.resolved ? "Reopen" : "Resolve"}
                </button>
                {!openNote.resolved ? (
                  <button
                    type="button"
                    aria-disabled={
                      !(drafts[openNote.id] ?? "").trim() || undefined
                    }
                    onClick={() => postReply(openNote)}
                    className={primary}
                  >
                    Reply
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <Composer
              focusKey="new"
              label={`Note on ${ref}`}
              placeholder="Leave a note on this cell"
              value={drafts.__new ?? ""}
              textClass={dens.text}
              onChange={(text) => setDrafts((d) => ({ ...d, __new: text }))}
              onSubmit={() => postNew()}
            />
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => closeCard()}
                className={smallBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                aria-disabled={!(drafts.__new ?? "").trim() || undefined}
                onClick={postNew}
                className={primary}
              >
                Post
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const listStep = cascade(ordered.length);
  const notesList = (where: "aside" | "sheet") =>
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-2 p-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-3 border border-hairline p-2.5"
          >
            <span className="h-2.5 w-16 rounded-full bg-surface-2" />
            <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    ) : status === "error" ? null : ordered.length === 0 ? (
      <p className="px-4 py-8 text-center text-[13px] text-ink-2">
        {disabled
          ? "No notes on this sheet."
          : "No notes yet. Press Shift+F2 on a cell to add one."}
      </p>
    ) : (
      <ol
        role="list"
        aria-label="Notes"
        className="flex flex-col gap-1.5 p-2.5"
      >
        {ordered.map((note, i) => {
          const isOpen = note.id === openId;
          const arriving =
            arrival.n > 0 || (fresh.has(note.id) && where === "aside");
          return (
            <motion.li
              key={note.id}
              layout={motionSafe ? "position" : false}
              initial={
                arriving
                  ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                layout: springs.glide,
                y: motionSafe
                  ? {
                      ...springs.glide,
                      delay: fresh.has(note.id) ? 0 : i * listStep,
                    }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: fresh.has(note.id) ? 0 : i * listStep,
                },
              }}
            >
              <button
                type="button"
                data-cn-focus={`list:${note.id}`}
                aria-current={isOpen || undefined}
                onClick={() => chooseFromList(note)}
                className={cn(
                  "relative flex w-full flex-col gap-1 overflow-clip rounded-3 border px-3 py-2.5 text-left transition-colors",
                  isOpen
                    ? "border-[color-mix(in_oklab,var(--cn-accent)_45%,transparent)] bg-surface-1"
                    : "border-hairline bg-card hover:bg-surface-1",
                  note.resolved && "opacity-60",
                  FOCUS_IN,
                )}
              >
                {isOpen ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-0.5 bg-(--cn-accent)"
                  />
                ) : null}
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-1 px-1.5 py-0.5 font-mono text-[11px] leading-4",
                      note.resolved
                        ? "bg-surface-2 text-ink-3"
                        : "bg-[color-mix(in_oklab,var(--cn-accent)_14%,transparent)] text-(--cn-ink)",
                    )}
                  >
                    {note.cell.toUpperCase()}
                  </span>
                  <span
                    title={note.author}
                    className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground"
                  >
                    {note.author}
                  </span>
                  {note.resolved ? (
                    <Check
                      aria-label="Resolved"
                      className="size-3.5 shrink-0 text-success"
                    />
                  ) : null}
                </span>
                <span className={cn("line-clamp-2 text-ink-2", dens.text)}>
                  {note.text}
                </span>
                {note.replies.length > 0 ? (
                  <span className="text-[11px] text-ink-3">
                    {plural(note.replies.length, "reply", "replies")}
                  </span>
                ) : null}
              </button>
            </motion.li>
          );
        })}
      </ol>
    );

  const sheetDrag = useDrag({
    axis: "y",
    threshold: 3,
    onMove: ({ offset }) => {
      sheetY.set(r1(offset.y < 0 ? rubberband(offset.y, 120) : offset.y));
    },
    onEnd: ({ velocity }) => {
      const h = sheetRef.current?.offsetHeight ?? 300;
      if (project(sheetY.get(), velocity.y, 0.99) > h / 3) {
        setSheetOpen(false);
        ask("notes-button");
      } else {
        animate(sheetY, 0, { ...springs.glide, velocity: velocity.y });
      }
    },
    onCancel: () => {
      animate(sheetY, 0, springs.glide);
    },
  });

  const headerBtn = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
    FOCUS_RING,
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/cell-notes relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{
        height,
        ["--cn-accent" as string]: `oklch(from ${accent} 0.6 c h)`,
        ["--cn-button" as string]: `oklch(from ${accent} 0.52 c h)`,
        ["--cn-ink" as string]:
          "color-mix(in oklab, var(--cn-accent) 70%, var(--foreground))",
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <p
            id={titleId}
            title={title}
            className="truncate text-sm font-semibold"
          >
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {ready
              ? `${plural(list.length, "note", "notes")} · ${openCount} open`
              : status === "loading"
                ? "Loading the sheet"
                : "Sheet unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-keyshortcuts="Shift+F2"
            disabled={!ready}
            onClick={(event) => openCard(activeRef, event.currentTarget)}
            className={headerBtn}
          >
            <MessageSquarePlus aria-hidden className="size-3.5 shrink-0" />
            {activeNote ? "Open note" : "Add note"}
          </button>
          <button
            type="button"
            data-cn-focus="notes-button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            disabled={!ready}
            onClick={() => {
              setSheetOpen((o) => !o);
              sheetY.jump(0);
              ask("sheet-close");
            }}
            className={cn(headerBtn, "@min-[40rem]/cell-notes:hidden")}
          >
            <StickyNote aria-hidden className="size-3.5 shrink-0" />
            Notes
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {openCount}
            </span>
          </button>
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3 text-[12px]">
        <span className="inline-flex h-6 w-11 shrink-0 items-center justify-center rounded-1 border border-hairline bg-surface-1 font-mono text-[11px] text-ink-2">
          {ready ? activeRef : "—"}
        </span>
        <span aria-hidden className="h-4 w-px bg-hairline" />
        <span
          title={ready ? activeValue : undefined}
          className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground tabular-nums"
        >
          {ready ? activeValue : ""}
        </span>
        {ready && activeNote ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-3">
            <StickyNote aria-hidden className="size-3 shrink-0" />
            {activeNote.resolved ? "Resolved note" : activeNote.author}
          </span>
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Arrow keys move between cells. Shift with F2 opens the cell&apos;s note
        or starts one, Enter opens a note, Escape closes it.
      </p>

      <div className="relative flex flex-1 overflow-hidden">
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              This sheet didn&apos;t load.
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
        ) : (
          <div
            ref={scrollRef}
            className="relative min-w-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-surface-0"
          >
            <div className="relative" style={{ width: gridW, height: gridH }}>
              <div
                role="grid"
                aria-labelledby={titleId}
                aria-describedby={hintId}
                aria-rowcount={nRows + 1}
                aria-colcount={nCols + 1}
                aria-busy={status === "loading" || undefined}
                onKeyDown={onGridKeyDown}
                className="relative"
                style={{ width: gridW, height: gridH }}
              >
                <div
                  role="row"
                  aria-rowindex={1}
                  className="sticky top-0 z-[4] grid"
                  style={{ gridTemplateColumns: template, height: COL_HEAD }}
                >
                  <div
                    role="columnheader"
                    aria-colindex={1}
                    className="sticky left-0 z-[5] border-r border-b border-hairline bg-surface-1"
                  >
                    <span className="sr-only">Row</span>
                  </div>
                  {widths.map((_, c) => (
                    <div
                      key={c}
                      role="columnheader"
                      aria-colindex={c + 2}
                      className={cn(
                        "flex items-center justify-center border-r border-b border-hairline bg-surface-1 font-mono text-[10.5px] transition-colors",
                        c === aCol && ready ? "text-(--cn-ink)" : "text-ink-3",
                      )}
                    >
                      {letter(c)}
                    </div>
                  ))}
                </div>

                {status === "loading"
                  ? Array.from({ length: Math.min(nRows, 9) }, (_, r) => (
                      <div
                        key={`sk-${r}`}
                        aria-hidden
                        className="grid"
                        style={{ gridTemplateColumns: template, height: rowH }}
                      >
                        <div className="sticky left-0 border-r border-b border-hairline bg-surface-1" />
                        {widths.map((_, c) => (
                          <div
                            key={c}
                            className="flex items-center border-r border-b border-hairline bg-card px-2"
                          >
                            <span
                              className="h-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                              style={{
                                width: `${30 + ((r * 37 + c * 23) % 50)}%`,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ))
                  : cells.map((row, r) => (
                      <div
                        key={r}
                        role="row"
                        aria-rowindex={r + 2}
                        className="grid"
                        style={{ gridTemplateColumns: template, height: rowH }}
                      >
                        <div
                          role="rowheader"
                          aria-colindex={1}
                          className={cn(
                            "sticky left-0 z-[3] flex items-center justify-center border-r border-b border-hairline bg-surface-1 font-mono text-[10.5px] transition-colors",
                            r === aRow ? "text-(--cn-ink)" : "text-ink-3",
                          )}
                        >
                          {r + 1}
                        </div>
                        {widths.map((_, c) => {
                          const value = row[c] ?? null;
                          const ref = refOf(r, c);
                          const note = byCell.get(ref);
                          const isActive = r === aRow && c === aCol;
                          const numeric = typeof value === "number";
                          const shown = show(value, c);
                          const descId = note
                            ? `${uid}-d-${note.id}`
                            : undefined;
                          return (
                            <div
                              key={c}
                              role="gridcell"
                              aria-colindex={c + 2}
                              aria-selected={isActive}
                              aria-describedby={descId}
                              tabIndex={isActive ? 0 : -1}
                              data-cn-focus={`cell:${ref}`}
                              data-cn-cell={ref}
                              onFocus={(event) => {
                                if (
                                  event.target !== event.currentTarget ||
                                  isActive
                                )
                                  return;
                                if (active === undefined) setOwnActive(ref);
                                onActiveChange?.(ref);
                              }}
                              onClick={(event) => {
                                moveTo(r, c, false);
                                if (note) openCard(ref, event.currentTarget);
                                else if (openId || creating) closeCard(false);
                              }}
                              className={cn(
                                "relative flex items-center overflow-hidden border-r border-b border-hairline bg-card px-2 select-none",
                                dens.cell,
                                numeric
                                  ? "justify-end font-mono tabular-nums"
                                  : "justify-start",
                                numeric && "text-[12px]",
                                strong.has(r + 1)
                                  ? "font-semibold text-foreground"
                                  : "text-ink",
                                note &&
                                  !note.resolved &&
                                  "bg-[color-mix(in_oklab,var(--cn-accent)_5%,var(--card))]",
                                "cursor-cell",
                                FOCUS_IN,
                              )}
                            >
                              <span className="truncate" title={shown}>
                                {shown}
                              </span>
                              {note ? (
                                <>
                                  <Corner
                                    cornerStyle={cornerStyle}
                                    size={corner}
                                    resolved={!!note.resolved}
                                    motionSafe={motionSafe}
                                  />
                                  <span id={descId} hidden>
                                    {`${note.resolved ? "Resolved note" : "Note"} by ${note.author}: ${note.text}${note.replies.length ? ` ${plural(note.replies.length, "reply", "replies")}.` : ""}`}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
              </div>

              {ready ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-[2] rounded-[1px] border-2 border-(--cn-accent)"
                  initial={false}
                  animate={{
                    x: outlineX - 1,
                    y: outlineY - 1,
                    width: outlineW + 1,
                    height: rowH + 1,
                  }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}

              <AnimatePresence>
                {ready && placement && cardKey ? (
                  <NoteCard
                    key={cardKey}
                    x={placement.x}
                    y={placement.y}
                    width={cardW}
                    right={placement.right}
                    corner={corner}
                    withFlap={cornerStyle === "fold"}
                    motionSafe={motionSafe}
                    labelledBy={cardTitleId}
                    onKeyDown={onCardKeyDown}
                  >
                    {cardBody()}
                  </NoteCard>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        )}

        {!narrow && status !== "error" ? (
          <aside
            aria-label="Notes"
            className="hidden w-58 shrink-0 flex-col border-l border-hairline @min-[40rem]/cell-notes:flex @min-[70rem]/cell-notes:w-70"
          >
            <p className="shrink-0 px-3.5 pt-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Notes · {openCount} open
            </p>
            <motion.div
              layoutScroll
              className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
            >
              {notesList("aside")}
            </motion.div>
          </aside>
        ) : null}

        <AnimatePresence>
          {narrow && sheetOpen ? (
            <motion.div
              key="sheet"
              ref={sheetRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby={sheetTitleId}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSheetOpen(false);
                  ask("notes-button");
                }
              }}
              className="absolute inset-x-0 bottom-0 z-[8] flex max-h-[72%] flex-col"
              initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
              animate={motionSafe ? { y: 0 } : { opacity: 1 }}
              exit={
                motionSafe
                  ? { y: "100%", transition: exitFor() }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <motion.div
                className="flex flex-1 flex-col overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-10px_30px_color-mix(in_oklab,black_16%,transparent)]"
                style={{ y: sheetY }}
              >
                <div
                  {...sheetDrag}
                  className="shrink-0 cursor-grab touch-pan-x select-none active:cursor-grabbing"
                >
                  <div
                    aria-hidden
                    className="flex h-5 items-center justify-center"
                  >
                    <span className="h-1 w-9 rounded-full bg-hairline-strong" />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 pb-1">
                    <p id={sheetTitleId} className="text-[13px] font-semibold">
                      Notes · {openCount} open
                    </p>
                    <button
                      type="button"
                      data-cn-focus="sheet-close"
                      aria-label="Close notes"
                      onClick={() => {
                        setSheetOpen(false);
                        ask("notes-button");
                      }}
                      className={cn(
                        "inline-flex size-8 cursor-pointer items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </div>
                </div>
                <motion.div
                  layoutScroll
                  className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
                >
                  {notesList("sheet")}
                </motion.div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
