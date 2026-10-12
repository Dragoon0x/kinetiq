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
import { GripVertical, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SieveValue = string | number;

/** One record. `id` is its key; every other field is read by filters and columns. */
export type SieveRow = { id: string; [field: string]: SieveValue };

/**
 * How a filter tests a field: equal, not equal, one of a list, at least, at
 * most, or a date field within some days of `now` (overdue included).
 */
export type SieveOp = "is" | "not" | "in" | "gte" | "lte" | "within";

export type SieveFilter = {
  id: string;
  /** What the layer says: "Priority high or urgent". */
  label: string;
  field: string;
  op: SieveOp;
  value: SieveValue | SieveValue[];
  /** A switched-off layer lets every row through. @default true */
  active?: boolean;
};

export type SieveColumnKind = "code" | "text" | "tag" | "due";

export type SieveColumn = {
  /** The row field this column reads. */
  id: string;
  header: string;
  /** code = mono; tag = a pill; due = a date read against `now`. @default "text" */
  kind?: SieveColumnKind;
  /** Hide the column below this container width. @default "none" */
  hideBelow?: "none" | "sm" | "md" | "lg";
  /** A second field shown under this one when the columns that hold it are hidden. */
  sub?: string;
};

export type SieveStatus = "ready" | "loading" | "error";
export type SieveBandStyle = "hatch" | "tint" | "dashed";
export type SieveDensity = "compact" | "cozy" | "roomy";
export type SievePalette = "ink" | "cobalt" | "ember" | "moss";

export type SieveStackProps = {
  /** Controlled filters, in the order they are applied. */
  filters?: SieveFilter[];
  /** Initial filters when uncontrolled. @default defaultSieveFilters */
  defaultFilters?: SieveFilter[];
  /** Fires with every filter after a switch, reorder or removal. */
  onFiltersChange?: (filters: SieveFilter[]) => void;
  /** The records the stack sieves. @default defaultSieveRows (64 work orders) */
  rows?: SieveRow[];
  /** The table's columns. @default defaultSieveColumns */
  columns?: SieveColumn[];
  /** Fires from the switch or key that turned a layer on or off. */
  onToggle?: (id: string, active: boolean, filters: SieveFilter[]) => void;
  /** Fires from the drop or Alt+Arrow that moved a layer, with the new order. */
  onReorder?: (ids: string[], filters: SieveFilter[]) => void;
  /** Fires from the button or Delete key that removed a layer. */
  onRemove?: (id: string, filters: SieveFilter[]) => void;
  /** Whether the rows have arrived. The stack keeps its shape in every state. @default "ready" */
  status?: SieveStatus;
  /** "Try again" was pressed after the rows failed to load. */
  onRetry?: () => void;
  /** How the rows a layer removes are drawn: diagonal hatching, a flat wash, or a dashed outline. @default "hatch" */
  bandStyle?: SieveBandStyle;
  /** Layer and table row height. @default "cozy" */
  density?: SieveDensity;
  /** The hue of the surviving fill and the removed band. @default "cobalt" */
  palette?: SievePalette;
  /** Delay per layer as returning rows pour down the stack, ms. @default 70 */
  pourStagger?: number;
  /** Today, ms, for due dates. @default defaultSieveNow */
  now?: number;
  /** The heading over the stack. @default "Work orders" */
  title?: string;
  /** What one row is called. @default { one: "work order", other: "work orders" } */
  itemLabel?: { one: string; other: string };
  /** Height of the surface, px; the table scrolls inside it. @default 520 */
  height?: number;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Today on the seeded board: 11 October 2026, 08:00. */
export const defaultSieveNow = Date.UTC(2026, 9, 11, 8);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ASSETS = [
  "Intake pump 2",
  "Settling tank B",
  "Chlorine doser",
  "Sluice gate 4",
  "Outfall valve",
  "Blower 1",
  "Screen rake",
  "Sludge press",
  "Flow meter 7",
  "Backup genset",
  "Clarifier drive",
  "UV bank 3",
];
const SITES = ["Basin East", "North Weir", "Millrace", "South Lagoon"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CREWS = ["Crew A", "Crew B", "Crew C", "Night crew"];

function makeRows(): SieveRow[] {
  const rand = mulberry32(1634);
  const rows: SieveRow[] = [];
  for (let i = 0; i < 64; i += 1) {
    const site = SITES[Math.floor(rand() * SITES.length)] ?? "Basin East";
    const p = rand();
    const priority =
      PRIORITIES[p < 0.16 ? 0 : p < 0.5 ? 1 : p < 0.82 ? 2 : 3] ?? "Normal";
    const done = rand() < 0.28;
    const dueIn = Math.round(rand() * 26) - 5;
    rows.push({
      id: `wo-${i}`,
      code: `WO-${2200 + i * 7 + (i % 5)}`,
      asset: ASSETS[Math.floor(rand() * ASSETS.length)] ?? "Pump",
      site,
      priority,
      status: done ? "Done" : rand() < 0.3 ? "Scheduled" : "Open",
      crew: CREWS[Math.floor(rand() * CREWS.length)] ?? "Crew A",
      due: defaultSieveNow + dueIn * DAY_MS,
    });
  }
  return rows.sort((a, b) => Number(a.due) - Number(b.due));
}

/** Sixty-four Basinworks work orders across four sites, soonest due first. */
export const defaultSieveRows: SieveRow[] = makeRows();

export const defaultSieveFilters: SieveFilter[] = [
  { id: "open", label: "Not done", field: "status", op: "not", value: "Done" },
  {
    id: "east",
    label: "East crews' sites",
    field: "site",
    op: "in",
    value: ["Basin East", "North Weir"],
  },
  {
    id: "priority",
    label: "Priority high or urgent",
    field: "priority",
    op: "in",
    value: ["High", "Urgent"],
  },
  {
    id: "due",
    label: "Due within 14 days",
    field: "due",
    op: "within",
    value: 14,
  },
];

export const defaultSieveColumns: SieveColumn[] = [
  { id: "code", header: "Order", kind: "code" },
  { id: "asset", header: "Asset", sub: "site" },
  { id: "site", header: "Site", hideBelow: "sm" },
  { id: "priority", header: "Priority", kind: "tag", hideBelow: "md" },
  { id: "crew", header: "Crew", hideBelow: "lg" },
  { id: "due", header: "Due", kind: "due" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const exitTransition = { duration: durations.fast, ease: easings.exit };

const plural = (n: number, label: { one: string; other: string }) =>
  `${n} ${n === 1 ? label.one : label.other}`;

function test(row: SieveRow, filter: SieveFilter, now: number): boolean {
  const v = row[filter.field];
  if (v === undefined) return false;
  const want = filter.value;
  switch (filter.op) {
    case "is":
      return v === want;
    case "not":
      return v !== want;
    case "in":
      return Array.isArray(want) ? want.includes(v) : v === want;
    case "gte":
      return Number(v) >= Number(want);
    case "lte":
      return Number(v) <= Number(want);
    case "within":
      return Number(v) - now <= Number(want) * DAY_MS;
    default:
      return true;
  }
}

type Tier = {
  id: string;
  /** Rows reaching this layer. */
  reach: number;
  /** Rows it lets through. */
  pass: number;
};

/**
 * Each layer applied to what survived the layers above it: per layer, how
 * many rows reach it and how many it lets through, and the rows that pass all.
 */
export function sieve(rows: SieveRow[], filters: SieveFilter[], now: number) {
  let pool = rows;
  const tiers: Tier[] = [];
  for (const f of filters) {
    const reach = pool.length;
    if (f.active !== false) pool = pool.filter((row) => test(row, f, now));
    tiers.push({ id: f.id, reach, pass: pool.length });
  }
  return { tiers, survivors: pool };
}

type Paint = { fill: string; band: string };
const PALETTE: Record<SievePalette, Paint> = {
  ink: { fill: "var(--ink-2)", band: "var(--ink-3)" },
  cobalt: { fill: "var(--accent-bright)", band: "var(--accent-bright)" },
  // Pigments: the status hues at a fixed lightness, so a filled bar reads
  // the same on a light page as on a dark one.
  ember: {
    fill: "oklch(from var(--warn) 0.72 0.15 h)",
    band: "oklch(from var(--warn) 0.72 0.15 h)",
  },
  moss: {
    fill: "oklch(from var(--success) 0.66 0.13 h)",
    band: "oklch(from var(--success) 0.66 0.13 h)",
  },
};

const BAND_CLASS: Record<SieveBandStyle, string> = {
  hatch:
    "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--ss-band)_60%,transparent)_0_2px,color-mix(in_oklab,var(--ss-band)_10%,transparent)_2px_5px)]",
  tint: "bg-[color-mix(in_oklab,var(--ss-band)_28%,transparent)]",
  dashed:
    "border border-dashed border-[color-mix(in_oklab,var(--ss-band)_75%,transparent)] bg-transparent",
};

const LAYER_H: Record<SieveDensity, string> = {
  compact: "h-9 @max-[30rem]:h-8",
  cozy: "h-11 @max-[30rem]:h-9",
  roomy: "h-13 @max-[30rem]:h-10",
};
const ROW_PAD: Record<SieveDensity, string> = {
  compact: "py-1.5",
  cozy: "py-2",
  roomy: "py-3",
};
const GAP = 6;

const HIDE: Record<NonNullable<SieveColumn["hideBelow"]>, string> = {
  none: "",
  sm: "hidden @min-[30rem]:table-cell",
  md: "hidden @min-[40rem]:table-cell",
  lg: "hidden @min-[56rem]:table-cell",
};
const SHOW_SUB: Record<NonNullable<SieveColumn["hideBelow"]>, string> = {
  none: "hidden",
  sm: "@min-[30rem]:hidden",
  md: "@min-[40rem]:hidden",
  lg: "@min-[56rem]:hidden",
};

function dueText(now: number, at: number): { text: string; late: boolean } {
  const days = Math.round((at - now) / DAY_MS);
  if (days === 0) return { text: "today", late: false };
  if (days < 0) return { text: `${-days}d late`, late: true };
  return { text: `in ${days}d`, late: false };
}

const PRIORITY_TONE: Record<string, string> = {
  Urgent: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
  High: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-warn",
};

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.RefObject<T | null>).current = node;
}

/* ----------------------------------------------------------------------- */
/*                               Rolling count                             */
/* ----------------------------------------------------------------------- */

/** A count that runs to its new figure on a base tween, rendered as text. */
function Rolling({
  value,
  motionSafe,
  delay = 0,
  className,
}: {
  value: number;
  motionSafe: boolean;
  delay?: number;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: durations.base,
      ease: easings.enter,
      delay,
    });
    return () => controls.stop();
  }, [delay, motionSafe, mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                   Bar                                   */
/* ----------------------------------------------------------------------- */

/**
 * One layer's bar: what passes as a solid fill from the left, what this layer
 * removes as a band right after it, bare track beyond. Widths (not scale) so
 * the hatching never squashes; both ride the same glide with the same delay,
 * so the band's left edge stays glued to the fill.
 */
function Bar({
  pass,
  reach,
  total,
  bandStyle,
  delay,
  motionSafe,
  muted,
  loading,
}: {
  pass: number;
  reach: number;
  total: number;
  bandStyle: SieveBandStyle;
  delay: number;
  motionSafe: boolean;
  muted?: boolean;
  loading?: boolean;
}) {
  const t = Math.max(1, total);
  const fill = r3((pass / t) * 100);
  const band = r3(((reach - pass) / t) * 100);
  const transition = motionSafe
    ? { ...springs.glide, delay }
    : { duration: durations.fast, ease: easings.enter };
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden rounded-2 bg-[color-mix(in_oklab,var(--ss-fill)_7%,transparent)] @min-[30rem]:relative @min-[30rem]:inset-auto @min-[30rem]:block @min-[30rem]:h-2.5 @min-[30rem]:min-w-0 @min-[30rem]:flex-1 @min-[30rem]:rounded-full @min-[30rem]:bg-surface-2"
    >
      {loading ? (
        <span className="absolute inset-y-0 left-0 w-3/5 rounded-full bg-[color-mix(in_oklab,var(--ss-fill)_14%,transparent)] motion-safe:animate-pulse" />
      ) : (
        <>
          <motion.span
            className={cn(
              "absolute inset-y-0 left-0 opacity-20 @min-[30rem]:rounded-full @min-[30rem]:opacity-100",
              muted ? "bg-ink-3/60" : "bg-(--ss-fill)",
            )}
            initial={false}
            animate={{ width: `${fill}%` }}
            transition={transition}
          />
          <motion.span
            className={cn(
              "absolute inset-y-0 rounded-[3px] opacity-60 @min-[30rem]:opacity-100",
              BAND_CLASS[bandStyle],
            )}
            initial={false}
            animate={{ left: `${fill}%`, width: `${band}%` }}
            transition={transition}
          />
        </>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Layer                                  */
/* ----------------------------------------------------------------------- */

type LayerHandle = {
  y: MotionValue<number>;
  node: HTMLLIElement | null;
};

type LayerProps = {
  /** AnimatePresence's popLayout measures the leaving layer through this. */
  ref?: React.Ref<HTMLLIElement>;
  filter: SieveFilter;
  index: number;
  count: number;
  tier: Tier;
  total: number;
  delay: number;
  status: SieveStatus;
  bandStyle: SieveBandStyle;
  density: SieveDensity;
  motionSafe: boolean;
  disabled: boolean;
  itemLabel: { one: string; other: string };
  register: (id: string, handle: LayerHandle | null) => void;
  bindControl: (key: string, node: HTMLButtonElement | null) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveBy: (id: string, by: number, focusKey: string) => void;
  onWalk: (id: string, by: number) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, offset: number) => void;
  onDragEnd: (id: string, velocity: number) => void;
  onDragCancel: (id: string) => void;
  dragging: boolean;
};

function Layer({
  ref,
  filter,
  index,
  count,
  tier,
  total,
  delay,
  status,
  bandStyle,
  density,
  motionSafe,
  disabled,
  itemLabel,
  register,
  bindControl,
  onToggle,
  onRemove,
  onMoveBy,
  onWalk,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  dragging,
}: LayerProps) {
  const y = useMotionValue(0);
  const nodeRef = React.useRef<HTMLLIElement | null>(null);
  const setNode = React.useCallback(
    (node: HTMLLIElement | null) => {
      nodeRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  const on = filter.active !== false;
  const ready = status === "ready";
  const removed = tier.reach - tier.pass;
  const share = tier.reach > 0 ? Math.round((removed / tier.reach) * 100) : 0;

  React.useLayoutEffect(() => {
    register(filter.id, { y, node: nodeRef.current });
    return () => register(filter.id, null);
  }, [filter.id, register, y]);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => onDragStart(filter.id),
    onMove: ({ offset }) => onDragMove(filter.id, offset.y),
    onEnd: ({ velocity }) => onDragEnd(filter.id, velocity.y),
    onCancel: () => onDragCancel(filter.id),
  });

  /** Keys every control in the layer shares: Alt+arrows move it, Delete removes. */
  const shared = (event: React.KeyboardEvent, key: string) => {
    if (disabled) return false;
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      onMoveBy(filter.id, event.key === "ArrowUp" ? -1 : 1, key);
      return true;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(filter.id);
      return true;
    }
    return false;
  };

  const verdict = !ready
    ? status === "loading"
      ? "counting"
      : "count unavailable"
    : on
      ? `removes ${removed}, ${plural(tier.pass, itemLabel)} remain`
      : "off";

  return (
    <motion.li
      ref={setNode}
      style={{ y, zIndex: dragging ? 3 : 1 }}
      initial={false}
      animate={{ scale: dragging && motionSafe ? 1.015 : 1 }}
      exit={{ opacity: 0, transition: exitTransition }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
      className={cn(
        "relative flex items-center gap-2 rounded-3 border bg-card px-1.5 @min-[30rem]:gap-3 @min-[30rem]:pr-2",
        LAYER_H[density],
        "transition-shadow duration-150",
        dragging
          ? "border-hairline-strong shadow-[0_10px_24px_color-mix(in_oklab,black_16%,transparent)]"
          : "border-hairline",
      )}
    >
      <button
        ref={(node) => bindControl(`${filter.id}:grip`, node)}
        type="button"
        disabled={disabled}
        aria-label={`Move ${filter.label} filter, ${index + 1} of ${count}`}
        onKeyDown={(event) => {
          if (shared(event, "grip")) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onMoveBy(filter.id, event.key === "ArrowUp" ? -1 : 1, "grip");
          }
        }}
        {...drag}
        className={cn(
          "relative z-[1] flex h-7 w-5 shrink-0 cursor-grab touch-pan-x items-center justify-center rounded-1 text-ink-3 transition-colors hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed",
          FOCUS_RING,
        )}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <button
        ref={(node) => bindControl(`${filter.id}:switch`, node)}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${filter.label}, ${verdict}`}
        disabled={disabled}
        onClick={() => onToggle(filter.id)}
        onKeyDown={(event) => {
          if (shared(event, "switch")) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onWalk(filter.id, event.key === "ArrowUp" ? -1 : 1);
          }
        }}
        className={cn(
          "relative z-[1] flex h-4 w-7 shrink-0 items-center rounded-full border p-0.5 transition-colors disabled:opacity-50",
          on
            ? "border-transparent bg-(--ss-fill)"
            : "border-hairline-strong bg-surface-2",
          FOCUS_RING,
        )}
      >
        <motion.span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full shadow-sm",
            on ? "bg-background" : "bg-ink-3",
          )}
          initial={false}
          animate={{ x: on ? 12 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </button>
      <span className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center @min-[30rem]:w-40 @min-[30rem]:flex-none @min-[48rem]:w-52">
        <span
          title={filter.label}
          className={cn(
            "truncate text-[13px] leading-tight font-medium transition-colors",
            on ? "text-foreground" : "text-ink-3",
          )}
        >
          {filter.label}
        </span>
        <span className="hidden truncate font-mono text-[10.5px] leading-tight text-ink-3 tabular-nums @min-[30rem]:block">
          {!ready
            ? "—"
            : on
              ? `−${removed} · ${share}%`
              : "off · lets all through"}
        </span>
      </span>
      <Bar
        pass={tier.pass}
        reach={tier.reach}
        total={total}
        bandStyle={bandStyle}
        delay={delay}
        motionSafe={motionSafe}
        muted={!on}
        loading={status === "loading"}
      />
      <span className="relative z-[1] w-8 shrink-0 text-right font-mono text-[13px] text-foreground tabular-nums">
        {ready ? (
          <Rolling value={tier.pass} motionSafe={motionSafe} delay={delay} />
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </span>
      <button
        ref={(node) => bindControl(`${filter.id}:remove`, node)}
        type="button"
        disabled={disabled}
        aria-label={`Remove ${filter.label} filter`}
        onClick={() => onRemove(filter.id)}
        onKeyDown={(event) => {
          shared(event, "remove");
        }}
        className={cn(
          "relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
          FOCUS_RING,
        )}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

type DragState = {
  id: string;
  from: number;
  pitch: number;
  offset: number;
  target: number;
  shifts: Map<string, number>;
};

/**
 * Active filters stacked as layers above a table, each applied to what
 * survived the layers above it, so each layer's bar shows exactly what it
 * costs: the rows it lets through as a solid fill, the rows it removes as a
 * shaded band right after them, and bare track for what earlier layers took.
 * Read down, the bars step in like a sieve.
 *
 * Switching a layer off collapses its band and the returning rows pour back
 * down the stack: every layer beneath widens on `glide`, each a `pourStagger`
 * later than the one above, and the table admits the returning rows in a
 * cascade once the pour reaches the bottom. A layer's grip drags it 1:1 (y,
 * rubber-banded past the ends) while its neighbours slide aside on `glide`;
 * the release settles on `glide` with the throw's velocity, and the bands
 * re-divide, because the cost of a filter depends on what came before it.
 * Alt+Arrow moves a layer from any of its controls, Delete removes it.
 */
export function SieveStack({
  filters: filtersProp,
  defaultFilters = defaultSieveFilters,
  onFiltersChange,
  rows = defaultSieveRows,
  columns = defaultSieveColumns,
  onToggle,
  onReorder,
  onRemove,
  status = "ready",
  onRetry,
  bandStyle = "hatch",
  density = "cozy",
  palette = "cobalt",
  pourStagger = 70,
  now = defaultSieveNow,
  title = "Work orders",
  itemLabel = { one: "work order", other: "work orders" },
  height = 520,
  disabled = false,
  className,
}: SieveStackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const stackId = `${uid}-stack`;

  const [own, setOwn] = React.useState<SieveFilter[]>(defaultFilters);
  const filters = filtersProp ?? own;
  const [pour, setPour] = React.useState<{ from: number } | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const handles = React.useRef(new Map<string, LayerHandle>());
  const controls = React.useRef(new Map<string, HTMLButtonElement>());
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const flips = React.useRef<Map<string, { offset: number; velocity: number }>>(
    new Map(),
  );
  const refocus = React.useRef<string | null>(null);
  const drag = React.useRef<DragState | null>(null);

  const ready = status === "ready";
  const { tiers, survivors } = React.useMemo(
    () => sieve(rows, filters, now),
    [filters, now, rows],
  );

  const stagger = motionSafe ? Math.max(0, pourStagger) / 1000 : 0;
  const delayFor = (index: number) =>
    pour && index > pour.from ? (index - pour.from) * stagger : 0;
  const admit = pour && motionSafe ? (filters.length - pour.from) * stagger : 0;

  const register = React.useCallback(
    (id: string, handle: LayerHandle | null) => {
      if (handle) handles.current.set(id, handle);
      else handles.current.delete(id);
    },
    [],
  );
  const bindControl = React.useCallback(
    (key: string, node: HTMLButtonElement | null) => {
      if (node) controls.current.set(key, node);
      else controls.current.delete(key);
    },
    [],
  );

  const run = (id: string, to: number, velocity = 0) => {
    const handle = handles.current.get(id);
    if (!handle) return;
    running.current.get(id)?.stop();
    if (!motionSafe) {
      handle.y.jump(to);
      return;
    }
    running.current.set(
      id,
      animate(handle.y, to, { ...springs.glide, velocity }),
    );
  };

  // After an order change lands in the DOM, every moved layer starts from
  // where it was drawn and glides home. Written straight to the node too, so
  // the first painted frame is already right (motion's own write follows on
  // the next frame with the same value).
  React.useLayoutEffect(() => {
    if (flips.current.size === 0) return;
    for (const [id, { offset, velocity }] of flips.current) {
      const handle = handles.current.get(id);
      if (!handle) continue;
      running.current.get(id)?.stop();
      handle.y.jump(offset);
      if (handle.node) handle.node.style.transform = `translateY(${offset}px)`;
      run(id, 0, velocity);
    }
    flips.current.clear();
    const key = refocus.current;
    refocus.current = null;
    if (key) {
      const node = controls.current.get(key);
      if (node?.isConnected && document.activeElement !== node) node.focus();
    }
  });

  React.useEffect(() => {
    const live = running.current;
    return () => {
      for (const c of live.values()) c.stop();
      live.clear();
    };
  }, []);

  const commit = (next: SieveFilter[]) => {
    if (filtersProp === undefined) setOwn(next);
    onFiltersChange?.(next);
  };

  const survivorsOf = (next: SieveFilter[]) =>
    sieve(rows, next, now).survivors.length;

  const toggle = (id: string) => {
    if (disabled) return;
    const index = filters.findIndex((f) => f.id === id);
    const f = filters[index];
    if (!f) return;
    const active = f.active === false;
    const next = filters.map((x) => (x.id === id ? { ...x, active } : x));
    setPour({ from: index });
    commit(next);
    onToggle?.(id, active, next);
    setAnnouncement(
      `${f.label} ${active ? "on" : "off"}. ${plural(survivorsOf(next), itemLabel)} pass.`,
    );
  };

  const pitchOf = () => {
    const first = filters[0] && handles.current.get(filters[0].id)?.node;
    return (first?.offsetHeight ?? 44) + GAP;
  };

  /** Moves a layer, carrying every layer whose slot changes on a FLIP. */
  const reorder = (
    from: number,
    to: number,
    visual: Map<string, number>,
    velocity: number,
    focusKey: string | null,
  ) => {
    const next = [...filters];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    const pitch = pitchOf();
    next.forEach((f, newIndex) => {
      const oldIndex = filters.findIndex((x) => x.id === f.id);
      const drawn = oldIndex * pitch + (visual.get(f.id) ?? 0);
      // Every layer is re-based, even one already drawn in its new slot: a
      // neighbour that slid aside during a drag carries that slide in its y.
      flips.current.set(f.id, {
        offset: Math.round((drawn - newIndex * pitch) * 100) / 100,
        velocity: f.id === moved.id ? velocity : 0,
      });
    });
    refocus.current = focusKey;
    setPour({ from: Math.min(from, to) });
    commit(next);
    onReorder?.(
      next.map((f) => f.id),
      next,
    );
    const tier = sieve(rows, next, now).tiers[to];
    const cost = tier ? tier.reach - tier.pass : 0;
    setAnnouncement(
      `${moved.label} moved to ${to + 1} of ${next.length}. It removes ${cost} there.`,
    );
  };

  const moveBy = (id: string, by: number, key: string) => {
    if (disabled) return;
    const from = filters.findIndex((f) => f.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= filters.length) return;
    reorder(from, to, new Map(), 0, `${id}:${key}`);
  };

  const walk = (id: string, by: number) => {
    const at = filters.findIndex((f) => f.id === id);
    const target = filters[at + by];
    if (target) controls.current.get(`${target.id}:switch`)?.focus();
  };

  const remove = (id: string) => {
    if (disabled) return;
    const index = filters.findIndex((f) => f.id === id);
    const f = filters[index];
    if (!f) return;
    const next = filters.filter((x) => x.id !== id);
    const pitch = pitchOf();
    // The layer is lifted out of the flow at once; the ones beneath start one
    // slot lower than their new place and glide up into the gap.
    next.forEach((x, i) => {
      if (i >= index) flips.current.set(x.id, { offset: pitch, velocity: 0 });
    });
    const neighbour = next[index] ?? next[index - 1];
    refocus.current = neighbour ? `${neighbour.id}:switch` : null;
    setPour({ from: Math.max(0, index - 1) });
    commit(next);
    onRemove?.(id, next);
    setAnnouncement(
      `${f.label} removed. ${plural(survivorsOf(next), itemLabel)} pass.`,
    );
  };

  /* ------------------------------ drag ---------------------------------- */

  const dragStart = (id: string) => {
    const from = filters.findIndex((f) => f.id === id);
    if (from < 0) return;
    for (const c of running.current.values()) c.stop();
    drag.current = {
      id,
      from,
      pitch: pitchOf(),
      offset: 0,
      target: from,
      shifts: new Map(),
    };
    setDragId(id);
  };

  const dragMove = (id: string, offset: number) => {
    const d = drag.current;
    if (!d || d.id !== id) return;
    const min = -d.from * d.pitch;
    const max = (filters.length - 1 - d.from) * d.pitch;
    const y = rubberClamp(offset, min, max, d.pitch);
    d.offset = y;
    handles.current.get(id)?.y.set(Math.round(y * 100) / 100);
    const target = Math.max(
      0,
      Math.min(filters.length - 1, Math.round(d.from + y / d.pitch)),
    );
    if (target === d.target) return;
    d.target = target;
    filters.forEach((f, i) => {
      if (f.id === id) return;
      const shift =
        d.from < i && i <= target
          ? -d.pitch
          : target <= i && i < d.from
            ? d.pitch
            : 0;
      if ((d.shifts.get(f.id) ?? 0) !== shift) {
        d.shifts.set(f.id, shift);
        run(f.id, shift);
      }
    });
  };

  const dragEnd = (id: string, velocity: number) => {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d || d.id !== id) return;
    // A throw commits to where it was heading, not only where it let go.
    const landing = project(d.offset, velocity, 0.99);
    const to = Math.max(
      0,
      Math.min(filters.length - 1, Math.round(d.from + landing / d.pitch)),
    );
    if (to === d.from) {
      for (const f of filters) run(f.id, 0, f.id === id ? velocity : 0);
      return;
    }
    const visual = new Map<string, number>();
    for (const f of filters) {
      visual.set(f.id, handles.current.get(f.id)?.y.get() ?? 0);
    }
    reorder(d.from, to, visual, velocity, `${id}:grip`);
  };

  const dragCancel = (id: string) => {
    if (drag.current && drag.current.id !== id) return;
    drag.current = null;
    setDragId(null);
    for (const f of filters) run(f.id, 0);
  };

  /* ------------------------------ table --------------------------------- */

  // The layer whose removal would admit the most rows: the one to loosen.
  const costliest = React.useMemo(() => {
    let best: { filter: SieveFilter; gain: number } | null = null;
    for (const f of filters) {
      if (f.active === false) continue;
      const gain = sieve(
        rows,
        filters.map((x) => (x.id === f.id ? { ...x, active: false } : x)),
        now,
      ).survivors.length;
      if (!best || gain > best.gain) best = { filter: f, gain };
    }
    return best;
  }, [filters, now, rows]);

  const paint = PALETTE[palette] ?? PALETTE.cobalt;
  const step = cascade(Math.min(survivors.length, 10));

  const cell = (row: SieveRow, column: SieveColumn) => {
    const v = row[column.id];
    if (column.kind === "due") {
      const due = dueText(now, Number(v));
      return (
        <span
          className={cn(
            "font-mono text-[11.5px] tabular-nums",
            due.late ? "text-danger" : "text-ink-2",
          )}
        >
          {due.text}
        </span>
      );
    }
    if (column.kind === "tag") {
      return (
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[11px]",
            PRIORITY_TONE[String(v)] ?? "bg-surface-2 text-ink-2",
          )}
        >
          {String(v)}
        </span>
      );
    }
    if (column.kind === "code") {
      return (
        <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
          {String(v)}
        </span>
      );
    }
    const sub = column.sub
      ? columns.find((c) => c.id === column.sub)
      : undefined;
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-foreground" title={String(v)}>
          {String(v)}
        </span>
        {sub ? (
          <span
            className={cn(
              "truncate text-[11px] text-ink-3",
              SHOW_SUB[sub.hideBelow ?? "none"],
            )}
          >
            {String(row[sub.id] ?? "")}
          </span>
        ) : null}
      </span>
    );
  };

  const tableBody = () => {
    if (status === "loading") {
      return Array.from({ length: 6 }, (_, i) => (
        <tr key={`sk-${i}`} aria-hidden className="border-b border-hairline">
          {columns.map((c, ci) => (
            <td
              key={c.id}
              className={cn(
                "px-3",
                ROW_PAD[density],
                HIDE[c.hideBelow ?? "none"],
              )}
            >
              <span
                className="block h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${40 + ((i * 31 + ci * 17) % 50)}%` }}
              />
            </td>
          ))}
        </tr>
      ));
    }
    if (status === "error") {
      return (
        <tr>
          <td colSpan={columns.length} className="px-4 py-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The {itemLabel.other} did not load.
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
          </td>
        </tr>
      );
    }
    if (survivors.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length} className="px-4 py-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="max-w-xs text-sm text-ink-2">
                {rows.length === 0
                  ? `No ${itemLabel.other} yet.`
                  : costliest
                    ? `Nothing gets through. Switching off ${costliest.filter.label} lets ${costliest.gain} through.`
                    : "Nothing gets through."}
              </p>
              {costliest && rows.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(costliest.filter.id)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  Switch off {costliest.filter.label}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    }
    return (
      <AnimatePresence initial={false}>
        {survivors.map((row, index) => (
          <motion.tr
            key={row.id}
            layout={motionSafe ? "position" : false}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={{
              layout: motionSafe ? springs.glide : { duration: 0 },
              y: motionSafe
                ? {
                    ...springs.glide,
                    delay: admit + Math.min(index, 10) * step,
                  }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: motionSafe ? admit + Math.min(index, 10) * step : 0,
              },
            }}
            className="border-b border-hairline bg-card"
          >
            {columns.map((c) => (
              <td
                key={c.id}
                className={cn(
                  "px-3 align-middle first:pl-4 last:pr-4",
                  ROW_PAD[density],
                  HIDE[c.hideBelow ?? "none"],
                  c.kind === "due" && "text-right",
                )}
              >
                {cell(row, c)}
              </td>
            ))}
          </motion.tr>
        ))}
      </AnimatePresence>
    );
  };

  const total = rows.length;

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ss-fill" as string]: paint.fill,
        ["--ss-band" as string]: paint.band,
      }}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <p
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {title}
        </p>
        <p className="shrink-0 text-[11px] text-ink-3">
          {ready ? (
            <>
              <Rolling
                value={survivors.length}
                motionSafe={motionSafe}
                delay={admit}
                className="font-mono text-[13px] text-foreground tabular-nums"
              />{" "}
              of {total} pass
            </>
          ) : status === "loading" ? (
            `Loading ${itemLabel.other}`
          ) : (
            "Counts unavailable"
          )}
        </p>
      </header>

      <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-3">
        <div
          aria-hidden
          className={cn(
            "relative flex items-center gap-2 rounded-3 px-1.5 @min-[30rem]:gap-3 @min-[30rem]:pr-2",
            LAYER_H[density],
          )}
        >
          <span className="relative z-[1] w-5 shrink-0" />
          <span className="relative z-[1] w-7 shrink-0" />
          <span className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center @min-[30rem]:w-40 @min-[30rem]:flex-none @min-[48rem]:w-52">
            <span className="truncate text-[13px] leading-tight text-ink-2">
              All {itemLabel.other}
            </span>
            <span className="hidden font-mono text-[10.5px] leading-tight text-ink-3 @min-[30rem]:block">
              before any filter
            </span>
          </span>
          <Bar
            pass={total}
            reach={total}
            total={total}
            bandStyle={bandStyle}
            delay={0}
            motionSafe={motionSafe}
            muted
            loading={status === "loading"}
          />
          <span className="relative z-[1] w-8 shrink-0 text-right font-mono text-[13px] text-ink-2 tabular-nums">
            {ready ? total : "—"}
          </span>
          <span className="relative z-[1] size-6 shrink-0" />
        </div>
        <ul
          id={stackId}
          role="list"
          aria-label="Filters, applied top to bottom"
          className="relative flex flex-col gap-1.5"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {filters.map((f, index) => (
              <Layer
                key={f.id}
                filter={f}
                index={index}
                count={filters.length}
                tier={tiers[index] ?? { id: f.id, reach: 0, pass: 0 }}
                total={total}
                delay={delayFor(index)}
                status={status}
                bandStyle={bandStyle}
                density={density}
                motionSafe={motionSafe}
                disabled={disabled}
                itemLabel={itemLabel}
                register={register}
                bindControl={bindControl}
                onToggle={toggle}
                onRemove={remove}
                onMoveBy={moveBy}
                onWalk={walk}
                onDragStart={dragStart}
                onDragMove={dragMove}
                onDragEnd={dragEnd}
                onDragCancel={dragCancel}
                dragging={dragId === f.id}
              />
            ))}
          </AnimatePresence>
        </ul>
        {filters.length === 0 ? (
          <p className="px-2 py-1 text-xs text-ink-3">
            No filters. Every {itemLabel.one} gets through.
          </p>
        ) : null}
      </div>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <caption className="sr-only">
            {ready
              ? `${plural(survivors.length, itemLabel)} that pass every filter`
              : title}
          </caption>
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-hairline">
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    "h-8 px-3 text-left font-mono text-[10px] font-normal tracking-[0.08em] text-ink-3 uppercase first:pl-4 last:pr-4",
                    HIDE[c.hideBelow ?? "none"],
                    c.kind === "code" && "w-[5.5rem]",
                    c.kind === "tag" && "w-24",
                    c.kind === "due" && "w-20 text-right",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={status === "loading" || undefined}>
            {tableBody()}
          </tbody>
        </table>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
