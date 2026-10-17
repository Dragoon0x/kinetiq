"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import {
  ChevronsLeftRight,
  FlaskConical,
  Pencil,
  RotateCcw,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type WipePreviewStyle = "line" | "feather" | "cells";
export type WipePreviewRingName = "amber" | "accent" | "signal" | "ink";
export type WipePreviewAccentName = "cobalt" | "plum" | "mint" | "ink";
export type WipePreviewStatus = "ready" | "loading" | "empty" | "failed";
export type WipeFieldKind = "money" | "percent" | "number" | "text";
export type WipeValue = string | number | null;

export type WipeField = {
  /** The key read from each record's `before` and `after`. */
  key: string;
  /** Column heading, and the field's name in sentences. */
  label: string;
  /** How the value is written and whether it counts toward the change size. @default "text" */
  kind?: WipeFieldKind;
};

export type WipeRecord = {
  id: string;
  /** What the record is called: "Nitro Cold Brew 4-pack". */
  title: string;
  /** A short code under the title: a SKU or an id. */
  meta?: string;
  /** Field values today. */
  before: Record<string, WipeValue>;
  /** Field values once the action runs. */
  after: Record<string, WipeValue>;
};

export type WipeAction = {
  id: string;
  /** Who proposes it: "Coldbrook pricing agent". */
  agent: string;
  /** What it does, as a title. */
  title: string;
  /** One or two sentences of why and how. */
  summary: string;
  /** Where it acts: "Coldbrook · Catalog". */
  scope: string;
  /** When it was proposed, in ms. */
  proposedAt: number;
};

export type WipeFailure = {
  /** What stopped the simulation, as a sentence. */
  message: string;
  /** The record it stopped on. */
  recordId?: string;
};

type Async = void | Promise<unknown>;

export type WipePreviewProps = {
  /** The action the agent proposes. @default defaultWipeAction (Coldbrook price update) */
  action?: WipeAction;
  /** The fields compared, in column order. @default defaultWipeFields */
  fields?: WipeField[];
  /** The records the action touches, before and after. @default defaultWipeRecords (40 items) */
  records?: WipeRecord[];
  /** Controlled: ids left out of the action. */
  excluded?: string[];
  /** Initial exclusions when uncontrolled. @default [] */
  defaultExcluded?: string[];
  /** Fires with every excluded id after an exclusion changes. */
  onExcludedChange?: (ids: string[]) => void;
  /** Fires from the key or press that left a record out (true) or put it back (false). */
  onExclude?: (id: string, excluded: boolean) => void;
  /** Controlled wipe position, 0 (all before) to 100 (all after). */
  value?: number;
  /** Initial wipe position when uncontrolled. @default 50 */
  defaultValue?: number;
  /** Fires when a drag, key or toggle settles the wipe. */
  onValueChange?: (value: number) => void;
  /** Approve was pressed with the included ids. Return a promise to hold the stamp until it lands; a rejection slides the wipe back. */
  onApprove?: (includedIds: string[]) => Async;
  /** The action was sent back, with the reviewer's note (may be empty). */
  onReject?: (note: string) => void;
  /** Edit plan was pressed. */
  onEditPlan?: () => void;
  /** Retry simulation was pressed after a failure. */
  onRetry?: () => void;
  /** A record whose money or number field moves more than this percent is a large change. @default 10 */
  largeChangeAt?: number;
  /** Whether the simulation has produced records. @default "ready" */
  status?: WipePreviewStatus;
  /** Why the simulation failed, when `status` is "failed". */
  failure?: WipeFailure;
  /** The moment ages are counted from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** How the wipe's edge is drawn: a hard line, a soft feather, or whole fields flipping. @default "line" */
  wipeStyle?: WipePreviewStyle;
  /** The ring around every changed field: a named colour or any CSS colour. @default "amber" */
  ringColor?: WipePreviewRingName | (string & {});
  /** The handle, Approve and the stamp: a named pigment or any CSS colour. @default "cobalt" */
  accent?: WipePreviewAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Tallest the surface grows before its list scrolls, in px. @default 560 */
  height?: number;
  /** Read only: the wipe still compares, nothing can be decided. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14, 0);

export const defaultWipeAction: WipeAction = {
  id: "coldbrook-price-oct",
  agent: "Coldbrook pricing agent",
  title: "Raise list prices on cold brew",
  summary:
    "Lift list prices about 7% to cover the new bean contract, round to .49 or .99, and retire sale prices the new price has caught up with.",
  scope: "Coldbrook · Catalog",
  proposedAt: DEFAULT_NOW - 4 * MIN,
};

export const defaultWipeFields: WipeField[] = [
  { key: "price", label: "Price", kind: "money" },
  { key: "compareAt", label: "Compare at", kind: "money" },
  { key: "margin", label: "Margin", kind: "percent" },
  { key: "badge", label: "Badge", kind: "text" },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (v: number) => Math.round(v * 100) / 100;
/** Up to the next .49 or .99, the way the catalog prices. */
const charm = (v: number) => {
  const whole = Math.floor(v);
  return cents(whole + (v - whole <= 0.49 ? 0.49 : 0.99));
};

/** The nearest .49, .99 or the .99 below: what a merchant rounds a new price to. */
const nearest = (v: number) => {
  const whole = Math.floor(v);
  const options = [whole - 0.01, whole + 0.49, whole + 0.99];
  return cents(
    options.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)),
  );
};

const LINES = [
  "Cold Brew Concentrate",
  "Nitro Cold Brew",
  "Vanilla Sweet Cream",
  "Oat Milk Cold Brew",
  "Single Origin Huila",
  "Decaf Concentrate",
  "Mocha Cold Brew",
  "Filter Bags",
];
const SIZES: [string, number, number][] = [
  ["12 oz", 5.5, 8.5],
  ["32 oz", 14, 19],
  ["64 oz", 24, 32],
  ["4-pack", 11, 15],
  ["case of 12", 54, 72],
];

/**
 * Forty Coldbrook catalog items: list prices lifted 2–8%, about one in seven
 * more than 10%, every price rounded to .49 or .99, margins following, and the
 * sale prices the new list price has caught up with retired.
 */
export const defaultWipeRecords: WipeRecord[] = (() => {
  const rand = mulberry32(2081);
  const out: WipeRecord[] = [];
  LINES.forEach((line, li) => {
    SIZES.forEach(([size, lo, hi], si) => {
      const n = 1040 + li * SIZES.length + si;
      const before = charm(lo + rand() * (hi - lo));
      const lift =
        rand() < 0.15 ? 0.105 + rand() * 0.04 : 0.025 + rand() * 0.05;
      let after = nearest(before * (1 + lift));
      if (after <= before) after = cents(before + 0.5);
      const cost = cents(before * (0.52 + rand() * 0.12));
      const margin = (p: number) => Math.round(((p - cost) / p) * 1000) / 10;
      const onSale = rand() < 0.3;
      const compareBefore = onSale ? charm(before * 1.18) : null;
      const retire = onSale && after >= (compareBefore ?? 0) * 0.94;
      out.push({
        id: `cb-${n}`,
        title: `${line} ${size}`,
        meta: `CB-${n}`,
        before: {
          price: before,
          compareAt: compareBefore,
          margin: margin(before),
          badge: onSale ? "Sale" : null,
        },
        after: {
          price: after,
          compareAt: onSale && !retire ? charm(after * 1.18) : null,
          margin: margin(after),
          badge: onSale && !retire ? "Sale" : null,
        },
      });
    });
  });
  return out;
})();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const NO_IDS: string[] = [];

const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const signed = (pct: number) =>
  `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** The size of a record's change: its largest relative move on a money or number field. */
function changeOf(record: WipeRecord, fields: WipeField[]) {
  let best = 0;
  for (const f of fields) {
    if (f.kind !== "money" && f.kind !== "number") continue;
    const a = record.before[f.key];
    const b = record.after[f.key];
    if (typeof a !== "number" || typeof b !== "number" || a === 0) continue;
    const pct = ((b - a) / Math.abs(a)) * 100;
    if (Math.abs(pct) > Math.abs(best)) best = pct;
  }
  return Math.round(best * 10) / 10;
}

const changedKeys = (record: WipeRecord, fields: WipeField[]) =>
  fields
    .filter(
      (f) => (record.before[f.key] ?? null) !== (record.after[f.key] ?? null),
    )
    .map((f) => f.key);

/**
 * Accent as custom properties: the token for strokes and text, pigment (the
 * hue at a fixed lightness) for the filled button and the stamp's wash, so
 * both read the same in either theme.
 */
const ACCENTS: Record<WipePreviewAccentName, Record<string, string>> = {
  cobalt: {
    "--wp-accent": "var(--accent-bright)",
    "--wp-button": "var(--primary)",
    "--wp-on": "var(--primary-foreground)",
  },
  plum: {
    "--wp-accent": "oklch(from var(--accent-bright) l c 320)",
    "--wp-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--wp-on": "var(--primary-foreground)",
  },
  mint: {
    "--wp-accent": "var(--success)",
    "--wp-button": "oklch(from var(--success) 0.68 c h)",
    "--wp-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--wp-accent": "var(--ink-2)",
    "--wp-button": "var(--foreground)",
    "--wp-on": "var(--background)",
  },
};

const RINGS: Record<WipePreviewRingName, string> = {
  amber: "oklch(from var(--warn) 0.76 0.15 h)",
  accent: "var(--wp-accent)",
  signal: "var(--signal)",
  ink: "var(--ink-2)",
};

const themeVars = (accent: string, ring: string): React.CSSProperties => {
  const named = ACCENTS[accent as WipePreviewAccentName];
  return {
    ...(named ?? {
      "--wp-accent": accent,
      "--wp-button": accent,
      "--wp-on": "var(--primary-foreground)",
    }),
    "--wp-ring": RINGS[ring as WipePreviewRingName] ?? ring,
    "--wp-wash": "color-mix(in oklab, var(--wp-accent) 12%, transparent)",
  } as React.CSSProperties;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** The width the item column takes in the wide layout; the fields share the rest. */
const TITLE_SHARE = 34;

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A figure that rolls up to its new value on snap; the old one leaves on the exit ease. */
function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span className="relative inline-flex overflow-clip align-bottom tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ opacity: 0, y: motionSafe ? "70%" : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? "-70%" : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type CellsProps = {
  record: WipeRecord;
  fields: WipeField[];
  side: "before" | "after";
  changed: string[];
  excluded: boolean;
  large: boolean;
  change: number;
  format: (field: WipeField, value: WipeValue) => string;
  cellsMode: boolean;
};

/**
 * One record's fields. Drawn twice per row with the same classes — the after
 * side in flow, the before side laid over it — so the two always line up and
 * the wipe only ever decides which one shows.
 */
function Cells({
  record,
  fields,
  side,
  changed,
  excluded,
  large,
  change,
  format,
  cellsMode,
}: CellsProps) {
  const share = (100 - TITLE_SHARE) / Math.max(1, fields.length);
  const values = side === "after" && !excluded ? record.after : record.before;
  // In "cells" mode each before field fades out once the wipe passes the
  // centre of its column: a steep clamp of the wipe, so CSS does it per frame.
  const fade = (centre: number): React.CSSProperties | undefined =>
    cellsMode && side === "before"
      ? ({
          "--wp-c": r3(centre),
          opacity: "clamp(0, calc((var(--wp-c) - var(--wp-n)) * 0.5), 1)",
          transition: "opacity 160ms linear",
        } as React.CSSProperties)
      : undefined;

  const cell = (f: WipeField, i: number, wideOnly = false) => {
    const isChanged = changed.includes(f.key) && !excluded;
    const end = f.kind !== "text";
    const centre = TITLE_SHARE + share * (i + 0.5);
    const value = format(f, values[f.key] ?? null);
    return (
      <div
        key={f.key}
        className={cn(
          wideOnly ? "hidden @min-[28rem]:flex" : "flex",
          "min-w-0 items-center",
          i > 0 && "shrink-0 @min-[28rem]:shrink",
          i === 0 ? "ml-auto @min-[28rem]:ml-0" : "",
          end ? "@min-[28rem]:justify-end" : "",
          "@min-[28rem]:h-full @min-[28rem]:px-2",
          cellsMode && side === "before" && "bg-(--wp-row)",
        )}
        style={fade(centre)}
      >
        {i > 0 ? (
          <span className="mr-1 text-ink-3 @min-[28rem]:hidden">{f.label}</span>
        ) : null}
        <span
          className={cn(
            "inline-flex min-w-0 items-center rounded-1 px-1.5 py-0.5",
            f.kind === "text" ? "" : "font-mono tabular-nums",
            i === 0 ? "text-[12px]" : "text-[11px] @min-[28rem]:text-[12px]",
            isChanged && side === "after"
              ? "bg-[color-mix(in_oklab,var(--wp-ring)_10%,transparent)] text-foreground shadow-[0_0_0_1.5px_var(--wp-ring)]"
              : isChanged
                ? "text-ink-2 outline-1 outline-hairline-strong outline-dashed"
                : "text-ink-2",
          )}
          style={
            isChanged && side === "after"
              ? ({
                  "--wp-c": r3(centre),
                  // Rings near the wipe swell a little as it passes them.
                  scale:
                    "calc(1 + 0.07 * clamp(0, 1 - max(var(--wp-c) - var(--wp-n), var(--wp-n) - var(--wp-c)) / 7, 1))",
                } as React.CSSProperties)
              : undefined
          }
        >
          <span className="truncate">{value}</span>
        </span>
      </div>
    );
  };

  const first = fields[0];
  const rest = fields.slice(1);
  const restChanged = rest.some((f) => changed.includes(f.key));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 @min-[28rem]:grid @min-[28rem]:h-12 @min-[28rem]:[grid-template-columns:var(--wp-cols)] @min-[28rem]:gap-0 @min-[28rem]:p-0">
      <div
        className={cn(
          "flex min-w-0 flex-1 basis-[55%] flex-col justify-center @min-[28rem]:h-full @min-[28rem]:pr-2 @min-[28rem]:pl-3",
          cellsMode && side === "before" && "bg-(--wp-row)",
        )}
      >
        <span
          className={cn(
            "truncate text-[13px] leading-4 font-medium",
            excluded ? "text-ink-3" : "text-foreground",
          )}
          title={record.title}
        >
          {record.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
          {record.meta ? <span className="truncate">{record.meta}</span> : null}
          {excluded ? (
            <span className="shrink-0 rounded-1 bg-surface-2 px-1 text-[9px] tracking-[0.06em] uppercase">
              Skipped
            </span>
          ) : change !== 0 ? (
            <span className={cn("shrink-0", large && "text-warn")}>
              {signed(change)}
            </span>
          ) : null}
        </span>
      </div>
      {first ? cell(first, 0) : null}
      {rest.length > 0 ? (
        <div
          className={cn(
            "flex min-w-0 basis-full gap-3 overflow-hidden [mask-image:linear-gradient(to_right,black_82%,transparent)] text-[11px] whitespace-nowrap @min-[28rem]:contents",
            restChanged && !excluded ? "" : "hidden",
          )}
        >
          {rest.map((f, i) => cell(f, i + 1, !changed.includes(f.key)))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Phase = "review" | "applying" | "applied" | "rejected";

/**
 * An approval surface for an agent action that edits many records at once.
 * Each affected record is drawn twice in one grid — the result in flow and
 * today's values laid exactly over it — and a wipe decides which shows: left
 * of the handle you read what the action will leave, right of it what is
 * there now. Every changed field is ringed, solid on the result side and
 * dashed on today's, so a ring turns as the wipe crosses it, and the rings
 * nearest the handle swell a touch as it passes.
 *
 * The handle follows the pointer 1:1, rubber-bands past either end and,
 * released, projects the throw and settles on `springs.snap` with its
 * velocity. Approving runs the wipe to the result on `springs.glide`; when
 * the host answers, an Applied stamp lands on `springs.recoil`. A refusal
 * glides the wipe back and says why. The wipe is one motion value writing
 * one CSS variable: the clip, the feather, the per-field flips and the ring
 * swell are all computed by CSS from it.
 *
 * The handle is a `role="slider"` (arrows, Shift, Page keys, Home, End); the
 * records are a multi-select listbox of what is included, where X or Space
 * leaves the focused record out or puts it back; below 28rem the wipe is a
 * Before / After toggle. Under reduced motion the wipe never travels on its
 * own: approving cross-fades today's values away and the stamp fades in.
 */
export function WipePreview({
  action = defaultWipeAction,
  fields = defaultWipeFields,
  records = defaultWipeRecords,
  excluded: excludedProp,
  defaultExcluded = NO_IDS,
  onExcludedChange,
  onExclude,
  value: valueProp,
  defaultValue = 50,
  onValueChange,
  onApprove,
  onReject,
  onEditPlan,
  onRetry,
  largeChangeAt = 10,
  status = "ready",
  failure,
  now = DEFAULT_NOW,
  wipeStyle = "line",
  ringColor = "amber",
  accent = "cobalt",
  formatMoney = defaultMoney,
  height = 560,
  disabled = false,
  className,
}: WipePreviewProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const noteId = `${uid}-note`;
  const style: WipePreviewStyle =
    wipeStyle === "feather" || wipeStyle === "cells" ? wipeStyle : "line";

  /* -------------------------------- state -------------------------------- */

  const [ownExcluded, setOwnExcluded] = React.useState<string[]>(
    () => defaultExcluded,
  );
  const excludedList = excludedProp ?? ownExcluded;
  const excludedSet = React.useMemo(
    () => new Set(excludedList),
    [excludedList],
  );

  const [ownValue, setOwnValue] = React.useState(() =>
    clamp(defaultValue, 0, 100),
  );
  const value = clamp(valueProp ?? ownValue, 0, 100);

  const [phase, setPhase] = React.useState<Phase>("review");
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [sentNote, setSentNote] = React.useState("");
  const [onlyLarge, setOnlyLarge] = React.useState(false);
  const [narrow, setNarrow] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A new action starts a new review.
  const [seenAction, setSeenAction] = React.useState(action.id);
  if (seenAction !== action.id) {
    setSeenAction(action.id);
    setPhase("review");
    setApplyError(null);
    setRejectOpen(false);
    setSentNote("");
  }

  const ready = status === "ready" && records.length > 0;
  const locked = disabled || phase !== "review" || !ready;

  /* ------------------------------- figures ------------------------------- */

  const facts = React.useMemo(
    () =>
      new Map(
        records.map((r) => {
          const change = changeOf(r, fields);
          return [
            r.id,
            {
              changed: changedKeys(r, fields),
              change,
              large: Math.abs(change) > largeChangeAt,
            },
          ] as const;
        }),
      ),
    [records, fields, largeChangeAt],
  );
  const factOf = (id: string) =>
    facts.get(id) ?? { changed: [] as string[], change: 0, large: false };

  const included = records.filter((r) => !excludedSet.has(r.id));
  const changeCount = included.reduce(
    (n, r) => n + factOf(r.id).changed.length,
    0,
  );
  const moves = included.map((r) => factOf(r.id).change).filter((c) => c);
  const average = moves.length
    ? Math.round((moves.reduce((a, b) => a + b, 0) / moves.length) * 10) / 10
    : 0;
  const largest = moves.reduce(
    (a, b) => (Math.abs(b) > Math.abs(a) ? b : a),
    0,
  );
  const largeRecords = records.filter((r) => factOf(r.id).large);
  const largeIncluded = largeRecords.filter((r) => !excludedSet.has(r.id));
  const filtering = onlyLarge && largeRecords.length > 0;
  const shown = filtering ? largeRecords : records;

  const format = React.useCallback(
    (f: WipeField, v: WipeValue) => {
      if (v === null || v === "") return "—";
      if (typeof v === "number") {
        if (f.kind === "money") return formatMoney(v);
        if (f.kind === "percent") return `${v.toFixed(1)}%`;
        return String(v);
      }
      return v;
    },
    [formatMoney],
  );

  /** One sentence per record: what it is, what changes, and whether it is in. */
  const sentenceOf = (r: WipeRecord) => {
    const f = factOf(r.id);
    const parts = fields
      .filter((x) => f.changed.includes(x.key))
      .map(
        (x) =>
          `${x.label} ${format(x, r.before[x.key] ?? null)} to ${format(x, r.after[x.key] ?? null)}`,
      );
    const move = f.change
      ? `, ${f.change > 0 ? "up" : "down"} ${Math.abs(f.change).toFixed(1)}%`
      : "";
    const what = parts.length
      ? `${parts[0]}${move}${parts.length > 1 ? `. ${parts.slice(1).join(". ")}` : ""}`
      : "No change";
    return `${r.title}. ${what}. ${excludedSet.has(r.id) ? "Skipped" : "Included"}.`;
  };

  /* -------------------------------- wipe --------------------------------- */

  const wipe = useMotionValue(value);
  const fade = useMotionValue(1);
  const wipeX = useTransform(wipe, (v) => `${r3(v)}%`);
  // Custom properties take strings: a bare number could pick up a unit.
  const wipeN = useTransform(wipe, (v) => String(r3(v)));
  const fadeVar = useTransform(fade, (v) => String(r3(v)));
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const driving = React.useRef<number | null>(null);
  const dragging = React.useRef(false);
  const jumpNext = React.useRef(false);
  const run = React.useRef(0);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    driving.current = null;
  }, []);
  React.useEffect(() => halt, [halt]);

  /**
   * Every move of the wipe goes through here, so an effect that sees the
   * same target already on its way leaves it alone. Under reduced motion the
   * wipe never travels: today's layer cross-fades instead.
   */
  const drive = React.useCallback(
    (
      target: number,
      spring: Transition,
      options: {
        velocity?: number;
        onDone?: () => void;
        jump?: boolean;
        /** A whole-state switch (approve, reject, the toggle): cross-fades under reduced motion. */
        fade?: boolean;
      } = {},
    ) => {
      halt();
      const to = clamp(target, 0, 100);
      driving.current = to;
      const done = () => {
        driving.current = null;
        options.onDone?.();
      };
      if (
        options.jump ||
        (!motionSafe && !options.fade) ||
        Math.abs(wipe.get() - to) < 0.05
      ) {
        wipe.jump(to);
        fade.jump(1);
        done();
        return;
      }
      if (!motionSafe) {
        const forward = to > wipe.get();
        if (forward) {
          running.current = [
            animate(fade, 0, {
              duration: durations.base,
              ease: easings.move,
              onComplete: () => {
                wipe.jump(to);
                fade.jump(1);
                done();
              },
            }),
          ];
        } else {
          fade.jump(0);
          wipe.jump(to);
          running.current = [
            animate(fade, 1, {
              duration: durations.base,
              ease: easings.move,
              onComplete: done,
            }),
          ];
        }
        return;
      }
      running.current = [
        animate(wipe, to, {
          ...spring,
          velocity: options.velocity ?? 0,
          onComplete: done,
        }),
      ];
    },
    [fade, halt, motionSafe, wipe],
  );

  const target =
    phase === "applying" || phase === "applied"
      ? 100
      : phase === "rejected"
        ? 0
        : narrow
          ? value >= 50
            ? 100
            : 0
          : value;

  // The host's value, a layout change, or a phase moves the wipe — unless a
  // gesture holds it or the same move is already on its way.
  React.useEffect(() => {
    if (dragging.current) return;
    if (driving.current === target) return;
    if (driving.current === null && Math.abs(wipe.get() - target) < 0.05) {
      return;
    }
    const jump = jumpNext.current;
    jumpNext.current = false;
    drive(target, springs.snap, { jump });
  }, [target, drive, wipe]);

  const commitValue = (next: number) => {
    const v = Math.round(clamp(next, 0, 100));
    if (valueProp === undefined) setOwnValue(v);
    onValueChange?.(v);
    return v;
  };

  /* ----------------------------- measurement ----------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const bindScroller = React.useCallback((node: HTMLDivElement | null) => {
    scrollerRef.current = node;
    setScroller(node);
  }, []);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => {
      const isNarrow = root.getBoundingClientRect().width < 448;
      setNarrow((was) => {
        if (was !== isNarrow) jumpNext.current = true;
        return isNarrow;
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The handle spans what the list shows, not the whole list: its overlay
  // takes the scroller's visible height, written straight to the node.
  React.useEffect(() => {
    if (!scroller) return;
    const fit = () => {
      const overlay = overlayRef.current;
      if (overlay) overlay.style.height = `${scroller.clientHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);

  const trackWidth = () =>
    overlayRef.current?.getBoundingClientRect().width ?? 1;

  /* ------------------------------- gestures ------------------------------ */

  const dragFrom = React.useRef(0);

  const settleFromThrow = (velocityPx: number) => {
    const width = Math.max(1, trackWidth());
    const velocity = (velocityPx / width) * 100;
    const landing = project(wipe.get(), velocity, 0.99);
    const to = commitValue(landing);
    drive(to, springs.snap, { velocity });
    say(`${to}% shows the result.`);
  };

  const handleDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: locked || narrow,
    onStart: () => {
      halt();
      dragging.current = true;
      dragFrom.current = wipe.get();
    },
    onMove: ({ offset }) => {
      const width = Math.max(1, trackWidth());
      const raw = dragFrom.current + (offset.x / width) * 100;
      const v =
        raw < 0
          ? rubberband(raw, 100)
          : raw > 100
            ? 100 + rubberband(raw - 100, 100)
            : raw;
      wipe.set(r3(v));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      settleFromThrow(velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      drive(value, springs.snap);
    },
  });

  /** The ruler is a track: a press jumps the wipe there, a drag scrubs. */
  const pointAt = (clientX: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return wipe.get();
    return ((clientX - rect.left) / rect.width) * 100;
  };
  const rulerDrag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: locked || narrow,
    onStart: () => {
      halt();
      dragging.current = true;
    },
    onMove: ({ point }) => {
      wipe.set(r3(clamp(pointAt(point.x), 0, 100)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      settleFromThrow(velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      drive(value, springs.snap);
    },
    onTap: (event) => {
      const to = commitValue(pointAt(event.clientX));
      drive(to, springs.snap);
      say(`${to}% shows the result.`);
    },
  });

  const onSliderKey = (event: React.KeyboardEvent) => {
    if (locked) return;
    const big = event.shiftKey ? 20 : 5;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = value + big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = value - big;
    else if (event.key === "PageUp") next = value + 25;
    else if (event.key === "PageDown") next = value - 25;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 100;
    if (next === null) return;
    event.preventDefault();
    const to = commitValue(next);
    drive(to, springs.snap);
  };

  const toggleSide = (side: "before" | "after") => {
    if (locked) return;
    const to = commitValue(side === "after" ? 100 : 0);
    drive(to, springs.glide, { fade: true });
    say(side === "after" ? "Showing the result." : "Showing today.");
  };

  /* ------------------------------- records ------------------------------- */

  const optionRefs = React.useRef(new Map<string, HTMLDivElement>());

  const setExcluded = (id: string, out: boolean) => {
    if (locked) return;
    const next = out
      ? [...excludedList.filter((x) => x !== id), id]
      : excludedList.filter((x) => x !== id);
    if (excludedProp === undefined) setOwnExcluded(next);
    onExcludedChange?.(next);
    onExclude?.(id, out);
    const record = records.find((r) => r.id === id);
    const count = records.length - next.length;
    say(
      `${record?.title ?? "Item"} ${out ? "skipped" : "included"}. ${count} of ${records.length} items.`,
    );
  };

  const activeId =
    active && shown.some((r) => r.id === active) ? active : shown[0]?.id;

  const focusRecord = (id: string | undefined) => {
    if (!id) return;
    setActive(id);
    const node = optionRefs.current.get(id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest" });
  };

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = shown.findIndex((r) => r.id === activeId);
    if (at === -1) return;
    const go = (i: number) => {
      event.preventDefault();
      focusRecord(shown[clamp(i, 0, shown.length - 1)]?.id);
    };
    switch (event.key) {
      case "ArrowDown":
        go(at + 1);
        return;
      case "ArrowUp":
        go(at - 1);
        return;
      case "Home":
        go(0);
        return;
      case "End":
        go(shown.length - 1);
        return;
      case "PageDown":
        go(at + 8);
        return;
      case "PageUp":
        go(at - 8);
        return;
      case " ":
      case "x":
      case "X": {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        const id = shown[at]?.id;
        if (id) setExcluded(id, !excludedSet.has(id));
        return;
      }
      default:
    }
  };

  /* ------------------------------- decisions ----------------------------- */

  const rejectRef = React.useRef<HTMLButtonElement | null>(null);

  const blockedWhy = !ready
    ? status === "failed"
      ? "The simulation failed. Retry it or edit the plan."
      : status === "loading"
        ? "The simulation is still running."
        : "This plan changes nothing."
    : included.length === 0
      ? "Every item is skipped."
      : null;

  // A decision removes the button that made it; focus waits on the region
  // rather than falling to the page.
  const parkFocus = () => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  const approve = () => {
    if (disabled || phase !== "review") return;
    if (blockedWhy) {
      say(blockedWhy);
      return;
    }
    const id = ++run.current;
    const ids = included.map((r) => r.id);
    let wiped = false;
    let answer: { ok: boolean; why: string } | null = null;
    const finish = () => {
      if (run.current !== id || !wiped || !answer) return;
      if (answer.ok) {
        parkFocus();
        setPhase("applied");
        say(`Applied to ${plural(ids.length, "item")}.`);
      } else {
        // Back to where the reviewer left it, on the layout spring.
        drive(narrow ? (value >= 50 ? 100 : 0) : value, springs.glide, {
          fade: true,
        });
        setPhase("review");
        setApplyError(answer.why);
        say(`Not applied. ${answer.why}`);
      }
    };
    setApplyError(null);
    setRejectOpen(false);
    setPhase("applying");
    say(`Applying to ${plural(ids.length, "item")}.`);
    drive(100, springs.glide, {
      fade: true,
      onDone: () => {
        wiped = true;
        finish();
      },
    });
    const result = onApprove?.(ids);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => {
          answer = { ok: true, why: "" };
          finish();
        },
        (why: unknown) => {
          answer = {
            ok: false,
            why:
              why instanceof Error && why.message
                ? why.message
                : "The catalog refused the change.",
          };
          finish();
        },
      );
    } else {
      answer = { ok: true, why: "" };
      finish();
    }
  };

  const sendBack = () => {
    if (disabled || phase !== "review") return;
    const text = note.trim();
    setSentNote(text);
    setRejectOpen(false);
    setNote("");
    drive(0, springs.glide, { fade: true });
    parkFocus();
    setPhase("rejected");
    onReject?.(text);
    say("Rejected. The agent will not make these changes.");
  };

  // The note takes focus once, as it arrives — never again on a re-render.
  const focusOnArrive = React.useCallback((node: HTMLElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const closeNote = () => {
    setRejectOpen(false);
    const t = rejectRef.current;
    if (t?.isConnected) t.focus({ preventScroll: true });
  };

  /* -------------------------------- render ------------------------------- */

  const share = r3((100 - TITLE_SHARE) / Math.max(1, fields.length));
  const cols = `${TITLE_SHARE}% ${fields.map(() => `${share}%`).join(" ")}`;
  const pill =
    status === "failed"
      ? { text: "Simulation failed", dot: "bg-danger" }
      : status === "loading"
        ? { text: "Simulating", dot: "bg-ink-3" }
        : phase === "applying"
          ? { text: "Applying", dot: "bg-(--wp-accent)" }
          : phase === "applied"
            ? { text: "Applied", dot: "bg-success" }
            : phase === "rejected"
              ? { text: "Rejected", dot: "bg-ink-3" }
              : { text: "Waiting for you", dot: "bg-warn" };

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]",
    FOCUS,
  );
  const quiet = cn(
    button,
    "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

  const header = (
    <header className="flex shrink-0 flex-col gap-2 border-b border-hairline px-4 pt-3.5 pb-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--wp-wash) text-[11px] font-semibold text-(--wp-accent)"
        >
          {action.agent.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
          {action.agent}
          <span className="text-ink-3">
            {" "}
            · {action.scope} · {ago(action.proposedAt, now)}
          </span>
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 text-[11px] text-ink-2">
          <span aria-hidden className={cn("size-1.5 rounded-full", pill.dot)} />
          {pill.text}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
          {action.title}
        </h2>
        <p
          className="text-[12px] leading-4 text-pretty text-ink-3 @max-[28rem]:line-clamp-2"
          title={action.summary}
        >
          {action.summary}
        </p>
      </div>
    </header>
  );

  const counts = ready ? (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-2 font-mono text-[11px] text-ink-2 tabular-nums">
      <span>
        <Roll value={String(included.length)} motionSafe={motionSafe} />
        <span className="text-ink-3"> of {records.length} items</span>
      </span>
      <span>
        <Roll value={String(changeCount)} motionSafe={motionSafe} />
        <span className="text-ink-3">
          {" "}
          {changeCount === 1 ? "change" : "changes"}
        </span>
      </span>
      <span>
        <span className="text-ink-3">avg </span>
        <Roll value={signed(average)} motionSafe={motionSafe} />
      </span>
      <span className="hidden @min-[28rem]:inline">
        <span className="text-ink-3">largest </span>
        <Roll value={signed(largest)} motionSafe={motionSafe} />
      </span>
    </div>
  ) : null;

  const warning =
    ready && largeIncluded.length > 0 && phase === "review" ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color-mix(in_oklab,var(--warn)_30%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-4 py-2">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
        <p className="min-w-0 flex-1 text-[12px] leading-4 text-foreground">
          {plural(largeIncluded.length, "item")}{" "}
          {largeIncluded.length === 1 ? "changes" : "change"} by more than{" "}
          {largeChangeAt}%.
        </p>
        <button
          type="button"
          aria-pressed={onlyLarge}
          onClick={() => {
            setOnlyLarge((v) => !v);
            say(
              onlyLarge
                ? `Showing all ${records.length} items.`
                : `Showing ${plural(largeRecords.length, "large change")}.`,
            );
          }}
          className={cn(
            "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 text-[11px] transition-colors",
            onlyLarge
              ? "border-[color-mix(in_oklab,var(--warn)_50%,transparent)] bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-foreground"
              : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          {onlyLarge ? (
            "Show all"
          ) : (
            <>
              <span className="@max-[28rem]:hidden">Show only these</span>
              <span className="@min-[28rem]:hidden">Only these</span>
            </>
          )}
        </button>
      </div>
    ) : null;

  const handleOn = phase === "review" && !disabled;

  const overlay = (
    <div className="pointer-events-none sticky top-0 z-[5] h-0">
      <div ref={overlayRef} className="absolute top-0 right-9 left-0">
        <AnimatePresence initial={false}>
          {handleOn && !narrow ? (
            <motion.div
              key="handle"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base }}
            >
              {style === "feather" ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-10 -translate-x-1/2 bg-[linear-gradient(to_right,transparent,var(--wp-wash),transparent)]"
                  style={{ left: "var(--wp-x)" }}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 -translate-x-1/2",
                  style === "line" && "w-[1.5px] bg-(--wp-accent)",
                  style === "feather" &&
                    "w-px bg-[color-mix(in_oklab,var(--wp-accent)_45%,transparent)]",
                  style === "cells" &&
                    "w-0 border-l-[1.5px] border-dashed border-(--wp-accent)",
                )}
                style={{ left: "var(--wp-x)" }}
              />
              <span
                aria-hidden
                className="absolute top-[3px] inline-flex h-[18px] items-center rounded-full bg-(--wp-button) px-2 font-mono text-[10px] tracking-[0.06em] text-(--wp-on) uppercase"
                style={{
                  right: "calc(100% - var(--wp-x) + 10px)",
                  opacity: "clamp(0, calc(var(--wp-n) / 14), 1)",
                }}
              >
                After
              </span>
              <span
                aria-hidden
                className="absolute top-[3px] inline-flex h-[18px] items-center rounded-full border border-hairline-strong bg-card px-2 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase"
                style={{
                  left: "calc(var(--wp-x) + 10px)",
                  opacity: "clamp(0, calc((100 - var(--wp-n)) / 14), 1)",
                }}
              >
                Before
              </span>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Compare before and after"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(value)}
                aria-valuetext={`${Math.round(value)}% shows the result`}
                aria-describedby={hintId}
                aria-disabled={locked || undefined}
                onKeyDown={onSliderKey}
                {...handleDrag}
                className={cn(
                  "group/wipe-preview-grip pointer-events-auto absolute top-0 bottom-0 flex w-11 -translate-x-1/2 touch-pan-y items-center justify-center",
                  locked ? "cursor-default" : "cursor-ew-resize",
                  FOCUS,
                  "focus-visible:outline-offset-0",
                )}
                style={{ left: "var(--wp-x)" }}
              >
                <span
                  className={cn(
                    "flex items-center justify-center border bg-card text-(--wp-accent) shadow-[0_4px_14px_color-mix(in_oklab,black_16%,transparent)] transition-transform group-active/wipe-preview-grip:scale-95",
                    style === "line" &&
                      "size-7 rounded-full border-(--wp-accent)",
                    style === "feather" &&
                      "h-9 w-[18px] rounded-full border-hairline-strong",
                    style === "cells" &&
                      "size-7 rounded-2 border-(--wp-accent)",
                  )}
                >
                  <ChevronsLeftRight
                    aria-hidden
                    className={cn(
                      "shrink-0",
                      style === "feather" ? "size-3 rotate-90" : "size-3.5",
                    )}
                  />
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  const ruler = (
    <div
      aria-hidden
      {...rulerDrag}
      className={cn(
        "sticky top-0 z-[4] hidden touch-pan-y grid-cols-[minmax(0,1fr)_2.25rem] border-b border-hairline bg-card select-none @min-[28rem]:grid",
        !locked && "cursor-ew-resize",
      )}
    >
      <div className="flex min-w-0 flex-col">
        {/* The lane the After and Before chips ride in, ticked every tenth. */}
        <div className="relative h-6">
          <span className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(to_right,var(--hairline-strong)_0_1px,transparent_1px_10%)]" />
        </div>
        <div className="grid h-7 [grid-template-columns:var(--wp-cols)] items-center font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          <span className="truncate pr-2 pl-3">Item</span>
          {fields.map((f) => (
            <span
              key={f.key}
              className={cn("truncate px-2", f.kind !== "text" && "text-right")}
            >
              {f.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const rows = shown.map((r) => {
    const fact = factOf(r.id);
    const isOut = excludedSet.has(r.id);
    const isActive = r.id === activeId;
    const common = {
      record: r,
      fields,
      changed: fact.changed,
      excluded: isOut,
      large: fact.large,
      change: fact.change,
      format,
      cellsMode: style === "cells",
    };
    return (
      <div
        key={r.id}
        ref={(node) => {
          if (node) optionRefs.current.set(r.id, node);
          else optionRefs.current.delete(r.id);
        }}
        role="option"
        aria-selected={!isOut}
        aria-label={sentenceOf(r)}
        tabIndex={isActive ? 0 : -1}
        onFocus={() => setActive(r.id)}
        className={cn(
          "group/wipe-preview-row relative grid scroll-mt-14 grid-cols-[minmax(0,1fr)_2.25rem] border-b border-hairline [--wp-row:var(--card)]",
          "hover:[--wp-row:color-mix(in_oklab,var(--card)_95%,var(--foreground))]",
          "focus-visible:[--wp-row:color-mix(in_oklab,var(--card)_93%,var(--foreground))]",
          "bg-(--wp-row) transition-colors",
          FOCUS_IN,
        )}
      >
        <div
          className={cn(
            "relative min-w-0 transition-opacity duration-200",
            isOut && "opacity-60",
          )}
        >
          <Cells {...common} side="after" />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0",
              style !== "cells" && "bg-(--wp-row)",
            )}
            style={
              {
                opacity: "var(--wp-fade)",
                clipPath:
                  style === "line" ? "inset(0 0 0 var(--wp-x))" : undefined,
                maskImage:
                  style === "feather"
                    ? "linear-gradient(to right, transparent calc(var(--wp-x) - 40px + var(--wp-n) * 0.4px), black calc(var(--wp-x) + var(--wp-n) * 0.4px))"
                    : undefined,
              } as React.CSSProperties
            }
          >
            <Cells {...common} side="before" />
          </div>
        </div>
        <span
          aria-hidden
          title={isOut ? "Include" : "Skip this item"}
          onClick={(event) => {
            event.stopPropagation();
            if (!locked) setExcluded(r.id, !isOut);
          }}
          className={cn(
            "flex items-center justify-center transition-colors",
            locked
              ? "text-ink-3/50"
              : "cursor-pointer text-ink-3 hover:text-foreground",
          )}
        >
          <span className="flex size-6 items-center justify-center rounded-2 group-hover/wipe-preview-row:bg-surface-2">
            {isOut ? (
              <Undo2 className="size-3.5" />
            ) : (
              <X className="size-3.5" />
            )}
          </span>
        </span>
      </div>
    );
  });

  const failedRecord = failure?.recordId
    ? records.find((r) => r.id === failure.recordId)
    : undefined;
  const failedAt = failedRecord ? records.indexOf(failedRecord) + 1 : 0;

  const stateView =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col">
        <p className="sr-only">Simulating the change.</p>
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="flex h-12 items-center gap-3 border-b border-hairline px-3 motion-safe:animate-pulse"
          >
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${28 + ((i * 37) % 22)}%` }}
            />
            <span className="ml-auto h-2.5 w-14 rounded-full bg-surface-2" />
            <span className="hidden h-2.5 w-14 rounded-full bg-surface-2 @min-[28rem]:block" />
          </div>
        ))}
      </div>
    ) : status === "failed" ? (
      <div className="flex flex-col gap-3 px-4 py-6">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger">
            <FlaskConical aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p role="alert" className="text-[13px] leading-5 font-medium">
              {failedRecord
                ? `The simulation stopped at item ${failedAt} of ${records.length}.`
                : "The simulation did not finish."}
            </p>
            <p className="text-[12px] leading-4 text-ink-2">
              {failure?.message ?? "Nothing has changed in the catalog."}
            </p>
          </div>
        </div>
        {failedRecord ? (
          <div className="ml-11 flex min-w-0 items-center gap-2 rounded-2 px-2.5 py-2 shadow-[0_0_0_1.5px_var(--danger)]">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
              {failedRecord.title}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3">
              {failedRecord.meta}
            </span>
          </div>
        ) : null}
        <div className="ml-11 flex flex-wrap gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                button,
                "bg-(--wp-button) text-(--wp-on) hover:opacity-90",
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry simulation
            </button>
          ) : null}
          {onEditPlan ? (
            <button type="button" onClick={onEditPlan} className={quiet}>
              <Pencil aria-hidden className="size-3.5" />
              Edit plan
            </button>
          ) : null}
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-[13px] text-ink-2">This plan changes nothing.</p>
        {onEditPlan ? (
          <button type="button" onClick={onEditPlan} className={quiet}>
            <Pencil aria-hidden className="size-3.5" />
            Edit plan
          </button>
        ) : null}
      </div>
    );

  const narrowToggle =
    ready && narrow && phase === "review" ? (
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <span className="text-[11px] text-ink-3">Compare</span>
        <div
          role="radiogroup"
          aria-label="Show"
          className="relative flex h-8 items-center rounded-2 bg-surface-2 p-0.5"
        >
          {(["before", "after"] as const).map((side) => {
            const on = value >= 50 === (side === "after");
            return (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => toggleSide(side)}
                onKeyDown={(event) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(event.key)
                  ) {
                    event.preventDefault();
                    const next = side === "after" ? "before" : "after";
                    toggleSide(next);
                    (
                      event.currentTarget.parentElement?.querySelector(
                        `[data-wp-side="${next}"]`,
                      ) as HTMLElement | null
                    )?.focus();
                  }
                }}
                data-wp-side={side}
                className={cn(
                  "relative inline-flex h-7 items-center rounded-[5px] px-3 text-[12px] transition-colors",
                  on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-side`}
                    aria-hidden
                    className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">
                  {side === "after" ? "After" : "Before"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  const compare = (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {narrowToggle}
      <motion.div
        ref={bindScroller}
        className={cn(
          "relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain",
          phase === "rejected" && "opacity-70",
        )}
        style={
          {
            "--wp-x": wipeX,
            "--wp-n": wipeN,
            "--wp-fade": fadeVar,
            "--wp-cols": cols,
          } as React.CSSProperties & Record<string, unknown>
        }
      >
        {ready ? (
          <>
            {overlay}
            {ruler}
            <div
              role="listbox"
              aria-multiselectable
              aria-labelledby={titleId}
              aria-describedby={hintId}
              aria-disabled={locked || undefined}
              onKeyDown={onListKey}
              className="flex flex-col"
            >
              {rows}
            </div>
          </>
        ) : (
          stateView
        )}
      </motion.div>

      <AnimatePresence>
        {phase === "applied" ? (
          <motion.div
            key="stamp"
            aria-hidden
            className="pointer-events-none absolute top-12 right-14 z-[6] rounded-2 border-2 border-(--wp-accent) bg-[color-mix(in_oklab,var(--card)_86%,transparent)] px-3 py-1.5 font-mono text-[13px] font-semibold tracking-[0.12em] text-(--wp-accent) uppercase"
            initial={
              motionSafe
                ? { opacity: 0, scale: 1.3, rotate: -10 }
                : { opacity: 0, scale: 1, rotate: -6 }
            }
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? {
                    scale: springs.recoil,
                    rotate: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.base }
            }
          >
            Applied · {included.length}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const footer = (
    <footer className="flex shrink-0 flex-col border-t border-hairline">
      <AnimatePresence initial={false}>
        {rejectOpen && phase === "review" ? (
          <motion.div
            key="note"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
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
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <form
              className="flex flex-col gap-2 px-4 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                sendBack();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeNote();
                }
              }}
            >
              <label htmlFor={noteId} className="text-[11px] text-ink-2">
                Tell the agent why (optional)
              </label>
              <textarea
                id={noteId}
                ref={focusOnArrive}
                rows={2}
                value={note}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setNote(text);
                }}
                className={cn(
                  "w-full resize-none rounded-2 border border-input bg-background px-2.5 py-1.5 text-[12px] leading-4 text-foreground placeholder:text-ink-3",
                  FOCUS,
                )}
                placeholder="Keep sale prices until November."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className={cn(
                    button,
                    "bg-foreground text-background hover:opacity-90",
                  )}
                >
                  Send back
                </button>
                <button type="button" onClick={closeNote} className={quiet}>
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {applyError && phase === "review" ? (
        <p
          role="alert"
          className="flex items-start gap-2 px-4 pt-3 text-[12px] leading-4 text-danger"
        >
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {applyError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {phase === "applied" ? (
          <p className="min-w-0 flex-1 text-[12px] text-ink-2">
            Applied to {plural(included.length, "item")}.
            {records.length > included.length
              ? ` ${records.length - included.length} skipped.`
              : ""}
          </p>
        ) : phase === "rejected" ? (
          <p className="min-w-0 flex-1 text-[12px] text-ink-2">
            Sent back. Nothing changed.
            {sentNote ? (
              <span className="text-ink-3">{` “${sentNote}”`}</span>
            ) : null}
          </p>
        ) : (
          <>
            <button
              ref={rejectRef}
              type="button"
              aria-expanded={rejectOpen}
              aria-controls={rejectOpen ? noteId : undefined}
              aria-disabled={disabled || phase !== "review" || undefined}
              onClick={() => {
                if (disabled || phase !== "review") return;
                if (rejectOpen) closeNote();
                else setRejectOpen(true);
              }}
              className={quiet}
            >
              Reject
            </button>
            {onEditPlan ? (
              <button
                type="button"
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (!disabled) onEditPlan();
                }}
                className={cn(quiet, "border-transparent")}
              >
                <Pencil aria-hidden className="size-3.5" />
                <span className="hidden @min-[24rem]:inline">Edit plan</span>
                <span className="sr-only @min-[24rem]:hidden">Edit plan</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={approve}
              aria-disabled={
                disabled || !!blockedWhy || phase !== "review" || undefined
              }
              aria-busy={phase === "applying" || undefined}
              aria-describedby={blockedWhy ? `${uid}-why` : undefined}
              className={cn(
                button,
                "ml-auto bg-(--wp-button) text-(--wp-on)",
                disabled || blockedWhy
                  ? "cursor-not-allowed opacity-50"
                  : "hover:opacity-90",
              )}
            >
              {phase === "applying"
                ? "Applying…"
                : ready
                  ? `Approve ${plural(included.length, "item")}`
                  : "Approve"}
            </button>
            {blockedWhy ? (
              <span id={`${uid}-why`} className="sr-only">
                {blockedWhy}
              </span>
            ) : null}
          </>
        )}
      </div>
    </footer>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground outline-none",
        disabled && "opacity-80",
        className,
      )}
      style={{ maxHeight: height, ...themeVars(accent, ringColor) }}
    >
      {header}
      {counts}
      <AnimatePresence initial={false}>
        {warning ? (
          <motion.div
            key="warning"
            className="shrink-0 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            {warning}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {compare}
      {footer}
      <p id={hintId} className="sr-only">
        Arrow keys move the wipe; Shift moves it further. In the list, Up and
        Down move between items and X or Space skips or includes the focused
        item.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
