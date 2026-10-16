"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Lock,
  LockOpen,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type PlanBarStyle = "solid" | "soft" | "track";
export type PlanAccent = "cobalt" | "moss" | "plum" | "slate";
export type PlanStatus = "ready" | "loading" | "error";

export type PlanTask = {
  id: string;
  name: string;
  /** Length in days. */
  days: number;
  /** Tasks that must finish before this one starts. */
  after?: string[];
  /** Holds its dates whatever the deadline does. */
  locked?: boolean;
  /** First day while locked, ms at UTC midnight. */
  start?: number;
};

export type BackwardPlanProps = {
  /** How a task is drawn: a pigment bar, a tinted bar with a strong leading edge, or a thin rail with its dates above. @default "soft" */
  barStyle?: PlanBarStyle;
  /** Pixels per day on the board: the scale of the timeline. @default 12 */
  dayWidth?: number;
  /** The bars' pigment. @default "cobalt" */
  accent?: PlanAccent;
  /** Controlled tasks. Locks, pinned moves and lengths are reported through `onTasksChange`. */
  tasks?: PlanTask[];
  /** Initial tasks when uncontrolled. @default defaultPlanTasks */
  defaultTasks?: PlanTask[];
  /** Fires with every task after a lock, a pinned move or a length change. */
  onTasksChange?: (tasks: PlanTask[]) => void;
  /** Controlled deadline: the handover day, ms at UTC midnight. */
  deadline?: number;
  /** Initial deadline when uncontrolled. @default defaultPlanDeadline */
  defaultDeadline?: number;
  /** Fires from the drag release or the key that moved the deadline, with the new day. */
  onDeadlineChange?: (deadline: number) => void;
  /** Fires when one task's pinned dates or length change, with the task. */
  onTaskChange?: (task: PlanTask) => void;
  /** Fires when a task is locked or unlocked. */
  onLock?: (task: PlanTask, locked: boolean) => void;
  /** Today, ms. Tasks that would start before it turn amber. Never read from the clock. @default defaultPlanNow */
  now?: number;
  /** Earliest and latest deadline, in days after `now`. @default [10, 70] */
  range?: [number, number];
  /** Whether the plan has arrived. @default "ready" */
  status?: PlanStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Fieldline site handover" */
  title?: string;
  /** Height of the surface, px; the board scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be moved or locked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const on = (month: number, day: number) => Date.UTC(2026, month, day);

/** Monday 19 October 2026, 09:00. */
export const defaultPlanNow = Date.UTC(2026, 9, 19, 9, 0);
/** Friday 27 November 2026: the Basinworks depot is handed over. */
export const defaultPlanDeadline = on(10, 27);

/**
 * Fieldline's handover of the Basinworks depot. The steel order is locked
 * to the supplier's slot, so the survey ahead of it is anchored there.
 */
export const defaultPlanTasks: PlanTask[] = [
  { id: "survey", name: "Survey sign-off", days: 3 },
  {
    id: "steel",
    name: "Order steel",
    days: 5,
    after: ["survey"],
    locked: true,
    start: on(9, 30),
  },
  { id: "ground", name: "Groundworks", days: 6, after: ["survey"] },
  { id: "frame", name: "Frame & roof", days: 8, after: ["steel", "ground"] },
  { id: "services", name: "Services first fix", days: 5, after: ["frame"] },
  { id: "fitout", name: "Fit-out", days: 6, after: ["services"] },
  { id: "pack", name: "Handover pack", days: 3, after: ["services"] },
  { id: "snag", name: "Snagging walk", days: 2, after: ["fitout"] },
];

const DEFAULT_RANGE: [number, number] = [10, 70];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** Filled shapes are pigment: each hue at a fixed lightness, so both themes read. */
const ACCENTS: Record<PlanAccent, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.7 0.14 h)",
  moss: "oklch(from var(--success) 0.72 0.13 h)",
  plum: "oklch(from var(--accent-bright) 0.68 0.13 318)",
  slate: "oklch(from var(--ink-3) 0.68 0.04 250)",
};
const AMBER = "oklch(from var(--warn) 0.8 0.15 h)";

const WEEK_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTH_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " ",
);
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ROW_H = 44;
const AXIS_H = 44;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Whole days since the epoch. */
const dayOf = (ms: number) => Math.floor(ms / DAY);
/** Monday is 0. The epoch was a Thursday. */
const weekday = (d: number) => (((d + 3) % 7) + 7) % 7;
const partsOf = (d: number) => {
  const date = new Date(d * DAY);
  return { m: date.getUTCMonth(), day: date.getUTCDate() };
};
const shortDate = (d: number) => {
  const p = partsOf(d);
  return `${WEEK_SHORT[weekday(d)] ?? ""} ${p.day} ${MONTH_SHORT[p.m] ?? ""}`;
};
const longDate = (d: number) => {
  const p = partsOf(d);
  return `${WEEK_LONG[weekday(d)] ?? ""} ${p.day} ${MONTH_LONG[p.m] ?? ""}`;
};
/** "3–8 Nov", or "30 Oct – 4 Nov" across a month. Both days inclusive. */
const spanDates = (from: number, to: number) => {
  const a = partsOf(from);
  const b = partsOf(to);
  return a.m === b.m
    ? `${a.day}–${b.day} ${MONTH_SHORT[b.m] ?? ""}`
    : `${a.day} ${MONTH_SHORT[a.m] ?? ""} – ${b.day} ${MONTH_SHORT[b.m] ?? ""}`;
};
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** Successors first: the order a pull travels back down the train. */
function reverseTopo(tasks: PlanTask[]): PlanTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const order: PlanTask[] = [];
  const visit = (t: PlanTask) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    for (const p of t.after ?? []) {
      const pre = byId.get(p);
      if (pre) visit(pre);
    }
    order.push(t);
  };
  for (const t of tasks) visit(t);
  return order.reverse();
}

const successorsOf = (tasks: PlanTask[]) => {
  const out = new Map<string, PlanTask[]>();
  for (const t of tasks) out.set(t.id, []);
  for (const t of tasks) for (const p of t.after ?? []) out.get(p)?.push(t);
  return out;
};

type Slot = { start: number; finish: number };

/**
 * Latest start for every task: a task with nothing after it finishes at the
 * end of the deadline day; any other task finishes when the earliest of
 * those after it starts. A locked task keeps its pinned start, and the tasks
 * before it anchor to it instead.
 */
function schedule(tasks: PlanTask[], deadlineDay: number) {
  const succ = successorsOf(tasks);
  const slots = new Map<string, Slot>();
  for (const t of reverseTopo(tasks)) {
    if (t.locked && t.start !== undefined) {
      const s = dayOf(t.start);
      slots.set(t.id, { start: s, finish: s + t.days });
      continue;
    }
    let finish = deadlineDay + 1;
    for (const n of succ.get(t.id) ?? []) {
      const ns = slots.get(n.id);
      if (ns) finish = Math.min(finish, ns.start);
    }
    slots.set(t.id, { start: finish - t.days, finish });
  }
  // A task that must start before something it needs has finished waits on it.
  const waits = new Map<string, string>();
  for (const t of tasks) {
    const own = slots.get(t.id);
    if (!own) continue;
    for (const p of t.after ?? []) {
      const ps = slots.get(p);
      if (ps && own.start < ps.finish) waits.set(t.id, p);
    }
  }
  return { slots, waits };
}

/** Depth from the deadline: how many cars stand between a task and the flag. */
function depthsOf(tasks: PlanTask[]) {
  const succ = successorsOf(tasks);
  const depth = new Map<string, number>();
  for (const t of reverseTopo(tasks)) {
    const next = succ.get(t.id) ?? [];
    depth.set(
      t.id,
      next.length === 0
        ? 0
        : 1 + Math.max(...next.map((n) => depth.get(n.id) ?? 0)),
    );
  }
  return depth;
}

/** A spring step at unit mass, semi-implicit: stable at a frame's dt. */
const SNAP_K = springs.snap.stiffness / springs.snap.mass;
const SNAP_C = springs.snap.damping / springs.snap.mass;
const RECOIL_K = springs.recoil.stiffness / springs.recoil.mass;
const RECOIL_C = springs.recoil.damping / springs.recoil.mass;
type Body = { x: number; v: number };
/** Advances a body toward its target in place: no allocation per frame. */
const stepSpring = (
  b: Body,
  target: number,
  dt: number,
  k: number,
  c: number,
) => {
  b.v += (k * (target - b.x) - c * b.v) * dt;
  b.x += b.v * dt;
};
const resting = (b: Body, target: number) =>
  Math.abs(b.x - target) < 0.0005 && Math.abs(b.v) < 0.005;

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A date that rolls when the plan moves, a beat after the row ahead of it. */
function RollDate({
  text,
  delay,
  motionSafe,
  className,
}: {
  text: string;
  delay: number;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex overflow-clip", className)}
      style={{ height: "1.3em", lineHeight: "1.3em" }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block whitespace-nowrap"
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.step : 0,
            transition: { duration: durations.fast },
          }}
          transition={
            motionSafe
              ? {
                  y: { ...springs.snap, delay },
                  opacity: { duration: durations.fast, delay },
                }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** One coupling: an elbow from a task's end to the start of the task after it. */
function Coupling({
  fromX,
  toX,
  fromWidth,
  fromRow,
  toRow,
  broken,
}: {
  fromX: MotionValue<number>;
  toX: MotionValue<number>;
  fromWidth: number;
  fromRow: number;
  toRow: number;
  broken: boolean;
}) {
  const d = useTransform([fromX, toX] as MotionValue<number>[], ([a, b]) => {
    const x1 = r2((a as number) + fromWidth);
    const x2 = r2(b as number);
    const y1 = fromRow * ROW_H + ROW_H / 2;
    const y2 = toRow * ROW_H + ROW_H / 2;
    const down = y2 > y1 ? 1 : -1;
    if (x2 - x1 >= 10) {
      const mx = r2(x1 + 5);
      return `M ${x1} ${y1} H ${mx} V ${y2 - down * 4} Q ${mx} ${y2} ${r2(mx + 4)} ${y2} H ${x2}`;
    }
    // Overlapping cars: the coupling folds back under the bar ahead.
    const mid = r2((y1 + y2) / 2);
    return `M ${x1} ${y1} h 5 V ${mid} H ${r2(x2 - 5)} V ${y2} H ${x2}`;
  });
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={broken ? 1.5 : 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={broken ? "3 3" : undefined}
      className={cn(broken ? "stroke-danger" : "stroke-ink-3/60")}
    />
  );
}

type BarEvents = {
  onGrab: (task: PlanTask) => void;
  onPull: (task: PlanTask, dx: number) => void;
  onRelease: (task: PlanTask, vx: number) => void;
  onLose: () => void;
  onKey: (event: React.KeyboardEvent, task: PlanTask) => void;
};

/** One car of the train. Its own component: it owns a drag. */
function TaskBar({
  task,
  row,
  x,
  lean,
  width,
  slot,
  barStyle,
  past,
  waits,
  disabled,
  label,
  events,
}: {
  task: PlanTask;
  row: number;
  x: MotionValue<number>;
  lean: MotionValue<number>;
  width: number;
  slot: Slot;
  barStyle: PlanBarStyle;
  past: boolean;
  waits: boolean;
  disabled: boolean;
  label: string;
  events: BarEvents;
}) {
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => events.onGrab(task),
    onMove: ({ offset }) => events.onPull(task, offset.x),
    onEnd: ({ velocity }) => events.onRelease(task, velocity.x),
    onCancel: () => events.onLose(),
  });
  const shift = useTransform([x, lean] as MotionValue<number>[], ([a, l]) =>
    r2((a as number) + (l as number)),
  );
  const skew = useTransform(lean, (l) => r2(-l * 0.9));
  const track = barStyle === "track";
  const h = track ? 6 : 24;
  const top = row * ROW_H + (track ? 27 : (ROW_H - h) / 2);
  const inside =
    width >= 92
      ? spanDates(slot.start, slot.finish - 1)
      : width >= 34
        ? `${task.days} d`
        : "";
  const surface =
    barStyle === "solid"
      ? "bg-(--bp-bar) text-[oklch(0.22_0.02_258)]"
      : barStyle === "soft"
        ? "border border-[color-mix(in_oklab,var(--bp-bar)_55%,transparent)] border-l-[3px] border-l-(--bp-bar) bg-[color-mix(in_oklab,var(--bp-bar)_26%,var(--card))] text-foreground"
        : "bg-(--bp-bar)";
  return (
    <motion.button
      type="button"
      data-bp-bar={task.id}
      aria-label={label}
      {...drag}
      onKeyDown={(event) => events.onKey(event, task)}
      className={cn(
        "absolute left-0 flex touch-pan-y items-center gap-1 select-none",
        track ? "rounded-full" : "rounded-2 px-1.5",
        disabled
          ? "cursor-default"
          : task.locked
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-ew-resize",
        surface,
        past ? "[--bp-bar:var(--bp-amber)]" : "[--bp-bar:var(--bp-accent)]",
        waits && "ring-2 ring-danger ring-offset-1 ring-offset-card",
        FOCUS_RING,
      )}
      style={{
        top,
        width,
        height: h,
        x: shift,
        skewX: skew,
      }}
    >
      {track ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[19px] left-0 flex items-center gap-1 font-mono text-[10px] whitespace-nowrap text-ink-2 tabular-nums"
        >
          {task.locked ? <Lock className="size-2.5 shrink-0" /> : null}
          {inside}
        </span>
      ) : (
        <>
          {task.locked ? (
            <Lock aria-hidden className="size-3 shrink-0 opacity-80" />
          ) : null}
          <span
            aria-hidden
            className="truncate font-mono text-[10.5px] leading-none tabular-nums"
          >
            {inside}
          </span>
        </>
      )}
      {task.locked && !track ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, color-mix(in oklab, var(--bp-bar) 70%, transparent) 0 1px, transparent 1px 6px)",
          }}
        />
      ) : null}
    </motion.button>
  );
}

type TrainConfig = {
  list: PlanTask[];
  dw: number;
  domainStart: number;
  motionSafe: boolean;
  topo: { order: PlanTask[]; succ: Map<string, PlanTask[]> };
  xs: Map<string, MotionValue<number>>;
  leans: Map<string, MotionValue<number>>;
  flagX: MotionValue<number>;
};

/**
 * The train: every car's displayed finish is a body on a spring (the snap
 * calibration) whose target is the start of the car after it as it is drawn
 * this frame — so a pull travels back down the train a beat a car. One rAF
 * loop runs while anything moves and stops when everything rests; it never
 * runs unseen. Nothing here allocates per frame.
 */
function createTrain(deadlineDay: number) {
  const s: Sim = {
    cars: new Map(),
    lean: new Map(),
    dl: { x: deadlineDay, v: 0 },
    dlTarget: deadlineDay,
    holding: false,
    holdFrom: deadlineDay,
    pin: null,
    raf: 0,
    last: 0,
  };
  let cfg: TrainConfig | null = null;
  let visible = true;
  let placed = false;

  const targetsFor = (dl: number) => {
    const out = new Map<string, number>();
    if (!cfg) return out;
    for (const t of cfg.topo.order) {
      if (t.locked && t.start !== undefined) {
        const pinned = s.pin && s.pin.id === t.id ? s.pin.x : dayOf(t.start);
        out.set(t.id, pinned + t.days);
        continue;
      }
      let finish = dl + 1;
      for (const n of cfg.topo.succ.get(t.id) ?? []) {
        const nf = out.get(n.id);
        if (nf !== undefined) finish = Math.min(finish, nf - n.days);
      }
      out.set(t.id, finish);
    }
    return out;
  };

  const write = () => {
    if (!cfg) return;
    const { list, dw, domainStart, xs, leans, flagX } = cfg;
    for (const t of list) {
      const car = s.cars.get(t.id);
      if (!car) continue;
      xs.get(t.id)?.set(r2((car.x - t.days - domainStart) * dw));
      leans.get(t.id)?.set(r2(s.lean.get(t.id)?.x ?? 0));
    }
    flagX.set(r2((s.dl.x + 1 - domainStart) * dw));
  };

  /** Every car straight to its place: reduced motion, off screen, hidden. */
  const settleNow = () => {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (!cfg) return;
    if (!s.holding) {
      s.dl.x = s.dlTarget;
      s.dl.v = 0;
    }
    if (s.pin && !s.pin.held) {
      s.pin.x = s.pin.target;
      s.pin.v = 0;
    }
    const at = targetsFor(s.holding ? Math.round(s.dl.x) : s.dl.x);
    for (const [id, f] of at) s.cars.set(id, { x: f, v: 0 });
    for (const t of cfg.list) s.lean.set(t.id, { x: 0, v: 0 });
    write();
    // A finished hand move hands its car back to the task's own dates.
    if (s.pin && !s.pin.held) s.pin = null;
  };

  const frame = (time: number) => {
    if (!cfg) {
      s.raf = 0;
      return;
    }
    const { list, topo } = cfg;
    const dt = Math.min(0.034, Math.max(0.001, (time - s.last) / 1000));
    s.last = time;
    let moving = s.holding || Boolean(s.pin?.held);
    // Two half steps a frame keep the couplings stable on a slow frame.
    for (let sub = 0; sub < 2; sub++) {
      const h = dt / 2;
      if (!s.holding) stepSpring(s.dl, s.dlTarget, h, SNAP_K, SNAP_C);
      if (s.pin && !s.pin.held)
        stepSpring(s.pin, s.pin.target, h, SNAP_K, SNAP_C);
      // Successors first: each car follows where the car after it is now,
      // so the pull reaches it a beat after the one ahead.
      for (const t of topo.order) {
        let car = s.cars.get(t.id);
        if (!car) {
          car = { x: s.dl.x + 1, v: 0 };
          s.cars.set(t.id, car);
        }
        if (t.locked && t.start !== undefined) {
          car.x =
            (s.pin && s.pin.id === t.id ? s.pin.x : dayOf(t.start)) + t.days;
          car.v = 0;
          // Toward the pull while it lasts; upright again on recoil.
          const lean = clamp(
            s.holding ? (s.dl.x - s.holdFrom) * 0.35 : 0,
            -6,
            6,
          );
          let l = s.lean.get(t.id);
          if (!l) {
            l = { x: 0, v: 0 };
            s.lean.set(t.id, l);
          }
          stepSpring(l, lean, h, RECOIL_K, RECOIL_C);
          if (Math.abs(l.x - lean) > 0.01 || Math.abs(l.v) > 0.05)
            moving = true;
          continue;
        }
        let target = s.dl.x + 1;
        for (const n of topo.succ.get(t.id) ?? []) {
          const next = s.cars.get(n.id);
          if (next) target = Math.min(target, next.x - n.days);
        }
        stepSpring(car, target, h, SNAP_K, SNAP_C);
        if (!resting(car, target)) moving = true;
      }
    }
    if (!s.holding && !resting(s.dl, s.dlTarget)) moving = true;
    if (s.pin && !s.pin.held && !resting(s.pin, s.pin.target)) moving = true;
    if (!moving || list.length === 0) {
      // Settled: land exactly on whole days and stop the loop.
      s.raf = 0;
      settleNow();
      return;
    }
    write();
    s.raf = requestAnimationFrame(frame);
  };

  /** Starts the loop if anything should move; never while unseen. */
  const kick = () => {
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!cfg || !cfg.motionSafe || !visible || hidden) {
      settleNow();
      return;
    }
    if (s.raf) return;
    s.last = performance.now();
    s.raf = requestAnimationFrame(frame);
  };

  return {
    s,
    configure(next: TrainConfig) {
      cfg = next;
    },
    /** The committed plan changed: the first time place, after that pull. */
    retarget(day: number) {
      if (!s.holding) s.dlTarget = day;
      if (!placed) {
        placed = true;
        settleNow();
        return;
      }
      kick();
    },
    setVisible(next: boolean) {
      visible = next;
      if (!next) settleNow();
    },
    /** The deadline springs to a whole day, carrying a release velocity. */
    aim(day: number, velocity = 0) {
      s.dlTarget = day;
      s.dl.v = velocity;
      kick();
    },
    /** Takes hold of the flag (or the whole train); returns where it was. */
    hold() {
      s.holding = true;
      s.holdFrom = s.dl.x;
      kick();
      return s.dl.x;
    },
    /** Puts the held deadline at a day, fractional, 1:1 under the finger. */
    holdAt(day: number) {
      s.dl.x = day;
      s.dl.v = 0;
      if (!cfg?.motionSafe) settleNow();
    },
    /** Lets go of the deadline; returns where it was let go. */
    letGo() {
      s.holding = false;
      return s.dl.x;
    },
    /** Takes hold of a locked car at its pinned first day. */
    grabPin(id: string, from: number) {
      s.pin = { id, x: from, v: 0, target: from, held: true };
      kick();
    },
    /** Puts a held locked car at a day, fractional. */
    pinAt(day: number) {
      if (!s.pin) return;
      s.pin.x = day;
      if (!cfg?.motionSafe) settleNow();
    },
    /** Lets go of a locked car toward a whole day; returns where it was let go. */
    dropPin(day: number | null, velocity = 0) {
      if (!s.pin) return null;
      const at = s.pin.x;
      s.pin.held = false;
      if (day !== null) {
        s.pin.target = day;
        s.pin.v = velocity;
      } else {
        s.pin.target = Math.round(at);
      }
      kick();
      return at;
    },
    /** A locked car moved by a key: it travels from where it was. */
    nudgePin(id: string, from: number, to: number) {
      s.pin = { id, x: from, v: 0, target: to, held: false };
    },
    /** A lost pointer: everything goes back to the committed plan. */
    cancel(day: number) {
      s.holding = false;
      if (s.pin) {
        s.pin.held = false;
        s.pin.target = Math.round(s.pin.x);
      }
      s.dlTarget = day;
      kick();
    },
    settleNow,
    kick,
    stop() {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    },
  };
}

/* ----------------------------------------------------------------------- */
/*                                The planner                               */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

type Sim = {
  /** Each car's displayed finish, in days (fractional while moving). */
  cars: Map<string, Body>;
  /** Locked cars' lean toward a pull, px. */
  lean: Map<string, Body>;
  /** The deadline's displayed day, fractional while held or springing. */
  dl: Body;
  dlTarget: number;
  holding: boolean;
  /** The deadline when the hold began; the pull is measured from it. */
  holdFrom: number;
  /** A locked car being moved by hand or by keys. */
  pin: (Body & { id: string; target: number; held: boolean }) | null;
  raf: number;
  last: number;
};

/**
 * A plan laid out backwards from its deadline. Every task is scheduled as
 * late as it can be — the last ones finish on the handover day, the rest
 * finish when the next one starts — and drawn as a car on a timeline that
 * ends at the deadline flag. Dragging the flag (or any unlocked car) pulls
 * the train: each car's finish follows the start of the car after it
 * through a spring from the calibration set — `snap`, one crisp overshoot, a
 * coupling taking up slack — integrated per frame in one loop, so the pull
 * travels back down the train and each car settles a beat after the one
 * ahead. A release projects the throw to a whole day and the flag springs
 * there on snap with the release velocity. Cars pushed before today turn
 * amber. Locked cars hold their dates, leaning toward the pull and
 * springing upright on recoil when it lets go; the tasks ahead of them
 * anchor to them, and a task that would start before one it needs is
 * ringed and says it waits.
 *
 * The flag is a slider: arrows move the deadline a day, Page keys a week.
 * Tab reaches each task; L locks it, arrows move a locked task, Shift and
 * the arrows change its length. Narrow containers show a list with start
 * dates. Under reduced motion every car jumps to its place.
 */
export function BackwardPlan({
  barStyle = "soft",
  dayWidth = 12,
  accent = "cobalt",
  tasks,
  defaultTasks,
  onTasksChange,
  deadline,
  defaultDeadline = defaultPlanDeadline,
  onDeadlineChange,
  onTaskChange,
  onLock,
  now = defaultPlanNow,
  range = DEFAULT_RANGE,
  status = "ready",
  onRetry,
  title = "Fieldline site handover",
  height = 540,
  disabled = false,
  className,
}: BackwardPlanProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const today = dayOf(now);
  const dw = Math.round(clamp(dayWidth, 8, 40));
  const minDay = today + range[0];
  const maxDay = today + Math.max(range[0], range[1]);

  /* ------------------------------- state --------------------------------- */

  const [ownTasks, setOwnTasks] = React.useState<PlanTask[]>(
    () => defaultTasks ?? defaultPlanTasks,
  );
  const list = tasks ?? ownTasks;
  const [ownDeadline, setOwnDeadline] = React.useState(() =>
    clamp(dayOf(defaultDeadline), minDay, maxDay),
  );
  const committed = clamp(
    deadline !== undefined ? dayOf(deadline) : ownDeadline,
    minDay,
    maxDay,
  );
  /** The snapped deadline while the flag is held, else the committed one. */
  const [liveDay, setLiveDay] = React.useState<number | null>(null);
  const shownDay = liveDay ?? committed;
  /** A locked task's snapped start while it is being moved by hand. */
  const [livePin, setLivePin] = React.useState<{
    id: string;
    start: number;
  } | null>(null);
  const shownTasks = livePin
    ? list.map((t) =>
        t.id === livePin.id ? { ...t, start: livePin.start * DAY } : t,
      )
    : list;
  const plan = schedule(shownTasks, shownDay);
  const depth = depthsOf(list);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ geometry ------------------------------- */

  // The board's days are fixed by the tasks and the range, so dragging never
  // rescales it; it reaches a little past both ends.
  const critical = React.useMemo(() => {
    const succ = successorsOf(list);
    const longest = new Map<string, number>();
    for (const t of reverseTopo(list)) {
      const next = succ.get(t.id) ?? [];
      longest.set(
        t.id,
        t.days + Math.max(0, ...next.map((n) => longest.get(n.id) ?? 0)),
      );
    }
    return Math.max(0, ...longest.values());
  }, [list]);
  const pinnedMin = Math.min(
    today,
    ...list
      .filter((t) => t.start !== undefined)
      .map((t) => dayOf(t.start ?? 0)),
  );
  const domainStart = Math.min(
    today - 6,
    minDay + 1 - critical - 3,
    pinnedMin - 4,
  );
  const domainEnd = maxDay + 6;
  const domainDays = domainEnd - domainStart;
  const trackW = domainDays * dw;
  const xOfDay = (d: number) => (d - domainStart) * dw;

  /* ------------------------------ motion --------------------------------- */

  const idsKey = list.map((t) => t.id).join("|");
  // One motion value per car, made once per set of ids; the loop writes them.
  const xs = React.useMemo(
    () =>
      new Map(
        list.map((t) => [
          t.id,
          motionValue(
            r2(((plan.slots.get(t.id)?.start ?? today) - domainStart) * dw),
          ),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const leans = React.useMemo(
    () => new Map(list.map((t) => [t.id, motionValue(0)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const flagX = useMotionValue(r2(xOfDay(committed + 1)));
  // The pull's order and couplings, worked out once per set of tasks so the
  // loop allocates nothing per frame.
  const topo = React.useMemo(
    () => ({ order: reverseTopo(list), succ: successorsOf(list) }),
    [list],
  );

  // The train lives outside React: one engine for the component's life,
  // told the latest tasks and scale after every render.
  const [train] = React.useState(() => createTrain(committed));
  React.useEffect(() => {
    train.configure({
      list,
      dw,
      domainStart,
      motionSafe,
      topo,
      xs,
      leans,
      flagX,
    });
  });
  const boardRef = React.useRef<HTMLDivElement | null>(null);

  // First placement, and again whenever the committed plan or the scale
  // changes: the loop retargets from wherever the cars are.
  const planKey = `${committed}|${dw}|${domainStart}|${list
    .map((t) => `${t.id}:${t.days}:${t.locked ? dayOf(t.start ?? 0) : "-"}`)
    .join(",")}`;
  React.useEffect(() => {
    train.retarget(committed);
  }, [planKey, committed, train]);

  // Off screen or hidden, the train jumps to its place and the loop stops.
  React.useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      train.setVisible(Boolean(entry?.isIntersecting));
    });
    io.observe(node);
    const onVis = () => {
      if (document.hidden) train.settleNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      train.stop();
    };
  }, [train]);

  /* ------------------------------ commits -------------------------------- */

  const writeTasks = (next: PlanTask[]) => {
    if (tasks === undefined) setOwnTasks(next);
    onTasksChange?.(next);
  };

  const sentence = (day: number, tl: PlanTask[]) => {
    const p = schedule(tl, day);
    const first = Math.min(...[...p.slots.values()].map((x) => x.start));
    const past = tl.filter((t) => (p.slots.get(t.id)?.start ?? 0) < today);
    const waiting = [...p.waits.entries()][0];
    const wait = waiting
      ? ` ${tl.find((t) => t.id === waiting[0])?.name ?? ""} waits on ${tl.find((t) => t.id === waiting[1])?.name ?? ""}.`
      : "";
    return `Handover ${longDate(day)}. The plan starts ${longDate(first)}${
      past.length > 0
        ? `: ${plural(past.length, "task", "tasks")} in the past.`
        : `, ${plural(first - today, "day", "days")} to spare.`
    }${wait}`;
  };

  const commitDeadline = (day: number, velocity = 0) => {
    const d = clamp(Math.round(day), minDay, maxDay);
    setLiveDay(null);
    if (deadline === undefined) setOwnDeadline(d);
    if (d !== committed) onDeadlineChange?.(d * DAY);
    say(sentence(d, list));
    train.aim(d, velocity);
  };

  const setLocked = (task: PlanTask, locked: boolean) => {
    if (disabled || !ready) return;
    const slotNow = plan.slots.get(task.id);
    const next = list.map((t) =>
      t.id === task.id
        ? {
            ...t,
            locked,
            start: locked ? (slotNow?.start ?? today) * DAY : undefined,
          }
        : t,
    );
    writeTasks(next);
    const changed = next.find((t) => t.id === task.id);
    if (changed) onLock?.(changed, locked);
    say(
      locked
        ? `${task.name} locked to ${slotNow ? spanDates(slotNow.start, slotNow.finish - 1) : ""}.`
        : `${task.name} unlocked; it follows the deadline again.`,
    );
  };

  const changeTask = (task: PlanTask, patch: Partial<PlanTask>) => {
    const next = list.map((t) => (t.id === task.id ? { ...t, ...patch } : t));
    writeTasks(next);
    const changed = next.find((t) => t.id === task.id);
    if (changed) {
      onTaskChange?.(changed);
      const p = schedule(next, committed).slots.get(changed.id);
      say(
        `${changed.name}, ${plural(changed.days, "day", "days")}${p ? `, ${spanDates(p.start, p.finish - 1)}` : ""}.`,
      );
    }
  };

  /* ------------------------------- gestures ------------------------------ */

  const grip = React.useRef<{ kind: "deadline" | "pin"; from: number } | null>(
    null,
  );

  const beginDeadline = () => {
    grip.current = { kind: "deadline", from: train.hold() };
  };
  const pullDeadline = (dx: number) => {
    const g = grip.current;
    if (!g || g.kind !== "deadline") return;
    // 1:1 under the finger, rubber-banded a week past either end.
    const at = rubberClamp(g.from + dx / dw, minDay, maxDay, 7);
    train.holdAt(at);
    const snapped = clamp(Math.round(at), minDay, maxDay);
    setLiveDay((d) => (d === snapped ? d : snapped));
  };
  const releaseDeadline = (vx: number) => {
    const g = grip.current;
    grip.current = null;
    if (!g || g.kind !== "deadline") return;
    const at = train.letGo();
    const v = vx / dw;
    commitDeadline(project(at, v, 0.99), clamp(v, -60, 60));
  };

  const events: BarEvents = {
    onGrab: (task) => {
      if (disabled || !ready) return;
      if (task.locked && task.start !== undefined) {
        const from = dayOf(task.start);
        train.grabPin(task.id, from);
        grip.current = { kind: "pin", from };
        return;
      }
      beginDeadline();
    },
    onPull: (task, dx) => {
      const g = grip.current;
      if (!g) return;
      if (g.kind === "deadline") {
        pullDeadline(dx);
        return;
      }
      const at = clamp(g.from + dx / dw, domainStart, domainEnd - task.days);
      train.pinAt(at);
      const snapped = Math.round(at);
      setLivePin((p) =>
        p && p.id === task.id && p.start === snapped
          ? p
          : { id: task.id, start: snapped },
      );
    },
    onRelease: (task, vx) => {
      const g = grip.current;
      if (!g) return;
      if (g.kind === "deadline") {
        releaseDeadline(vx);
        return;
      }
      grip.current = null;
      const live = livePin && livePin.id === task.id ? livePin.start : g.from;
      const day = Math.round(
        clamp(project(live, vx / dw, 0.99), domainStart, domainEnd - task.days),
      );
      train.dropPin(day, clamp(vx / dw, -60, 60));
      setLivePin(null);
      if (day !== dayOf(task.start ?? 0))
        changeTask(task, { start: day * DAY });
    },
    onLose: () => {
      grip.current = null;
      setLiveDay(null);
      setLivePin(null);
      train.cancel(committed);
    },
    onKey: (event, task) => {
      if (disabled || !ready) return;
      const k = event.key;
      if (k === "l" || k === "L") {
        event.preventDefault();
        setLocked(task, !task.locked);
        return;
      }
      if (k !== "ArrowLeft" && k !== "ArrowRight") return;
      event.preventDefault();
      const dir = k === "ArrowRight" ? 1 : -1;
      if (event.shiftKey) {
        const days = clamp(task.days + dir, 1, 60);
        if (days !== task.days) changeTask(task, { days });
        return;
      }
      if (!task.locked || task.start === undefined) {
        say(`${task.name} follows the deadline. Press L to lock it first.`);
        return;
      }
      const start = clamp(
        dayOf(task.start) + dir,
        domainStart,
        domainEnd - task.days,
      );
      train.nudgePin(task.id, dayOf(task.start), start);
      changeTask(task, { start: start * DAY });
    },
  };

  const flagDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !ready,
    onStart: () => beginDeadline(),
    onMove: ({ offset }) => pullDeadline(offset.x),
    onEnd: ({ velocity }) => releaseDeadline(velocity.x),
    onCancel: () => events.onLose(),
  });

  const onSliderKey = (event: React.KeyboardEvent) => {
    if (disabled || !ready) return;
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -7,
      PageUp: 7,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      const day = clamp(committed + step, minDay, maxDay);
      commitDeadline(day);
      revealDay(day);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const day = event.key === "Home" ? minDay : maxDay;
      commitDeadline(day);
      revealDay(day);
    }
  };

  /* ------------------------------ scrolling ------------------------------ */

  // Opens on today, so the line the plan must not cross is in view; if the
  // deadline would then fall off the right edge, the deadline wins.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const label = node.querySelector<HTMLElement>("[data-bp-labels]");
    const view = node.clientWidth - (label?.offsetWidth ?? 0);
    const fromToday = xOfDay(today - 1);
    const toDeadline = xOfDay(committed + 3) - view;
    node.scrollLeft = Math.max(0, Math.max(fromToday, toDeadline));
    // Only on mount and when the scale changes; the flag moving must not scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dw]);

  /** After a key moves the deadline, the flag is brought into view. */
  const revealDay = (day: number) => {
    const node = scrollRef.current;
    if (!node || node.offsetParent === null) return;
    const label = node.querySelector<HTMLElement>("[data-bp-labels]");
    const lw = label?.offsetWidth ?? 0;
    const view = node.clientWidth - lw;
    const x = xOfDay(day + 1);
    const left = node.scrollLeft;
    const behavior = motionSafe ? "smooth" : "auto";
    if (x - 96 < left) node.scrollTo({ left: Math.max(0, x - 96), behavior });
    else if (x + 24 > left + view)
      node.scrollTo({ left: x + 24 - view, behavior });
  };

  /* -------------------------------- parts -------------------------------- */

  const first = Math.min(...[...plan.slots.values()].map((s) => s.start));
  const pastIds = list.filter(
    (t) => (plan.slots.get(t.id)?.start ?? today) < today,
  );
  const waiting = [...plan.waits.entries()][0];
  const nameOf = (id: string) => list.find((t) => t.id === id)?.name ?? id;
  const summary = waiting
    ? {
        tone: "danger" as const,
        text: `${nameOf(waiting[0])} waits on ${list.find((t) => t.id === waiting[1])?.locked ? "locked " : ""}${nameOf(waiting[1])}`,
      }
    : pastIds.length > 0
      ? {
          tone: "warn" as const,
          text: `${plural(pastIds.length, "task", "tasks")} would start in the past`,
        }
      : {
          tone: "ok" as const,
          text: `Starts ${shortDate(first)} · ${plural(first - today, "day", "days")} to spare`,
        };

  const barLabel = (t: PlanTask) => {
    const s = plan.slots.get(t.id);
    if (!s) return t.name;
    const parts = [
      `${t.name}, ${plural(t.days, "day", "days")}, ${longDate(s.start)} to ${longDate(s.finish - 1)}`,
    ];
    if (t.locked) parts.push("locked");
    if (s.start < today) parts.push("starts in the past");
    const w = plan.waits.get(t.id);
    if (w) parts.push(`waits on ${nameOf(w)}`);
    return parts.join(", ");
  };

  const sliderText = `Handover ${longDate(shownDay)}, plan starts ${longDate(first)}`;

  const weekendStripe = (() => {
    // Saturday and Sunday shaded across the whole board by one gradient.
    const offset = ((5 - weekday(domainStart) + 7) % 7) * dw;
    return {
      backgroundImage: `linear-gradient(90deg, transparent 0 ${offset}px, color-mix(in oklab, var(--ink-3) 7%, transparent) ${offset}px ${offset + 2 * dw}px, transparent ${offset + 2 * dw}px ${7 * dw}px)`,
      backgroundSize: `${7 * dw}px 100%`,
    };
  })();

  const axisMarks: { d: number; month: boolean }[] = [];
  for (let d = domainStart; d < domainEnd; d++) {
    if (partsOf(d).day === 1) axisMarks.push({ d, month: true });
    else if (weekday(d) === 0) axisMarks.push({ d, month: false });
  }

  const deps: {
    from: PlanTask;
    to: PlanTask;
    fromRow: number;
    toRow: number;
  }[] = [];
  list.forEach((t, row) => {
    for (const p of t.after ?? []) {
      const fromRow = list.findIndex((x) => x.id === p);
      const from = list[fromRow];
      if (from) deps.push({ from, to: t, fromRow, toRow: row });
    }
  });

  const rowsH = list.length * ROW_H;

  const lockButton = (t: PlanTask, compact = false) => (
    <button
      type="button"
      aria-pressed={Boolean(t.locked)}
      aria-label={`Lock ${t.name}`}
      onClick={() => setLocked(t, !t.locked)}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2 transition-colors",
        compact ? "size-7" : "size-6",
        t.locked
          ? "text-foreground hover:bg-surface-2"
          : "text-ink-3 hover:bg-surface-2 hover:text-foreground",
        FOCUS_RING,
      )}
    >
      {t.locked ? (
        <Lock aria-hidden className="size-3.5" />
      ) : (
        <LockOpen aria-hidden className="size-3.5" />
      )}
    </button>
  );

  const board = (
    <div
      ref={scrollRef}
      className="relative hidden [scrollbar-width:thin] overflow-auto overscroll-contain @min-[40rem]:block"
    >
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `var(--bp-label) ${trackW}px`,
          width: `calc(var(--bp-label) + ${trackW}px)`,
        }}
      >
        {/* Corner and labels: pinned to the left edge while the track scrolls. */}
        <div
          className="sticky top-0 left-0 z-30 flex items-end border-r border-b border-hairline bg-card px-3 pb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          style={{ height: AXIS_H }}
        >
          Task
        </div>
        <div
          className="sticky top-0 z-20 overflow-clip border-b border-hairline bg-card [contain:paint]"
          style={{ height: AXIS_H }}
        >
          {axisMarks.map(({ d, month }) => (
            <span
              key={d}
              className={cn(
                "absolute flex flex-col justify-end border-l pb-1.5 pl-1 font-mono text-[10px] leading-none tabular-nums",
                month
                  ? "top-0 bottom-0 border-hairline-strong text-ink-2"
                  : "top-5 bottom-0 border-hairline text-ink-3",
              )}
              style={{ left: xOfDay(d) }}
            >
              {month ? (
                <span className="absolute top-1.5 left-1 font-sans text-[11px] font-medium whitespace-nowrap text-foreground">
                  {MONTH_LONG[partsOf(d).m]}
                </span>
              ) : (
                partsOf(d).day
              )}
            </span>
          ))}
          <span
            className="absolute top-1.5 rounded-full bg-[color-mix(in_oklab,var(--signal)_16%,var(--card))] px-1.5 py-0.5 text-[10px] leading-none font-medium text-signal"
            style={{ left: xOfDay(today) + 3 }}
          >
            Today
          </span>
          <motion.div
            className="absolute top-0 left-0 z-10"
            style={{ x: flagX }}
          >
            <div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label="Handover deadline"
              aria-valuemin={minDay - today}
              aria-valuemax={maxDay - today}
              aria-valuenow={shownDay - today}
              aria-valuetext={sliderText}
              aria-describedby={hintId}
              aria-disabled={disabled || undefined}
              onKeyDown={onSliderKey}
              {...flagDrag}
              className={cn(
                "absolute top-1.5 right-0 flex h-[30px] touch-none items-center gap-1 rounded-l-2 rounded-r-[3px] bg-foreground py-0 pr-2 pl-1.5 text-[11px] font-medium whitespace-nowrap text-background shadow-[0_2px_6px_color-mix(in_oklab,black_22%,transparent)] select-none",
                disabled ? "cursor-default" : "cursor-ew-resize",
                FOCUS_RING,
              )}
            >
              <Flag aria-hidden className="size-3.5 shrink-0" />
              <span className="tabular-nums">{shortDate(shownDay)}</span>
            </div>
          </motion.div>
        </div>

        <div
          data-bp-labels=""
          className="sticky left-0 z-20 border-r border-hairline bg-card"
          style={{ height: rowsH }}
        >
          {list.map((t) => {
            const s = plan.slots.get(t.id);
            const past = (s?.start ?? today) < today;
            return (
              <div
                key={t.id}
                className="flex items-center gap-1.5 border-b border-hairline pr-1.5 pl-3"
                style={{ height: ROW_H }}
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <p
                    className="truncate text-[12.5px] font-medium"
                    title={t.name}
                  >
                    {t.name}
                  </p>
                  <p
                    className={cn(
                      "truncate font-mono text-[10.5px] tabular-nums",
                      past
                        ? "text-warn"
                        : plan.waits.has(t.id)
                          ? "text-danger"
                          : "text-ink-3",
                    )}
                  >
                    {t.days} d{s ? ` · ${shortDate(s.start)}` : ""}
                  </p>
                </div>
                {lockButton(t)}
              </div>
            );
          })}
        </div>

        <div
          ref={boardRef}
          role="group"
          aria-labelledby={titleId}
          className="relative overflow-clip [contain:paint]"
          style={{ height: rowsH, ...weekendStripe }}
        >
          {list.map((t, i) => (
            <span
              key={t.id}
              aria-hidden
              className="absolute inset-x-0 border-b border-hairline"
              style={{ top: (i + 1) * ROW_H - 1 }}
            />
          ))}
          <span
            aria-hidden
            className="absolute top-0 bottom-0 border-l border-dashed border-signal"
            style={{ left: xOfDay(today) }}
          />
          {/* Time after the handover is hatched: the plan ends at the flag. */}
          <motion.span
            aria-hidden
            className="absolute top-0 bottom-0 left-0"
            style={{
              x: flagX,
              width: trackW,
              backgroundImage:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--ink-3) 14%, transparent) 0 1px, transparent 1px 7px)",
            }}
          />
          <motion.span
            aria-hidden
            className="absolute top-0 bottom-0 left-0 w-0.5 -translate-x-px bg-foreground"
            style={{ x: flagX }}
          />
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={trackW}
            height={rowsH}
          >
            {deps.map(({ from, to, fromRow, toRow }) => {
              const fx = xs.get(from.id);
              const tx = xs.get(to.id);
              if (!fx || !tx) return null;
              return (
                <Coupling
                  key={`${from.id}-${to.id}`}
                  fromX={fx}
                  toX={tx}
                  fromWidth={from.days * dw}
                  fromRow={fromRow}
                  toRow={toRow}
                  broken={plan.waits.get(to.id) === from.id}
                />
              );
            })}
          </svg>
          {list.map((t, row) => {
            const x = xs.get(t.id);
            const lean = leans.get(t.id);
            const s = plan.slots.get(t.id);
            if (!x || !lean || !s) return null;
            return (
              <TaskBar
                key={t.id}
                task={t}
                row={row}
                x={x}
                lean={lean}
                width={t.days * dw}
                slot={s}
                barStyle={barStyle}
                past={s.start < today}
                waits={plan.waits.has(t.id)}
                disabled={disabled || !ready}
                label={barLabel(t)}
                events={events}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  const ordered = [...list].sort(
    (a, b) =>
      (plan.slots.get(a.id)?.start ?? 0) - (plan.slots.get(b.id)?.start ?? 0) ||
      list.indexOf(a) - list.indexOf(b),
  );
  const maxDepth = Math.max(0, ...depth.values());
  const step = cascade(maxDepth + 1);

  const narrowList = (
    <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 @min-[40rem]:hidden">
      <div className="flex items-center justify-between gap-2 rounded-3 border border-hairline bg-surface-1 p-1.5">
        <button
          type="button"
          aria-label="One day earlier"
          onClick={() => commitDeadline(committed - 1)}
          aria-disabled={disabled || committed <= minDay || undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 aria-disabled:opacity-40",
            FOCUS_RING,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Handover deadline"
          aria-valuemin={minDay - today}
          aria-valuemax={maxDay - today}
          aria-valuenow={shownDay - today}
          aria-valuetext={sliderText}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          onKeyDown={onSliderKey}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center rounded-2 py-0.5 leading-tight",
            FOCUS_RING,
          )}
        >
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <Flag aria-hidden className="size-3" />
            Handover
          </span>
          <RollDate
            text={shortDate(shownDay)}
            delay={0}
            motionSafe={motionSafe}
            className="text-[14px] font-semibold tabular-nums"
          />
        </div>
        <button
          type="button"
          aria-label="One day later"
          onClick={() => commitDeadline(committed + 1)}
          aria-disabled={disabled || committed >= maxDay || undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 aria-disabled:opacity-40",
            FOCUS_RING,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <ol className="flex flex-col">
        {ordered.map((t) => {
          const s = plan.slots.get(t.id);
          if (!s) return null;
          const past = s.start < today;
          const waits = plan.waits.get(t.id);
          // The pull ripples down the list from the flag, a car at a time.
          const delay = ((depth.get(t.id) ?? 0) * step) as number;
          return (
            <li
              key={t.id}
              className="flex items-center gap-2.5 border-b border-hairline py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className="h-8 w-1 shrink-0 rounded-full transition-colors duration-200"
                style={{ backgroundColor: past ? AMBER : "var(--bp-accent)" }}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium">{t.name}</p>
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11.5px] tabular-nums",
                    past ? "text-warn" : waits ? "text-danger" : "text-ink-3",
                  )}
                >
                  <span>Starts</span>
                  <RollDate
                    text={shortDate(s.start)}
                    delay={delay}
                    motionSafe={motionSafe}
                  />
                  <span className="truncate">
                    · {t.days} d{past ? " · in the past" : ""}
                    {waits ? ` · waits on ${nameOf(waits)}` : ""}
                  </span>
                </p>
              </div>
              {lockButton(t, true)}
            </li>
          );
        })}
      </ol>
    </div>
  );

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-2.5 p-4">
      <p className="sr-only">Loading the plan.</p>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-2.5 w-24 shrink-0 rounded-full bg-surface-2" />
          <span
            className="h-6 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            style={{
              marginLeft: `${10 + i * 8}%`,
              width: `${14 + (i % 3) * 6}%`,
            }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground [--bp-label:10rem] @min-[64rem]:[--bp-label:13rem]",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--bp-accent" as string]: ACCENTS[accent],
        ["--bp-amber" as string]: AMBER,
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-48">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums",
              summary.tone === "danger"
                ? "text-danger"
                : summary.tone === "warn"
                  ? "text-warn"
                  : "text-ink-3",
            )}
          >
            {summary.tone !== "ok" ? (
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            ) : null}
            <span className="truncate">{ready ? summary.text : "Loading"}</span>
          </p>
        </div>
        <p className="hidden shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 py-1 text-[12px] tabular-nums @min-[40rem]:flex">
          <Flag aria-hidden className="size-3.5 text-ink-2" />
          Handover {shortDate(shownDay)}
        </p>
      </header>

      <p id={hintId} className="sr-only">
        Left and Right move the deadline a day, Page Up and Page Down a week. On
        a task, L locks it; a locked task moves with Left and Right; Shift with
        Left or Right changes its length.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The plan did not load.</p>
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
        <div className="overflow-y-auto">{loading}</div>
      ) : (
        <div className="grid grid-rows-[minmax(0,1fr)] overflow-hidden">
          {board}
          {narrowList}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface-1 px-4 py-2 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-3 rounded-[2px] bg-(--bp-accent)"
          />
          Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-3 rounded-[2px]"
            style={{ backgroundColor: AMBER }}
          />
          Starts in the past
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock aria-hidden className="size-3" />
          Locked
        </span>
        <span className="ml-auto hidden @min-[40rem]:inline">
          Drag the flag, or any unlocked task
        </span>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
