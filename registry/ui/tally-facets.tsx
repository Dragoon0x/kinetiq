"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Bookmark,
  Check,
  Inbox,
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
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TallyTone = "neutral" | "accent" | "success" | "warn" | "danger";

export type TallyFacetValue = {
  /** Matches `row.facets[facet.id]`. */
  id: string;
  label: string;
  /** Colour of the pill when this facet is the row's badge. @default "neutral" */
  tone?: TallyTone;
};

export type TallyFacet = {
  id: string;
  /** The group heading. */
  label: string;
  /** Values in the order to list them. Omitted, they are read from the rows, largest first. */
  values?: TallyFacetValue[];
  /** Show this facet's value as a pill on each result row. @default false */
  badge?: boolean;
};

export type TallyRow = {
  id: string;
  /** The result's main line: the customer. */
  title: string;
  /** Order number or code, set in the mono face. */
  code: string;
  amount: number;
  /** When the order was placed, ms since the epoch. */
  at: number;
  /** The row's value id in each facet, keyed by facet id. */
  facets: Record<string, string>;
};

/** Picked value ids, keyed by facet id. */
export type TallySelection = Record<string, string[]>;

export type TallyChange = {
  facetId: string;
  valueId: string;
  selected: boolean;
  selection: TallySelection;
};

export type TallyStatus = "ready" | "loading" | "error";
export type TallyDensity = "compact" | "cozy" | "roomy";
export type TallyBarStyle = "bar" | "line" | "fill";

export type TallyFacetsProps = {
  /** The facets, in order. @default defaultTallyFacets */
  facets?: TallyFacet[];
  /** The records counted and listed. @default defaultTallyRows (64 Coldbrook orders) */
  rows?: TallyRow[];
  /** Controlled selection: value ids by facet id. */
  value?: TallySelection;
  /** Initial selection when uncontrolled. @default {} */
  defaultValue?: TallySelection;
  /** Fires with the whole selection after every pick, clear or chip removal. */
  onValueChange?: (selection: TallySelection) => void;
  /** Fires once per decision: which value, whether it is now picked, and the selection. */
  onChange?: (change: TallyChange) => void;
  /** Fires when Clear empties the selection. */
  onClear?: () => void;
  /** Fires from Save view with the current selection. */
  onSaveView?: (selection: TallySelection) => void;
  /** Whether the counts are current. Loading stripes the bars; error keeps the last counts with a retry. @default "ready" */
  status?: TallyStatus;
  /** "Retry" was pressed after a failed refresh. */
  onRetry?: () => void;
  /** Row height and type size of the facet values. @default "cozy" */
  density?: TallyDensity;
  /** How a count is drawn: a slim bar under the label, a hairline rule, or a wash behind the row. @default "bar" */
  barStyle?: TallyBarStyle;
  /** Checks, bars and the live count, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Values that would return nothing sink to the foot of their group. @default true */
  sinkEmpty?: boolean;
  /** Today, ms, for "3d ago". @default defaultTallyNow */
  now?: number;
  /** Formats an amount. @default whole US dollars */
  formatAmount?: (amount: number) => string;
  /** The heading over the results. @default "Orders" */
  title?: string;
  /** What one row is called. @default { one: "order", other: "orders" } */
  itemLabel?: { one: string; other: string };
  /** Height of the surface, px; the facets and results scroll inside it. @default 520 */
  height?: number;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Today in the seeded ledger: 11 October 2026. */
export const defaultTallyNow = Date.UTC(2026, 9, 11, 9);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultTallyFacets: TallyFacet[] = [
  {
    id: "region",
    label: "Region",
    values: [
      { id: "north", label: "North" },
      { id: "south", label: "South" },
      { id: "east", label: "East" },
      { id: "west", label: "West" },
      { id: "harbour", label: "Harbour" },
    ],
  },
  {
    id: "status",
    label: "Status",
    badge: true,
    values: [
      { id: "new", label: "New", tone: "accent" },
      { id: "packed", label: "Packed", tone: "neutral" },
      { id: "shipped", label: "Shipped", tone: "warn" },
      { id: "delivered", label: "Delivered", tone: "success" },
      { id: "returned", label: "Returned", tone: "danger" },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    values: [
      { id: "ines", label: "Ines Park" },
      { id: "tomas", label: "Tomas Reyes" },
      { id: "ada", label: "Ada Moreau" },
      { id: "kofi", label: "Kofi Mensah" },
    ],
  },
  {
    id: "channel",
    label: "Channel",
    values: [
      { id: "web", label: "Web" },
      { id: "phone", label: "Phone" },
      { id: "partner", label: "Partner" },
      { id: "wholesale", label: "Wholesale" },
    ],
  },
];

const CUSTOMERS = [
  "Larkfield Grocers",
  "Pell & Daughters",
  "Mossgate Café",
  "Tern Street Deli",
  "Hollow Oak Market",
  "Brindle Bakehouse",
  "Saltmarsh Kitchen",
  "Quarry Lane Foods",
  "Juniper Hall",
  "Old Mill Pantry",
  "Fennick Provisions",
  "Wrenwood Inn",
];

/**
 * Which channels and owners serve each region. The ties are deliberate: the
 * harbour is wholesale and partner trade looked after by one person, so
 * picking it empties whole groups elsewhere and the cross-filter shows.
 */
const REGION_TIES: Record<string, { channels: string[]; owners: string[] }> = {
  north: { channels: ["web", "wholesale", "phone"], owners: ["ines", "tomas"] },
  south: { channels: ["web", "phone"], owners: ["tomas", "ada"] },
  east: { channels: ["web", "partner", "phone"], owners: ["ada", "kofi"] },
  west: { channels: ["web", "partner"], owners: ["ines", "kofi"] },
  harbour: { channels: ["wholesale", "partner"], owners: ["kofi"] },
};
const REGION_WEIGHTS: [string, number][] = [
  ["north", 0.28],
  ["south", 0.2],
  ["east", 0.2],
  ["west", 0.18],
  ["harbour", 0.14],
];

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))] as T;
}

function weighted(list: [string, number][], r: number): string {
  let acc = 0;
  for (const [id, w] of list) {
    acc += w;
    if (r < acc) return id;
  }
  return list[list.length - 1]?.[0] ?? "";
}

function makeRows(): TallyRow[] {
  const rand = mulberry32(1633);
  const rows: TallyRow[] = [];
  for (let i = 0; i < 64; i += 1) {
    const region = weighted(REGION_WEIGHTS, rand());
    const ties = REGION_TIES[region] ?? { channels: ["web"], owners: ["ines"] };
    const channel = pick(ties.channels, rand());
    const owner = pick(ties.owners, rand());
    const age = Math.floor(rand() * 30);
    // Older orders have travelled further; returns only come back from the
    // channels a shopper can send a parcel back through.
    const flow =
      age < 3
        ? ["new", "packed"]
        : age < 8
          ? ["packed", "shipped"]
          : age < 16
            ? ["shipped", "delivered"]
            : channel === "web" || channel === "phone"
              ? ["delivered", "delivered", "returned"]
              : ["delivered"];
    let status = pick(flow, rand());
    if (channel === "wholesale" && status === "new") status = "packed";
    const amount =
      channel === "wholesale"
        ? 900 + Math.round(rand() * 32) * 50
        : 60 + Math.round(rand() * 46) * 20;
    rows.push({
      id: `o-${i}`,
      code: `CB-${10_400 + ((i * 37) % 97) + i * 3}`,
      title: pick(CUSTOMERS, rand()),
      amount,
      at: defaultTallyNow - age * DAY_MS - Math.floor(rand() * 20) * 3_600_000,
      facets: { region, status, owner, channel },
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

/** Sixty-four Coldbrook orders from the last thirty days, newest first. */
export const defaultTallyRows: TallyRow[] = makeRows();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (amount: number) => USD.format(amount);

const r3 = (v: number) => Math.round(v * 1000) / 1000;

const exitTransition = { duration: durations.fast, ease: easings.exit };

const plural = (n: number, label: { one: string; other: string }) =>
  `${n} ${n === 1 ? label.one : label.other}`;

function ago(now: number, at: number): string {
  const hours = Math.max(0, Math.floor((now - at) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TONE_PILL: Record<TallyTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-cobalt-wash text-cobalt-bright",
  success:
    "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success",
  warn: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-warn",
  danger: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
};

type Geometry = { row: number; text: string; count: string; gap: string };

const DENSITY: Record<TallyDensity, Geometry> = {
  compact: {
    row: 26,
    text: "text-[12px]",
    count: "text-[10.5px]",
    gap: "gap-3",
  },
  cozy: { row: 30, text: "text-[13px]", count: "text-[11px]", gap: "gap-4" },
  roomy: { row: 36, text: "text-[13.5px]", count: "text-xs", gap: "gap-5" },
};

/** Whether a row passes every facet's picks except, optionally, one facet's. */
function passes(
  row: TallyRow,
  facets: TallyFacet[],
  selection: TallySelection,
  except?: string,
): boolean {
  for (const facet of facets) {
    if (facet.id === except) continue;
    const picked = selection[facet.id];
    if (!picked || picked.length === 0) continue;
    if (!picked.includes(row.facets[facet.id] ?? "")) return false;
  }
  return true;
}

/** A facet's values: as given, or read from the rows, largest first. */
function valuesOf(facet: TallyFacet, rows: TallyRow[]): TallyFacetValue[] {
  if (facet.values) return facet.values;
  const tally = new Map<string, number>();
  for (const row of rows) {
    const v = row.facets[facet.id];
    if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
}

const keyOf = (facetId: string, valueId: string) =>
  `${facetId}\u0000${valueId}`;

/* ----------------------------------------------------------------------- */
/*                               Rolling count                             */
/* ----------------------------------------------------------------------- */

/**
 * A count that runs to its new figure on a base tween instead of blinking.
 * The number lives in a motion value rendered as text, so a roll costs no
 * React render per frame, and the server renders the settled figure.
 */
function Rolling({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
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
    });
    // A re-run (a newer figure, or StrictMode's rehearsal) starts its own
    // roll from wherever this one stopped, so a count always finishes.
    return () => controls.stop();
  }, [motionSafe, mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                              Loading stripes                             */
/* ----------------------------------------------------------------------- */

/**
 * The striped track a count wears while it refreshes. The stripes slide on
 * one linear transform loop that runs only while it is on screen; under
 * reduced motion they hold still, which still reads as "not ready".
 */
function Stripes({ moving }: { moving: boolean }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-full">
      <motion.span
        className="absolute inset-y-0 right-0 -left-3 bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_3px,transparent_3px_6px)]"
        initial={false}
        animate={moving ? { x: [0, 8.485] } : { x: 0 }}
        transition={
          moving
            ? { duration: 0.6, ease: "linear", repeat: Infinity }
            : { duration: 0 }
        }
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Facet list                               */
/* ----------------------------------------------------------------------- */

type FacetListProps = {
  scope: string;
  lists: { facet: TallyFacet; values: TallyFacetValue[] }[];
  counts: Map<string, number>;
  maxima: Map<string, number>;
  base: Map<string, number>;
  selection: TallySelection;
  sinkEmpty: boolean;
  status: TallyStatus;
  density: TallyDensity;
  barStyle: TallyBarStyle;
  motionSafe: boolean;
  itemLabel: { one: string; other: string };
  focusKey: string | null;
  setFocusKey: (key: string) => void;
  onToggle: (facetId: string, valueId: string) => void;
  disabled: boolean;
  uid: string;
};

function FacetList({
  scope,
  lists,
  counts,
  maxima,
  base,
  selection,
  sinkEmpty,
  status,
  density,
  barStyle,
  motionSafe,
  itemLabel,
  focusKey,
  setFocusKey,
  onToggle,
  disabled,
  uid,
}: FacetListProps) {
  const g = DENSITY[density] ?? DENSITY.cozy;
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(boxRef);
  const loading = status === "loading";
  const stale = status === "error";

  // The order a person sees, which is the order the arrows walk: each group's
  // values with the empty ones sunk to its foot.
  const arranged = lists.map(({ facet, values }) => {
    const picked = selection[facet.id] ?? [];
    const ranked = values.map((v, index) => {
      const count = counts.get(keyOf(facet.id, v.id)) ?? 0;
      const empty = count === 0 && !picked.includes(v.id);
      return { v, index, count, empty, sunk: sinkEmpty && empty && !loading };
    });
    const visual = [...ranked].sort(
      (a, b) => Number(a.sunk) - Number(b.sunk) || a.index - b.index,
    );
    return { facet, ranked, visual, picked };
  });
  const walk = arranged.flatMap(({ facet, visual }) =>
    visual.map((item) => keyOf(facet.id, item.v.id)),
  );
  const current = focusKey && walk.includes(focusKey) ? focusKey : walk[0];

  const move = (to: number) => {
    const key = walk[Math.max(0, Math.min(walk.length - 1, to))];
    if (!key) return;
    setFocusKey(key);
    refs.current.get(key)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, key: string) => {
    const at = walk.indexOf(key);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(at - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(walk.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={boxRef} className={cn("flex flex-col py-3", g.gap)}>
      {arranged.map(({ facet, ranked, picked }) => {
        const headingId = `${uid}-${scope}-${facet.id}`;
        const max = Math.max(1, maxima.get(facet.id) ?? 1);
        return (
          <div
            key={facet.id}
            role="group"
            aria-labelledby={headingId}
            className="flex flex-col"
          >
            <p
              id={headingId}
              className="flex h-6 items-center justify-between gap-2 px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              <span className="truncate">{facet.label}</span>
              {picked.length > 0 ? (
                <span className="shrink-0 text-(--tf-accent) tabular-nums">
                  {picked.length} picked
                </span>
              ) : null}
            </p>
            <div className="flex flex-col px-2">
              {ranked.map(({ v, index, count, empty, sunk }) => {
                const key = keyOf(facet.id, v.id);
                const on = picked.includes(v.id);
                const ratio = r3(Math.min(1, count / max));
                const baseRatio = r3(Math.min(1, (base.get(key) ?? 0) / max));
                const locked = empty && !on;
                return (
                  <motion.button
                    key={v.id}
                    ref={(node: HTMLButtonElement | null) => {
                      if (node) refs.current.set(key, node);
                      else refs.current.delete(key);
                    }}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={locked || disabled || undefined}
                    aria-label={
                      loading
                        ? `${v.label}, counting`
                        : `${v.label}, ${plural(count, itemLabel)}${locked ? ", no matches" : ""}`
                    }
                    tabIndex={key === current ? 0 : -1}
                    onFocus={() => setFocusKey(key)}
                    onKeyDown={(event) => onKeyDown(event, key)}
                    onClick={() => {
                      if (disabled || locked) return;
                      onToggle(facet.id, v.id);
                    }}
                    layout={motionSafe ? "position" : false}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    style={{
                      height: g.row,
                      order: sunk ? 1000 + index : index,
                    }}
                    className={cn(
                      "group/tally-value relative flex w-full shrink-0 items-center gap-2 rounded-2 px-2 text-left transition-colors",
                      FOCUS_IN,
                      locked || disabled
                        ? "cursor-default"
                        : "cursor-pointer hover:bg-surface-2",
                      barStyle !== "fill" && "pb-1",
                    )}
                  >
                    {barStyle === "fill" ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0.5 right-1 left-1 overflow-hidden rounded-2"
                      >
                        {loading ? (
                          <Stripes moving={motionSafe && inView} />
                        ) : (
                          <motion.span
                            className={cn(
                              "absolute inset-0 bg-[color-mix(in_oklab,var(--tf-accent)_14%,transparent)]",
                              stale &&
                                "bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_2px,transparent_2px_5px)]",
                            )}
                            initial={false}
                            animate={{ scaleX: ratio }}
                            transition={
                              motionSafe ? springs.glide : { duration: 0 }
                            }
                            style={{ originX: 0 }}
                          />
                        )}
                      </span>
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        "relative flex size-3.5 shrink-0 items-center justify-center rounded-1 border transition-colors",
                        on
                          ? "border-(--tf-accent) bg-(--tf-accent) text-background"
                          : "border-hairline-strong bg-card group-hover/tally-value:border-ink-3",
                      )}
                    >
                      <AnimatePresence initial={false}>
                        {on ? (
                          <motion.span
                            key="check"
                            className="flex"
                            initial={{
                              scale: motionSafe ? 0.4 : 1,
                              opacity: 0,
                            }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: {
                                duration: durations.blink,
                                ease: easings.exit,
                              },
                            }}
                            transition={{
                              scale: motionSafe
                                ? springs.flick
                                : { duration: 0 },
                              opacity: { duration: durations.blink },
                            }}
                          >
                            <Check className="size-2.5" strokeWidth={3.5} />
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </span>
                    <motion.span
                      className={cn(
                        "relative min-w-0 flex-1 truncate",
                        g.text,
                        on ? "font-medium text-foreground" : "text-ink-2",
                      )}
                      title={v.label}
                      initial={false}
                      animate={{ opacity: locked ? 0.45 : 1 }}
                      transition={{ duration: durations.base }}
                    >
                      {v.label}
                    </motion.span>
                    <motion.span
                      className={cn(
                        "relative shrink-0 font-mono tabular-nums",
                        g.count,
                        on ? "text-(--tf-accent)" : "text-ink-3",
                      )}
                      initial={false}
                      animate={{ opacity: locked ? 0.5 : stale ? 0.6 : 1 }}
                      transition={{ duration: durations.base }}
                    >
                      {loading ? (
                        <span className="inline-block h-2 w-4 rounded-full bg-surface-2 align-middle" />
                      ) : (
                        <Rolling value={count} motionSafe={motionSafe} />
                      )}
                    </motion.span>
                    {barStyle !== "fill" ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute right-2 left-7.5",
                          barStyle === "bar"
                            ? "bottom-[3px] h-1 rounded-full bg-surface-2"
                            : "bottom-[2px] h-px bg-hairline",
                        )}
                      >
                        {loading ? (
                          <Stripes moving={motionSafe && inView} />
                        ) : (
                          <>
                            <motion.span
                              className={cn(
                                "absolute left-0 w-full",
                                barStyle === "bar"
                                  ? "inset-y-0 rounded-full"
                                  : "-top-px h-[2px]",
                                stale
                                  ? "bg-ink-3/50"
                                  : on
                                    ? "bg-(--tf-accent)"
                                    : "bg-[color-mix(in_oklab,var(--tf-accent)_62%,var(--ink-3))]",
                              )}
                              initial={false}
                              animate={{ scaleX: ratio }}
                              transition={
                                motionSafe ? springs.glide : { duration: 0 }
                              }
                              style={{ originX: 0 }}
                            />
                            {baseRatio > ratio ? (
                              <span
                                className="absolute -top-0.5 h-2 w-px bg-ink-3/45"
                                style={{
                                  left: `calc(${r3(baseRatio * 100)}% - 1px)`,
                                }}
                              />
                            ) : null}
                          </>
                        )}
                      </span>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * Filtering by facets where every count answers a pick. A sidebar of facets
 * — each value with its count and a slim count bar — sits beside the results.
 * Counting is disjunctive: values within a facet are OR'd, facets are AND'd,
 * and a facet's counts ignore its own picks, so picking North never zeroes
 * South. A bar's length is the value's count against the largest count its
 * facet had before any filter, so bars can only shrink as filters narrow, and
 * a hairline tick keeps the unfiltered length.
 *
 * Picking flicks the check in on `flick` and, in the same frame, every other
 * facet's bars glide to their new lengths at once on `glide` while their
 * counts roll. Values that would now return nothing dim and sink to the foot
 * of their group on `glide` — moved with CSS `order`, so DOM order and focus
 * never move under the keyboard. Results that leave fade on the exit ease;
 * the rest close up on `glide` and returning rows rise in a cascade.
 *
 * Below a 560px container the sidebar folds into a sheet whose button carries
 * the live result count; the sheet is a modal dialog with its focus trapped.
 */
export function TallyFacets({
  facets = defaultTallyFacets,
  rows = defaultTallyRows,
  value,
  defaultValue,
  onValueChange,
  onChange,
  onClear,
  onSaveView,
  status = "ready",
  onRetry,
  density = "cozy",
  barStyle = "bar",
  accent = "var(--accent-bright)",
  sinkEmpty = true,
  now = defaultTallyNow,
  formatAmount = defaultFormat,
  title = "Orders",
  itemLabel = { one: "order", other: "orders" },
  height = 520,
  disabled = false,
  className,
}: TallyFacetsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sheetTitleId = `${uid}-sheet`;

  const [own, setOwn] = React.useState<TallySelection>(defaultValue ?? {});
  const selection = value ?? own;
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const savedTimer = React.useRef<number | null>(null);

  const ready = status === "ready";
  const loading = status === "loading";

  const lists = React.useMemo(
    () => facets.map((facet) => ({ facet, values: valuesOf(facet, rows) })),
    [facets, rows],
  );

  // Every value's unfiltered count (for the bar scale and the ghost tick).
  const { base, maxima } = React.useMemo(() => {
    const b = new Map<string, number>();
    const m = new Map<string, number>();
    for (const { facet, values } of lists) {
      let max = 0;
      for (const v of values) {
        const n = rows.filter((row) => row.facets[facet.id] === v.id).length;
        b.set(keyOf(facet.id, v.id), n);
        max = Math.max(max, n);
      }
      m.set(facet.id, max);
    }
    return { base: b, maxima: m };
  }, [lists, rows]);

  const counts = React.useMemo(() => {
    const c = new Map<string, number>();
    for (const { facet, values } of lists) {
      const pool = rows.filter((row) =>
        passes(row, facets, selection, facet.id),
      );
      for (const v of values) {
        c.set(
          keyOf(facet.id, v.id),
          pool.filter((row) => row.facets[facet.id] === v.id).length,
        );
      }
    }
    return c;
  }, [facets, lists, rows, selection]);

  const results = React.useMemo(
    () => rows.filter((row) => passes(row, facets, selection)),
    [facets, rows, selection],
  );

  const pickedCount = Object.values(selection).reduce(
    (n, ids) => n + ids.length,
    0,
  );
  const labelOf = (facetId: string, valueId: string) =>
    lists
      .find((l) => l.facet.id === facetId)
      ?.values.find((v) => v.id === valueId)?.label ?? valueId;

  const commit = (next: TallySelection) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** The sentence a pick freezes for the live region, from the new picks. */
  const sentence = (next: TallySelection) => {
    const n = rows.filter((row) => passes(row, facets, next)).length;
    const parts = facets
      .filter((f) => (next[f.id] ?? []).length > 0)
      .map(
        (f) =>
          `${f.label} ${(next[f.id] ?? []).map((id) => labelOf(f.id, id)).join(" or ")}`,
      );
    return `${plural(n, itemLabel)}${parts.length ? `. ${parts.join(", ")}.` : ", no filters."}`;
  };

  const toggle = (facetId: string, valueId: string) => {
    if (disabled) return;
    const picked = selection[facetId] ?? [];
    const selected = !picked.includes(valueId);
    const nextPicked = selected
      ? [...picked, valueId]
      : picked.filter((id) => id !== valueId);
    const next: TallySelection = { ...selection };
    if (nextPicked.length) next[facetId] = nextPicked;
    else delete next[facetId];
    commit(next);
    onChange?.({ facetId, valueId, selected, selection: next });
    setAnnouncement(sentence(next));
  };

  const clear = () => {
    if (disabled || pickedCount === 0) return;
    commit({});
    onClear?.();
    setAnnouncement(sentence({}));
  };

  const save = () => {
    if (disabled) return;
    onSaveView?.(selection);
    setSaved(true);
    setAnnouncement(
      `View saved with ${plural(pickedCount, { one: "filter", other: "filters" })}.`,
    );
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  };

  React.useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  // The sheet only exists while the facets are folded: widen the container
  // past the fold and it closes, handing focus back to the page.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || !sheetOpen) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width >= 560) setSheetOpen(false);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [sheetOpen]);

  // Focus lands in the sheet the moment it arrives (one stable callback for
  // the panel's whole life, so a re-render never re-runs it).
  const bindPanel = React.useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    if (node && !node.contains(document.activeElement)) node.focus();
  }, []);

  const closeSheet = () => {
    setSheetOpen(false);
    const trigger = triggerRef.current;
    if (trigger?.isConnected) trigger.focus();
  };

  const onSheetKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
      ),
    ];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const listProps = {
    lists,
    counts,
    maxima,
    base,
    selection,
    sinkEmpty,
    status,
    density,
    barStyle,
    motionSafe,
    itemLabel,
    focusKey,
    setFocusKey,
    onToggle: toggle,
    disabled,
    uid,
  };

  const chips = facets.flatMap((f) =>
    (selection[f.id] ?? []).map((id) => ({
      facetId: f.id,
      valueId: id,
      label: labelOf(f.id, id),
      facetLabel: f.label,
    })),
  );

  const badgeFacet = facets.find((f) => f.badge);
  const metaFacets = facets.filter((f) => !f.badge);
  const step = cascade(Math.min(results.length, 12));

  const button = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
    FOCUS_RING,
  );

  const resultBody = () => {
    if (loading) {
      return (
        <ul aria-busy="true" aria-label={`Loading ${itemLabel.other}`}>
          {Array.from({ length: 7 }, (_, i) => (
            <li
              key={i}
              aria-hidden
              className="flex items-center gap-3 border-b border-hairline px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${44 + ((i * 29) % 40)}%` }}
                />
                <span
                  className="h-2 rounded-full bg-surface-2"
                  style={{ width: `${28 + ((i * 17) % 30)}%` }}
                />
              </div>
              <span className="h-2.5 w-12 rounded-full bg-surface-2" />
            </li>
          ))}
        </ul>
      );
    }
    if (results.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">
            {rows.length === 0
              ? `No ${itemLabel.other} yet.`
              : `No ${itemLabel.other} match these picks.`}
          </p>
        </div>
      );
    }
    return (
      <ul role="list" aria-labelledby={titleId} className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {results.map((row, index) => {
            const badge = badgeFacet
              ? valuesOf(badgeFacet, rows).find(
                  (v) => v.id === row.facets[badgeFacet.id],
                )
              : undefined;
            return (
              <motion.li
                key={row.id}
                layout={motionSafe ? "position" : false}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{
                  layout: motionSafe ? springs.glide : { duration: 0 },
                  y: motionSafe
                    ? { ...springs.glide, delay: Math.min(index, 12) * step }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? Math.min(index, 12) * step : 0,
                  },
                }}
                className="flex items-center gap-3 border-b border-hairline bg-card px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline gap-2">
                    <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums @min-[24rem]:inline">
                      {row.code}
                    </span>
                    <span
                      className="truncate text-[13px] font-medium text-foreground"
                      title={row.title}
                    >
                      {row.title}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-ink-3">
                    <span className="font-mono text-[10px] tabular-nums @min-[24rem]:hidden">
                      {row.code} ·{" "}
                    </span>
                    {metaFacets.map((f, i) => {
                      const id = row.facets[f.id] ?? "";
                      const hit = (selection[f.id] ?? []).includes(id);
                      return (
                        <React.Fragment key={f.id}>
                          {i > 0 ? " · " : ""}
                          <span
                            className={cn(
                              "transition-colors",
                              hit && "text-(--tf-accent)",
                            )}
                          >
                            {labelOf(f.id, id)}
                          </span>
                        </React.Fragment>
                      );
                    })}
                    {" · "}
                    {ago(now, row.at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[12.5px] text-foreground tabular-nums">
                    {formatAmount(row.amount)}
                  </span>
                  {badge ? (
                    <span
                      className={cn(
                        "inline-flex h-4.5 items-center rounded-full px-1.5 text-[10px] font-medium",
                        TONE_PILL[badge.tone ?? "neutral"],
                      )}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--tf-accent" as string]: accent }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-32 flex-1">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {loading ? (
              `Counting ${itemLabel.other}`
            ) : (
              <>
                <Rolling
                  value={results.length}
                  motionSafe={motionSafe}
                  className="font-mono text-(--tf-accent) tabular-nums"
                />
                {` of ${plural(rows.length, itemLabel)}`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            disabled={disabled}
            onClick={() => setSheetOpen(true)}
            className={cn(button, "@min-[35rem]:hidden")}
          >
            <SlidersHorizontal aria-hidden className="size-3.5" />
            Filters
            {pickedCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--tf-accent) px-1 font-mono text-[10px] text-background tabular-nums">
                {pickedCount}
              </span>
            ) : null}
          </button>
          {pickedCount > 0 ? (
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              className={button}
            >
              Clear
            </button>
          ) : null}
          {onSaveView ? (
            <button
              type="button"
              onClick={save}
              disabled={disabled}
              className={cn(button, "@max-[22rem]:px-2")}
              aria-label={saved ? "View saved" : "Save view"}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {saved ? (
                  <motion.span
                    key="saved"
                    className="flex text-(--tf-accent)"
                    initial={{ scale: motionSafe ? 0.5 : 1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitTransition }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    <Check aria-hidden className="size-3.5" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="save"
                    className="flex"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitTransition }}
                  >
                    <Bookmark aria-hidden className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="@max-[22rem]:sr-only">
                {saved ? "Saved" : "Save view"}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      <AnimatePresence initial={false}>
        {chips.length > 0 ? (
          <motion.div
            key="chips"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitTransition }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
            className="shrink-0 overflow-hidden border-b border-hairline"
          >
            <ul
              role="list"
              aria-label="Active filters"
              className="flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4 py-2"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {chips.map((chip) => (
                  <motion.li
                    key={keyOf(chip.facetId, chip.valueId)}
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitTransition }}
                    transition={{
                      layout: motionSafe ? springs.glide : { duration: 0 },
                      scale: motionSafe ? springs.snap : { duration: 0 },
                      opacity: { duration: durations.fast },
                    }}
                    className="shrink-0"
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(chip.facetId, chip.valueId)}
                      aria-label={`Remove ${chip.facetLabel} ${chip.label}`}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--tf-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--tf-accent)_10%,transparent)] pr-1 pl-2 text-[11px] text-foreground transition-colors enabled:hover:bg-[color-mix(in_oklab,var(--tf-accent)_18%,transparent)]",
                        FOCUS_RING,
                      )}
                    >
                      <span className="text-ink-3">{chip.facetLabel}</span>
                      {chip.label}
                      <X aria-hidden className="size-3 text-ink-3" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden @min-[35rem]:grid-cols-[13.75rem_minmax(0,1fr)] @min-[60rem]:grid-cols-[15.5rem_minmax(0,1fr)]">
        <nav
          aria-label="Facets"
          className="hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline @min-[35rem]:block"
        >
          <FacetList scope="side" {...listProps} />
        </nav>
        <div className="flex flex-col overflow-hidden">
          {status === "error" ? (
            <div
              role="alert"
              className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-4 py-2"
            >
              <TriangleAlert
                aria-hidden
                className="size-4 shrink-0 text-danger"
              />
              <p className="min-w-0 flex-1 text-xs text-ink-2">
                Counts did not refresh. Showing the last good counts.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(button, "h-7")}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            {resultBody()}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {sheetOpen ? (
          <motion.div
            key="sheet"
            className="absolute inset-0 z-20 flex flex-col justify-end"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1, transition: { duration: durations.base } }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--background)_62%,transparent)]"
              onClick={closeSheet}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitTransition }}
              transition={{ duration: durations.base }}
            />
            <motion.div
              ref={bindPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              onKeyDown={onSheetKeyDown}
              className="relative flex max-h-[86%] flex-col rounded-t-4 border-t border-hairline-strong bg-card shadow-[0_-12px_32px_color-mix(in_oklab,black_14%,transparent)] outline-none"
              initial={{
                y: motionSafe ? "100%" : 0,
                opacity: motionSafe ? 1 : 0,
              }}
              animate={{ y: 0, opacity: 1 }}
              exit={{
                y: motionSafe ? "100%" : 0,
                opacity: motionSafe ? 1 : 0,
                transition: { duration: durations.base, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
                <span
                  aria-hidden
                  className="absolute top-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-hairline-strong"
                />
                <p
                  id={sheetTitleId}
                  className="min-w-0 flex-1 truncate pt-1 text-sm font-semibold"
                >
                  Filters
                </p>
                {pickedCount > 0 ? (
                  <button type="button" onClick={clear} className={button}>
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeSheet}
                  aria-label="Close filters"
                  className={cn(button, "w-8 justify-center px-0")}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <FacetList scope="sheet" {...listProps} />
              </div>
              <div className="border-t border-hairline p-3">
                <button
                  type="button"
                  onClick={closeSheet}
                  className={cn(
                    "inline-flex h-9 w-full items-center justify-center gap-1 rounded-2 bg-(--tf-accent) text-sm font-medium text-background transition-opacity hover:opacity-90",
                    FOCUS_RING,
                  )}
                >
                  Show{" "}
                  <Rolling
                    value={results.length}
                    motionSafe={motionSafe}
                    className="font-mono tabular-nums"
                  />{" "}
                  {results.length === 1 ? itemLabel.one : itemLabel.other}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {!ready ? (
        <p className="sr-only" aria-live="polite">
          {loading ? `Refreshing ${itemLabel.other}.` : ""}
        </p>
      ) : null}
    </div>
  );
}
