"use client";

import * as React from "react";

import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useMotionValue,
} from "motion/react";
import {
  BookmarkPlus,
  Braces,
  Check,
  Cloud,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Inbox,
  Mail,
  Play,
  RotateCcw,
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
import { cn } from "@/registry/lib/utils";

export type ExportColumnKind = "text" | "number" | "date" | "money";

export type ExportColumn = {
  id: string;
  /** The column's heading, e.g. "Customer". */
  label: string;
  kind: ExportColumnKind;
  /** One value, shown in the preview strip. */
  sample: string;
  /** Typical bytes per cell, for the size estimate. */
  bytes: number;
};

export type ExportFormat = {
  id: string;
  /** Shown on the radio and in the sentence, e.g. "CSV". */
  label: string;
  /** File extension, without the dot. */
  ext: string;
  /** One line under the label. */
  blurb: string;
  /** How much larger a cell is in this format than its plain bytes. */
  cellFactor: number;
  /** Bytes each row costs beyond its cells. */
  rowOverhead: number;
  /** Bytes the file costs before any row. */
  fileOverhead: number;
  /** Every cell repeats its column name (JSON does). */
  keyed: boolean;
};

/** A date range preset; dates are ISO days, "2026-10-01". */
export type ExportPreset = {
  id: string;
  label: string;
  from: string;
  to: string;
};

export type ExportFilter = {
  id: string;
  label: string;
  /** The share of rows that pass it, 0 to 1. */
  share: number;
};

export type ExportDelivery = "download" | "email" | "drive";

/** The recipe: what is exported, how, and where it goes. */
export type ExportValue = {
  format: string;
  /** Column ids, in export order. */
  columns: string[];
  from: string;
  to: string;
  filters: string[];
  delivery: ExportDelivery;
};

export type ExportField =
  "format" | "columns" | "range" | "filters" | "delivery" | "recipe";

export type ExportSavedRecipe = {
  id: string;
  name: string;
  value: ExportValue;
};

export type ExportEstimate = { rows: number; bytes: number };

export type ExportRunResult = { rows: number; bytes: number; file: string };

/** Runs the export, reporting progress from 0 to 1; abort means the surface went away. */
export type ExportRun = (
  value: ExportValue,
  report: (fraction: number) => void,
  signal: AbortSignal,
) => Promise<ExportRunResult | void>;

export type ExportEstimator = (
  value: ExportValue,
  context: {
    columns: ExportColumn[];
    formats: ExportFormat[];
    filters: ExportFilter[];
  },
) => ExportEstimate;

export type ExportSentenceStyle = "prose" | "list";
export type ExportDensity = "compact" | "cozy" | "roomy";
export type ExportAccent = "cobalt" | "signal" | "ink";
export type ExportStatus = "ready" | "loading" | "error";

export type ExportRecipeProps = {
  /** How the recipe reads: one sentence, or a list of its parts. @default "prose" */
  sentenceStyle?: ExportSentenceStyle;
  /** Row heights, padding and type size. @default "cozy" */
  density?: ExportDensity;
  /** The colour the chosen phrases, the checks and the progress take. @default "cobalt" */
  accent?: ExportAccent;
  /** Every column the report can export, in checklist order. @default defaultExportColumns */
  columns?: ExportColumn[];
  /** The file formats on offer. @default defaultExportFormats */
  formats?: ExportFormat[];
  /** The date range presets. @default defaultExportPresets */
  presets?: ExportPreset[];
  /** The filter chips. @default defaultExportFilters */
  filters?: ExportFilter[];
  /** Controlled recipe. */
  value?: ExportValue;
  /** Initial recipe when uncontrolled. @default defaultExportValue */
  defaultValue?: ExportValue;
  /** Fires from the press, key or drag that changed the recipe, with the whole recipe and which part moved. */
  onChange?: (value: ExportValue, field: ExportField) => void;
  /** Controlled saved recipes. */
  recipes?: ExportSavedRecipe[];
  /** Initial saved recipes when uncontrolled. @default defaultExportRecipes */
  defaultRecipes?: ExportSavedRecipe[];
  /** A recipe was saved or removed, with the whole strip. */
  onRecipesChange?: (recipes: ExportSavedRecipe[]) => void;
  /** A saved recipe was applied. */
  onApplyRecipe?: (recipe: ExportSavedRecipe) => void;
  /** Runs the export when Run export is pressed. @default simulateExport */
  onRun?: ExportRun;
  /** Download was pressed in the done state. */
  onDownload?: (result: ExportRunResult) => void;
  /** Turns a recipe into a row count and a file size. @default estimateExport */
  estimate?: ExportEstimator;
  /** Whether the report's columns and estimate have arrived. @default "ready" */
  status?: ExportStatus;
  /** "Try again" was pressed after the estimate failed. */
  onRetry?: () => void;
  /** Today, as an ISO day; "so far" ranges end here. @default defaultExportNow */
  now?: string;
  /** The heading. @default "Export orders" */
  title?: string;
  /** What one row is called. @default { one: "order", other: "orders" } */
  noun?: { one: string; other: string };
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be changed, saved or run. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026. */
export const defaultExportNow = "2026-10-12";

/** Coldbrook Reports' order export: twelve columns. */
export const defaultExportColumns: ExportColumn[] = [
  { id: "order", label: "Order", kind: "text", sample: "CB-20481", bytes: 9 },
  {
    id: "placed",
    label: "Placed",
    kind: "date",
    sample: "2026-10-09",
    bytes: 11,
  },
  {
    id: "customer",
    label: "Customer",
    kind: "text",
    sample: "Marlow & Finch",
    bytes: 18,
  },
  {
    id: "channel",
    label: "Channel",
    kind: "text",
    sample: "Wholesale",
    bytes: 9,
  },
  { id: "items", label: "Items", kind: "number", sample: "3", bytes: 2 },
  {
    id: "subtotal",
    label: "Subtotal",
    kind: "money",
    sample: "412.00",
    bytes: 7,
  },
  { id: "tax", label: "Tax", kind: "money", sample: "82.40", bytes: 6 },
  { id: "total", label: "Total", kind: "money", sample: "494.40", bytes: 7 },
  { id: "status", label: "Status", kind: "text", sample: "Paid", bytes: 6 },
  { id: "region", label: "Region", kind: "text", sample: "EU-West", bytes: 8 },
  {
    id: "courier",
    label: "Courier",
    kind: "text",
    sample: "Fernmoor Post",
    bytes: 13,
  },
  {
    id: "notes",
    label: "Notes",
    kind: "text",
    sample: "Leave at side door",
    bytes: 22,
  },
];

export const defaultExportFormats: ExportFormat[] = [
  {
    id: "csv",
    label: "CSV",
    ext: "csv",
    blurb: "Plain rows, opens anywhere",
    cellFactor: 1,
    rowOverhead: 2,
    fileOverhead: 64,
    keyed: false,
  },
  {
    id: "xlsx",
    label: "XLSX",
    ext: "xlsx",
    blurb: "A workbook with typed cells",
    cellFactor: 1.4,
    rowOverhead: 28,
    fileOverhead: 6400,
    keyed: false,
  },
  {
    id: "json",
    label: "JSON",
    ext: "json",
    blurb: "One object per row",
    cellFactor: 1,
    rowOverhead: 6,
    fileOverhead: 16,
    keyed: true,
  },
  {
    id: "pdf",
    label: "PDF",
    ext: "pdf",
    blurb: "Paged, for printing",
    cellFactor: 2.1,
    rowOverhead: 36,
    fileOverhead: 18000,
    keyed: false,
  },
];

export const defaultExportPresets: ExportPreset[] = [
  { id: "month", label: "This month", from: "2026-10-01", to: "2026-10-12" },
  {
    id: "last-month",
    label: "Last month",
    from: "2026-09-01",
    to: "2026-09-30",
  },
  {
    id: "quarter",
    label: "Last quarter",
    from: "2026-07-01",
    to: "2026-09-30",
  },
  { id: "ytd", label: "Year to date", from: "2026-01-01", to: "2026-10-12" },
  { id: "all", label: "All time", from: "2025-10-01", to: "2026-10-12" },
];

export const defaultExportFilters: ExportFilter[] = [
  { id: "paid", label: "Paid", share: 0.78 },
  { id: "refunded", label: "Refunded", share: 0.06 },
  { id: "wholesale", label: "Wholesale", share: 0.31 },
  { id: "eu", label: "EU", share: 0.44 },
  { id: "gift", label: "Gift orders", share: 0.09 },
  { id: "notes", label: "Has notes", share: 0.22 },
];

export const defaultExportValue: ExportValue = {
  format: "csv",
  columns: ["order", "placed", "customer", "items", "total", "status"],
  from: "2026-10-01",
  to: "2026-10-12",
  filters: [],
  delivery: "download",
};

export const defaultExportRecipes: ExportSavedRecipe[] = [
  {
    id: "books",
    name: "Month-end books",
    value: {
      format: "xlsx",
      columns: ["order", "placed", "subtotal", "tax", "total", "status"],
      from: "2026-09-01",
      to: "2026-09-30",
      filters: ["paid"],
      delivery: "email",
    },
  },
  {
    id: "eu-wholesale",
    name: "EU wholesale, year to date",
    value: {
      format: "csv",
      columns: ["order", "customer", "channel", "region", "total", "courier"],
      from: "2026-01-01",
      to: "2026-10-12",
      filters: ["wholesale", "eu"],
      delivery: "drive",
    },
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const ACCENTS: Record<ExportAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  ExportDensity,
  { row: string; pad: string; gap: string; text: string }
> = {
  compact: {
    row: "h-7",
    pad: "px-3 py-2.5",
    gap: "gap-3",
    text: "text-[12px]",
  },
  cozy: { row: "h-8", pad: "px-4 py-3", gap: "gap-4", text: "text-[13px]" },
  roomy: { row: "h-9", pad: "px-5 py-4", gap: "gap-5", text: "text-sm" },
};

const DELIVERY_WORDS: Record<
  ExportDelivery,
  { label: string; phrase: string; done: string }
> = {
  download: {
    label: "Download now",
    phrase: "downloaded now",
    done: "ready to download",
  },
  email: { label: "Email me", phrase: "emailed to you", done: "sent to you" },
  drive: {
    label: "Save to drive",
    phrase: "saved to your drive",
    done: "saved to your drive",
  },
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_MS = 86_400_000;
/** The first day Coldbrook Reports has orders for. */
const DAY0 = Date.UTC(2025, 9, 1);
const DAYS = 377;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Orders per day from October 2025: a weekly rhythm over slow growth. */
const DAILY: number[] = (() => {
  const rand = mulberry32(1685);
  return Array.from({ length: DAYS }, (_, i) => {
    const weekday = new Date(DAY0 + i * DAY_MS).getUTCDay();
    const rhythm =
      weekday === 0 ? -30 : weekday === 6 ? -20 : weekday === 5 ? 18 : 12;
    const growth = 30 * (i / (DAYS - 1));
    return Math.max(8, Math.round(78 + growth + rhythm + (rand() - 0.5) * 24));
  });
})();

type Day = { y: number; m: number; d: number };

const parseDay = (iso: string): Day | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
};

const dayIndex = (iso: string): number | null => {
  const day = parseDay(iso);
  if (!day) return null;
  return Math.round((Date.UTC(day.y, day.m - 1, day.d) - DAY0) / DAY_MS);
};

const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "October 2026", "Q3 2026", "2026 so far", or "13 Sep to 12 Oct 2026". */
export const rangeLabel = (from: string, to: string, now: string): string => {
  const f = parseDay(from);
  const t = parseDay(to);
  if (!f || !t) return "an unset period";
  const a = dayIndex(from) ?? 0;
  const b = dayIndex(to) ?? 0;
  if (a > b) return "an empty period";
  const sameYear = f.y === t.y;
  if (
    sameYear &&
    f.m === t.m &&
    f.d === 1 &&
    (t.d === daysInMonth(t.y, t.m) || to === now)
  ) {
    return `${MONTHS_LONG[f.m - 1] ?? ""} ${f.y}`;
  }
  if (
    sameYear &&
    f.d === 1 &&
    (f.m - 1) % 3 === 0 &&
    t.m === f.m + 2 &&
    t.d === daysInMonth(t.y, t.m)
  ) {
    return `Q${Math.floor((f.m - 1) / 3) + 1} ${f.y}`;
  }
  if (sameYear && f.m === 1 && f.d === 1) {
    if (to === now) return `${f.y} so far`;
    if (t.m === 12 && t.d === 31) return `${f.y}`;
  }
  const fy = sameYear ? "" : ` ${f.y}`;
  return `${f.d} ${MONTHS[f.m - 1] ?? ""}${fy} to ${t.d} ${MONTHS[t.m - 1] ?? ""} ${t.y}`;
};

const formatInt = (n: number) =>
  String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

/** Sums the seeded days in the range, thins them by the filters, then sizes the cells. */
export const estimateExport: ExportEstimator = (
  value,
  { columns, formats, filters },
) => {
  const a = dayIndex(value.from);
  const b = dayIndex(value.to);
  let rows = 0;
  if (a !== null && b !== null && a <= b) {
    const lo = clamp(a, 0, DAYS - 1);
    const hi = clamp(b, 0, DAYS - 1);
    if (b >= 0 && a <= DAYS - 1) {
      for (let i = lo; i <= hi; i += 1) rows += DAILY[i] ?? 0;
    }
  }
  const share = value.filters.reduce((acc, id) => {
    const f = filters.find((x) => x.id === id);
    return f ? acc * f.share : acc;
  }, 1);
  rows = Math.round(rows * share);
  const fmt = formats.find((f) => f.id === value.format) ?? formats[0];
  if (!fmt) return { rows, bytes: 0 };
  const cols = value.columns
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is ExportColumn => c !== undefined);
  const perRow =
    cols.reduce(
      (s, c) =>
        s + c.bytes * fmt.cellFactor + (fmt.keyed ? c.label.length + 4 : 1),
      0,
    ) + fmt.rowOverhead;
  return {
    rows,
    bytes: Math.round(fmt.fileOverhead + (cols.length ? rows * perRow : 0)),
  };
};

/** Eight timed steps, about a second and a half, for hosts without a backend. */
export const simulateExport: ExportRun = (_value, report, signal) =>
  new Promise<void>((resolve, reject) => {
    const steps = [0.07, 0.19, 0.34, 0.5, 0.64, 0.78, 0.91, 1];
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      reject(new Error("Export cancelled"));
    };
    const tick = () => {
      timer = null;
      if (signal.aborted) return;
      const f = steps[i] ?? 1;
      report(f);
      i += 1;
      if (f >= 1) {
        signal.removeEventListener("abort", stop);
        resolve();
        return;
      }
      timer = setTimeout(tick, 150 + (i % 3) * 40);
    };
    signal.addEventListener("abort", stop, { once: true });
    timer = setTimeout(tick, 160);
  });

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Two recipes are the same when every part matches; filter order does not count. */
export const sameExportValue = (a: ExportValue, b: ExportValue) =>
  a.format === b.format &&
  a.from === b.from &&
  a.to === b.to &&
  a.delivery === b.delivery &&
  sameList(a.columns, b.columns) &&
  sameSet(a.filters, b.filters);

const joinWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1] ?? ""}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const stepIndex = (
  key: string,
  i: number,
  len: number,
  axis: "h" | "v" | "both",
): number | null => {
  const next =
    axis === "v"
      ? key === "ArrowDown"
      : axis === "h"
        ? key === "ArrowRight"
        : key === "ArrowDown" || key === "ArrowRight";
  const prev =
    axis === "v"
      ? key === "ArrowUp"
      : axis === "h"
        ? key === "ArrowLeft"
        : key === "ArrowUp" || key === "ArrowLeft";
  if (next) return Math.min(len - 1, i + 1);
  if (prev) return Math.max(0, i - 1);
  if (key === "Home") return 0;
  if (key === "End") return len - 1;
  return null;
};

function useRoving() {
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const bind = React.useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );
  const focus = React.useCallback((id: string | undefined) => {
    if (id) nodes.current.get(id)?.focus({ preventScroll: true });
  }, []);
  return { nodes, bind, focus };
}

type Piece = {
  key: string;
  /** The part's name in the list style and in announcements. */
  label: string;
  text: string;
  tone: "accent" | "warn";
};

type Recipe = {
  pieces: Piece[];
  /** Prose: static words between the pieces. */
  parts: (string | Piece)[];
  sentence: string;
};

const buildRecipe = (
  value: ExportValue,
  est: ExportEstimate,
  ctx: {
    formats: ExportFormat[];
    filters: ExportFilter[];
    noun: { one: string; other: string };
    now: string;
  },
): Recipe => {
  const fmt = ctx.formats.find((f) => f.id === value.format);
  const n = value.columns.length;
  const picked = value.filters
    .map((id) => ctx.filters.find((f) => f.id === id)?.label)
    .filter((x): x is string => Boolean(x));
  const count: Piece = {
    key: "count",
    label: "Rows",
    text: `${formatInt(est.rows)} ${est.rows === 1 ? ctx.noun.one : ctx.noun.other}`,
    tone: est.rows === 0 ? "warn" : "accent",
  };
  const range: Piece = {
    key: "range",
    label: "Period",
    text: rangeLabel(value.from, value.to, ctx.now),
    tone: "accent",
  };
  const format: Piece = {
    key: "format",
    label: "Format",
    text: fmt?.label ?? "no format",
    tone: fmt ? "accent" : "warn",
  };
  const columns: Piece = {
    key: "columns",
    label: "Columns",
    text: n === 0 ? "no columns" : n === 1 ? "1 column" : `${n} columns`,
    tone: n === 0 ? "warn" : "accent",
  };
  const filters: Piece = {
    key: "filters",
    label: "Filters",
    text: picked.length ? `only ${joinWords(picked)}` : "no filters",
    tone: "accent",
  };
  const delivery: Piece = {
    key: "delivery",
    label: "Delivery",
    text: DELIVERY_WORDS[value.delivery].phrase,
    tone: "accent",
  };
  const parts: (string | Piece)[] = [
    "Export ",
    count,
    " from ",
    range,
    " as ",
    format,
    " with ",
    columns,
  ];
  if (picked.length) parts.push(", ", filters);
  parts.push(", ", delivery, ".");
  return {
    pieces: [count, range, format, columns, filters, delivery],
    parts,
    sentence: parts.map((p) => (typeof p === "string" ? p : p.text)).join(""),
  };
};

const noopSubscribe = () => () => {};

/* ----------------------------------------------------------------------- */
/*                                  Phrase                                  */
/* ----------------------------------------------------------------------- */

/**
 * One phrase of the recipe. When its text changes the old words pop out of
 * the line and fade while the new ones fade in under a wash that clears on a
 * slow tween — a brief highlight, never a slide. The first text it is given
 * never highlights, so a surface does not light up on load.
 */
function Phrase({
  text,
  tone,
  delay,
  block,
}: {
  text: string;
  tone: Piece["tone"];
  delay: number;
  block?: boolean;
}) {
  const [seen, setSeen] = React.useState(text);
  const [gen, setGen] = React.useState(0);
  if (text !== seen) {
    setSeen(text);
    setGen(gen + 1);
  }
  const fresh = gen > 0;
  return (
    <span className={cn("relative", block ? "block" : "inline-block")}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          className={cn(
            "relative -mx-0.5 rounded-1 px-0.5 font-medium",
            block ? "block" : "inline-block",
            tone === "warn" ? "text-warn" : "text-(--er-accent)",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter, delay }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-1 bg-(--er-wash)"
            initial={fresh ? { opacity: 1 } : false}
            animate={{ opacity: 0 }}
            transition={{
              duration: durations.slow,
              delay: delay + durations.base,
              ease: easings.exit,
            }}
          />
          <span className="relative">{text}</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.2;

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const text = formatInt(value);
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span
            key={`d${chars.length - 1 - i}`}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        ) : (
          <span key={`c${chars.length - 1 - i}`}>{c}</span>
        ),
      )}
    </span>
  );
}

/** A check that draws itself on `springs.flick`; instant under reduced motion. */
function Tick({
  motionSafe,
  delay = 0,
  className,
}: {
  motionSafe: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Radio row                                 */
/* ----------------------------------------------------------------------- */

type RadioItem = {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
};

function RadioRow({
  name,
  groupId,
  items,
  value,
  onSelect,
  gridClass,
  inert,
  motionSafe,
  row,
}: {
  name: string;
  groupId: string;
  items: RadioItem[];
  value: string;
  onSelect: (id: string) => void;
  gridClass: string;
  inert: boolean;
  motionSafe: boolean;
  row: string;
}) {
  const { bind, focus } = useRoving();
  const checkedIn = items.some((i) => i.id === value);
  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label={name}
        className={cn("grid gap-1.5", gridClass)}
      >
        {items.map((item, i) => {
          const checked = item.id === value;
          return (
            <button
              key={item.id}
              ref={bind(item.id)}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={inert || undefined}
              tabIndex={checked || (!checkedIn && i === 0) ? 0 : -1}
              onClick={() => {
                if (!inert) onSelect(item.id);
              }}
              onKeyDown={(event) => {
                const to = stepIndex(event.key, i, items.length, "both");
                if (to === null) return;
                event.preventDefault();
                const target = items[to];
                if (!target) return;
                focus(target.id);
                if (!inert) onSelect(target.id);
              }}
              className={cn(
                "relative flex min-w-0 items-center gap-2 rounded-2 border border-hairline px-2.5 text-left transition-colors",
                row,
                checked ? "text-foreground" : "text-ink-2",
                !inert &&
                  !checked &&
                  "hover:bg-surface-1 hover:text-foreground",
                inert ? "cursor-not-allowed" : "cursor-pointer",
                FOCUS_RING,
              )}
            >
              {checked ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? "pill" : undefined}
                  className="absolute -inset-px rounded-2 border border-(--er-line) bg-(--er-wash)"
                  transition={springs.snap}
                />
              ) : null}
              <span className="relative flex min-w-0 items-center gap-2">
                {item.icon ? (
                  <span
                    className={cn(
                      "shrink-0",
                      checked ? "text-(--er-accent)" : "text-ink-3",
                    )}
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xs font-medium">
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="hidden truncate text-[10px] text-ink-3 @min-[56rem]:block">
                      {item.hint}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Column checklist                            */
/* ----------------------------------------------------------------------- */

function ColumnList({
  columns,
  chosen,
  onToggle,
  onAll,
  inert,
  motionSafe,
  row,
  hintId,
}: {
  columns: ExportColumn[];
  chosen: string[];
  onToggle: (id: string) => void;
  onAll: () => void;
  inert: boolean;
  motionSafe: boolean;
  row: string;
  hintId: string;
}) {
  const { bind, focus } = useRoving();
  const [active, setActive] = React.useState<string | null>(null);
  const activeId =
    active && columns.some((c) => c.id === active)
      ? active
      : (columns[0]?.id ?? null);
  return (
    <ul
      role="listbox"
      aria-label="Columns"
      aria-multiselectable="true"
      aria-describedby={hintId}
      className="flex flex-col gap-0.5"
    >
      {columns.map((col, i) => {
        const on = chosen.includes(col.id);
        return (
          <li
            key={col.id}
            ref={bind(col.id)}
            role="option"
            aria-selected={on}
            aria-disabled={inert || undefined}
            tabIndex={activeId === col.id ? 0 : -1}
            onFocus={() => setActive(col.id)}
            onClick={() => {
              if (!inert) onToggle(col.id);
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (!inert) onToggle(col.id);
                return;
              }
              if (
                (event.key === "a" || event.key === "A") &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                if (!inert) onAll();
                return;
              }
              const to = stepIndex(event.key, i, columns.length, "v");
              if (to === null) return;
              event.preventDefault();
              focus(columns[to]?.id);
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-2 px-2 select-none",
              row,
              inert
                ? "cursor-not-allowed"
                : "cursor-pointer hover:bg-surface-1",
              FOCUS_RING,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
                on
                  ? "border-(--er-accent) bg-(--er-accent) text-(--bg-0)"
                  : "border-hairline-strong bg-surface-0",
              )}
            >
              {on ? <Tick motionSafe={motionSafe} className="size-3" /> : null}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                on ? "text-foreground" : "text-ink-2",
              )}
            >
              {col.label}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3">
              {col.kind}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Chip toolbar                              */
/* ----------------------------------------------------------------------- */

function ChipBar({
  name,
  items,
  pressed,
  onPress,
  inert,
  row,
}: {
  name: string;
  items: { id: string; label: string }[];
  pressed: (id: string) => boolean;
  onPress: (id: string) => void;
  inert: boolean;
  row: string;
}) {
  const { bind, focus } = useRoving();
  const [active, setActive] = React.useState<string | null>(null);
  const activeId =
    active && items.some((c) => c.id === active)
      ? active
      : (items[0]?.id ?? null);
  return (
    <div role="toolbar" aria-label={name} className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const on = pressed(item.id);
        return (
          <button
            key={item.id}
            ref={bind(item.id)}
            type="button"
            aria-pressed={on}
            aria-disabled={inert || undefined}
            tabIndex={activeId === item.id ? 0 : -1}
            onFocus={() => setActive(item.id)}
            onClick={() => {
              if (!inert) onPress(item.id);
            }}
            onKeyDown={(event) => {
              const to = stepIndex(event.key, i, items.length, "both");
              if (to === null) return;
              event.preventDefault();
              focus(items[to]?.id);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              row,
              on
                ? "border-(--er-line) bg-(--er-wash) text-(--er-accent)"
                : "border-hairline-strong text-ink-2",
              !inert && !on && "hover:bg-surface-1 hover:text-foreground",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {on ? <Check aria-hidden className="size-3" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Preview strip                              */
/* ----------------------------------------------------------------------- */

type DragRef = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  layoutLeft: number;
  layoutTop: number;
  lastX: number;
  lastY: number;
  width: number;
  height: number;
};

function PreviewStrip({
  order,
  byId,
  onMove,
  onRemove,
  onAll,
  inert,
  motionSafe,
  live,
  hintId,
  text,
}: {
  order: string[];
  byId: Map<string, ExportColumn>;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onAll: () => void;
  inert: boolean;
  motionSafe: boolean;
  live: boolean;
  hintId: string;
  text: string;
}) {
  const { nodes, bind, focus } = useRoving();
  const [active, setActive] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const drag = React.useRef<DragRef | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const activeId =
    active && order.includes(active) ? active : (order[0] ?? null);

  const place = React.useCallback(
    (d: DragRef) => {
      const vx = d.left + (d.lastX - d.startX);
      const vy = d.top + (d.lastY - d.startY);
      x.set(vx - d.layoutLeft);
      y.set(vy - d.layoutTop);
      return { vx, vy };
    },
    [x, y],
  );

  // The reorder moves the dragged card's slot under it; re-measure the slot
  // so the card stays under the pointer rather than jumping with its slot.
  React.useLayoutEffect(() => {
    const d = drag.current;
    if (!d) return;
    const node = nodes.current.get(d.id);
    if (!node) return;
    const r = node.getBoundingClientRect();
    d.layoutLeft = r.left - x.get();
    d.layoutTop = r.top - y.get();
    place(d);
  }, [order, nodes, x, y, place]);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragId(null);
    const settle = motionSafe ? springs.glide : { duration: 0 };
    animate(x, 0, settle);
    animate(y, 0, settle);
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (inert || event.button !== 0 || drag.current) return;
    const el = event.currentTarget;
    const r = el.getBoundingClientRect();
    el.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: r.left,
      top: r.top,
      layoutLeft: r.left,
      layoutTop: r.top,
      lastX: event.clientX,
      lastY: event.clientY,
      width: r.width,
      height: r.height,
    };
    x.set(0);
    y.set(0);
    setDragId(id);
    el.focus({ preventScroll: true });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.pointerId) return;
    d.lastX = event.clientX;
    d.lastY = event.clientY;
    const { vx, vy } = place(d);
    const strip = stripRef.current;
    if (!strip) return;
    const sr = strip.getBoundingClientRect();
    // Hit-test against each slot's laid-out box (offsets ignore transforms),
    // so a card gliding toward its new slot never swaps back on its way.
    const cx = vx - sr.left + strip.scrollLeft + d.width / 2;
    const cy = vy - sr.top + strip.scrollTop + d.height / 2;
    const from = order.indexOf(d.id);
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i];
      if (!id || id === d.id) continue;
      const node = nodes.current.get(id);
      if (!node) continue;
      const l = node.offsetLeft;
      const t = node.offsetTop;
      if (
        cx >= l &&
        cx <= l + node.offsetWidth &&
        cy >= t &&
        cy <= t + node.offsetHeight
      ) {
        if (i !== from) onMove(from, i);
        return;
      }
    }
  };

  if (order.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-4 py-6 text-center">
        <Inbox aria-hidden className="size-5 text-ink-3" />
        <p className="text-xs text-ink-2">
          No columns chosen. Pick some on the left, or take them all.
        </p>
        <button
          type="button"
          onClick={() => {
            if (!inert) onAll();
          }}
          aria-disabled={inert || undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <Check aria-hidden className="size-3.5" />
          Select all
        </button>
      </div>
    );
  }

  const step = cascade(order.length);

  return (
    <div
      ref={stripRef}
      role="listbox"
      aria-label="Column order"
      aria-describedby={hintId}
      className="relative flex flex-wrap gap-2"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {order.map((id, i) => {
          const col = byId.get(id);
          if (!col) return null;
          const dragging = dragId === id;
          return (
            <motion.div
              key={id}
              ref={bind(id)}
              role="option"
              aria-selected={activeId === id}
              aria-disabled={inert || undefined}
              aria-label={`${col.label}, position ${i + 1} of ${order.length}, ${col.kind}, sample ${col.sample}`}
              tabIndex={activeId === id ? 0 : -1}
              layout={dragging || !motionSafe ? false : "position"}
              initial={
                live
                  ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                layout: springs.glide,
                y: motionSafe
                  ? { ...springs.glide, delay: r3(Math.min(i, 8) * step) }
                  : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              style={dragging ? { x, y, zIndex: 2 } : undefined}
              onFocus={() => setActive(id)}
              onPointerDown={(event) => onPointerDown(event, id)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  if (inert) return;
                  const next = order[i + 1] ?? order[i - 1];
                  onRemove(id);
                  focus(next);
                  return;
                }
                if (event.altKey) {
                  const to =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? i + 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? i - 1
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? order.length - 1
                            : null;
                  if (to === null) return;
                  event.preventDefault();
                  if (inert) return;
                  const target = clamp(to, 0, order.length - 1);
                  if (target !== i) onMove(i, target);
                  return;
                }
                const to = stepIndex(event.key, i, order.length, "both");
                if (to === null) return;
                event.preventDefault();
                focus(order[to]);
              }}
              className={cn(
                "relative flex w-[7.75rem] touch-none flex-col gap-1 rounded-2 border bg-surface-0 px-2 py-1.5 select-none",
                dragging
                  ? "border-(--er-line) shadow-[0_10px_24px_-12px_color-mix(in_oklab,black_50%,transparent)]"
                  : "border-hairline",
                inert ? "cursor-not-allowed" : "cursor-grab",
                dragging && "cursor-grabbing",
                FOCUS_RING,
              )}
            >
              <span className="flex items-center gap-1">
                <GripVertical
                  aria-hidden
                  className="size-3 shrink-0 text-ink-3"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {col.label}
                </span>
                <span className="font-mono text-[9px] text-ink-3">{i + 1}</span>
              </span>
              <span
                className={cn(
                  "truncate rounded-1 bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-ink-2",
                  col.kind !== "text" && "text-right tabular-nums",
                )}
              >
                {col.sample}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <span className="sr-only">{text}</span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type RunState =
  | { phase: "idle" }
  | { phase: "running"; fraction: number }
  | { phase: "done"; result: ExportRunResult }
  | { phase: "failed"; message: string };

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  csv: <FileText aria-hidden className="size-3.5" />,
  xlsx: <FileSpreadsheet aria-hidden className="size-3.5" />,
  json: <Braces aria-hidden className="size-3.5" />,
  pdf: <FileDown aria-hidden className="size-3.5" />,
};

const DELIVERY_ICONS: Record<ExportDelivery, React.ReactNode> = {
  download: <Download aria-hidden className="size-3.5" />,
  email: <Mail aria-hidden className="size-3.5" />,
  drive: <Cloud aria-hidden className="size-3.5" />,
};

/**
 * An export dialog that writes its recipe as a sentence. The controls sit on
 * the left — a format radio group, a column checklist, a date range with
 * presets, filter chips and a delivery choice — and on the right the recipe
 * reads them back: "Export 1,284 orders from October 2026 as CSV with 6
 * columns, downloaded now." Each phrase that changes cross-fades under a wash
 * that clears on a slow tween; beneath it the row count rolls on
 * `springs.snap`, the size estimate cross-fades, and a preview strip shows
 * the columns in export order, reordered by drag or by Alt+arrows with the
 * cards gliding on `springs.glide`. Save as recipe lands the configuration as
 * a chip on `springs.recoil`; pressing one re-applies everything and the
 * phrases relight in a cascade. Run export fills a progress line on `glide`
 * and lands a Download button on `recoil` with a tick that draws on `flick`.
 *
 * Every control is its native widget or its ARIA equivalent: the radios take
 * arrows, the columns are a multi-select listbox (arrows, Space, Ctrl+A), the
 * preview strip a listbox where Alt+arrows move a column and Delete removes
 * it, and the chips and saved recipes are toolbars. Each change is announced
 * in words with the new count and size. Under reduced motion the phrases
 * still cross-fade and the wash still clears, but nothing rolls, glides or
 * lands: digits, cards and chips change in place.
 */
export function ExportRecipe({
  sentenceStyle = "prose",
  density = "cozy",
  accent = "cobalt",
  columns = defaultExportColumns,
  formats = defaultExportFormats,
  presets = defaultExportPresets,
  filters = defaultExportFilters,
  value,
  defaultValue = defaultExportValue,
  onChange,
  recipes,
  defaultRecipes = defaultExportRecipes,
  onRecipesChange,
  onApplyRecipe,
  onRun,
  onDownload,
  estimate = estimateExport,
  status = "ready",
  onRetry,
  now = defaultExportNow,
  title = "Export orders",
  noun = { one: "order", other: "orders" },
  label,
  height = 540,
  disabled = false,
  className,
}: ExportRecipeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const columnsHintId = `${uid}-columns-hint`;
  const stripHintId = `${uid}-strip-hint`;
  const fromId = `${uid}-from`;
  const toId = `${uid}-to`;

  const [own, setOwn] = React.useState<ExportValue>(defaultValue);
  const current = value ?? own;
  const [ownRecipes, setOwnRecipes] =
    React.useState<ExportSavedRecipe[]>(defaultRecipes);
  const saved = recipes ?? ownRecipes;

  const [run, setRun] = React.useState<RunState>({ phase: "idle" });
  const [burst, setBurst] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [activeRecipe, setActiveRecipe] = React.useState<string | null>(null);
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const runCtrl = React.useRef<AbortController | null>(null);
  const burstTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipeNodes = useRoving();

  const ready = status === "ready";
  const running = run.phase === "running";
  const inert = disabled || !ready || running;
  const dens = DENSITY[density] ?? DENSITY.cozy;

  /* -------------------------------- data ------------------------------- */

  const byId = React.useMemo(
    () => new Map(columns.map((c) => [c.id, c])),
    [columns],
  );
  const order = current.columns.filter((id) => byId.has(id));
  const est = estimate(current, { columns, formats, filters });
  const recipe = buildRecipe(current, est, { formats, filters, noun, now });
  const fmt = formats.find((f) => f.id === current.format);
  const fileName = `${slug(noun.other)}-${slug(rangeLabel(current.from, current.to, now))}.${fmt?.ext ?? "txt"}`;
  const canRun =
    !inert && order.length > 0 && est.rows > 0 && fmt !== undefined;
  const matchedRecipe = saved.find((r) => sameExportValue(r.value, current));
  const activePreset = presets.find(
    (p) => p.from === current.from && p.to === current.to,
  );

  React.useEffect(
    () => () => {
      runCtrl.current?.abort();
      if (burstTimer.current !== null) clearTimeout(burstTimer.current);
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const announce = (what: string, next: ExportValue) => {
    const e = estimate(next, { columns, formats, filters });
    setAnnouncement(
      `${what}. ${formatInt(e.rows)} ${e.rows === 1 ? noun.one : noun.other}, ${formatBytes(e.bytes)}.`,
    );
  };

  const commit = (next: ExportValue, field: ExportField, what: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, field);
    if (run.phase !== "idle" && run.phase !== "running") {
      setRun({ phase: "idle" });
    }
    announce(what, next);
  };

  const setFormat = (id: string) => {
    if (id === current.format) return;
    const f = formats.find((x) => x.id === id);
    commit({ ...current, format: id }, "format", `Format: ${f?.label ?? id}`);
  };

  const toggleColumn = (id: string) => {
    const col = byId.get(id);
    const on = current.columns.includes(id);
    const next = on
      ? current.columns.filter((x) => x !== id)
      : [...current.columns, id];
    commit(
      { ...current, columns: next },
      "columns",
      `${col?.label ?? id} ${on ? "removed" : "added"}, ${next.length} ${next.length === 1 ? "column" : "columns"}`,
    );
  };

  const toggleAll = () => {
    const all = columns.every((c) => current.columns.includes(c.id));
    const next = all ? [] : columns.map((c) => c.id);
    commit(
      { ...current, columns: next },
      "columns",
      all ? "All columns cleared" : `All ${columns.length} columns chosen`,
    );
  };

  const moveColumn = (from: number, to: number) => {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    commit(
      { ...current, columns: next },
      "columns",
      `${byId.get(moved)?.label ?? moved} moved to position ${to + 1} of ${next.length}`,
    );
  };

  const setRange = (from: string, to: string, what?: string) => {
    if (from === current.from && to === current.to) return;
    commit(
      { ...current, from, to },
      "range",
      what ?? `Period: ${rangeLabel(from, to, now)}`,
    );
  };

  const toggleFilter = (id: string) => {
    const f = filters.find((x) => x.id === id);
    const on = current.filters.includes(id);
    const next = on
      ? current.filters.filter((x) => x !== id)
      : [...current.filters, id];
    commit(
      { ...current, filters: next },
      "filters",
      `${f?.label ?? id} filter ${on ? "off" : "on"}`,
    );
  };

  const setDelivery = (id: string) => {
    if (id === current.delivery || !(id in DELIVERY_WORDS)) return;
    const d = id as ExportDelivery;
    commit(
      { ...current, delivery: d },
      "delivery",
      `Delivery: ${DELIVERY_WORDS[d].label}`,
    );
  };

  /* ------------------------------- recipes ----------------------------- */

  const setSaved = (next: ExportSavedRecipe[]) => {
    if (recipes === undefined) setOwnRecipes(next);
    onRecipesChange?.(next);
  };

  const saveRecipe = () => {
    if (inert || matchedRecipe) return;
    const name = `${fmt?.label ?? "Export"} · ${rangeLabel(current.from, current.to, now)} · ${order.length} ${order.length === 1 ? "col" : "cols"}`;
    const next: ExportSavedRecipe = {
      id: `${uid}-r${Date.now().toString(36)}`,
      name,
      value: { ...current, columns: [...order], filters: [...current.filters] },
    };
    setSaved([...saved, next]);
    setAnnouncement(`Saved as recipe: ${name}.`);
  };

  const applyRecipe = (r: ExportSavedRecipe) => {
    if (inert) return;
    onApplyRecipe?.(r);
    if (sameExportValue(r.value, current)) {
      setAnnouncement(`${r.name} is already applied.`);
      return;
    }
    commit(r.value, "recipe", `Recipe applied: ${r.name}`);
    if (motionSafe) {
      setBurst(true);
      if (burstTimer.current !== null) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(
        () => {
          burstTimer.current = null;
          setBurst(false);
        },
        (recipe.pieces.length * cascade(recipe.pieces.length) + 0.4) * 1000,
      );
    }
  };

  const removeRecipe = (r: ExportSavedRecipe) => {
    if (inert) return;
    setSaved(saved.filter((x) => x.id !== r.id));
    setAnnouncement(`Removed recipe: ${r.name}.`);
  };

  /* --------------------------------- run ------------------------------- */

  const startRun = async () => {
    if (!canRun) return;
    runCtrl.current?.abort();
    const ctrl = new AbortController();
    runCtrl.current = ctrl;
    const snapshot = current;
    const expected = est;
    const file = fileName;
    setRun({ phase: "running", fraction: 0 });
    setAnnouncement(
      `Export started: ${formatInt(expected.rows)} ${expected.rows === 1 ? noun.one : noun.other}.`,
    );
    try {
      const result = await (onRun ?? simulateExport)(
        snapshot,
        (f) => {
          if (ctrl.signal.aborted) return;
          setRun({ phase: "running", fraction: clamp(f, 0, 1) });
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const done: ExportRunResult = {
        rows: result?.rows ?? expected.rows,
        bytes: result?.bytes ?? expected.bytes,
        file: result?.file ?? file,
      };
      setRun({ phase: "done", result: done });
      setAnnouncement(
        `Export finished: ${formatInt(done.rows)} ${done.rows === 1 ? noun.one : noun.other}, ${formatBytes(done.bytes)}, ${DELIVERY_WORDS[snapshot.delivery].done}.`,
      );
    } catch (error) {
      if (ctrl.signal.aborted) return;
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The export failed.";
      setRun({ phase: "failed", message });
      setAnnouncement(`Export failed. ${message}`);
    } finally {
      if (runCtrl.current === ctrl) runCtrl.current = null;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const step = cascade(recipe.pieces.length);
  const delayFor = (i: number) => (burst && motionSafe ? r3(i * step) : 0);
  /** How the done badge arrives: a landing on recoil, a fade under reduced motion. */
  const landing = {
    initial: motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: {
      scale: springs.recoil,
      opacity: { duration: durations.fast },
    },
  };
  const pieceIndex = new Map(recipe.pieces.map((p, i) => [p.key, i]));
  const recipeIds = saved.flatMap((r) => [r.id, `${r.id}:x`]);
  const activeRecipeId =
    activeRecipe && recipeIds.includes(activeRecipe)
      ? activeRecipe
      : (recipeIds[0] ?? null);

  const navRecipes = (event: React.KeyboardEvent, id: string) => {
    const i = recipeIds.indexOf(id);
    const to = stepIndex(event.key, i, recipeIds.length, "both");
    if (to === null) return;
    event.preventDefault();
    recipeNodes.focus(recipeIds[to]);
  };

  const sentence =
    sentenceStyle === "list" ? (
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        {recipe.pieces.map((p) => (
          <React.Fragment key={p.key}>
            <dt className={cn(LABEL, "pt-0.5")}>{p.label}</dt>
            <dd className={cn("min-w-0", dens.text)}>
              <Phrase
                text={p.text}
                tone={p.tone}
                delay={delayFor(pieceIndex.get(p.key) ?? 0)}
                block
              />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    ) : (
      <p
        className={cn(
          "leading-relaxed text-foreground",
          density === "roomy" ? "text-[17px]" : "text-[15px]",
        )}
      >
        {recipe.parts.map((part, i) =>
          typeof part === "string" ? (
            <React.Fragment key={`s${i}`}>{part}</React.Fragment>
          ) : (
            <Phrase
              key={part.key}
              text={part.text}
              tone={part.tone}
              delay={delayFor(pieceIndex.get(part.key) ?? 0)}
            />
          ),
        )}
      </p>
    );

  const skeleton = (rows: number, widths: number[]) => (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="h-7 rounded-2 bg-surface-2 motion-safe:animate-pulse"
          style={{
            width: `${widths[i % widths.length] ?? 60}%`,
            animationDelay: `${i * 70}ms`,
          }}
        />
      ))}
    </div>
  );

  const sectionLabel = (text: string, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL}>{text}</span>
      {extra}
    </div>
  );

  const allChosen =
    columns.length > 0 && columns.every((c) => current.columns.includes(c.id));

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--er-accent" as string]: accentVar,
        ["--er-wash" as string]: `color-mix(in oklab, ${accentVar} 14%, transparent)`,
        ["--er-line" as string]: `color-mix(in oklab, ${accentVar} 45%, transparent)`,
      }}
    >
      <p id={columnsHintId} className="sr-only">
        Space adds or removes a column. Control or Command and A takes them all.
      </p>
      <p id={stripHintId} className="sr-only">
        Alt and an arrow moves a column. Delete removes it. Drag to reorder.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className={cn(LABEL, "mt-0.5")}>Coldbrook Reports</p>
        </div>
        {ready ? (
          <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
            <span className="sr-only">
              {formatInt(est.rows)} {est.rows === 1 ? noun.one : noun.other},{" "}
              {formatBytes(est.bytes)}
            </span>
            <Roll
              value={est.rows}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden className="hidden @min-[24rem]:inline">
              {noun.other}
            </span>
          </p>
        ) : null}
      </header>

      {/* Saved recipes */}
      {ready ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-hairline px-4 py-2">
          <span className={cn(LABEL, "mr-1")}>Saved</span>
          {saved.length === 0 ? (
            <span className="text-[11px] text-ink-3">
              Nothing yet · Save as recipe keeps this one
            </span>
          ) : (
            <div
              role="toolbar"
              aria-label="Saved recipes"
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              <AnimatePresence initial={false}>
                {saved.map((r) => {
                  const on = matchedRecipe?.id === r.id;
                  return (
                    <motion.span
                      key={r.id}
                      layout={motionSafe ? "position" : false}
                      initial={
                        motionSafe
                          ? { opacity: 0, scale: 0.85 }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={{
                        layout: springs.glide,
                        scale: springs.recoil,
                        opacity: { duration: durations.fast },
                      }}
                      className={cn(
                        "inline-flex h-7 max-w-full items-stretch overflow-hidden rounded-full border text-xs transition-colors",
                        on
                          ? "border-(--er-line) bg-(--er-wash)"
                          : "border-hairline-strong",
                      )}
                    >
                      <button
                        ref={recipeNodes.bind(r.id)}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={inert || undefined}
                        tabIndex={activeRecipeId === r.id ? 0 : -1}
                        onFocus={() => setActiveRecipe(r.id)}
                        onClick={() => applyRecipe(r)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Delete" ||
                            event.key === "Backspace"
                          ) {
                            event.preventDefault();
                            removeRecipe(r);
                            return;
                          }
                          navRecipes(event, r.id);
                        }}
                        className={cn(
                          "inline-flex min-w-0 items-center gap-1.5 rounded-l-full pr-1.5 pl-2.5 font-medium whitespace-nowrap",
                          on ? "text-(--er-accent)" : "text-ink-2",
                          inert
                            ? "cursor-not-allowed"
                            : "cursor-pointer hover:bg-surface-1 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        <BookmarkPlus aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </button>
                      <button
                        ref={recipeNodes.bind(`${r.id}:x`)}
                        type="button"
                        aria-label={`Remove recipe ${r.name}`}
                        aria-disabled={inert || undefined}
                        tabIndex={activeRecipeId === `${r.id}:x` ? 0 : -1}
                        onFocus={() => setActiveRecipe(`${r.id}:x`)}
                        onClick={() => removeRecipe(r)}
                        onKeyDown={(event) => navRecipes(event, `${r.id}:x`)}
                        className={cn(
                          "inline-flex items-center rounded-r-full pr-2 pl-1 text-ink-3",
                          inert
                            ? "cursor-not-allowed"
                            : "cursor-pointer hover:bg-surface-1 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    </motion.span>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : null}

      {/* Body */}
      {columns.length === 0 && ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">
            Nothing to export: this report has no columns yet.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain @min-[40rem]:grid-cols-2 @min-[40rem]:overflow-hidden">
          {/* Controls */}
          <div
            className={cn(
              "order-2 flex flex-col border-hairline @min-[40rem]:order-1 @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-r",
              dens.pad,
              dens.gap,
            )}
          >
            {status === "loading" ? (
              <>
                {skeleton(1, [30])}
                {skeleton(4, [100])}
                {skeleton(1, [30])}
                {skeleton(6, [70, 55, 80, 60])}
              </>
            ) : (
              <>
                <section className="flex flex-col gap-2">
                  {sectionLabel("Format")}
                  <RadioRow
                    name="Format"
                    groupId={`${uid}-format`}
                    items={formats.map((f) => ({
                      id: f.id,
                      label: f.label,
                      hint: f.blurb,
                      icon: FORMAT_ICONS[f.id] ?? (
                        <FileText aria-hidden className="size-3.5" />
                      ),
                    }))}
                    value={current.format}
                    onSelect={setFormat}
                    gridClass="grid-cols-2 @min-[56rem]:grid-cols-4"
                    inert={inert}
                    motionSafe={motionSafe}
                    row={dens.row}
                  />
                </section>

                <section className="flex flex-col gap-2">
                  {sectionLabel(
                    "Columns",
                    <button
                      type="button"
                      onClick={toggleAll}
                      aria-disabled={inert || undefined}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] transition-colors",
                        inert
                          ? "cursor-not-allowed text-ink-3"
                          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                        {order.length}/{columns.length}
                      </span>
                      {allChosen ? "Clear all" : "Select all"}
                    </button>,
                  )}
                  <ColumnList
                    columns={columns}
                    chosen={current.columns}
                    onToggle={toggleColumn}
                    onAll={toggleAll}
                    inert={inert}
                    motionSafe={motionSafe}
                    row={dens.row}
                    hintId={columnsHintId}
                  />
                </section>

                <section className="flex flex-col gap-2">
                  {sectionLabel("Period")}
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: fromId, key: "from", text: "From" },
                        { id: toId, key: "to", text: "To" },
                      ] as const
                    ).map((f) => (
                      <label
                        key={f.key}
                        className="flex min-w-0 flex-col gap-1"
                      >
                        <span className={LABEL}>{f.text}</span>
                        <input
                          id={f.id}
                          type="date"
                          value={current[f.key]}
                          disabled={inert}
                          min={f.key === "to" ? current.from : undefined}
                          max={f.key === "from" ? current.to : now}
                          onChange={(event) => {
                            const v = event.target.value;
                            if (!v) return;
                            if (f.key === "from") setRange(v, current.to);
                            else setRange(current.from, v);
                          }}
                          className={cn(
                            "w-full min-w-0 rounded-2 border border-hairline bg-surface-0 px-2 font-mono text-xs text-foreground",
                            dens.row,
                            inert && "cursor-not-allowed",
                            FOCUS_RING,
                          )}
                        />
                      </label>
                    ))}
                  </div>
                  <ChipBar
                    name="Period presets"
                    items={presets}
                    pressed={(id) => activePreset?.id === id}
                    onPress={(id) => {
                      const p = presets.find((x) => x.id === id);
                      if (p) setRange(p.from, p.to, `Period: ${p.label}`);
                    }}
                    inert={inert}
                    row="h-6"
                  />
                </section>

                <section className="flex flex-col gap-2">
                  {sectionLabel(
                    "Filters",
                    <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                      {current.filters.length === 0
                        ? "none"
                        : `${current.filters.length} on`}
                    </span>,
                  )}
                  <ChipBar
                    name="Filters"
                    items={filters}
                    pressed={(id) => current.filters.includes(id)}
                    onPress={toggleFilter}
                    inert={inert}
                    row={density === "compact" ? "h-6" : "h-7"}
                  />
                </section>

                <section className="flex flex-col gap-2">
                  {sectionLabel("Delivery")}
                  <RadioRow
                    name="Delivery"
                    groupId={`${uid}-delivery`}
                    items={(
                      Object.keys(DELIVERY_WORDS) as ExportDelivery[]
                    ).map((d) => ({
                      id: d,
                      label: DELIVERY_WORDS[d].label,
                      icon: DELIVERY_ICONS[d],
                    }))}
                    value={current.delivery}
                    onSelect={setDelivery}
                    gridClass="grid-cols-3"
                    inert={inert}
                    motionSafe={motionSafe}
                    row={dens.row}
                  />
                </section>
              </>
            )}
          </div>

          {/* Recipe */}
          <div
            className={cn(
              "order-1 flex flex-col border-b border-hairline bg-surface-0/40 @min-[40rem]:order-2 @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-b-0",
              dens.pad,
              dens.gap,
            )}
          >
            {status === "loading" ? (
              <>
                {skeleton(3, [95, 80, 45])}
                <div aria-hidden className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <span
                      key={i}
                      className="h-12 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
                {skeleton(1, [30])}
                <div aria-hidden className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span
                      key={i}
                      className="h-14 w-[7.75rem] rounded-2 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${i * 60}ms` }}
                    />
                  ))}
                </div>
              </>
            ) : status === "error" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                <TriangleAlert aria-hidden className="size-5 text-danger" />
                <p className="text-sm text-foreground">
                  The estimate didn&apos;t load.
                </p>
                <p className="text-xs text-ink-3">
                  The recipe can&apos;t be sized or run until it does.
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
              <>
                <section className="flex flex-col gap-2">
                  {sectionLabel("Recipe")}
                  {sentence}
                </section>

                <section
                  aria-label="Estimate"
                  className="grid grid-cols-3 gap-2"
                >
                  {[
                    {
                      key: "rows",
                      label: "Rows",
                      node: (
                        <Roll
                          value={est.rows}
                          motionSafe={motionSafe}
                          className="font-mono text-[15px]"
                        />
                      ),
                      text: formatInt(est.rows),
                    },
                    {
                      key: "size",
                      label: "Size",
                      node: (
                        <span className="font-mono text-[15px]">
                          <Phrase
                            text={formatBytes(est.bytes)}
                            tone="accent"
                            delay={0}
                          />
                        </span>
                      ),
                      text: formatBytes(est.bytes),
                    },
                    {
                      key: "cols",
                      label: "Columns",
                      node: (
                        <Roll
                          value={order.length}
                          motionSafe={motionSafe}
                          className="font-mono text-[15px]"
                        />
                      ),
                      text: String(order.length),
                    },
                  ].map((tile) => (
                    <div
                      key={tile.key}
                      className="flex min-w-0 flex-col gap-0.5 rounded-2 border border-hairline bg-card px-2.5 py-2"
                    >
                      <span className={LABEL}>{tile.label}</span>
                      <span className="sr-only">{tile.text}</span>
                      <span className="truncate leading-none text-foreground">
                        {tile.node}
                      </span>
                    </div>
                  ))}
                </section>

                <section className="flex flex-col gap-2">
                  {sectionLabel(
                    "Column order",
                    <span className="hidden text-[10px] text-ink-3 @min-[30rem]:inline">
                      drag · Alt+arrows
                    </span>,
                  )}
                  <PreviewStrip
                    order={order}
                    byId={byId}
                    onMove={moveColumn}
                    onRemove={toggleColumn}
                    onAll={toggleAll}
                    inert={inert}
                    motionSafe={motionSafe}
                    live={live}
                    hintId={stripHintId}
                    text={`${order.length} ${order.length === 1 ? "column" : "columns"} in export order`}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer: save, run, progress */}
      <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[-1px] h-0.5 overflow-hidden"
        >
          <motion.span
            className="block h-full w-full origin-left bg-(--er-accent)"
            initial={false}
            animate={{
              scaleX:
                run.phase === "running"
                  ? run.fraction
                  : run.phase === "done"
                    ? 1
                    : 0,
              opacity: run.phase === "running" || run.phase === "done" ? 1 : 0,
            }}
            transition={{
              scaleX: motionSafe ? springs.glide : { duration: durations.fast },
              opacity: {
                duration: durations.base,
                ease: run.phase === "idle" ? easings.exit : easings.enter,
              },
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          {run.phase === "running" ? (
            <div
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(run.fraction * 100)}
              aria-valuetext={`Writing ${formatInt(est.rows)} ${est.rows === 1 ? noun.one : noun.other}, ${Math.round(run.fraction * 100)} percent`}
              className={cn(LABEL, "flex items-center gap-2")}
            >
              <span className="text-(--er-accent)">Writing</span>
              <span className="tabular-nums">
                {Math.round(run.fraction * 100)}%
              </span>
              <span className="hidden truncate @min-[30rem]:inline">
                {fileName}
              </span>
            </div>
          ) : run.phase === "done" ? (
            <p className={cn(LABEL, "flex min-w-0 items-center gap-2")}>
              <span className="text-success">Done</span>
              <span className="truncate">
                {formatInt(run.result.rows)} rows ·{" "}
                {formatBytes(run.result.bytes)} ·{" "}
                {DELIVERY_WORDS[current.delivery].done}
              </span>
            </p>
          ) : run.phase === "failed" ? (
            <p className={cn(LABEL, "flex min-w-0 items-center gap-2")}>
              <span className="text-danger">Failed</span>
              <span className="truncate normal-case">{run.message}</span>
            </p>
          ) : (
            <p className={cn(LABEL, "flex min-w-0 items-center gap-2")}>
              <span
                className={
                  ready && order.length > 0 && est.rows > 0
                    ? "text-(--er-accent)"
                    : "text-ink-3"
                }
              >
                {!ready
                  ? status === "loading"
                    ? "Loading"
                    : "Unavailable"
                  : order.length === 0
                    ? "No columns"
                    : est.rows === 0
                      ? "Nothing to export"
                      : "Ready"}
              </span>
              {ready && order.length > 0 && est.rows > 0 ? (
                <span className="hidden truncate @min-[30rem]:inline">
                  {fileName}
                </span>
              ) : null}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={saveRecipe}
            aria-disabled={inert || matchedRecipe !== undefined || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs transition-colors",
              inert || matchedRecipe
                ? "cursor-default text-ink-3"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <BookmarkPlus aria-hidden className="size-3.5" />
            <span className="hidden @min-[24rem]:inline">
              {matchedRecipe ? "Saved" : "Save as recipe"}
            </span>
            <span className="@min-[24rem]:hidden">
              {matchedRecipe ? "Saved" : "Save"}
            </span>
          </button>

          <AnimatePresence initial={false} mode="popLayout">
            {run.phase === "done" && current.delivery === "download" ? (
              <motion.button
                key="download"
                type="button"
                onClick={() => {
                  if (run.phase === "done") onDownload?.(run.result);
                }}
                {...landing}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90",
                  FOCUS_RING,
                )}
              >
                <Tick motionSafe={motionSafe} delay={durations.fast} />
                Download
                <span className="sr-only"> {run.result.file}</span>
              </motion.button>
            ) : run.phase === "done" ? (
              <motion.span
                key="sent"
                {...landing}
                className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-(--er-line) bg-(--er-wash) px-3 text-xs font-medium text-(--er-accent)"
              >
                <Tick motionSafe={motionSafe} delay={durations.fast} />
                {current.delivery === "email" ? "Sent" : "Saved"}
              </motion.span>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => {
              void startRun();
            }}
            aria-disabled={!canRun || undefined}
            whileTap={canRun && motionSafe ? { scale: 0.97 } : undefined}
            transition={springs.flick}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
              run.phase === "done"
                ? "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : canRun
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "cursor-default border border-hairline text-ink-3",
              running && "cursor-wait",
              FOCUS_RING,
            )}
          >
            {running ? (
              <RotateCcw
                aria-hidden
                className="size-3.5 motion-safe:animate-spin"
              />
            ) : run.phase === "failed" ? (
              <RotateCcw aria-hidden className="size-3.5" />
            ) : (
              <Play aria-hidden className="size-3.5" />
            )}
            {running
              ? "Exporting"
              : run.phase === "done"
                ? "Run again"
                : run.phase === "failed"
                  ? "Try again"
                  : "Run export"}
          </motion.button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
