"use client";

import * as React from "react";

import { animate, motion } from "motion/react";
import {
  CalendarClock,
  OctagonX,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  SquareArrowOutUpRight,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type RoutineWeekRoutine = {
  id: string;
  name: string;
  /** The agent that runs it. */
  agent: string;
  /** Days it runs on: 0 is Monday, 6 Sunday. */
  days: number[];
  /** Start, minutes after midnight. */
  at: number;
  /** How long a run usually takes, minutes. */
  duration: number;
  /** Paused routines keep their slots, struck through, and do not run. */
  paused?: boolean;
};

export type RoutineWeekOutcome = "success" | "failed" | "skipped" | "running";

export type RoutineWeekRun = {
  id: string;
  /** The routine's id. */
  routine: string;
  /** 0 is Monday of `weekOf`. */
  day: number;
  /** Minutes after midnight. */
  start: number;
  /** Minutes it took (or is expected to take, while running). */
  duration: number;
  outcome: RoutineWeekOutcome;
  /** A sentence on what happened. */
  note?: string;
};

export type RoutineWeekBlockStyle = "solid" | "tinted" | "outline";
export type RoutineWeekStatus = "ready" | "loading" | "error";

export type RoutineWeekProps = {
  /** The recurring routines. @default defaultRoutineWeekRoutines (6) */
  routines?: RoutineWeekRoutine[];
  /** Controlled runs this week, past and running. */
  runs?: RoutineWeekRun[];
  /** Initial runs when uncontrolled. @default defaultRoutineWeekRuns */
  defaultRuns?: RoutineWeekRun[];
  /** Fires with the whole list when Run now adds a run. */
  onRunsChange?: (runs: RoutineWeekRun[]) => void;
  /** Monday 00:00 of the week, in ms (UTC plus `utcOffset`). @default defaultRoutineWeekStart */
  weekOf?: number;
  /** The moment the week is read, in ms: places the now line and decides what is running. @default Thursday 02:20 of that week */
  now?: number;
  /** Minutes added to UTC before dates and times are read. @default 0 */
  utcOffset?: number;
  /** The hours drawn, as [from, to). @default [0, 9] */
  hours?: [number, number];
  /** Controlled day of the narrow agenda, 0–6. */
  day?: number;
  /** Initial agenda day when uncontrolled. @default today */
  defaultDay?: number;
  /** Fires when the week strip picks another day. */
  onDayChange?: (day: number) => void;
  /** Run now (or R) was pressed, with the run it started. */
  onRunNow?: (routine: RoutineWeekRoutine, run: RoutineWeekRun) => void;
  /** Pause or Resume (or P) was pressed, with the new state. */
  onPause?: (routine: RoutineWeekRoutine, paused: boolean) => void;
  /** Edit schedule was pressed, or Enter on a slot that has not run; null from the empty week's Add a routine. */
  onEditSchedule?: (routine: RoutineWeekRoutine | null) => void;
  /** Open run was pressed, or Enter on a slot that ran. */
  onOpenRun?: (run: RoutineWeekRun, routine: RoutineWeekRoutine) => void;
  /** The surface's name. @default "Nightly reports" */
  title?: string;
  /** Whose routines, after the title. @default "Coldbrook" */
  team?: string;
  /** Height of an hour on the grid, px; the agenda's rows breathe with it. @default 32 */
  hourHeight?: number;
  /** Run blocks: pigment-filled, washed with a side bar, or outlined with an outcome dot. @default "tinted" */
  blockStyle?: RoutineWeekBlockStyle;
  /** The now line, running blocks, scheduled slots, today's shading and focus — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Tallest the grid's viewport grows, px, before the hours scroll inside it. @default 300 */
  maxHeight?: number;
  /** Whether the week has loaded. @default "ready" */
  status?: RoutineWeekStatus;
  /** Try again was pressed after the week failed to load. */
  onReload?: () => void;
  /** Read only: nothing can be run, paused or edited. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DAY_MS = 24 * 60 * MIN;
const ALL = [0, 1, 2, 3, 4, 5, 6];

/** Monday 12 October 2026, 00:00 UTC. */
export const defaultRoutineWeekStart = Date.UTC(2026, 9, 12);

export const defaultRoutineWeekRoutines: RoutineWeekRoutine[] = [
  {
    id: "sales",
    name: "Sales digest",
    agent: "Quill",
    days: ALL,
    at: 60,
    duration: 35,
  },
  {
    id: "stock",
    name: "Inventory snapshot",
    agent: "Sift",
    days: ALL,
    at: 150,
    duration: 20,
  },
  {
    id: "churn",
    name: "Churn watch",
    agent: "Sift",
    days: [1, 3, 5],
    at: 195,
    duration: 45,
  },
  {
    id: "spend",
    name: "Ad spend recap",
    agent: "Quill",
    days: [0, 1, 2, 3, 4],
    at: 300,
    duration: 25,
  },
  {
    id: "board",
    name: "Weekly board pack",
    agent: "Penn",
    days: [0],
    at: 360,
    duration: 90,
  },
  {
    id: "queue",
    name: "Support backlog",
    agent: "Penn",
    days: ALL,
    at: 450,
    duration: 15,
  },
];

const ok = (
  routine: string,
  day: number,
  start: number,
  duration: number,
  note?: string,
): RoutineWeekRun => ({
  id: `${routine}-${day}`,
  routine,
  day,
  start,
  duration,
  outcome: "success",
  note,
});

/** Monday to Wednesday ran (one failure, one skip, one overrun); Thursday's digest is in. */
export const defaultRoutineWeekRuns: RoutineWeekRun[] = [
  ok("sales", 0, 60, 34),
  ok("stock", 0, 150, 19),
  ok("spend", 0, 300, 24),
  ok("board", 0, 360, 97, "Ran 97 minutes, into the support backlog."),
  ok("queue", 0, 450, 14),
  ok("sales", 1, 60, 36),
  ok("stock", 1, 150, 21),
  {
    id: "churn-1",
    routine: "churn",
    day: 1,
    start: 195,
    duration: 40,
    outcome: "failed",
    note: "The warehouse export timed out after 40 minutes.",
  },
  ok("spend", 1, 300, 26),
  ok("queue", 1, 450, 15),
  ok("sales", 2, 60, 38),
  {
    id: "stock-2",
    routine: "stock",
    day: 2,
    start: 150,
    duration: 20,
    outcome: "skipped",
    note: "Skipped: the stock source was in maintenance.",
  },
  ok("spend", 2, 300, 22),
  ok("queue", 2, 450, 13),
  ok("sales", 3, 60, 36),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const hhmm = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const scheduleText = (r: RoutineWeekRoutine) => {
  const d = [...r.days].sort((a, b) => a - b);
  const when =
    d.length === 7
      ? "Daily"
      : d.join() === "0,1,2,3,4"
        ? "Weekdays"
        : d.length === 1
          ? `${DAY_LONG[d[0] ?? 0]}s`
          : d.map((x) => DAY_SHORT[x]).join(", ");
  return `${when} at ${hhmm(r.at)} · ${r.duration} min`;
};

type Phase = RoutineWeekOutcome | "scheduled" | "unknown";

type Block = {
  key: string;
  routine: RoutineWeekRoutine;
  day: number;
  start: number;
  duration: number;
  phase: Phase;
  run?: RoutineWeekRun;
  paused: boolean;
  /** 0–1 while running. */
  progress: number;
  overlaps: string[];
};

type Slot = { col: number; cols: number };

/** Overlapping blocks share the column; a cluster closes when nothing runs on. */
function pack(list: Block[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  const sorted = [...list].sort(
    (a, b) => a.start - b.start || a.key.localeCompare(b.key),
  );
  let cluster: string[] = [];
  let ends: number[] = [];
  const close = () => {
    for (const k of cluster) {
      const s = slots.get(k);
      if (s) s.cols = ends.length;
    }
    cluster = [];
    ends = [];
  };
  for (const b of sorted) {
    const end = b.start + Math.max(b.duration, 12);
    if (ends.length > 0 && b.start >= Math.max(...ends)) close();
    let col = ends.findIndex((e) => e <= b.start);
    if (col === -1) {
      col = ends.length;
      ends.push(end);
    } else ends[col] = end;
    slots.set(b.key, { col, cols: 1 });
    cluster.push(b.key);
  }
  close();
  return slots;
}

const toneOf = (phase: Phase) =>
  phase === "success"
    ? "var(--success)"
    : phase === "failed"
      ? "var(--danger)"
      : phase === "skipped" || phase === "unknown"
        ? "var(--ink-3)"
        : "var(--rw-accent)";

const PHASE_WORD: Record<Phase, string> = {
  success: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
  running: "Running",
  scheduled: "Scheduled",
  unknown: "No result yet",
};

type ShellProps = React.HTMLAttributes<HTMLDivElement> & {
  running: boolean;
  /** It was already running when the week first rendered: no bud. */
  settled: boolean;
  motionSafe: boolean;
  cellRef: (node: HTMLDivElement | null) => void;
};

/**
 * A run's block. The moment it starts running it buds out of the now line —
 * a sliver that opens to the block on `springs.recoil`, scaled from its top
 * edge, which is where the line is — whether it was a dashed slot a moment
 * ago or a run just started by hand. Driven imperatively so the element (and
 * any focus on it) is never remounted.
 */
function BlockShell({
  running,
  settled,
  motionSafe,
  cellRef,
  style,
  children,
  ...rest
}: ShellProps) {
  const node = React.useRef<HTMLDivElement | null>(null);
  const was = React.useRef(settled ? running : false);
  React.useEffect(() => {
    const before = was.current;
    was.current = running;
    const el = node.current;
    if (!running || before || !motionSafe || !el) return;
    const controls = animate(
      el,
      { scaleX: [0.25, 1], scaleY: [0.06, 1], opacity: [0, 1] },
      {
        scaleX: springs.recoil,
        scaleY: springs.recoil,
        opacity: { duration: durations.fast, ease: easings.enter },
      },
    );
    return () => {
      // Finish the bud, never freeze it; a StrictMode rehearsal buds again.
      controls.complete();
      was.current = before;
    };
  }, [running, motionSafe]);
  return (
    <div
      ref={(n) => {
        node.current = n;
        cellRef(n);
      }}
      style={{ ...style, transformOrigin: "50% 0%" }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * Every scheduled agent routine on one week: days across, the small hours
 * down, each run a block coloured by its outcome and each future slot a
 * dashed ghost. The now line moves down today's column on glide as `now`
 * advances, and as it crosses a scheduled slot a new block buds out of the
 * line — a sliver that opens to the block on `springs.recoil` — then fills
 * while the run executes, the fill following `now` on glide, until the host
 * records the outcome and the block takes its colour. Overlapping runs share
 * the column with a notch; skipped runs are hatched; paused routines are
 * struck through.
 *
 * The slots are a grid with one row per day: arrows move between slots (Left
 * and Right to the nearest slot in time on the neighbouring day), Home and
 * End jump within a day, Enter opens the run (or edits a slot that has not
 * run), R runs the focused routine now and P pauses it. Under 32rem the grid
 * becomes today's agenda under a week strip. Under reduced motion nothing
 * buds or glides; fills, outcomes and counts still update.
 */
export function RoutineWeek({
  routines = defaultRoutineWeekRoutines,
  runs,
  defaultRuns = defaultRoutineWeekRuns,
  onRunsChange,
  weekOf = defaultRoutineWeekStart,
  now,
  utcOffset = 0,
  hours = [0, 9],
  day,
  defaultDay,
  onDayChange,
  onRunNow,
  onPause,
  onEditSchedule,
  onOpenRun,
  title = "Nightly reports",
  team = "Coldbrook",
  hourHeight = 32,
  blockStyle = "tinted",
  accent = "var(--accent-bright)",
  maxHeight = 300,
  status = "ready",
  onReload,
  disabled = false,
  className,
}: RoutineWeekProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";

  const nowMs = now ?? weekOf + 3 * DAY_MS + 140 * MIN;
  const sinceWeek = nowMs - weekOf;
  const today = Math.floor(sinceWeek / DAY_MS);
  const nowMin = Math.round((sinceWeek - today * DAY_MS) / MIN);
  const [h0, h1raw] = hours;
  const h1 = Math.max(h1raw, h0 + 1);
  const dayStart = h0 * 60;
  const dayEnd = h1 * 60;
  const hh = Math.max(16, Math.round(hourHeight));
  const ppm = hh / 60;
  const gridH = (h1 - h0) * hh;

  const [ownRuns, setOwnRuns] = React.useState(defaultRuns);
  const list = runs ?? ownRuns;
  const [pausedOver, setPausedOver] = React.useState<Record<string, boolean>>(
    {},
  );
  const pausedOf = (r: RoutineWeekRoutine) =>
    pausedOver[r.id] ?? r.paused ?? false;

  const [ownDay, setOwnDay] = React.useState(() =>
    Math.min(
      6,
      Math.max(0, defaultDay ?? (today >= 0 && today <= 6 ? today : 0)),
    ),
  );
  const agendaDay = day ?? ownDay;
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");

  /* -------------------------------- blocks ------------------------------- */

  const blocks = React.useMemo(() => {
    const out: Block[] = [];
    const used = new Set<string>();
    const routineById = new Map(routines.map((r) => [r.id, r]));
    for (let d = 0; d < 7; d++) {
      for (const r of routines) {
        if (!r.days.includes(d)) continue;
        const run = list.find(
          (x) =>
            x.routine === r.id &&
            x.day === d &&
            x.start === r.at &&
            !used.has(x.id),
        );
        if (run) used.add(run.id);
        const paused = pausedOver[r.id] ?? r.paused ?? false;
        let phase: Phase;
        let progress = 0;
        if (run) {
          phase = run.outcome;
        } else if (d < today || (d === today && nowMin >= r.at + r.duration)) {
          phase = paused ? "skipped" : "unknown";
        } else if (d === today && nowMin >= r.at && !paused) {
          phase = "running";
        } else phase = "scheduled";
        const start = run?.start ?? r.at;
        const duration = run?.duration ?? r.duration;
        if (phase === "running") {
          progress = Math.min(
            1,
            Math.max(0, (nowMin - start) / Math.max(1, duration)),
          );
        }
        out.push({
          key: `${r.id}:${d}`,
          routine: r,
          day: d,
          start,
          duration,
          phase,
          run,
          paused,
          progress,
          overlaps: [],
        });
      }
    }
    // Runs started by hand sit where they were started.
    for (const run of list) {
      if (used.has(run.id)) continue;
      const r = routineById.get(run.routine);
      if (!r || run.day < 0 || run.day > 6) continue;
      const progress =
        run.outcome === "running"
          ? Math.min(
              1,
              Math.max(0, (nowMin - run.start) / Math.max(1, run.duration)),
            )
          : 0;
      out.push({
        key: run.id,
        routine: r,
        day: run.day,
        start: run.start,
        duration: run.duration,
        phase: run.outcome,
        run,
        paused: false,
        progress,
        overlaps: [],
      });
    }
    // Who ran into whom.
    for (const a of out) {
      if (a.phase === "scheduled") continue;
      for (const b of out) {
        if (a === b || a.day !== b.day || b.phase === "scheduled") continue;
        if (a.start < b.start + b.duration && b.start < a.start + a.duration) {
          a.overlaps.push(b.routine.name);
        }
      }
    }
    return out.sort(
      (a, b) =>
        a.day - b.day || a.start - b.start || a.key.localeCompare(b.key),
    );
  }, [routines, list, today, nowMin, pausedOver]);

  const byDay = React.useMemo(() => {
    const m: Block[][] = ALL.map(() => []);
    for (const b of blocks) m[b.day]?.push(b);
    return m;
  }, [blocks]);
  const packs = React.useMemo(() => byDay.map((d) => pack(d)), [byDay]);

  const counts = {
    success: blocks.filter((b) => b.phase === "success").length,
    failed: blocks.filter((b) => b.phase === "failed").length,
    skipped: blocks.filter((b) => b.phase === "skipped").length,
  };

  // Blocks that bud are the ones that start running after the week is on screen.
  const [firstKeys] = React.useState(
    () =>
      new Set(blocks.filter((b) => b.phase === "running").map((b) => b.key)),
  );

  // A run that begins or ends is announced once, from the render that sees it.
  const runningKey = blocks
    .filter((b) => b.phase === "running")
    .map((b) => b.key)
    .join("|");
  const doneKey = blocks
    .filter((b) => b.run && b.run.outcome !== "running")
    .map((b) => `${b.key}:${b.run?.outcome}`)
    .join("|");
  const [heard, setHeard] = React.useState({ runningKey, doneKey });
  if (heard.runningKey !== runningKey || heard.doneKey !== doneKey) {
    const was = new Set(heard.runningKey.split("|"));
    const started = blocks.find(
      (b) => b.phase === "running" && !was.has(b.key),
    );
    const prevDone = new Set(heard.doneKey.split("|"));
    const ended = blocks.find(
      (b) =>
        b.run &&
        b.run.outcome !== "running" &&
        !prevDone.has(`${b.key}:${b.run.outcome}`),
    );
    setHeard({ runningKey, doneKey });
    if (ended && heard.doneKey) {
      setSaid(
        `${ended.routine.name} ${PHASE_WORD[ended.phase].toLowerCase()}.`,
      );
    } else if (started) {
      setSaid(`${started.routine.name} started at ${hhmm(started.start)}.`);
    }
  }

  /* ------------------------------- focusing ------------------------------ */

  const focusable = blocks;
  const focusedBlock =
    focusable.find((b) => b.key === focusKey) ??
    focusable.find((b) => b.day === today && b.phase === "running") ??
    focusable.find((b) => b.day === today && b.phase === "scheduled") ??
    focusable[0] ??
    null;

  const cellRefs = React.useRef(new Map<string, HTMLElement>());
  const focusBlock = (b: Block | undefined | null) => {
    if (!b) return;
    setFocusKey(b.key);
    cellRefs.current.get(b.key)?.focus({ preventScroll: false });
  };

  /* -------------------------------- actions ------------------------------ */

  const seq = React.useRef(0);
  const runNow = (b: Block) => {
    if (disabled || !ready || today < 0 || today > 6) return;
    seq.current += 1;
    const run: RoutineWeekRun = {
      id: `${uid}-now-${b.routine.id}-${nowMin}-${seq.current}`,
      routine: b.routine.id,
      day: today,
      start: nowMin,
      duration: b.routine.duration,
      outcome: "running",
      note: "Started by hand.",
    };
    const next = [...list, run];
    if (runs === undefined) setOwnRuns(next);
    setSaid(`${b.routine.name} started now.`);
    onRunsChange?.(next);
    onRunNow?.(b.routine, run);
  };

  const togglePause = (b: Block) => {
    if (disabled || !ready) return;
    const next = !pausedOf(b.routine);
    setPausedOver((m) => ({ ...m, [b.routine.id]: next }));
    setSaid(`${b.routine.name} ${next ? "paused" : "resumed"}.`);
    onPause?.(b.routine, next);
  };

  const open = (b: Block) => {
    if (disabled || !ready) return;
    if (b.run) onOpenRun?.(b.run, b.routine);
    else onEditSchedule?.(b.routine);
  };

  const onCellKey = (event: React.KeyboardEvent, b: Block) => {
    const inDay = byDay[b.day] ?? [];
    const i = inDay.indexOf(b);
    const nearestIn = (d: number) => {
      const cand = byDay[d] ?? [];
      let best: Block | undefined;
      for (const c of cand) {
        if (
          !best ||
          Math.abs(c.start - b.start) < Math.abs(best.start - b.start)
        )
          best = c;
      }
      return best;
    };
    const sideways = (dir: number) => {
      for (let d = b.day + dir; d >= 0 && d <= 6; d += dir) {
        const hit = nearestIn(d);
        if (hit) return hit;
      }
      return undefined;
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusBlock(inDay[Math.min(inDay.length - 1, i + 1)]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusBlock(inDay[Math.max(0, i - 1)]);
        return;
      case "ArrowRight":
        event.preventDefault();
        focusBlock(sideways(1));
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusBlock(sideways(-1));
        return;
      case "Home":
        event.preventDefault();
        focusBlock(inDay[0]);
        return;
      case "End":
        event.preventDefault();
        focusBlock(inDay[inDay.length - 1]);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        open(b);
        return;
      default:
        break;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      runNow(b);
    } else if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      togglePause(b);
    }
  };

  const describe = (b: Block) => {
    const parts = [`${DAY_LONG[b.day]} ${hhmm(b.start)}`, b.routine.name];
    if (b.phase === "running")
      parts.push(`running, ${Math.round(b.progress * 100)}% done`);
    else parts.push(PHASE_WORD[b.phase].toLowerCase());
    if (b.paused && b.phase === "scheduled") parts.push("paused");
    if (b.overlaps.length) parts.push(`overlaps ${b.overlaps.join(" and ")}`);
    return parts.join(", ");
  };

  /* ------------------------------- the grid ------------------------------ */

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  // The week opens with now in view.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const y = (nowMin - dayStart) * ppm;
    if (y > el.clientHeight - 24) el.scrollTop = Math.max(0, y - 48);
    // Only on arrival: afterwards the reader owns the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateOf = (d: number) => {
    const t = new Date(weekOf + d * DAY_MS + utcOffset * MIN);
    return { n: t.getUTCDate(), m: MONTH[t.getUTCMonth()] ?? "" };
  };

  const blockLook = (
    b: Block,
  ): { className: string; style: React.CSSProperties } => {
    const tone = toneOf(b.phase);
    if (b.phase === "scheduled") {
      return {
        className: cn(
          "border border-dashed text-ink-2",
          b.paused
            ? "border-hairline-strong"
            : "border-[color-mix(in_oklab,var(--rw-accent)_50%,transparent)]",
        ),
        style: {},
      };
    }
    if (b.phase === "running") {
      return {
        className: "border-[1.5px] border-(--rw-accent) text-foreground",
        style: {
          backgroundColor:
            "color-mix(in oklab, var(--rw-accent) 8%, var(--card))",
        },
      };
    }
    const hatch =
      b.phase === "skipped" || b.phase === "unknown"
        ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--ink-3) 22%, transparent) 0 2px, transparent 2px 6px)"
        : undefined;
    if (blockStyle === "solid") {
      return {
        className: "border border-transparent text-[oklch(0.24_0.02_258)]",
        style: {
          backgroundColor: `oklch(from ${tone} 0.84 calc(c * 0.7) h)`,
          backgroundImage: hatch,
        },
      };
    }
    if (blockStyle === "outline") {
      return {
        className: "border-[1.5px] text-foreground",
        style: {
          borderColor: `color-mix(in oklab, ${tone} 70%, transparent)`,
          backgroundColor: "var(--card)",
          backgroundImage: hatch,
        },
      };
    }
    return {
      className: "border border-l-[3px] text-foreground",
      style: {
        backgroundColor: `color-mix(in oklab, ${tone} 15%, var(--card))`,
        backgroundImage: hatch,
        borderColor: `color-mix(in oklab, ${tone} 30%, transparent)`,
        borderLeftColor: tone,
      },
    };
  };

  const blockCell = (b: Block) => {
    const slot = packs[b.day]?.get(b.key) ?? { col: 0, cols: 1 };
    const top = (Math.max(dayStart, b.start) - dayStart) * ppm;
    const end = Math.min(dayEnd, b.start + b.duration);
    if (b.start >= dayEnd || end <= dayStart) return null;
    const height = Math.max(18, (end - Math.max(dayStart, b.start)) * ppm - 2);
    const look = blockLook(b);
    const focused = focusedBlock?.key === b.key;
    const roomy = height >= 30;
    return (
      <BlockShell
        key={b.key}
        cellRef={(node) => {
          if (node) cellRefs.current.set(b.key, node);
          else cellRefs.current.delete(b.key);
        }}
        running={b.phase === "running"}
        settled={firstKeys.has(b.key)}
        motionSafe={motionSafe}
        role="gridcell"
        tabIndex={focused ? 0 : -1}
        aria-label={describe(b)}
        aria-selected={focused}
        aria-describedby={hintId}
        onFocus={() => setFocusKey(b.key)}
        onClick={() => {
          setFocusKey(b.key);
          cellRefs.current.get(b.key)?.focus({ preventScroll: true });
        }}
        onDoubleClick={() => open(b)}
        onKeyDown={(event) => onCellKey(event, b)}
        className={cn(
          "absolute cursor-pointer overflow-hidden rounded-2 px-1 text-left transition-[box-shadow] duration-150",
          look.className,
          focused &&
            "shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--rw-accent)]",
          FOCUS,
        )}
        style={{
          ...look.style,
          top: r2(top + 1),
          height: r2(height),
          left: `calc(${r2((slot.col / slot.cols) * 100)}% + 2px)`,
          width: `calc(${r2(100 / slot.cols)}% - 4px)`,
          zIndex: b.phase === "running" ? 3 : focused ? 2 : 1,
        }}
      >
        {b.phase === "running" ? (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-0 bg-[color-mix(in_oklab,var(--rw-accent)_26%,transparent)]"
            initial={false}
            animate={{ height: `${r2(b.progress * 100)}%` }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        ) : null}
        <span
          className={cn(
            "relative flex items-center gap-1",
            roomy ? "pt-0.5" : "h-full",
          )}
        >
          {blockStyle === "outline" &&
          b.phase !== "scheduled" &&
          b.phase !== "running" ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: toneOf(b.phase) }}
            />
          ) : null}
          <span
            className={cn(
              "truncate text-[11px] leading-4 font-medium",
              b.paused && b.phase === "scheduled" && "text-ink-3 line-through",
            )}
            title={b.routine.name}
          >
            {b.routine.name}
          </span>
          {b.phase === "failed" ? (
            <OctagonX
              aria-hidden
              className="ml-auto size-3 shrink-0 text-danger"
            />
          ) : null}
          {b.overlaps.length > 0 && b.phase !== "failed" ? (
            <TriangleAlert
              aria-hidden
              className="ml-auto size-3 shrink-0 text-warn"
            />
          ) : null}
        </span>
        {roomy ? (
          <span className="relative block truncate font-mono text-[10px] leading-3 tabular-nums opacity-80">
            {b.phase === "running"
              ? `${hhmm(b.start)} · ${Math.round(b.progress * 100)}%`
              : hhmm(b.start)}
          </span>
        ) : null}
      </BlockShell>
    );
  };

  const nowY = (nowMin - dayStart) * ppm;
  const nowShown =
    today >= 0 && today <= 6 && nowMin >= dayStart && nowMin <= dayEnd;

  const grid = (
    <div className="flex flex-col">
      <div className="flex border-b border-hairline pb-1.5" aria-hidden>
        <span className="w-9 shrink-0" />
        {ALL.map((d) => {
          const { n } = dateOf(d);
          const isToday = d === today;
          return (
            <span
              key={d}
              className={cn(
                "flex min-w-0 flex-1 items-baseline justify-center gap-1 text-[11px]",
                isToday ? "font-semibold text-(--rw-accent)" : "text-ink-2",
              )}
            >
              {DAY_SHORT[d]}
              <span className="font-mono text-[10px] tabular-nums opacity-80">
                {n}
              </span>
            </span>
          );
        })}
      </div>
      <div
        ref={scrollerRef}
        className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        style={{ maxHeight }}
      >
        <div className="relative flex" style={{ height: gridH }}>
          <div className="relative w-9 shrink-0" aria-hidden>
            {Array.from({ length: h1 - h0 }, (_, i) => (
              <span
                key={i}
                className="absolute right-1.5 font-mono text-[10px] leading-none text-ink-3 tabular-nums transition-opacity duration-150"
                style={{
                  top: i * hh + 2,
                  // The now pill rides this gutter; the hour under it steps aside.
                  opacity: nowShown && Math.abs(i * hh + 6 - nowY) < 12 ? 0 : 1,
                }}
              >
                {String((h0 + i) % 24).padStart(2, "0")}
              </span>
            ))}
            {nowShown ? (
              <motion.span
                className="absolute right-0.5 z-10 -mt-2 inline-flex h-4 items-center rounded-full bg-(--rw-accent) px-1 font-mono text-[9px] font-semibold text-[oklch(0.99_0_0)] tabular-nums"
                initial={false}
                animate={{ y: r2(nowY) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                style={{ top: 0 }}
              >
                {hhmm(nowMin)}
              </motion.span>
            ) : null}
          </div>
          <div
            role="grid"
            aria-label={`${title}, week of ${dateOf(0).n} ${dateOf(0).m}`}
            aria-describedby={hintId}
            className="relative grid min-w-0 flex-1 grid-cols-7"
          >
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-px bg-hairline"
                style={{ top: Math.min(i * hh, gridH - 1) }}
              />
            ))}
            {ALL.map((d) => (
              <div
                key={d}
                role="row"
                aria-label={`${DAY_LONG[d]} ${dateOf(d).n} ${dateOf(d).m}`}
                className={cn(
                  "relative border-l border-hairline",
                  d === today &&
                    "bg-[color-mix(in_oklab,var(--rw-accent)_5%,transparent)]",
                )}
              >
                {(byDay[d] ?? []).map(blockCell)}
              </div>
            ))}
            {nowShown ? (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-[4]"
                initial={false}
                animate={{ y: r2(nowY) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              >
                <span className="absolute inset-x-0 border-t border-dashed border-[color-mix(in_oklab,var(--rw-accent)_35%,transparent)]" />
                <span
                  className="absolute -top-px h-[2px] bg-(--rw-accent)"
                  style={{
                    left: `${r2((today / 7) * 100)}%`,
                    width: `${r2(100 / 7)}%`,
                  }}
                />
                <span
                  className="absolute -top-[3.5px] -ml-[3.5px] size-[7px] rounded-full bg-(--rw-accent)"
                  style={{ left: `${r2((today / 7) * 100)}%` }}
                />
              </motion.div>
            ) : null}
          </div>
        </div>
        {routines.length === 0 ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--card)_85%,transparent)] text-center">
            <p className="text-[13px] text-foreground">
              No routines scheduled this week.
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onEditSchedule?.(null)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <CalendarClock aria-hidden className="size-3.5" />
              Add a routine
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  /* ------------------------------- the agenda ---------------------------- */

  const rowPad = Math.max(1, Math.round((hh - 16) / 6));
  const agendaBlocks = byDay[agendaDay] ?? [];
  const setDay = (d: number) => {
    const next = Math.min(6, Math.max(0, d));
    if (day === undefined) setOwnDay(next);
    onDayChange?.(next);
  };
  const stripRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onStripKey = (event: React.KeyboardEvent, d: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (d + 1) % 7;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (d + 6) % 7;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 6;
    if (next === null) return;
    event.preventDefault();
    setDay(next);
    stripRefs.current[next]?.focus();
  };

  const nowIndex = agendaBlocks.findIndex((b) => b.start + b.duration > nowMin);
  const agendaFocus =
    agendaBlocks.find((b) => b.key === focusKey) ??
    agendaBlocks.find((b) => b.phase === "running") ??
    agendaBlocks[Math.max(0, nowIndex)] ??
    null;

  const agenda = (
    <div className="flex flex-col gap-2.5">
      <div
        role="radiogroup"
        aria-label="Day"
        className="grid grid-cols-7 gap-1"
      >
        {ALL.map((d) => {
          const on = d === agendaDay;
          const dayBlocks = byDay[d] ?? [];
          return (
            <button
              key={d}
              ref={(node) => {
                stripRefs.current[d] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${DAY_LONG[d]} ${dateOf(d).n}, ${dayBlocks.length} ${dayBlocks.length === 1 ? "routine" : "routines"}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setDay(d)}
              onKeyDown={(event) => onStripKey(event, d)}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2 border text-[11px] transition-colors",
                on
                  ? "border-(--rw-accent) bg-(--rw-wash) text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2",
                d === today && !on && "text-(--rw-accent)",
                FOCUS,
              )}
            >
              <span className="leading-none font-medium">
                {DAY_SHORT[d]?.charAt(0)}
              </span>
              <span className="font-mono text-[10px] leading-none tabular-nums">
                {dateOf(d).n}
              </span>
              <span aria-hidden className="flex h-1.5 items-center gap-px">
                {dayBlocks.slice(0, 5).map((b) => (
                  <span
                    key={b.key}
                    className={cn(
                      "size-1 rounded-full",
                      b.phase === "scheduled" &&
                        "border border-[color-mix(in_oklab,var(--rw-accent)_60%,transparent)]",
                    )}
                    style={
                      b.phase === "scheduled"
                        ? undefined
                        : { backgroundColor: toneOf(b.phase) }
                    }
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {agendaBlocks.length === 0 ? (
        <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-4 text-center text-[12px] text-ink-3">
          {routines.length === 0
            ? "No routines scheduled this week."
            : `Nothing runs on ${DAY_LONG[agendaDay]}.`}
        </p>
      ) : (
        <ol
          role="list"
          aria-label={`${DAY_LONG[agendaDay]} agenda`}
          className="flex flex-col"
        >
          {agendaBlocks.map((b, i) => {
            const isFocus = agendaFocus?.key === b.key;
            const showNow = agendaDay === today && i === nowIndex;
            return (
              <li key={b.key}>
                {showNow ? (
                  <div aria-hidden className="flex items-center gap-2 py-1">
                    <span className="font-mono text-[10px] text-(--rw-accent) tabular-nums">
                      {hhmm(nowMin)}
                    </span>
                    <span className="h-px flex-1 bg-(--rw-accent)" />
                  </div>
                ) : null}
                <BlockShell
                  cellRef={(node) => {
                    if (node) cellRefs.current.set(`a:${b.key}`, node);
                    else cellRefs.current.delete(`a:${b.key}`);
                  }}
                  running={b.phase === "running"}
                  settled={firstKeys.has(b.key)}
                  motionSafe={motionSafe}
                  role="button"
                  tabIndex={isFocus ? 0 : -1}
                  aria-label={describe(b)}
                  aria-describedby={hintId}
                  onFocus={() => setFocusKey(b.key)}
                  onClick={() => setFocusKey(b.key)}
                  onKeyDown={(event) => {
                    const idx = agendaBlocks.indexOf(b);
                    let next: Block | undefined;
                    if (event.key === "ArrowDown")
                      next =
                        agendaBlocks[
                          Math.min(agendaBlocks.length - 1, idx + 1)
                        ];
                    else if (event.key === "ArrowUp")
                      next = agendaBlocks[Math.max(0, idx - 1)];
                    if (next) {
                      event.preventDefault();
                      setFocusKey(next.key);
                      cellRefs.current.get(`a:${next.key}`)?.focus();
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(b);
                    } else if (
                      !event.metaKey &&
                      !event.ctrlKey &&
                      (event.key === "r" || event.key === "R")
                    ) {
                      event.preventDefault();
                      runNow(b);
                    } else if (
                      !event.metaKey &&
                      !event.ctrlKey &&
                      (event.key === "p" || event.key === "P")
                    ) {
                      event.preventDefault();
                      togglePause(b);
                    }
                  }}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-2.5 rounded-2 px-2 transition-colors",
                    isFocus ? "bg-surface-2" : "hover:bg-surface-1",
                    FOCUS,
                  )}
                  style={{ paddingTop: rowPad + 3, paddingBottom: rowPad + 3 }}
                >
                  <span className="w-9 shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {hhmm(b.start)}
                  </span>
                  <span
                    aria-hidden
                    className="h-7 w-[3px] shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        b.phase === "scheduled"
                          ? "color-mix(in oklab, var(--rw-accent) 40%, transparent)"
                          : toneOf(b.phase),
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] leading-4 text-foreground",
                        b.paused &&
                          b.phase === "scheduled" &&
                          "text-ink-3 line-through",
                      )}
                    >
                      {b.routine.name}
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-ink-3">
                      {b.routine.agent} · {b.duration} min
                    </span>
                    {b.phase === "running" ? (
                      <span
                        aria-hidden
                        className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2"
                      >
                        <motion.span
                          className="block h-full bg-(--rw-accent)"
                          initial={false}
                          animate={{ width: `${r2(b.progress * 100)}%` }}
                          transition={
                            motionSafe ? springs.glide : { duration: 0 }
                          }
                        />
                      </span>
                    ) : null}
                  </span>
                  {b.phase === "running" || b.phase === "scheduled" ? (
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-medium",
                        b.phase === "running"
                          ? "text-(--rw-accent) tabular-nums"
                          : "text-ink-3",
                      )}
                    >
                      {b.phase === "running"
                        ? `${Math.round(b.progress * 100)}%`
                        : PHASE_WORD[b.phase]}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium",
                        blockStyle === "solid"
                          ? "text-[oklch(0.24_0.02_258)]"
                          : b.phase === "failed"
                            ? "text-danger"
                            : b.phase === "success"
                              ? "text-success"
                              : "text-ink-2",
                        blockStyle === "outline" && "border",
                      )}
                      style={
                        blockStyle === "solid"
                          ? {
                              backgroundColor: `oklch(from ${toneOf(b.phase)} 0.84 calc(c * 0.7) h)`,
                            }
                          : blockStyle === "outline"
                            ? {
                                borderColor: `color-mix(in oklab, ${toneOf(b.phase)} 70%, transparent)`,
                              }
                            : {
                                backgroundColor: `color-mix(in oklab, ${toneOf(b.phase)} 15%, transparent)`,
                              }
                      }
                    >
                      {PHASE_WORD[b.phase]}
                    </span>
                  )}
                </BlockShell>
              </li>
            );
          })}
          {agendaDay === today && nowIndex === -1 ? (
            <li aria-hidden className="flex items-center gap-2 py-1">
              <span className="font-mono text-[10px] text-(--rw-accent) tabular-nums">
                {hhmm(nowMin)}
              </span>
              <span className="h-px flex-1 bg-(--rw-accent)" />
            </li>
          ) : null}
        </ol>
      )}
    </div>
  );

  /* ------------------------------ inspector ------------------------------ */

  const insp = focusedBlock;
  const actionBtn = cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
    FOCUS,
  );
  const inspector =
    insp && ready ? (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
            <span className="truncate">{insp.routine.name}</span>
            <span className="shrink-0 font-normal text-ink-3">
              · {insp.routine.agent}
            </span>
          </p>
          <p className="truncate text-[12px] leading-4 text-ink-3">
            {scheduleText(insp.routine)}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: toneOf(insp.phase) }}
            />
            <span className="shrink-0 text-ink-2">
              {DAY_SHORT[insp.day]} {dateOf(insp.day).n} ·{" "}
              {insp.phase === "running"
                ? `Running, ${Math.round(insp.progress * 100)}%`
                : PHASE_WORD[insp.phase]}
            </span>
            {insp.run?.note || insp.overlaps.length ? (
              <span className="truncate text-ink-3" title={insp.run?.note}>
                · {insp.run?.note ?? `Overlaps ${insp.overlaps.join(" and ")}.`}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {insp.run ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => open(insp)}
              className={actionBtn}
            >
              <SquareArrowOutUpRight aria-hidden className="size-3" />
              Open run
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            aria-keyshortcuts="R"
            onClick={() => runNow(insp)}
            className={actionBtn}
          >
            <Zap aria-hidden className="size-3" />
            Run now
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-keyshortcuts="P"
            onClick={() => togglePause(insp)}
            className={actionBtn}
          >
            {pausedOf(insp.routine) ? (
              <Play aria-hidden className="size-3" />
            ) : (
              <Pause aria-hidden className="size-3" />
            )}
            {pausedOf(insp.routine) ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEditSchedule?.(insp.routine)}
            aria-label={`Edit schedule of ${insp.routine.name}`}
            className={cn(actionBtn, "px-2")}
          >
            <Pencil aria-hidden className="size-3" />
          </button>
        </div>
      </div>
    ) : null;

  /* -------------------------------- header ------------------------------- */

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="min-w-0 flex-1 basis-44">
        <div className="flex items-center gap-2">
          <CalendarClock
            aria-hidden
            className="size-4 shrink-0 text-(--rw-accent)"
          />
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-ink-3">
          {team} · week of {dateOf(0).n} {dateOf(0).m}
        </p>
      </div>
      {ready ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-ink-2 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            {counts.success} ok
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-1.5 rounded-full bg-danger" />
            {counts.failed} failed
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-1.5 rounded-full bg-ink-3" />
            {counts.skipped} skipped
          </span>
          {today >= 0 && today <= 6 ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-(--rw-wash) px-2 text-(--rw-accent)">
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-(--rw-accent)"
              />
              {DAY_SHORT[today]} {hhmm(nowMin)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const body =
    status === "loading" ? (
      <div className="flex flex-col gap-2" aria-busy="true">
        <div
          className="grid grid-cols-7 gap-1.5"
          style={{ height: Math.min(gridH, 200) }}
        >
          {ALL.map((d) => (
            <span
              key={d}
              className="rounded-2 bg-surface-2"
              style={{ opacity: 1 - d * 0.08 }}
            />
          ))}
        </div>
        <p className="text-[12px] text-ink-3">Loading the week…</p>
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <p className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          The week’s schedule could not be loaded.
        </p>
        <button type="button" onClick={onReload} className={actionBtn}>
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : (
      <>
        <div className="hidden @min-[32rem]/routine-week:block">{grid}</div>
        <div className="@min-[32rem]/routine-week:hidden">{agenda}</div>
        {inspector}
      </>
    );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/routine-week relative flex w-full flex-col gap-3 overflow-hidden rounded-4 border border-hairline bg-card p-4 text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={
        {
          "--rw-accent": accent,
          "--rw-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
        } as React.CSSProperties
      }
    >
      {header}
      {body}
      <p id={hintId} className="sr-only">
        Arrow keys move between runs, Enter opens a run or edits a slot that has
        not run, R runs the routine now, P pauses it.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
