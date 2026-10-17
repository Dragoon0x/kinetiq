"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Activity,
  Check,
  Cpu,
  Gauge,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  RotateCcw,
  Ruler,
  Thermometer,
  TriangleAlert,
  Waves,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type MilestoneRingsAccent = "cobalt" | "plum" | "mint" | "ink";
export type MilestoneOverdueStyle = "tint" | "hatch" | "label";
export type MilestoneRingsStatus = "ready" | "loading" | "error";
export type MilestoneIcon =
  "gauge" | "cpu" | "waves" | "thermometer" | "ruler" | "radio" | "activity";

export type Milestone = {
  id: string;
  name: string;
  /** Due date as an ISO day, "2026-10-24". */
  due: string;
  /** Progress toward it, 0 to 1. Reaching 1 counts as reached. */
  progress: number;
  /** Reached, whatever the progress says. */
  done?: boolean;
};

export type MilestoneProject = {
  id: string;
  name: string;
  icon?: MilestoneIcon;
  /** In order; the first one not reached is the project's next milestone. */
  milestones: Milestone[];
};

export type MilestoneRingsProps = {
  /** The projects, in their starting order. @default defaultMilestoneProjects */
  projects?: MilestoneProject[];
  /** Controlled current project id. */
  current?: string;
  /** Initial current project when uncontrolled. @default the first */
  defaultCurrent?: string;
  /** A project was chosen (click, Enter or Space). */
  onNavigate?: (projectId: string) => void;
  /** Alt+M on a row, or a milestone in the side pane, asked to open a milestone (null: the project has none upcoming). */
  onOpenMilestone?: (projectId: string, milestone: Milestone | null) => void;
  /** The rows were reordered by a drag or Alt with an arrow; the new id order. */
  onReorder?: (ids: string[]) => void;
  /** Controlled folded state: the sidebar as a 60px rail of rings. */
  folded?: boolean;
  /** Initial folded state when uncontrolled. @default false */
  defaultFolded?: boolean;
  /** Fires from the button that folded or opened the sidebar. */
  onFoldedChange?: (folded: boolean) => void;
  /** Today, for due and overdue: an ISO day, ms or a Date. @default "2026-10-14" */
  now?: string | number | Date;
  /** The ring's diameter in px; icons and rows scale with it. @default 26 */
  ringSize?: number;
  /** How a late milestone shows: the arc in danger, a hatched track, or a "late" chip. @default "tint" */
  overdueStyle?: MilestoneOverdueStyle;
  /** Arcs, the current row and flags. A name or any CSS colour. @default "cobalt" */
  accent?: MilestoneRingsAccent | (string & {});
  /** Flags drawn in a row's tally before it reads "+n". @default 4 */
  flagLimit?: number;
  /** Whether the projects have arrived. @default "ready" */
  status?: MilestoneRingsStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The workspace in the header. @default "Gaugeworks" */
  workspace?: string;
  /** The list's heading and accessible name. @default "Product lines" */
  title?: string;
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** Read only: nothing can be chosen, opened or moved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const ms = (
  id: string,
  name: string,
  due: string,
  progress: number,
  done = false,
): Milestone => ({ id, name, due, progress, ...(done ? { done } : {}) });

/** Gaugeworks product lines on Wed 14 Oct 2026. */
export const defaultMilestoneProjects: MilestoneProject[] = [
  {
    id: "gauge-mini",
    name: "Gauge Mini",
    icon: "gauge",
    milestones: [
      ms("gm-1", "Concept review", "2026-06-12", 1, true),
      ms("gm-2", "EVT build", "2026-08-28", 1, true),
      ms("gm-3", "Tooling sign-off", "2026-10-17", 0.82),
      ms("gm-4", "Pilot run", "2026-11-03", 0.15),
      ms("gm-5", "Launch", "2027-01-20", 0),
    ],
  },
  {
    id: "pressure-cell",
    name: "Pressure Cell v3",
    icon: "cpu",
    milestones: [
      ms("pc-1", "Spec freeze", "2026-09-02", 1, true),
      ms("pc-2", "Beta build", "2026-10-24", 0.55),
      ms("pc-3", "Certification", "2026-12-02", 0),
    ],
  },
  {
    id: "flow-meter",
    name: "Flow Meter Pro",
    icon: "waves",
    milestones: [
      ms("fm-1", "Concept review", "2026-03-20", 1, true),
      ms("fm-2", "EVT build", "2026-05-29", 1, true),
      ms("fm-3", "DVT build", "2026-08-07", 1, true),
      ms("fm-4", "Field trial", "2026-10-10", 0.7),
      ms("fm-5", "Launch", "2026-12-15", 0),
    ],
  },
  {
    id: "thermal-probe",
    name: "Thermal Probe",
    icon: "thermometer",
    milestones: [
      ms("tp-1", "Concept review", "2026-09-18", 1, true),
      ms("tp-2", "Spec freeze", "2026-11-12", 0.2),
    ],
  },
  {
    id: "field-calibrator",
    name: "Field Calibrator",
    icon: "ruler",
    milestones: [
      ms("fc-1", "Concept review", "2025-11-04", 1, true),
      ms("fc-2", "EVT build", "2026-01-23", 1, true),
      ms("fc-3", "DVT build", "2026-04-10", 1, true),
      ms("fc-4", "Launch", "2026-07-01", 1, true),
    ],
  },
  { id: "bench-logger", name: "Bench Logger", icon: "radio", milestones: [] },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ICONS: Record<MilestoneIcon, typeof Gauge> = {
  gauge: Gauge,
  cpu: Cpu,
  waves: Waves,
  thermometer: Thermometer,
  ruler: Ruler,
  radio: Radio,
  activity: Activity,
};

const ACCENTS: Record<MilestoneRingsAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const RAIL = 60;
const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
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

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Midnight UTC of a day, from whatever the host gave. */
const dayOf = (v: string | number | Date): number => {
  const t =
    typeof v === "string"
      ? Date.parse(v.length <= 10 ? `${v}T00:00:00Z` : v)
      : typeof v === "number"
        ? v
        : v.getTime();
  return Number.isFinite(t) ? Math.floor(t / DAY) * DAY : 0;
};

/** "Fri 24 Oct", fixed and in UTC, so server and browser print the same. */
const dateLabel = (day: number) => {
  const d = new Date(day);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const relLabel = (days: number) =>
  days === 0
    ? "today"
    : days === 1
      ? "tomorrow"
      : days > 1
        ? `in ${days} days`
        : days === -1
          ? "1 day late"
          : `${-days} days late`;

type Derived = {
  reached: number;
  total: number;
  next: Milestone | null;
  progress: number;
  days: number | null;
  overdue: boolean;
};

const reachedOf = (m: Milestone) => m.done === true || m.progress >= 1;

const derive = (p: MilestoneProject, today: number): Derived => {
  let reached = 0;
  let next: Milestone | null = null;
  for (const m of p.milestones) {
    if (reachedOf(m)) reached += 1;
    else if (!next) next = m;
  }
  const days = next ? Math.round((dayOf(next.due) - today) / DAY) : null;
  return {
    reached,
    total: p.milestones.length,
    next,
    progress: next ? clamp(next.progress, 0, 0.999) : 0,
    days,
    overdue: days !== null && days < 0,
  };
};

const rowName = (p: MilestoneProject, d: Derived) => {
  const flags = `${plural(d.reached, "milestone", "milestones")} reached.`;
  if (d.total === 0) return `${p.name}. No milestone set.`;
  if (!d.next) return `${p.name}. All ${d.total} milestones reached.`;
  const late = d.overdue && d.days !== null ? `, ${relLabel(d.days)}` : "";
  return `${p.name}. Next: ${d.next.name}, due ${dateLabel(dayOf(d.next.due))}${late}, ${Math.round(d.progress * 100)}%. ${flags}`;
};

/* ----------------------------------------------------------------------- */
/*                                  Ring                                    */
/* ----------------------------------------------------------------------- */

type RingTone = "accent" | "danger" | "quiet";

/**
 * The ring: a track, a progress arc drawn from two motion values (its head
 * and its tail, as fractions of the turn) and a halo that flashes once when
 * a milestone is reached. Every attribute is written from an animation
 * callback, rounded, so nothing derived can go stale between beats.
 */
function Ring({
  size,
  dash,
  offset,
  arcO,
  width,
  haloR,
  haloO,
  tone,
  hatch,
  empty,
  icon,
  current,
  badge,
  badgeScale,
  folded,
}: {
  size: number;
  dash: MotionValue<string>;
  offset: MotionValue<number>;
  arcO: MotionValue<number>;
  width: MotionValue<number>;
  haloR: MotionValue<number>;
  haloO: MotionValue<number>;
  tone: RingTone;
  hatch: boolean;
  empty: boolean;
  icon: MilestoneIcon | undefined;
  current: boolean;
  badge: number;
  badgeScale: MotionValue<number>;
  folded: boolean;
}) {
  const sw = r2(Math.max(2, size / 10));
  const c = size / 2;
  const r = r2(c - sw / 2 - 0.5);
  const Icon = ICONS[icon ?? "activity"] ?? Activity;
  const stroke =
    tone === "danger"
      ? "stroke-danger"
      : tone === "quiet"
        ? "stroke-[color-mix(in_oklab,var(--mr-ink)_45%,transparent)]"
        : "stroke-[var(--mr-ink)]";
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 overflow-visible"
      >
        <motion.circle
          cx={c}
          cy={c}
          r={haloR}
          fill="none"
          strokeWidth={1.5}
          className="stroke-[var(--mr-ink)]"
          style={{ opacity: haloO }}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={sw}
          strokeDasharray={
            empty
              ? `${r2(sw * 0.4)} ${r2(sw * 1.6)}`
              : hatch
                ? "2 2.4"
                : undefined
          }
          strokeLinecap={empty ? "round" : undefined}
          className={cn(
            hatch
              ? "stroke-[color-mix(in_oklab,var(--danger)_70%,transparent)]"
              : "stroke-hairline-strong",
          )}
        />
        <g transform={`rotate(-90 ${c} ${c})`}>
          <motion.circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeLinecap="round"
            className={cn(stroke, "transition-[stroke] duration-200")}
            style={{
              strokeDasharray: dash,
              strokeDashoffset: offset,
              strokeWidth: width,
              opacity: arcO,
            }}
          />
        </g>
      </svg>
      <Icon
        className={cn(
          "relative shrink-0",
          current ? "text-[var(--mr-ink)]" : "text-ink-2",
        )}
        style={{ width: r2(size * 0.46), height: r2(size * 0.46) }}
      />
      {folded && badge > 0 ? (
        <motion.span
          className="absolute -right-1.5 -bottom-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-[1.5px] border-card bg-[var(--mr-ink)] px-0.5 font-mono text-[8px] leading-none text-background tabular-nums"
          style={{ scale: badgeScale }}
        >
          {badge}
        </motion.span>
      ) : null}
    </span>
  );
}

function Flag({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 7 11"
      width={7}
      height={11}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <path d="M0.75 0.5 V10.5" strokeWidth={1.1} className="stroke-ink-3" />
      <path
        d="M1.2 1 H6.4 L5.1 2.75 L6.4 4.5 H1.2 Z"
        className="fill-[var(--mr-ink)]"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  project: MilestoneProject;
  d: Derived;
  slot: number;
  rowH: number;
  ringSize: number;
  overdueStyle: MilestoneOverdueStyle;
  flagLimit: number;
  current: boolean;
  tabbable: boolean;
  dragging: boolean;
  folded: boolean;
  motionSafe: boolean;
  disabled: boolean;
  posinset: number;
  setsize: number;
  register: (id: string, y: MotionValue<number> | null) => void;
  grip: ReturnType<typeof useDrag>;
  onGripDown: (id: string) => void;
  onChoose: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onHot: (
    id: string | null,
    el: HTMLElement | null,
    via: "focus" | "hover",
  ) => void;
  today: number;
};

function Row({
  project,
  d,
  slot,
  rowH,
  ringSize,
  overdueStyle,
  flagLimit,
  current,
  tabbable,
  dragging,
  folded,
  motionSafe,
  disabled,
  posinset,
  setsize,
  register,
  grip,
  onGripDown,
  onChoose,
  onKey,
  onHot,
  today,
}: RowProps) {
  const y = useMotionValue(slot * rowH);
  const lift = useMotionValue(0);
  React.useEffect(() => {
    register(project.id, y);
    return () => register(project.id, null);
  }, [project.id, register, y]);

  // A row settles on its slot on glide; a dropped row lands on snap with
  // the throw it was released with. A dragged row is the pointer's.
  const wasDragging = React.useRef(false);
  React.useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      return;
    }
    const to = slot * rowH;
    const dropped = wasDragging.current;
    wasDragging.current = false;
    if (!motionSafe) {
      y.jump(to);
      return;
    }
    const from = y.get();
    if (Math.abs(from - to) < 0.5) {
      y.jump(to);
      return;
    }
    const ctrl = animate(from, to, {
      ...(dropped ? springs.snap : springs.glide),
      velocity: y.getVelocity(),
      onUpdate: (v) => y.set(r2(v)),
    });
    return () => ctrl.stop();
  }, [slot, rowH, dragging, motionSafe, y]);

  const liftScale = useLiftScale(lift);
  React.useEffect(() => {
    const ctrl = animate(lift.get(), dragging && motionSafe ? 1 : 0, {
      ...springs.flick,
      onUpdate: (v) => lift.set(r3(v)),
    });
    return () => ctrl.stop();
  }, [dragging, motionSafe, lift]);

  /* ------------------------------- the arc ------------------------------- */

  const size = ringSize;
  const sw = r2(Math.max(2, size / 10));
  const C = r3(2 * Math.PI * r2(size / 2 - sw / 2 - 0.5));
  const empty = d.total === 0;
  const all = d.total > 0 && !d.next;
  const startHead = all ? 1 : empty ? 0 : d.progress;
  const head = React.useRef(startHead);
  const tail = React.useRef(0);
  const dash = useMotionValue(`${r2(Math.max(0, startHead) * C)} ${r2(C)}`);
  const offset = useMotionValue(0);
  const arcO = useMotionValue(startHead > 0.006 ? 1 : 0);
  const width = useMotionValue(sw);
  const haloR = useMotionValue(r2(size / 2 - sw / 2 - 0.5));
  const haloO = useMotionValue(0);
  const badgeScale = useMotionValue(1);
  const flagX = useMotionValue(0);
  const flagY = useMotionValue(0);
  const flagS = useMotionValue(1);
  const ringRef = React.useRef<HTMLSpanElement | null>(null);
  const tallyRef = React.useRef<HTMLSpanElement | null>(null);

  const draw = React.useCallback(
    (h: number, t: number) => {
      head.current = h;
      tail.current = t;
      const len = Math.max(0, h - t) * C;
      dash.set(`${r2(len)} ${r2(C + 1)}`);
      offset.set(r2(-t * C));
      // A zero-length dash with round caps still paints a dot.
      arcO.set(len > 0.2 ? 1 : 0);
    },
    [C, arcO, dash, offset],
  );

  // A reached milestone is seen in the render that brings it: the meta line
  // keeps naming it, and the tally keeps its old count, until the ring has
  // closed and the flag is in the air.
  const [seen, setSeen] = React.useState({
    reached: d.reached,
    next: d.next?.id ?? null,
  });
  const [holding, setHolding] = React.useState<Milestone | null>(null);
  const [tally, setTally] = React.useState(d.reached);
  const [ceremony, setCeremony] = React.useState(0);
  if (d.reached !== seen.reached || (d.next?.id ?? null) !== seen.next) {
    if (d.reached > seen.reached) {
      const just = project.milestones.filter(reachedOf)[d.reached - 1];
      setHolding(just ?? null);
      setCeremony((c) => c + 1);
    } else {
      setHolding(null);
      setTally(d.reached);
    }
    setSeen({ reached: d.reached, next: d.next?.id ?? null });
  }
  const ran = React.useRef(ceremony);
  const target = all ? 1 : empty ? 0 : d.progress;

  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    const timers: number[] = [];
    const stopAll = () => {
      for (const c of running) c.stop();
      for (const t of timers) window.clearTimeout(t);
    };
    const reachedNow = ceremony !== ran.current;
    ran.current = ceremony;

    if (!reachedNow) {
      if (!motionSafe) {
        draw(target, 0);
      } else {
        const fromH = head.current;
        const fromT = tail.current;
        running.push(
          animate(0, 1, {
            ...springs.glide,
            onUpdate: (k) =>
              draw(fromH + (target - fromH) * k, fromT * (1 - k)),
          }),
        );
      }
      return () => {
        stopAll();
        draw(target, 0);
      };
    }

    // The ceremony: close, flash, fly a flag home, reset to the next one.
    const baseR = r2(size / 2 - sw / 2 - 0.5);
    const flyFlag = () => {
      // The new flag joins at the tally's right end, which stays put while
      // the tally grows leftward; it starts at the ring and flies there.
      const ring = ringRef.current?.getBoundingClientRect();
      const box = tallyRef.current?.getBoundingClientRect();
      setTally(d.reached);
      if (!ring || !box || !motionSafe) {
        flagX.jump(0);
        flagY.jump(0);
        flagS.jump(1);
        return;
      }
      const dx = r2(ring.left + ring.width / 2 - (box.right - 4));
      const dy = r2(ring.top + ring.height / 2 - (box.top + box.height / 2));
      flagX.jump(dx);
      flagY.jump(dy);
      flagS.jump(0.5);
      running.push(
        animate(dx, 0, { ...springs.glide, onUpdate: (v) => flagX.set(r2(v)) }),
        animate(dy, 0, { ...springs.snap, onUpdate: (v) => flagY.set(r2(v)) }),
        animate(0.5, 1, {
          ...springs.recoil,
          onUpdate: (v) => flagS.set(r3(v)),
        }),
      );
    };
    const flash = () => {
      running.push(
        animate(0, 1, {
          duration: 0.42,
          ease: easings.enter,
          onUpdate: (k) => {
            haloR.set(r2(baseR + 5 * k));
            haloO.set(r3(0.75 * (1 - k)));
          },
        }),
      );
      if (motionSafe) {
        running.push(
          animate(width.get(), [sw, r2(sw * 1.7), sw], {
            duration: 0.42,
            ease: easings.move,
            onUpdate: (v) => width.set(r2(v)),
          }),
          animate(1, [1, 1.35, 1], {
            duration: 0.42,
            ease: easings.move,
            onUpdate: (v) => badgeScale.set(r3(v)),
          }),
        );
      }
    };
    const reset = () => {
      setHolding(null);
      if (!motionSafe) {
        draw(target, 0);
        return;
      }
      // The arc empties forward, its tail chasing its head to the top, then
      // the next milestone's share draws in.
      running.push(
        animate(0, 1, {
          ...springs.snap,
          onUpdate: (k) => draw(1, Math.min(1, k)),
          onComplete: () => {
            draw(0, 0);
            running.push(
              animate(0, target, {
                ...springs.snap,
                onUpdate: (h) => draw(Math.max(0, h), 0),
              }),
            );
          },
        }),
      );
    };

    if (!motionSafe) {
      draw(1, 0);
      flash();
      flyFlag();
      timers.push(window.setTimeout(reset, 520));
    } else {
      const fromH = head.current;
      running.push(
        animate(fromH, 1, {
          ...springs.glide,
          onUpdate: (h) => draw(Math.min(1, h), 0),
          onComplete: () => {
            draw(1, 0);
            flash();
            flyFlag();
            timers.push(window.setTimeout(reset, 260));
          },
        }),
      );
    }
    return () => {
      // A re-run or an unmount lands the ring where the data says, never
      // halfway through a beat.
      stopAll();
      draw(target, 0);
      haloO.set(0);
      width.set(sw);
      badgeScale.set(1);
      flagX.set(0);
      flagY.set(0);
      flagS.set(1);
      setHolding(null);
      setTally(d.reached);
    };
    // The ceremony keys on the data, not on every callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremony, target, motionSafe, size]);

  const tone: RingTone = all
    ? "quiet"
    : d.overdue && overdueStyle === "tint"
      ? "danger"
      : "accent";
  const shown = holding ?? d.next;
  const shownDays = shown ? Math.round((dayOf(shown.due) - today) / DAY) : null;
  const shownLate = shownDays !== null && shownDays < 0;
  const visibleFlags = Math.min(tally, flagLimit);
  const extra = tally - visibleFlags;

  return (
    <motion.div
      role="option"
      data-mr-row={project.id}
      aria-selected={current}
      aria-label={rowName(project, d)}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-disabled={disabled || undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onChoose(project.id)}
      onKeyDown={(event) => onKey(event, project.id)}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible"))
          onHot(project.id, ringRef.current, "focus");
      }}
      onBlur={() => onHot(null, null, "focus")}
      className={cn(
        "absolute inset-x-1.5 top-0 flex cursor-default items-center gap-2.5 rounded-3 pr-2.5 select-none",
        current ? "bg-[var(--mr-wash)]" : "hover:bg-surface-2",
        FOCUS_IN,
      )}
      style={{
        y,
        height: rowH,
        zIndex: dragging ? 3 : 1,
        paddingLeft: `calc(${r2((RAIL - 12 - ringSize) / 2)}px + (1 - var(--mr-fold)) * ${r2(22 - (RAIL - 12 - ringSize) / 2)}px)`,
        boxShadow: dragging
          ? "0 10px 24px -8px color-mix(in oklab, var(--foreground) 28%, transparent)"
          : "none",
        scale: liftScale,
      }}
    >
      <span
        aria-hidden
        onPointerDown={(event) => {
          if (disabled) return;
          onGripDown(project.id);
          grip.onPointerDown(event);
        }}
        onPointerMove={grip.onPointerMove}
        onPointerUp={grip.onPointerUp}
        onPointerCancel={grip.onPointerCancel}
        onLostPointerCapture={grip.onLostPointerCapture}
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-y-0 left-0 flex w-5 cursor-grab touch-none items-center justify-center text-ink-3 transition-colors hover:text-foreground active:cursor-grabbing"
        style={{ opacity: "calc((1 - var(--mr-fold) * 3) * 0.6)" }}
      >
        <GripVertical className="size-3" />
      </span>
      <span
        ref={ringRef}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch")
            onHot(project.id, event.currentTarget, "hover");
        }}
        onPointerLeave={() => onHot(null, null, "hover")}
        className="inline-flex shrink-0"
      >
        <Ring
          size={ringSize}
          dash={dash}
          offset={offset}
          arcO={arcO}
          width={width}
          haloR={haloR}
          haloO={haloO}
          tone={tone}
          hatch={d.overdue && overdueStyle === "hatch"}
          empty={empty}
          icon={project.icon}
          current={current}
          badge={d.reached}
          badgeScale={badgeScale}
          folded={folded}
        />
      </span>
      <span
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5"
        style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
      >
        <span
          className={cn(
            "truncate text-[13px] leading-tight",
            current
              ? "font-semibold text-foreground"
              : "font-medium text-foreground",
          )}
          title={project.name}
        >
          {project.name}
        </span>
        <span className="grid min-w-0 text-[11.5px] leading-tight">
          <AnimatePresence initial={false}>
            <motion.span
              key={shown?.id ?? (all ? "all" : "none")}
              className="flex min-w-0 items-center gap-1.5 [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  opacity: { duration: durations.base, ease: easings.enter },
                  y: motionSafe ? springs.glide : { duration: 0 },
                },
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              {shown ? (
                <>
                  <span className="truncate text-ink-3">
                    {`${shown.name} · `}
                    <span
                      className={cn(
                        shownLate && overdueStyle === "tint"
                          ? "text-danger"
                          : "text-ink-3",
                      )}
                    >
                      {shownLate && overdueStyle === "label"
                        ? dateLabel(dayOf(shown.due))
                        : relLabel(shownDays ?? 0)}
                    </span>
                  </span>
                  {shownLate && overdueStyle === "label" ? (
                    <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-1.5 font-mono text-[9.5px] leading-none text-danger">
                      {`${-(shownDays ?? 0)}d late`}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="truncate text-ink-3">
                  {all ? "All milestones reached" : "No milestone set"}
                </span>
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
      <span
        ref={tallyRef}
        aria-hidden
        className="flex shrink-0 items-center gap-[3px]"
        style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
      >
        {Array.from({ length: visibleFlags }, (_, i) => {
          const arriving = i === visibleFlags - 1 && extra === 0;
          return arriving ? (
            <motion.span
              key={i}
              data-mr-arrive=""
              className="inline-flex"
              style={{ x: flagX, y: flagY, scale: flagS }}
            >
              <Flag />
            </motion.span>
          ) : (
            <span key={i} className="inline-flex">
              <Flag />
            </span>
          );
        })}
        {extra > 0 ? (
          <motion.span
            data-mr-arrive=""
            className="ml-1 font-mono text-[10px] text-ink-3 tabular-nums"
            style={{ x: flagX, y: flagY, scale: flagS }}
          >
            {`+${extra}`}
          </motion.span>
        ) : null}
      </span>
    </motion.div>
  );
}

/** The lift while dragging: a hair of scale, from one motion value. */
function useLiftScale(lift: MotionValue<number>) {
  const scale = useMotionValue(1);
  React.useEffect(
    () => lift.on("change", (v) => scale.set(r3(1 + v * 0.02))),
    [lift, scale],
  );
  return scale;
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A project sidebar where every row wraps its icon in a ring: the arc is
 * progress toward the project's next milestone. When the data says a
 * milestone is reached, the arc closes on `glide`, flashes once (a halo
 * expanding on a tween), a flag lifts off the ring and flies to the row's
 * tally (x on `glide`, y on `snap`, landing on `recoil`), and the ring
 * resets on `snap` — the arc empties forward and the next milestone's share
 * draws in as the meta line changes.
 *
 * Hovering a ring or focusing its row names the milestone and its date in
 * a caption. Rows reorder by dragging their grip (1:1, the others gliding
 * aside) or with Alt and an arrow; the sidebar folds to a rail of rings.
 * Under reduced motion the arcs change on short tweens and the ceremony is a
 * still flash; the flags, dates and order still update.
 */
export function MilestoneRings({
  projects = defaultMilestoneProjects,
  current: currentProp,
  defaultCurrent,
  onNavigate,
  onOpenMilestone,
  onReorder,
  folded: foldedProp,
  defaultFolded = false,
  onFoldedChange,
  now = "2026-10-14",
  ringSize = 26,
  overdueStyle = "tint",
  accent = "cobalt",
  flagLimit = 4,
  status = "ready",
  onRetry,
  workspace = "Gaugeworks",
  title = "Product lines",
  frameHeight = 520,
  disabled = false,
  className,
}: MilestoneRingsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const today = dayOf(now);
  const size = clamp(Math.round(ringSize), 16, 40);
  const rowH = Math.max(44, size + 18);

  const [ownCurrent, setOwnCurrent] = React.useState(
    defaultCurrent ?? projects[0]?.id ?? "",
  );
  const current = currentProp ?? ownCurrent;
  const [ownFolded, setOwnFolded] = React.useState(defaultFolded);
  const folded = foldedProp ?? ownFolded;

  // The order is the visitor's; new projects join at the end and removed
  // ones drop out, so a host refresh never scrambles a hand-made order.
  const [order, setOrder] = React.useState(() => projects.map((p) => p.id));
  const ids = projects.map((p) => p.id);
  const merged = [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
  const visual = merged.join("|") === order.join("|") ? order : merged;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const derived = new Map(projects.map((p) => [p.id, derive(p, today)]));

  const [announcement, setAnnouncement] = React.useState("");

  // A reached milestone is announced in the render that sees it, from the
  // new data, once.
  const [spoken, setSpoken] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, derive(p, today).reached])),
  );
  {
    let changed = false;
    const next: Record<string, number> = { ...spoken };
    let line = "";
    for (const p of projects) {
      const dd = derived.get(p.id);
      if (!dd) continue;
      const before = spoken[p.id];
      if (before === undefined || dd.reached !== before) {
        changed = true;
        next[p.id] = dd.reached;
        if (before !== undefined && dd.reached > before) {
          const got = p.milestones.filter(reachedOf)[dd.reached - 1];
          line = `${p.name} reached ${got?.name ?? "a milestone"}.${
            dd.next
              ? ` Next: ${dd.next.name}, due ${dateLabel(dayOf(dd.next.due))}.`
              : " Every milestone is reached."
          }`;
        }
      }
    }
    if (changed) {
      setSpoken(next);
      if (line) setAnnouncement(line);
    }
  }

  /* ------------------------------- folding ------------------------------- */

  const fold = useMotionValue(folded ? 1 : 0);
  React.useEffect(() => {
    const to = folded ? 1 : 0;
    if (!motionSafe) {
      fold.jump(to);
      return;
    }
    const from = fold.get();
    if (from === to) return;
    const ctrl = animate(from, to, {
      ...springs.glide,
      onUpdate: (v) => fold.set(r3(clamp(v, -0.05, 1.05))),
    });
    return () => ctrl.stop();
  }, [folded, motionSafe, fold]);

  const setFoldedTo = (next: boolean) => {
    if (foldedProp === undefined) setOwnFolded(next);
    onFoldedChange?.(next);
    setAnnouncement(next ? "Sidebar folded to rings." : "Sidebar opened.");
    setHot(null);
  };

  /* ------------------------------- choosing ------------------------------ */

  const choose = (id: string) => {
    if (disabled) return;
    if (currentProp === undefined) setOwnCurrent(id);
    onNavigate?.(id);
  };

  const commitOrder = (next: string[], movedId: string) => {
    setOrder(next);
    onReorder?.(next);
    const p = byId.get(movedId);
    const at = next.indexOf(movedId);
    if (p) setAnnouncement(`${p.name} moved to ${at + 1} of ${next.length}.`);
  };

  /* ------------------------------- dragging ------------------------------ */

  const ys = React.useRef(new Map<string, MotionValue<number>>());
  const register = React.useCallback(
    (id: string, mv: MotionValue<number> | null) => {
      if (mv) ys.current.set(id, mv);
      else ys.current.delete(id);
    },
    [],
  );
  const [drag, setDrag] = React.useState<{ id: string; to: number } | null>(
    null,
  );
  const grab = React.useRef<{
    id: string;
    from: number;
    start: number;
    to: number;
    live: boolean;
  } | null>(null);
  const visualRef = React.useRef(visual);
  React.useEffect(() => {
    visualRef.current = visual;
  });

  const gripDrag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      const g = grab.current;
      if (!g) return;
      g.live = true;
      setDrag({ id: g.id, to: g.from });
      setHot(null);
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      if (!g?.live) return;
      const mv = ys.current.get(g.id);
      const n = visualRef.current.length;
      const yNow = rubberClamp(g.start + offset.y, 0, (n - 1) * rowH, rowH);
      mv?.set(r2(yNow));
      const to = clamp(Math.round(yNow / rowH), 0, n - 1);
      if (to !== g.to) {
        g.to = to;
        setDrag({ id: g.id, to });
      }
    },
    onEnd: () => {
      const g = grab.current;
      grab.current = null;
      setDrag(null);
      if (!g?.live) return;
      const list = visualRef.current.filter((id) => id !== g.id);
      list.splice(g.to, 0, g.id);
      if (list.join("|") !== visualRef.current.join("|"))
        commitOrder(list, g.id);
    },
    onCancel: () => {
      grab.current = null;
      setDrag(null);
    },
  });

  // While a drag is live the other rows make room for where it would land.
  const slotOf = (id: string): number => {
    const i = visual.indexOf(id);
    if (!drag || drag.id === id) return i;
    const j = visual.filter((x) => x !== drag.id).indexOf(id);
    return j >= drag.to ? j + 1 : j;
  };

  /* ------------------------------- keyboard ------------------------------ */

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const focusRow = (id: string | undefined) => {
    if (!id) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-mr-row="${CSS.escape(id)}"]`,
    );
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  };

  const onRowKey = (event: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    if (disabled) return;
    const i = visual.indexOf(id);
    const n = visual.length;
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const to = clamp(i + (event.key === "ArrowUp" ? -1 : 1), 0, n - 1);
      if (to === i) return;
      const next = visual.filter((x) => x !== id);
      next.splice(to, 0, id);
      commitOrder(next, id);
      return;
    }
    if (event.altKey && event.code === "KeyM") {
      event.preventDefault();
      const p = byId.get(id);
      const dd = derived.get(id);
      if (p) {
        onOpenMilestone?.(id, dd?.next ?? null);
        setAnnouncement(
          dd?.next
            ? `Opening ${dd.next.name}.`
            : `${p.name} has no milestone to open.`,
        );
      }
      return;
    }
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(n - 1, i + 1);
    else if (event.key === "ArrowUp") to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to >= 0) {
      event.preventDefault();
      focusRow(visual[to]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(id);
    }
  };

  /* -------------------------------- caption ------------------------------ */

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [hot, setHot] = React.useState<{
    id: string;
    x: number;
    y: number;
    side: "above" | "right";
  } | null>(null);
  const hotVia = React.useRef<"focus" | "hover" | null>(null);
  const onHot = (
    id: string | null,
    el: HTMLElement | null,
    via: "focus" | "hover",
  ) => {
    if (drag) return;
    if (!id || !el) {
      if (hotVia.current === via) {
        hotVia.current = null;
        setHot(null);
      }
      return;
    }
    const frame = frameRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!frame) return;
    hotVia.current = via;
    const side = folded ? "right" : "above";
    setHot({
      id,
      side,
      x: r2(
        side === "right" ? r.right - frame.left + 10 : r.left - frame.left - 4,
      ),
      y: r2(
        side === "right"
          ? r.top - frame.top + r.height / 2
          : r.top - frame.top - 6,
      ),
    });
  };

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as MilestoneRingsAccent]
    : accent;
  const tabbableId = visual.includes(current) ? current : visual[0];
  const overdue = projects.filter((p) => derived.get(p.id)?.overdue).length;
  const soon = projects.filter((p) => {
    const dd = derived.get(p.id);
    return dd && dd.days !== null && dd.days >= 0 && dd.days <= 7;
  }).length;
  const currentProject = byId.get(current) ?? null;
  const currentDerived = currentProject ? derived.get(currentProject.id) : null;
  const hotProject = hot ? byId.get(hot.id) : null;
  const hotDerived = hotProject ? derived.get(hotProject.id) : null;

  const list =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-1 px-1.5 py-1">
        <span className="sr-only">Loading projects</span>
        {[62, 48, 70, 54].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="flex items-center gap-2.5 px-2"
            style={{ height: rowH }}
          >
            <span
              className="shrink-0 rounded-full border-2 border-surface-2"
              style={{ width: size, height: size, marginLeft: 14 }}
            />
            <span className="flex flex-1 flex-col gap-1.5">
              <span
                className="h-2.5 rounded-full bg-surface-2"
                style={{ width: `${w}%` }}
              />
              <span className="h-2 w-2/5 rounded-full bg-surface-2" />
            </span>
          </span>
        ))}
      </div>
    ) : status === "error" ? (
      <div
        className="flex flex-col items-start gap-2 px-4 py-4"
        style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          Couldn’t load projects
        </span>
        <p className="text-[12px] leading-snug text-ink-3">
          Milestones are safe; the list didn’t arrive.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        ) : null}
      </div>
    ) : visual.length === 0 ? (
      <p className="px-4 py-4 text-[13px] text-ink-3">No projects yet.</p>
    ) : (
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="relative"
        style={{ height: visual.length * rowH }}
      >
        {projects.map((p) => {
          const dd = derived.get(p.id);
          if (!dd) return null;
          return (
            <Row
              key={p.id}
              project={p}
              d={dd}
              slot={slotOf(p.id)}
              rowH={rowH}
              ringSize={size}
              overdueStyle={overdueStyle}
              flagLimit={Math.max(1, Math.round(flagLimit))}
              current={p.id === current}
              tabbable={p.id === tabbableId}
              dragging={drag?.id === p.id}
              folded={folded}
              motionSafe={motionSafe}
              disabled={disabled}
              posinset={visual.indexOf(p.id) + 1}
              setsize={visual.length}
              register={register}
              grip={gripDrag}
              onGripDown={(id) => {
                const mv = ys.current.get(id);
                grab.current = {
                  id,
                  from: visual.indexOf(id),
                  to: visual.indexOf(id),
                  start: mv?.get() ?? visual.indexOf(id) * rowH,
                  live: false,
                };
              }}
              onChoose={choose}
              onKey={onRowKey}
              onHot={onHot}
              today={today}
            />
          );
        })}
      </div>
    );

  return (
    <motion.div
      ref={frameRef}
      data-mr-folded={folded ? "true" : "false"}
      className={cn(
        "group/milestone-rings @container relative flex w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          "--mr-fold": fold,
          "--mr-ink": accentInk,
          "--mr-wash": "color-mix(in oklab, var(--mr-ink) 12%, transparent)",
        } as React.ComponentProps<typeof motion.div>["style"]
      }
    >
      <p id={hintId} className="sr-only">
        Up and Down move between projects, Enter opens one, Alt+M opens its next
        milestone, Alt with Up or Down moves the project.
      </p>
      <nav
        aria-label={`${workspace} ${title.toLowerCase()}`}
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-hairline bg-surface-1 [--mr-full:100%] @[36rem]:[--mr-full:252px]"
        style={{
          width: `calc(${RAIL}px + (1 - var(--mr-fold)) * (var(--mr-full) - ${RAIL}px))`,
        }}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-3.5">
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-foreground text-[11px] font-semibold text-background"
          >
            {workspace.slice(0, 2)}
          </span>
          <div
            className="min-w-0"
            style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
          >
            <p className="truncate text-[14px] leading-tight font-semibold">
              {workspace}
            </p>
            <p className="truncate text-[11px] text-ink-3">Milestones</p>
          </div>
        </div>
        <div
          className="flex h-9 shrink-0 items-center justify-between gap-2 px-4"
          style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
        >
          <span
            id={titleId}
            className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {title}
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {visual.length}
          </span>
        </div>
        <div
          className="relative flex-1 overflow-x-hidden overflow-y-auto pb-2"
          onScroll={() => setHot(null)}
        >
          {list}
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 border-t border-hairline px-3.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.04em] text-ink-3 uppercase"
            style={{ opacity: "calc(1 - var(--mr-fold) * 2.5)" }}
          >
            {overdue > 0 ? (
              <span className="text-danger">{`${overdue} late`}</span>
            ) : (
              "On track"
            )}
            {` · ${soon} due this week`}
          </span>
          <button
            type="button"
            aria-expanded={!folded}
            aria-controls={listId}
            aria-label={folded ? "Open sidebar" : "Fold sidebar to rings"}
            title={folded ? "Open sidebar" : "Fold sidebar"}
            disabled={disabled}
            onClick={() => setFoldedTo(!folded)}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {folded ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </nav>

      {/* The side pane: the current project's milestones. */}
      <section
        aria-label={
          currentProject ? `${currentProject.name} milestones` : "Milestones"
        }
        className="@container hidden min-w-0 flex-1 flex-col overflow-y-auto group-data-[mr-folded=true]/milestone-rings:flex @[36rem]:flex"
      >
        {currentProject && currentDerived ? (
          <>
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <span className="relative inline-flex size-12 shrink-0 items-center justify-center">
                <svg
                  viewBox="0 0 48 48"
                  width={48}
                  height={48}
                  aria-hidden
                  className="absolute inset-0"
                >
                  <circle
                    cx={24}
                    cy={24}
                    r={21}
                    fill="none"
                    strokeWidth={4}
                    className="stroke-hairline-strong"
                  />
                  <g transform="rotate(-90 24 24)">
                    <motion.circle
                      cx={24}
                      cy={24}
                      r={21}
                      fill="none"
                      strokeWidth={4}
                      strokeLinecap="round"
                      className={cn(
                        currentDerived.overdue && overdueStyle === "tint"
                          ? "stroke-danger"
                          : "stroke-[var(--mr-ink)]",
                      )}
                      strokeDasharray={`${r2(2 * Math.PI * 21)} ${r2(2 * Math.PI * 21 + 1)}`}
                      initial={false}
                      animate={{
                        strokeDashoffset: r2(
                          2 *
                            Math.PI *
                            21 *
                            (1 -
                              (currentDerived.next
                                ? currentDerived.progress
                                : currentDerived.total > 0
                                  ? 1
                                  : 0)),
                        ),
                      }}
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.fast }
                      }
                    />
                  </g>
                </svg>
                <span className="font-mono text-[11px] text-foreground tabular-nums">
                  {currentDerived.next
                    ? `${Math.round(currentDerived.progress * 100)}%`
                    : currentDerived.total > 0
                      ? "Done"
                      : "—"}
                </span>
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[15px] leading-tight font-semibold">
                  {currentProject.name}
                </h3>
                <p className="truncate text-[12px] text-ink-3">
                  {currentDerived.next
                    ? `Next: ${currentDerived.next.name} · ${dateLabel(dayOf(currentDerived.next.due))}`
                    : currentDerived.total > 0
                      ? "Every milestone reached"
                      : "No milestones yet"}
                </p>
              </div>
            </div>
            <ol className="flex flex-col py-1.5">
              {currentProject.milestones.map((m) => {
                const done = reachedOf(m);
                const isNext = currentDerived.next?.id === m.id;
                const late = !done && dayOf(m.due) < today;
                return (
                  <li key={m.id} className="px-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onOpenMilestone?.(currentProject.id, m)}
                      className={cn(
                        "flex h-10 w-full items-center gap-2.5 rounded-2 px-2.5 text-left text-[13px] hover:bg-surface-2",
                        FOCUS_IN,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                          done
                            ? "border-transparent bg-[var(--mr-ink)] text-background"
                            : isNext
                              ? "border-[var(--mr-ink)]"
                              : "border-hairline-strong",
                        )}
                      >
                        {done ? (
                          <Check className="size-2.5" strokeWidth={3} />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          done ? "text-ink-3" : "text-foreground",
                          isNext && "font-medium",
                        )}
                      >
                        {m.name}
                      </span>
                      {isNext ? (
                        <span
                          aria-hidden
                          className="hidden h-1 w-14 shrink-0 overflow-hidden rounded-full bg-surface-2 @[30rem]:block"
                        >
                          <motion.span
                            className={cn(
                              "block h-full origin-left rounded-full",
                              late && overdueStyle === "tint"
                                ? "bg-danger"
                                : "bg-[var(--mr-ink)]",
                            )}
                            initial={false}
                            animate={{ scaleX: r3(currentDerived.progress) }}
                            transition={
                              motionSafe
                                ? springs.glide
                                : { duration: durations.fast }
                            }
                          />
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[11px] tabular-nums",
                          late ? "text-danger" : "text-ink-3",
                        )}
                      >
                        <span className="hidden @[20rem]:inline">
                          {`${dateLabel(dayOf(m.due)).split(" ")[0] ?? ""} `}
                        </span>
                        {dateLabel(dayOf(m.due)).split(" ").slice(1).join(" ")}
                      </span>
                    </button>
                  </li>
                );
              })}
              {currentProject.milestones.length === 0 ? (
                <li className="px-5 py-3 text-[13px] text-ink-3">
                  Add a milestone to start the ring.
                </li>
              ) : null}
            </ol>
          </>
        ) : null}
      </section>

      {/* The caption a ring raises when it is hovered or its row focused. */}
      <AnimatePresence>
        {hot && hotProject && hotDerived ? (
          <motion.div
            key={hot.id}
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-2 bg-foreground px-2.5 py-1.5 text-background shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--foreground)_40%,transparent)]"
            style={
              hot.side === "right"
                ? {
                    left: hot.x,
                    top: hot.y,
                    translateY: "-50%",
                    maxWidth: `min(220px, calc(100% - ${hot.x + 8}px))`,
                  }
                : {
                    left: Math.max(6, hot.x),
                    top: Math.max(52, hot.y),
                    translateY: "-100%",
                    maxWidth: `min(220px, calc(100% - ${Math.max(6, hot.x) + 8}px))`,
                  }
            }
            initial={{
              opacity: 0,
              x: motionSafe && hot.side === "right" ? -4 : 0,
              y: motionSafe && hot.side === "above" ? 4 : 0,
            }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              transition: motionSafe
                ? springs.snap
                : { duration: durations.fast },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            {hot.side === "right" ? (
              <p className="truncate text-[11px] font-semibold">
                {hotProject.name}
              </p>
            ) : null}
            <p className="truncate text-[12px] leading-tight font-medium">
              {hotDerived.next
                ? hotDerived.next.name
                : hotDerived.total > 0
                  ? "All milestones reached"
                  : "No milestone set"}
            </p>
            {hotDerived.next ? (
              <p className="font-mono text-[10.5px] leading-tight tabular-nums opacity-75">
                {`${dateLabel(dayOf(hotDerived.next.due))} · ${Math.round(hotDerived.progress * 100)}%`}
                {hotDerived.overdue && hotDerived.days !== null ? (
                  <span className="text-[color-mix(in_oklab,var(--danger)_70%,var(--background))]">
                    {` · ${relLabel(hotDerived.days)}`}
                  </span>
                ) : null}
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </motion.div>
  );
}
