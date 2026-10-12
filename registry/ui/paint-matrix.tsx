"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Eraser, Inbox, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/** One heading on either facet: a site down the side or a status across the top. */
export type PaintMatrixAxis = {
  id: string;
  label: string;
  /** A short form for narrow containers, e.g. "BLK". @default the label */
  short?: string;
};

export type PaintMatrixJob = {
  id: string;
  /** Job reference, e.g. "FL-2041". */
  ref: string;
  title: string;
  /** The row (site) it belongs to. */
  rowId: string;
  /** The column (status) it belongs to. */
  columnId: string;
  crew: string;
  /** When it is due, in ms since the epoch. */
  due: number;
};

export type PaintMatrixPair = { rowId: string; columnId: string };
export type PaintMatrixShape = "tile" | "dot" | "bar";
export type PaintMatrixAccent = "cobalt" | "signal" | "amber" | "graphite";
export type PaintMatrixStatus = "ready" | "loading" | "error";

export type PaintMatrixProps = {
  /** How a cell draws its count: a tinted tile, a disc sized by the count, or a bar along its foot. @default "tile" */
  cellShape?: PaintMatrixShape;
  /** How strongly counts tint their cells, 0–1: 0 is flat, 1 a full heat ramp. @default 0.6 */
  heatScale?: number;
  /** The paint and heat colour: a named token, or any CSS colour. @default "cobalt" */
  accent?: PaintMatrixAccent | (string & {});
  /** Sites, down the side. @default defaultPaintMatrixRows */
  rows?: PaintMatrixAxis[];
  /** Statuses, across the top. @default defaultPaintMatrixColumns */
  columns?: PaintMatrixAxis[];
  /** Jobs per pair, rows × columns. @default counted from `jobs` */
  counts?: number[][];
  /** The jobs the list shows. @default defaultPaintMatrixJobs */
  jobs?: PaintMatrixJob[];
  /** Controlled painted pairs. */
  selection?: PaintMatrixPair[];
  /** Initial painted pairs when uncontrolled. @default defaultPaintMatrixSelection */
  defaultSelection?: PaintMatrixPair[];
  /** Fires once per stroke, key or heading press, from the gesture that made the change. */
  onSelectionChange?: (pairs: PaintMatrixPair[]) => void;
  /** A job row was opened. */
  onOpenJob?: (job: PaintMatrixJob) => void;
  /** Today, for due labels (Date or ms). @default defaultPaintMatrixNow */
  now?: number | Date;
  /** Most rows the list shows before "and N more". @default 30 */
  listLimit?: number;
  /** Whether the counts have arrived. @default "ready" */
  status?: PaintMatrixStatus;
  /** "Try again" was pressed after the counts failed to load. */
  onRetry?: () => void;
  /** The surface's heading. @default "Jobs by site" */
  title?: string;
  /** The grid's accessible name. @default the title */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Today on the Fieldline board: 14 October 2026. */
export const defaultPaintMatrixNow = Date.UTC(2026, 9, 14);

export const defaultPaintMatrixRows: PaintMatrixAxis[] = [
  { id: "coldbrook", label: "Coldbrook Yard", short: "Coldbrook" },
  { id: "basin-north", label: "Basin North", short: "Basin N." },
  { id: "fernmoor", label: "Fernmoor Depot", short: "Fernmoor" },
  { id: "gauge-point", label: "Gauge Point", short: "Gauge Pt" },
  { id: "larkspire", label: "Larkspire" },
  { id: "saltreach", label: "Saltreach Quay", short: "Saltreach" },
];

export const defaultPaintMatrixColumns: PaintMatrixAxis[] = [
  { id: "queued", label: "Queued", short: "QUE" },
  { id: "en-route", label: "En route", short: "RTE" },
  { id: "on-site", label: "On site", short: "SITE" },
  { id: "blocked", label: "Blocked", short: "BLK" },
  { id: "done", label: "Done", short: "DONE" },
];

const SEED_COUNTS = [
  [4, 2, 5, 1, 7],
  [2, 0, 3, 3, 4],
  [6, 3, 1, 0, 5],
  [1, 1, 0, 2, 3],
  [3, 0, 2, 0, 6],
  [0, 2, 4, 1, 2],
];

const TITLES = [
  "Pump swap",
  "Valve survey",
  "Meter read",
  "Trench reinstatement",
  "Hydrant flush",
  "Cable pull",
  "Leak trace",
  "Main tie-in",
  "Pressure test",
  "Chamber clean",
  "Fence repair",
  "Signage install",
];
const CREWS = [
  "Coldbrook crew",
  "Basinworks crew",
  "Night shift",
  "Fernmoor crew",
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

/** 73 seeded jobs whose pairs give the board its counts. */
export const defaultPaintMatrixJobs: PaintMatrixJob[] = (() => {
  const rand = mulberry32(1639);
  const out: PaintMatrixJob[] = [];
  let n = 2017;
  SEED_COUNTS.forEach((row, r) => {
    row.forEach((count, c) => {
      for (let i = 0; i < count; i += 1) {
        const site = defaultPaintMatrixRows[r];
        const status = defaultPaintMatrixColumns[c];
        if (!site || !status) continue;
        out.push({
          id: `job-${n}`,
          ref: `FL-${n}`,
          title: TITLES[Math.floor(rand() * TITLES.length)] ?? "Site visit",
          rowId: site.id,
          columnId: status.id,
          crew: CREWS[Math.floor(rand() * CREWS.length)] ?? "Coldbrook crew",
          due: defaultPaintMatrixNow + (Math.floor(rand() * 14) - 3) * DAY,
        });
        n += 7;
      }
    });
  });
  return out;
})();

export const defaultPaintMatrixSelection: PaintMatrixPair[] = [
  { rowId: "coldbrook", columnId: "blocked" },
  { rowId: "basin-north", columnId: "blocked" },
  { rowId: "basin-north", columnId: "on-site" },
  { rowId: "gauge-point", columnId: "blocked" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<PaintMatrixAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const CELL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const keyOf = (rowId: string, columnId: string) => `${rowId}::${columnId}`;

type Origin = { x: number; y: number; delay: number };
type Cursor = { r: number; c: number };

const CENTRE: Origin = { x: 50, y: 50, delay: 0 };
const circle = (radius: number, o: Origin) =>
  `circle(${radius}% at ${o.x}% ${o.y}%)`;

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** "Due in 3d", "Due today", "2d overdue" — from the `now` prop, never the clock. */
const dueText = (due: number, now: number) => {
  const days = Math.round((due - now) / DAY);
  if (days < 0) return { text: `${-days}d overdue`, tone: "text-danger" };
  if (days === 0) return { text: "Due today", tone: "text-warn" };
  return { text: `Due in ${days}d`, tone: "text-ink-3" };
};

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
      {/* Gives the row a text baseline, so a noun beside it lines up. */}
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
/*                                   Cell                                   */
/* ----------------------------------------------------------------------- */

type CellProps = {
  name: string;
  count: number;
  max: number;
  shape: PaintMatrixShape;
  heat: number;
  selected: boolean;
  origin: Origin;
  r: number;
  c: number;
  isCursor: boolean;
  crossed: boolean;
  loading: boolean;
  motionSafe: boolean;
  onFocus: () => void;
};

function MatrixCell({
  name,
  count,
  max,
  shape,
  heat,
  selected,
  origin,
  r,
  c,
  isCursor,
  crossed,
  loading,
  motionSafe,
  onFocus,
}: CellProps) {
  const t = max > 0 ? count / max : 0;
  const empty = count === 0 && !loading;
  const radius = shape === "dot" ? "rounded-full" : "rounded-2";
  const tint = Math.round(t * heat * 52);
  const surface = loading
    ? "var(--bg-2)"
    : shape === "tile"
      ? `color-mix(in oklab, var(--pm-pigment) ${tint}%, var(--bg-2))`
      : "var(--bg-2)";

  return (
    <div
      role="gridcell"
      tabIndex={isCursor ? 0 : -1}
      aria-label={
        loading
          ? `${name}, loading`
          : `${name}, ${plural(count, "job", "jobs")}${selected ? ", painted" : ""}`
      }
      aria-selected={empty || loading ? undefined : selected}
      aria-disabled={empty || loading ? true : undefined}
      data-pm-cell=""
      data-r={r}
      data-c={c}
      onFocus={onFocus}
      className={cn(
        "relative h-9 select-none @min-[22rem]:h-10",
        empty ? "cursor-not-allowed" : "cursor-crosshair",
        CELL_RING,
        "rounded-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-[2px] overflow-hidden transition-[background-color,box-shadow] duration-200",
          radius,
          loading && "motion-safe:animate-pulse",
          crossed &&
            !selected &&
            "shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
        )}
        style={{
          backgroundColor: empty ? "var(--bg-1)" : surface,
          backgroundImage: empty
            ? "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 6px)"
            : undefined,
          animationDelay: loading ? `${(r + c) * 90}ms` : undefined,
        }}
      >
        {!loading && !empty && shape === "dot" ? (
          <span
            className="absolute top-1/2 left-1/2 rounded-full transition-[width,height] duration-300"
            style={{
              width: `${r1(30 + 46 * Math.sqrt(t))}%`,
              aspectRatio: "1",
              translate: "-50% -50%",
              maxHeight: "86%",
              maxWidth: "86%",
              backgroundColor: `color-mix(in oklab, var(--pm-pigment) ${Math.round(18 + 62 * t * heat)}%, var(--bg-2))`,
            }}
          />
        ) : null}
        {!loading && !empty && shape === "bar" ? (
          <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink-3)_18%,transparent)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${r1(t * 100)}%`,
                backgroundColor: `color-mix(in oklab, var(--pm-pigment) ${Math.round(45 + 55 * heat)}%, var(--ink-3))`,
              }}
            />
          </span>
        ) : null}
      </span>

      <AnimatePresence initial={false} custom={origin}>
        {selected && !loading ? (
          <motion.span
            key="wash"
            aria-hidden
            custom={origin}
            className={cn("pointer-events-none absolute inset-[2px]", radius)}
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--pm-accent) 20%, transparent)",
              backgroundImage: `radial-gradient(circle at ${origin.x}% ${origin.y}%, color-mix(in oklab, var(--pm-accent) 34%, transparent), transparent 75%)`,
              boxShadow:
                "inset 0 0 0 1.5px color-mix(in oklab, var(--pm-accent) 70%, transparent)",
            }}
            variants={{
              out: (o: Origin) =>
                motionSafe
                  ? { clipPath: circle(0, o), opacity: 1 }
                  : { clipPath: circle(150, o), opacity: 0 },
              in: (o: Origin) => ({ clipPath: circle(150, o), opacity: 1 }),
            }}
            initial="out"
            animate="in"
            exit="out"
            transition={{
              duration: motionSafe ? durations.slow : durations.fast,
              ease: easings.enter,
              delay: motionSafe ? origin.delay : 0,
            }}
          />
        ) : null}
      </AnimatePresence>

      {loading ? null : (
        <motion.span
          key={selected ? "on" : "off"}
          aria-hidden
          initial={motionSafe && selected ? { scale: 0.82 } : false}
          animate={{ scale: 1 }}
          transition={
            motionSafe
              ? { ...springs.snap, delay: origin.delay + 0.06 }
              : { duration: 0 }
          }
          className={cn(
            "pointer-events-none absolute flex font-mono tabular-nums",
            shape === "bar"
              ? "top-1.5 left-2 text-[11px] leading-none"
              : "inset-0 items-center justify-center text-[12px]",
            empty
              ? "text-ink-3/60"
              : selected
                ? "font-medium text-foreground"
                : shape === "tile" && t * heat > 0.55
                  ? "text-foreground"
                  : "text-ink-2",
          )}
        >
          {empty ? "–" : count}
        </motion.span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A two-facet filter you paint. Sites run down the side, statuses across the
 * top, and each cell holds the number of jobs that share its pair. Press a
 * cell and drag: the first cell decides whether the stroke paints in or out,
 * and every cell the stroke enters blooms with a soft wash out of the exact
 * point the pointer came in by — a circular clip on a slow enter tween — while
 * its count pops on `springs.snap`, so colour spreads cell by cell under the
 * finger. Fast strokes are sampled along their path so nothing between two
 * pointer events is skipped. Painting out folds the wash back into the point
 * it was touched.
 *
 * The jobs list beside the matrix (beneath it in narrow containers) changes
 * once, when the stroke ends: rows rise into place a cascade apart on
 * `springs.glide` and the count rolls. A heading press paints its whole line,
 * the bloom running away from the heading.
 *
 * It is a real `role="grid"` with one roving cursor that also covers the
 * headings: arrows move, Space or Enter paints or clears, Shift+Arrow paints
 * as it moves, Home/End and Ctrl+Home/End jump. Empty pairs are hatched and
 * cannot be painted. Under reduced motion washes cross-fade without blooming
 * and nothing rises — the paint, the counts and the list still change.
 */
export function PaintMatrix({
  cellShape = "tile",
  heatScale = 0.6,
  accent = "cobalt",
  rows = defaultPaintMatrixRows,
  columns = defaultPaintMatrixColumns,
  counts,
  jobs = defaultPaintMatrixJobs,
  selection,
  defaultSelection = defaultPaintMatrixSelection,
  onSelectionChange,
  onOpenJob,
  now = defaultPaintMatrixNow,
  listLimit = 30,
  status = "ready",
  onRetry,
  title = "Jobs by site",
  label,
  disabled = false,
  className,
}: PaintMatrixProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listLabelId = `${uid}-list`;

  const ready = status === "ready";
  const loading = status === "loading";
  const canPaint = ready && !disabled;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const heat = clamp(heatScale, 0, 1);
  const color =
    accent in ACCENTS ? ACCENTS[accent as PaintMatrixAccent] : accent;

  /* -------------------------------- data ------------------------------- */

  const grid = React.useMemo(() => {
    if (counts) {
      return rows.map((_, r) =>
        columns.map((__, c) => Math.max(0, counts[r]?.[c] ?? 0)),
      );
    }
    const tally = new Map<string, number>();
    for (const job of jobs) {
      const key = keyOf(job.rowId, job.columnId);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return rows.map((row) =>
      columns.map((col) => tally.get(keyOf(row.id, col.id)) ?? 0),
    );
  }, [counts, rows, columns, jobs]);
  const max = Math.max(1, ...grid.flat());
  const countAt = (r: number, c: number) => grid[r]?.[c] ?? 0;

  const [own, setOwn] = React.useState<PaintMatrixPair[]>(defaultSelection);
  const committedPairs = selection ?? own;
  const committed = new Set(
    committedPairs.map((p) => keyOf(p.rowId, p.columnId)),
  );

  /** The selection while a stroke is under way; null between strokes. */
  const [stroke, setStroke] = React.useState<Set<string> | null>(null);
  const [origins, setOrigins] = React.useState<Record<string, Origin>>({});
  const [cursor, setCursor] = React.useState<Cursor>({ r: 0, c: 0 });
  const [crossHover, setCrossHover] = React.useState<Cursor | null>(null);
  const [gridFocused, setGridFocused] = React.useState(false);
  const [activeJob, setActiveJob] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const shownKeys = stroke ?? committed;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const jobRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const clearRef = React.useRef<HTMLButtonElement | null>(null);
  const painting = React.useRef<{
    mode: "paint" | "erase";
    keys: Set<string>;
    origins: Record<string, Origin>;
    last: { x: number; y: number };
    touched: number;
  } | null>(null);

  const pairsOf = (keys: Set<string>): PaintMatrixPair[] => {
    const out: PaintMatrixPair[] = [];
    for (const row of rows) {
      for (const col of columns) {
        if (keys.has(keyOf(row.id, col.id))) {
          out.push({ rowId: row.id, columnId: col.id });
        }
      }
    }
    return out;
  };

  const jobsFor = (keys: Set<string>) =>
    keys.size === 0
      ? jobs
      : jobs.filter((j) => keys.has(keyOf(j.rowId, j.columnId)));

  const commit = (next: Set<string>, said: string) => {
    const pairs = pairsOf(next);
    if (selection === undefined) setOwn(pairs);
    onSelectionChange?.(pairs);
    const n = jobsFor(next).length;
    setAnnouncement(
      `${said} ${pairs.length === 0 ? `Nothing painted, all ${plural(n, "job", "jobs")}` : `${plural(pairs.length, "pair", "pairs")}, ${plural(n, "job", "jobs")}`}.`,
    );
  };

  /* ------------------------------- strokes ----------------------------- */

  const hit = (x: number, y: number) => {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest<HTMLElement>("[data-pm-cell]");
    if (!cell || !gridRef.current?.contains(cell)) return null;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const rect = cell.getBoundingClientRect();
    return {
      r,
      c,
      x: r1(clamp(((x - rect.left) / Math.max(1, rect.width)) * 100, 0, 100)),
      y: r1(clamp(((y - rect.top) / Math.max(1, rect.height)) * 100, 0, 100)),
    };
  };

  const touch = (x: number, y: number) => {
    const s = painting.current;
    if (!s) return;
    const dx = x - s.last.x;
    const dy = y - s.last.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    let changed = false;
    for (let i = 1; i <= steps; i += 1) {
      const p = hit(s.last.x + (dx * i) / steps, s.last.y + (dy * i) / steps);
      if (!p || p.r < 0 || p.c < 0) continue;
      const row = rows[p.r];
      const col = columns[p.c];
      if (!row || !col || countAt(p.r, p.c) === 0) continue;
      const key = keyOf(row.id, col.id);
      const has = s.keys.has(key);
      if (s.mode === "paint" ? has : !has) continue;
      if (s.mode === "paint") s.keys.add(key);
      else s.keys.delete(key);
      s.origins[key] = { x: p.x, y: p.y, delay: 0 };
      s.touched += 1;
      changed = true;
    }
    s.last = { x, y };
    if (changed) {
      setStroke(new Set(s.keys));
      setOrigins({ ...s.origins });
    }
  };

  const toggleKeys = (
    targets: { r: number; c: number }[],
    from: "centre" | "left" | "top" | "corner",
    point?: { x: number; y: number },
  ) => {
    const live = targets.filter(
      ({ r, c }) => rows[r] && columns[c] && countAt(r, c) > 0,
    );
    if (live.length === 0) return;
    const keys = live.map(({ r, c }) =>
      keyOf(rows[r]?.id ?? "", columns[c]?.id ?? ""),
    );
    const allOn = keys.every((k) => committed.has(k));
    const next = new Set(committed);
    const step = cascade(live.length);
    const nextOrigins = { ...origins };
    live.forEach((cell, i) => {
      const k = keys[i] ?? "";
      if (allOn) next.delete(k);
      else next.add(k);
      nextOrigins[k] =
        from === "left"
          ? { x: 0, y: 50, delay: r3(i * step) }
          : from === "top"
            ? { x: 50, y: 0, delay: r3(i * step) }
            : from === "corner"
              ? { x: 0, y: 0, delay: r3((cell.r + cell.c) * 0.03) }
              : point
                ? { x: point.x, y: point.y, delay: 0 }
                : CENTRE;
    });
    setOrigins(nextOrigins);
    const first = live[0];
    const name =
      live.length === 1 && first
        ? `${rows[first.r]?.label}, ${columns[first.c]?.label}`
        : plural(live.length, "cell", "cells");
    commit(next, `${name} ${allOn ? "cleared" : "painted"}.`);
  };

  const lineTargets = (r: number, c: number) => {
    if (r < 0 && c < 0) {
      return rows.flatMap((_, rr) =>
        columns.map((__, cc) => ({ r: rr, c: cc })),
      );
    }
    if (r < 0) return rows.map((_, rr) => ({ r: rr, c }));
    if (c < 0) return columns.map((_, cc) => ({ r, c: cc }));
    return [{ r, c }];
  };

  const activate = (r: number, c: number, point?: { x: number; y: number }) => {
    if (!canPaint) return;
    toggleKeys(
      lineTargets(r, c),
      r < 0 && c < 0 ? "corner" : r < 0 ? "top" : c < 0 ? "left" : "centre",
      point,
    );
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !canPaint,
    onStart: ({ point, offset }) => {
      const start = { x: point.x - offset.x, y: point.y - offset.y };
      const p = hit(start.x, start.y);
      const row = p ? rows[p.r] : undefined;
      const col = p ? columns[p.c] : undefined;
      if (!p || !row || !col || countAt(p.r, p.c) === 0) {
        painting.current = null;
        return;
      }
      const key = keyOf(row.id, col.id);
      const mode = committed.has(key) ? "erase" : "paint";
      const keys = new Set(committed);
      if (mode === "paint") keys.add(key);
      else keys.delete(key);
      const nextOrigins = { ...origins, [key]: { x: p.x, y: p.y, delay: 0 } };
      painting.current = {
        mode,
        keys,
        origins: nextOrigins,
        last: start,
        touched: 1,
      };
      setStroke(new Set(keys));
      setOrigins(nextOrigins);
    },
    onMove: ({ point }) => touch(point.x, point.y),
    onEnd: () => {
      const s = painting.current;
      painting.current = null;
      if (!s) return;
      setStroke(null);
      commit(
        s.keys,
        `${plural(s.touched, "cell", "cells")} ${s.mode === "paint" ? "painted" : "cleared"}.`,
      );
    },
    onCancel: () => {
      painting.current = null;
      setStroke(null);
    },
    onTap: (event) => {
      const p = hit(event.clientX, event.clientY);
      if (p) {
        activate(p.r, p.c, { x: p.x, y: p.y });
        return;
      }
      const head = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-pm-head]",
      );
      if (head && gridRef.current?.contains(head)) {
        activate(Number(head.dataset.r), Number(head.dataset.c));
      }
    },
  });

  /* ------------------------------ keyboard ----------------------------- */

  const focusAt = (r: number, c: number) => {
    const next = {
      r: clamp(r, -1, rows.length - 1),
      c: clamp(c, -1, columns.length - 1),
    };
    setCursor(next);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-r="${next.r}"][data-c="${next.c}"]`)
      ?.focus();
    return next;
  };

  const onGridKey = (event: React.KeyboardEvent) => {
    const { r, c } = cursor;
    const ctrl = event.ctrlKey || event.metaKey;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (event.shiftKey && canPaint && r >= 0 && c >= 0) {
        // Shift+Arrow is the keyboard's stroke: it paints as it travels.
        const to = focusAt(r + move[0], c + move[1]);
        const path = [
          { r, c },
          { r: to.r, c: to.c },
        ].filter(
          (p) =>
            p.r >= 0 &&
            p.c >= 0 &&
            countAt(p.r, p.c) > 0 &&
            !committed.has(keyOf(rows[p.r]?.id ?? "", columns[p.c]?.id ?? "")),
        );
        if (path.length) {
          const next = new Set(committed);
          const nextOrigins = { ...origins };
          for (const p of path) {
            const k = keyOf(rows[p.r]?.id ?? "", columns[p.c]?.id ?? "");
            next.add(k);
            nextOrigins[k] = {
              x: move[1] > 0 ? 0 : move[1] < 0 ? 100 : 50,
              y: move[0] > 0 ? 0 : move[0] < 0 ? 100 : 50,
              delay: 0,
            };
          }
          setOrigins(nextOrigins);
          commit(next, `${plural(path.length, "cell", "cells")} painted.`);
        }
        return;
      }
      focusAt(r + move[0], c + move[1]);
      return;
    }
    switch (event.key) {
      case "Home":
        event.preventDefault();
        if (ctrl) focusAt(0, 0);
        else focusAt(r, 0);
        break;
      case "End":
        event.preventDefault();
        if (ctrl) focusAt(rows.length - 1, columns.length - 1);
        else focusAt(r, columns.length - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        activate(r, c);
        break;
      default:
        break;
    }
  };

  /* -------------------------------- list ------------------------------- */

  const listed = jobsFor(committed);
  const order = new Map(columns.map((col, i) => [col.id, i]));
  const sorted = [...listed].sort(
    (a, b) =>
      (order.get(a.columnId) ?? 0) - (order.get(b.columnId) ?? 0) ||
      a.due - b.due,
  );
  const visibleJobs = sorted.slice(0, Math.max(1, listLimit));
  const more = sorted.length - visibleJobs.length;
  const jobStep = cascade(Math.min(visibleJobs.length, 10));
  const activeJobId =
    activeJob && visibleJobs.some((j) => j.id === activeJob)
      ? activeJob
      : (visibleJobs[0]?.id ?? null);
  const rowLabel = new Map(rows.map((row) => [row.id, row]));
  const colLabel = new Map(columns.map((col) => [col.id, col]));
  const pairsCount = committed.size;

  const onJobKey = (event: React.KeyboardEvent, index: number) => {
    const to =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? visibleJobs.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    const job = visibleJobs[clamp(to, 0, visibleJobs.length - 1)];
    if (job) jobRefs.current.get(job.id)?.focus();
  };

  const clear = () => {
    if (!canPaint || committed.size === 0) return;
    const nextOrigins = { ...origins };
    for (const key of committed) nextOrigins[key] = CENTRE;
    setOrigins(nextOrigins);
    commit(new Set(), "Cleared.");
  };

  /* ------------------------------- render ------------------------------ */

  const crossR = crossHover?.r ?? null;
  const crossC = crossHover?.c ?? null;
  const headTone = (on: boolean) =>
    on ? "bg-surface-2 text-foreground" : "text-ink-2";
  const cursorKey = `${cursor.r}:${cursor.c}`;

  const matrix = (
    <div
      ref={gridRef}
      role="grid"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-describedby={hintId}
      aria-multiselectable
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={onGridKey}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        const el = (event.target as Element | null)?.closest<HTMLElement>(
          "[data-pm-cell]",
        );
        const next = el
          ? { r: Number(el.dataset.r), c: Number(el.dataset.c) }
          : null;
        if (next?.r !== crossR || next?.c !== crossC) setCrossHover(next);
      }}
      onPointerLeave={() => setCrossHover(null)}
      onFocus={() => setGridFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setGridFocused(false);
        }
      }}
      className="grid touch-none grid-cols-[4.75rem_repeat(var(--pm-cols),minmax(0,1fr))] @min-[22rem]:grid-cols-[7rem_repeat(var(--pm-cols),minmax(0,1fr))]"
      style={{ ["--pm-cols" as string]: columns.length }}
    >
      <div role="row" className="contents">
        <div
          role="columnheader"
          tabIndex={cursorKey === "-1:-1" ? 0 : -1}
          aria-label="All pairs"
          data-pm-head=""
          data-r={-1}
          data-c={-1}
          onFocus={() => setCursor({ r: -1, c: -1 })}
          className={cn(
            "sticky top-0 z-10 flex h-8 items-end bg-card pb-1.5 pl-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            canPaint && "cursor-pointer hover:text-foreground",
            CELL_RING,
            "rounded-2",
          )}
        >
          Site
        </div>
        {columns.map((col, c) => (
          <div
            key={col.id}
            role="columnheader"
            tabIndex={cursorKey === `-1:${c}` ? 0 : -1}
            aria-label={col.label}
            title={col.label}
            data-pm-head=""
            data-r={-1}
            data-c={c}
            onFocus={() => setCursor({ r: -1, c })}
            className={cn(
              "sticky top-0 z-10 flex h-8 items-end justify-center bg-card pb-1.5 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
              headTone(
                crossC === c ||
                  (gridFocused && cursor.r >= 0 && cursor.c === c),
              ),
              canPaint && "cursor-pointer hover:text-foreground",
              CELL_RING,
              "rounded-2",
            )}
          >
            <span className="truncate @min-[34rem]:hidden">
              {col.short ?? col.label}
            </span>
            <span className="hidden truncate tracking-normal normal-case @min-[34rem]:inline">
              {col.label}
            </span>
          </div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={row.id} role="row" className="contents">
          <div
            role="rowheader"
            tabIndex={cursorKey === `${r}:-1` ? 0 : -1}
            aria-label={row.label}
            title={row.label}
            data-pm-head=""
            data-r={r}
            data-c={-1}
            onFocus={() => setCursor({ r, c: -1 })}
            className={cn(
              "flex h-9 items-center rounded-2 pr-2 pl-1 text-[12px] transition-colors @min-[22rem]:h-10 @min-[22rem]:text-[13px]",
              headTone(
                crossR === r ||
                  (gridFocused && cursor.c >= 0 && cursor.r === r),
              ),
              canPaint && "cursor-pointer hover:text-foreground",
              CELL_RING,
            )}
          >
            <span className="truncate @min-[22rem]:hidden">
              {row.short ?? row.label}
            </span>
            <span className="hidden truncate @min-[22rem]:inline">
              {row.label}
            </span>
          </div>
          {columns.map((col, c) => {
            const key = keyOf(row.id, col.id);
            return (
              <MatrixCell
                key={col.id}
                name={`${row.label}, ${col.label}`}
                count={countAt(r, c)}
                max={max}
                shape={cellShape}
                heat={heat}
                selected={shownKeys.has(key)}
                origin={origins[key] ?? CENTRE}
                r={r}
                c={c}
                isCursor={cursorKey === `${r}:${c}`}
                crossed={crossR === r || crossC === c}
                loading={loading}
                motionSafe={motionSafe}
                onFocus={() => setCursor({ r, c })}
              />
            );
          })}
        </div>
      ))}
    </div>
  );

  const list = (
    <section aria-labelledby={listLabelId} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p
          id={listLabelId}
          className="flex items-baseline gap-1.5 text-[13px] font-medium"
        >
          <span className="sr-only">
            {plural(listed.length, "job", "jobs")}
          </span>
          <Roll
            value={listed.length}
            motionSafe={motionSafe}
            className="font-mono"
          />
          <span aria-hidden>{listed.length === 1 ? "job" : "jobs"}</span>
        </p>
        <p className="truncate text-[11px] text-ink-3">
          {pairsCount === 0
            ? "All pairs"
            : `in ${plural(pairsCount, "pair", "pairs")}`}
        </p>
      </div>
      {loading ? (
        <div aria-hidden className="flex flex-col gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 110}ms` }}
            />
          ))}
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No jobs in these pairs.</p>
        </div>
      ) : (
        <ul role="list" className="relative flex flex-col gap-1">
          <AnimatePresence initial={false} mode="popLayout">
            {visibleJobs.map((job, i) => {
              const due = dueText(job.due, nowMs);
              const site = rowLabel.get(job.rowId);
              const state = colLabel.get(job.columnId);
              const done = job.columnId === "done";
              return (
                <motion.li
                  key={job.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    layout: springs.glide,
                    y: motionSafe
                      ? {
                          ...springs.glide,
                          delay: r3(Math.min(i, 10) * jobStep),
                        }
                      : { duration: 0 },
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? r3(Math.min(i, 10) * jobStep) : 0,
                    },
                  }}
                >
                  <button
                    ref={(node) => {
                      if (node) jobRefs.current.set(job.id, node);
                      else jobRefs.current.delete(job.id);
                    }}
                    type="button"
                    tabIndex={job.id === activeJobId ? 0 : -1}
                    onFocus={() => setActiveJob(job.id)}
                    onKeyDown={(event) => onJobKey(event, i)}
                    onClick={() => {
                      if (!disabled) onOpenJob?.(job);
                    }}
                    aria-label={`${job.ref}, ${job.title}, ${site?.label ?? job.rowId}, ${state?.label ?? job.columnId}, ${done ? "closed" : due.text}`}
                    className={cn(
                      "grid w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                      {job.ref}
                    </span>
                    <span className="flex flex-col overflow-hidden">
                      <span className="truncate text-[13px] leading-snug">
                        {job.title}
                      </span>
                      <span className="truncate text-[11px] leading-snug text-ink-3">
                        {site?.short ?? site?.label} · {state?.label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-right text-[11px] whitespace-nowrap",
                        done ? "text-ink-3" : due.tone,
                      )}
                    >
                      {done ? "Closed" : due.text}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {more > 0 ? (
            <li className="px-2 pt-1 text-[11px] text-ink-3">
              and {plural(more, "more job", "more jobs")}
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        ["--pm-accent" as string]: color,
        ["--pm-pigment" as string]: `oklch(from ${color} 0.72 c h)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Arrow keys move the cursor. Space paints or clears a cell; Shift with an
        arrow paints as it moves. On a site or status heading, Space paints the
        whole line.
      </p>

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Drag across cells to paint the pairs you want listed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
            <span className="sr-only">
              {plural(pairsCount, "pair", "pairs")} painted
            </span>
            <Roll
              value={pairsCount}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden>{pairsCount === 1 ? "pair" : "pairs"}</span>
          </p>
          <button
            ref={clearRef}
            type="button"
            onClick={clear}
            aria-disabled={!canPaint || pairsCount === 0 || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs transition-colors",
              canPaint && pairsCount > 0
                ? "text-foreground hover:bg-surface-2"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <Eraser aria-hidden className="size-3.5" />
            Clear
          </button>
        </div>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The counts didn&apos;t load.
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
        <div className="flex-1 overflow-y-auto overscroll-contain @min-[44rem]:grid @min-[44rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @min-[44rem]:grid-rows-[minmax(0,1fr)] @min-[44rem]:overflow-hidden">
          <div className="@container px-3 pt-1 pb-3 @min-[44rem]:overflow-y-auto @min-[44rem]:overscroll-contain">
            {matrix}
            {loading ? null : (
              <div
                aria-hidden
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-1 text-[11px] text-ink-3"
              >
                <span className="inline-flex items-center gap-1.5">
                  Fewer
                  {[0.2, 0.45, 0.7, 1].map((t) => (
                    <span
                      key={t}
                      className={cn(
                        "size-3",
                        cellShape === "dot" ? "rounded-full" : "rounded-1",
                      )}
                      style={{
                        backgroundColor: `color-mix(in oklab, var(--pm-pigment) ${Math.round(cellShape === "tile" ? t * heat * 52 : 18 + 62 * t * heat)}%, var(--bg-2))`,
                      }}
                    />
                  ))}
                  More
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-1 bg-surface-1"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 4px)",
                    }}
                  />
                  No jobs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-1 bg-[color-mix(in_oklab,var(--pm-accent)_22%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--pm-accent)_70%,transparent)]" />
                  Painted
                </span>
              </div>
            )}
          </div>
          <div className="border-t border-hairline px-3 py-3 @min-[44rem]:overflow-y-auto @min-[44rem]:overscroll-contain @min-[44rem]:border-t-0 @min-[44rem]:border-l">
            {list}
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
