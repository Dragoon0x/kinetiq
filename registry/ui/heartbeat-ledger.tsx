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
  Bell,
  BellOff,
  CalendarClock,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type HeartbeatBeatStatus = "ok" | "late" | "failed";

export type HeartbeatBeat = {
  id: string;
  /** When the job checked in, ms. */
  at: number;
  /** On time, late (inside its grace), or reported a failure. */
  status: HeartbeatBeatStatus;
  /** How long the run took, ms; sets the bar's height. */
  duration: number;
};

export type HeartbeatJob = {
  id: string;
  name: string;
  /** The schedule in words, e.g. "Nightly at 02:00". */
  schedule: string;
  /** Expected time between check-ins, ms. */
  every: number;
  /** How long past due a check-in may arrive before the job counts as missed, ms. */
  grace: number;
  /** The last check-in, ms. @default the newest beat's time */
  lastCheckIn?: number;
  owner: { name: string; initials: string };
  /** Check-ins, oldest first. */
  beats: HeartbeatBeat[];
  /** A typical run, ms; a bar this long is three quarters tall. @default the median beat */
  typical?: number;
};

export type HeartbeatDensity = "compact" | "cozy" | "roomy";
export type HeartbeatStatus = "ready" | "loading" | "error";

export type HeartbeatLedgerProps = {
  /** How many beats each history strip shows at wide widths; narrow widths always show the last ten. @default 24 */
  stripLength?: number;
  /** Row height and bar size: compact, cozy or roomy. @default "cozy" */
  density?: HeartbeatDensity;
  /** On-time ticks, grace rings and the clock, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The jobs. @default defaultHeartbeatJobs (six Fernworks jobs) */
  jobs?: HeartbeatJob[];
  /** The time to judge every deadline against, ms. The host advances it; the clock is never read. @default defaultHeartbeatNow */
  now?: number;
  /** Controlled paused job ids. */
  paused?: string[];
  /** Initially paused job ids when uncontrolled. @default [] */
  defaultPaused?: string[];
  /** Fires from the button or the P key, with the job and whether it is now paused. */
  onPause?: (job: HeartbeatJob, paused: boolean) => void;
  /** Controlled muted job ids. */
  muted?: string[];
  /** Initially muted job ids when uncontrolled. @default [] */
  defaultMuted?: string[];
  /** Fires from the button or the M key, with the job and whether it is now muted. */
  onMute?: (job: HeartbeatJob, muted: boolean) => void;
  /** A run was opened: Enter on the job, or a beat picked in its strip. Null when the job has never run. */
  onOpenRun?: (job: HeartbeatJob, beat: HeartbeatBeat | null) => void;
  /** Whether the check-ins have arrived. @default "ready" */
  status?: HeartbeatStatus;
  /** Retry was pressed after the check-ins failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Fernworks nightly" */
  title?: string;
  /** Formats a time for the clock and the tooltips. @default "HH:MM" in UTC */
  formatTime?: (ms: number) => string;
  /** Height of the surface, px; rows scroll under the pinned header. @default 520 */
  height?: number;
  /** Nothing can be paused, muted or opened; the surface dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Tuesday 13 October 2026, 01:52 UTC: just before the night's big jobs. */
export const defaultHeartbeatNow = Date.UTC(2026, 9, 13, 1, 52);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type HeartbeatPlan = {
  id: string;
  name: string;
  schedule: string;
  every: number;
  grace: number;
  owner: { name: string; initials: string };
  /** The first scheduled run, ms; run k is due at anchor + k × every. */
  anchor: number;
  /** A typical run, ms. */
  typical: number;
  seed: number;
  /** Runs that never check in (by index). */
  skip?: number[];
  /** Runs that report a failure. */
  fail?: number[];
  /** Runs that check in late, with how late, ms. */
  late?: Record<number, number>;
};

/**
 * The beat a planned run produces, or null if it never checks in. Seeded by
 * the job and the run index, so the history renders the same everywhere and a
 * host that replays it (a demo, a test) sees the same night.
 */
export function heartbeatRun(
  plan: HeartbeatPlan,
  k: number,
): HeartbeatBeat | null {
  if (plan.skip?.includes(k)) return null;
  const rand = mulberry32(plan.seed * 7919 + k * 104729);
  const lateBy = plan.late?.[k];
  const jitter = Math.round(rand() * 0.06 * Math.min(plan.every, HOUR));
  const at = plan.anchor + k * plan.every + (lateBy ?? jitter);
  const duration = Math.round(plan.typical * (0.7 + rand() * 0.6));
  return {
    id: `${plan.id}-${k}`,
    at,
    status: plan.fail?.includes(k) ? "failed" : lateBy ? "late" : "ok",
    duration,
  };
}

/** Every beat a plan has produced by `now`, oldest first, the last `keep` of them. */
export function heartbeatBeats(
  plan: HeartbeatPlan,
  now: number,
  keep = 48,
): HeartbeatBeat[] {
  const out: HeartbeatBeat[] = [];
  const last = Math.floor((now - plan.anchor) / plan.every);
  for (let k = Math.max(0, last - keep - 4); k <= last + 1; k += 1) {
    const beat = heartbeatRun(plan, k);
    if (beat && beat.at <= now) out.push(beat);
  }
  return out.slice(-keep);
}

/**
 * Fernworks' night: an invoice export every quarter hour, a nightly ledger
 * close that runs late tonight, an hourly search reindex, a seed inventory
 * sync that failed once, a nightly backup that is inside its grace at 01:52
 * and will miss, and a certificate check that is paused.
 */
export const defaultHeartbeatPlans: HeartbeatPlan[] = [
  {
    id: "invoice-export",
    name: "Invoice export",
    schedule: "Every 15 min",
    every: 15 * MIN,
    grace: 5 * MIN,
    owner: { name: "Ines Park", initials: "IP" },
    anchor: defaultHeartbeatNow - 40 * 15 * MIN - 6 * MIN,
    typical: 52_000,
    seed: 11,
    fail: [27],
  },
  {
    id: "ledger-close",
    name: "Ledger close",
    schedule: "Nightly at 02:00",
    every: DAY,
    grace: 20 * MIN,
    owner: { name: "Tomas Reyes", initials: "TR" },
    anchor: Date.UTC(2026, 8, 1, 2, 0),
    typical: 7 * MIN,
    seed: 23,
    skip: [30],
    late: { 21: 12 * MIN, 42: 11 * MIN },
  },
  {
    id: "search-reindex",
    name: "Search reindex",
    schedule: "Hourly at :05",
    every: HOUR,
    grace: 10 * MIN,
    owner: { name: "Ada Moreau", initials: "AM" },
    anchor: Date.UTC(2026, 9, 11, 0, 5),
    typical: 4 * MIN,
    seed: 37,
  },
  {
    id: "seed-sync",
    name: "Seed inventory sync",
    schedule: "Every 30 min",
    every: 30 * MIN,
    grace: 10 * MIN,
    owner: { name: "Kofi Mensah", initials: "KM" },
    anchor: Date.UTC(2026, 9, 12, 0, 10),
    typical: 2 * MIN,
    seed: 41,
    fail: [38],
    late: { 44: 6 * MIN },
  },
  {
    id: "backup-snapshot",
    name: "Backup snapshot",
    schedule: "Nightly at 01:30",
    every: DAY,
    grace: 30 * MIN,
    owner: { name: "Mara Lind", initials: "ML" },
    anchor: Date.UTC(2026, 8, 1, 1, 30),
    typical: 18 * MIN,
    seed: 53,
    skip: [17, 42],
    late: { 9: 22 * MIN },
  },
  {
    id: "cert-check",
    name: "Certificate check",
    schedule: "Every 6 hours",
    every: 6 * HOUR,
    grace: 30 * MIN,
    owner: { name: "Joel Achebe", initials: "JA" },
    anchor: Date.UTC(2026, 9, 1, 3, 0),
    typical: 40_000,
    seed: 67,
  },
];

/** A plan as a job at `now`: its beats so far and its last check-in. */
export function heartbeatJobAt(plan: HeartbeatPlan, now: number): HeartbeatJob {
  const beats = heartbeatBeats(plan, now);
  return {
    id: plan.id,
    name: plan.name,
    schedule: plan.schedule,
    every: plan.every,
    grace: plan.grace,
    owner: plan.owner,
    typical: plan.typical,
    beats,
    lastCheckIn: beats[beats.length - 1]?.at,
  };
}

/** The six jobs as they stand at defaultHeartbeatNow. */
export const defaultHeartbeatJobs: HeartbeatJob[] = defaultHeartbeatPlans.map(
  (plan) => heartbeatJobAt(plan, defaultHeartbeatNow),
);

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pad = (n: number) => String(n).padStart(2, "0");
const utcClock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};
const spanWords = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"}`;
};
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

type Geometry = { row: number; bar: number; pitch: number; slot: number };
const DENSITY: Record<HeartbeatDensity, Geometry> = {
  compact: { row: 44, bar: 14, pitch: 7, slot: 4 },
  cozy: { row: 52, bar: 18, pitch: 9, slot: 5 },
  roomy: { row: 60, bar: 22, pitch: 11, slot: 7 },
};

type Slot =
  | { kind: "beat"; key: string; beat: HeartbeatBeat }
  | { kind: "gap"; key: string; runs: number; pending: boolean };

type Phase = "waiting" | "grace" | "lapsed" | "paused" | "never";

type JobView = {
  job: HeartbeatJob;
  slots: Slot[];
  last: HeartbeatBeat | null;
  due: number;
  phase: Phase;
  /** Share of the grace still left, 0–1, while in grace. */
  remain: number;
  typical: number;
  counts: { ok: number; late: number; failed: number; missed: number };
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 1;
}

/**
 * A job at `now`: its strip (beats with the gaps between them that were
 * longer than a run and its grace), its deadline and where it stands.
 * Gaps are keyed by the beat before them, so a pending gap at the head keeps
 * its key when the late check-in finally lands after it.
 */
function viewOf(
  job: HeartbeatJob,
  now: number,
  paused: boolean,
  keep: number,
): JobView {
  const beats = job.beats;
  const last = beats[beats.length - 1] ?? null;
  const lastAt = job.lastCheckIn ?? last?.at ?? null;
  const slots: Slot[] = [];
  const counts = { ok: 0, late: 0, failed: 0, missed: 0 };
  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    if (!beat) continue;
    const prev = beats[i - 1];
    if (prev && beat.at - prev.at > job.every + job.grace) {
      const runs = Math.max(1, Math.round((beat.at - prev.at) / job.every) - 1);
      slots.push({ kind: "gap", key: `gap-${prev.id}`, runs, pending: false });
    }
    slots.push({ kind: "beat", key: beat.id, beat });
  }
  const due = lastAt === null ? now : lastAt + job.every;
  let phase: Phase = "waiting";
  let remain = 1;
  if (paused) phase = "paused";
  else if (lastAt === null) phase = "never";
  else if (now > due + job.grace) phase = "lapsed";
  else if (now >= due) {
    phase = "grace";
    remain = clamp(1 - (now - due) / Math.max(1, job.grace), 0, 1);
  }
  if (phase === "lapsed" && last) {
    const runs = Math.max(1, Math.floor((now - (lastAt ?? now)) / job.every));
    slots.push({ kind: "gap", key: `gap-${last.id}`, runs, pending: true });
  }
  const shown = slots.slice(-keep);
  for (const s of shown) {
    if (s.kind === "gap") counts.missed += s.runs;
    else counts[s.beat.status] += 1;
  }
  return {
    job,
    slots: slots.slice(-(keep + 1)),
    last,
    due,
    phase,
    remain: r3(remain),
    typical: job.typical ?? median(beats.map((b) => b.duration)),
    counts,
  };
}

/* ----------------------------------------------------------------------- */
/*                                 The ring                                */
/* ----------------------------------------------------------------------- */

const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The grace that is left, as a ring that runs down on a linear tween between
 * readings of `now`. Off screen or under reduced motion it jumps.
 */
function GraceRing({ remain, live }: { remain: number; live: boolean }) {
  const mv = useMotionValue(remain);
  const offset = useTransform(mv, (v) => r3(RING_C * (1 - clamp(v, 0, 1))));
  React.useEffect(() => {
    if (!live) {
      mv.jump(remain);
      return;
    }
    const controls = animate(mv, remain, { duration: 0.95, ease: "linear" });
    return () => controls.stop();
  }, [live, mv, remain]);
  const low = remain < 0.3;
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 -rotate-90">
      <circle
        cx={10}
        cy={10}
        r={RING_R}
        fill="none"
        strokeWidth={2}
        className="stroke-hairline-strong"
      />
      <motion.circle
        cx={10}
        cy={10}
        r={RING_R}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={r3(RING_C)}
        style={{ strokeDashoffset: offset }}
        className={cn(
          "transition-colors duration-300",
          low ? "stroke-warn" : "stroke-(--hl-accent)",
        )}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The strip                                */
/* ----------------------------------------------------------------------- */

function Strip({
  view,
  geo,
  motionSafe,
  cursor,
  onPick,
  formatTime,
}: {
  view: JobView;
  geo: Geometry;
  motionSafe: boolean;
  cursor: string | null;
  onPick: (beat: HeartbeatBeat) => void;
  formatTime: (ms: number) => string;
}) {
  const n = view.slots.length;
  return (
    <div
      className="relative h-full overflow-hidden [contain:paint]"
      style={{ height: geo.bar + 4 }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-hairline"
      />
      <AnimatePresence initial={false}>
        {view.slots.map((slot, i) => {
          const k = n - 1 - i;
          const x = -k * geo.pitch;
          if (slot.kind === "gap") {
            return (
              <motion.span
                key={slot.key}
                aria-hidden
                title={
                  slot.pending
                    ? "Missed: no check-in yet"
                    : `Missed ${plural(slot.runs, "run", "runs")}`
                }
                className="absolute right-0 bottom-0 rounded-[1.5px] border border-dashed border-[color-mix(in_oklab,var(--danger)_70%,transparent)] bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--danger)_30%,transparent)_0_1px,transparent_1px_3px)]"
                style={{ width: geo.slot, height: geo.bar }}
                initial={{ x, y: motionSafe ? -10 : 0, opacity: 0 }}
                animate={{ x, y: 0, opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  y: motionSafe ? springs.recoil : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              />
            );
          }
          const beat = slot.beat;
          const h = Math.round(
            clamp((beat.duration / Math.max(1, view.typical)) * 0.75, 0.3, 1) *
              geo.bar,
          );
          const picked = cursor === beat.id;
          return (
            <motion.span
              key={slot.key}
              aria-hidden
              title={`${formatTime(beat.at)} · ${beat.status === "ok" ? "on time" : beat.status} · ${spanWords(beat.duration)}`}
              onClick={(event) => {
                event.stopPropagation();
                onPick(beat);
              }}
              className={cn(
                "absolute right-0 bottom-0 cursor-pointer rounded-t-[1.5px] transition-colors",
                beat.status === "failed"
                  ? "bg-danger"
                  : beat.status === "late"
                    ? "bg-warn"
                    : "bg-(--hl-accent)",
                picked &&
                  "outline-2 outline-offset-1 outline-ring outline-solid",
              )}
              style={{ width: geo.slot, height: h }}
              initial={{ x, y: motionSafe ? -10 : 0, opacity: 0 }}
              animate={{ x, y: 0, opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{
                x: motionSafe ? springs.glide : { duration: 0 },
                y: motionSafe ? springs.recoil : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

const COLS = ["job", "owner", "history", "next", "pause", "mute"] as const;
type Col = (typeof COLS)[number];

/**
 * A monitor for scheduled jobs that check in. Each row is a job, its owner,
 * a strip of its recent check-ins — slim bars whose height is the run's
 * length against its typical run, on time in the accent, late in amber,
 * failed in red, and a hatched slot wherever a run never arrived — and its
 * next deadline.
 *
 * A check-in drops into the head of its strip on `springs.recoil` while the
 * strip rolls one slot left on `springs.glide` and the oldest beat slips off
 * the tail. Past its deadline a job wears a ring that runs down its grace on
 * a linear tween between readings of `now`; if the grace runs out, the row
 * tips into a warning tint that sweeps in from the left on glide, its dot
 * becomes a warning glyph on snap, and a missed gap opens at the head of its
 * strip. Time is the `now` prop: the ledger never reads the clock.
 *
 * It is a `role="grid"` with one roving cell: arrows move, Home and End go
 * to the row's ends, Ctrl with Home or End to the corners. P pauses the
 * focused job, M mutes it, Enter on a job opens its last run, and Enter on a
 * strip steps into it (Left and Right pick a beat, Enter opens it, Escape
 * steps out). Under reduced motion beats appear in place, the ring and the
 * tint jump, and every state still shows.
 */
export function HeartbeatLedger({
  stripLength = 24,
  density = "cozy",
  accent = "var(--accent-bright)",
  jobs = defaultHeartbeatJobs,
  now = defaultHeartbeatNow,
  paused,
  defaultPaused = [],
  onPause,
  muted,
  defaultMuted = [],
  onMute,
  onOpenRun,
  status = "ready",
  onRetry,
  title = "Fernworks nightly",
  formatTime = utcClock,
  height = 520,
  disabled = false,
  className,
}: HeartbeatLedgerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const keep = clamp(Math.round(stripLength), 4, 60);
  const ready = status === "ready";

  const [ownPaused, setOwnPaused] = React.useState<string[]>(defaultPaused);
  const [ownMuted, setOwnMuted] = React.useState<string[]>(defaultMuted);
  const pausedIds = paused ?? ownPaused;
  const mutedIds = muted ?? ownMuted;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);

  const views = React.useMemo(
    () => jobs.map((job) => viewOf(job, now, pausedIds.includes(job.id), keep)),
    [jobs, now, pausedIds, keep],
  );

  const summary = React.useMemo(() => {
    let late = 0;
    let missed = 0;
    let due = 0;
    for (const v of views) {
      if (v.phase === "lapsed") missed += 1;
      else if (v.phase === "grace") due += 1;
      else if (v.last?.status === "late" && v.phase === "waiting") late += 1;
    }
    return { late, missed, due };
  }, [views]);

  /* ----------------------- announcements from data ---------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  // A lapse comes from `now`, not from a press: it is announced from the
  // render that sees it, once, with state carried from the previous render.
  const lapsedKey = views
    .filter((v) => v.phase === "lapsed")
    .map((v) => v.job.id)
    .join(",");
  const [seenLapses, setSeenLapses] = React.useState(lapsedKey);
  if (seenLapses !== lapsedKey) {
    const before = new Set(seenLapses.split(",").filter(Boolean));
    const fresh = views.filter(
      (v) => v.phase === "lapsed" && !before.has(v.job.id),
    );
    setSeenLapses(lapsedKey);
    if (fresh.length) {
      setAnnouncement(
        `${fresh.map((v) => v.job.name).join(", ")} missed ${fresh.length === 1 ? "its" : "their"} check-in.`,
      );
    }
  }

  /* ------------------------------- actions ------------------------------ */

  const togglePause = (job: HeartbeatJob) => {
    if (disabled) return;
    const next = !pausedIds.includes(job.id);
    const ids = next
      ? [...pausedIds, job.id]
      : pausedIds.filter((id) => id !== job.id);
    if (paused === undefined) setOwnPaused(ids);
    onPause?.(job, next);
    setAnnouncement(`${job.name} ${next ? "paused" : "resumed"}.`);
  };

  const toggleMute = (job: HeartbeatJob) => {
    if (disabled) return;
    const next = !mutedIds.includes(job.id);
    const ids = next
      ? [...mutedIds, job.id]
      : mutedIds.filter((id) => id !== job.id);
    if (muted === undefined) setOwnMuted(ids);
    onMute?.(job, next);
    setAnnouncement(`Alerts for ${job.name} ${next ? "muted" : "back on"}.`);
  };

  const openRun = (job: HeartbeatJob, beat: HeartbeatBeat | null) => {
    if (disabled) return;
    onOpenRun?.(job, beat);
    setAnnouncement(
      beat
        ? `Opened ${job.name}, run at ${formatTime(beat.at)}.`
        : `${job.name} has not run yet.`,
    );
  };

  /* ------------------------------ keyboard ------------------------------ */

  const [active, setActive] = React.useState<{ row: string; col: Col }>({
    row: "",
    col: "job",
  });
  const [beatMode, setBeatMode] = React.useState<{
    row: string;
    beat: string;
  } | null>(null);
  const cells = React.useRef(new Map<string, HTMLElement>());
  const rowIds = views.map((v) => v.job.id);
  const activeRow = rowIds.includes(active.row) ? active.row : rowIds[0];
  const activeCol = active.col;

  const bindCell = React.useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) cells.current.set(key, node);
      else cells.current.delete(key);
    },
    [],
  );

  const visibleCols = (row: string) =>
    COLS.filter((c) => {
      const node = cells.current.get(`${row}:${c}`);
      return node ? node.getClientRects().length > 0 : false;
    });

  const focusCell = (row: string, col: Col) => {
    setActive({ row, col });
    cells.current.get(`${row}:${col}`)?.focus();
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || !activeRow) return;
    const view = views.find((v) => v.job.id === activeRow);
    if (!view) return;
    const job = view.job;

    if (beatMode && beatMode.row === activeRow) {
      const beats = view.slots
        .filter((s): s is Extract<Slot, { kind: "beat" }> => s.kind === "beat")
        .map((s) => s.beat);
      const at = beats.findIndex((b) => b.id === beatMode.beat);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next =
          beats[
            clamp(
              at + (event.key === "ArrowLeft" ? -1 : 1),
              0,
              beats.length - 1,
            )
          ];
        if (next) {
          setBeatMode({ row: activeRow, beat: next.id });
          setAnnouncement(
            `${formatTime(next.at)}, ${next.status === "ok" ? "on time" : next.status}, ${spanWords(next.duration)}.`,
          );
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const beat = beats[at];
        if (beat) openRun(job, beat);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setBeatMode(null);
        setAnnouncement("Left the strip.");
        return;
      }
    }

    const cols = visibleCols(activeRow);
    const c = Math.max(0, cols.indexOf(activeCol));
    const r = rowIds.indexOf(activeRow);
    const mod = event.ctrlKey || event.metaKey;
    const go = (rr: number, col: Col | undefined) => {
      const row = rowIds[clamp(rr, 0, rowIds.length - 1)];
      if (!row || !col) return;
      setBeatMode(null);
      focusCell(row, col);
    };

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go(r, cols[Math.min(cols.length - 1, c + 1)]);
        return;
      case "ArrowLeft":
        event.preventDefault();
        go(r, cols[Math.max(0, c - 1)]);
        return;
      case "ArrowDown":
        event.preventDefault();
        go(r + 1, activeCol);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(r - 1, activeCol);
        return;
      case "Home":
        event.preventDefault();
        go(mod ? 0 : r, cols[0]);
        return;
      case "End":
        event.preventDefault();
        go(mod ? rowIds.length - 1 : r, cols[cols.length - 1]);
        return;
      case "p":
      case "P":
        if (mod || event.altKey) return;
        event.preventDefault();
        togglePause(job);
        return;
      case "m":
      case "M":
        if (mod || event.altKey) return;
        event.preventDefault();
        toggleMute(job);
        return;
      case "Enter":
        if (activeCol === "history") {
          event.preventDefault();
          if (view.last) {
            setBeatMode({ row: activeRow, beat: view.last.id });
            setAnnouncement(
              `In the strip. Left and Right pick a run, Enter opens it, Escape steps out. ${formatTime(view.last.at)}, ${view.last.status === "ok" ? "on time" : view.last.status}.`,
            );
          }
          return;
        }
        if (
          activeCol === "job" ||
          activeCol === "next" ||
          activeCol === "owner"
        ) {
          event.preventDefault();
          openRun(job, view.last);
        }
        return;
      default:
        return;
    }
  };

  /* ------------------------------- layout ------------------------------- */

  const template =
    "grid grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'job_next_next'_'history_history_actions'] gap-x-3 gap-y-2 @min-[34rem]/heartbeat-ledger:[grid-template-areas:'job_owner_history_next_actions'] @min-[34rem]/heartbeat-ledger:grid-cols-[minmax(8.5rem,1fr)_1.75rem_minmax(0,var(--hl-strip))_6.75rem_3.75rem] @min-[34rem]/heartbeat-ledger:gap-y-0 @min-[60rem]/heartbeat-ledger:grid-cols-[minmax(9rem,1fr)_8.5rem_minmax(0,var(--hl-strip))_8rem_3.75rem]";

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" aria-label="Loading check-ins">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className={cn(
                template,
                "items-center border-b border-hairline px-4 py-2.5",
              )}
            >
              <div className="flex flex-col gap-1.5 [grid-area:job]">
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${50 + ((i * 23) % 35)}%` }}
                />
                <span className="h-2 w-1/3 rounded-full bg-surface-2" />
              </div>
              <span className="hidden size-6 rounded-full bg-surface-2 [grid-area:owner] @min-[34rem]/heartbeat-ledger:block" />
              <div className="flex items-end justify-end gap-[3px] overflow-hidden [grid-area:history]">
                {Array.from({ length: 16 }, (_, j) => (
                  <span
                    key={j}
                    className="w-[5px] shrink-0 rounded-t-[1.5px] bg-surface-2"
                    style={{ height: 6 + ((i * 5 + j * 7) % 11) }}
                  />
                ))}
              </div>
              <span className="h-2.5 w-14 justify-self-end rounded-full bg-surface-2 [grid-area:next]" />
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 px-6 py-14 text-center"
        >
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-ink-2">The check-ins did not load.</p>
          <p className="text-xs text-ink-3">
            Nothing here is stale: rows come back with the next good fetch.
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
              Retry
            </button>
          ) : null}
        </div>
      );
    }
    if (views.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <CalendarClock aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No scheduled jobs yet.</p>
          <p className="max-w-64 text-xs text-ink-3">
            A job appears here after its first check-in.
          </p>
        </div>
      );
    }
    return views.map((view, ri) => (
      <JobRow
        key={view.job.id}
        view={view}
        index={ri}
        now={now}
        geo={geo}
        template={template}
        motionSafe={motionSafe}
        live={motionSafe && inView}
        isPaused={pausedIds.includes(view.job.id)}
        isMuted={mutedIds.includes(view.job.id)}
        activeRow={activeRow}
        activeCol={activeCol}
        cursor={beatMode?.row === view.job.id ? beatMode.beat : null}
        disabled={disabled}
        bindCell={bindCell}
        onFocusCell={(col) => {
          if (activeRow !== view.job.id || activeCol !== col) {
            setActive({ row: view.job.id, col });
          }
          if (beatMode && beatMode.row !== view.job.id) setBeatMode(null);
        }}
        onPause={() => togglePause(view.job)}
        onMute={() => toggleMute(view.job)}
        onOpen={(beat) => openRun(view.job, beat)}
        formatTime={formatTime}
        hintId={hintId}
      />
    ));
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/heartbeat-ledger relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--hl-accent" as string]: accent,
        // The strip column holds exactly `keep` slots plus the cell's padding;
        // no trailing gap after the newest beat.
        ["--hl-strip" as string]: `${keep * geo.pitch - (geo.pitch - geo.slot) + 12}px`,
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-36 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {ready
                ? [
                    plural(views.length, "job", "jobs"),
                    summary.due ? `${summary.due} due` : null,
                    summary.late ? `${summary.late} late` : null,
                    summary.missed ? `${summary.missed} missed` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : status === "loading"
                  ? "Fetching check-ins"
                  : "Check-ins unavailable"}
            </p>
          </div>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2 font-mono text-[11px] text-(--hl-accent) tabular-nums">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-(--hl-accent)"
            />
            {formatTime(now)}
            <span className="sr-only"> now</span>
          </span>
        </header>

        <p id={hintId} className="sr-only">
          P pauses a job, M mutes it, Enter opens its last run. Enter on the
          history steps into it.
        </p>

        <div
          role="grid"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          aria-rowcount={ready ? views.length + 1 : -1}
          aria-busy={status === "loading" || undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={onGridKeyDown}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div
            role="row"
            aria-rowindex={1}
            className={cn(
              template,
              "hidden border-b border-hairline bg-surface-1 px-4 py-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[34rem]/heartbeat-ledger:grid",
            )}
          >
            <span role="columnheader" className="[grid-area:job]">
              Job
            </span>
            <span role="columnheader" className="[grid-area:owner]">
              <span className="sr-only">Owner</span>
              <span
                aria-hidden
                className="hidden @min-[60rem]/heartbeat-ledger:inline"
              >
                Owner
              </span>
            </span>
            <span
              role="columnheader"
              className="justify-self-end [grid-area:history]"
            >
              Last {keep} check-ins
            </span>
            <span
              role="columnheader"
              className="justify-self-end [grid-area:next]"
            >
              Next
            </span>
            <span role="columnheader" className="sr-only [grid-area:actions]">
              Actions
            </span>
          </div>
          <div
            role="rowgroup"
            className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
          >
            {body()}
          </div>
        </div>

        <footer
          aria-hidden
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 text-[10.5px] text-ink-3"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-[5px] rounded-t-[1.5px] bg-(--hl-accent)" />
            On time
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-[5px] rounded-t-[1.5px] bg-warn" />
            Late
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-[5px] rounded-t-[1.5px] bg-danger" />
            Failed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-[5px] rounded-[1.5px] border border-dashed border-[color-mix(in_oklab,var(--danger)_70%,transparent)]" />
            Missed
          </span>
          <span className="hidden @min-[34rem]/heartbeat-ledger:inline">
            Bar height is the run&rsquo;s length
          </span>
        </footer>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                   */
/* ----------------------------------------------------------------------- */

function JobRow({
  view,
  index,
  now,
  geo,
  template,
  motionSafe,
  live,
  isPaused,
  isMuted,
  activeRow,
  activeCol,
  cursor,
  disabled,
  bindCell,
  onFocusCell,
  onPause,
  onMute,
  onOpen,
  formatTime,
  hintId,
}: {
  view: JobView;
  index: number;
  now: number;
  geo: Geometry;
  template: string;
  motionSafe: boolean;
  live: boolean;
  isPaused: boolean;
  isMuted: boolean;
  activeRow: string | undefined;
  activeCol: Col;
  cursor: string | null;
  disabled: boolean;
  bindCell: (key: string) => (node: HTMLElement | null) => void;
  onFocusCell: (col: Col) => void;
  onPause: () => void;
  onMute: () => void;
  onOpen: (beat: HeartbeatBeat | null) => void;
  formatTime: (ms: number) => string;
  hintId: string;
}) {
  const { job, phase, due, last, counts } = view;
  const lapsed = phase === "lapsed";
  // The check-in pulse is for beats that arrive while the row is on screen,
  // never for the history it was first drawn with.
  const [seenLast, setSeenLast] = React.useState(last?.id ?? null);
  const [pulse, setPulse] = React.useState<string | null>(null);
  if ((last?.id ?? null) !== seenLast) {
    setSeenLast(last?.id ?? null);
    setPulse(last?.id ?? null);
  }
  const isActiveRow = activeRow === job.id;
  const tab = (col: Col) => (isActiveRow && activeCol === col ? 0 : -1);
  const cellKey = (col: Col) => `${job.id}:${col}`;

  const nextText =
    phase === "paused"
      ? "Paused"
      : phase === "never"
        ? "No runs yet"
        : phase === "waiting"
          ? `in ${span(due - now)}`
          : phase === "grace"
            ? `${span(due + job.grace - now)} grace`
            : `missed ${span(now - due - job.grace)}`;
  const nextWords =
    phase === "paused"
      ? "paused"
      : phase === "never"
        ? "no runs yet"
        : phase === "waiting"
          ? `next check-in due in ${spanWords(due - now)}, at ${formatTime(due)}`
          : phase === "grace"
            ? `due ${spanWords(now - due)} ago, ${spanWords(due + job.grace - now)} of grace left`
            : `missed by ${spanWords(now - due - job.grace)}`;
  const historyWords = [
    plural(counts.ok, "on time", "on time"),
    counts.late ? `${counts.late} late` : null,
    counts.failed ? `${counts.failed} failed` : null,
    counts.missed
      ? `${plural(counts.missed, "missed run", "missed runs")}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className={cn(
        template,
        "relative isolate items-center border-b border-hairline px-4 py-2.5 transition-colors @min-[34rem]/heartbeat-ledger:py-0",
        !disabled &&
          "hover:bg-[color-mix(in_oklab,var(--card)_94%,var(--foreground))]",
      )}
      style={{ minHeight: geo.row }}
    >
      {/* The warning tint tips in from the left when the grace runs out. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 border-l-2 border-warn bg-[color-mix(in_oklab,var(--warn)_9%,transparent)]"
        style={{ originX: 0 }}
        initial={false}
        animate={{ scaleX: lapsed ? 1 : 0, opacity: lapsed ? 1 : 0 }}
        transition={{
          scaleX: motionSafe ? springs.glide : { duration: 0 },
          opacity: { duration: durations.base },
        }}
      />

      <div
        ref={bindCell(cellKey("job"))}
        role="gridcell"
        tabIndex={tab("job")}
        aria-describedby={hintId}
        onFocus={() => onFocusCell("job")}
        onClick={() => onOpen(last)}
        className={cn(
          "flex min-w-0 cursor-pointer items-center gap-2.5 self-stretch rounded-2 py-1 [grid-area:job]",
          FOCUS_IN,
        )}
      >
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          {phase === "grace" ? (
            <GraceRing remain={view.remain} live={live} />
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {lapsed ? (
              <motion.span
                key="warn"
                className="absolute inset-0 flex items-center justify-center text-warn"
                initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.blink } }}
                transition={{
                  scale: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <TriangleAlert aria-hidden className="size-4" />
              </motion.span>
            ) : (
              <motion.span
                key="dot"
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.blink } }}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    phase === "paused" || phase === "never"
                      ? "bg-hairline-strong"
                      : last?.status === "failed"
                        ? "bg-danger"
                        : last?.status === "late"
                          ? "bg-warn"
                          : "bg-(--hl-accent)",
                  )}
                />
              </motion.span>
            )}
          </AnimatePresence>
          {/* One flick pulse per check-in, keyed by the beat that caused it. */}
          {last && pulse === last.id && motionSafe && phase !== "paused" ? (
            <motion.span
              key={last.id}
              aria-hidden
              className="absolute inset-0.5 rounded-full border border-(--hl-accent)"
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.enter }}
            />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              phase === "paused" ? "text-ink-3" : "text-foreground",
            )}
            title={job.name}
          >
            {job.name}
          </span>
          <span className="truncate text-[11px] text-ink-3">
            {job.schedule}
            <span className="@min-[34rem]/heartbeat-ledger:hidden">
              {" "}
              · {job.owner.initials}
            </span>
          </span>
        </span>
        <span className="sr-only">
          , {job.schedule}, owner {job.owner.name}
        </span>
      </div>

      <div
        ref={bindCell(cellKey("owner"))}
        role="gridcell"
        tabIndex={tab("owner")}
        onFocus={() => onFocusCell("owner")}
        className={cn(
          "hidden min-w-0 items-center gap-2 rounded-2 [grid-area:owner] @min-[34rem]/heartbeat-ledger:flex",
          FOCUS_IN,
        )}
        title={job.owner.name}
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9.5px] font-medium text-ink-2 ring-1 ring-hairline"
        >
          {job.owner.initials}
        </span>
        <span className="hidden truncate text-[12px] text-ink-2 @min-[60rem]/heartbeat-ledger:inline">
          {job.owner.name}
        </span>
        <span className="sr-only @min-[60rem]/heartbeat-ledger:hidden">
          {job.owner.name}
        </span>
      </div>

      <div
        ref={bindCell(cellKey("history"))}
        role="gridcell"
        tabIndex={tab("history")}
        aria-label={`History: ${historyWords || "no check-ins yet"}`}
        aria-describedby={hintId}
        onFocus={() => onFocusCell("history")}
        className={cn(
          "flex min-w-0 items-center justify-start self-stretch rounded-2 pr-1.5 pl-[30px] [grid-area:history] @min-[34rem]/heartbeat-ledger:justify-end @min-[34rem]/heartbeat-ledger:pl-1.5",
          FOCUS_IN,
          isPaused && "opacity-50 saturate-0",
        )}
      >
        <div
          className="w-full max-w-(--hl-ten) @min-[34rem]/heartbeat-ledger:max-w-none"
          style={{
            ["--hl-ten" as string]: `${10 * geo.pitch - (geo.pitch - geo.slot)}px`,
          }}
        >
          <Strip
            view={view}
            geo={geo}
            motionSafe={motionSafe}
            cursor={cursor}
            onPick={(beat) => onOpen(beat)}
            formatTime={formatTime}
          />
        </div>
      </div>

      <div
        ref={bindCell(cellKey("next"))}
        role="gridcell"
        tabIndex={tab("next")}
        onFocus={() => onFocusCell("next")}
        className={cn(
          "flex min-w-0 flex-col items-end justify-center self-stretch rounded-2 py-1 text-right [grid-area:next]",
          FOCUS_IN,
        )}
      >
        <span
          className={cn(
            "truncate font-mono text-[12px] tabular-nums",
            lapsed
              ? "text-warn"
              : phase === "grace"
                ? "text-foreground"
                : "text-ink-2",
          )}
        >
          {nextText}
        </span>
        <span className="truncate text-[10.5px] text-ink-3">
          {phase === "waiting" || phase === "grace"
            ? `due ${formatTime(due)}`
            : last
              ? `last ${formatTime(last.at)}`
              : "—"}
        </span>
        <span className="sr-only">, {nextWords}</span>
      </div>

      <div
        role="gridcell"
        className="flex items-center justify-end gap-0.5 [grid-area:actions]"
      >
        <button
          ref={bindCell(cellKey("pause"))}
          type="button"
          tabIndex={tab("pause")}
          onFocus={() => onFocusCell("pause")}
          onClick={onPause}
          aria-label={`${isPaused ? "Resume" : "Pause"} ${job.name}`}
          aria-disabled={disabled || undefined}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          {isPaused ? (
            <Play aria-hidden className="size-3.5" />
          ) : (
            <Pause aria-hidden className="size-3.5" />
          )}
        </button>
        <button
          ref={bindCell(cellKey("mute"))}
          type="button"
          tabIndex={tab("mute")}
          onFocus={() => onFocusCell("mute")}
          onClick={onMute}
          aria-label={`${isMuted ? "Unmute" : "Mute"} alerts for ${job.name}`}
          aria-disabled={disabled || undefined}
          className={cn(
            "relative inline-flex size-7 items-center justify-center rounded-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            isMuted ? "text-warn" : "text-ink-3",
            FOCUS_RING,
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={isMuted ? "off" : "on"}
              className="flex"
              initial={{ scale: motionSafe ? 0.5 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{
                scale: motionSafe ? springs.flick : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              {isMuted ? (
                <BellOff aria-hidden className="size-3.5" />
              ) : (
                <Bell aria-hidden className="size-3.5" />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
