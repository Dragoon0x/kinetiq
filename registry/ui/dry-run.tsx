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
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  Database,
  Download,
  FileText,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type DryRunStep = "connect" | "map" | "rehearse" | "run";
export type DryRunCounterStyle = "digits" | "bars" | "waffle";
export type DryRunDensity = "compact" | "regular" | "roomy";
export type DryRunTone = "signal" | "cobalt" | "ember" | "moss";
export type DryRunStatus = "ready" | "loading" | "error";

export type DryRunSource = {
  /** What the data is, as people call it. */
  name: string;
  /** The kind of source, e.g. "CSV file". */
  kind: string;
  /** Where it lives: a path, a table, a bucket key. */
  location: string;
  /** How many rows it holds. */
  rows: number;
  /** Its columns, in order. */
  columns: string[];
  /** One row's values by column, shown as examples while mapping. */
  sample?: Record<string, string>;
  /** Where the rows are going. */
  target: string;
};

export type DryRunField = {
  id: string;
  /** The target field's name. */
  label: string;
  /** The migration cannot run while this field has no column. */
  required?: boolean;
  /** One line of guidance under the label. */
  hint?: string;
};

/** Target field id → the source column that fills it, or null to skip it. */
export type DryRunMapping = Record<string, string | null>;

export type DryRunCounts = { create: number; update: number; skip: number };

export type DryRunSkippedRow = {
  /** The row's number in the source. */
  row: number;
  /** The row's key, as the target would know it. */
  key: string;
  /** Why it was left out. */
  reason: string;
};

export type DryRunResults = {
  /** What the rehearsal says would happen. */
  rehearsal: DryRunCounts;
  /** What the real run actually did. */
  run: DryRunCounts;
  /** Rows left out, as far as the host lists them. */
  skipped: DryRunSkippedRow[];
};

export type DryRunReport = {
  source: string;
  target: string;
  mapping: DryRunMapping;
  rehearsal: DryRunCounts;
  run: DryRunCounts;
  skipped: DryRunSkippedRow[];
};

export type DryRunProps = {
  /** The data being moved and where it goes. @default defaultDryRunSource */
  source?: DryRunSource;
  /** The target's fields, in order. @default defaultDryRunFields */
  fields?: DryRunField[];
  /** Controlled mapping: target field id → source column, or null to skip. */
  mapping?: DryRunMapping;
  /** Initial mapping when uncontrolled. @default defaultDryRunMapping */
  defaultMapping?: DryRunMapping;
  /** Fires from the select that changed the mapping, with the whole mapping. */
  onMappingChange?: (mapping: DryRunMapping) => void;
  /** The rehearsal's and the run's counts, and the rows left out. @default defaultDryRunResults */
  results?: DryRunResults;
  /** Controlled step. */
  step?: DryRunStep;
  /** The step to open on when uncontrolled; later steps count the earlier ones as passed. @default "connect" */
  defaultStep?: DryRunStep;
  /** Fires from Next, Back or the stepper with the step asked for. */
  onStepChange?: (step: DryRunStep) => void;
  /** Fires when the connection is checked; return false to say the source could not be read. */
  onConnect?: () => boolean | void;
  /** Fires when the rehearsal starts, with the mapping it rehearses. */
  onDryRun?: (mapping: DryRunMapping) => void;
  /** Fires when the real run starts, with the mapping it runs. */
  onRun?: (mapping: DryRunMapping) => void;
  /** Fires when a pass has walked every row, with that pass's counts. */
  onPassEnd?: (pass: "rehearsal" | "run", counts: DryRunCounts) => void;
  /** Fires from Download report with everything the report needs. */
  onDownloadReport?: (report: DryRunReport) => void;
  /** How the three counters are drawn: tiles of figures, long bars, or one waffle of row batches. @default "digits" */
  counterStyle?: DryRunCounterStyle;
  /** Padding, type size and tile height. @default "regular" */
  density?: DryRunDensity;
  /** The real run's colours; the rehearsal is always grey. @default "signal" */
  tone?: DryRunTone;
  /** How long each pass takes to walk the rows, in ms. @default 2400 */
  passDuration?: number;
  /** Whether the source description has arrived. @default "ready" */
  status?: DryRunStatus;
  /** "Try again" was pressed after the source failed to load. */
  onRetry?: () => void;
  /** The migration's name, the surface's heading. @default "Move meter accounts" */
  title?: string;
  /** Height of the surface in px; the step body scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be checked, mapped or run. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** The October billing export from Coldbrook, bound for Gaugeworks. */
export const defaultDryRunSource: DryRunSource = {
  name: "Coldbrook billing export",
  kind: "CSV file",
  location: "exports/accounts-2026-10.csv",
  rows: 1284,
  columns: [
    "acct_no",
    "holder_name",
    "email",
    "tariff_code",
    "meter_serial",
    "opened_on",
    "notes",
  ],
  sample: {
    acct_no: "CB-100001",
    holder_name: "Ines Varga",
    email: "ines.varga@post.example",
    tariff_code: "T2",
    meter_serial: "GW-4471-0193",
    opened_on: "2019-03-14",
    notes: "Gate code at the side door",
  },
  target: "Gaugeworks · Meter accounts",
};

export const defaultDryRunFields: DryRunField[] = [
  {
    id: "account",
    label: "Account number",
    required: true,
    hint: "Rows with a known number update that account.",
  },
  { id: "holder", label: "Account holder", required: true },
  { id: "email", label: "Email", required: true },
  {
    id: "plan",
    label: "Plan",
    required: true,
    hint: "Coldbrook tariff codes become Gaugeworks plans.",
  },
  { id: "meter", label: "Meter serial", required: true },
  { id: "opened", label: "Customer since" },
  { id: "notes", label: "Site notes" },
];

export const defaultDryRunMapping: DryRunMapping = {
  account: "acct_no",
  holder: "holder_name",
  email: "email",
  plan: "tariff_code",
  meter: "meter_serial",
  opened: "opened_on",
  notes: null,
};

/** The run lands two rows differently: two accounts were opened in between. */
export const defaultDryRunResults: DryRunResults = {
  rehearsal: { create: 812, update: 391, skip: 81 },
  run: { create: 810, update: 393, skip: 81 },
  skipped: [
    { row: 37, key: "CB-100412", reason: "No meter serial" },
    { row: 214, key: "CB-100988", reason: "Email already on CB-100961" },
    { row: 377, key: "CB-101305", reason: "Tariff T9 has no plan" },
    { row: 502, key: "CB-101731", reason: "Duplicate of row 498" },
    { row: 688, key: "CB-102210", reason: "No meter serial" },
    { row: 941, key: "CB-102874", reason: "Closed before 2020" },
  ],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const STEPS: DryRunStep[] = ["connect", "map", "rehearse", "run"];
const STEP_LABEL: Record<DryRunStep, string> = {
  connect: "Connect",
  map: "Map",
  rehearse: "Rehearse",
  run: "Run",
};
const STEP_TITLE: Record<DryRunStep, string> = {
  connect: "Connect the source",
  map: "Map the fields",
  rehearse: "Rehearse the migration",
  run: "Run it for real",
};

const OUTCOMES = ["create", "update", "skip"] as const;
type Outcome = (typeof OUTCOMES)[number];
type Pass = "rehearsal" | "run";
type PassState = "idle" | "running" | "done";

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** Grouped by hand: a locale lookup during render would not survive hydration. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const total = (c: DryRunCounts) => c.create + c.update + c.skip;
const keyOf = (m: DryRunMapping) => JSON.stringify(m);

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const COPY: Record<Pass, Record<Outcome, string>> = {
  rehearsal: {
    create: "Would create",
    update: "Would update",
    skip: "Would skip",
  },
  run: { create: "Created", update: "Updated", skip: "Skipped" },
};
const NOUN: Record<Outcome, [string, string]> = {
  create: ["new account", "new accounts"],
  update: ["existing account", "existing accounts"],
  skip: ["row left out", "rows left out"],
};
const noun = (o: Outcome, n: number) => NOUN[o][n === 1 ? 0 : 1];

/** The rehearsal is grey: a share of the foreground, so it reads in both themes. */
const GREY: Record<Outcome, string> = {
  create: "color-mix(in oklab, var(--foreground) 46%, transparent)",
  update: "color-mix(in oklab, var(--foreground) 27%, transparent)",
  skip: "color-mix(in oklab, var(--foreground) 13%, transparent)",
};

/**
 * Pigments, not text colours: each holds its token's hue at a fixed
 * lightness, so a filled cell reads the same on a light card as on a dark one.
 */
const TONES: Record<DryRunTone, Record<Outcome, string>> = {
  signal: {
    create: "oklch(from var(--success) 0.72 c h)",
    update: "oklch(from var(--accent-bright) 0.64 c h)",
    skip: "oklch(from var(--warn) 0.82 c h)",
  },
  cobalt: {
    create: "oklch(from var(--accent-bright) 0.5 0.19 h)",
    update: "oklch(from var(--accent-bright) 0.68 0.13 h)",
    skip: "oklch(from var(--accent-bright) 0.86 0.06 h)",
  },
  ember: {
    create: "oklch(from var(--warn) 0.8 0.15 h)",
    update: "oklch(from var(--danger) 0.63 0.17 h)",
    skip: "oklch(from var(--warn) 0.9 0.06 h)",
  },
  moss: {
    create: "oklch(from var(--success) 0.58 0.13 h)",
    update: "oklch(from var(--success) 0.76 0.11 h)",
    skip: "oklch(from var(--success) 0.9 0.04 h)",
  },
};

/** Skipped rows are hatched as well as tinted, so colour is never the only sign. */
const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 34%, transparent) 0 1px, transparent 1px 4px)";

const DENSITY: Record<
  DryRunDensity,
  {
    px: string;
    py: string;
    gap: string;
    body: string;
    figure: number;
    tile: string;
  }
> = {
  compact: {
    px: "px-3",
    py: "py-2.5",
    gap: "gap-2.5",
    body: "text-[12px] leading-[18px]",
    figure: 22,
    tile: "p-2.5",
  },
  regular: {
    px: "px-4",
    py: "py-3",
    gap: "gap-3",
    body: "text-[13px] leading-5",
    figure: 26,
    tile: "p-3",
  },
  roomy: {
    px: "px-5",
    py: "py-4",
    gap: "gap-4",
    body: "text-sm leading-6",
    figure: 32,
    tile: "p-4",
  },
};

/** FNV-1a, unsigned: the seed for the order the rows are dealt in. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan = {
  cells: number;
  outcome: Outcome[];
  alloc: Record<Outcome, number>;
  prefix: Record<Outcome, number[]>;
  totals: DryRunCounts;
};

/** Cells per outcome by largest remainder; an outcome that happened keeps at least one. */
function allocate(
  counts: DryRunCounts,
  cells: number,
): Record<Outcome, number> {
  const sum = total(counts);
  const out: Record<Outcome, number> = { create: 0, update: 0, skip: 0 };
  if (sum <= 0) return out;
  const raw = OUTCOMES.map((o) => (counts[o] / sum) * cells);
  const base = raw.map((v) => Math.floor(v));
  let left = cells - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => [v - (base[i] ?? 0), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    left -= 1;
  }
  OUTCOMES.forEach((o, i) => (out[o] = base[i] ?? 0));
  for (const o of OUTCOMES) {
    if (counts[o] > 0 && out[o] === 0) {
      const richest = [...OUTCOMES].sort((a, b) => out[b] - out[a])[0];
      if (richest && out[richest] > 1) {
        out[richest] -= 1;
        out[o] = 1;
      }
    }
  }
  return out;
}

/**
 * Deals a pass's outcomes onto the cells. The cells are ranked once by a
 * seed, and both passes use the same ranks: the lowest take the skips, the
 * next the updates, the rest create. So the rehearsal and the run walk the
 * same path, and a cell only changes where their counts differ.
 */
function planPass(counts: DryRunCounts, ranks: number[]): Plan {
  const cells = ranks.length;
  const alloc = allocate(counts, cells);
  const order = ranks
    .map((r, i) => [r, i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const outcome: Outcome[] = Array.from(
    { length: cells },
    () => "create" as Outcome,
  );
  order.forEach(([, slot], k) => {
    outcome[slot] =
      k < alloc.skip
        ? "skip"
        : k < alloc.skip + alloc.update
          ? "update"
          : "create";
  });
  const prefix: Record<Outcome, number[]> = {
    create: [0],
    update: [0],
    skip: [0],
  };
  for (let i = 0; i < cells; i++) {
    for (const o of OUTCOMES) {
      prefix[o].push((prefix[o][i] ?? 0) + (outcome[i] === o ? 1 : 0));
    }
  }
  return { cells, outcome, alloc, prefix, totals: counts };
}

/** The count an outcome has reached when the pass is `p` of the way through. */
function countAt(plan: Plan, o: Outcome, p: number): number {
  if (p >= 1) return plan.totals[o];
  const own = plan.alloc[o];
  if (own <= 0 || p <= 0) return 0;
  const x = clamp(p, 0, 1) * plan.cells;
  const i = Math.floor(x);
  const done = (plan.prefix[o][i] ?? own) + (plan.outcome[i] === o ? x - i : 0);
  return Math.round((plan.totals[o] * done) / own);
}

function mappingProblems(
  fields: DryRunField[],
  mapping: DryRunMapping,
): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const f of fields) {
    const col = mapping[f.id] ?? null;
    if (!col) {
      if (f.required) out[f.id] = `${f.label} needs a column`;
      continue;
    }
    const first = seen.get(col);
    if (first) out[f.id] = `${col} already fills ${first}`;
    else seen.set(col, f.label);
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** Height follows the content on glide, measured, so the table never jumps the panel. */
function Measured({
  open,
  motionSafe,
  id,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      id={id}
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
      style={{ overflow: "clip" }}
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/**
 * A tick drawn on flick: the acknowledgement lands before anything else.
 * Ticks already there on the first paint are simply drawn.
 */
function Tick({
  motionSafe,
  draw,
  className,
}: {
  motionSafe: boolean;
  draw: boolean;
  className?: string;
}) {
  const [drawn] = React.useState(draw);
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("shrink-0", className)}>
      <motion.path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe && drawn ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/** One counter's figure, ticking with its pass — derived, never React state. */
function Figure({
  plan,
  outcome,
  progress,
  size,
  land,
  className,
}: {
  plan: Plan;
  outcome: Outcome;
  progress: MotionValue<number>;
  size: number;
  land: MotionValue<number>;
  className?: string;
}) {
  const text = useTransform(progress, (p) =>
    grouped(countAt(plan, outcome, p)),
  );
  return (
    <motion.span
      aria-hidden
      className={cn("block font-mono font-medium tabular-nums", className)}
      style={{ fontSize: size, lineHeight: `${size + 4}px`, y: land }}
    >
      {text}
    </motion.span>
  );
}

/** A fill whose length is the outcome's count over `of`, grown from the left. */
function Fill({
  plan,
  outcome,
  progress,
  of,
  colour,
  className,
}: {
  plan: Plan;
  outcome: Outcome;
  progress: MotionValue<number>;
  of: number;
  colour: string;
  className?: string;
}) {
  const scaleX = useTransform(progress, (p) =>
    of > 0 ? r3(clamp(countAt(plan, outcome, p) / of, 0, 1)) : 0,
  );
  return (
    <motion.span
      aria-hidden
      className={cn("absolute inset-0 rounded-[inherit]", className)}
      style={{
        scaleX,
        originX: 0,
        backgroundColor: colour,
        backgroundImage: outcome === "skip" ? HATCH : undefined,
      }}
    />
  );
}

/**
 * One batch of rows in the waffle. It takes the grey when the rehearsal's
 * head enters it and the colour when the run's does, and pops as the head
 * passes so the walk is visible even where two neighbours share a colour.
 */
function WaffleCell({
  index,
  cells,
  greyOutcome,
  runOutcome,
  greyP,
  runP,
  showRun,
  colours,
  motionSafe,
}: {
  index: number;
  cells: number;
  greyOutcome: Outcome;
  runOutcome: Outcome;
  greyP: MotionValue<number>;
  runP: MotionValue<number>;
  showRun: boolean;
  colours: Record<Outcome, string>;
  motionSafe: boolean;
}) {
  const head = showRun ? runP : greyP;
  const greyOn = useTransform(greyP, (p) => (p * cells > index ? 1 : 0));
  const runOn = useTransform(runP, (p) =>
    showRun && p * cells > index ? 1 : 0,
  );
  const scale = useTransform(head, (p) => {
    if (!motionSafe) return 1;
    const d = p * cells - index;
    return d > 0 && d < 2.5 ? r3(1 + 0.28 * (1 - d / 2.5)) : 1;
  });
  const changed = showRun && greyOutcome !== runOutcome;
  return (
    <motion.span
      aria-hidden
      className="relative block aspect-square rounded-[2px] bg-surface-2"
      style={{ scale }}
    >
      <motion.span
        className="absolute inset-0 rounded-[inherit]"
        style={{
          opacity: greyOn,
          backgroundColor: GREY[greyOutcome],
          backgroundImage: greyOutcome === "skip" ? HATCH : undefined,
        }}
      />
      <motion.span
        className={cn(
          "absolute inset-0 rounded-[inherit]",
          changed && "ring-1 ring-foreground ring-inset",
        )}
        style={{
          opacity: runOn,
          backgroundColor: colours[runOutcome],
          backgroundImage: runOutcome === "skip" ? HATCH : undefined,
        }}
      />
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The ledger                               */
/* ----------------------------------------------------------------------- */

type LedgerProps = {
  pass: Pass;
  counterStyle: DryRunCounterStyle;
  rows: number;
  plans: Record<Pass, Plan>;
  greyP: MotionValue<number>;
  runP: MotionValue<number>;
  land: MotionValue<number>;
  colours: Record<Outcome, string>;
  states: Record<Pass, PassState>;
  density: (typeof DENSITY)[DryRunDensity];
  motionSafe: boolean;
};

function tileLabel(
  pass: Pass,
  o: Outcome,
  states: Record<Pass, PassState>,
  plans: Record<Pass, Plan>,
): string {
  const state = states[pass];
  const n = plans[pass].totals[o];
  if (state === "running") return `${COPY[pass][o]}: counting`;
  if (state === "done") return `${COPY[pass][o]}: ${grouped(n)} ${noun(o, n)}`;
  return pass === "run"
    ? `${COPY[pass][o]}: not run yet, rehearsed ${grouped(plans.rehearsal.totals[o])}`
    : `${COPY[pass][o]}: not rehearsed yet`;
}

function Delta({
  run,
  rehearsal,
  motionSafe,
}: {
  run: number;
  rehearsal: number;
  motionSafe: boolean;
}) {
  const d = run - rehearsal;
  return (
    <motion.span
      aria-hidden
      className={cn(
        "inline-flex h-4 items-center rounded-full px-1.5 font-mono text-[10px] tabular-nums",
        d === 0
          ? "bg-surface-2 text-ink-3"
          : "bg-cobalt-wash text-cobalt-bright",
      )}
      initial={motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        motionSafe
          ? { scale: springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      {d === 0 ? "same" : d > 0 ? `+${d}` : `−${Math.abs(d)}`}
    </motion.span>
  );
}

/**
 * The three counters. In the rehearsal they are grey and say "would"; in
 * the run the same figures, bars or cells repeat the walk in colour over the
 * grey ghost of the rehearsal, which stays visible underneath.
 */
function Ledger({
  pass,
  counterStyle,
  rows,
  plans,
  greyP,
  runP,
  land,
  colours,
  states,
  density,
  motionSafe,
}: LedgerProps) {
  const live = pass === "run" ? runP : greyP;
  const plan = plans[pass];
  const ranDone = pass === "run" && states.run === "done";
  const tint = (o: Outcome) => (pass === "run" ? colours[o] : GREY[o]);
  const biggest = Math.max(
    1,
    ...OUTCOMES.map((o) =>
      Math.max(plans.rehearsal.totals[o], plans.run.totals[o]),
    ),
  );

  const ghost = (o: Outcome) =>
    pass === "run" ? (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
        <span>rehearsed {grouped(plans.rehearsal.totals[o])}</span>
        {ranDone ? (
          <Delta
            run={plans.run.totals[o]}
            rehearsal={plans.rehearsal.totals[o]}
            motionSafe={motionSafe}
          />
        ) : null}
      </span>
    ) : (
      <span className="text-[11px] text-ink-3">{NOUN[o][1]}</span>
    );

  // The legend dots wear the run's colours even in the grey pass: a key to
  // what the real run will paint, while the counts themselves stay grey.
  const dot = (o: Outcome) => (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full transition-colors duration-[400ms]"
      style={{
        backgroundColor: colours[o],
        backgroundImage: o === "skip" ? HATCH : undefined,
      }}
    />
  );

  const label = (o: Outcome) => (
    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
      {dot(o)}
      <span className="truncate">{COPY[pass][o]}</span>
    </span>
  );

  if (counterStyle === "waffle") {
    const cols = { n: Math.min(20, plan.cells), w: Math.min(30, plan.cells) };
    return (
      <div className="flex flex-col gap-3">
        <div
          role="group"
          aria-label="Counts"
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          {OUTCOMES.map((o) => (
            <div
              key={o}
              role="group"
              aria-label={tileLabel(pass, o, states, plans)}
              className="flex min-w-0 flex-col gap-0.5"
            >
              {label(o)}
              <Figure
                plan={plan}
                outcome={o}
                progress={live}
                size={density.figure - 4}
                land={land}
                className={pass === "run" ? "text-foreground" : "text-ink-2"}
              />
              <span aria-hidden>{ghost(o)}</span>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="grid w-full max-w-[36rem] grid-cols-[repeat(var(--dr-cols-n),minmax(0,1fr))] gap-[2px] @min-[34rem]/dry-run:grid-cols-[repeat(var(--dr-cols-w),minmax(0,1fr))]"
          style={
            {
              "--dr-cols-n": cols.n,
              "--dr-cols-w": cols.w,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: plan.cells }, (_, i) => (
            <WaffleCell
              key={i}
              index={i}
              cells={plan.cells}
              greyOutcome={plans.rehearsal.outcome[i] ?? "create"}
              runOutcome={plans.run.outcome[i] ?? "create"}
              greyP={greyP}
              runP={runP}
              showRun={pass === "run"}
              colours={colours}
              motionSafe={motionSafe}
            />
          ))}
        </div>
        <p aria-hidden className="text-[11px] text-ink-3">
          Each cell is about {grouped(Math.max(1, rows / plan.cells))} rows
          {pass === "run" ? " · ringed cells came out differently" : ""}
        </p>
      </div>
    );
  }

  if (counterStyle === "bars") {
    return (
      <div role="group" aria-label="Counts" className="flex flex-col gap-3">
        {OUTCOMES.map((o) => (
          <div
            key={o}
            role="group"
            aria-label={tileLabel(pass, o, states, plans)}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @min-[34rem]/dry-run:grid-cols-[8rem_minmax(0,1fr)_6.5rem]"
          >
            <span aria-hidden className="min-w-0">
              {label(o)}
            </span>
            <span
              aria-hidden
              className="relative order-3 col-span-2 h-3 overflow-hidden rounded-full bg-surface-2 @min-[34rem]/dry-run:order-none @min-[34rem]/dry-run:col-span-1"
            >
              {pass === "run" ? (
                <Fill
                  plan={plans.rehearsal}
                  outcome={o}
                  progress={greyP}
                  of={biggest}
                  colour={GREY[o]}
                />
              ) : null}
              <Fill
                plan={plan}
                outcome={o}
                progress={live}
                of={biggest}
                colour={tint(o)}
              />
            </span>
            <span
              aria-hidden
              className="flex flex-col items-end gap-0.5 @min-[34rem]/dry-run:order-none"
            >
              <Figure
                plan={plan}
                outcome={o}
                progress={live}
                size={Math.round(density.figure * 0.7)}
                land={land}
                className={pass === "run" ? "text-foreground" : "text-ink-2"}
              />
              {pass === "run" ? ghost(o) : null}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Counts"
      className="grid gap-2 @min-[34rem]/dry-run:grid-cols-3"
    >
      {OUTCOMES.map((o) => (
        <div
          key={o}
          role="group"
          aria-label={tileLabel(pass, o, states, plans)}
          className={cn(
            "flex items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-1 @min-[34rem]/dry-run:flex-col @min-[34rem]/dry-run:items-stretch",
            density.tile,
          )}
        >
          <span aria-hidden className="flex min-w-0 flex-col gap-1">
            {label(o)}
            {ghost(o)}
          </span>
          <span
            aria-hidden
            className="flex shrink-0 flex-col items-end gap-1.5 @min-[34rem]/dry-run:items-start"
          >
            <Figure
              plan={plan}
              outcome={o}
              progress={live}
              size={density.figure}
              land={land}
              className={pass === "run" ? "text-foreground" : "text-ink-2"}
            />
            <span className="relative block h-1 w-20 overflow-hidden rounded-full bg-surface-2 @min-[34rem]/dry-run:w-full">
              {pass === "run" ? (
                <Fill
                  plan={plans.rehearsal}
                  outcome={o}
                  progress={greyP}
                  of={rows}
                  colour={GREY[o]}
                />
              ) : null}
              <Fill
                plan={plan}
                outcome={o}
                progress={live}
                of={rows}
                colour={tint(o)}
              />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The pass's own line: what it is, a progress track, and rows done. */
function PassTrack({
  pass,
  target,
  rows,
  progress,
  state,
}: {
  pass: Pass;
  target: string;
  rows: number;
  progress: MotionValue<number>;
  state: PassState;
}) {
  const [bar, setBar] = React.useState<HTMLDivElement | null>(null);
  const scaleX = useTransform(progress, (p) => r3(clamp(p, 0, 1)));
  const done = useTransform(
    progress,
    (p) => `${grouped(Math.round(clamp(p, 0, 1) * rows))} / ${grouped(rows)}`,
  );
  // The progressbar's value is written as the pass moves, not re-rendered.
  React.useEffect(() => {
    if (!bar) return;
    const write = (p: number) => {
      const n = Math.round(clamp(p, 0, 1) * rows);
      bar.setAttribute("aria-valuenow", String(n));
      bar.setAttribute(
        "aria-valuetext",
        `${grouped(n)} of ${grouped(rows)} rows`,
      );
    };
    write(progress.get());
    return progress.on("change", write);
  }, [bar, progress, rows]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {pass === "rehearsal" ? (
            <>
              Rehearsal · <span className="text-ink-2">nothing is written</span>
            </>
          ) : (
            <>
              Run · <span className="text-ink-2">writes to {target}</span>
            </>
          )}
        </span>
        <motion.span
          aria-hidden
          className="font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {done}
        </motion.span>
      </div>
      <div
        ref={setBar}
        role="progressbar"
        aria-label={
          pass === "rehearsal" ? "Rehearsal progress" : "Run progress"
        }
        aria-valuemin={0}
        aria-valuemax={rows}
        aria-busy={state === "running" || undefined}
        className="relative h-1 overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className={cn(
            "absolute inset-0 rounded-full",
            pass === "rehearsal" ? "bg-ink-3" : "bg-cobalt-bright",
          )}
          style={{ scaleX, originX: 0 }}
        />
      </div>
    </div>
  );
}

function SkippedRows({
  rows,
  totalSkipped,
  uid,
  motionSafe,
}: {
  rows: DryRunSkippedRow[];
  totalSkipped: number;
  uid: string;
  motionSafe: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const listed = rows.slice(0, 6);
  const more = Math.max(0, totalSkipped - listed.length);
  const panelId = `${uid}-skipped`;
  if (totalSkipped <= 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-2 self-start rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS,
        )}
      >
        <motion.span
          aria-hidden
          className="inline-flex"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
        Inspect skipped rows
        <span className="inline-flex h-5 items-center rounded-full border border-hairline px-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
          {grouped(totalSkipped)}
        </span>
      </button>
      <Measured open={open} motionSafe={motionSafe} id={panelId}>
        <div className="overflow-hidden rounded-3 border border-hairline">
          <table className="w-full border-collapse text-left text-[12px]">
            <caption className="sr-only">
              Rows left out of the migration
            </caption>
            <thead className="bg-surface-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              <tr>
                <th scope="col" className="w-14 px-3 py-1.5 font-normal">
                  Row
                </th>
                <th scope="col" className="px-3 py-1.5 font-normal">
                  Account
                </th>
                <th scope="col" className="px-3 py-1.5 font-normal">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => (
                <tr
                  key={`${r.row}-${r.key}`}
                  className="border-t border-hairline"
                >
                  <td className="px-3 py-1.5 align-top font-mono text-ink-3 tabular-nums">
                    {r.row}
                  </td>
                  <td className="px-3 py-1.5 align-top font-mono whitespace-nowrap text-foreground">
                    {r.key}
                  </td>
                  <td className="px-3 py-1.5 align-top text-ink-2">
                    {r.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 ? (
            <p className="border-t border-hairline px-3 py-1.5 text-[11px] text-ink-3">
              and {grouped(more)} more in the report
            </p>
          ) : null}
        </div>
      </Measured>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors";
const PRIMARY =
  "bg-primary text-primary-foreground hover:bg-primary/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary";
const QUIET =
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface-1";

/**
 * A data migration wizard that rehearses before it writes. Four steps on a
 * stepper — connect, map, rehearse, run — each validated before Next. The
 * rehearsal is a grey pass: one motion value walks the rows on the move
 * ease, and three counters (would create, would update, would skip) tick up
 * from it as the rows they belong to pass, as figures, bars or a waffle of
 * row batches. The real run repeats exactly the same walk in colour: the
 * same rows pass in the same seeded order, the colour paints over the grey
 * ghost of the rehearsal, and each counter keeps its rehearsed figure with a
 * delta chip once the actual counts land on `springs.recoil`.
 *
 * Panels swap 16px by direction on `glide`; the stepper's fill glides and
 * its checks draw on `flick`. Skipped rows open into a real table on glide.
 * Under reduced motion the pass still runs, in 600 ms with no pops or
 * landings, because the counts are the information.
 */
export function DryRun({
  source = defaultDryRunSource,
  fields = defaultDryRunFields,
  mapping,
  defaultMapping = defaultDryRunMapping,
  onMappingChange,
  results = defaultDryRunResults,
  step,
  defaultStep = "connect",
  onStepChange,
  onConnect,
  onDryRun,
  onRun,
  onPassEnd,
  onDownloadReport,
  counterStyle = "digits",
  density = "regular",
  tone = "signal",
  passDuration = 2400,
  status = "ready",
  onRetry,
  title = "Move meter accounts",
  height = 540,
  disabled = false,
  className,
}: DryRunProps) {
  const motionSafe = useMotionSafe();
  const committed = useCommitted();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const colours = TONES[tone] ?? TONES.signal;

  const [ownStep, setOwnStep] = React.useState<DryRunStep>(defaultStep);
  const current = step ?? ownStep;
  const index = Math.max(0, STEPS.indexOf(current));
  const startIndex = Math.max(0, STEPS.indexOf(step ?? defaultStep));

  const [ownMapping, setOwnMapping] =
    React.useState<DryRunMapping>(defaultMapping);
  const map = mapping ?? ownMapping;

  const [connection, setConnection] = React.useState<
    "unchecked" | "checking" | "ok" | "failed"
  >(startIndex > 0 ? "ok" : "unchecked");
  const [states, setStates] = React.useState<Record<Pass, PassState>>({
    rehearsal: startIndex > 2 ? "done" : "idle",
    run: "idle",
  });
  const [rehearsedKey, setRehearsedKey] = React.useState<string | null>(
    startIndex > 2 ? keyOf(defaultMapping) : null,
  );
  const [attempted, setAttempted] = React.useState<
    Partial<Record<DryRunStep, boolean>>
  >({});
  const [reported, setReported] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [shown, setShown] = React.useState({ step: current, dir: 1 });
  if (shown.step !== current) {
    setShown({
      step: current,
      dir: STEPS.indexOf(current) >= STEPS.indexOf(shown.step) ? 1 : -1,
    });
  }

  const greyP = useMotionValue(startIndex > 2 ? 1 : 0);
  const runP = useMotionValue(0);
  const land = useMotionValue(0);
  const passCtl = React.useRef<AnimationPlaybackControls | null>(null);
  const landCtl = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef(new Set<number>());
  const wantFocus = React.useRef(false);
  const checkRef = React.useRef<HTMLButtonElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      passCtl.current?.stop();
      landCtl.current?.stop();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const rows = Math.max(0, Math.round(source.rows));
  const cells = clamp(rows, 1, 120);
  const seed = hash(`${source.name}:${source.location}`);
  const plans = React.useMemo(() => {
    const rand = seeded(seed);
    const ranks = Array.from({ length: cells }, () => rand());
    return {
      rehearsal: planPass(results.rehearsal, ranks),
      run: planPass(results.run, ranks),
    };
  }, [cells, seed, results.rehearsal, results.run]);

  const problems = mappingProblems(fields, map);
  const mapOk = Object.keys(problems).length === 0;
  const stale =
    states.rehearsal === "done" &&
    rehearsedKey !== null &&
    rehearsedKey !== keyOf(map);
  const busy = states.rehearsal === "running" || states.run === "running";
  // Without a source there is nothing to step through.
  const halted = disabled || status !== "ready";
  const ranOnce = states.run !== "idle";

  const say = (text: string) => setAnnouncement(text);

  const problemOf = (s: DryRunStep): string | null => {
    if (s === "connect") {
      if (connection === "checking") return "Wait for the check to finish.";
      return connection === "ok"
        ? null
        : "Check the connection before mapping.";
    }
    if (s === "map") {
      if (mapOk) return null;
      const n = Object.keys(problems).length;
      const first = fields.find((f) => problems[f.id]);
      return n === 1 && first
        ? `${problems[first.id]}.`
        : `${n} fields need attention before rehearsing.`;
    }
    if (s === "rehearse") {
      if (states.rehearsal === "running")
        return "Wait for the rehearsal to finish.";
      if (states.rehearsal !== "done")
        return "Rehearse first, so you see what would change.";
      if (stale) return "The mapping changed. Rehearse again before running.";
    }
    return null;
  };

  const goTo = (next: DryRunStep) => {
    if (next === current) return;
    wantFocus.current = true;
    if (step === undefined) setOwnStep(next);
    const i = STEPS.indexOf(next);
    say(`Step ${i + 1} of ${STEPS.length}: ${STEP_TITLE[next]}.`);
    onStepChange?.(next);
  };

  const focusProblem = (s: DryRunStep) => {
    if (s === "connect") {
      checkRef.current?.focus();
      return;
    }
    if (s === "map") {
      const first = fields.find((f) => problems[f.id]);
      if (!first) return;
      rootRef.current
        ?.querySelector<HTMLSelectElement>(`[data-dr-field="${first.id}"]`)
        ?.focus();
    }
  };

  /** Walks forward one step at a time, stopping at the first that is not ready. */
  const advanceTo = (target: number) => {
    if (halted || busy) return;
    for (let i = index; i < target; i++) {
      const s = STEPS[i];
      if (!s) return;
      const problem = problemOf(s);
      if (problem) {
        setAttempted((a) => ({ ...a, [s]: true }));
        say(problem);
        if (s !== current) goTo(s);
        else focusProblem(s);
        return;
      }
    }
    const next = STEPS[target];
    if (next) goTo(next);
  };

  const back = () => {
    if (halted || busy || index === 0) return;
    const prev = STEPS[index - 1];
    if (prev) goTo(prev);
  };

  const check = () => {
    if (disabled || connection === "checking" || ranOnce) return;
    setConnection("checking");
    say("Checking the connection.");
    const ok = onConnect?.() !== false;
    const t = window.setTimeout(
      () => {
        timers.current.delete(t);
        setConnection(ok ? "ok" : "failed");
        say(
          ok
            ? `Connected. ${grouped(rows)} rows, ${source.columns.length} columns.`
            : "Could not read the source. Check the location and try again.",
        );
      },
      motionSafe ? 760 : 200,
    );
    timers.current.add(t);
  };

  const setField = (id: string, column: string | null) => {
    if (disabled || ranOnce) return;
    const next = { ...map, [id]: column };
    if (mapping === undefined) setOwnMapping(next);
    onMappingChange?.(next);
  };

  const finishPass = (pass: Pass) => {
    setStates((s) => ({ ...s, [pass]: "done" }));
    const c = pass === "rehearsal" ? results.rehearsal : results.run;
    say(
      pass === "rehearsal"
        ? `Rehearsal finished. Would create ${grouped(c.create)}, update ${grouped(c.update)}, skip ${grouped(c.skip)}. Nothing was written.`
        : `Migration finished. Created ${grouped(c.create)}, updated ${grouped(c.update)}, skipped ${grouped(c.skip)}.`,
    );
    onPassEnd?.(pass, c);
    if (motionSafe) {
      // The counts land: a short drop that settles on recoil.
      landCtl.current?.stop();
      land.jump(-distances.nudge);
      landCtl.current = animate(land, 0, springs.recoil);
    }
  };

  const startPass = (pass: Pass) => {
    if (disabled || busy) return;
    if (pass === "run" && (states.run !== "idle" || problemOf("rehearse")))
      return;
    const mv = pass === "rehearsal" ? greyP : runP;
    passCtl.current?.stop();
    landCtl.current?.stop();
    land.jump(0);
    mv.jump(0);
    setStates((s) => ({ ...s, [pass]: "running" }));
    if (pass === "rehearsal") {
      setRehearsedKey(keyOf(map));
      onDryRun?.(map);
      say("Rehearsal started. Nothing is written.");
    } else {
      onRun?.(map);
      say(`Migration started. Writing to ${source.target}.`);
    }
    passCtl.current = animate(mv, 1, {
      duration: motionSafe ? Math.max(0.4, passDuration / 1000) : 0.6,
      ease: motionSafe ? easings.move : easings.linear,
      onComplete: () => finishPass(pass),
    });
  };

  const download = () => {
    if (disabled || states.run !== "done") return;
    setReported(true);
    say("Report ready.");
    onDownloadReport?.({
      source: source.name,
      target: source.target,
      mapping: map,
      rehearsal: results.rehearsal,
      run: results.run,
      skipped: results.skipped,
    });
  };

  const headingRef = React.useCallback((node: HTMLHeadingElement | null) => {
    if (node && wantFocus.current) {
      wantFocus.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  const problem = attempted[current] ? problemOf(current) : null;
  const headingId = `${uid}-h-${current}`;
  const problemId = `${uid}-problem`;
  const mappedCount = fields.filter((f) => map[f.id]).length;

  const statusChip =
    states.run === "done"
      ? "Finished"
      : states.run === "running"
        ? "Running"
        : states.rehearsal === "running"
          ? "Rehearsing"
          : states.rehearsal === "done" && !stale
            ? "Rehearsed"
            : "Draft";

  /* ----------------------------- the panels ---------------------------- */

  const connectPanel = (
    <div className="grid items-stretch gap-3 @min-[34rem]/dry-run:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-3 border border-hairline bg-surface-1 p-3">
        {connection === "checking" && motionSafe ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-px bg-cobalt-bright"
            initial={{ top: "0%", opacity: 0.9 }}
            animate={{ top: "100%", opacity: 0.4 }}
            transition={{ duration: 0.72, ease: easings.move }}
          />
        ) : null}
        <div className="flex items-start gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2">
            <FileText aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {source.name}
            </p>
            <p
              className="truncate font-mono text-[11px] text-ink-3"
              title={source.location}
            >
              {source.kind} · {source.location}
            </p>
          </div>
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 text-[12px]",
            connection === "ok"
              ? "text-success"
              : connection === "failed"
                ? "text-danger"
                : "text-ink-3",
          )}
        >
          {connection === "ok" ? (
            <Tick
              draw={committed}
              motionSafe={motionSafe}
              className="size-3.5"
            />
          ) : connection === "failed" ? (
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          ) : null}
          {connection === "ok"
            ? `Connected · ${grouped(rows)} rows · ${source.columns.length} columns`
            : connection === "failed"
              ? "Could not read the source"
              : connection === "checking"
                ? "Reading the header…"
                : "Not checked yet"}
        </p>
        {connection === "ok" ? (
          <ul aria-label="Columns" className="flex flex-wrap gap-1">
            {source.columns.map((c) => (
              <li
                key={c}
                className="rounded-1 border border-hairline bg-surface-0 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
              >
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        <button
          ref={checkRef}
          type="button"
          onClick={check}
          aria-disabled={
            disabled || connection === "checking" || ranOnce || undefined
          }
          aria-describedby={problem ? problemId : undefined}
          className={cn(BUTTON, QUIET, FOCUS, "mt-auto self-start")}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {connection === "ok" || connection === "failed"
            ? "Check again"
            : "Check connection"}
        </button>
      </div>
      <span aria-hidden className="flex items-center justify-center text-ink-3">
        <ArrowRight className="size-4 rotate-90 @min-[34rem]/dry-run:rotate-0" />
      </span>
      <div className="flex min-w-0 flex-col gap-2 rounded-3 border border-dashed border-hairline-strong p-3">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash text-cobalt-bright">
            <Database aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {source.target}
            </p>
            <p className="text-[11px] text-ink-3">
              Matches rows on {fields[0]?.label.toLowerCase() ?? "the key"}
            </p>
          </div>
        </div>
        <p className="text-[12px] text-ink-3">
          {fields.length} fields · {fields.filter((f) => f.required).length}{" "}
          required
        </p>
      </div>
    </div>
  );

  const mapPanel = (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-ink-3">
        {mappedCount} of {fields.length} fields mapped
        {fields.length - mappedCount > 0
          ? ` · ${fields.length - mappedCount} skipped`
          : ""}
        {ranOnce ? " · locked after the run" : ""}
      </p>
      <ul className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline">
        {fields.map((f) => {
          const col = map[f.id] ?? null;
          const err = attempted.map ? problems[f.id] : undefined;
          const selectId = `${uid}-f-${f.id}`;
          const noteId = `${uid}-n-${f.id}`;
          const sample = col ? source.sample?.[col] : undefined;
          const used = new Set(
            fields.filter((g) => g.id !== f.id).map((g) => map[g.id]),
          );
          return (
            <li
              key={f.id}
              className="grid gap-x-4 gap-y-1.5 px-3 py-2.5 @min-[34rem]/dry-run:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] @min-[34rem]/dry-run:items-start"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <label
                  htmlFor={selectId}
                  className="flex min-w-0 items-center gap-2 font-medium text-foreground"
                >
                  <span className="truncate">{f.label}</span>
                  {f.required ? (
                    <span className="inline-flex h-4 shrink-0 items-center rounded-full border border-hairline px-1.5 font-mono text-[9px] tracking-[0.06em] text-ink-3 uppercase">
                      Required
                    </span>
                  ) : null}
                </label>
                {f.hint ? (
                  <p className="text-[11px] leading-4 text-ink-3">{f.hint}</p>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <select
                  id={selectId}
                  data-dr-field={f.id}
                  value={col ?? ""}
                  disabled={disabled || ranOnce}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err || sample ? noteId : undefined}
                  onChange={(event) => {
                    const v = event.currentTarget.value;
                    setField(f.id, v === "" ? null : v);
                  }}
                  className={cn(
                    "h-8 w-full min-w-0 rounded-2 border bg-surface-0 px-2 font-mono text-[12px] text-foreground dark:[color-scheme:dark]",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    err ? "border-danger" : "border-input",
                  )}
                >
                  <option value="">Skip this field</option>
                  {source.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                      {used.has(c) ? " · in use" : ""}
                    </option>
                  ))}
                </select>
                {err ? (
                  <p
                    id={noteId}
                    className="flex items-center gap-1 text-[11px] leading-4 text-danger"
                  >
                    <TriangleAlert aria-hidden className="size-3 shrink-0" />
                    {err}
                  </p>
                ) : sample ? (
                  <p
                    id={noteId}
                    className="truncate font-mono text-[10px] leading-4 text-ink-3"
                    title={sample}
                  >
                    e.g. {sample}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const ledgerFor = (pass: Pass) => (
    <Ledger
      pass={pass}
      counterStyle={counterStyle}
      rows={rows}
      plans={plans}
      greyP={greyP}
      runP={runP}
      land={land}
      colours={colours}
      states={states}
      density={d}
      motionSafe={motionSafe}
    />
  );

  const rehearsePanel = (
    <div className="flex flex-col gap-4">
      <PassTrack
        pass="rehearsal"
        target={source.target}
        rows={rows}
        progress={greyP}
        state={states.rehearsal}
      />
      {ledgerFor("rehearsal")}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => startPass("rehearsal")}
          aria-disabled={disabled || busy || ranOnce || undefined}
          className={cn(
            BUTTON,
            states.rehearsal === "done" && !stale ? QUIET : PRIMARY,
            FOCUS,
          )}
        >
          <Play aria-hidden className="size-3.5" />
          {states.rehearsal === "idle" ? "Rehearse" : "Rehearse again"}
        </button>
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          {states.rehearsal === "done" && !stale ? (
            <Tick
              draw={committed}
              motionSafe={motionSafe}
              className="size-3.5 text-success"
            />
          ) : null}
          <span>
            {states.rehearsal === "running"
              ? "Walking the rows…"
              : stale
                ? "The mapping changed since this rehearsal."
                : states.rehearsal === "done"
                  ? "Finished · nothing was written"
                  : "Takes a few seconds and writes nothing."}
          </span>
        </p>
      </div>
      {states.rehearsal === "done" ? (
        <SkippedRows
          rows={results.skipped}
          totalSkipped={results.rehearsal.skip}
          uid={`${uid}-r`}
          motionSafe={motionSafe}
        />
      ) : null}
    </div>
  );

  const runPanel = (
    <div className="flex flex-col gap-4">
      <PassTrack
        pass="run"
        target={source.target}
        rows={rows}
        progress={runP}
        state={states.run}
      />
      {ledgerFor("run")}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {states.run === "done" ? (
          <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-foreground">
            <Tick
              draw={committed}
              motionSafe={motionSafe}
              className="size-3.5 text-success"
            />
            <span>
              Migration finished · {grouped(results.run.create)} created
            </span>
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => startPass("run")}
              aria-disabled={disabled || busy || undefined}
              className={cn(BUTTON, PRIMARY, FOCUS)}
            >
              <Play aria-hidden className="size-3.5" />
              Run migration
            </button>
            <p className="min-w-0 text-[12px] text-ink-3">
              {states.run === "running"
                ? "Writing rows in the rehearsed order…"
                : `Writes ${grouped(rows)} rows to ${source.target}.`}
            </p>
          </>
        )}
      </div>
      {states.run === "done" ? (
        <SkippedRows
          rows={results.skipped}
          totalSkipped={results.run.skip}
          uid={`${uid}-u`}
          motionSafe={motionSafe}
        />
      ) : null}
    </div>
  );

  const panels: Record<DryRunStep, React.ReactNode> = {
    connect: connectPanel,
    map: mapPanel,
    rehearse: rehearsePanel,
    run: runPanel,
  };

  const body =
    status === "loading" ? (
      <div aria-busy="true" className={cn("flex flex-col gap-3", d.px, d.py)}>
        <p className="sr-only">Loading the source.</p>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2">
            <span className="h-3 w-1/2 rounded-full bg-surface-2" />
            <span className="h-14 rounded-3 bg-surface-2/70" />
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The source did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Nothing has been written. Try again once the export is reachable.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(BUTTON, QUIET, FOCUS)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <AnimatePresence initial={false} mode="popLayout" custom={shown.dir}>
        <motion.section
          key={current}
          custom={shown.dir}
          aria-labelledby={headingId}
          variants={{
            enter: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? dir * distances.shift : 0,
            }),
            shown: { opacity: 1, x: 0 },
            leave: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? -dir * distances.shift : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? {
                  x: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          className={cn("flex w-full flex-col", d.px, d.py, d.gap)}
        >
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="rounded-1 text-[13px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {STEP_TITLE[current]}
          </h3>
          {panels[current]}
        </motion.section>
      </AnimatePresence>
    );

  // Next lights up once its step is ready, so the step's own action is the
  // one primary button until then.
  const nextReady =
    current === "run" ? states.run === "done" : problemOf(current) === null;
  const nextLabel =
    current === "connect"
      ? "Map fields"
      : current === "map"
        ? "Rehearse"
        : current === "rehearse"
          ? "Continue to run"
          : "Download report";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={title}
      className={cn(
        "@container/dry-run flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        d.body,
        className,
      )}
      style={{ height }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline",
          d.px,
          "py-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[24rem]/dry-run:inline-flex">
            <Database aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate text-[11px] text-ink-3">
              {source.name} → {source.target}
            </p>
          </div>
        </div>
        <span className="grid shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
          {["Draft", "Rehearsing", "Rehearsed", "Running", "Finished"].map(
            (chip) => (
              <span
                key={chip}
                aria-hidden={chip !== statusChip}
                title={chip}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 justify-self-end rounded-full border px-2 transition-opacity duration-200 [grid-area:1/1]",
                  chip === "Finished"
                    ? "border-success/40 text-success"
                    : chip === "Running" || chip === "Rehearsing"
                      ? "border-cobalt-bright/40 text-cobalt-bright"
                      : "border-hairline text-ink-3",
                )}
                style={{ opacity: chip === statusChip ? 1 : 0 }}
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-current"
                />
                <span className="sr-only @min-[21rem]/dry-run:not-sr-only">
                  {chip}
                </span>
              </span>
            ),
          )}
        </span>
      </header>

      <nav
        aria-label="Migration steps"
        className={cn("shrink-0 border-b border-hairline py-2.5", d.px)}
      >
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < index;
            const here = i === index;
            const reachable = !here && (i < index || i === index + 1);
            const nodeClass = cn(
              "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums transition-colors",
              done
                ? "border-transparent bg-cobalt-bright text-primary-foreground"
                : here
                  ? "border-cobalt-bright text-cobalt-bright"
                  : "border-hairline-strong text-ink-3",
            );
            const inner = (
              <>
                <span className={nodeClass}>
                  {done ? (
                    <Tick
                      draw={committed}
                      motionSafe={motionSafe}
                      className="size-3.5"
                    />
                  ) : (
                    <span aria-hidden>{i + 1}</span>
                  )}
                  {here ? (
                    <motion.span
                      layoutId={`${uid}-ring`}
                      aria-hidden
                      className="absolute -inset-1 rounded-full border border-cobalt-bright/40"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "truncate text-[12px]",
                    "hidden @min-[34rem]/dry-run:inline",
                    here ? "font-medium text-foreground" : "text-ink-2",
                  )}
                >
                  {STEP_LABEL[s]}
                </span>
                <span className="sr-only">
                  {`${STEP_LABEL[s]}, step ${i + 1} of ${STEPS.length}${done ? ", done" : here ? ", current" : ""}`}
                </span>
              </>
            );
            return (
              <li
                key={s}
                aria-current={here ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  i < STEPS.length - 1 && "flex-1",
                )}
              >
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => (i < index ? goTo(s) : advanceTo(i))}
                    aria-disabled={disabled || busy || undefined}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-full pr-1 transition-colors hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    {inner}
                  </span>
                )}
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="relative h-px min-w-3 flex-1 overflow-hidden bg-hairline-strong"
                  >
                    <motion.span
                      className="absolute inset-0 bg-cobalt-bright"
                      style={{ originX: 0 }}
                      initial={false}
                      animate={{ scaleX: done ? 1 : 0 }}
                      transition={motionSafe ? springs.glide : { duration: 0 }}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {body}
      </div>

      <footer
        className={cn(
          "flex shrink-0 flex-col gap-2 border-t border-hairline py-3",
          d.px,
        )}
      >
        {problem || (current === "run" && reported) ? (
          <p
            id={problemId}
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-[12px] leading-4",
              problem ? "text-danger" : "text-ink-3",
            )}
          >
            {problem ? (
              <>
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0">{problem}</span>
              </>
            ) : (
              <>
                <Tick
                  draw={committed}
                  motionSafe={motionSafe}
                  className="size-3.5 text-success"
                />
                Report ready
              </>
            )}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={back}
            aria-disabled={halted || busy || index === 0 || undefined}
            className={cn(
              BUTTON,
              "px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            Back
          </button>
          <span className="hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]/dry-run:inline">
            Step {index + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() =>
              current === "run" ? download() : advanceTo(index + 1)
            }
            aria-disabled={
              halted ||
              busy ||
              (current === "run" && states.run !== "done") ||
              undefined
            }
            aria-describedby={problem ? problemId : undefined}
            className={cn(
              BUTTON,
              nextReady && !halted ? PRIMARY : QUIET,
              FOCUS,
            )}
          >
            {current === "run" ? (
              <Download aria-hidden className="size-3.5" />
            ) : null}
            {nextLabel}
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
