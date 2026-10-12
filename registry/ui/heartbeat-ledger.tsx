"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Activity, ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";

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

/** One report from a job. */
export type HeartbeatBeat = {
  /** When the job reported, in ms. */
  at: number;
  /** How long the run took, in ms. */
  durationMs: number;
};

export type HeartbeatJob = {
  id: string;
  /** E.g. "Nightly settlement". */
  name: string;
  /** Where it runs, e.g. "ledger-worker". */
  runner?: string;
  /** How often a beat is expected, in ms. The next one is due one interval after the last. */
  intervalMs: number;
  /** How far past its slot a beat may arrive before it counts as late, in ms. @default a quarter of the interval, at least a minute */
  graceMs?: number;
  /** Every beat the host still holds, in any order. */
  beats: HeartbeatBeat[];
};

export type HeartbeatState = "healthy" | "late" | "missing" | "paused";
export type HeartbeatBeatKind = "ontime" | "late" | "missed";
export type HeartbeatSort = "status" | "name";
export type HeartbeatStrip = "ticks" | "dots" | "bars";
export type HeartbeatDensity = "compact" | "cozy" | "roomy";
export type HeartbeatStatus = "ready" | "loading" | "error";

/** One slot in a job's history: a beat that arrived on time or late, or a slot nothing arrived for. */
export type HeartbeatTick = {
  at: number;
  kind: HeartbeatBeatKind;
  beat?: HeartbeatBeat;
};

/** A job read against the clock: its state, every slot in its history and what comes next. */
export type HeartbeatReading = {
  job: HeartbeatJob;
  state: HeartbeatState;
  /** Oldest first. */
  ticks: HeartbeatTick[];
  last: HeartbeatBeat | null;
  /** When the next beat is or was due, in ms; null before the first beat. */
  due: number | null;
  /** Slots overdue past their grace since the last beat. */
  overdue: number;
};

export type HeartbeatSummary = Record<HeartbeatState, number>;

export type HeartbeatLedgerProps = {
  /** The jobs, each with its interval and beats. @default defaultHeartbeatJobs */
  jobs?: HeartbeatJob[];
  /** The moment the ledger reads against, in ms — never taken from the clock. @default defaultHeartbeatNow */
  now?: number;
  /** How many hours of beats each strip shows, 6 to 72. @default 24 */
  windowHours?: number;
  /** How beats are drawn: ticks on a baseline, dots on a line, or slot-wide bars. @default "ticks" */
  strip?: HeartbeatStrip;
  /** Row height and strip height. @default "cozy" */
  density?: HeartbeatDensity;
  /** Controlled ids of the rows that are expanded. */
  value?: string[];
  /** Initial expanded ids when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the press or key that expanded or collapsed a row, with every expanded id. */
  onChange?: (
    expanded: string[],
    change: { id: string; expanded: boolean },
  ) => void;
  /** Controlled ids of the paused jobs. */
  paused?: string[];
  /** Initial paused ids when uncontrolled. @default defaultHeartbeatPaused */
  defaultPaused?: string[];
  /** Fires from the switch or the P key that paused or resumed a job, with every paused id. */
  onPauseChange?: (
    paused: string[],
    change: { id: string; paused: boolean },
  ) => void;
  /** Controlled row order: by state (missing first) or by name. */
  sort?: HeartbeatSort;
  /** Initial order when uncontrolled. @default "status" */
  defaultSort?: HeartbeatSort;
  /** The sort control changed. */
  onSortChange?: (sort: HeartbeatSort) => void;
  /** How many of the last runs an expanded row charts. @default 12 */
  runsShown?: number;
  /** Count the seconds between `now` updates while a row is expanded and the ledger is on screen. @default true */
  live?: boolean;
  /** Whether the jobs have arrived. @default "ready" */
  status?: HeartbeatStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Nightly jobs" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the ledger in px; the rows scroll inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be paused and the order is fixed. Rows still expand. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

/** Monday 12 October 2026, 06:30 UTC — the morning after the nightly runs. */
export const defaultHeartbeatNow = Date.UTC(2026, 9, 12, 6, 30);

const at = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 9, day, hour, minute);

/** How far back the seeded histories reach: a little beyond the widest window. */
const HISTORY = 74 * HOUR;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Beats at every slot back from `lastAt`, with a little jitter; `late` lists
 * the slots (0 is the newest) that arrived late, `skip` the ones that never
 * arrived.
 */
function beatsFor(
  seed: number,
  lastAt: number,
  intervalMs: number,
  duration: [number, number],
  late: number[] = [],
  skip: number[] = [],
): HeartbeatBeat[] {
  const rand = mulberry32(seed);
  const grace = Math.max(MIN, intervalMs / 4);
  const lateSet = new Set(late);
  const skipSet = new Set(skip);
  const out: HeartbeatBeat[] = [];
  for (
    let i = 0;
    lastAt - i * intervalMs >= defaultHeartbeatNow - HISTORY;
    i++
  ) {
    const slot = lastAt - i * intervalMs;
    const jitter = lateSet.has(i)
      ? grace * (1.3 + rand() * 0.8)
      : rand() * grace * 0.3;
    const [lo, hi] = duration;
    const durationMs = Math.round(lo + (hi - lo) * rand());
    if (skipSet.has(i)) continue;
    out.push({ at: Math.round(slot + jitter), durationMs });
  }
  return out.reverse();
}

/** Fieldline's scheduled jobs on the morning of 12 October 2026. */
export const defaultHeartbeatJobs: HeartbeatJob[] = [
  {
    id: "settlement",
    name: "Nightly settlement",
    runner: "ledger-worker",
    intervalMs: 24 * HOUR,
    beats: beatsFor(11, at(12, 2), 24 * HOUR, [5.5 * MIN, 9 * MIN], [2]),
  },
  {
    id: "meter-sync",
    name: "Meter readings sync",
    runner: "field-gateway",
    intervalMs: HOUR,
    beats: beatsFor(12, at(12, 6), HOUR, [20 * SEC, 70 * SEC], [5, 17], [29]),
  },
  {
    id: "invoice-batch",
    name: "Invoice PDF batch",
    runner: "billing-worker",
    intervalMs: 4 * HOUR,
    beats: beatsFor(13, at(11, 22), 4 * HOUR, [2 * MIN, 4 * MIN], [4]),
  },
  {
    id: "roster-export",
    name: "Crew roster export",
    runner: "ops-cron",
    intervalMs: 12 * HOUR,
    beats: beatsFor(14, at(10, 18), 12 * HOUR, [40 * SEC, 90 * SEC]),
  },
  {
    id: "hydrant-poll",
    name: "Hydrant pressure poll",
    runner: "field-gateway",
    intervalMs: 20 * MIN,
    beats: beatsFor(
      15,
      at(12, 6, 20),
      20 * MIN,
      [3 * SEC, 9 * SEC],
      [7, 31, 32],
      [50],
    ),
  },
  {
    id: "cold-backup",
    name: "Backup to cold store",
    runner: "ops-cron",
    intervalMs: 24 * HOUR,
    beats: beatsFor(16, at(12, 3, 30), 24 * HOUR, [18 * MIN, 31 * MIN]),
  },
  {
    id: "status-refresh",
    name: "Status page refresh",
    runner: "web-worker",
    intervalMs: 30 * MIN,
    beats: beatsFor(17, at(12, 4), 30 * MIN, [2 * SEC, 5 * SEC], [12]),
  },
  {
    id: "tariff-recompute",
    name: "Tariff recompute",
    runner: "billing-worker",
    intervalMs: 2 * HOUR,
    beats: beatsFor(18, at(12, 6), 2 * HOUR, [50 * SEC, 2 * MIN], [3], [9]),
  },
];

/** The status page refresh is paused while its host is rebuilt. */
export const defaultHeartbeatPaused: string[] = ["status-refresh"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const MIN_WINDOW = 6;
const MAX_WINDOW = 72;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const graceOf = (job: HeartbeatJob) =>
  job.graceMs ?? Math.max(MIN, Math.round(job.intervalMs / 4));

const STATE_ORDER: Record<HeartbeatState, number> = {
  missing: 0,
  late: 1,
  healthy: 2,
  paused: 3,
};

const STATE_WORD: Record<HeartbeatState, string> = {
  healthy: "On time",
  late: "Late",
  missing: "Missing",
  paused: "Paused",
};

const STATE_COLOR: Record<HeartbeatState, string> = {
  healthy: "var(--hl-ok)",
  late: "var(--warn)",
  missing: "var(--danger)",
  paused: "var(--ink-3)",
};

const KIND_WORD: Record<HeartbeatBeatKind, string> = {
  ontime: "on time",
  late: "late",
  missed: "missed",
};

const DENSITY: Record<HeartbeatDensity, { row: number; strip: number }> = {
  compact: { row: 36, strip: 12 },
  cozy: { row: 44, strip: 16 },
  roomy: { row: 54, strip: 20 },
};

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** "41s", "6m 12s", "2h 14m", "1d 6h". */
function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / SEC));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** "every 20 min", "every 4h", "daily". */
function every(ms: number): string {
  if (ms >= 24 * HOUR && ms % (24 * HOUR) === 0) {
    const d = ms / (24 * HOUR);
    return d === 1 ? "daily" : `every ${d}d`;
  }
  if (ms >= HOUR && ms % HOUR === 0) return `every ${ms / HOUR}h`;
  if (ms >= MIN) return `every ${Math.round(ms / MIN)} min`;
  return `every ${Math.round(ms / SEC)}s`;
}

/** Reads one job against `now`: its state, every slot in its history and what is due. */
export function readHeartbeat(
  job: HeartbeatJob,
  now: number,
  paused = false,
): HeartbeatReading {
  const interval = Math.max(SEC, job.intervalMs);
  const grace = graceOf(job);
  const beats = [...job.beats].sort((a, b) => a.at - b.at);
  const ticks: HeartbeatTick[] = [];
  let prev: HeartbeatBeat | null = null;
  for (const beat of beats) {
    if (!prev) {
      ticks.push({ at: beat.at, kind: "ontime", beat });
      prev = beat;
      continue;
    }
    const gap = beat.at - prev.at;
    const k = Math.max(1, Math.round(gap / interval));
    for (let j = 1; j < k; j += 1) {
      ticks.push({ at: prev.at + j * interval, kind: "missed" });
    }
    const lateBy = beat.at - (prev.at + k * interval);
    ticks.push({ at: beat.at, kind: lateBy > grace ? "late" : "ontime", beat });
    prev = beat;
  }
  const last = beats[beats.length - 1] ?? null;
  let overdue = 0;
  if (last) {
    overdue = Math.max(0, Math.ceil((now - grace - last.at) / interval) - 1);
    // Only the slots a widest window could show are drawn; the count stands.
    const first = Math.max(1, Math.ceil((now - HISTORY - last.at) / interval));
    for (let j = first; j <= overdue; j += 1) {
      ticks.push({ at: last.at + j * interval, kind: "missed" });
    }
  }
  const state: HeartbeatState = paused
    ? "paused"
    : !last
      ? "missing"
      : overdue === 0
        ? "healthy"
        : overdue === 1
          ? "late"
          : "missing";
  return {
    job,
    state,
    ticks,
    last,
    due: last ? last.at + interval : null,
    overdue,
  };
}

/** Counts jobs by state, for hosts that show the totals elsewhere. */
export function summariseHeartbeats(
  jobs: HeartbeatJob[],
  now: number,
  paused: string[] = [],
): HeartbeatSummary {
  const out: HeartbeatSummary = { healthy: 0, late: 0, missing: 0, paused: 0 };
  for (const job of jobs) {
    out[readHeartbeat(job, now, paused.includes(job.id)).state] += 1;
  }
  return out;
}

/** Whether a job's newest beat arrived late, read from its last two beats. */
function lastKind(job: HeartbeatJob): HeartbeatBeatKind {
  const sorted = [...job.beats].sort((a, b) => a.at - b.at);
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  if (!last || !prev) return "ontime";
  const interval = Math.max(SEC, job.intervalMs);
  const k = Math.max(1, Math.round((last.at - prev.at) / interval));
  return last.at - (prev.at + k * interval) > graceOf(job) ? "late" : "ontime";
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
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
/*                                  Strip                                   */
/* ----------------------------------------------------------------------- */

function Strip({
  ticks,
  start,
  end,
  intervalMs,
  style,
  height,
  motionSafe,
}: {
  ticks: HeartbeatTick[];
  start: number;
  end: number;
  intervalMs: number;
  style: HeartbeatStrip;
  height: number;
  motionSafe: boolean;
}) {
  const window = Math.max(1, end - start);
  const pct = (t: number) => r3(((t - start) / window) * 100);
  const reach = style === "bars" ? intervalMs : 0;
  const visible = ticks.filter((t) => t.at >= start - reach && t.at <= end);
  const slot = r3((intervalMs / window) * 100);
  const enter = {
    opacity: 0,
    x: motionSafe ? distances.step : 0,
    scaleY: motionSafe ? 0.4 : 1,
  };
  const transition = {
    x: springs.snap,
    scaleY: springs.snap,
    opacity: { duration: durations.fast, ease: easings.enter },
  };
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{ height }}
    >
      {style === "ticks" ? (
        <span className="absolute inset-x-0 bottom-0 h-px bg-hairline" />
      ) : style === "dots" ? (
        <span className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
      ) : (
        <span className="absolute inset-x-0 inset-y-[15%] rounded-1 bg-surface-2" />
      )}
      <AnimatePresence initial={false}>
        {visible.map((t) => {
          const key = `${t.kind}-${t.at}`;
          if (style === "bars") {
            return (
              <motion.span
                key={key}
                initial={enter}
                animate={{ opacity: 1, x: 0, scaleY: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={transition}
                style={{
                  left: `${pct(t.at - intervalMs)}%`,
                  width: `max(2px, calc(${slot}% - 1px))`,
                  originY: 1,
                  ...(t.kind === "missed"
                    ? { borderColor: "var(--danger)" }
                    : {
                        background:
                          t.kind === "late" ? "var(--warn)" : "var(--hl-ok)",
                      }),
                }}
                className={cn(
                  "absolute inset-y-[15%] rounded-[2px]",
                  t.kind === "missed" && "border border-dashed bg-transparent",
                )}
              />
            );
          }
          if (style === "dots") {
            const size = t.kind === "ontime" ? 6 : 10;
            return (
              <motion.span
                key={key}
                initial={enter}
                animate={{ opacity: 1, x: 0, scaleY: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={transition}
                style={{
                  left: `${pct(t.at)}%`,
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  ...(t.kind === "missed"
                    ? { borderColor: "var(--danger)" }
                    : {
                        background:
                          t.kind === "late" ? "var(--warn)" : "var(--hl-ok)",
                      }),
                }}
                className={cn(
                  "absolute top-1/2 rounded-full",
                  t.kind === "missed" && "border bg-transparent",
                )}
              />
            );
          }
          return (
            <motion.span
              key={key}
              initial={enter}
              animate={{ opacity: 1, x: 0, scaleY: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={transition}
              style={{
                left: `${pct(t.at)}%`,
                originY: 1,
                ...(t.kind === "missed"
                  ? { width: 5, marginLeft: -2.5, borderColor: "var(--danger)" }
                  : {
                      width: 2,
                      marginLeft: -1,
                      background:
                        t.kind === "late" ? "var(--warn)" : "var(--hl-ok)",
                    }),
              }}
              className={cn(
                "absolute bottom-0 rounded-t-[1px]",
                t.kind === "ontime" && "h-[55%]",
                t.kind === "late" && "h-[90%]",
                t.kind === "missed" &&
                  "h-[70%] rounded-[2px] border bg-transparent",
              )}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Run bars                                  */
/* ----------------------------------------------------------------------- */

function RunBars({
  runs,
  kinds,
  motionSafe,
}: {
  runs: HeartbeatBeat[];
  kinds: Map<number, HeartbeatBeatKind>;
  motionSafe: boolean;
}) {
  const max = Math.max(1, ...runs.map((r) => r.durationMs));
  const step = cascade(runs.length);
  return (
    <div
      role="img"
      aria-label={`Last ${runs.length} runs, oldest first: ${runs.map((r) => span(r.durationMs)).join(", ")}`}
      className="flex h-10 items-end gap-[3px]"
    >
      {runs.map((run, i) => {
        const newest = i === runs.length - 1;
        const late = kinds.get(run.at) === "late";
        return (
          <motion.span
            key={run.at}
            initial={motionSafe ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={
              motionSafe
                ? { ...springs.flick, delay: r3(i * step) }
                : { duration: 0 }
            }
            style={{
              height: `${Math.max(8, (run.durationMs / max) * 100)}%`,
              originY: 1,
              background: newest
                ? "var(--accent-bright)"
                : late
                  ? "var(--warn)"
                  : "color-mix(in oklab, var(--ink-3) 55%, transparent)",
            }}
            className="w-full max-w-3 min-w-[3px] rounded-t-[2px]"
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Pause switch                               */
/* ----------------------------------------------------------------------- */

function MonitorSwitch({
  on,
  name,
  disabled,
  motionSafe,
  nodeRef,
  onToggle,
  onKeyDown,
}: {
  on: boolean;
  name: string;
  disabled: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      ref={nodeRef}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Monitor ${name}`}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full border transition-colors",
        on
          ? "border-transparent bg-primary"
          : "border-hairline-strong bg-surface-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-[2px] left-[2px] block size-[10px] rounded-full",
          on ? "bg-primary-foreground" : "bg-ink-3",
        )}
        initial={false}
        animate={{ x: on ? 12 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A ledger of scheduled jobs and their heartbeats. Each row names a job and
 * its interval, then draws its recent beats along a timeline: on-time beats
 * as short marks, late ones amber and taller, missed slots as hollow gaps.
 * When a job reports, its newest beat slides in from the right on
 * `springs.snap` while the header's healthy, late and missing counts roll to
 * their new figures on the same spring. A row expands on `springs.glide` to
 * chart its last runs' durations and count down to its next expected beat;
 * its monitor switch flips on `springs.snap`, and changing the sort or a job's
 * state reorders the rows on `springs.glide`.
 *
 * The rows are one grid with a roving tab stop: Up and Down move, Home and
 * End jump, Space or Enter expands, P pauses or resumes, Right reaches the
 * row's switch and Escape collapses. The sort control is a radio group, the
 * switch a real switch, and every change is announced. Under reduced motion
 * nothing slides, rolls or flips: beats and rows appear in place, panels
 * cross-fade and the counts change at once.
 */
export function HeartbeatLedger({
  jobs = defaultHeartbeatJobs,
  now = defaultHeartbeatNow,
  windowHours = 24,
  strip = "ticks",
  density = "cozy",
  value,
  defaultValue = [],
  onChange,
  paused,
  defaultPaused = defaultHeartbeatPaused,
  onPauseChange,
  sort,
  defaultSort = "status",
  onSortChange,
  runsShown = 12,
  live = true,
  status = "ready",
  onRetry,
  title = "Nightly jobs",
  label,
  height = 520,
  disabled = false,
  className,
}: HeartbeatLedgerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [ownExpanded, setOwnExpanded] = React.useState<string[]>(defaultValue);
  const [ownPaused, setOwnPaused] = React.useState<string[]>(defaultPaused);
  const [ownSort, setOwnSort] = React.useState<HeartbeatSort>(defaultSort);
  const expanded = value ?? ownExpanded;
  const pausedIds = paused ?? ownPaused;
  const order = sort ?? ownSort;

  const [offset, setOffset] = React.useState({ base: now, ms: 0 });
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anchor = React.useRef<{ base: number; at: number } | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const switchNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const sortNodes = React.useRef(new Map<HeartbeatSort, HTMLButtonElement>());
  const prevBeats = React.useRef<Map<string, number> | null>(null);

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* -------------------------------- clock ------------------------------ */

  // The seconds counted since the host last set `now`; they only apply to
  // that same `now`, so a fresh value from the host never carries old drift.
  const drift = live && offset.base === now ? offset.ms : 0;
  const clockNow = now + drift;
  const anyExpanded = expanded.length > 0;

  React.useEffect(() => {
    anchor.current = { base: now, at: Date.now() };
  }, [now]);

  React.useEffect(() => {
    const host = rootRef.current;
    if (!live || !ready || !anyExpanded || !host) return;
    let timer: number | null = null;
    let inView = true;
    const tick = () => {
      const a = anchor.current;
      if (a) setOffset({ base: a.base, ms: Date.now() - a.at });
    };
    const loop = () => {
      tick();
      timer = window.setTimeout(loop, SEC);
    };
    const sync = () => {
      const run = inView && !document.hidden;
      if (run && timer === null) timer = window.setTimeout(loop, 0);
      else if (!run && timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (last) inView = last.isIntersecting;
            sync();
          })
        : null;
    io?.observe(host);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [live, ready, anyExpanded, now]);

  /* ------------------------------ readings ----------------------------- */

  const hours = clamp(windowHours, MIN_WINDOW, MAX_WINDOW);
  const start = clockNow - hours * HOUR;
  const readings = jobs.map((job) =>
    readHeartbeat(job, clockNow, pausedIds.includes(job.id)),
  );
  const sorted = [...readings].sort((a, b) =>
    order === "name"
      ? a.job.name.localeCompare(b.job.name)
      : STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.job.name.localeCompare(b.job.name),
  );
  const summary: HeartbeatSummary = {
    healthy: 0,
    late: 0,
    missing: 0,
    paused: 0,
  };
  for (const r of readings) summary[r.state] += 1;
  const ids = sorted.map((r) => r.job.id);
  const activeId =
    activeRow && ids.includes(activeRow) ? activeRow : (ids[0] ?? null);
  const { row: rowH, strip: stripH } = DENSITY[density] ?? DENSITY.cozy;

  /* ----------------------------- arrivals ------------------------------ */

  // A beat that arrives from the host is announced once, after it lands.
  React.useEffect(() => {
    const next = new Map(jobs.map((j) => [j.id, j.beats.length] as const));
    const prev = prevBeats.current;
    prevBeats.current = next;
    if (!prev) return;
    const arrived = jobs.filter((j) => j.beats.length > (prev.get(j.id) ?? 0));
    if (arrived.length === 0) return;
    const text = arrived
      .map((j) => `${j.name} reported, ${KIND_WORD[lastKind(j)]}`)
      .join(". ");
    const timer = window.setTimeout(() => setAnnouncement(`${text}.`), 0);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  /* ------------------------------ changes ------------------------------ */

  const nameOf = (id: string) => jobs.find((j) => j.id === id)?.name ?? id;

  const toggleExpand = (id: string) => {
    if (!ready) return;
    const open = !expanded.includes(id);
    const next = open ? [...expanded, id] : expanded.filter((x) => x !== id);
    if (value === undefined) setOwnExpanded(next);
    onChange?.(next, { id, expanded: open });
    setAnnouncement(`${nameOf(id)} ${open ? "expanded" : "collapsed"}.`);
  };

  const togglePause = (id: string) => {
    if (inert) return;
    const pause = !pausedIds.includes(id);
    const next = pause ? [...pausedIds, id] : pausedIds.filter((x) => x !== id);
    if (paused === undefined) setOwnPaused(next);
    onPauseChange?.(next, { id, paused: pause });
    setAnnouncement(
      `${nameOf(id)} ${pause ? "paused" : "resumed"}. ${
        summary.healthy
      } healthy, ${summary.late} late, ${summary.missing} missing.`,
    );
  };

  const setSort = (next: HeartbeatSort) => {
    if (inert || next === order) return;
    if (sort === undefined) setOwnSort(next);
    onSortChange?.(next);
    setAnnouncement(`Sorted by ${next}.`);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const focusRow = (id: string | undefined) => {
    if (id) rowNodes.current.get(id)?.focus({ preventScroll: false });
  };

  const rowTarget = (key: string, index: number): string | undefined => {
    const to =
      key === "ArrowDown"
        ? index + 1
        : key === "ArrowUp"
          ? index - 1
          : key === "Home"
            ? 0
            : key === "End"
              ? ids.length - 1
              : null;
    return to === null ? undefined : ids[clamp(to, 0, ids.length - 1)];
  };

  const onRowKey = (event: React.KeyboardEvent, id: string, index: number) => {
    if (event.target !== event.currentTarget) return;
    const target = rowTarget(event.key, index);
    if (target) {
      event.preventDefault();
      focusRow(target);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleExpand(id);
    } else if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      togglePause(id);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      switchNodes.current.get(id)?.focus();
    } else if (event.key === "Escape" && expanded.includes(id)) {
      event.preventDefault();
      toggleExpand(id);
    }
  };

  const onSwitchKey = (
    event: React.KeyboardEvent,
    id: string,
    index: number,
  ) => {
    const target = rowTarget(event.key, index);
    if (target) {
      event.preventDefault();
      focusRow(target);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      focusRow(id);
    } else if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      togglePause(id);
    }
  };

  const onSortKey = (event: React.KeyboardEvent) => {
    const options: HeartbeatSort[] = ["status", "name"];
    const i = options.indexOf(order);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else return;
    event.preventDefault();
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    setSort(next);
    sortNodes.current.get(next)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const axisMid =
    hours % 2 === 0 ? `${hours / 2}h` : `${(hours / 2).toFixed(1)}h`;
  const step = cascade(Math.min(sorted.length, 10));

  const renderDetail = (reading: HeartbeatReading) => {
    const { job, last, due, state } = reading;
    const kinds = new Map(
      reading.ticks.filter((t) => t.beat).map((t) => [t.at, t.kind] as const),
    );
    const runs = reading.ticks
      .filter((t): t is HeartbeatTick & { beat: HeartbeatBeat } => !!t.beat)
      .map((t) => t.beat)
      .slice(-Math.max(1, runsShown));
    const remaining = due === null ? null : due - clockNow;
    const longest = runs.reduce((m, r) => Math.max(m, r.durationMs), 0);
    return (
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-hairline px-3 py-3 pl-[2.5rem] @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(11rem,auto)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Last {runs.length} {runs.length === 1 ? "run" : "runs"}
          </p>
          {runs.length > 0 ? (
            <>
              <RunBars runs={runs} kinds={kinds} motionSafe={motionSafe} />
              <p className="text-[11px] text-ink-2">
                median{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {span(median(runs.map((r) => r.durationMs)))}
                </span>{" "}
                · longest{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {span(longest)}
                </span>
                {job.runner ? (
                  <span className="text-ink-3"> · on {job.runner}</span>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-ink-3">
              No runs yet. The first beat starts the chart.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {state === "paused"
              ? "Paused"
              : remaining !== null && remaining < 0
                ? "Overdue"
                : "Next expected"}
          </p>
          {state === "paused" ? (
            <p className="text-[13px] text-ink-2">
              No beats expected while paused.
            </p>
          ) : remaining === null || due === null ? (
            <p className="text-[13px] text-ink-2">
              Waiting for the first beat.
            </p>
          ) : (
            <p
              className="font-mono text-lg tabular-nums"
              style={{ color: remaining < 0 ? STATE_COLOR[state] : undefined }}
            >
              <span className="sr-only">
                {remaining < 0 ? "overdue by " : "in "}
              </span>
              {remaining < 0 ? "-" : ""}
              {span(Math.abs(remaining))}
              <span className="ml-1.5 text-[11px] text-ink-3">
                {remaining < 0 ? "since" : "at"} {clock(due)} UTC
              </span>
            </p>
          )}
          {last ? (
            <p className="text-[11px] text-ink-3">
              Last beat {clock(last.at)} UTC · took{" "}
              <span className="font-mono tabular-nums">
                {span(last.durationMs)}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  const renderRow = (reading: HeartbeatReading, index: number) => {
    const { job, state, ticks, last } = reading;
    const open = expanded.includes(job.id);
    const isPaused = state === "paused";
    const detailId = `${uid}-detail-${job.id}`;
    return (
      <motion.div
        key={job.id}
        role="rowgroup"
        layout={motionSafe ? "position" : false}
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          y: motionSafe
            ? { ...springs.glide, delay: r3(Math.min(index, 10) * step) }
            : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className={cn(
          "rounded-2 border border-transparent transition-colors",
          open && "border-hairline bg-surface-1",
        )}
      >
        <div
          ref={(node) => {
            if (node) rowNodes.current.set(job.id, node);
            else rowNodes.current.delete(job.id);
          }}
          role="row"
          aria-rowindex={index + 2}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-describedby={hintId}
          tabIndex={job.id === activeId ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setActiveRow(job.id);
          }}
          onClick={(event) => {
            // The switch sits inside the row; its press is its own.
            const target = event.target as HTMLElement;
            if (target.closest('[role="switch"]')) return;
            toggleExpand(job.id);
          }}
          onKeyDown={(event) => onRowKey(event, job.id, index)}
          style={{ minHeight: rowH }}
          className={cn(
            "grid cursor-pointer grid-cols-[1.25rem_minmax(5rem,8rem)_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-2 px-2 transition-colors hover:bg-surface-2 @min-[40rem]:grid-cols-[1.25rem_minmax(9rem,14rem)_minmax(0,1fr)_6.25rem_auto] @min-[40rem]:gap-x-3",
            isPaused && "text-ink-2",
            FOCUS_RING,
            "focus-visible:-outline-offset-2",
          )}
        >
          <span role="gridcell" className="flex items-center justify-center">
            <motion.span
              aria-hidden
              className="block text-ink-3"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </span>
          <span role="gridcell" className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium text-foreground">
              {job.name}
            </span>
            <span className="truncate font-mono text-[10px] text-ink-3">
              {every(job.intervalMs)}
              {job.runner ? (
                <span className="hidden @min-[40rem]:inline">
                  {" "}
                  · {job.runner}
                </span>
              ) : null}
            </span>
          </span>
          <span role="gridcell" className="min-w-0">
            <span className="sr-only">
              {last
                ? `Last beat ${clock(last.at)} UTC, ${KIND_WORD[lastKind(job)]}. ${
                    ticks.filter((t) => t.at >= start && t.at <= clockNow)
                      .length
                  } slots in the window, ${
                    ticks.filter(
                      (t) =>
                        t.kind === "missed" &&
                        t.at >= start &&
                        t.at <= clockNow,
                    ).length
                  } missed.`
                : "No beats yet."}
            </span>
            <Strip
              ticks={ticks}
              start={start}
              end={clockNow}
              intervalMs={Math.max(SEC, job.intervalMs)}
              style={strip}
              height={stripH}
              motionSafe={motionSafe}
            />
          </span>
          <span
            role="gridcell"
            className="flex items-center justify-end gap-1.5 @min-[40rem]:justify-start"
          >
            <span
              aria-hidden
              className="block size-2 shrink-0 rounded-full"
              style={{ background: STATE_COLOR[state] }}
            />
            <span className="sr-only @min-[40rem]:not-sr-only">
              <span className="text-[11px] whitespace-nowrap">
                {STATE_WORD[state]}
                {state === "late" && reading.due !== null ? (
                  <span className="text-ink-3">
                    {" "}
                    {span(clockNow - reading.due)}
                  </span>
                ) : state === "missing" && reading.overdue > 1 ? (
                  <span className="text-ink-3"> {reading.overdue} slots</span>
                ) : null}
              </span>
            </span>
          </span>
          <span role="gridcell" className="flex items-center">
            <MonitorSwitch
              on={!isPaused}
              name={job.name}
              disabled={inert}
              motionSafe={motionSafe}
              nodeRef={(node) => {
                if (node) switchNodes.current.set(job.id, node);
                else switchNodes.current.delete(job.id);
              }}
              onToggle={() => togglePause(job.id)}
              onKeyDown={(event) => onSwitchKey(event, job.id, index)}
            />
          </span>
        </div>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="detail"
              id={detailId}
              role="row"
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
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : {
                      height: { duration: 0 },
                      opacity: { duration: durations.fast },
                    }
              }
              className="overflow-hidden"
            >
              <div role="gridcell" aria-colspan={5}>
                {renderDetail(reading)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  };

  const counts: { state: HeartbeatState; word: string }[] = [
    { state: "healthy", word: "healthy" },
    { state: "late", word: "late" },
    { state: "missing", word: "missing" },
  ];

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
        ["--hl-ok" as string]:
          "color-mix(in oklab, var(--success) 78%, var(--ink-3))",
      }}
    >
      <p id={hintId} className="sr-only">
        Space expands. P pauses or resumes. Right arrow reaches the switch.
      </p>

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ready
              ? `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} · last ${hours}h${
                  summary.paused > 0 ? ` · ${summary.paused} paused` : ""
                }`
              : status === "loading"
                ? "Loading"
                : "Unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {ready ? (
            <p className="flex items-center gap-3 text-[12px] text-ink-2">
              <span className="sr-only">
                {summary.healthy} healthy, {summary.late} late,{" "}
                {summary.missing} missing
              </span>
              {counts.map(({ state, word }) => (
                <span
                  key={state}
                  aria-hidden
                  className="flex items-center gap-1.5"
                >
                  <span
                    className="block size-2 rounded-full"
                    style={{ background: STATE_COLOR[state] }}
                  />
                  <Roll
                    value={summary[state]}
                    motionSafe={motionSafe}
                    className="font-mono text-[13px] text-foreground"
                  />
                  <span className="hidden @min-[30rem]:inline">{word}</span>
                </span>
              ))}
            </p>
          ) : (
            <span
              aria-hidden
              className="h-4 w-32 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            />
          )}
          <div
            role="radiogroup"
            aria-label="Sort"
            aria-disabled={inert || undefined}
            className="flex shrink-0 items-center gap-0.5 rounded-3 border border-hairline-strong p-0.5"
          >
            <LayoutGroup id={`${uid}-sort`}>
              {(["status", "name"] as HeartbeatSort[]).map((option) => {
                const on = order === option;
                return (
                  <button
                    key={option}
                    ref={(node) => {
                      if (node) sortNodes.current.set(option, node);
                      else sortNodes.current.delete(option);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={inert || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setSort(option)}
                    onKeyDown={onSortKey}
                    className={cn(
                      "relative inline-flex h-6 items-center rounded-2 px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                      on
                        ? "text-foreground"
                        : "text-ink-3 hover:text-foreground",
                      inert && "cursor-not-allowed",
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        aria-hidden
                        layoutId={motionSafe ? "indicator" : undefined}
                        transition={springs.snap}
                        className="absolute inset-0 rounded-2 bg-surface-2"
                      />
                    ) : null}
                    <span className="relative">{option}</span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The jobs didn&apos;t load.
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
        ) : status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1 px-2 py-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                style={{ height: rowH }}
                className="grid grid-cols-[1.25rem_minmax(5rem,8rem)_minmax(0,1fr)_auto] items-center gap-x-3 px-2"
              >
                <span />
                <span
                  className="h-3 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${60 + ((i * 17) % 35)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
                <span
                  className="rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ height: stripH, animationDelay: `${i * 90}ms` }}
                />
                <span
                  className="h-4 w-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Activity aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-foreground">No jobs yet.</p>
            <p className="max-w-[28ch] text-[12px] text-ink-3">
              Point a job at the heartbeat endpoint and its first beat appears
              here.
            </p>
          </div>
        ) : (
          <div
            role="grid"
            aria-label={`${title}, ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`}
            aria-rowcount={sorted.length + 1}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              role="row"
              aria-rowindex={1}
              className="grid shrink-0 grid-cols-[1.25rem_minmax(5rem,8rem)_minmax(0,1fr)_auto_auto] items-center gap-x-2 px-4 py-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:grid-cols-[1.25rem_minmax(9rem,14rem)_minmax(0,1fr)_6.25rem_auto] @min-[40rem]:gap-x-3"
            >
              <span role="columnheader" className="sr-only">
                Expand
              </span>
              <span role="columnheader">Job</span>
              <span
                role="columnheader"
                className="flex items-center justify-between"
              >
                <span>{hours}h ago</span>
                <span aria-hidden className="hidden @min-[30rem]:inline">
                  {axisMid}
                </span>
                <span>now</span>
              </span>
              <span
                role="columnheader"
                className="text-right @min-[40rem]:text-left"
              >
                <span className="sr-only @min-[40rem]:not-sr-only">State</span>
              </span>
              <span role="columnheader" className="w-7">
                <span className="sr-only">Monitor</span>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              <LayoutGroup id={`${uid}-rows`}>
                <div className="flex flex-col gap-0.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {sorted.map((reading, i) => renderRow(reading, i))}
                  </AnimatePresence>
                </div>
              </LayoutGroup>
            </div>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
