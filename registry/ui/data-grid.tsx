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
  ChevronRight,
  Inbox,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade as cascadeStep,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DataGridValue = string | number | null;

/** One record. `id` is its key; every other field is read by a column's `id`. */
export type DataGridRow = { id: string; [field: string]: DataGridValue };

export type DataGridKind = "text" | "number" | "money" | "date" | "status";

export type DataGridTone = "success" | "warn" | "danger" | "accent" | "neutral";

export type DataGridColumn = {
  /** The row field this column reads, and its key. */
  id: string;
  /** The heading. Also names the column's cells for assistive technology. */
  header: string;
  /** What the column holds: sets its alignment, sorting, formatting and editor. @default "text" */
  kind?: DataGridKind;
  /** Starting width in px. @default 120 */
  width?: number;
  /** Narrowest the grip will hold, px. @default 64 */
  minWidth?: number;
  /** Widest the grip will hold, px. @default 480 */
  maxWidth?: number;
  /** @default "end" for number and money, else "start" */
  align?: "start" | "end";
  /** A press on the heading sorts by it. @default true */
  sortable?: boolean;
  /** Enter, F2, a double-click or typing edits a cell. @default false */
  editable?: boolean;
  /** Set the column in the mono face (ids, codes). @default false */
  mono?: boolean;
  /** Dates also say how far they are from `now`: "in 3d", "5d ago". @default false */
  relative?: boolean;
  /** Status kind: the values in sort order, most urgent first. */
  options?: string[];
  /** Status kind: the tone each value is drawn in. */
  tones?: Record<string, DataGridTone>;
  /** Draws the cell. Overrides the kind's own formatting. */
  format?: (value: DataGridValue, row: DataGridRow) => React.ReactNode;
  /** The editor's error for this text, or null when it may be saved. */
  validate?: (text: string) => string | null;
  /** Turns the editor's text into the stored value. @default by kind */
  parse?: (text: string) => DataGridValue;
};

export type DataGridSort = { columnId: string; direction: "asc" | "desc" };
export type DataGridDensity = "compact" | "regular" | "roomy";
export type DataGridCascade = "rows" | "wave" | "none";
export type DataGridStatus = "ready" | "loading" | "error";

export type DataGridAction = {
  id: string;
  /** One or two words. */
  label: string;
  /** 14px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** A destructive action is drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
};

export type DataGridEdit = {
  rowId: string;
  columnId: string;
  value: DataGridValue;
  previous: DataGridValue;
};

export type DataGridProps = {
  /** Row height and type: 32, 40 or 48px rows. @default "regular" */
  density?: DataGridDensity;
  /** How a page of rows arrives after the skeleton or a page turn: rows rising in order, cells on a diagonal wave, or one fade. @default "rows" */
  cascade?: DataGridCascade;
  /** Paint alternate rows, so a wide row is easy to follow across. @default false */
  stripes?: boolean;
  /** The columns, in order. The first is the row header and stays pinned. @default defaultDataGridColumns */
  columns?: DataGridColumn[];
  /** Controlled rows. Edits are reported through `onRowsChange`. */
  rows?: DataGridRow[];
  /** Initial rows when uncontrolled. @default defaultDataGridRows (42 invoices) */
  defaultRows?: DataGridRow[];
  /** Fires with every row after an edit is committed or reverted. */
  onRowsChange?: (rows: DataGridRow[]) => void;
  /** Fires when an edit is committed. Return a promise to show the cell saving; a rejection puts the old value back. */
  onCellEdit?: (edit: DataGridEdit) => void | Promise<unknown>;
  /** Controlled sort, or null for the rows' own order. */
  sort?: DataGridSort | null;
  /** Initial sort when uncontrolled. @default null */
  defaultSort?: DataGridSort | null;
  /** Fires from the heading press or key that changed the sort. */
  onSortChange?: (sort: DataGridSort | null) => void;
  /** Controlled selection: row ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  /** Fires from the click, Shift-click or key that changed the selection. */
  onSelectedChange?: (ids: string[]) => void;
  /** Controlled page, from 0. */
  page?: number;
  /** Initial page when uncontrolled. @default 0 */
  defaultPage?: number;
  /** Fires from the button or key that turned the page. */
  onPageChange?: (page: number) => void;
  /** Rows per page. @default 8 */
  pageSize?: number;
  /** Tallest the body grows before it scrolls under its pinned header, px. @default 360 */
  maxHeight?: number;
  /** Buttons offered while rows are selected. @default [] */
  actions?: DataGridAction[];
  /** One of `actions` was pressed, with the selected row ids. */
  onAction?: (actionId: string, rowIds: string[]) => void;
  /** Fires when a column's width settles after a drag, a double-click or a key. */
  onColumnResize?: (columnId: string, width: number) => void;
  /** Today, for relative dates (Date or ms). @default defaultDataGridNow */
  now?: number | Date;
  /** What one row is called, in counts and announcements. @default { one: "row", other: "rows" } */
  itemLabel?: { one: string; other: string };
  /** The locale for numbers and money. @default "en-US" */
  locale?: string;
  /** The currency for money columns. @default "USD" */
  currency?: string;
  /** Whether the rows have arrived. @default "ready" */
  status?: DataGridStatus;
  /** "Try again" was pressed after the rows failed to load. */
  onRetry?: () => void;
  /** What an empty grid says. @default "Nothing here yet" */
  emptyLabel?: string;
  /** The heading over the grid. @default "Receivables" */
  title?: string;
  /** The grid's accessible name. @default the title */
  label?: string;
  /** Play the clicks and ticks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Today in the seeded ledger: 30 September 2026. */
export const defaultDataGridNow = Date.UTC(2026, 8, 30);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const STATUS_ORDER = ["Overdue", "Due", "Draft", "Paid"];

export const defaultDataGridColumns: DataGridColumn[] = [
  {
    id: "customer",
    header: "Customer",
    width: 184,
    minWidth: 120,
    maxWidth: 320,
  },
  { id: "invoice", header: "Invoice", width: 104, minWidth: 88, mono: true },
  {
    id: "status",
    header: "Status",
    kind: "status",
    width: 112,
    minWidth: 96,
    options: STATUS_ORDER,
    tones: {
      Overdue: "danger",
      Due: "accent",
      Draft: "neutral",
      Paid: "success",
    },
  },
  {
    id: "amount",
    header: "Amount",
    kind: "money",
    width: 124,
    minWidth: 96,
    editable: true,
  },
  {
    id: "due",
    header: "Due",
    kind: "date",
    width: 136,
    minWidth: 104,
    relative: true,
  },
  {
    id: "owner",
    header: "Owner",
    width: 112,
    minWidth: 80,
    editable: true,
    validate: (text) =>
      text.trim().length === 0
        ? "Give it an owner"
        : text.trim().length > 32
          ? "Keep it under 32 characters"
          : null,
  },
  { id: "region", header: "Region", width: 104, minWidth: 80 },
];

/**
 * Forty-two open and settled invoices for the customers of one small
 * merchant: a seeded mix of paid, due, overdue and draft, amounts skewed
 * toward the small end the way real receivables are.
 */
export const defaultDataGridRows: DataGridRow[] = (() => {
  const rand = mulberry32(1311);
  const stems = [
    "Coldbrook",
    "Fernworks",
    "Gaugeworks",
    "Basinworks",
    "Fieldline",
    "Waylight",
  ];
  const kinds = ["Labs", "Supply", "Freight", "Health", "Retail", "Studio"];
  const names: string[] = [];
  for (const s of stems) for (const k of kinds) names.push(`${s} ${k}`);
  names.push(
    "Coldbrook Foods",
    "Fernworks Foods",
    "Gaugeworks Foods",
    "Basinworks Foods",
    "Fieldline Foods",
    "Waylight Foods",
  );
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = names[i] ?? "";
    names[i] = names[j] ?? a;
    names[j] = a;
  }
  const owners = ["Ines", "Tomas", "Mara", "Joel", "Priya", "Kenji", "Sade"];
  const regions = ["North", "South", "East", "West", "Central"];
  return names.map((customer, i): DataGridRow => {
    const r = rand();
    const status =
      r < 0.38 ? "Paid" : r < 0.66 ? "Due" : r < 0.86 ? "Overdue" : "Draft";
    // A product of two uniforms leans small, like real invoice sizes.
    const amount = Math.round((180 + rand() * rand() * 17_800) * 100) / 100;
    const offset =
      status === "Paid"
        ? -(4 + Math.floor(rand() * 40))
        : status === "Overdue"
          ? -(1 + Math.floor(rand() * 24))
          : status === "Due"
            ? Math.floor(rand() * 28)
            : 12 + Math.floor(rand() * 30);
    return {
      id: `inv-${2041 + i}`,
      customer,
      invoice: `INV-${2041 + i}`,
      status,
      amount,
      due: isoOf(defaultDataGridNow + offset * DAY_MS),
      owner: owners[Math.floor(rand() * owners.length)] ?? "Ines",
      region: regions[Math.floor(rand() * regions.length)] ?? "North",
    };
  });
})();

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const SELECT = "__select";
/** The checkbox column, px. The row header is pinned right after it. */
const SELECT_W = 36;
const HEADER_H = 36;
const GRIP_STEP = 16;

const DENSITY: Record<
  DataGridDensity,
  { row: number; text: string; pad: string }
> = {
  compact: { row: 32, text: "text-[12px]", pad: "px-2.5" },
  regular: { row: 40, text: "text-[13px]", pad: "px-3" },
  roomy: { row: 48, text: "text-[13px]", pad: "px-3.5" },
};

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Status chips are small indicators, so they keep the text tokens; the dot
 * and the wash are pigment, taken at a fixed lightness so they read the same
 * in both themes.
 */
const TONE: Record<DataGridTone, { text: string; pigment: string }> = {
  success: {
    text: "text-success",
    pigment: "oklch(from var(--success) 0.72 0.14 h)",
  },
  warn: { text: "text-warn", pigment: "oklch(from var(--warn) 0.8 0.13 h)" },
  danger: {
    text: "text-danger",
    pigment: "oklch(from var(--danger) 0.66 0.19 h)",
  },
  accent: {
    text: "text-cobalt-bright",
    pigment: "oklch(from var(--accent-bright) 0.64 0.17 h)",
  },
  neutral: {
    text: "text-ink-2",
    pigment: "oklch(from var(--ink-3) 0.62 0.02 h)",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const kindOf = (c: DataGridColumn): DataGridKind => c.kind ?? "text";
const alignOf = (c: DataGridColumn) =>
  c.align ??
  (kindOf(c) === "money" || kindOf(c) === "number" ? "end" : "start");
const widthOf = (c: DataGridColumn) => c.width ?? 120;
const minOf = (c: DataGridColumn) => c.minWidth ?? 64;
const maxOf = (c: DataGridColumn) => Math.max(minOf(c), c.maxWidth ?? 480);

/**
 * On a narrow container the pinned column gives way, so the columns beside
 * it still have room to scroll: it never takes more than LEAD_CAP of the
 * grid's width, whatever its own.
 */
const LEAD_CAP = "48cqw";
const templateOf = (widths: number[]) =>
  `${SELECT_W}px ${widths
    .map((w, i) => (i === 0 ? `min(${r2(w)}px,${LEAD_CAP})` : `${r2(w)}px`))
    .join(" ")} minmax(0,1fr)`;
const edgeOf = (w: number) =>
  `calc(${SELECT_W}px + min(${r2(w)}px, ${LEAD_CAP}))`;

const dayLabel = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};

const relativeOf = (iso: string, now: number) => {
  const days = Math.round((msOf(iso) - now) / DAY_MS);
  if (days === 0) return "today";
  return days > 0 ? `in ${days}d` : `${-days}d ago`;
};

/** Page buttons: all of them up to seven, else the ends and the current page's neighbours. */
function pageList(count: number, at: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, count - 1, at - 1, at, at + 1]);
  if (at <= 2) for (const p of [1, 2, 3]) keep.add(p);
  if (at >= count - 3)
    for (const p of [count - 4, count - 3, count - 2]) keep.add(p);
  const list = [...keep]
    .filter((p) => p >= 0 && p < count)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  list.forEach((p, i) => {
    const prev = list[i - 1];
    if (prev !== undefined && p - prev > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const plural = (n: number, item: { one: string; other: string }) =>
  `${n} ${n === 1 ? item.one : item.other}`;

function compareValues(
  a: DataGridValue,
  b: DataGridValue,
  column: DataGridColumn,
): number {
  if (a === b) return 0;
  if (a === null || a === "") return 1;
  if (b === null || b === "") return -1;
  const kind = kindOf(column);
  if (kind === "status" && column.options) {
    const ia = column.options.indexOf(String(a));
    const ib = column.options.indexOf(String(b));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  // Plain ordering rather than a locale collation: the server and the
  // browser must agree on every row's seat.
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sortRows(
  rows: DataGridRow[],
  columns: DataGridColumn[],
  sort: DataGridSort | null,
): DataGridRow[] {
  const column = sort ? columns.find((c) => c.id === sort.columnId) : null;
  if (!sort || !column) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (x, y) =>
        sign *
          compareValues(
            x.row[column.id] ?? null,
            y.row[column.id] ?? null,
            column,
          ) || x.index - y.index,
    )
    .map((x) => x.row);
}

const sortWords = (column: DataGridColumn, direction: "asc" | "desc") => {
  const kind = kindOf(column);
  if (kind === "money" || kind === "number") {
    return direction === "asc" ? "low to high" : "high to low";
  }
  if (kind === "date") {
    return direction === "asc" ? "earliest first" : "latest first";
  }
  if (kind === "status") {
    return direction === "asc" ? "most urgent first" : "least urgent first";
  }
  return direction === "asc" ? "A to Z" : "Z to A";
};

const editText = (value: DataGridValue, column: DataGridColumn) => {
  if (value === null) return "";
  if (typeof value === "number" && kindOf(column) === "money") {
    return value.toFixed(2);
  }
  return String(value);
};

const numberFrom = (text: string) => {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
};

function validateFor(column: DataGridColumn, text: string): string | null {
  if (column.validate) return column.validate(text);
  const kind = kindOf(column);
  if (kind === "money" || kind === "number") {
    const n = numberFrom(text);
    if (!Number.isFinite(n)) {
      return kind === "money" ? "Enter an amount" : "Enter a number";
    }
    if (n < 0) return "Use zero or more";
  }
  if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
    return "Use YYYY-MM-DD";
  }
  return null;
}

function parseFor(column: DataGridColumn, text: string): DataGridValue {
  if (column.parse) return column.parse(text);
  const kind = kindOf(column);
  if (kind === "money") return Math.round(numberFrom(text) * 100) / 100;
  if (kind === "number") return numberFrom(text);
  return text.trim();
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/**
 * The sort glyph is two four-point strokes — a chevron with a tail each —
 * read from one value in [-1, 1]: 0 is the faint double chevron, 1 an arrow
 * up, -1 an arrow down. Moving between them on the snap spring means a flip
 * passes through the double chevron, and the head lands with one overshoot.
 */
const GLYPH = {
  none: [5, 6.5, 8, 3.5, 11, 6.5, 8, 3.5, 5, 9.5, 8, 12.5, 11, 9.5, 8, 12.5],
  asc: [4.5, 7, 8, 3.5, 11.5, 7, 8, 12.5, 8, 12.5, 8, 12.5, 8, 12.5, 8, 12.5],
  desc: [8, 3.5, 8, 3.5, 8, 3.5, 8, 3.5, 4.5, 9, 8, 12.5, 11.5, 9, 8, 3.5],
};

function glyphPath(s: number): string {
  const k = Math.min(1.15, Math.abs(s));
  const to = s >= 0 ? GLYPH.asc : GLYPH.desc;
  const p = GLYPH.none.map((v, i) => r2(v + ((to[i] ?? v) - v) * k));
  const pt = (i: number) => `${p[i * 2] ?? 0} ${p[i * 2 + 1] ?? 0}`;
  return `M ${pt(0)} L ${pt(1)} L ${pt(2)} M ${pt(1)} L ${pt(3)} M ${pt(4)} L ${pt(5)} L ${pt(6)} M ${pt(5)} L ${pt(7)}`;
}

function SortGlyph({
  direction,
  motionSafe,
}: {
  direction: "asc" | "desc" | null;
  motionSafe: boolean;
}) {
  const target = direction === "asc" ? 1 : direction === "desc" ? -1 : 0;
  const s = useMotionValue(target);
  React.useEffect(() => {
    const controls = animate(
      s,
      target,
      motionSafe
        ? springs.snap
        : { duration: durations.fast, ease: easings.move },
    );
    return () => controls.stop();
  }, [target, motionSafe, s]);
  const d = useTransform(s, glyphPath);
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn(
        "size-3.5 shrink-0 transition-colors",
        direction ? "text-cobalt-bright" : "text-ink-3/70",
      )}
    >
      <motion.path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Tick({
  state,
  label,
  motionSafe,
}: {
  state: boolean | "mixed";
  label: string;
  motionSafe: boolean;
}) {
  const on = state !== false;
  return (
    <span
      role="checkbox"
      aria-checked={state}
      aria-label={label}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-hairline-strong bg-card text-transparent",
      )}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-3">
        <motion.path
          d={state === "mixed" ? "M4 8 L12 8" : "M3.5 8.5 L6.5 11.5 L12.5 4.5"}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={
            motionSafe ? springs.flick : { duration: durations.blink }
          }
        />
      </svg>
    </span>
  );
}

function StatusChip({ value, tone }: { value: string; tone: DataGridTone }) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1.5 rounded-full px-2 text-[11px] leading-none font-medium transition-colors",
        t.text,
      )}
      style={{
        background: `color-mix(in oklab, ${t.pigment} 14%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: t.pigment }}
      />
      <span className="truncate">{value}</span>
    </span>
  );
}

/** The grip on a heading's right edge. Its own component: it owns a drag. */
function ResizeGrip({
  disabled,
  onStart,
  onMove,
  onEnd,
  onFit,
}: {
  disabled: boolean;
  onStart: () => void;
  onMove: (dx: number) => void;
  onEnd: (velocity: number) => void;
  onFit: () => void;
}) {
  const [held, setHeld] = React.useState(false);
  const drag = useDrag({
    axis: "x",
    threshold: 1,
    disabled,
    onStart: () => {
      setHeld(true);
      onStart();
    },
    onMove: ({ offset }) => onMove(offset.x),
    onEnd: ({ velocity }) => {
      setHeld(false);
      onEnd(velocity.x);
    },
    onCancel: () => {
      setHeld(false);
      onEnd(0);
    },
  });
  return (
    <span
      aria-hidden
      {...drag}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!disabled) onFit();
      }}
      className={cn(
        "group/data-grid-grip absolute inset-y-0 -right-2 z-[2] flex w-4 touch-pan-y justify-center select-none",
        disabled ? "cursor-default" : "cursor-col-resize",
      )}
    >
      <span
        className={cn(
          "my-2 w-px rounded-full transition-colors",
          held
            ? "bg-cobalt-bright"
            : "bg-hairline-strong group-hover/data-grid-grip:bg-cobalt-bright/70",
        )}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The grid                                 */
/* ----------------------------------------------------------------------- */

type Cell = { row: string; col: string };
type Editing = {
  rowId: string;
  colId: string;
  draft: string;
  error: string | null;
  /** Started by a key that typed its first character: the caret goes after it. */
  typed: boolean;
};
type Plan = {
  n: number;
  kind: "none" | "arrive" | "fresh";
  dir: "up" | "next" | "prev";
  fresh: string[];
  mode: DataGridCascade;
  safe: boolean;
};
type Landing = { n: number; cells: { key: string; tone: DataGridTone }[] };
type Latest = { data: DataGridRow[] };

const cellKey = (row: string, col: string) => `${row}\u0000${col}`;

/**
 * A data grid that keeps pace with the hand. Rows arrive after a skeleton in
 * a cascade the `cascade` prop chooses — rising row by row, on a diagonal
 * wave of cells, or in one fade — and a page turn replays it from the side
 * the visitor paged toward. A heading press sorts: its glyph morphs between
 * a double chevron and an arrow on the snap spring, and the rows already on
 * the page glide to their new seats on glide.
 *
 * Columns resize from a grip that follows the finger 1:1, rubber-bands past
 * the column's limits and springs back with the release velocity; the header
 * and the first two columns stay pinned while the body scrolls, with shadows
 * that come in as it does. Shift-click selects a range from the anchor row,
 * drawn as one band that stretches on snap. Editable cells open an editor
 * that lifts out of the cell; a committed value lands on flick, and a save
 * that fails puts the old value back.
 *
 * It is a real `role="grid"` with one roving cell: arrows move, Home and End
 * reach the row's ends, Page keys turn the page, Space selects, Shift with
 * an arrow extends the range, Enter sorts a heading or edits a cell, and
 * Shift with Left or Right resizes a heading's column. Under reduced motion
 * nothing travels: rows fade in, reorders and bands settle at once, and
 * every change of data still shows.
 */
export function DataGrid({
  density = "regular",
  cascade = "rows",
  stripes = false,
  columns = defaultDataGridColumns,
  rows,
  defaultRows,
  onRowsChange,
  onCellEdit,
  sort,
  defaultSort = null,
  onSortChange,
  selected,
  defaultSelected,
  onSelectedChange,
  page,
  defaultPage = 0,
  onPageChange,
  pageSize = 8,
  maxHeight = 360,
  actions = [],
  onAction,
  onColumnResize,
  now = defaultDataGridNow,
  itemLabel = { one: "row", other: "rows" },
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  emptyLabel = "Nothing here yet",
  title = "Receivables",
  label,
  sound = false,
  disabled = false,
  className,
}: DataGridProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ready = status === "ready";
  const geom = DENSITY[density] ?? DENSITY.regular;
  const rowH = geom.row;
  const size = Math.max(1, Math.round(pageSize));

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );
  const plain = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  /* ------------------------------- state -------------------------------- */

  const [ownRows, setOwnRows] = React.useState<DataGridRow[]>(
    () => defaultRows ?? defaultDataGridRows,
  );
  const data = rows ?? ownRows;
  const [ownSort, setOwnSort] = React.useState<DataGridSort | null>(
    defaultSort,
  );
  const sortNow = sort !== undefined ? sort : ownSort;
  const [ownSelected, setOwnSelected] = React.useState<string[]>(
    () => defaultSelected ?? [],
  );
  const chosen = selected ?? ownSelected;
  const chosenSet = React.useMemo(() => new Set(chosen), [chosen]);
  const [ownPage, setOwnPage] = React.useState(defaultPage);

  // The order is taken when the visitor sorts (or rows come and go), not on
  // every edit: a row whose value just changed stays under the hand that
  // changed it, and moves the next time a heading is pressed.
  const sortSig = sortNow ? `${sortNow.columnId}:${sortNow.direction}` : "";
  const idsSig = data.map((r) => r.id).join("|");
  const [order, setOrder] = React.useState(() => ({
    sortSig,
    idsSig,
    ids: sortRows(data, columns, sortNow).map((r) => r.id),
  }));
  const reorder = order.sortSig !== sortSig || order.idsSig !== idsSig;
  const orderIds = reorder
    ? sortRows(data, columns, sortNow).map((r) => r.id)
    : order.ids;
  if (reorder) setOrder({ sortSig, idsSig, ids: orderIds });
  const sorted = React.useMemo(() => {
    const byId = new Map(data.map((r) => [r.id, r]));
    return orderIds
      .map((id) => byId.get(id))
      .filter((r): r is DataGridRow => r !== undefined);
  }, [data, orderIds]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const pageIndex = clamp(Math.round(page ?? ownPage), 0, pageCount - 1);
  const first = pageIndex * size;
  const pageRows = ready ? sorted.slice(first, first + size) : [];
  const colIds = [SELECT, ...columns.map((c) => c.id)];
  const lead = columns[0];

  const [active, setActive] = React.useState<Cell>({
    row: "h",
    col: lead?.id ?? SELECT,
  });
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [failing, setFailing] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  /** What the last change was about: layout glides, selection snaps. */
  const [cause, setCause] = React.useState<"select" | "layout">("select");

  // Density is a prop: a change re-seats the bands on the layout spring.
  const [seenDensity, setSeenDensity] = React.useState(density);
  if (seenDensity !== density) {
    setSeenDensity(density);
    setCause("layout");
  }

  /* --------------------- arrivals, decided in render --------------------- */

  const idsKey = pageRows.map((r) => r.id).join("|");
  const [seen, setSeen] = React.useState(() => ({
    ready,
    page: pageIndex,
    size,
    ids: idsKey,
    data,
  }));
  const [plan, setPlan] = React.useState<Plan>(() => ({
    n: 0,
    kind: ready && idsKey ? "arrive" : "none",
    dir: "up",
    fresh: [],
    mode: cascade,
    safe: motionSafe,
  }));
  const [landing, setLanding] = React.useState<Landing>({ n: 0, cells: [] });
  if (
    seen.ready !== ready ||
    seen.page !== pageIndex ||
    seen.size !== size ||
    seen.ids !== idsKey ||
    seen.data !== data
  ) {
    if (
      ready &&
      (!seen.ready || seen.page !== pageIndex || seen.size !== size)
    ) {
      setPlan({
        n: plan.n + 1,
        kind: "arrive",
        dir: !seen.ready
          ? "up"
          : pageIndex > seen.page
            ? "next"
            : pageIndex < seen.page
              ? "prev"
              : "up",
        fresh: [],
        mode: cascade,
        safe: motionSafe,
      });
    } else if (ready && seen.ids !== idsKey) {
      const before = new Set(seen.ids.split("|"));
      const fresh = pageRows.filter((r) => !before.has(r.id)).map((r) => r.id);
      if (fresh.length > 0) {
        setPlan({
          n: plan.n + 1,
          kind: "fresh",
          dir: "up",
          fresh,
          mode: cascade,
          safe: motionSafe,
        });
      }
    }
    // Any value that changed under a row still on the page lands: an edit,
    // a revert, or the host's own update.
    if (ready && seen.ready && seen.data !== data) {
      const prev = new Map(seen.data.map((r) => [r.id, r]));
      const cells: Landing["cells"] = [];
      for (const row of pageRows) {
        const old = prev.get(row.id);
        if (!old) continue;
        for (const c of columns) {
          if ((old[c.id] ?? null) === (row[c.id] ?? null)) continue;
          const key = cellKey(row.id, c.id);
          cells.push({ key, tone: failing.has(key) ? "danger" : "success" });
        }
      }
      if (cells.length > 0) setLanding({ n: landing.n + 1, cells });
      if (failing.size > 0) setFailing(new Set());
    }
    setSeen({ ready, page: pageIndex, size, ids: idsKey, data });
  }

  /* ------------------------------- widths ------------------------------- */

  const template = useMotionValue(templateOf(columns.map(widthOf)));
  const edge = useMotionValue(edgeOf(lead ? widthOf(lead) : 0));
  const widths = React.useRef(new Map<string, number>());
  /** Where each width is heading: a key press steps from here, not mid-flight. */
  const goals = React.useRef(new Map<string, number>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const grip = React.useRef<{ id: string; from: number; mark: number } | null>(
    null,
  );

  const applyWidth = (id: string, w: number) => {
    widths.current.set(id, w);
    template.set(
      templateOf(columns.map((c) => widths.current.get(c.id) ?? widthOf(c))),
    );
    if (lead && id === lead.id) edge.set(edgeOf(w));
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const widthTo = (
    column: DataGridColumn,
    to: number,
    spring: typeof springs.snap | typeof springs.glide,
    velocity = 0,
  ) => {
    const from = widths.current.get(column.id) ?? widthOf(column);
    const target = r2(clamp(to, minOf(column), maxOf(column)));
    goals.current.set(column.id, target);
    if (!motionSafe || Math.abs(target - from) < 0.5) {
      anims.current.get(`w:${column.id}`)?.stop();
      applyWidth(column.id, target);
    } else {
      run(
        `w:${column.id}`,
        animate(from, target, {
          ...spring,
          velocity,
          onUpdate: (v) => applyWidth(column.id, r2(v)),
        }),
      );
    }
    onColumnResize?.(column.id, target);
    return target;
  };

  // New columns take their own widths; columns that stay keep what the
  // visitor gave them.
  const columnsKey = columns.map((c) => `${c.id}:${widthOf(c)}`).join("|");
  React.useEffect(() => {
    const keep = new Map<string, number>();
    for (const c of columns) {
      keep.set(c.id, widths.current.get(c.id) ?? widthOf(c));
    }
    widths.current = keep;
    template.set(templateOf(columns.map((c) => keep.get(c.id) ?? widthOf(c))));
    const head = columns[0];
    edge.set(edgeOf(head ? (keep.get(head.id) ?? widthOf(head)) : 0));
    // The key carries every id and width the effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey, template, edge]);

  /* --------------------------- scroll shadows --------------------------- */

  const scrollX = useMotionValue(0);
  const scrollY = useMotionValue(0);
  const maxX = useMotionValue(0);
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!scroller) return;
    const measure = () => {
      maxX.set(Math.max(0, scroller.scrollWidth - scroller.clientWidth));
      scrollX.set(scroller.scrollLeft);
      scrollY.set(scroller.scrollTop);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    const inner = scroller.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [scroller, maxX, scrollX, scrollY]);

  const headerShade = useTransform(scrollY, (v) => r2(clamp01(v / 12)));
  const pinShade = useTransform(scrollX, (v) => r2(clamp01(v / 12)));
  const rightFade = useTransform(
    [scrollX, maxX] as MotionValue<number>[],
    ([x = 0, m = 0]: number[]) => r2(clamp01((m - x) / 24)),
  );
  const bandShift = useTransform(scrollY, (v) => r2(-v));

  /* ------------------------------ arrivals ------------------------------ */

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const cellNodes = React.useRef(new Map<string, HTMLDivElement>());

  React.useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || plan.kind === "none") return;
    const running: AnimationPlaybackControls[] = [];
    const cells =
      plan.kind === "arrive"
        ? Array.from(body.querySelectorAll<HTMLElement>("[data-dg-cell]"))
        : plan.fresh.flatMap((id) =>
            Array.from(
              body.querySelectorAll<HTMLElement>(
                `[data-dg-row="${CSS.escape(id)}"] [data-dg-cell]`,
              ),
            ),
          );
    if (plan.kind === "fresh") {
      for (const cell of cells) {
        running.push(
          animate(
            cell,
            { opacity: [0, 1] },
            { duration: durations.base, ease: easings.enter },
          ),
        );
      }
    } else {
      const nRows = new Set(cells.map((c) => c.dataset.dgR)).size;
      const nCols = new Set(cells.map((c) => c.dataset.dgC)).size;
      const mode = plan.safe ? plan.mode : "none";
      const step =
        mode === "wave"
          ? cascadeStep(nRows + nCols - 1)
          : cascadeStep(Math.max(1, nRows));
      const along = plan.dir === "up" ? "y" : "x";
      const from =
        plan.dir === "next"
          ? distances.shift
          : plan.dir === "prev"
            ? -distances.shift
            : distances.step;
      for (const cell of cells) {
        const r = Number(cell.dataset.dgR ?? 0);
        const c = Number(cell.dataset.dgC ?? 0);
        const delay =
          mode === "rows" ? r * step : mode === "wave" ? (r + c) * step : 0;
        const opacity = {
          duration: plan.safe ? durations.base : durations.fast,
          ease: easings.enter,
          delay,
        };
        running.push(
          mode === "none"
            ? animate(cell, { opacity: [0, 1] }, opacity)
            : animate(
                cell,
                along === "x"
                  ? { opacity: [0, 1], x: [from, 0] }
                  : { opacity: [0, 1], y: [from, 0] },
                {
                  opacity,
                  x: { ...springs.glide, delay },
                  y: { ...springs.glide, delay },
                },
              ),
        );
      }
    }
    // A re-run (StrictMode) finishes this arrival rather than freezing the
    // page half-faded; the next run plays it again from the start.
    return () => {
      for (const c of running) c.complete();
    };
  }, [plan]);

  // A value that changed lands: the text drops in on flick over a wash that
  // fades, green for a save, red for a revert. Before paint, so the new value
  // is never seen standing still first.
  React.useLayoutEffect(() => {
    if (landing.cells.length === 0) return;
    const running: AnimationPlaybackControls[] = [];
    for (const { key, tone } of landing.cells) {
      const node = cellNodes.current.get(key);
      if (!node) continue;
      const wash = node.querySelector<HTMLElement>("[data-dg-wash]");
      const text = node.querySelector<HTMLElement>("[data-dg-text]");
      if (wash) {
        wash.style.background = TONE[tone].pigment;
        running.push(
          animate(
            wash,
            { opacity: [0.2, 0] },
            { duration: 0.6, ease: easings.enter },
          ),
        );
      }
      if (text && motionSafe) {
        running.push(
          animate(
            text,
            { y: [-distances.nudge, 0], opacity: [0.35, 1] },
            {
              y: springs.flick,
              opacity: { duration: durations.fast, ease: easings.enter },
            },
          ),
        );
      }
    }
    return () => {
      for (const c of running) c.complete();
    };
    // One landing per change; the motion preference is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing]);

  // Focus follows the keyboard onto cells that may only just have arrived.
  React.useEffect(() => {
    if (!focusAsk) return;
    cellNodes.current.get(focusAsk.key)?.focus({ preventScroll: false });
  }, [focusAsk]);

  const timers = React.useRef(new Set<number>());
  const latest = React.useRef<Latest>({ data });
  React.useEffect(() => {
    latest.current = { data };
  });
  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  /* ------------------------------ actions ------------------------------- */

  const rowById = (id: string) => data.find((r) => r.id === id);
  const columnById = (id: string) => columns.find((c) => c.id === id);
  const nameOf = (row: DataGridRow | undefined) =>
    row && lead ? String(row[lead.id] ?? row.id) : (row?.id ?? "");
  const moneyColumn = columns.find((c) => kindOf(c) === "money");
  const sumOf = (list: DataGridRow[]) =>
    moneyColumn
      ? list.reduce((t, r) => {
          const v = r[moneyColumn.id];
          return t + (typeof v === "number" ? v : 0);
        }, 0)
      : 0;

  const focusCell = (row: string, col: string) => {
    setActive({ row, col });
    setFocusAsk((f) => ({ key: cellKey(row, col), n: (f?.n ?? 0) + 1 }));
  };

  const commitSelection = (ids: string[]) => {
    if (selected === undefined) setOwnSelected(ids);
    onSelectedChange?.(ids);
    setCause("select");
    say(
      ids.length === 0
        ? "Selection cleared."
        : `${plural(ids.length, itemLabel)} selected.`,
    );
  };

  const toggleRow = (id: string) => {
    if (disabled) return;
    const on = !chosenSet.has(id);
    const next = on ? [...chosen, id] : chosen.filter((x) => x !== id);
    setAnchor(id);
    audio.play("click", { pitch: on ? 1.2 : 0.95, gain: 0.45 });
    commitSelection(next);
  };

  /** Selects every row from the anchor (or `origin`, with no anchor yet) to `id`. */
  const extendTo = (id: string, origin?: string) => {
    if (disabled) return;
    const from = anchor ?? origin ?? id;
    const a = sorted.findIndex((r) => r.id === from);
    const b = sorted.findIndex((r) => r.id === id);
    if (a === -1 || b === -1) {
      toggleRow(id);
      return;
    }
    const span = sorted.slice(Math.min(a, b), Math.max(a, b) + 1);
    const added = span.filter((r) => !chosenSet.has(r.id));
    if (anchor === null) setAnchor(from);
    if (added.length === 0) return;
    commitSelection([...chosen, ...added.map((r) => r.id)]);
    // One tick per row joining, spaced across the band's stretch.
    const count = Math.min(added.length, 8);
    for (let i = 0; i < count; i += 1) {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        audio.play("tick", { pitch: r2(1 + i * 0.06), gain: 0.35 });
      }, i * 28);
      timers.current.add(t);
    }
  };

  const togglePage = () => {
    if (disabled || pageRows.length === 0) return;
    const all = pageRows.every((r) => chosenSet.has(r.id));
    const ids = all
      ? chosen.filter((id) => !pageRows.some((r) => r.id === id))
      : [
          ...chosen,
          ...pageRows.filter((r) => !chosenSet.has(r.id)).map((r) => r.id),
        ];
    audio.play("click", { pitch: all ? 0.95 : 1.2, gain: 0.45 });
    commitSelection(ids);
  };

  const cycleSort = (column: DataGridColumn) => {
    if (disabled || column.sortable === false) return;
    const next: DataGridSort | null =
      !sortNow || sortNow.columnId !== column.id
        ? { columnId: column.id, direction: "asc" }
        : sortNow.direction === "asc"
          ? { columnId: column.id, direction: "desc" }
          : null;
    if (sort === undefined) setOwnSort(next);
    onSortChange?.(next);
    setCause("layout");
    audio.play("click", {
      pitch: next ? (next.direction === "asc" ? 1.12 : 0.9) : 1,
      gain: 0.5,
    });
    say(
      next
        ? `Sorted by ${column.header}, ${sortWords(column, next.direction)}.`
        : "Back to the original order.",
    );
  };

  const goPage = (to: number, keepCol?: string, rowSlot?: number) => {
    const target = clamp(to, 0, pageCount - 1);
    if (target === pageIndex || disabled) return false;
    if (page === undefined) setOwnPage(target);
    onPageChange?.(target);
    setCause("layout");
    const start = target * size;
    const end = Math.min(sorted.length, start + size);
    say(
      `Page ${target + 1} of ${pageCount}, ${itemLabel.other} ${start + 1} to ${end}.`,
    );
    if (keepCol !== undefined && rowSlot !== undefined) {
      const row = sorted[Math.min(end - 1, start + rowSlot)];
      if (row) focusCell(row.id, keepCol);
    }
    return true;
  };

  const startEdit = (rowId: string, colId: string, typed?: string) => {
    const column = columnById(colId);
    const row = rowById(rowId);
    if (disabled || !column?.editable || !row) return;
    setEditing({
      rowId,
      colId,
      draft: typed ?? editText(row[colId] ?? null, column),
      error: null,
      typed: typed !== undefined,
    });
  };

  const closing = React.useRef(false);

  const writeRows = (next: DataGridRow[]) => {
    if (rows === undefined) setOwnRows(next);
    onRowsChange?.(next);
  };

  /** Saves the editor. Returns false when the text does not validate. */
  const commitEdit = (refocus: boolean): boolean => {
    const e = editing;
    if (!e) return true;
    const column = columnById(e.colId);
    const row = rowById(e.rowId);
    if (!column || !row) {
      setEditing(null);
      return true;
    }
    const error = validateFor(column, e.draft);
    if (error) {
      setEditing({ ...e, error });
      audio.play("click", { pitch: 0.7, gain: 0.3 });
      return false;
    }
    closing.current = true;
    setEditing(null);
    if (refocus) focusCell(e.rowId, e.colId);
    const value = parseFor(column, e.draft);
    const previous = row[e.colId] ?? null;
    if (value === previous) return true;
    writeRows(
      data.map((r) => (r.id === e.rowId ? { ...r, [e.colId]: value } : r)),
    );
    audio.play("click", { pitch: 1.05, gain: 0.5 });
    const key = cellKey(e.rowId, e.colId);
    const result = onCellEdit?.({
      rowId: e.rowId,
      columnId: e.colId,
      value,
      previous,
    });
    const shown =
      kindOf(column) === "money" && typeof value === "number"
        ? money.format(value)
        : String(value ?? "");
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving((s) => new Set(s).add(key));
      say(`Saving ${column.header} for ${nameOf(row)}.`);
      (result as Promise<unknown>).then(
        () => {
          setSaving((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
          say(`Saved ${column.header} for ${nameOf(row)}: ${shown}.`);
        },
        () => {
          setSaving((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
          // The host refused: the value goes back, if nothing has replaced
          // it since.
          const now = latest.current.data;
          const back = now.map((r) =>
            r.id === e.rowId && (r[e.colId] ?? null) === value
              ? { ...r, [e.colId]: previous }
              : r,
          );
          setFailing((f) => new Set(f).add(key));
          writeRows(back);
          say(
            `Could not save ${column.header} for ${nameOf(row)}. Put back the old value.`,
          );
        },
      );
    } else {
      say(`Saved ${column.header} for ${nameOf(row)}: ${shown}.`);
    }
    return true;
  };

  const cancelEdit = () => {
    const e = editing;
    if (!e) return;
    closing.current = true;
    setEditing(null);
    focusCell(e.rowId, e.colId);
    audio.play("click", { pitch: 0.8, gain: 0.25 });
  };

  const bindEditor = React.useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    closing.current = false;
    node.focus({ preventScroll: true });
    if (node.dataset.typed === "1") {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    } else {
      node.select();
    }
  }, []);

  /** Widens or narrows a column to its widest content, heading included. */
  const fitColumn = (column: DataGridColumn) => {
    if (disabled) return;
    const head = cellNodes.current.get(cellKey("h", column.id));
    let need = 0;
    const text = head?.querySelector<HTMLElement>("[data-dg-fit]");
    if (text) need = text.scrollWidth + (column.sortable !== false ? 20 : 0);
    bodyRef.current
      ?.querySelectorAll<HTMLElement>(
        `[data-dg-col="${CSS.escape(column.id)}"] [data-dg-fit]`,
      )
      .forEach((n) => {
        need = Math.max(need, n.scrollWidth);
      });
    const pad = density === "compact" ? 20 : density === "roomy" ? 28 : 24;
    const w = widthTo(column, need + pad + 2, springs.glide);
    audio.play("tick", { pitch: 1.2, gain: 0.4 });
    say(`${column.header} column fitted, ${Math.round(w)} pixels.`);
  };

  /* ------------------------------ keyboard ------------------------------ */

  const rowKeys = ["h", ...pageRows.map((r) => r.id)];
  const activeRow = rowKeys.includes(active.row)
    ? active.row
    : (pageRows[0]?.id ?? "h");
  const activeCol = colIds.includes(active.col)
    ? active.col
    : (lead?.id ?? SELECT);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || !ready) return;
    const r = rowKeys.indexOf(activeRow);
    const c = colIds.indexOf(activeCol);
    if (r === -1 || c === -1) return;
    const lastRow = rowKeys.length - 1;
    const lastCol = colIds.length - 1;
    const column = columnById(activeCol);
    const inHeader = activeRow === "h";
    const mod = event.ctrlKey || event.metaKey;
    const go = (rr: number, cc: number) => {
      const row = rowKeys[clamp(rr, 0, lastRow)];
      const col = colIds[clamp(cc, 0, lastCol)];
      if (row !== undefined && col !== undefined) focusCell(row, col);
    };

    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const d = event.key === "ArrowRight" ? 1 : -1;
        if (inHeader && event.shiftKey && column) {
          const w = widthTo(
            column,
            (goals.current.get(column.id) ??
              widths.current.get(column.id) ??
              widthOf(column)) +
              d * GRIP_STEP,
            springs.glide,
          );
          audio.play("tick", { pitch: d > 0 ? 1.1 : 0.9, gain: 0.4 });
          say(`${column.header} column, ${Math.round(w)} pixels.`);
          return;
        }
        go(r, c + d);
        return;
      }
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const d = event.key === "ArrowDown" ? 1 : -1;
        const to = clamp(r + d, 0, lastRow);
        if (event.shiftKey && to > 0 && r > 0) {
          const id = rowKeys[to];
          if (id) extendTo(id, activeRow);
        }
        go(to, c);
        return;
      }
      case "Home":
        event.preventDefault();
        if (mod) go(Math.min(1, lastRow), 0);
        else go(r, 0);
        return;
      case "End":
        event.preventDefault();
        if (mod) go(lastRow, lastCol);
        else go(r, lastCol);
        return;
      case "PageDown":
      case "PageUp": {
        event.preventDefault();
        const d = event.key === "PageDown" ? 1 : -1;
        if (goPage(pageIndex + d, activeCol, Math.max(0, r - 1))) {
          audio.play("tick", { pitch: d > 0 ? 1.1 : 0.92, gain: 0.4 });
        }
        return;
      }
      case "Enter":
      case "F2":
      case " ": {
        event.preventDefault();
        if (event.key === "F2" && (inHeader || activeCol === SELECT)) return;
        if (inHeader) {
          if (activeCol === SELECT) togglePage();
          else if (column && event.shiftKey && event.key === "Enter") {
            fitColumn(column);
          } else if (column) cycleSort(column);
          return;
        }
        if (event.key === " ") {
          if (event.shiftKey) extendTo(activeRow);
          else toggleRow(activeRow);
          return;
        }
        if (activeCol === SELECT) toggleRow(activeRow);
        else startEdit(activeRow, activeCol);
        return;
      }
      case "Escape":
        if (chosen.length > 0) {
          event.preventDefault();
          commitSelection([]);
        }
        return;
      default:
        break;
    }
    if (mod && (event.key === "a" || event.key === "A")) {
      event.preventDefault();
      if (disabled) return;
      const ids = [
        ...chosen,
        ...pageRows.filter((x) => !chosenSet.has(x.id)).map((x) => x.id),
      ];
      if (ids.length !== chosen.length) commitSelection(ids);
      return;
    }
    if (
      !inHeader &&
      event.key.length === 1 &&
      !mod &&
      !event.altKey &&
      column?.editable
    ) {
      event.preventDefault();
      startEdit(activeRow, activeCol, event.key);
    }
  };

  /* ------------------------------- render ------------------------------- */

  const runs: { start: number; end: number; from: number }[] = [];
  pageRows.forEach((row, i) => {
    if (!chosenSet.has(row.id)) return;
    const last = runs[runs.length - 1];
    if (last && last.end === i - 1) last.end = i;
    else runs.push({ start: i, end: i, from: i });
  });
  const anchorAt = anchor ? pageRows.findIndex((r) => r.id === anchor) : -1;
  for (const run of runs) {
    if (anchorAt >= run.start && anchorAt <= run.end) run.from = anchorAt;
  }
  const bandSpring = !motionSafe
    ? { duration: 0 }
    : cause === "layout"
      ? springs.glide
      : springs.snap;

  const pageAll =
    pageRows.length > 0 && pageRows.every((r) => chosenSet.has(r.id));
  const pageSome = pageRows.some((r) => chosenSet.has(r.id));
  const chosenRows = data.filter((r) => chosenSet.has(r.id));
  const shownFrom = sorted.length === 0 ? 0 : first + 1;
  const shownTo = Math.min(sorted.length, first + size);

  const renderValue = (column: DataGridColumn, row: DataGridRow) => {
    const value = row[column.id] ?? null;
    if (column.format) return column.format(value, row);
    const kind = kindOf(column);
    if (value === null || value === "") {
      return <span className="text-ink-3">—</span>;
    }
    if (kind === "money" && typeof value === "number") {
      return money.format(value);
    }
    if (kind === "number" && typeof value === "number") {
      return plain.format(value);
    }
    if (kind === "date") {
      const iso = String(value);
      return (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="tabular-nums">{dayLabel(iso)}</span>
          {column.relative ? (
            <span className="truncate text-[11px] text-ink-3">
              {relativeOf(iso, nowMs)}
            </span>
          ) : null}
        </span>
      );
    }
    if (kind === "status") {
      return (
        <StatusChip
          value={String(value)}
          tone={column.tones?.[String(value)] ?? "neutral"}
        />
      );
    }
    return String(value);
  };

  const headerRow = (
    <div
      role="row"
      aria-rowindex={1}
      className="sticky top-0 z-[3] grid w-full [grid-template-columns:var(--dg-cols)] border-b border-hairline bg-surface-1"
      style={{ height: HEADER_H }}
    >
      <div
        ref={(node) => {
          if (node) cellNodes.current.set(cellKey("h", SELECT), node);
          else cellNodes.current.delete(cellKey("h", SELECT));
        }}
        role="columnheader"
        aria-colindex={1}
        tabIndex={activeRow === "h" && activeCol === SELECT ? 0 : -1}
        onFocus={() => setActive({ row: "h", col: SELECT })}
        onClick={togglePage}
        className={cn(
          "sticky left-0 z-[2] flex items-center justify-center bg-surface-1",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_IN,
        )}
      >
        <Tick
          state={pageAll ? true : pageSome ? "mixed" : false}
          label="Select every row on this page"
          motionSafe={motionSafe}
        />
      </div>
      {columns.map((column, i) => {
        const sorting =
          sortNow?.columnId === column.id ? sortNow.direction : null;
        const end = alignOf(column) === "end";
        const sortable = column.sortable !== false;
        return (
          <div
            key={column.id}
            ref={(node) => {
              if (node) cellNodes.current.set(cellKey("h", column.id), node);
              else cellNodes.current.delete(cellKey("h", column.id));
            }}
            role="columnheader"
            aria-colindex={i + 2}
            aria-sort={
              sorting === "asc"
                ? "ascending"
                : sorting === "desc"
                  ? "descending"
                  : sortable
                    ? "none"
                    : undefined
            }
            aria-describedby={hintId}
            tabIndex={activeRow === "h" && activeCol === column.id ? 0 : -1}
            onFocus={() => setActive({ row: "h", col: column.id })}
            onClick={() => cycleSort(column)}
            className={cn(
              "relative flex min-w-0 items-center gap-1.5 bg-surface-1 text-[11px] font-medium tracking-[0.02em] text-ink-2 select-none",
              geom.pad,
              end && "flex-row-reverse",
              i === 0 && "sticky left-[36px] z-[2]",
              sortable && !disabled
                ? "cursor-pointer hover:text-foreground"
                : "cursor-default",
              sorting && "text-foreground",
              FOCUS_IN,
            )}
          >
            <span className="min-w-0 truncate" data-dg-fit="">
              {column.header}
            </span>
            {sortable ? (
              <SortGlyph direction={sorting} motionSafe={motionSafe} />
            ) : null}
            <ResizeGrip
              disabled={disabled}
              onStart={() => {
                anims.current.get(`w:${column.id}`)?.stop();
                goals.current.delete(column.id);
                const from = widths.current.get(column.id) ?? widthOf(column);
                grip.current = {
                  id: column.id,
                  from,
                  mark: Math.floor(from / GRIP_STEP),
                };
              }}
              onMove={(dx) => {
                const g = grip.current;
                if (!g || g.id !== column.id) return;
                const w = rubberClamp(
                  g.from + dx,
                  minOf(column),
                  maxOf(column),
                  96,
                );
                applyWidth(column.id, r2(w));
                const mark = Math.floor(w / GRIP_STEP);
                if (mark !== g.mark) {
                  audio.play("tick", {
                    pitch: r2(0.8 + w / 600),
                    gain: 0.3,
                  });
                  g.mark = mark;
                }
              }}
              onEnd={(velocity) => {
                const g = grip.current;
                grip.current = null;
                if (!g) return;
                const now = widths.current.get(column.id) ?? g.from;
                const w = widthTo(column, now, springs.snap, velocity);
                say(`${column.header} column, ${Math.round(w)} pixels.`);
              }}
              onFit={() => fitColumn(column)}
            />
          </div>
        );
      })}
      <div aria-hidden className="bg-surface-1" />
    </div>
  );

  const bodyRows = pageRows.map((row, ri) => {
    const isChosen = chosenSet.has(row.id);
    const stripe = stripes && ri % 2 === 1;
    return (
      <motion.div
        key={row.id}
        role="row"
        aria-rowindex={first + ri + 2}
        aria-selected={isChosen}
        data-dg-row={row.id}
        layout={motionSafe ? "position" : false}
        initial={false}
        animate={{ height: rowH }}
        transition={{
          layout: springs.glide,
          height: motionSafe ? springs.glide : { duration: 0 },
        }}
        className={cn(
          "relative grid w-full [grid-template-columns:var(--dg-cols)] border-b border-hairline",
          stripe
            ? "[--dg-row:color-mix(in_oklab,var(--card)_96%,var(--foreground))]"
            : "[--dg-row:var(--card)]",
          !disabled &&
            "hover:[--dg-row:color-mix(in_oklab,var(--card)_93%,var(--foreground))]",
          geom.text,
        )}
      >
        {colIds.map((colId, ci) => {
          const column = ci === 0 ? undefined : columns[ci - 1];
          const key = cellKey(row.id, colId);
          const isActive = activeRow === row.id && activeCol === colId;
          const isEditing =
            editing?.rowId === row.id && editing.colId === colId;
          const isSaving = saving.has(key);
          const end = column ? alignOf(column) === "end" : false;
          return (
            <div
              key={colId}
              ref={(node) => {
                if (node) cellNodes.current.set(key, node);
                else cellNodes.current.delete(key);
              }}
              role={ci === 1 ? "rowheader" : "gridcell"}
              aria-colindex={ci + 1}
              aria-readonly={column && !column.editable ? true : undefined}
              tabIndex={isActive ? 0 : -1}
              data-dg-cell=""
              data-dg-r={ri}
              data-dg-c={ci}
              data-dg-col={colId}
              onFocus={(event) => {
                if (event.target !== event.currentTarget) return;
                if (!isActive) setActive({ row: row.id, col: colId });
              }}
              onMouseDown={(event) => {
                // Shift-click selects rows, not text.
                if (event.shiftKey) event.preventDefault();
              }}
              onClick={(event) => {
                if (isEditing || disabled) return;
                if (event.shiftKey) {
                  extendTo(row.id);
                  focusCell(row.id, colId);
                } else if (ci === 0 || event.metaKey || event.ctrlKey) {
                  toggleRow(row.id);
                } else setAnchor(row.id);
              }}
              onDoubleClick={() => {
                if (column?.editable) startEdit(row.id, colId);
              }}
              className={cn(
                "relative flex h-full min-w-0 items-center bg-(--dg-row) transition-colors duration-150",
                ci === 0 ? "justify-center" : geom.pad,
                ci === 0 && "sticky left-0 z-[1]",
                ci === 1 && "sticky left-[36px] z-[1] font-medium",
                end && "justify-end tabular-nums",
                column?.mono && "font-mono text-[12px] text-ink-2",
                column && kindOf(column) === "money" && "font-mono text-[12px]",
                column?.editable && !disabled
                  ? "cursor-text"
                  : "cursor-default",
                FOCUS_IN,
              )}
            >
              <span
                aria-hidden
                data-dg-wash=""
                className="pointer-events-none absolute inset-0 opacity-0"
              />
              {ci === 0 ? (
                <Tick
                  state={isChosen}
                  label={`Select ${nameOf(row)}`}
                  motionSafe={motionSafe}
                />
              ) : column ? (
                <span
                  data-dg-text=""
                  className={cn(
                    "relative block min-w-0 truncate transition-opacity",
                    isSaving && "opacity-60",
                  )}
                >
                  <span
                    data-dg-fit=""
                    className="inline-block max-w-full truncate align-middle"
                  >
                    {renderValue(column, row)}
                  </span>
                </span>
              ) : null}
              {isSaving ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 bottom-1 h-0.5 overflow-clip rounded-full bg-cobalt-bright/15"
                >
                  {motionSafe ? (
                    <motion.span
                      className="absolute inset-y-0 w-1/2 rounded-full bg-cobalt-bright"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{
                        duration: 0.9,
                        ease: "linear",
                        repeat: Infinity,
                      }}
                    />
                  ) : (
                    <span className="absolute inset-0 bg-cobalt-bright/50" />
                  )}
                </span>
              ) : null}
              {isEditing && column && editing ? (
                <motion.div
                  className="absolute inset-0 z-[4]"
                  initial={
                    motionSafe ? { scale: 0.97, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <input
                    ref={bindEditor}
                    data-typed={editing.typed ? "1" : "0"}
                    value={editing.draft}
                    aria-label={`${column.header}, ${nameOf(row)}`}
                    aria-invalid={editing.error ? true : undefined}
                    aria-describedby={editing.error ? errorId : undefined}
                    inputMode={
                      kindOf(column) === "money" || kindOf(column) === "number"
                        ? "decimal"
                        : undefined
                    }
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        draft: event.currentTarget.value,
                        error: null,
                      })
                    }
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEdit(true);
                      } else if (event.key === "Escape") {
                        // Ours: the editor closes, and nothing behind it.
                        event.preventDefault();
                        cancelEdit();
                      } else if (event.key === "Tab") {
                        event.preventDefault();
                        const d = event.shiftKey ? -1 : 1;
                        if (!commitEdit(false)) return;
                        const order = columns.filter((x) => x.editable);
                        const at = order.findIndex((x) => x.id === colId);
                        const nextCol = order[at + d];
                        if (nextCol) {
                          // The next editor takes focus as it mounts; a
                          // focus request for its cell would steal it back.
                          setActive({ row: row.id, col: nextCol.id });
                          startEdit(row.id, nextCol.id);
                        } else {
                          focusCell(row.id, colId);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (closing.current) return;
                      if (!commitEdit(false)) {
                        closing.current = true;
                        setEditing(null);
                      }
                    }}
                    className={cn(
                      "h-full w-full rounded-2 border bg-popover text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_18%,transparent)]",
                      geom.pad,
                      end && "text-right",
                      (kindOf(column) === "money" || column.mono) &&
                        "font-mono text-[12px]",
                      editing.error
                        ? "border-danger focus-visible:outline-danger/30"
                        : "border-cobalt-bright",
                      "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring/40 focus-visible:outline-solid",
                    )}
                  />
                  {editing.error ? (
                    <p
                      id={errorId}
                      className="absolute top-full left-0 z-[5] mt-1 rounded-2 border border-hairline-strong bg-popover px-2 py-1 text-[11px] whitespace-nowrap text-danger shadow-sm"
                    >
                      {editing.error}
                    </p>
                  ) : null}
                </motion.div>
              ) : null}
            </div>
          );
        })}
        <div aria-hidden className="bg-(--dg-row) transition-colors" />
      </motion.div>
    );
  });

  const skeleton = Array.from({ length: size }, (_, ri) => (
    <div
      key={`sk-${ri}`}
      aria-hidden
      className="grid w-full [grid-template-columns:var(--dg-cols)] border-b border-hairline"
      style={{ height: rowH }}
    >
      {colIds.map((colId, ci) => (
        <div
          key={colId}
          className={cn(
            "flex items-center bg-card",
            ci === 0 ? "sticky left-0 z-[1] justify-center" : geom.pad,
            ci === 1 && "sticky left-[36px] z-[1]",
          )}
        >
          {ci === 0 ? (
            <span className="size-4 rounded-1 bg-surface-2" />
          ) : (
            <span
              className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ width: `${34 + ((ri * 37 + ci * 23) % 52)}%` }}
            />
          )}
        </div>
      ))}
      <div className="bg-card" />
    </div>
  ));

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The {itemLabel.other} did not load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="relative isolate">
        <motion.div
          ref={setScroller}
          layoutScroll
          onScroll={(event) => {
            const el = event.currentTarget;
            scrollX.set(el.scrollLeft);
            scrollY.set(el.scrollTop);
            maxX.set(Math.max(0, el.scrollWidth - el.clientWidth));
          }}
          className="[scrollbar-width:thin] overflow-auto overscroll-contain"
          style={{ maxHeight }}
        >
          <motion.div
            role="grid"
            aria-labelledby={label ? undefined : titleId}
            aria-label={label}
            aria-describedby={hintId}
            aria-rowcount={ready ? sorted.length + 1 : -1}
            aria-colcount={colIds.length}
            aria-multiselectable
            aria-busy={status === "loading" || undefined}
            aria-disabled={disabled || undefined}
            onKeyDown={onGridKeyDown}
            className="relative w-max min-w-full"
            style={{ ["--dg-cols" as string]: template }}
          >
            {headerRow}
            <div ref={bodyRef} role="rowgroup" className="relative">
              {status === "loading" ? skeleton : null}
              {ready && pageRows.length === 0 ? (
                <div role="row" aria-rowindex={2}>
                  <div
                    role="gridcell"
                    aria-colspan={colIds.length}
                    className="sticky left-0 flex w-[100cqw] max-w-full flex-col items-center gap-2 px-6 py-12 text-center"
                  >
                    <Inbox aria-hidden className="size-5 text-ink-3" />
                    <p className="text-sm text-ink-2">{emptyLabel}</p>
                  </div>
                </div>
              ) : null}
              {ready ? bodyRows : null}
            </div>
          </motion.div>
        </motion.div>

        {/* What sits over the scroller without scrolling: selection bands,
            the pinned edges' shadows and the right-hand fade. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5] overflow-clip"
        >
          <div
            className="absolute inset-x-0 bottom-0 overflow-clip"
            style={{ top: HEADER_H }}
          >
            <motion.div className="absolute inset-0" style={{ y: bandShift }}>
              <AnimatePresence initial={false}>
                {runs.map((run, i) => (
                  <motion.div
                    key={`band-${i}`}
                    className="absolute inset-x-1 rounded-2 bg-[color-mix(in_oklab,var(--accent-bright)_9%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] ring-inset"
                    initial={{
                      top: run.from * rowH + 2,
                      height: rowH - 4,
                      opacity: 0,
                    }}
                    animate={{
                      top: run.start * rowH + 2,
                      height: (run.end - run.start + 1) * rowH - 4,
                      opacity: 1,
                    }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      top: bandSpring,
                      height: bandSpring,
                      opacity: { duration: durations.fast },
                    }}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
          <motion.div
            className="absolute inset-x-0 h-3 bg-linear-to-b from-[color-mix(in_oklab,black_12%,transparent)] to-transparent"
            style={{ top: HEADER_H, opacity: headerShade }}
          />
          <motion.div
            className="absolute inset-y-0 w-3 bg-linear-to-r from-[color-mix(in_oklab,black_12%,transparent)] to-transparent"
            style={{ left: edge, opacity: pinShade }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-10 bg-linear-to-l from-card to-transparent"
            style={{ opacity: rightFade }}
          />
        </div>
      </div>
    );
  };

  const pagerButton = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-40",
    FOCUS_RING,
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <div className="relative h-4 overflow-clip text-[11px] text-ink-3">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                key={chosen.length > 0 ? "chosen" : "all"}
                className="truncate tabular-nums"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {status === "loading"
                  ? `Loading ${itemLabel.other}`
                  : chosen.length > 0
                    ? `${plural(chosen.length, itemLabel)} selected${moneyColumn ? ` · ${money.format(sumOf(chosenRows))}` : ""}`
                    : `${plural(data.length, itemLabel)}${moneyColumn ? ` · ${money.format(sumOf(data))}` : ""}`}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        {sortNow && ready ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-2 @min-[30rem]:inline-flex">
            {columnById(sortNow.columnId)?.header ?? sortNow.columnId}
            <span className="text-ink-3">
              {(() => {
                const c = columnById(sortNow.columnId);
                return c ? sortWords(c, sortNow.direction) : "";
              })()}
            </span>
          </span>
        ) : null}
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between cells. Space selects a row, Shift with an arrow
        extends the selection. Enter sorts a heading or edits a cell. Shift with
        Left or Right resizes a heading&apos;s column, Shift with Enter fits it
        to its contents. Page Up and Page Down turn the page.
      </p>

      {body()}

      {status !== "error" ? (
        <footer className="flex h-12 items-center justify-between gap-2 border-t border-hairline px-2 @min-[30rem]:px-3">
          <div className="relative flex h-8 min-w-0 flex-1 items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {chosen.length > 0 ? (
                <motion.div
                  key="bulk"
                  className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={{
                    opacity: { duration: durations.base, ease: easings.enter },
                    y: motionSafe ? springs.snap : { duration: 0 },
                  }}
                >
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        audio.play("click", { pitch: 1.1, gain: 0.5 });
                        onAction?.(action.id, [...chosen]);
                      }}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs transition-colors enabled:hover:bg-surface-2 disabled:opacity-50",
                        action.tone === "danger"
                          ? "text-danger"
                          : "text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      {action.icon ? (
                        <span
                          aria-hidden
                          className="flex size-3.5 shrink-0 items-center justify-center"
                        >
                          {action.icon}
                        </span>
                      ) : null}
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Clear selection"
                    disabled={disabled}
                    onClick={() => {
                      audio.play("click", { pitch: 0.9, gain: 0.4 });
                      commitSelection([]);
                    }}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                    <span className="hidden @min-[30rem]:inline">Clear</span>
                  </button>
                </motion.div>
              ) : (
                <motion.p
                  key="range"
                  className="truncate pl-1 text-[12px] text-ink-3 tabular-nums"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  {ready && sorted.length > 0
                    ? `${shownFrom}–${shownTo} of ${sorted.length}`
                    : ready
                      ? `0 ${itemLabel.other}`
                      : " "}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <nav
            aria-label="Pages"
            className="flex shrink-0 items-center gap-0.5"
          >
            <button
              type="button"
              aria-label="Previous page"
              disabled={disabled || !ready || pageIndex === 0}
              onClick={() => {
                if (goPage(pageIndex - 1)) {
                  audio.play("click", { pitch: 0.92, gain: 0.45 });
                }
              }}
              className={pagerButton}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span className="px-1 font-mono text-[11px] text-ink-2 tabular-nums @min-[40rem]:hidden">
              {pageIndex + 1} / {pageCount}
            </span>
            <span className="hidden items-center gap-0.5 @min-[40rem]:flex">
              {pageList(pageCount, pageIndex).map((p, i) => {
                if (p === "gap") {
                  return (
                    <span
                      key={`gap-${i}`}
                      aria-hidden
                      className="inline-flex w-5 justify-center font-mono text-[11px] text-ink-3"
                    >
                      …
                    </span>
                  );
                }
                const on = p === pageIndex;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-label={`Page ${p + 1}`}
                    aria-current={on ? "page" : undefined}
                    disabled={disabled || !ready}
                    onClick={() => {
                      if (goPage(p)) {
                        audio.play("click", {
                          pitch: r2(0.9 + p * 0.04),
                          gain: 0.45,
                        });
                      }
                    }}
                    className={cn(
                      "relative inline-flex size-8 items-center justify-center rounded-2 font-mono text-[11px] tabular-nums transition-colors",
                      on
                        ? "text-primary-foreground"
                        : "text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        layoutId={`${uid}-page`}
                        aria-hidden
                        className="absolute inset-1 rounded-[5px] bg-primary"
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : null}
                    <span className="relative">{p + 1}</span>
                  </button>
                );
              })}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={disabled || !ready || pageIndex >= pageCount - 1}
              onClick={() => {
                if (goPage(pageIndex + 1)) {
                  audio.play("click", { pitch: 1.08, gain: 0.45 });
                }
              }}
              className={pagerButton}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </nav>
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
