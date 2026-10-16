"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
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

export type MixedValuesKind = "text" | "number" | "money" | "choice";

export type MixedValuesField = {
  /** The key in each record's values. */
  id: string;
  label: string;
  /** @default "text" */
  kind?: MixedValuesKind;
  /** Choice kind: the values offered. */
  options?: string[];
  /** Number kind: the unit after the value. */
  suffix?: string;
  /** The error for a typed value, or null when it may be applied. */
  validate?: (value: string) => string | null;
};

export type MixedValuesRecord = {
  id: string;
  /** What the record is called in the list and in announcements. */
  name: string;
  /** Field values as text; money as a decimal ("16.00"). */
  values: Record<string, string>;
};

/** Only the fields that change: field id → the new value for every record. */
export type MixedValuesChanges = Record<string, string>;

export type MixedValuesChipStyle = "stack" | "bar" | "inline";
export type MixedValuesDensity = "compact" | "regular" | "roomy";
export type MixedValuesStatus = "ready" | "loading" | "error";

export type MixedValuesProps = {
  /** The records being edited, beside the form. @default defaultMixedValuesRecords */
  records?: MixedValuesRecord[];
  /** The form, in order. @default defaultMixedValuesFields */
  fields?: MixedValuesField[];
  /** Controlled selection: record ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default every record */
  defaultSelected?: string[];
  /** Fires from the checkbox that changed the selection. */
  onSelectedChange?: (ids: string[]) => void;
  /** Fires from the keystroke or choice that changed the pending edit, with only the changed fields. */
  onChange?: (changes: MixedValuesChanges) => void;
  /** Apply was pressed: the changed fields and the selected records they touch. Call `report` per record as each settles; return a promise to show progress until it does. */
  onApply?: (
    changes: MixedValuesChanges,
    ids: string[],
    report: (id: string, ok: boolean, reason?: string) => void,
  ) => void | Promise<unknown>;
  /** Cancel was pressed, with the changes being dropped. */
  onCancel?: (changes: MixedValuesChanges) => void;
  /** How a field's differing values are shown: a stacked deck that fans on focus, one bar split by share, or every value in a row. @default "stack" */
  chipStyle?: MixedValuesChipStyle;
  /** Row heights and type size. @default "regular" */
  density?: MixedValuesDensity;
  /** The new-value chip, the ripple, Apply and progress — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** What one record is called. @default { one: "product", other: "products" } */
  itemLabel?: { one: string; other: string };
  /** @default "Edit products" */
  heading?: string;
  /** @default "USD" */
  currency?: string;
  /** @default "en-US" */
  locale?: string;
  /** Whether the records have loaded. @default "ready" */
  status?: MixedValuesStatus;
  /** "Try again" was pressed after the records failed to load. */
  onRetry?: () => void;
  /** The panel's height in px; the form and the list scroll inside it. @default 540 */
  height?: number;
  /** Nothing can be edited or applied. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultMixedValuesFields: MixedValuesField[] = [
  {
    id: "status",
    label: "Status",
    kind: "choice",
    options: ["Active", "Draft", "Paused"],
  },
  {
    id: "roast",
    label: "Roast",
    kind: "choice",
    options: ["Light", "Medium", "Dark"],
  },
  {
    id: "price",
    label: "Price",
    kind: "money",
    validate: (v) =>
      Number.isFinite(Number(v)) && Number(v) > 0
        ? null
        : "Use an amount like 16.00",
  },
  {
    id: "shelf",
    label: "Shelf",
    validate: (v) =>
      v.trim().length <= 12 ? null : "Keep it under 12 characters",
  },
  {
    id: "reorder",
    label: "Reorder at",
    kind: "number",
    suffix: "bags",
    validate: (v) =>
      /^\d+$/.test(v.trim()) && Number(v) <= 500
        ? null
        : "A whole number up to 500",
  },
];

const product = (
  id: string,
  name: string,
  status: string,
  roast: string,
  price: string,
  shelf: string,
): MixedValuesRecord => ({
  id,
  name,
  values: { status, roast, price, shelf, reorder: "12" },
});

/** Fourteen Coldbrook retail bags, selected together. */
export const defaultMixedValuesRecords: MixedValuesRecord[] = [
  product("cb-01", "Halden Espresso 250 g", "Active", "Medium", "14.00", "A2"),
  product("cb-02", "Halden Espresso 1 kg", "Active", "Medium", "42.00", "Back"),
  product("cb-03", "Mill Lane Filter 250 g", "Active", "Light", "14.00", "A2"),
  product("cb-04", "Mill Lane Filter 1 kg", "Draft", "Light", "38.00", "Back"),
  product("cb-05", "Weir Decaf 250 g", "Active", "Medium", "12.50", "B1"),
  product("cb-06", "Basin Vale Single Origin", "Draft", "Light", "16.00", "A2"),
  product(
    "cb-07",
    "Night Shift Espresso 250 g",
    "Active",
    "Dark",
    "14.00",
    "B1",
  ),
  product(
    "cb-08",
    "Night Shift Espresso 1 kg",
    "Paused",
    "Dark",
    "42.00",
    "B1",
  ),
  product("cb-09", "Riverside Filter 250 g", "Active", "Medium", "12.50", "A2"),
  product(
    "cb-10",
    "Copper Kettle Blend 250 g",
    "Active",
    "Dark",
    "14.00",
    "A2",
  ),
  product("cb-11", "Copper Kettle Blend 1 kg", "Draft", "Dark", "38.00", "B1"),
  product(
    "cb-12",
    "Slow Morning Decaf 250 g",
    "Active",
    "Medium",
    "12.50",
    "A2",
  ),
  product("cb-13", "Fieldline Washed 250 g", "Draft", "Medium", "16.00", "B1"),
  product("cb-14", "Coldbrook House 250 g", "Active", "Medium", "12.50", "A2"),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const DENSITY: Record<
  MixedValuesDensity,
  { row: string; field: string; gap: string; text: string }
> = {
  compact: { row: "py-1.5", field: "h-8", gap: "gap-3", text: "text-[12px]" },
  regular: { row: "py-2", field: "h-9", gap: "gap-4", text: "text-[13px]" },
  roomy: { row: "py-3", field: "h-10", gap: "gap-5", text: "text-[13px]" },
};

const plural = (n: number, item: { one: string; other: string }) =>
  `${n} ${n === 1 ? item.one : item.other}`;

/** The text a value is compared by: money and numbers by amount. */
const norm = (f: MixedValuesField, v: string) => {
  const t = v.trim();
  if (f.kind === "money" && t !== "" && Number.isFinite(Number(t))) {
    return Number(t).toFixed(2);
  }
  if (f.kind === "number" && t !== "" && Number.isFinite(Number(t))) {
    return String(Number(t));
  }
  return t;
};

type Variant = { value: string; count: number };

function variantsOf(
  f: MixedValuesField,
  records: MixedValuesRecord[],
): Variant[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const v = norm(f, r.values[f.id] ?? "");
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  // Most common first; ties in plain order, so the server and the browser agree.
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    );
}

/** A count whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${String(value).length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
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

/**
 * A field's differing values. The chips sit in a row (most common on the
 * right); stacked, each slides behind the one before it to peek out by 5px,
 * fanned they stand side by side, and when the field gets a new value they
 * all slide into the first and fade while the new-value chip pops in. Every
 * position is measured from the row's own layout, so nothing above the form
 * moving can set them sliding.
 */
function Variants({
  variants,
  format,
  chipStyle,
  fanned,
  next,
  onRevert,
  fieldLabel,
  motionSafe,
}: {
  variants: Variant[];
  format: (v: string) => string;
  chipStyle: MixedValuesChipStyle;
  fanned: boolean;
  next: { label: string; count: number } | null;
  onRevert: () => void;
  fieldLabel: string;
  motionSafe: boolean;
}) {
  const shown = chipStyle === "inline" ? variants : variants.slice(0, 3);
  const more = variants.length - shown.length;
  const rowRef = React.useRef<HTMLSpanElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const placed = React.useRef(false);
  const seenChips = React.useRef(new WeakSet<HTMLElement>());
  const stackKey = `${shown.map((v) => `${v.value}:${v.count}`).join("|")}`;
  const collapse = next !== null;

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || chipStyle === "bar") return;
    const chips = Array.from(
      row.querySelectorAll<HTMLElement>("[data-mv-chip]"),
    );
    const top = chips[0];
    if (!top) return;
    for (const c of runs.current) c.stop();
    runs.current = [];
    const stacked = chipStyle === "stack" && !fanned;
    // The first placing is the designed still: no flight into the deck.
    const instant = !motionSafe || !placed.current;
    placed.current = true;
    const spring = instant
      ? { duration: 0 }
      : collapse
        ? springs.glide
        : springs.snap;
    // Stacked, the row is only as wide as the top chip and the edges peeking
    // out behind it, so the label beside it keeps its room; the rest of the
    // deck overflows to the left, under the top chip.
    if (chipStyle === "stack") {
      const gap = 4;
      const full =
        chips.reduce((t, c) => t + c.offsetWidth, 0) + gap * (chips.length - 1);
      const deck = top.offsetWidth + Math.min(chips.length - 1, 2) * 6;
      runs.current.push(
        animate(
          row,
          { width: Math.round(stacked || collapse ? deck : full) },
          spring,
        ),
      );
    }
    chips.forEach((chip, i) => {
      // A chip that has just arrived (the selection changed what is mixed)
      // takes its place at once rather than flying in from the row.
      const fresh = !seenChips.current.has(chip);
      seenChips.current.add(chip);
      const toTop = top.offsetLeft - chip.offsetLeft;
      const target = collapse
        ? { x: r1(toTop), y: 0, scale: 0.9, opacity: 0 }
        : stacked && i > 0
          ? {
              x: r1(toTop - i * 6),
              y: i * 3,
              scale: r1(1 - i * 0.06),
              opacity: i < 3 ? 1 : 0,
            }
          : { x: 0, y: 0, scale: 1, opacity: 1 };
      chip.style.zIndex = String(10 - i);
      runs.current.push(
        animate(
          chip,
          target,
          fresh || instant
            ? { duration: 0 }
            : collapse
              ? { ...springs.glide, opacity: { duration: durations.base } }
              : spring,
        ),
      );
    });
  }, [chipStyle, fanned, collapse, motionSafe, stackKey]);

  React.useEffect(() => {
    const list = runs;
    return () => {
      for (const c of list.current) c.complete();
    };
  }, []);

  return (
    <span className="relative inline-flex min-w-0 items-center justify-end">
      {chipStyle === "bar" ? (
        <motion.span
          aria-hidden
          className="inline-flex h-6 max-w-full items-center gap-2 rounded-full border border-hairline-strong bg-card pr-2.5 pl-2 text-[11px] whitespace-nowrap text-foreground"
          initial={false}
          animate={{
            opacity: next ? 0 : 1,
            scale: next && motionSafe ? 0.9 : 1,
          }}
          style={{ originX: 1 }}
          transition={
            motionSafe
              ? { scale: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <span className="max-w-[6rem] truncate">
            {format(variants[0]?.value ?? "")}
          </span>
          <span className="-ml-1 font-mono text-[10px] text-ink-3 tabular-nums">
            {variants[0]?.count ?? 0}
          </span>
          {/* The share of each value, as one strip: the widest is the most
              common, so the split reads at a glance. */}
          <motion.span
            className="flex h-1.5 overflow-hidden rounded-full bg-surface-2"
            initial={false}
            animate={{ width: fanned ? 96 : 56 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {variants.map((v, i) => (
              <span
                key={v.value}
                className={cn("h-full", i > 0 && "border-l border-card")}
                style={{
                  flexGrow: v.count,
                  flexBasis: 0,
                  backgroundColor: `color-mix(in oklab, var(--mv-accent) ${Math.max(22, 90 - i * 24)}%, transparent)`,
                }}
              />
            ))}
          </motion.span>
          {variants.length > 1 ? (
            <span className="font-mono text-[10px] text-ink-3">
              +{variants.length - 1}
            </span>
          ) : null}
        </motion.span>
      ) : (
        <span
          ref={rowRef}
          aria-hidden
          className={cn(
            "relative inline-flex flex-row-reverse items-center gap-1",
            chipStyle === "inline" && "flex-wrap justify-start",
          )}
        >
          {shown.map((v, i) => (
            <span
              key={v.value}
              data-mv-chip=""
              className={cn(
                "relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong px-2 text-[11px] whitespace-nowrap shadow-[0_1px_3px_color-mix(in_oklab,black_10%,transparent)]",
                i === 0 ? "bg-card text-foreground" : "bg-surface-2 text-ink-2",
              )}
            >
              <span className="max-w-[7rem] truncate">{format(v.value)}</span>
              <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                {v.count}
              </span>
            </span>
          ))}
          {more > 0 ? (
            <span
              data-mv-chip=""
              className="relative inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[10px] text-ink-3"
            >
              +{more}
            </span>
          ) : null}
        </span>
      )}
      <AnimatePresence initial={false}>
        {next ? (
          <motion.span
            key="next"
            className="absolute right-0 z-20 inline-flex h-6 items-center gap-1 rounded-full pr-0.5 pl-2 text-[11px] font-medium whitespace-nowrap text-white shadow-[0_2px_8px_color-mix(in_oklab,var(--mv-accent)_35%,transparent)]"
            style={{
              backgroundColor: "oklch(from var(--mv-accent) 0.52 c h)",
              originX: 1,
            }}
            initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.9 : 1,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    scale: { ...springs.snap, delay: 0.06 },
                    opacity: { duration: durations.fast, delay: 0.06 },
                  }
                : { duration: durations.fast }
            }
          >
            <span className="max-w-[8rem] truncate">{next.label}</span>
            <span className="font-mono text-[10px] text-white/80">
              <Rolling value={next.count} motionSafe={motionSafe} />
            </span>
            <button
              type="button"
              aria-label={`Keep each ${fieldLabel.toLowerCase()}`}
              onClick={onRevert}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3" />
            </button>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

type Result = { ok: boolean; reason?: string };
type Run = {
  ids: string[];
  changes: MixedValuesChanges;
  results: Record<string, Result>;
  state: "running" | "done";
};

/* ----------------------------------------------------------------------- */
/*                                The editor                                */
/* ----------------------------------------------------------------------- */

/**
 * A bulk edit form over a selection of records. A field whose values differ
 * shows them as a chip of variants with counts; typing or choosing a new
 * value collapses the chips into one on glide while the new-value chip pops
 * in on snap, its count rolling as the selection changes, and committing it
 * (Enter, leaving the field, or a choice) sends a ripple down the records
 * list — each record the change touches lights in a cascade and shows its
 * diff, and records that already hold the value stay still. A field left
 * alone keeps every original; Escape or the chip's × takes a field back.
 *
 * Under the form a preview names how many records each change touches. Apply
 * reports with only the changed fields and the touched records, and turns
 * into a bar that glides with each record's result while rows tick or cross;
 * failures are listed with their reasons and Retry failed. Tab and Enter work
 * throughout — Enter commits a field and moves on — and the list is a real
 * list of checkboxes. Below a 40rem container the list folds under the form.
 * Under reduced motion the chips swap without travel and the ripple is one
 * simultaneous wash; progress, ticks and counts still show.
 */
export function MixedValues({
  records = defaultMixedValuesRecords,
  fields = defaultMixedValuesFields,
  selected,
  defaultSelected,
  onSelectedChange,
  onChange,
  onApply,
  onCancel,
  chipStyle = "stack",
  density = "regular",
  accent = "var(--accent-bright)",
  itemLabel = { one: "product", other: "products" },
  heading = "Edit products",
  currency = "USD",
  locale = "en-US",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: MixedValuesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const headingId = `${uid}-heading`;
  const listId = `${uid}-list`;
  const ready = status === "ready";
  const geom = DENSITY[density] ?? DENSITY.regular;

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );
  const show = (f: MixedValuesField, v: string) => {
    if (v === "") return "—";
    if (f.kind === "money" && Number.isFinite(Number(v))) {
      return money.format(Number(v));
    }
    if (f.suffix) return `${v} ${f.suffix}`;
    return v;
  };

  /* ------------------------------- state -------------------------------- */

  // Applied values sit over the records the host passed, until it passes new ones.
  const [applied, setApplied] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [seenRecords, setSeenRecords] = React.useState(records);
  if (seenRecords !== records) {
    setSeenRecords(records);
    setApplied({});
  }
  const data = React.useMemo(
    () =>
      records.map((r) =>
        applied[r.id] ? { ...r, values: { ...r.values, ...applied[r.id] } } : r,
      ),
    [records, applied],
  );

  const [ownSelected, setOwnSelected] = React.useState<string[]>(
    () => defaultSelected ?? records.map((r) => r.id),
  );
  const chosen = selected ?? ownSelected;
  const chosenSet = React.useMemo(() => new Set(chosen), [chosen]);
  const picked = data.filter((r) => chosenSet.has(r.id));

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [fanned, setFanned] = React.useState<string | null>(null);
  const [ripple, setRipple] = React.useState<{
    field: string;
    value: string;
    n: number;
  } | null>(null);
  const [run, setRun] = React.useState<Run | null>(null);
  const [touchedErr, setTouchedErr] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [listOpen, setListOpen] = React.useState(false);
  const [narrow, setNarrow] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const running = run?.state === "running";
  const locked = disabled || !ready || running;

  const info = fields.map((f) => {
    const variants = variantsOf(f, picked);
    const mixed = variants.length > 1;
    const common = variants.length === 1 ? (variants[0]?.value ?? "") : "";
    const draft = drafts[f.id];
    const typed = draft === undefined ? "" : norm(f, draft);
    const error =
      draft !== undefined && typed !== "" && f.validate
        ? f.validate(draft)
        : null;
    const changed =
      draft !== undefined &&
      typed !== "" &&
      !error &&
      (mixed || typed !== common);
    const touches = changed
      ? picked.filter((r) => norm(f, r.values[f.id] ?? "") !== typed).length
      : 0;
    return {
      f,
      variants,
      mixed,
      common,
      draft,
      typed,
      error,
      changed,
      touches,
    };
  });
  const changes: MixedValuesChanges = {};
  for (const x of info) if (x.changed) changes[x.f.id] = x.typed;
  const changeCount = Object.keys(changes).length;
  const touchedIds = picked
    .filter((r) =>
      info.some(
        (x) => x.changed && norm(x.f, r.values[x.f.id] ?? "") !== x.typed,
      ),
    )
    .map((r) => r.id);

  /* ------------------------------- refs --------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const alive = React.useRef(false);
  const progress = useMotionValue(0);
  const progressRun = React.useRef<AnimationPlaybackControls | null>(null);
  const progressWidth = useTransform(
    progress,
    (v) => `${r1(clamp01(v) * 100)}%`,
  );

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      progressRun.current?.stop();
    };
  }, []);

  // The list folds under the form below 40rem; the fold is only inert there.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => setNarrow(root.offsetWidth < 640));
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The ripple: every record the committed value changes lights in turn,
  // top to bottom; under reduced motion they light together.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !ripple) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>(
        `[data-mv-touch~="${CSS.escape(ripple.field)}"]`,
      ),
    );
    const step = cascade(rows.length);
    const runs: AnimationPlaybackControls[] = [];
    rows.forEach((row, i) => {
      const wash = row.querySelector<HTMLElement>("[data-mv-wash]");
      const diff = row.querySelector<HTMLElement>(
        `[data-mv-diff="${CSS.escape(ripple.field)}"]`,
      );
      const delay = motionSafe ? i * step : 0;
      if (wash) {
        runs.push(
          animate(
            wash,
            { opacity: [0.9, 0] },
            { duration: 0.7, ease: easings.enter, delay },
          ),
        );
      }
      if (diff && motionSafe) {
        runs.push(
          animate(
            diff,
            { x: [-distances.nudge, 0], opacity: [0, 1] },
            {
              x: { ...springs.snap, delay },
              opacity: { duration: durations.base, delay },
            },
          ),
        );
      }
    });
    return () => {
      for (const c of runs) c.complete();
    };
  }, [ripple, motionSafe]);

  /* ------------------------------ actions ------------------------------- */

  const changesFrom = (nextDrafts: Record<string, string>) => {
    const out: MixedValuesChanges = {};
    for (const x of info) {
      const d = nextDrafts[x.f.id];
      if (d === undefined) continue;
      const t = norm(x.f, d);
      if (t === "" || (x.f.validate && x.f.validate(d))) continue;
      if (x.mixed || t !== x.common) out[x.f.id] = t;
    }
    return out;
  };

  const setDraft = (id: string, text: string | undefined) => {
    if (locked) return;
    const next = { ...drafts };
    if (text === undefined) delete next[id];
    else next[id] = text;
    setDrafts(next);
    if (run?.state === "done") setRun(null);
    onChange?.(changesFrom(next));
  };

  const commitField = (id: string) => {
    const x = info.find((i) => i.f.id === id);
    if (!x) return;
    if (x.error) {
      setTouchedErr((t) => new Set(t).add(id));
      return;
    }
    if (!x.changed) return;
    if (ripple?.field === id && ripple.value === x.typed) return;
    setRipple((r) => ({ field: id, value: x.typed, n: (r?.n ?? 0) + 1 }));
    say(
      `${x.f.label} will be ${show(x.f, x.typed)} on ${plural(x.touches, itemLabel)}.`,
    );
  };

  const revert = (id: string) => {
    const x = info.find((i) => i.f.id === id);
    setDraft(id, undefined);
    setTouchedErr((t) => {
      if (!t.has(id)) return t;
      const n = new Set(t);
      n.delete(id);
      return n;
    });
    if (x) say(`${x.f.label}: keeping each value.`);
  };

  const focusNext = (id: string) => {
    const at = fields.findIndex((f) => f.id === id);
    const next = fields[at + 1];
    const root = rootRef.current;
    if (!root) return;
    const node = next
      ? root.querySelector<HTMLElement>(
          `[data-mv-control="${CSS.escape(next.id)}"]`,
        )
      : root.querySelector<HTMLElement>("[data-mv-apply]");
    node?.focus();
  };

  const setSelection = (ids: string[]) => {
    if (locked) return;
    if (selected === undefined) setOwnSelected(ids);
    onSelectedChange?.(ids);
  };

  const toggleRecord = (id: string) => {
    const on = !chosenSet.has(id);
    const ids = on ? [...chosen, id] : chosen.filter((x) => x !== id);
    setSelection(ids);
    const r = data.find((x) => x.id === id);
    say(
      `${r?.name ?? "Record"} ${on ? "added" : "left out"}. ${plural(ids.length, itemLabel)} selected.`,
    );
  };

  const toggleAll = () => {
    const all = data.every((r) => chosenSet.has(r.id));
    const ids = all ? [] : data.map((r) => r.id);
    setSelection(ids);
    say(
      all ? "Selection cleared." : `${plural(ids.length, itemLabel)} selected.`,
    );
  };

  const cancel = () => {
    if (locked) return;
    const dropped = { ...changes };
    setDrafts({});
    setTouchedErr(new Set());
    setRun(null);
    onCancel?.(dropped);
    onChange?.({});
    say("Changes dropped. Every value is kept.");
  };

  const apply = () => {
    if (locked) return;
    if (changeCount === 0) {
      say("Nothing to apply yet.");
      return;
    }
    if (touchedIds.length === 0) {
      say(`Every selected ${itemLabel.one} already has these values.`);
      return;
    }
    const ids = touchedIds;
    const sent = { ...changes };
    const fresh: Run = { ids, changes: sent, results: {}, state: "running" };
    setRun(fresh);
    progressRun.current?.stop();
    progress.jump(0);
    say(`Applying to ${plural(ids.length, itemLabel)}.`);
    const results: Record<string, Result> = {};
    const settle = () => {
      if (!alive.current) return;
      for (const id of ids) if (!results[id]) results[id] = { ok: true };
      const okIds = ids.filter((id) => results[id]?.ok);
      setApplied((a) => {
        const next = { ...a };
        for (const id of okIds) next[id] = { ...(next[id] ?? {}), ...sent };
        return next;
      });
      const failed = ids.length - okIds.length;
      setRun({ ids, changes: sent, results: { ...results }, state: "done" });
      progressRun.current?.stop();
      progressRun.current = animate(
        progress,
        1,
        motionSafe ? springs.glide : { duration: 0 },
      );
      if (failed === 0) {
        setDrafts({});
        onChange?.({});
      }
      say(
        failed === 0
          ? `${plural(okIds.length, itemLabel)} updated.`
          : `${okIds.length} updated, ${failed} failed.`,
      );
    };
    const report = (id: string, ok: boolean, reason?: string) => {
      if (!alive.current || !ids.includes(id) || results[id]) return;
      results[id] = { ok, reason };
      const n = Object.keys(results).length;
      setRun((r) =>
        r && r.state === "running"
          ? { ...r, results: { ...r.results, [id]: { ok, reason } } }
          : r,
      );
      progressRun.current?.stop();
      progressRun.current = animate(
        progress,
        n / ids.length,
        motionSafe ? springs.glide : { duration: 0 },
      );
    };
    let result: void | Promise<unknown>;
    try {
      result = onApply?.(sent, ids, report);
    } catch {
      for (const id of ids) {
        if (!results[id]) results[id] = { ok: false, reason: "Not saved" };
      }
      settle();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(settle, () => {
        for (const id of ids) {
          if (!results[id]) results[id] = { ok: false, reason: "Not saved" };
        }
        settle();
      });
    } else settle();
  };

  /* ------------------------------- render ------------------------------- */

  const failures = run
    ? run.ids
        .filter((id) => run.results[id] && !run.results[id]?.ok)
        .map((id) => ({
          id,
          name: data.find((r) => r.id === id)?.name ?? id,
          reason: run.results[id]?.reason ?? "Not saved",
        }))
    : [];
  const doneCount = run ? Object.keys(run.results).length : 0;
  const allPicked = data.length > 0 && data.every((r) => chosenSet.has(r.id));
  const somePicked = data.some((r) => chosenSet.has(r.id));

  const fieldRow = (x: (typeof info)[number]) => {
    const { f, variants, mixed, common, draft, error, changed, touches } = x;
    const id = `${uid}-${f.id}`;
    const chipId = `${id}-chip`;
    const errId = `${id}-error`;
    const showErr = !!error && touchedErr.has(f.id);
    const describedBy =
      [mixed ? chipId : null, showErr ? errId : null]
        .filter(Boolean)
        .join(" ") || undefined;
    const chipWords = mixed
      ? `Mixed: ${variants.map((v) => `${show(f, v.value)} on ${v.count}`).join(", ")}.`
      : "";
    const nextChip = changed
      ? { label: show(f, x.typed), count: picked.length }
      : null;
    const control =
      f.kind === "choice" ? (
        <div className="relative">
          <select
            id={id}
            data-mv-control={f.id}
            value={draft ?? (mixed ? "" : common)}
            disabled={locked}
            aria-describedby={describedBy}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "" || (!mixed && v === common)) revert(f.id);
              else {
                setDraft(f.id, v);
                setRipple((r) => ({
                  field: f.id,
                  value: v,
                  n: (r?.n ?? 0) + 1,
                }));
                const hits = picked.filter(
                  (rec) => norm(f, rec.values[f.id] ?? "") !== v,
                ).length;
                say(`${f.label} will be ${v} on ${plural(hits, itemLabel)}.`);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && draft !== undefined) {
                e.preventDefault();
                revert(f.id);
              }
            }}
            className={cn(
              "w-full appearance-none rounded-2 border bg-surface-1 pr-8 pl-3 text-[13px] text-foreground transition-colors disabled:opacity-60",
              changed ? "border-(--mv-line)" : "border-hairline-strong",
              geom.field,
              FIELD_RING,
            )}
          >
            {mixed ? <option value="">Keep each</option> : null}
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
          />
        </div>
      ) : (
        <div className="relative">
          {f.kind === "money" ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-3"
            >
              {money.formatToParts(0).find((p) => p.type === "currency")?.value}
            </span>
          ) : null}
          <input
            id={id}
            data-mv-control={f.id}
            value={draft ?? (mixed ? "" : common)}
            placeholder={mixed ? "Mixed · keep each" : undefined}
            inputMode={
              f.kind === "money" || f.kind === "number" ? "decimal" : undefined
            }
            disabled={locked}
            aria-invalid={showErr || undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (!mixed && norm(f, v) === common) setDraft(f.id, undefined);
              else setDraft(f.id, v === "" && mixed ? undefined : v);
            }}
            onBlur={() => commitField(f.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitField(f.id);
                if (!error) focusNext(f.id);
              } else if (e.key === "Escape" && draft !== undefined) {
                // Ours: the field goes back to keeping each value.
                e.preventDefault();
                revert(f.id);
              }
            }}
            className={cn(
              "w-full rounded-2 border bg-surface-1 px-3 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:opacity-60",
              f.kind === "money" && "pl-7 font-mono tabular-nums",
              f.kind === "number" && "font-mono tabular-nums",
              f.suffix && "pr-12",
              showErr
                ? "border-danger/70"
                : changed
                  ? "border-(--mv-line)"
                  : "border-hairline-strong",
              geom.field,
              FIELD_RING,
            )}
          />
          {f.suffix ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-3"
            >
              {f.suffix}
            </span>
          ) : null}
        </div>
      );
    return (
      <div
        key={f.id}
        className="flex flex-col gap-1.5"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setFanned(f.id);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse")
            setFanned((v) => (v === f.id ? null : v));
        }}
        onFocus={() => setFanned(f.id)}
        onBlur={(e) => {
          const to = e.relatedTarget;
          if (!(to instanceof Node && e.currentTarget.contains(to))) {
            setFanned((v) => (v === f.id ? null : v));
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label
            htmlFor={id}
            className="text-[12px] font-medium text-foreground"
          >
            {f.label}
          </label>
          {mixed || changed ? (
            <Variants
              variants={variants}
              format={(v) => show(f, v)}
              chipStyle={chipStyle}
              fanned={fanned === f.id}
              next={nextChip}
              onRevert={() => {
                revert(f.id);
                rootRef.current
                  ?.querySelector<HTMLElement>(
                    `[data-mv-control="${CSS.escape(f.id)}"]`,
                  )
                  ?.focus();
              }}
              fieldLabel={f.label}
              motionSafe={motionSafe}
            />
          ) : (
            <span className="text-[11px] text-ink-3">
              Same on all {picked.length}
            </span>
          )}
          {mixed ? (
            <span id={chipId} className="sr-only">
              {chipWords}
            </span>
          ) : null}
        </div>
        {control}
        {showErr ? (
          <p
            id={errId}
            className="flex items-center gap-1.5 text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {error}
          </p>
        ) : changed ? (
          <p className="text-[11px] text-ink-3">
            Changes {touches} of {picked.length}
            {picked.length - touches > 0
              ? ` · ${picked.length - touches} already ${show(f, x.typed)}`
              : ""}
          </p>
        ) : null}
      </div>
    );
  };

  const preview = (
    <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Preview
      </p>
      {changeCount === 0 ? (
        <p className="text-[12px] text-ink-2">
          Nothing changes yet. Fields left alone keep every original value.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-1.5">
          {info
            .filter((x) => x.changed)
            .map((x) => (
              <li
                key={x.f.id}
                className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-2"
              >
                <span className="font-medium text-foreground">{x.f.label}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3 shrink-0 text-ink-3"
                />
                <span className="font-medium text-(--mv-accent)">
                  {show(x.f, x.typed)}
                </span>
                <span>
                  · changes {x.touches}
                  {picked.length - x.touches > 0
                    ? `, ${picked.length - x.touches} already`
                    : ""}
                </span>
              </li>
            ))}
        </ul>
      )}
      {run?.state === "done" ? (
        <div
          className={cn(
            "flex flex-col gap-1.5 border-t border-hairline pt-2 text-[12px]",
            failures.length > 0 ? "text-danger" : "text-success",
          )}
        >
          <p className="flex items-center gap-1.5 font-medium">
            {failures.length > 0 ? (
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <Check aria-hidden className="size-3.5 shrink-0" />
            )}
            {run.ids.length - failures.length} updated
            {failures.length > 0 ? ` · ${failures.length} failed` : ""}
          </p>
          {failures.length > 0 ? (
            <ul role="list" className="flex flex-col gap-1 text-ink-2">
              {failures.map((x) => (
                <li key={x.id} className="flex min-w-0 gap-1.5">
                  <span className="truncate font-medium text-foreground">
                    {x.name}
                  </span>
                  <span className="shrink-0 text-ink-3">— {x.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const recordRow = (r: MixedValuesRecord) => {
    const on = chosenSet.has(r.id);
    const result = run?.results[r.id];
    const diffs = on
      ? info.filter(
          (x) => x.changed && norm(x.f, r.values[x.f.id] ?? "") !== x.typed,
        )
      : [];
    return (
      <li
        key={r.id}
        data-mv-touch={diffs.map((x) => x.f.id).join(" ") || undefined}
        className={cn("relative flex items-start gap-2.5 px-3", geom.row)}
      >
        <span
          aria-hidden
          data-mv-wash=""
          className="pointer-events-none absolute inset-x-1 inset-y-0.5 rounded-2 bg-(--mv-wash) opacity-0"
        />
        <input
          type="checkbox"
          id={`${uid}-rec-${r.id}`}
          checked={on}
          disabled={locked}
          onChange={() => toggleRecord(r.id)}
          className={cn(
            "relative mt-0.5 size-4 shrink-0 cursor-pointer rounded-1 accent-(--mv-accent) disabled:cursor-not-allowed",
            FOCUS_RING,
          )}
        />
        <label
          htmlFor={`${uid}-rec-${r.id}`}
          className={cn(
            "relative flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5",
            !on && "opacity-55",
          )}
        >
          <span
            className={cn("truncate font-medium text-foreground", geom.text)}
            title={r.name}
          >
            {r.name}
          </span>
          {diffs.length > 0 ? (
            diffs.map((x) => (
              <span
                key={x.f.id}
                data-mv-diff={x.f.id}
                className="flex min-w-0 items-center gap-1 text-[11px] text-ink-3"
              >
                <span className="shrink-0">{x.f.label}</span>
                <span className="truncate line-through decoration-ink-3/60">
                  {show(x.f, r.values[x.f.id] ?? "")}
                </span>
                <ArrowRight aria-hidden className="size-3 shrink-0" />
                <span className="truncate font-medium text-(--mv-accent)">
                  {show(x.f, x.typed)}
                </span>
              </span>
            ))
          ) : (
            <span className="truncate text-[11px] text-ink-3">
              {fields
                .slice(0, 3)
                .map((f) => show(f, r.values[f.id] ?? ""))
                .join(" · ")}
            </span>
          )}
        </label>
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
          <AnimatePresence initial={false}>
            {result ? (
              <motion.span
                key={result.ok ? "ok" : "no"}
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded-full",
                  result.ok
                    ? "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success"
                    : "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
                )}
                initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                {result.ok ? (
                  <Check aria-hidden className="size-3" />
                ) : (
                  <X aria-hidden className="size-3" />
                )}
                <span className="sr-only">
                  {result.ok ? "updated" : `failed: ${result.reason ?? ""}`}
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </li>
    );
  };

  const listPanel = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-3 py-2">
        <input
          type="checkbox"
          id={`${uid}-all`}
          checked={allPicked}
          ref={(node) => {
            if (node) node.indeterminate = somePicked && !allPicked;
          }}
          disabled={locked}
          onChange={toggleAll}
          className={cn(
            "size-4 shrink-0 cursor-pointer rounded-1 accent-(--mv-accent)",
            FOCUS_RING,
          )}
        />
        <label
          htmlFor={`${uid}-all`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-[12px] text-ink-2"
        >
          <span className="font-mono font-medium text-foreground">
            <Rolling value={picked.length} motionSafe={motionSafe} />
          </span>
          <span aria-hidden>of {data.length} selected</span>
          <span className="sr-only">
            {picked.length} of {data.length} selected. Select all.
          </span>
        </label>
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="list"
        aria-label={`${itemLabel.other} in this edit`}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain py-1"
      >
        {data.map(recordRow)}
      </ul>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      aria-busy={status === "loading" || running || undefined}
      className={cn(
        "@container/mixed-values relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--mv-accent" as string]: accent,
        ["--mv-wash" as string]: `color-mix(in oklab, ${accent} 16%, transparent)`,
        ["--mv-line" as string]: `color-mix(in oklab, ${accent} 60%, transparent)`,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <h2 id={headingId} className="truncate text-sm font-semibold">
            {heading}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {ready
              ? `${plural(picked.length, itemLabel)} · ${changeCount === 0 ? "no changes yet" : `${changeCount} ${changeCount === 1 ? "change" : "changes"}`}`
              : status === "loading"
                ? `Loading ${itemLabel.other}`
                : " "}
          </p>
        </div>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The {itemLabel.other} didn&apos;t load.
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
        <form
          noValidate
          aria-labelledby={headingId}
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="relative flex flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain @min-[40rem]/mixed-values:grid @min-[40rem]/mixed-values:grid-cols-[minmax(0,1fr)_16.5rem] @min-[40rem]/mixed-values:overflow-hidden"
        >
          <div className="@min-[40rem]/mixed-values:h-full @min-[40rem]/mixed-values:[scrollbar-width:thin] @min-[40rem]/mixed-values:overflow-y-auto @min-[40rem]/mixed-values:overscroll-contain">
            <div className={cn("flex flex-col px-4 py-4", geom.gap)}>
              {status === "loading"
                ? [0, 1, 2, 3].map((i) => (
                    <div key={i} aria-hidden className="flex flex-col gap-2">
                      <span className="h-2.5 w-20 rounded-full bg-surface-2" />
                      <span className="h-9 w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                    </div>
                  ))
                : info.map(fieldRow)}
              {ready ? preview : null}
            </div>
          </div>
          {ready ? (
            <aside
              aria-label={`${itemLabel.other} in this edit`}
              className="mx-4 mb-4 flex shrink-0 flex-col overflow-hidden rounded-3 border border-hairline @min-[40rem]/mixed-values:m-0 @min-[40rem]/mixed-values:h-full @min-[40rem]/mixed-values:rounded-none @min-[40rem]/mixed-values:border-0 @min-[40rem]/mixed-values:border-l @min-[40rem]/mixed-values:bg-surface-1/50"
            >
              <button
                type="button"
                aria-expanded={listOpen}
                aria-controls={`${uid}-fold`}
                onClick={() => setListOpen((o) => !o)}
                className={cn(
                  "flex h-10 shrink-0 items-center justify-between gap-2 px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 @min-[40rem]/mixed-values:hidden",
                  FOCUS_RING,
                )}
              >
                <span>
                  {plural(picked.length, itemLabel)} ·{" "}
                  {listOpen ? "Hide" : "Show"} list
                </span>
                <motion.span
                  aria-hidden
                  className="inline-flex"
                  initial={false}
                  animate={{ rotate: listOpen ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <ChevronDown className="size-4" />
                </motion.span>
              </button>
              <motion.div
                id={`${uid}-fold`}
                className="overflow-hidden @min-[40rem]/mixed-values:h-full!"
                initial={false}
                animate={{ height: listOpen ? 300 : 0 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                inert={narrow && !listOpen}
              >
                <div className="h-[300px] border-t border-hairline @min-[40rem]/mixed-values:h-full @min-[40rem]/mixed-values:border-t-0">
                  {listPanel}
                </div>
              </motion.div>
            </aside>
          ) : null}
        </form>
      )}

      {status !== "error" ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button
            type="button"
            onClick={cancel}
            aria-disabled={locked || undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-2 border border-hairline px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            data-mv-apply=""
            onClick={apply}
            aria-disabled={
              locked ||
              changeCount === 0 ||
              touchedIds.length === 0 ||
              undefined
            }
            aria-busy={running || undefined}
            className={cn(
              "relative inline-flex h-9 flex-1 items-center justify-center overflow-hidden rounded-2 px-4 text-[13px] font-medium whitespace-nowrap text-white transition-opacity aria-disabled:opacity-60 @min-[30rem]/mixed-values:min-w-[10.5rem] @min-[30rem]/mixed-values:flex-none",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "oklch(from var(--mv-accent) 0.52 c h)" }}
          >
            {running ? (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-white/20"
                style={{ width: progressWidth }}
              />
            ) : null}
            <span className="relative tabular-nums">
              {running
                ? `Applying ${doneCount} of ${run?.ids.length ?? 0}`
                : failures.length > 0 && changeCount > 0
                  ? `Retry ${failures.length} failed`
                  : changeCount === 0
                    ? "Apply"
                    : `Apply ${changeCount} ${changeCount === 1 ? "change" : "changes"} to ${touchedIds.length}`}
            </span>
          </button>
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
