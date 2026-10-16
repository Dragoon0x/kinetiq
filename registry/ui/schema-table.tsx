"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Calendar,
  Check,
  ChevronDown,
  CircleDollarSign,
  GripVertical,
  Hash,
  List,
  Pencil,
  Plus,
  RotateCcw,
  SquareCheck,
  Table2,
  Trash2,
  TriangleAlert,
  Type,
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
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ------------------------------------------------------------------------- */
/*                                   Types                                    */
/* ------------------------------------------------------------------------- */

export type SchemaFieldType =
  "text" | "number" | "currency" | "date" | "select" | "checkbox" | "email";
export type SchemaBadge = "icon" | "label" | "both";
export type SchemaDensity = "compact" | "regular" | "roomy";
export type SchemaStatus = "ready" | "loading" | "error";
export type SchemaValue = string | number | boolean | null;

export type SchemaFieldOptions = {
  /** Currency fields: an ISO code. @default "GBP" */
  currency?: string;
  /** Number and currency fields: places after the point. @default 2 for currency, 0 for numbers */
  decimals?: number;
  /** Date fields: "14 Mar 2026" or "14/03/2026". @default "long" */
  dateStyle?: "long" | "short";
  /** Select fields: the choices, in order. */
  choices?: string[];
};

export type SchemaField = {
  id: string;
  name: string;
  type: SchemaFieldType;
  options?: SchemaFieldOptions;
};

/** One sample record: a value per field id. Dates are ISO strings, money and numbers are numbers. */
export type SchemaRow = { id: string; cells: Record<string, SchemaValue> };

export type SchemaTableProps = {
  /** How a field's type shows in its header: a glyph, a word, or both. @default "both" */
  typeBadge?: SchemaBadge;
  /** Row height, type size and column width: 30/36/44px rows. @default "regular" */
  density?: SchemaDensity;
  /** The editor's colour: the active field, the drop slot, Convert, and where select-chip hues start. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled fields, in column order. */
  fields?: SchemaField[];
  /** Initial fields when uncontrolled. @default defaultSchemaFields */
  defaultFields?: SchemaField[];
  /** Fires with every field after a rename, a confirmed type change, an option, a move, an add or a removal. */
  onFieldsChange?: (fields: SchemaField[]) => void;
  /** Controlled sample rows. */
  sampleRows?: SchemaRow[];
  /** Initial rows when uncontrolled. @default defaultSchemaRows */
  defaultSampleRows?: SchemaRow[];
  /** Fires with the rows after a conversion rewrote a column, or a field was added or removed. */
  onSampleRowsChange?: (rows: SchemaRow[]) => void;
  /** A field was renamed, re-typed (after Convert) or given new options. */
  onFieldChange?: (field: SchemaField, previous: SchemaField) => void;
  /** "+ Field" added a field. */
  onAddField?: (field: SchemaField) => void;
  /** A field was removed. */
  onRemoveField?: (field: SchemaField) => void;
  /** How many records the whole table holds; the sample is a few of them. @default 1284 */
  totalRows?: number;
  /** The table's name. @default "Equipment register" */
  title?: string;
  /** Whether the schema has arrived. @default "ready" */
  status?: SchemaStatus;
  /** "Try again" was pressed after the schema failed to load. */
  onRetry?: () => void;
  /** The editor's height, px; the table scrolls inside it. @default 540 */
  height?: number;
  /** Read only: fields can be browsed but not changed, moved, added or removed. @default false */
  disabled?: boolean;
  /** Classes for the editor's outer box. */
  className?: string;
};

/* ------------------------------------------------------------------------- */
/*                               Seeded defaults                              */
/* ------------------------------------------------------------------------- */

/** The Fieldline equipment register, mid-migration: two columns still hold text that wants a type. */
export const defaultSchemaFields: SchemaField[] = [
  { id: "tag", name: "Asset tag", type: "text" },
  { id: "item", name: "Item", type: "text" },
  { id: "serviced", name: "Serviced", type: "text" },
  { id: "cost", name: "Cost", type: "number", options: { decimals: 2 } },
  {
    id: "status",
    name: "Status",
    type: "select",
    options: { choices: ["In use", "Spare", "Repair"] },
  },
  { id: "insured", name: "Insured", type: "text" },
];

const ROWS: [string, string, string, number, string, string][] = [
  ["FL-0142", "Pressure washer", "2026-03-14", 1240, "In use", "yes"],
  ["FL-0157", "Trench pump", "14 Mar 2026", 389.5, "Spare", "no"],
  ["FL-0163", "Cable locator", "last spring", 72, "Repair", "Y"],
  ["FL-0171", "Generator 6 kVA", "2026-07-02", 2150, "In use", "pending"],
  ["FL-0188", "Laser level", "02/09/2026", 640, "In use", "yes"],
  ["FL-0203", "Core drill", "2026-05-21", 1785, "Spare", "no"],
];

export const defaultSchemaRows: SchemaRow[] = ROWS.map((r) => ({
  id: r[0].toLowerCase(),
  cells: {
    tag: r[0],
    item: r[1],
    serviced: r[2],
    cost: r[3],
    status: r[4],
    insured: r[5],
  },
}));

/* ------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* ------------------------------------------------------------------------- */

const TYPES: {
  type: SchemaFieldType;
  name: string;
  Icon: typeof Type;
}[] = [
  { type: "text", name: "Text", Icon: Type },
  { type: "number", name: "Number", Icon: Hash },
  { type: "currency", name: "Currency", Icon: CircleDollarSign },
  { type: "date", name: "Date", Icon: Calendar },
  { type: "select", name: "Select", Icon: List },
  { type: "checkbox", name: "Checkbox", Icon: SquareCheck },
  { type: "email", name: "Email", Icon: AtSign },
];
const typeInfo = (t: SchemaFieldType) =>
  TYPES.find((x) => x.type === t) ?? TYPES[0]!;

const DENSITY: Record<
  SchemaDensity,
  { row: number; text: string; col: number; pad: string }
> = {
  compact: { row: 30, text: "text-[12px]", col: 144, pad: "px-2.5" },
  regular: { row: 36, text: "text-[13px]", col: 160, pad: "px-3" },
  roomy: { row: 44, text: "text-[13px]", col: 176, pad: "px-3.5" },
};

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const pigment = (accent: string, l = 0.6) => `oklch(from ${accent} ${l} c h)`;
const wash = (accent: string, pct: number) =>
  `color-mix(in oklab, ${accent} ${pct}%, transparent)`;

const STARTER: SchemaField = { id: "name", name: "Name", type: "text" };

/** Digits grouped by hand: Intl differs between Node and browsers at the edges. */
function grouped(n: number, decimals: number): string {
  const sign = n < 0 ? "-" : "";
  const [int = "0", frac] = Math.abs(n).toFixed(decimals).split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withCommas}${frac ? `.${frac}` : ""}`;
}

function isoParts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function dateText(iso: string, style: "long" | "short") {
  const p = isoParts(iso);
  if (!p) return iso;
  const [y, m, d] = p;
  return style === "short"
    ? `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
    : `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}

/** Plain text for any value of a field, as a person would type it. */
function asText(v: SchemaValue, f: SchemaField): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    return f.type === "currency"
      ? v.toFixed(f.options?.decimals ?? 2)
      : String(v);
  }
  if (f.type === "date") return dateText(v, f.options?.dateStyle ?? "long");
  return v;
}

function parseNumber(text: string): number | null {
  const t = text
    .trim()
    .replace(/^[£$€]/, "")
    .replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
}

function parseDate(text: string): string | null {
  const t = text.trim();
  if (isoParts(t)) return t;
  const long = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(t);
  if (long) {
    const m = MONTHS.findIndex(
      (x) => x.toLowerCase() === (long[2] ?? "").toLowerCase(),
    );
    if (m >= 0) {
      return `${long[3]}-${String(m + 1).padStart(2, "0")}-${String(long[1]).padStart(2, "0")}`;
    }
  }
  const short = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (short) {
    const d = Number(short[1]);
    const m = Number(short[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${short[3]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

type Converted =
  { ok: true; value: SchemaValue } | { ok: false; reason: string };

/** What a value becomes under a new type — or why it cannot. Pure, so a preview costs nothing. */
function convert(
  v: SchemaValue,
  from: SchemaField,
  to: SchemaFieldType,
): Converted {
  if (v === null || v === "") return { ok: true, value: null };
  const text = asText(v, from);
  const quoted = `“${text}”`;
  switch (to) {
    case "text":
      return { ok: true, value: text };
    case "number":
    case "currency": {
      if (typeof v === "number") {
        return { ok: true, value: to === "currency" ? r2(v) : v };
      }
      if (typeof v === "boolean") {
        return {
          ok: false,
          reason: `A tick is not ${to === "currency" ? "an amount" : "a number"}`,
        };
      }
      const n = parseNumber(text);
      return n === null
        ? {
            ok: false,
            reason: `${quoted} is not ${to === "currency" ? "an amount" : "a number"}`,
          }
        : { ok: true, value: to === "currency" ? r2(n) : n };
    }
    case "date": {
      if (typeof v !== "string")
        return { ok: false, reason: `${quoted} is not a date` };
      const iso = parseDate(from.type === "date" ? v : text);
      return iso
        ? { ok: true, value: iso }
        : { ok: false, reason: `${quoted} is not a date` };
    }
    case "select":
      return { ok: true, value: text };
    case "checkbox": {
      if (typeof v === "boolean") return { ok: true, value: v };
      const t = text.trim().toLowerCase();
      if (["yes", "y", "true", "1", "✓"].includes(t))
        return { ok: true, value: true };
      if (["no", "n", "false", "0"].includes(t))
        return { ok: true, value: false };
      return { ok: false, reason: `${quoted} is not yes or no` };
    }
    default:
      return EMAIL.test(text.trim())
        ? { ok: true, value: text.trim() }
        : { ok: false, reason: `${quoted} is not an address` };
  }
}

/** The options a field takes on when it becomes `to`, kept from what it had. */
function optionsFor(
  field: SchemaField,
  to: SchemaFieldType,
  values: SchemaValue[],
): SchemaFieldOptions | undefined {
  const o = field.options ?? {};
  switch (to) {
    case "currency":
      return {
        currency: o.currency ?? "GBP",
        decimals:
          o.decimals === undefined || field.type !== "currency"
            ? 2
            : o.decimals,
      };
    case "number":
      return {
        decimals:
          field.type === "currency" ? (o.decimals ?? 2) : (o.decimals ?? 0),
      };
    case "date":
      return { dateStyle: o.dateStyle ?? "long" };
    case "select": {
      const seen: string[] = [];
      for (const v of values) {
        if (typeof v === "string" && v && !seen.includes(v)) seen.push(v);
      }
      return { choices: seen };
    }
    default:
      return undefined;
  }
}

function summary(f: SchemaField): string {
  const o = f.options ?? {};
  switch (f.type) {
    case "number":
      return `${o.decimals ?? 0} dp`;
    case "currency":
      return `${o.currency ?? "GBP"} · ${o.decimals ?? 2} dp`;
    case "date":
      return (o.dateStyle ?? "long") === "long" ? "Long dates" : "Short dates";
    case "select":
      return plural(o.choices?.length ?? 0, "option", "options");
    case "checkbox":
      return "Yes / No";
    case "email":
      return "name@domain";
    default:
      return "Plain";
  }
}

/* ------------------------------------------------------------------------- */
/*                                   Cells                                    */
/* ------------------------------------------------------------------------- */

function Value({
  v,
  field,
  accent,
}: {
  v: SchemaValue;
  field: SchemaField;
  accent: string;
}) {
  if (v === null || v === "") return <span className="text-ink-3">—</span>;
  switch (field.type) {
    case "number":
      return typeof v === "number" ? (
        <span className="tabular-nums">
          {grouped(v, field.options?.decimals ?? 0)}
        </span>
      ) : (
        <span>{String(v)}</span>
      );
    case "currency": {
      const code = field.options?.currency ?? "GBP";
      return typeof v === "number" ? (
        <span className="tabular-nums">
          <span className="text-ink-3">{SYMBOL[code] ?? `${code} `}</span>
          {grouped(v, field.options?.decimals ?? 2)}
        </span>
      ) : (
        <span>{String(v)}</span>
      );
    }
    case "date":
      return typeof v === "string" && isoParts(v) ? (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2 text-[12px] tabular-nums">
          <Calendar aria-hidden className="size-3 shrink-0 text-ink-3" />
          {dateText(v, field.options?.dateStyle ?? "long")}
        </span>
      ) : (
        <span>{String(v)}</span>
      );
    case "select": {
      const text = String(v);
      const at = Math.max(0, field.options?.choices?.indexOf(text) ?? 0);
      const hue = `oklch(from ${accent} 0.62 0.12 calc(h + ${at * 70}))`;
      return (
        <span
          className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-foreground"
          style={{ backgroundColor: wash(hue, 16) }}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: hue }}
          />
          <span className="truncate">{text}</span>
        </span>
      );
    }
    case "checkbox":
      return typeof v === "boolean" ? (
        <span
          role="img"
          aria-label={v ? "Yes" : "No"}
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-1 border",
            v ? "border-transparent text-white" : "border-hairline-strong",
          )}
          style={v ? { backgroundColor: pigment(accent, 0.58) } : undefined}
        >
          {v ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
        </span>
      ) : (
        <span>{String(v)}</span>
      );
    case "email":
      return (
        <span className="truncate font-mono text-[12px] text-ink-2">
          {String(v)}
        </span>
      );
    default:
      return <span className="truncate">{String(v)}</span>;
  }
}

type Shown = {
  key: string;
  v: SchemaValue;
  field: SchemaField;
  fail: string | null;
};

/**
 * One sample cell. Its content is keyed by the type it is drawn as, so a
 * conversion swaps it: the old drawing lifts and fades while the new one rises
 * and grows from 0.94 on snap, a row's delay down the column.
 */
function Cell({
  shown,
  accent,
  delay,
  motionSafe,
  align,
}: {
  shown: Shown;
  accent: string;
  delay: number;
  motionSafe: boolean;
  align: "start" | "end";
}) {
  return (
    <span
      className="relative flex min-w-0 flex-1 items-center overflow-hidden"
      style={{ justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={shown.key}
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            shown.fail && "rounded-1 px-1",
          )}
          style={
            shown.fail
              ? {
                  backgroundImage: `repeating-linear-gradient(135deg, ${wash("var(--danger)", 14)} 0 4px, transparent 4px 8px)`,
                }
              : undefined
          }
          initial={{
            opacity: 0,
            y: motionSafe ? distances.nudge : 0,
            scale: motionSafe ? 0.94 : 1,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.nudge : 0,
            transition: {
              ...exitFor(durations.fast),
              delay: motionSafe ? delay : 0,
            },
          }}
          transition={
            motionSafe
              ? {
                  y: { ...springs.snap, delay: delay + 0.05 },
                  scale: { ...springs.snap, delay: delay + 0.05 },
                  opacity: {
                    duration: durations.fast,
                    ease: easings.enter,
                    delay: delay + 0.05,
                  },
                }
              : { duration: durations.fast }
          }
        >
          {shown.fail ? (
            <>
              <TriangleAlert
                aria-hidden
                className="size-3 shrink-0 text-danger"
              />
              <span className="truncate text-ink-3 line-through decoration-danger/60">
                {asText(shown.v, shown.field)}
              </span>
            </>
          ) : (
            <Value v={shown.v} field={shown.field} accent={accent} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The type badge: glyph, word or both; the word rolls on snap when the type changes. */
function Badge({
  type,
  look,
  motionSafe,
  pending,
  accent,
}: {
  type: SchemaFieldType;
  look: SchemaBadge;
  motionSafe: boolean;
  pending: boolean;
  accent: string;
}) {
  const info = typeInfo(type);
  return (
    <span
      className={cn(
        "relative inline-flex h-5 shrink-0 items-center gap-1 overflow-hidden rounded-1 px-1 text-[10px] font-medium tracking-[0.04em] uppercase",
        !pending && "bg-surface-2 text-ink-2",
      )}
      style={
        pending
          ? { backgroundColor: wash(accent, 14), color: accent }
          : undefined
      }
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={type}
          className="inline-flex items-center gap-1"
          initial={{ opacity: 0, y: motionSafe ? 10 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -10 : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {look !== "label" ? (
            <info.Icon aria-hidden className="size-3 shrink-0" />
          ) : null}
          {look !== "icon" ? (
            info.name
          ) : (
            <span className="sr-only">{info.name}</span>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 The editor                                 */
/* ------------------------------------------------------------------------- */

type Preview = {
  n: number;
  fieldId: string;
  to: SchemaFieldType;
  results: Record<string, Converted>;
};

type Menu = {
  fieldId: string;
  view: "table" | "list";
  x: number;
  y: number;
  /** Room left inside the editor; a taller menu scrolls. */
  maxH: number;
  above: boolean;
  sub: "main" | "options";
  confirmRemove: boolean;
} | null;

type Ghost = { field: SchemaField; index: number; n: number };

/** Drag hooks a field header calls; the editor owns the geometry. */
type DragHooks = {
  start: (id: string, view: "table" | "list", x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (velocity: number) => void;
  cancel: () => void;
};

function Grip({
  id,
  view,
  disabled,
  hooks,
}: {
  id: string;
  view: "table" | "list";
  disabled: boolean;
  hooks: DragHooks;
}) {
  const drag = useDrag({
    axis: view === "table" ? "x" : "y",
    threshold: 3,
    disabled,
    // The drag is measured from where the press began, not from where the
    // threshold was crossed, so the column stays exactly under the hand.
    onStart: ({ point, offset }) =>
      hooks.start(id, view, point.x - offset.x, point.y - offset.y),
    onMove: ({ point }) => hooks.move(point.x, point.y),
    onEnd: ({ velocity }) =>
      hooks.end(view === "table" ? velocity.x : velocity.y),
    onCancel: () => hooks.cancel(),
  });
  // A grip is small: a quick pull leaves it before the first move lands, so
  // once pressed it listens on the window rather than on itself.
  const detach = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => detach.current?.(), []);
  return (
    <span
      aria-hidden
      onPointerDown={(e) => {
        if (disabled) return;
        if (e.pointerType === "mouse") e.preventDefault();
        detach.current?.();
        drag.onPointerDown(e);
        const as = (ev: PointerEvent) => ev as unknown as React.PointerEvent;
        const move = (ev: PointerEvent) => drag.onPointerMove(as(ev));
        const up = (ev: PointerEvent) => {
          drag.onPointerUp(as(ev));
          detach.current?.();
        };
        const cancel = (ev: PointerEvent) => {
          drag.onPointerCancel(as(ev));
          detach.current?.();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        detach.current = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
          detach.current = null;
        };
      }}
      className={cn(
        "flex size-6 shrink-0 touch-none items-center justify-center rounded-1 text-ink-3 transition-colors select-none",
        disabled
          ? "opacity-40"
          : "cursor-grab hover:bg-surface-2 hover:text-foreground active:cursor-grabbing",
      )}
    >
      <GripVertical className="size-3.5" />
    </span>
  );
}

/**
 * A database schema editor: each field's name, type and options sit above
 * its sample column, so a change of type is something you can watch.
 *
 * Picking a new type previews first. The column converts one cell at a time
 * down the rows — the old drawing lifts and fades while the new one rises and
 * grows on snap, text becoming date chips, numbers gaining their currency and
 * cents, "yes" becoming a tick — and a cell that will not convert keeps its
 * text, struck faint on a danger hatch, with the reason in its name. A
 * confirm bar glides down with the count; Convert commits (the failures empty
 * out) and Cancel converts back, bottom row first.
 *
 * Fields reorder by their grip — the column follows the hand 1:1 while the
 * others slide aside on glide, and on release every column glides to its new
 * place carrying the throw — or by Alt with an arrow on the field's button.
 * "+ Field" grows a new column on glide; removing one collapses it. Below a
 * 40rem container the fields become a list of cards with the same controls.
 * Under reduced motion every swap is a short cross-fade and every move lands
 * at once; failure marks and counts are unchanged.
 */
export function SchemaTable({
  typeBadge = "both",
  density = "regular",
  accent = "var(--accent-bright)",
  fields,
  defaultFields,
  onFieldsChange,
  sampleRows,
  defaultSampleRows,
  onSampleRowsChange,
  onFieldChange,
  onAddField,
  onRemoveField,
  totalRows = 1284,
  title = "Equipment register",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: SchemaTableProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const barId = `${uid}-bar`;
  const ready = status === "ready";
  const locked = disabled || !ready;
  const d = DENSITY[density] ?? DENSITY.regular;

  /* --------------------------------- state -------------------------------- */

  const [ownFields, setOwnFields] = React.useState<SchemaField[]>(
    () => defaultFields ?? defaultSchemaFields,
  );
  const rawFields = fields ?? ownFields;
  const list = rawFields.length > 0 ? rawFields : [STARTER];
  const [ownRows, setOwnRows] = React.useState<SchemaRow[]>(
    () => defaultSampleRows ?? defaultSchemaRows,
  );
  const rows = sampleRows ?? ownRows;

  const [rove, setRove] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  /** A cancelled preview converting back: drawn as the original, bottom row first. */
  const [unwind, setUnwind] = React.useState<{
    fieldId: string;
    n: number;
  } | null>(null);
  const [menu, setMenu] = React.useState<Menu>(null);
  const [menuIndex, setMenuIndex] = React.useState(0);
  const [renaming, setRenaming] = React.useState<{
    id: string;
    value: string;
  } | null>(null);
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [dragging, setDragging] = React.useState<{
    id: string;
    target: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  /** The table's scroller, and whether more columns wait past its right edge. */
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const [moreRight, setMoreRight] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const heads = React.useRef(new Map<string, HTMLElement>());
  const cards = React.useRef(new Map<string, HTMLElement>());
  const flights = React.useRef(new Map<string, AnimationPlaybackControls>());
  const counter = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const session = React.useRef<{
    id: string;
    view: "table" | "list";
    order: string[];
    starts: Map<string, number>;
    sizes: Map<string, number>;
    origin: number;
    last: number;
    target: number;
  } | null>(null);
  const flip = React.useRef<{
    key: string;
    view: "table" | "list";
    before: Map<string, number>;
    velocity: { id: string; v: number } | null;
  } | null>(null);

  // Offsets live outside React: one per field, read by its header, cells and card.
  const [offsetFor] = React.useState(() => {
    const cache = new Map<string, MotionValue<number>>();
    return (id: string) => {
      let v = cache.get(id);
      if (!v) {
        v = motionValue(0);
        cache.set(id, v);
      }
      return v;
    };
  });

  const step = cascade(rows.length);

  /* -------------------------------- writes -------------------------------- */

  const writeFields = (next: SchemaField[]) => {
    if (fields === undefined) setOwnFields(next);
    onFieldsChange?.(next);
  };
  const writeRows = (next: SchemaRow[]) => {
    if (sampleRows === undefined) setOwnRows(next);
    onSampleRowsChange?.(next);
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const visibleView = (): "table" | "list" => {
    const t = tableRef.current;
    return t && t.getClientRects().length > 0 ? "table" : "list";
  };

  /** Where every field is drawn right now, transforms included. */
  const drawnStarts = (view: "table" | "list") => {
    const out = new Map<string, number>();
    const nodes = view === "table" ? heads.current : cards.current;
    for (const [id, node] of nodes) {
      const r = node.getBoundingClientRect();
      out.set(id, view === "table" ? r.left : r.top);
    }
    return out;
  };

  const reorder = (
    next: SchemaField[],
    velocity: { id: string; v: number } | null = null,
  ) => {
    const view = visibleView();
    flip.current = {
      key: next.map((f) => f.id).join("|"),
      view,
      before: drawnStarts(view),
      velocity,
    };
    writeFields(next);
  };

  /* ------------------------------- effects -------------------------------- */

  const orderKey = list.map((f) => f.id).join("|");
  React.useLayoutEffect(() => {
    const req = flip.current;
    if (!req) return;
    flip.current = null;
    if (req.key !== orderKey) return;
    const nodes = req.view === "table" ? heads.current : cards.current;
    const after = new Map<string, number>();
    for (const [id, node] of nodes) {
      const r = node.getBoundingClientRect();
      const v = offsetFor(id).get();
      after.set(id, (req.view === "table" ? r.left : r.top) - v);
    }
    for (const [id, start] of after) {
      const was = req.before.get(id);
      const off = offsetFor(id);
      flights.current.get(id)?.stop();
      if (was === undefined || !motionSafe) {
        off.jump(0);
        continue;
      }
      off.jump(r2(was - start));
      flights.current.set(
        id,
        animate(off, 0, {
          ...springs.glide,
          velocity: req.velocity?.id === id ? req.velocity.v : 0,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  React.useEffect(() => {
    const pending = timers.current;
    const running = flights.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!scroller) return;
    const check = () =>
      setMoreRight(
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1,
      );
    check();
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    const inner = scroller.firstElementChild;
    if (inner) ro.observe(inner);
    scroller.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", check);
    };
  }, [scroller]);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        `[data-st-focus="${CSS.escape(focusAsk.key)}"]`,
      ) ?? [],
    ).find((n) => n.getClientRects().length > 0);
    if (!node) return;
    node.focus({ preventScroll: false });
    if (node instanceof HTMLInputElement) node.select();
  }, [focusAsk]);

  // The menu's active item takes focus as it moves.
  React.useEffect(() => {
    if (!menu) return;
    const items =
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    items?.[menuIndex]?.focus({ preventScroll: true });
  }, [menu, menuIndex]);

  // A menu closes when the pointer goes down anywhere else.
  React.useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest("[data-st-menu]") || t.closest("[data-st-field]"))
      )
        return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  /* ------------------------------- actions -------------------------------- */

  const fieldById = (id: string) => list.find((f) => f.id === id);

  const startPreview = (fieldId: string, to: SchemaFieldType) => {
    const field = fieldById(fieldId);
    if (!field || locked) return;
    setMenu(null);
    if (to === field.type) {
      say(`${field.name} is already ${typeInfo(to).name.toLowerCase()}.`);
      ask(`field:${fieldId}`);
      return;
    }
    const results: Record<string, Converted> = {};
    for (const r of rows)
      results[r.id] = convert(r.cells[fieldId] ?? null, field, to);
    const failed = Object.values(results).filter((x) => !x.ok).length;
    counter.current += 1;
    setUnwind(null);
    setPreview({ n: counter.current, fieldId, to, results });
    ask("convert");
    say(
      `${field.name} as ${typeInfo(to).name}: ${plural(rows.length - failed, "cell converts", "cells convert")}${failed > 0 ? `, ${plural(failed, "cell", "cells")} will be cleared` : ""}. Convert or Cancel.`,
    );
  };

  const cancelPreview = () => {
    const p = preview;
    if (!p) return;
    setPreview(null);
    counter.current += 1;
    const n = counter.current;
    setUnwind({ fieldId: p.fieldId, n });
    later(() => setUnwind((u) => (u?.n === n ? null : u)), 900);
    ask(`field:${p.fieldId}`);
    say("Kept as it was.");
  };

  const confirmPreview = () => {
    const p = preview;
    if (!p || locked) return;
    const field = fieldById(p.fieldId);
    if (!field) return;
    const values: SchemaValue[] = [];
    const nextRows = rows.map((r) => {
      const res = p.results[r.id];
      const value = res && res.ok ? res.value : null;
      values.push(value);
      return { ...r, cells: { ...r.cells, [p.fieldId]: value } };
    });
    const next: SchemaField = {
      ...field,
      type: p.to,
      options: optionsFor(field, p.to, values),
    };
    const failed = Object.values(p.results).filter((x) => !x.ok).length;
    setPreview(null);
    writeRows(nextRows);
    writeFields(list.map((f) => (f.id === field.id ? next : f)));
    onFieldChange?.(next, field);
    ask(`field:${field.id}`);
    say(
      `${field.name} is now ${typeInfo(p.to).name.toLowerCase()}.${failed > 0 ? ` ${plural(failed, "cell", "cells")} cleared.` : ""}`,
    );
  };

  const move = (id: string, delta: -1 | 1) => {
    if (locked) return;
    const at = list.findIndex((f) => f.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(at, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder(next);
    say(`${item.name} moved to ${to + 1} of ${list.length}.`);
    ask(`field:${id}`);
  };

  const addField = () => {
    if (locked) return;
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-f${counter.current}`;
    } while (list.some((f) => f.id === id));
    const field: SchemaField = { id, name: "Untitled field", type: "text" };
    writeFields([...list, field]);
    writeRows(rows.map((r) => ({ ...r, cells: { ...r.cells, [id]: null } })));
    setFresh((s) => new Set(s).add(id));
    later(
      () =>
        setFresh((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        }),
      700,
    );
    setRenaming({ id, value: field.name });
    ask("rename");
    onAddField?.(field);
    say(`Field added at ${list.length + 1}. Name it.`);
  };

  const removeField = (id: string) => {
    const field = fieldById(id);
    if (!field || locked) return;
    const index = list.findIndex((f) => f.id === id);
    counter.current += 1;
    const n = counter.current;
    if (motionSafe) {
      setGhosts((g) => [...g, { field, index, n }]);
      later(() => setGhosts((g) => g.filter((x) => x.n !== n)), 520);
    }
    const rest = list.filter((f) => f.id !== id);
    writeFields(rest);
    writeRows(
      rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[id];
        return { ...r, cells };
      }),
    );
    setMenu(null);
    onRemoveField?.(field);
    const neighbour = rest[Math.min(index, rest.length - 1)];
    if (neighbour) ask(`field:${neighbour.id}`);
    say(`${field.name} removed. ${plural(rest.length, "field", "fields")}.`);
  };

  const commitRename = () => {
    const r = renaming;
    if (!r) return;
    setRenaming(null);
    const field = fieldById(r.id);
    const name = r.value.trim();
    ask(`field:${r.id}`);
    if (!field || !name || name === field.name) return;
    const next = { ...field, name };
    writeFields(list.map((f) => (f.id === r.id ? next : f)));
    onFieldChange?.(next, field);
    say(`Renamed to ${name}.`);
  };

  const setOptions = (id: string, change: SchemaFieldOptions) => {
    const field = fieldById(id);
    if (!field || locked) return;
    const next = { ...field, options: { ...field.options, ...change } };
    writeFields(list.map((f) => (f.id === id ? next : f)));
    onFieldChange?.(next, field);
    say(`${field.name}: ${summary(next)}.`);
  };

  /* --------------------------------- menu --------------------------------- */

  const openMenu = (
    fieldId: string,
    view: "table" | "list",
    from: HTMLElement,
  ) => {
    if (locked) return;
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const br = from.getBoundingClientRect();
    const width = 248;
    // Below the field when it fits, above it when there is more room there;
    // either way it stays inside the editor and scrolls if it must.
    const below = rr.bottom - br.bottom - 14;
    const overhead = br.top - rr.top - 14;
    const above = below < 260 && overhead > below;
    setMenu({
      fieldId,
      view,
      x: Math.round(
        clamp(br.left - rr.left, 8, Math.max(8, rr.width - width - 8)),
      ),
      y: Math.round(above ? rr.bottom - br.top + 6 : br.bottom - rr.top + 6),
      maxH: Math.max(120, Math.round(above ? overhead : below)),
      above,
      sub: "main",
      confirmRemove: false,
    });
    setMenuIndex(0);
  };

  const closeMenu = () => {
    const m = menu;
    setMenu(null);
    if (m) ask(`field:${m.fieldId}`);
  };

  /** What a menu item does: data, run by the click handler, never during render. */
  type Act =
    | { kind: "options-set"; change: SchemaFieldOptions }
    | { kind: "sub"; to: "main" | "options" }
    | { kind: "type"; type: SchemaFieldType }
    | { kind: "rename" }
    | { kind: "move"; delta: -1 | 1 }
    | { kind: "remove" };

  type Item = {
    key: string;
    role: "menuitem" | "menuitemradio";
    checked?: boolean;
    label: React.ReactNode;
    name: string;
    act: Act;
    tone?: "danger";
  };

  const menuField = menu ? fieldById(menu.fieldId) : undefined;
  const items: Item[] = (() => {
    if (!menu || !menuField) return [];
    if (menu.sub === "options") {
      const f = menuField;
      const out: Item[] = [];
      if (f.type === "currency") {
        for (const code of ["GBP", "USD", "EUR"]) {
          out.push({
            key: `cur-${code}`,
            role: "menuitemradio",
            checked: (f.options?.currency ?? "GBP") === code,
            name: `Currency ${code}`,
            label: `${SYMBOL[code] ?? ""} ${code}`,
            act: { kind: "options-set", change: { currency: code } },
          });
        }
      }
      if (f.type === "currency" || f.type === "number") {
        for (const dp of [0, 2]) {
          out.push({
            key: `dp-${dp}`,
            role: "menuitemradio",
            checked:
              (f.options?.decimals ?? (f.type === "currency" ? 2 : 0)) === dp,
            name: `${dp} decimal places`,
            label: dp === 0 ? "Whole numbers" : "Two decimal places",
            act: { kind: "options-set", change: { decimals: dp } },
          });
        }
      }
      if (f.type === "date") {
        for (const style of ["long", "short"] as const) {
          out.push({
            key: `ds-${style}`,
            role: "menuitemradio",
            checked: (f.options?.dateStyle ?? "long") === style,
            name: style === "long" ? "Long dates" : "Short dates",
            label: style === "long" ? "14 Mar 2026" : "14/03/2026",
            act: { kind: "options-set", change: { dateStyle: style } },
          });
        }
      }
      out.push({
        key: "back",
        role: "menuitem",
        name: "Back",
        label: "Back",
        act: { kind: "sub", to: "main" },
      });
      return out;
    }
    const f = menuField;
    const at = list.findIndex((x) => x.id === f.id);
    const out: Item[] = TYPES.map((t) => {
      let failed = 0;
      let sample: string | null = null;
      for (const r of rows) {
        const res = convert(r.cells[f.id] ?? null, f, t.type);
        if (!res.ok) failed += 1;
        else if (sample === null && res.value !== null) {
          sample = asText(res.value, {
            ...f,
            type: t.type,
            options: optionsFor(f, t.type, []),
          });
        }
      }
      const on = f.type === t.type;
      return {
        key: `type-${t.type}`,
        role: "menuitemradio" as const,
        checked: on,
        name: `${t.name}${on ? "" : failed > 0 ? `, ${failed} won't convert` : ", all convert"}`,
        label: (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <t.Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <span className="shrink-0">{t.name}</span>
            <span className="ml-auto truncate text-right text-[11px] text-ink-3">
              {on ? (
                "current"
              ) : failed > 0 ? (
                <span className="text-danger">{failed} won&apos;t convert</span>
              ) : (
                (sample ?? "")
              )}
            </span>
          </span>
        ),
        act: { kind: "type", type: t.type },
      };
    });
    out.push({
      key: "rename",
      role: "menuitem",
      name: "Rename",
      label: (
        <span className="flex items-center gap-2">
          <Pencil aria-hidden className="size-3.5 text-ink-3" />
          Rename
        </span>
      ),
      act: { kind: "rename" },
    });
    if (["currency", "number", "date"].includes(f.type)) {
      out.push({
        key: "options",
        role: "menuitem",
        name: "Options",
        label: (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <ChevronDown
              aria-hidden
              className="size-3.5 -rotate-90 text-ink-3"
            />
            Options
            <span className="ml-auto truncate text-[11px] text-ink-3">
              {summary(f)}
            </span>
          </span>
        ),
        act: { kind: "sub", to: "options" },
      });
    }
    if (at > 0) {
      out.push({
        key: "left",
        role: "menuitem",
        name: menu.view === "table" ? "Move left" : "Move up",
        label: (
          <span className="flex items-center gap-2">
            <ArrowLeft
              aria-hidden
              className={cn(
                "size-3.5 text-ink-3",
                menu.view === "list" && "rotate-90",
              )}
            />
            {menu.view === "table" ? "Move left" : "Move up"}
          </span>
        ),
        act: { kind: "move", delta: -1 },
      });
    }
    if (at < list.length - 1) {
      out.push({
        key: "right",
        role: "menuitem",
        name: menu.view === "table" ? "Move right" : "Move down",
        label: (
          <span className="flex items-center gap-2">
            <ArrowRight
              aria-hidden
              className={cn(
                "size-3.5 text-ink-3",
                menu.view === "list" && "rotate-90",
              )}
            />
            {menu.view === "table" ? "Move right" : "Move down"}
          </span>
        ),
        act: { kind: "move", delta: 1 },
      });
    }
    if (list.length > 1) {
      out.push({
        key: "remove",
        role: "menuitem",
        tone: "danger",
        name: menu.confirmRemove
          ? `Remove ${f.name}? Press again`
          : "Remove field",
        label: (
          <span className="flex items-center gap-2">
            <Trash2 aria-hidden className="size-3.5" />
            {menu.confirmRemove
              ? `Remove ${f.name}? Press again`
              : "Remove field"}
          </span>
        ),
        act: { kind: "remove" },
      });
    }
    return out;
  })();

  const runItem = (act: Act) => {
    const m = menu;
    const f = menuField;
    if (!m || !f) return;
    switch (act.kind) {
      case "options-set":
        setOptions(f.id, act.change);
        return;
      case "sub":
        setMenu({ ...m, sub: act.to });
        setMenuIndex(0);
        return;
      case "type":
        startPreview(f.id, act.type);
        return;
      case "rename":
        setMenu(null);
        setRenaming({ id: f.id, value: f.name });
        ask("rename");
        return;
      case "move":
        setMenu(null);
        move(f.id, act.delta);
        return;
      default:
        if (m.confirmRemove) removeField(f.id);
        else setMenu({ ...m, confirmRemove: true });
    }
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = items.length;
    if (n === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % n);
        return;
      case "ArrowUp":
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + n) % n);
        return;
      case "Home":
        e.preventDefault();
        setMenuIndex(0);
        return;
      case "End":
        e.preventDefault();
        setMenuIndex(n - 1);
        return;
      case "ArrowLeft":
        if (menu?.sub === "options") {
          e.preventDefault();
          setMenu({ ...menu, sub: "main" });
          setMenuIndex(0);
        }
        return;
      case "Escape":
        // Ours: the menu closes and focus goes back to its field.
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      case "Tab":
        e.preventDefault();
        closeMenu();
        return;
      default:
        break;
    }
  };

  /* --------------------------------- drag --------------------------------- */

  const hooks: DragHooks = {
    start: (id, view, x, y) => {
      if (locked || preview) return;
      const nodes = view === "table" ? heads.current : cards.current;
      const starts = new Map<string, number>();
      const sizes = new Map<string, number>();
      for (const [fid, node] of nodes) {
        flights.current.get(fid)?.stop();
        offsetFor(fid).jump(0);
        starts.set(fid, view === "table" ? node.offsetLeft : node.offsetTop);
        sizes.set(fid, view === "table" ? node.offsetWidth : node.offsetHeight);
      }
      const container = view === "table" ? tableRef.current : listRef.current;
      const base = container?.getBoundingClientRect();
      const p = view === "table" ? x - (base?.left ?? 0) : y - (base?.top ?? 0);
      const order = list.map((f) => f.id);
      session.current = {
        id,
        view,
        order,
        starts,
        sizes,
        origin: p,
        last: p,
        target: order.indexOf(id),
      };
      setMenu(null);
      setDragging({ id, target: order.indexOf(id) });
    },
    move: (x, y) => {
      const s = session.current;
      if (!s) return;
      const container = s.view === "table" ? tableRef.current : listRef.current;
      const base = container?.getBoundingClientRect();
      const p =
        s.view === "table" ? x - (base?.left ?? 0) : y - (base?.top ?? 0);
      s.last = p;
      const from = s.order.indexOf(s.id);
      const size = s.sizes.get(s.id) ?? 0;
      const first = s.starts.get(s.order[0] ?? "") ?? 0;
      const lastId = s.order[s.order.length - 1] ?? "";
      const end = (s.starts.get(lastId) ?? 0) + (s.sizes.get(lastId) ?? 0);
      // 1:1 under the hand, rubber-banded past either end of the row.
      let delta = p - s.origin;
      const lead = (s.starts.get(s.id) ?? 0) + delta;
      if (lead < first)
        delta =
          first - (s.starts.get(s.id) ?? 0) + rubberband(lead - first, size);
      if (lead + size > end)
        delta =
          end -
          size -
          (s.starts.get(s.id) ?? 0) +
          rubberband(lead + size - end, size);
      offsetFor(s.id).set(r2(delta));
      // The slot is where the dragged field's middle has reached.
      const mid = (s.starts.get(s.id) ?? 0) + delta + size / 2;
      let target = 0;
      s.order.forEach((fid) => {
        if (fid === s.id) return;
        const c = (s.starts.get(fid) ?? 0) + (s.sizes.get(fid) ?? 0) / 2;
        if (mid > c) target += 1;
      });
      if (target !== s.target) {
        s.target = target;
        setDragging({ id: s.id, target });
        s.order.forEach((fid, i) => {
          if (fid === s.id) return;
          let shift = 0;
          if (from < target && i > from && i <= target) shift = -size;
          if (from > target && i >= target && i < from) shift = size;
          const off = offsetFor(fid);
          flights.current.get(fid)?.stop();
          if (!motionSafe) off.jump(shift);
          else flights.current.set(fid, animate(off, shift, springs.glide));
        });
      }
    },
    end: (velocity) => {
      const s = session.current;
      session.current = null;
      setDragging(null);
      if (!s) return;
      const from = s.order.indexOf(s.id);
      if (s.target === from) {
        for (const fid of s.order) {
          const off = offsetFor(fid);
          flights.current.get(fid)?.stop();
          if (!motionSafe) off.jump(0);
          else
            flights.current.set(
              fid,
              animate(off, 0, {
                ...springs.glide,
                velocity: fid === s.id ? velocity : 0,
              }),
            );
        }
        return;
      }
      const next = [...list];
      const [item] = next.splice(from, 1);
      if (!item) return;
      next.splice(s.target, 0, item);
      reorder(next, { id: s.id, v: velocity });
      say(`${item.name} moved to ${s.target + 1} of ${list.length}.`);
    },
    cancel: () => {
      const s = session.current;
      session.current = null;
      setDragging(null);
      if (!s) return;
      for (const fid of s.order) offsetFor(fid).jump(0);
    },
  };

  /* -------------------------------- render -------------------------------- */

  const previewField = preview ? fieldById(preview.fieldId) : undefined;
  const failedCount = preview
    ? Object.values(preview.results).filter((x) => !x.ok).length
    : 0;

  const shownFor = (f: SchemaField, r: SchemaRow): Shown => {
    const v = r.cells[f.id] ?? null;
    if (preview && preview.fieldId === f.id) {
      const res = preview.results[r.id];
      if (res && !res.ok)
        return { key: `${preview.to}-fail`, v, field: f, fail: res.reason };
      const to: SchemaField = {
        ...f,
        type: preview.to,
        options: optionsFor(
          f,
          preview.to,
          rows
            .map((x) => x.cells[f.id] ?? null)
            .map((x) => {
              const c = convert(x, f, preview.to);
              return c.ok ? c.value : null;
            }),
        ),
      };
      return {
        key: preview.to,
        v: res && res.ok ? res.value : null,
        field: to,
        fail: null,
      };
    }
    return { key: f.type, v, field: f, fail: null };
  };

  const delayFor = (f: SchemaField, ri: number) => {
    if (preview?.fieldId === f.id) return ri * step;
    if (unwind?.fieldId === f.id) return (rows.length - 1 - ri) * step;
    return 0;
  };

  const alignOf = (f: SchemaField, previewing: boolean) => {
    const t = previewing && preview ? preview.to : f.type;
    return t === "number" || t === "currency" ? "end" : "start";
  };

  // Columns being removed stay drawn, collapsing, at the place they left.
  const drawn: { field: SchemaField; ghost: boolean }[] = list.map((f) => ({
    field: f,
    ghost: false,
  }));
  for (const g of [...ghosts].sort((a, b) => a.index - b.index)) {
    drawn.splice(Math.min(g.index, drawn.length), 0, {
      field: g.field,
      ghost: true,
    });
  }

  const widthOf = () => d.col;

  const fieldButton = (
    f: SchemaField,
    view: "table" | "list",
    index: number,
  ) => {
    const on = (rove ?? list[0]?.id) === f.id;
    const isRenaming = renaming?.id === f.id;
    const previewing = preview?.fieldId === f.id;
    if (isRenaming && renaming) {
      return (
        <input
          data-st-focus="rename"
          aria-label={`Name for ${f.name}`}
          value={renaming.value}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setRenaming((r) => (r ? { ...r, value } : r));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setRenaming(null);
              ask(`field:${f.id}`);
            }
          }}
          onBlur={commitRename}
          className="h-7 w-full min-w-0 rounded-1 border border-input bg-card px-1.5 text-[13px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid"
        />
      );
    }
    return (
      <button
        type="button"
        data-st-field={f.id}
        data-st-focus={`field:${f.id}`}
        tabIndex={on ? 0 : -1}
        aria-haspopup="menu"
        aria-expanded={menu?.fieldId === f.id}
        aria-describedby={hintId}
        aria-label={`${f.name}, ${typeInfo(previewing && preview ? preview.to : f.type).name}${previewing ? " preview" : ""}, ${summary(f)}. Field ${index + 1} of ${list.length}`}
        disabled={!ready}
        onFocus={() => setRove(f.id)}
        onClick={(e) => openMenu(f.id, view, e.currentTarget)}
        onKeyDown={(e) => {
          const fwd = view === "table" ? "ArrowRight" : "ArrowDown";
          const back = view === "table" ? "ArrowLeft" : "ArrowUp";
          if ((e.key === fwd || e.key === back) && e.altKey) {
            e.preventDefault();
            move(f.id, e.key === fwd ? 1 : -1);
            return;
          }
          if (e.key === fwd || e.key === back) {
            e.preventDefault();
            const to =
              list[clamp(index + (e.key === fwd ? 1 : -1), 0, list.length - 1)];
            if (to) {
              setRove(to.id);
              ask(`field:${to.id}`);
            }
            return;
          }
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            const to = e.key === "Home" ? list[0] : list[list.length - 1];
            if (to) {
              setRove(to.id);
              ask(`field:${to.id}`);
            }
            return;
          }
          if (e.key === "F2" && !locked) {
            e.preventDefault();
            setRenaming({ id: f.id, value: f.name });
            ask("rename");
            return;
          }
          if (
            (view === "table" && e.key === "ArrowDown") ||
            (view === "list" && e.key === "ArrowRight")
          ) {
            e.preventDefault();
            openMenu(f.id, view, e.currentTarget);
          }
        }}
        className={cn(
          "group/st-field flex min-w-0 flex-1 flex-col items-start gap-1 rounded-2 px-1.5 py-1 text-left transition-colors",
          "enabled:hover:bg-surface-2 aria-expanded:bg-surface-2",
          FOCUS_IN,
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
            {f.name}
          </span>
          <ChevronDown
            aria-hidden
            className="ml-auto size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover/st-field:opacity-100 group-focus-visible/st-field:opacity-100"
          />
        </span>
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <Badge
            type={previewing && preview ? preview.to : f.type}
            look={typeBadge}
            motionSafe={motionSafe}
            pending={previewing}
            accent={accent}
          />
          <span className="min-w-0 truncate text-[11px] text-ink-3">
            {summary(
              previewing && preview
                ? {
                    ...f,
                    type: preview.to,
                    options: optionsFor(f, preview.to, []),
                  }
                : f,
            )}
          </span>
        </span>
      </button>
    );
  };

  const confirmBar = (
    <AnimatePresence>
      {preview && previewField ? (
        <motion.div
          key={`bar-${preview.fieldId}`}
          role="group"
          aria-labelledby={barId}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelPreview();
            }
          }}
          className="absolute inset-x-2 top-2 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3 border border-hairline-strong bg-popover px-3 py-2 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
          initial={{ opacity: 0, y: motionSafe ? -distances.shift : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.step : 0,
            transition: exitFor(durations.base),
          }}
          transition={{
            opacity: { duration: durations.fast, ease: easings.enter },
            y: motionSafe ? springs.glide : { duration: 0 },
          }}
        >
          <p
            id={barId}
            className="min-w-0 flex-1 basis-48 text-[12px] leading-4 text-foreground"
          >
            <span className="font-semibold">{previewField.name}</span>
            <span className="text-ink-3"> → </span>
            <span className="font-semibold">{typeInfo(preview.to).name}</span>
            <span className="text-ink-2">
              {" "}
              · {plural(rows.length - failedCount, "converts", "convert")}
              {failedCount > 0 ? (
                <span className="text-danger">
                  {" "}
                  · {plural(failedCount, "will be cleared", "will be cleared")}
                </span>
              ) : null}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={cancelPreview}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              data-st-focus="convert"
              onClick={confirmPreview}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
                FOCUS_RING,
              )}
              style={{ backgroundColor: pigment(accent, 0.52) }}
            >
              <Check aria-hidden className="size-3.5" />
              Convert
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const table = (
    <div className="relative hidden flex-1 overflow-hidden @min-[40rem]/schema-table:flex">
      <div
        ref={setScroller}
        className="flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain"
      >
        <div
          ref={tableRef}
          role="table"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          aria-rowcount={rows.length + 1}
          className={cn("relative w-max min-w-full", d.text)}
        >
          <div role="rowgroup" className="sticky top-0 z-[3] bg-card">
            <div role="row" className="flex border-b border-hairline">
              {drawn.map(({ field: f, ghost }) => {
                const width = widthOf();
                const isDragged = dragging?.id === f.id;
                const growing = fresh.has(f.id);
                return (
                  <motion.div
                    key={ghost ? `ghost-${f.id}` : f.id}
                    ref={(node) => {
                      if (ghost) return;
                      if (node) heads.current.set(f.id, node);
                      else heads.current.delete(f.id);
                    }}
                    role="columnheader"
                    aria-hidden={ghost || undefined}
                    className={cn(
                      "relative flex shrink-0 items-start gap-0.5 overflow-hidden border-r border-hairline py-2 pr-1 pl-1",
                      isDragged
                        ? "z-[4] bg-surface-1 shadow-[0_10px_24px_color-mix(in_oklab,black_16%,transparent)]"
                        : "bg-card",
                    )}
                    style={{ x: ghost ? 0 : offsetFor(f.id) }}
                    initial={
                      ghost
                        ? { width, opacity: 1 }
                        : growing && motionSafe
                          ? { width: 0, opacity: 0 }
                          : false
                    }
                    animate={
                      ghost ? { width: 0, opacity: 0 } : { width, opacity: 1 }
                    }
                    transition={
                      !motionSafe
                        ? { duration: 0 }
                        : ghost
                          ? // A leaving column folds on the exit ease: exits never spring.
                            exitFor(durations.slow)
                          : {
                              width: springs.glide,
                              opacity: { duration: durations.base },
                            }
                    }
                  >
                    {ghost ? (
                      <span className="truncate px-1.5 py-1 text-[13px] font-semibold text-ink-3">
                        {f.name}
                      </span>
                    ) : (
                      <>
                        <Grip
                          id={f.id}
                          view="table"
                          disabled={locked || !!preview}
                          hooks={hooks}
                        />
                        {fieldButton(
                          f,
                          "table",
                          list.findIndex((x) => x.id === f.id),
                        )}
                      </>
                    )}
                    {preview?.fieldId === f.id ? (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-0.5"
                        style={{ backgroundColor: accent }}
                      />
                    ) : null}
                  </motion.div>
                );
              })}
              <div className="flex w-28 shrink-0 items-start px-2 py-2">
                <button
                  type="button"
                  onClick={addField}
                  disabled={locked}
                  aria-label="Add field"
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-2 border border-dashed border-hairline-strong px-2.5 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
                    FOCUS_RING,
                  )}
                >
                  <Plus aria-hidden className="size-3.5" />
                  Field
                </button>
              </div>
            </div>
          </div>
          <div role="rowgroup">
            {rows.length === 0 ? (
              <div role="row" className="flex">
                <div role="cell" className="px-4 py-8 text-[12px] text-ink-3">
                  No sample rows yet. Rows from the next import show here.
                </div>
              </div>
            ) : null}
            {rows.map((r, ri) => (
              <div
                key={r.id}
                role="row"
                className="flex border-b border-hairline last:border-b-0"
              >
                {drawn.map(({ field: f, ghost }) => {
                  const width = widthOf();
                  const shown = ghost
                    ? {
                        key: f.type,
                        v: r.cells[f.id] ?? null,
                        field: f,
                        fail: null,
                      }
                    : shownFor(f, r);
                  const previewing = preview?.fieldId === f.id;
                  const growing = fresh.has(f.id);
                  return (
                    <motion.div
                      key={ghost ? `ghost-${f.id}` : f.id}
                      role="cell"
                      aria-hidden={ghost || undefined}
                      aria-label={
                        shown.fail
                          ? `${asText(shown.v, f)}: ${shown.fail}, will be cleared`
                          : undefined
                      }
                      className={cn(
                        "flex shrink-0 items-center overflow-hidden border-r border-hairline",
                        d.pad,
                        dragging?.id === f.id
                          ? "z-[2] bg-surface-1"
                          : previewing
                            ? "bg-[color-mix(in_oklab,var(--accent-bright)_4%,var(--card))]"
                            : "bg-card",
                      )}
                      style={{ x: ghost ? 0 : offsetFor(f.id), height: d.row }}
                      initial={
                        ghost
                          ? { width, opacity: 1 }
                          : growing && motionSafe
                            ? { width: 0, opacity: 0 }
                            : false
                      }
                      animate={
                        ghost ? { width: 0, opacity: 0 } : { width, opacity: 1 }
                      }
                      transition={
                        !motionSafe
                          ? { duration: 0 }
                          : ghost
                            ? // A leaving column folds on the exit ease: exits never spring.
                              exitFor(durations.slow)
                            : {
                                width: springs.glide,
                                opacity: { duration: durations.base },
                              }
                      }
                    >
                      <Cell
                        shown={shown}
                        accent={accent}
                        delay={delayFor(f, ri)}
                        motionSafe={motionSafe}
                        align={alignOf(f, previewing)}
                      />
                    </motion.div>
                  );
                })}
                <div aria-hidden className="w-28 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[2] w-12 bg-linear-to-l from-card to-transparent transition-opacity duration-200",
          moreRight ? "opacity-100" : "opacity-0",
        )}
      />
      {confirmBar}
    </div>
  );

  const cardsView = (
    <div className="relative flex flex-1 overflow-hidden @min-[40rem]/schema-table:hidden">
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-2.5">
        <div
          ref={listRef}
          role="list"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          className="relative flex flex-col gap-2"
        >
          {list.map((f, i) => {
            const previewing = preview?.fieldId === f.id;
            const growing = fresh.has(f.id);
            return (
              <motion.div
                key={f.id}
                ref={(node) => {
                  if (node) cards.current.set(f.id, node);
                  else cards.current.delete(f.id);
                }}
                role="listitem"
                className={cn(
                  "relative flex flex-col gap-2 rounded-3 border bg-card p-2",
                  previewing ? "border-transparent" : "border-hairline",
                  dragging?.id === f.id &&
                    "z-[4] shadow-[0_10px_24px_color-mix(in_oklab,black_16%,transparent)]",
                )}
                style={{
                  y: offsetFor(f.id),
                  boxShadow: previewing ? `0 0 0 1.5px ${accent}` : undefined,
                }}
                initial={
                  growing && motionSafe ? { opacity: 0, scale: 0.97 } : false
                }
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: 0 }
                }
              >
                <div className="flex items-start gap-0.5">
                  <Grip
                    id={f.id}
                    view="list"
                    disabled={locked || !!preview}
                    hooks={hooks}
                  />
                  {fieldButton(f, "list", i)}
                </div>
                <div
                  className="flex flex-wrap items-center gap-1.5 pl-7"
                  role="group"
                  aria-label={`${f.name} samples`}
                >
                  {rows.slice(0, 3).map((r, ri) => {
                    const shown = shownFor(f, r);
                    return (
                      <span
                        key={r.id}
                        aria-label={
                          shown.fail
                            ? `${asText(shown.v, f)}: ${shown.fail}, will be cleared`
                            : undefined
                        }
                        className="flex h-7 max-w-full min-w-0 items-center rounded-2 border border-hairline bg-surface-1 px-2 text-[12px]"
                      >
                        <Cell
                          shown={shown}
                          accent={accent}
                          delay={delayFor(f, ri)}
                          motionSafe={motionSafe}
                          align="start"
                        />
                      </span>
                    );
                  })}
                  {rows.length > 3 ? (
                    <span className="text-[11px] text-ink-3 tabular-nums">
                      +{rows.length - 3}
                    </span>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
          <button
            type="button"
            onClick={addField}
            disabled={locked}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-3 border border-dashed border-hairline-strong text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            <Plus aria-hidden className="size-3.5" />
            Add field
          </button>
        </div>
      </div>
      {confirmBar}
    </div>
  );

  const skeleton = (
    <div aria-hidden className="flex flex-1 flex-col gap-0 overflow-hidden p-3">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-hairline py-2.5">
          {Array.from({ length: 4 }, (_, k) => (
            <span
              key={k}
              className={cn(
                "rounded-full bg-surface-2 motion-safe:animate-pulse",
                i === 0 ? "h-4" : "h-2.5",
              )}
              style={{ width: `${14 + ((i * 29 + k * 17) % 16)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/schema-table relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2"
            style={{ backgroundColor: wash(accent, 12), color: accent }}
          >
            <Table2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p
              id={titleId}
              className="truncate text-[13px] leading-5 font-semibold"
            >
              {title}
            </p>
            <p className="truncate text-[11px] leading-4 text-ink-3 tabular-nums">
              {plural(list.length, "field", "fields")} ·{" "}
              {plural(rows.length, "sample row", "sample rows")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={addField}
          disabled={locked}
          className={cn(
            "hidden h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50 @min-[40rem]/schema-table:inline-flex",
            FOCUS_RING,
          )}
          style={{ backgroundColor: pigment(accent, 0.52) }}
        >
          <Plus aria-hidden className="size-3.5" />
          Add field
        </button>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between fields. Enter opens a field&apos;s menu: its
        type, name, options and place. Alt with an arrow moves the field. F2
        renames it.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The schema did not load.</p>
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
        skeleton
      ) : (
        <>
          {table}
          {cardsView}
        </>
      )}

      {status !== "error" ? (
        <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-hairline bg-surface-1 px-3 text-[11px] text-ink-3 tabular-nums">
          <span className="truncate">
            {plural(rows.length, "sample row", "sample rows")} from the last
            import
          </span>
          <span className="shrink-0">
            {grouped(Math.max(0, Math.round(totalRows)), 0)} records
          </span>
        </footer>
      ) : null}

      <AnimatePresence>
        {menu && menuField ? (
          <motion.div
            key={`menu-${menu.fieldId}-${menu.sub}`}
            ref={menuRef}
            data-st-menu=""
            role="menu"
            aria-label={
              menu.sub === "options"
                ? `${menuField.name} options`
                : `${menuField.name} field`
            }
            onKeyDown={onMenuKey}
            className="absolute z-40 flex w-62 [scrollbar-width:thin] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1.5 shadow-[0_12px_32px_color-mix(in_oklab,black_20%,transparent)]"
            style={{
              left: menu.x,
              top: menu.above ? undefined : menu.y,
              bottom: menu.above ? menu.y : undefined,
              maxHeight: menu.maxH,
            }}
            initial={{
              opacity: 0,
              y: motionSafe
                ? menu.above
                  ? distances.nudge
                  : -distances.nudge
                : 0,
            }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              opacity: { duration: durations.fast, ease: easings.enter },
              y: motionSafe ? springs.snap : { duration: 0 },
            }}
          >
            {menu.sub === "main" ? (
              <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Type
              </p>
            ) : (
              <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {menuField.name} options
              </p>
            )}
            {items.map((it, i) => (
              <button
                key={it.key}
                type="button"
                role={it.role}
                aria-checked={
                  it.role === "menuitemradio" ? !!it.checked : undefined
                }
                aria-label={it.name}
                tabIndex={i === menuIndex ? 0 : -1}
                onPointerMove={() => setMenuIndex(i)}
                onClick={() => runItem(it.act)}
                className={cn(
                  "flex h-8 w-full min-w-0 items-center gap-2 rounded-2 px-2 text-left text-[12px] transition-colors",
                  i === menuIndex
                    ? "bg-surface-2 text-foreground"
                    : "text-ink-2",
                  it.tone === "danger" && "text-danger",
                  (it.key === "rename" || it.key === "back") &&
                    "mt-1 border-t border-hairline pt-1",
                  FOCUS_IN,
                )}
              >
                {it.role === "menuitemradio" ? (
                  <span
                    aria-hidden
                    className="flex size-3.5 shrink-0 items-center justify-center"
                  >
                    {it.checked ? (
                      <Check className="size-3.5" style={{ color: accent }} />
                    ) : null}
                  </span>
                ) : null}
                {it.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
