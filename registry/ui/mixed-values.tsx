"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Layers,
  RotateCcw,
  SlidersHorizontal,
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

export type MixedItemKind = "rect" | "ellipse" | "text" | "line" | "frame";

/** One layer on the canvas; `values` maps a property id to what it holds. */
export type MixedItem = {
  id: string;
  /** The layer's name, e.g. "Hero card". */
  name: string;
  /** Picks the tiny glyph drawn beside the name. */
  kind: MixedItemKind;
  values: Record<string, MixedPrimitive>;
};

export type MixedPrimitive = number | string;
export type MixedPropertyKind = "color" | "number" | "select";

/** One editable property and how its field reads and writes it. */
export type MixedProperty = {
  id: string;
  /** The row's label, e.g. "Opacity". */
  label: string;
  kind: MixedPropertyKind;
  /** Rows with the same group share a column from a 40rem container. */
  group?: string;
  /** Printed after a number, e.g. "%" or "px". */
  unit?: string;
  min?: number;
  max?: number;
  /** What Up/Down nudge by; Shift multiplies it by ten. @default 1 */
  step?: number;
  /** The choices of a select property. */
  options?: { id: string; label: string }[];
};

export type MixedChangeKind = "set" | "nudge" | "override";

export type MixedChange = {
  /** Which property changed. */
  property: string;
  /** Set and override carry the value written; a nudge carries its delta. */
  value: MixedPrimitive;
  /** The items that changed. */
  ids: string[];
  /** Each changed item's value after the change. */
  values: Record<string, MixedPrimitive>;
  kind: MixedChangeKind;
};

export type MixedIndicator = "dots" | "dash" | "stripe";
export type MixedDensity = "compact" | "cozy" | "roomy";
export type MixedAccent = "cobalt" | "signal" | "ink";
export type MixedStatus = "ready" | "loading" | "error";

export type MixedValuesProps = {
  /** How a field says its items differ: stacked dots, a dash, or a hatched field. @default "dots" */
  indicator?: MixedIndicator;
  /** Row heights, type size and padding. @default "cozy" */
  density?: MixedDensity;
  /** The colour of selected layers and the chip a hand is over. @default "cobalt" */
  accent?: MixedAccent;
  /** Controlled layers; every edit is reported and the host writes it back. */
  items?: MixedItem[];
  /** Initial layers when uncontrolled. @default defaultMixedItems */
  defaultItems?: MixedItem[];
  /** Fires with every layer after any edit, for hosts that keep the whole document. */
  onItemsChange?: (items: MixedItem[]) => void;
  /** The properties the panel shows, in row order. @default defaultMixedProperties */
  properties?: MixedProperty[];
  /** Controlled selection, as item ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default defaultMixedSelected */
  defaultSelected?: string[];
  /** Fires from the press or key that changed which layers are selected. */
  onSelectionChange?: (ids: string[]) => void;
  /** Fires once per edit with the property, the value written (or the delta nudged), the ids it reached and each one's result. */
  onChange?: (change: MixedChange) => void;
  /** Whether the layers have arrived. @default "ready" */
  status?: MixedStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Properties" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the panel in px; the rows scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be selected or edited. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultMixedProperties: MixedProperty[] = [
  { id: "fill", label: "Fill", kind: "color", group: "Appearance" },
  { id: "stroke", label: "Stroke", kind: "color", group: "Appearance" },
  {
    id: "opacity",
    label: "Opacity",
    kind: "number",
    group: "Appearance",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    id: "font",
    label: "Font",
    kind: "select",
    group: "Appearance",
    options: [
      { id: "gauge-sans", label: "Gauge Sans" },
      { id: "gauge-serif", label: "Gauge Serif" },
      { id: "gauge-mono", label: "Gauge Mono" },
      { id: "fieldline", label: "Fieldline Grotesk" },
    ],
  },
  {
    id: "radius",
    label: "Radius",
    kind: "number",
    group: "Geometry",
    unit: "px",
    min: 0,
    max: 400,
    step: 1,
  },
  {
    id: "width",
    label: "Width",
    kind: "number",
    group: "Geometry",
    unit: "px",
    min: 1,
    max: 4000,
    step: 1,
  },
  {
    id: "height",
    label: "Height",
    kind: "number",
    group: "Geometry",
    unit: "px",
    min: 1,
    max: 4000,
    step: 1,
  },
];

const layer = (
  id: string,
  name: string,
  kind: MixedItemKind,
  fill: string,
  stroke: string,
  opacity: number,
  radius: number,
  width: number,
  height: number,
  font: string,
): MixedItem => ({
  id,
  name,
  kind,
  values: { fill, stroke, opacity, radius, width, height, font },
});

/** Eight layers of the Gaugeworks Pay console mock, as drawn in Gaugeworks Design. */
export const defaultMixedItems: MixedItem[] = [
  layer(
    "frame",
    "Card frame",
    "frame",
    "#FFFFFF",
    "#E2E8F0",
    100,
    20,
    360,
    420,
    "gauge-sans",
  ),
  layer(
    "hero",
    "Hero card",
    "rect",
    "#2457E6",
    "#1B3FA8",
    100,
    16,
    320,
    180,
    "gauge-sans",
  ),
  layer(
    "balance",
    "Balance figure",
    "text",
    "#0F172A",
    "#0F172A",
    100,
    0,
    320,
    48,
    "gauge-mono",
  ),
  layer(
    "caption",
    "Caption",
    "text",
    "#64748B",
    "#64748B",
    80,
    0,
    320,
    20,
    "gauge-sans",
  ),
  layer(
    "divider",
    "Divider",
    "line",
    "#CBD5E1",
    "#CBD5E1",
    60,
    0,
    320,
    1,
    "gauge-sans",
  ),
  layer(
    "avatar",
    "Avatar",
    "ellipse",
    "#F4B860",
    "#C98A2B",
    100,
    28,
    56,
    56,
    "gauge-sans",
  ),
  layer(
    "cta",
    "Pay now button",
    "rect",
    "#2457E6",
    "#1B3FA8",
    100,
    10,
    160,
    44,
    "gauge-sans",
  ),
  layer(
    "badge",
    "Status badge",
    "rect",
    "#16A34A",
    "#15803D",
    100,
    11,
    72,
    22,
    "gauge-sans",
  ),
];

/** The hero card, the button and the badge: same opacity and font, everything else mixed. */
export const defaultMixedSelected: string[] = ["hero", "cta", "badge"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<MixedAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

type DensitySpec = {
  row: string;
  field: string;
  text: string;
  label: string;
  chip: string;
  option: string;
  gap: string;
};

const DENSITY: Record<MixedDensity, DensitySpec> = {
  compact: {
    row: "py-1",
    field: "h-7",
    text: "text-[12px]",
    label: "text-[11px]",
    chip: "h-6 text-[11px]",
    option: "h-6 text-[11px]",
    gap: "gap-1",
  },
  cozy: {
    row: "py-1.5",
    field: "h-8",
    text: "text-[13px]",
    label: "text-[12px]",
    chip: "h-7 text-[12px]",
    option: "h-7 text-[12px]",
    gap: "gap-1.5",
  },
  roomy: {
    row: "py-2.5",
    field: "h-9",
    text: "text-[13px]",
    label: "text-[13px]",
    chip: "h-7 text-[12px]",
    option: "h-8 text-[13px]",
    gap: "gap-2",
  },
};

/** The per-layer button is a square the height of the row's field. */
const compactSquare = (d: DensitySpec) =>
  d.field === "h-7" ? "size-7" : d.field === "h-9" ? "size-9" : "size-8";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const RECENT_MS = 1400;
const MIXED = "__mixed";

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

/** One distinct value among the selected items and who holds it. */
export type MixedGroup = { value: MixedPrimitive; ids: string[] };

/** The distinct values a property takes across `ids`, most common first; one group means the value is shared. */
export const summarizeMixed = (
  items: MixedItem[],
  ids: string[],
  property: string,
): MixedGroup[] => {
  const groups = new Map<string, MixedGroup>();
  for (const id of ids) {
    const item = items.find((it) => it.id === id);
    if (!item) continue;
    const value = item.values[property];
    if (value === undefined) continue;
    const key = `${typeof value}:${String(value)}`;
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { value, ids: [id] });
  }
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
};

const normalizeHex = (raw: string): string | null => {
  const text = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return `#${text
      .split("")
      .map((c) => c + c)
      .join("")}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`.toUpperCase();
  return null;
};

type Parsed =
  | { kind: "absolute"; value: number }
  | { kind: "relative"; delta: number }
  | null;

/** "+10" and "-4" are relative; "24" is absolute. */
const parseNumber = (raw: string): Parsed => {
  const text = raw.trim().replace(/\s+/g, "");
  const rel = /^([+-])(\d+(?:\.\d+)?)$/.exec(text);
  if (rel) {
    const n = Number(rel[2]);
    if (!Number.isFinite(n)) return null;
    return { kind: "relative", delta: rel[1] === "-" ? -n : n };
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? { kind: "absolute", value: n } : null;
};

const fitNumber = (n: number, prop: MixedProperty) =>
  Math.round(clamp(n, prop.min ?? -Infinity, prop.max ?? Infinity));

const printValue = (value: MixedPrimitive, prop: MixedProperty): string => {
  if (prop.kind === "select") {
    return prop.options?.find((o) => o.id === value)?.label ?? String(value);
  }
  if (prop.kind === "number") return `${value}${prop.unit ?? ""}`;
  return String(value);
};

const sayValue = (value: MixedPrimitive, prop: MixedProperty): string =>
  prop.kind === "color"
    ? String(value).replace(/^#/, "")
    : printValue(value, prop);

const listNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Glyphs                                  */
/* ----------------------------------------------------------------------- */

function Glyph({
  kind,
  className,
}: {
  kind: MixedItemKind;
  className?: string;
}) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      {kind === "rect" ? (
        <rect x={2} y={3} width={10} height={8} rx={1.5} {...stroke} />
      ) : kind === "ellipse" ? (
        <circle cx={7} cy={7} r={4.5} {...stroke} />
      ) : kind === "text" ? (
        <path d="M3 3.5h8M7 3.5v7.5M5 11h4" {...stroke} />
      ) : kind === "line" ? (
        <path d="M2.5 11.5 11.5 2.5" {...stroke} />
      ) : (
        <path d="M4 1.5v11M10 1.5v11M1.5 4h11M1.5 10h11" {...stroke} />
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Indicator                                 */
/* ----------------------------------------------------------------------- */

function Indicator({
  kind,
  colors,
}: {
  kind: MixedIndicator;
  /** The differing colours, for a colour field's dots. */
  colors?: string[];
}) {
  if (kind === "dash") {
    return (
      <span aria-hidden className="block h-0.5 w-3 rounded-full bg-ink-3" />
    );
  }
  if (kind === "stripe") {
    return (
      <span
        aria-hidden
        className="block size-3 rounded-[3px] border border-hairline-strong"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 3.5px)",
        }}
      />
    );
  }
  const dots = colors && colors.length >= 2 ? colors.slice(0, 3) : null;
  return (
    <span aria-hidden className="relative block size-3.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "absolute size-2 rounded-full border border-card",
            !dots && "bg-ink-3",
          )}
          style={{
            left: i * 2.5,
            top: 5 - i * 2.5,
            background: dots ? dots[i % dots.length] : undefined,
            zIndex: i,
          }}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Chips                                   */
/* ----------------------------------------------------------------------- */

function ValueChip({
  group,
  prop,
  names,
  index,
  count,
  d,
  motionSafe,
  disabled,
  onApply,
}: {
  group: MixedGroup;
  prop: MixedProperty;
  names: string[];
  index: number;
  count: number;
  d: DensitySpec;
  motionSafe: boolean;
  disabled: boolean;
  onApply: () => void;
}) {
  const step = cascade(count);
  return (
    <motion.button
      type="button"
      layout={motionSafe ? "position" : false}
      initial={
        motionSafe
          ? { opacity: 0, x: -distances.step, scale: 0.94 }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        x: motionSafe
          ? { ...springs.snap, delay: r3(index * step) }
          : { duration: 0 },
        scale: motionSafe
          ? { ...springs.snap, delay: r3(index * step) }
          : { duration: 0 },
        opacity: {
          duration: durations.fast,
          ease: easings.enter,
          delay: motionSafe ? r3(index * step) : 0,
        },
      }}
      whileTap={motionSafe && !disabled ? { scale: 0.96 } : undefined}
      aria-disabled={disabled || undefined}
      aria-label={`${sayValue(group.value, prop)} on ${listNames(names)}. Apply to all.`}
      onClick={onApply}
      className={cn(
        "group/chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-1 pr-2 pl-1.5 font-medium whitespace-nowrap transition-colors",
        d.chip,
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-(--mv-accent-soft) hover:bg-(--mv-accent-wash)",
        FOCUS_RING,
      )}
    >
      {prop.kind === "color" ? (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-[3px] border border-hairline-strong"
          style={{ background: String(group.value) }}
        />
      ) : null}
      {prop.kind === "number" ? (
        <span className="inline-flex items-baseline font-mono">
          <Roll value={Number(group.value)} motionSafe={motionSafe} />
          {prop.unit ? <span className="text-ink-3">{prop.unit}</span> : null}
        </span>
      ) : (
        <span
          className={cn(
            "truncate",
            prop.kind === "color" && "font-mono uppercase",
          )}
        >
          {prop.kind === "color"
            ? String(group.value).replace(/^#/, "")
            : printValue(group.value, prop)}
        </span>
      )}
      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
        {group.ids.length > 1 ? `x${group.ids.length}` : (names[0] ?? "")}
      </span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Fields                                  */
/* ----------------------------------------------------------------------- */

type FieldProps = {
  prop: MixedProperty;
  groups: MixedGroup[];
  draft: string | undefined;
  indicator: MixedIndicator;
  d: DensitySpec;
  motionSafe: boolean;
  disabled: boolean;
  inputId: string;
  describedBy?: string;
  compact?: boolean;
  onDraft: (text: string | undefined) => void;
  onCommit: (text: string) => void;
  onSelect: (value: string) => void;
  onNudge: (delta: number) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
};

function Field({
  prop,
  groups,
  draft,
  indicator,
  d,
  motionSafe,
  disabled,
  inputId,
  describedBy,
  compact,
  onDraft,
  onCommit,
  onSelect,
  onNudge,
  onKeyDown,
}: FieldProps) {
  const mixed = groups.length > 1;
  const shared = groups[0]?.value;
  const editing = draft !== undefined;
  const shown = editing
    ? draft
    : mixed || shared === undefined
      ? ""
      : prop.kind === "color"
        ? String(shared).replace(/^#/, "")
        : String(shared);
  const striped = mixed && indicator === "stripe";
  const colors =
    prop.kind === "color" ? groups.map((g) => String(g.value)) : undefined;

  const frame = cn(
    "relative flex min-w-0 items-center rounded-2 border bg-surface-0 transition-colors",
    d.field,
    compact ? "h-7" : null,
    disabled
      ? "border-hairline"
      : "border-hairline hover:border-hairline-strong",
    "focus-within:border-(--mv-accent-soft)",
  );

  if (prop.kind === "select") {
    return (
      <div
        className={frame}
        style={
          striped
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--hairline-strong) 55%, transparent) 0 1px, transparent 1px 6px)",
              }
            : undefined
        }
      >
        {mixed && indicator !== "stripe" ? (
          <span className="pointer-events-none absolute left-2 flex items-center">
            <Indicator kind={indicator} />
          </span>
        ) : null}
        <select
          id={inputId}
          aria-describedby={describedBy}
          disabled={disabled}
          value={mixed ? MIXED : String(shared ?? "")}
          onChange={(event) => {
            if (event.target.value !== MIXED) onSelect(event.target.value);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-full w-full min-w-0 appearance-none bg-transparent pr-6 text-foreground",
            compact ? "text-[12px]" : d.text,
            mixed && indicator !== "stripe" ? "pl-7" : "pl-2.5",
            mixed && "text-ink-2",
            FOCUS_RING,
          )}
        >
          {mixed ? (
            <option value={MIXED} disabled>
              Mixed
            </option>
          ) : null}
          {(prop.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-2 size-3 text-ink-3"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={frame}
      style={
        striped && !editing
          ? {
              backgroundImage:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--hairline-strong) 55%, transparent) 0 1px, transparent 1px 6px)",
            }
          : undefined
      }
    >
      <span className="pointer-events-none absolute left-2 flex items-center">
        <AnimatePresence initial={false} mode="wait">
          {mixed && !editing ? (
            indicator === "stripe" ? null : (
              <motion.span
                key="mixed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className="flex items-center"
              >
                <Indicator kind={indicator} colors={colors} />
              </motion.span>
            )
          ) : prop.kind === "color" && !mixed ? (
            <motion.span
              key="swatch"
              initial={{ opacity: 0, x: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="block size-3.5 rounded-[3px] border border-hairline-strong"
              style={{
                background:
                  normalizeHex(draft ?? String(shared ?? "")) ??
                  String(shared ?? ""),
              }}
            />
          ) : null}
        </AnimatePresence>
      </span>
      <input
        id={inputId}
        type="text"
        inputMode={prop.kind === "number" ? "decimal" : "text"}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={describedBy}
        disabled={disabled}
        value={shown}
        placeholder={mixed ? "Mixed" : undefined}
        onChange={(event) => onDraft(event.target.value)}
        onFocus={(event) => {
          if (!mixed) event.currentTarget.select();
        }}
        onBlur={() => {
          if (editing) onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (editing) onCommit(draft);
            return;
          }
          if (event.key === "Escape" && editing) {
            event.preventDefault();
            event.stopPropagation();
            onDraft(undefined);
            return;
          }
          if (
            prop.kind === "number" &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
          ) {
            event.preventDefault();
            const step = (prop.step ?? 1) * (event.shiftKey ? 10 : 1);
            onDraft(undefined);
            onNudge(event.key === "ArrowUp" ? step : -step);
            return;
          }
          onKeyDown?.(event);
        }}
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-foreground placeholder:text-ink-2",
          compact ? "text-[12px]" : d.text,
          prop.kind === "color" && "font-mono uppercase",
          prop.kind === "number" && "font-mono tabular-nums",
          (mixed && !editing && indicator !== "stripe") ||
            (prop.kind === "color" && !mixed)
            ? "pl-7"
            : "pl-2.5",
          prop.unit ? "pr-8" : "pr-2.5",
          FOCUS_RING,
        )}
      />
      {prop.unit ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 font-mono text-[11px] text-ink-3"
        >
          {prop.unit}
        </span>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Pop = {
  property: string;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

/**
 * A properties panel for several layers at once. A strip of the page's
 * layers sits above the fields; the selected ones are lit in the accent and
 * every field below reads across them. Where they agree the field holds the
 * value; where they differ it reads Mixed behind a stacked-dots indicator (a
 * colour field's dots are the colours themselves).
 *
 * Resting on a Mixed field, or focusing it, fans its differing values out
 * beneath it as chips on `springs.snap`, each with a swatch or a rolling
 * number and how many layers hold it; the row opens to make room on
 * `springs.glide`. Pressing a chip, or typing a value, writes it to every
 * layer: the chips leave, the row closes on glide and the indicator gives way
 * to the single value sliding in on the same spring. A signed entry ("+10")
 * or Up/Down in a number field nudges every layer by that much, and each
 * chip's digits roll to its own result while the chips stay out. A per-item
 * dialog lets one layer differ again, and the field turns Mixed as it does.
 *
 * The strip is a multi-select listbox: arrows move, Home/End jump, Space or
 * Enter toggles a layer in or out and the fields re-read on glide. Fields are
 * native: Enter commits, Escape reverts. Every change is announced. Under
 * reduced motion chips and indicators cross-fade in place, rows resize at
 * once and digits change without rolling.
 */
export function MixedValues({
  indicator = "dots",
  density = "cozy",
  accent = "cobalt",
  items,
  defaultItems = defaultMixedItems,
  onItemsChange,
  properties = defaultMixedProperties,
  selected,
  defaultSelected = defaultMixedSelected,
  onSelectionChange,
  onChange,
  status = "ready",
  onRetry,
  title = "Properties",
  label,
  height = 540,
  disabled = false,
  className,
}: MixedValuesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const popId = `${uid}-pop`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;

  const [ownItems, setOwnItems] = React.useState<MixedItem[]>(defaultItems);
  const all = items ?? ownItems;
  const [ownSel, setOwnSel] = React.useState<string[]>(defaultSelected);
  const sel = (selected ?? ownSel).filter((id) =>
    all.some((it) => it.id === id),
  );
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [hoverProp, setHoverProp] = React.useState<string | null>(null);
  const [focusProp, setFocusProp] = React.useState<string | null>(null);
  const [recentProp, setRecentProp] = React.useState<string | null>(null);
  const [activeOption, setActiveOption] = React.useState<string | null>(null);
  const [pop, setPop] = React.useState<Pop | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  // False for the server render and hydration, so the fanned chips of a
  // field that is already focused never replay their entrance.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const optionNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const overrideNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const recentTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (recentTimer.current !== null)
        window.clearTimeout(recentTimer.current);
    },
    [],
  );

  /* --------------------------------- data -------------------------------- */

  const nameOf = (id: string) => all.find((it) => it.id === id)?.name ?? id;
  const groupsOf = (prop: MixedProperty) => summarizeMixed(all, sel, prop.id);
  const nounFor = (n: number) => (n === 1 ? "layer" : "layers");

  const sections = (() => {
    const order: string[] = [];
    const map = new Map<string, MixedProperty[]>();
    for (const prop of properties) {
      const key = prop.group ?? "";
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)?.push(prop);
    }
    return order.map((key) => ({ group: key, props: map.get(key) ?? [] }));
  })();

  /* ------------------------------- writes -------------------------------- */

  const commitItems = (next: MixedItem[]) => {
    if (items === undefined) setOwnItems(next);
    onItemsChange?.(next);
  };

  const write = (
    prop: MixedProperty,
    results: Record<string, MixedPrimitive>,
    kind: MixedChangeKind,
    value: MixedPrimitive,
  ) => {
    const ids = Object.keys(results);
    if (ids.length === 0) return;
    commitItems(
      all.map((it) =>
        results[it.id] !== undefined
          ? {
              ...it,
              values: {
                ...it.values,
                [prop.id]: results[it.id] as MixedPrimitive,
              },
            }
          : it,
      ),
    );
    onChange?.({ property: prop.id, value, ids, values: results, kind });
  };

  const markRecent = (propId: string) => {
    if (recentTimer.current !== null) window.clearTimeout(recentTimer.current);
    setRecentProp(propId);
    recentTimer.current = window.setTimeout(() => {
      recentTimer.current = null;
      setRecentProp(null);
    }, RECENT_MS);
  };

  const setAll = (prop: MixedProperty, value: MixedPrimitive) => {
    if (inert || sel.length === 0) return;
    const results: Record<string, MixedPrimitive> = {};
    for (const id of sel) results[id] = value;
    write(prop, results, "set", value);
    say(
      `${prop.label} set to ${sayValue(value, prop)} on ${sel.length} ${nounFor(sel.length)}.`,
    );
  };

  const nudgeAll = (prop: MixedProperty, delta: number) => {
    if (inert || sel.length === 0 || prop.kind !== "number" || delta === 0) {
      return;
    }
    const results: Record<string, MixedPrimitive> = {};
    for (const id of sel) {
      const cur = all.find((it) => it.id === id)?.values[prop.id];
      if (typeof cur !== "number") continue;
      results[id] = fitNumber(cur + delta, prop);
    }
    write(prop, results, "nudge", delta);
    markRecent(prop.id);
    const after = summarizeMixed(
      all.map((it) =>
        results[it.id] !== undefined
          ? {
              ...it,
              values: {
                ...it.values,
                [prop.id]: results[it.id] as MixedPrimitive,
              },
            }
          : it,
      ),
      sel,
      prop.id,
    );
    const n = Object.keys(results).length;
    say(
      after.length === 1
        ? `${prop.label} nudged by ${signed(delta)} on ${n} ${nounFor(n)}, now ${sayValue(after[0]?.value ?? "", prop)} on all.`
        : `${prop.label} nudged by ${signed(delta)} on ${n} ${nounFor(n)}: now ${listNames(after.map((g) => sayValue(g.value, prop)))}.`,
    );
  };

  const override = (prop: MixedProperty, id: string, value: MixedPrimitive) => {
    if (inert) return;
    const cur = all.find((it) => it.id === id)?.values[prop.id];
    if (cur === value) return;
    write(prop, { [id]: value }, "override", value);
    const after = summarizeMixed(
      all.map((it) =>
        it.id === id
          ? { ...it, values: { ...it.values, [prop.id]: value } }
          : it,
      ),
      sel,
      prop.id,
    );
    say(
      `${prop.label} set to ${sayValue(value, prop)} on ${nameOf(id)}. ${prop.label} is ${after.length > 1 ? "now mixed" : "shared again"}.`,
    );
  };

  const commitDraft = (prop: MixedProperty, text: string, id?: string) => {
    const key = id ? `${prop.id}:${id}` : prop.id;
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const trimmed = text.trim();
    if (trimmed === "" || inert) return;
    if (prop.kind === "color") {
      const hex = normalizeHex(trimmed);
      if (!hex) {
        say(`${trimmed} is not a colour. ${prop.label} unchanged.`);
        return;
      }
      if (id) override(prop, id, hex);
      else setAll(prop, hex);
      return;
    }
    if (prop.kind === "number") {
      const parsed = parseNumber(trimmed);
      if (!parsed) {
        say(`${trimmed} is not a number. ${prop.label} unchanged.`);
        return;
      }
      if (parsed.kind === "relative") {
        if (id) {
          const cur = all.find((it) => it.id === id)?.values[prop.id];
          if (typeof cur === "number") {
            override(prop, id, fitNumber(cur + parsed.delta, prop));
          }
        } else nudgeAll(prop, parsed.delta);
        return;
      }
      const value = fitNumber(parsed.value, prop);
      if (id) override(prop, id, value);
      else setAll(prop, value);
    }
  };

  /* ------------------------------ selection ------------------------------ */

  const setSelection = (ids: string[]) => {
    if (selected === undefined) setOwnSel(ids);
    onSelectionChange?.(ids);
  };

  const toggle = (id: string) => {
    if (inert) return;
    const on = sel.includes(id);
    const next = on ? sel.filter((s) => s !== id) : [...sel, id];
    setSelection(next);
    setPop(null);
    say(
      `${nameOf(id)} ${on ? "removed from" : "added to"} the selection. ${next.length} selected.`,
    );
  };

  const selectAll = () => {
    if (inert || sel.length === all.length) return;
    setSelection(all.map((it) => it.id));
    setPop(null);
    say(`All ${all.length} ${nounFor(all.length)} selected.`);
  };

  const selectNone = () => {
    if (inert || sel.length === 0) return;
    setSelection([]);
    setPop(null);
    say("Nothing selected.");
  };

  const activeId =
    activeOption && all.some((it) => it.id === activeOption)
      ? activeOption
      : (sel[0] ?? all[0]?.id ?? null);

  const onOptionKey = (event: React.KeyboardEvent, id: string) => {
    const ids = all.map((it) => it.id);
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(id);
      return;
    } else if (
      (event.key === "a" || event.key === "A") &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      selectAll();
      return;
    } else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) optionNodes.current.get(target)?.focus();
  };

  /* ------------------------------- popover ------------------------------- */

  const openPop = (propId: string) => {
    const root = rootRef.current;
    const btn = overrideNodes.current.get(propId);
    if (!root || !btn) return;
    if (pop?.property === propId) {
      setPop(null);
      return;
    }
    const rr = root.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const width = Math.round(Math.min(320, rr.width - 16));
    const left = Math.round(
      clamp(br.right - rr.left - width, 8, Math.max(8, rr.width - width - 8)),
    );
    const below = rr.bottom - br.bottom - 8;
    const above = br.top - rr.top - 8;
    if (below >= 160 || below >= above) {
      setPop({
        property: propId,
        left,
        width,
        top: Math.round(br.bottom - rr.top + 6),
        maxHeight: Math.round(Math.max(96, below - 4)),
      });
    } else {
      setPop({
        property: propId,
        left,
        width,
        bottom: Math.round(rr.bottom - br.top + 6),
        maxHeight: Math.round(Math.max(96, above - 4)),
      });
    }
  };

  const closePop = (returnFocus: boolean) => {
    const propId = pop?.property;
    setPop(null);
    if (returnFocus && propId) {
      const node = overrideNodes.current.get(propId);
      if (node?.isConnected) node.focus();
    }
  };

  const popOpenFor = pop?.property ?? null;
  React.useEffect(() => {
    if (!popOpenFor) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (overrideNodes.current.get(popOpenFor)?.contains(target)) return;
      setPop(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [popOpenFor]);

  const [popNode, setPopNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!popNode) return;
    const first = popNode.querySelector<HTMLElement>("input, select");
    first?.focus({ preventScroll: true });
  }, [popNode]);

  const popProp = pop ? properties.find((p) => p.id === pop.property) : null;

  /* -------------------------------- render ------------------------------- */

  const total = all.length;
  const stacked = `@min-[26rem]:grid-cols-[5.5rem_minmax(0,1fr)_auto]`;

  const renderRow = (prop: MixedProperty) => {
    const groups = groupsOf(prop);
    const mixed = groups.length > 1;
    const inputId = `${uid}-f-${prop.id}`;
    const descId = `${uid}-d-${prop.id}`;
    const fanned =
      mixed &&
      (hoverProp === prop.id ||
        focusProp === prop.id ||
        recentProp === prop.id);
    const draft = drafts[prop.id];
    return (
      <div
        key={prop.id}
        data-row={prop.id}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHoverProp(prop.id);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            setHoverProp((h) => (h === prop.id ? null : h));
          }
        }}
        onFocus={() => setFocusProp(prop.id)}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!next || !event.currentTarget.contains(next)) {
            setFocusProp((f) => (f === prop.id ? null : f));
          }
        }}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1",
          stacked,
          d.row,
        )}
      >
        <label
          htmlFor={inputId}
          className={cn(
            "col-span-2 min-w-0 truncate text-ink-2 @min-[26rem]:col-span-1",
            d.label,
          )}
        >
          {prop.label}
        </label>
        <span id={descId} className="sr-only">
          {mixed
            ? `Mixed: ${groups
                .map(
                  (g) =>
                    `${sayValue(g.value, prop)} on ${listNames(g.ids.map(nameOf))}`,
                )
                .join("; ")}. Typing a value sets it on all ${sel.length}.${
                prop.kind === "number"
                  ? " A signed value such as plus 10 nudges every layer."
                  : ""
              }`
            : prop.kind === "number"
              ? "A signed value such as plus 10 nudges every layer. Up and Down nudge by one, with Shift by ten."
              : ""}
        </span>
        <Field
          prop={prop}
          groups={groups}
          draft={draft}
          indicator={indicator}
          d={d}
          motionSafe={motionSafe}
          disabled={inert || sel.length === 0}
          inputId={inputId}
          describedBy={descId}
          onDraft={(text) =>
            setDrafts((prev) => {
              const next = { ...prev };
              if (text === undefined) delete next[prop.id];
              else next[prop.id] = text;
              return next;
            })
          }
          onCommit={(text) => commitDraft(prop, text)}
          onSelect={(value) => setAll(prop, value)}
          onNudge={(delta) => nudgeAll(prop, delta)}
        />
        <button
          ref={(node) => {
            if (node) overrideNodes.current.set(prop.id, node);
            else overrideNodes.current.delete(prop.id);
          }}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={pop?.property === prop.id}
          aria-controls={pop?.property === prop.id ? popId : undefined}
          aria-label={`${prop.label} per layer`}
          title="Per layer"
          aria-disabled={inert || sel.length === 0 || undefined}
          onClick={() => {
            if (!inert && sel.length > 0) openPop(prop.id);
          }}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-2 border border-transparent text-ink-3 transition-colors",
            compactSquare(d),
            inert || sel.length === 0
              ? "cursor-not-allowed"
              : "hover:border-hairline hover:bg-surface-1 hover:text-foreground",
            pop?.property === prop.id &&
              "border-hairline bg-surface-1 text-foreground",
            FOCUS_RING,
          )}
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
        </button>
        <AnimatePresence initial={false}>
          {fanned ? (
            <motion.div
              key="fan"
              initial={live ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              className="col-span-2 overflow-hidden @min-[26rem]:col-span-2 @min-[26rem]:col-start-2"
            >
              <div
                role="group"
                aria-label={`${prop.label} values`}
                className={cn("flex flex-wrap pt-0.5 pb-1", d.gap)}
              >
                <AnimatePresence initial={live} mode="popLayout">
                  {groups.map((group, i) => (
                    <ValueChip
                      key={[...group.ids].sort().join("+")}
                      group={group}
                      prop={prop}
                      names={group.ids.map(nameOf)}
                      index={i}
                      count={groups.length}
                      d={d}
                      motionSafe={motionSafe}
                      disabled={inert}
                      onApply={() => setAll(prop, group.value)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
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
        ["--mv-accent" as string]: accentColor,
        ["--mv-accent-soft" as string]: `color-mix(in oklab, ${accentColor} 45%, transparent)`,
        ["--mv-accent-wash" as string]: `color-mix(in oklab, ${accentColor} 12%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Arrows move between layers. Space or Enter adds a layer to the selection
        or removes it. Control or Command A selects every layer.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                {sel.length} of {total} {nounFor(total)} selected
              </span>
              <Roll
                value={sel.length}
                motionSafe={motionSafe}
                className="font-mono text-[13px] text-foreground"
              />
              <span aria-hidden>of {total}</span>
              <span aria-hidden className="hidden @min-[24rem]:inline">
                selected
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={selectAll}
            aria-disabled={inert || sel.length === total || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
              !inert && sel.length !== total
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <Check aria-hidden className="size-3.5" />
            All
          </button>
          <button
            type="button"
            onClick={selectNone}
            aria-disabled={inert || sel.length === 0 || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
              !inert && sel.length > 0
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            None
          </button>
        </div>
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex flex-col">
          <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 pb-3">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{
                  width: 64 + ((i * 29) % 48),
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
          <div className="grid gap-x-6 px-4 pt-3 @min-[40rem]:grid-cols-2">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2",
                  d.row,
                )}
              >
                <span
                  className="h-3 w-14 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <span
                  className={cn(
                    "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    d.field,
                  )}
                  style={{ animationDelay: `${i * 90 + 40}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The layers didn&apos;t load.
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
          {total > 0 ? (
            <div
              role="listbox"
              aria-label="Layers"
              aria-multiselectable="true"
              aria-describedby={hintId}
              className="flex shrink-0 flex-wrap gap-1.5 border-b border-hairline px-4 pb-3"
            >
              {all.map((item) => {
                const on = sel.includes(item.id);
                return (
                  <button
                    key={item.id}
                    ref={(node) => {
                      if (node) optionNodes.current.set(item.id, node);
                      else optionNodes.current.delete(item.id);
                    }}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-disabled={inert || undefined}
                    tabIndex={activeId === item.id ? 0 : -1}
                    onFocus={() => setActiveOption(item.id)}
                    onClick={() => toggle(item.id)}
                    onKeyDown={(event) => onOptionKey(event, item.id)}
                    className={cn(
                      "relative inline-flex max-w-full items-center gap-1.5 rounded-full border pr-2.5 pl-2 font-medium whitespace-nowrap transition-colors",
                      d.option,
                      inert ? "cursor-not-allowed" : "cursor-pointer",
                      on
                        ? "border-(--mv-accent-soft) bg-(--mv-accent-wash) text-foreground"
                        : "border-hairline bg-transparent text-ink-2 hover:border-hairline-strong hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className="flex shrink-0 items-center"
                      initial={false}
                      animate={{ scale: on ? 1 : 0.86, opacity: on ? 1 : 0.6 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      style={{ color: on ? "var(--mv-accent)" : undefined }}
                    >
                      <Glyph kind={item.kind} />
                    </motion.span>
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="relative flex-1 overflow-y-auto overscroll-contain">
            {total === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <Layers aria-hidden className="size-5 text-ink-3" />
                <p className="text-sm text-ink-2">No layers on this page.</p>
              </div>
            ) : sel.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <Layers aria-hidden className="size-5 text-ink-3" />
                <p className="text-sm text-foreground">Nothing selected</p>
                <p className="max-w-[26ch] text-[12px] text-ink-3">
                  Choose layers above to edit them together.
                </p>
              </div>
            ) : (
              <div className="grid gap-x-6 px-4 pt-2 pb-3 @min-[40rem]:grid-cols-2">
                {sections.map((section, si) => (
                  <section
                    key={section.group || si}
                    aria-label={section.group || undefined}
                    className={cn(
                      "flex min-w-0 flex-col",
                      si > 0 &&
                        "mt-2 border-t border-hairline pt-2 @min-[40rem]:mt-0 @min-[40rem]:border-t-0 @min-[40rem]:pt-0",
                    )}
                  >
                    {section.group ? (
                      <p
                        aria-hidden
                        className="pt-1 pb-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        {section.group}
                      </p>
                    ) : null}
                    {section.props.map(renderRow)}
                  </section>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {pop && popProp ? (
              <motion.div
                key={pop.property}
                ref={(node) => {
                  popRef.current = node;
                  setPopNode(node);
                }}
                id={popId}
                role="dialog"
                aria-label={`${popProp.label} per layer`}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closePop(true);
                  }
                }}
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null;
                  if (
                    next &&
                    !event.currentTarget.contains(next) &&
                    next !== overrideNodes.current.get(pop.property)
                  ) {
                    setPop(null);
                  }
                }}
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                style={{
                  left: pop.left,
                  width: pop.width,
                  top: pop.top,
                  bottom: pop.bottom,
                  maxHeight: pop.maxHeight,
                }}
                className="absolute z-20 flex flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-2 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
              >
                <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {popProp.label} per layer
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => closePop(true)}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {sel.map((id) => {
                    const item = all.find((it) => it.id === id);
                    if (!item) return null;
                    const value = item.values[popProp.id];
                    const key = `${popProp.id}:${id}`;
                    const fieldId = `${uid}-o-${popProp.id}-${id}`;
                    return (
                      <div
                        key={id}
                        className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 px-1"
                      >
                        <label
                          htmlFor={fieldId}
                          className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2"
                        >
                          <Glyph
                            kind={item.kind}
                            className="shrink-0 text-ink-3"
                          />
                          <span className="truncate">{item.name}</span>
                        </label>
                        <Field
                          prop={popProp}
                          groups={
                            value === undefined ? [] : [{ value, ids: [id] }]
                          }
                          draft={drafts[key]}
                          indicator={indicator}
                          d={d}
                          motionSafe={motionSafe}
                          disabled={inert}
                          inputId={fieldId}
                          compact
                          onDraft={(text) =>
                            setDrafts((prev) => {
                              const next = { ...prev };
                              if (text === undefined) delete next[key];
                              else next[key] = text;
                              return next;
                            })
                          }
                          onCommit={(text) => commitDraft(popProp, text, id)}
                          onSelect={(v) => override(popProp, id, v)}
                          onNudge={(delta) => {
                            if (typeof value === "number") {
                              override(
                                popProp,
                                id,
                                fitNumber(value + delta, popProp),
                              );
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}

      <p role="status" className="sr-only">
        {said.text}
      </p>
    </div>
  );
}
