"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  Clock,
  GripVertical,
  RotateCcw,
  Route,
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

export type WeaveHue =
  | "cobalt"
  | "signal"
  | "success"
  | "warn"
  | "danger"
  | "violet"
  | "teal"
  | "ink";

export type WeaveStep = {
  id: string;
  label: string;
  /** How long it takes, in minutes. */
  minutes: number;
};

export type WeaveGoal = {
  id: string;
  /** The chip's text, e.g. "Track crews". */
  label: string;
  /** The group it is listed under, e.g. "Field". */
  group: string;
  /** The colour of its thread. */
  hue: WeaveHue;
  /** Its steps, in order. A step with the same id under another goal is the same step, shared. */
  steps: WeaveStep[];
};

/** The order steps were put in by hand, and the steps taken out by hand. */
export type WeavePlan = { order: string[]; removed: string[] };

/** One step in the woven plan and the picked goals it belongs to, in pick order. */
export type WovenStep = { step: WeaveStep; goals: WeaveGoal[] };

export type WeaveChange = { kind: "pick" | "unpick"; goalId: string };
export type WeavePlanChange =
  | { kind: "move"; stepId: string; from: number; to: number }
  | { kind: "remove"; stepId: string }
  | { kind: "restore"; stepIds: string[] };

export type WeaveResult = {
  goals: string[];
  steps: WeaveStep[];
  minutes: number;
};

export type WeaveThreadStyle = "weave" | "lines" | "none";
export type WeaveDensity = "compact" | "cozy" | "roomy";
export type WeaveAccent = "cobalt" | "signal" | "ink";
export type WeaveStatus = "ready" | "loading" | "error";

export type GoalWeaveProps = {
  /** How a thread runs from a chip to its steps: a curve that twists where two goals share a step, a straight hairline, or none (the strands on each step still carry the colours). @default "weave" */
  threadStyle?: WeaveThreadStyle;
  /** Chip height, row padding and type size. @default "cozy" */
  density?: WeaveDensity;
  /** The colour of the plan's own marks: the This week band, the estimate and Continue. @default "cobalt" */
  accent?: WeaveAccent;
  /** The goals on offer, with their steps. @default defaultWeaveGoals */
  goals?: WeaveGoal[];
  /** Controlled picked goal ids, in the order they were picked. */
  value?: string[];
  /** Initial picks when uncontrolled. @default defaultWeaveValue */
  defaultValue?: string[];
  /** Fires from the press or key that picked a goal or put it back. */
  onChange?: (value: string[], change: WeaveChange) => void;
  /** Controlled plan: the hand-made order and the steps taken out. */
  plan?: WeavePlan;
  /** Initial plan when uncontrolled. @default defaultWeavePlan */
  defaultPlan?: WeavePlan;
  /** Fires after a step is moved, removed, or brought back by re-picking its goal. */
  onPlanChange?: (plan: WeavePlan, change: WeavePlanChange) => void;
  /** Continue was pressed, with the picks, the woven steps in order and the estimate. */
  onContinue?: (result: WeaveResult) => void;
  /** How many steps from the top are marked for this week. @default 3 */
  thisWeek?: number;
  /** Whether the goals have arrived. @default "ready" */
  status?: WeaveStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "What do you want from Fieldline?" */
  title?: string;
  /** The plan column's heading. @default "Your plan" */
  planLabel?: string;
  /** The Continue button's text. @default "Continue" */
  continueLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the goals and the plan scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be picked, moved or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const STEPS = {
  accounting: {
    id: "accounting",
    label: "Connect your accounting",
    minutes: 20,
  },
  reminders: {
    id: "reminders",
    label: "Turn on timesheet reminders",
    minutes: 10,
  },
  templates: {
    id: "templates",
    label: "Set up invoice templates",
    minutes: 25,
  },
  paylink: { id: "paylink", label: "Add a payment link", minutes: 10 },
  licences: {
    id: "licences",
    label: "Upload licences and insurance",
    minutes: 15,
  },
  checklists: {
    id: "checklists",
    label: "Turn on job safety checklists",
    minutes: 20,
  },
  crew: { id: "crew", label: "Import your crew list", minutes: 15 },
  invite: { id: "invite", label: "Invite crews to the app", minutes: 10 },
  hours: { id: "hours", label: "Set working hours", minutes: 5 },
  areas: { id: "areas", label: "Add your service areas", minutes: 15 },
  routes: { id: "routes", label: "Turn on route planning", minutes: 10 },
  jobpost: { id: "jobpost", label: "Write a job post template", minutes: 25 },
  booking: { id: "booking", label: "Publish a booking page", minutes: 30 },
  customers: { id: "customers", label: "Import past customers", minutes: 20 },
} satisfies Record<string, WeaveStep>;

/** Fieldline's eight onboarding goals in three groups; five steps are shared between two goals. */
export const defaultWeaveGoals: WeaveGoal[] = [
  {
    id: "reduce-admin",
    label: "Reduce admin",
    group: "Office",
    hue: "cobalt",
    steps: [STEPS.accounting, STEPS.reminders],
  },
  {
    id: "invoice-faster",
    label: "Invoice faster",
    group: "Office",
    hue: "success",
    steps: [STEPS.accounting, STEPS.templates, STEPS.paylink],
  },
  {
    id: "stay-compliant",
    label: "Stay compliant",
    group: "Office",
    hue: "warn",
    steps: [STEPS.licences, STEPS.checklists],
  },
  {
    id: "track-crews",
    label: "Track crews",
    group: "Field",
    hue: "signal",
    steps: [STEPS.crew, STEPS.invite, STEPS.hours],
  },
  {
    id: "schedule-jobs",
    label: "Schedule jobs",
    group: "Field",
    hue: "violet",
    steps: [STEPS.crew, STEPS.areas, STEPS.hours],
  },
  {
    id: "cut-travel",
    label: "Cut travel",
    group: "Field",
    hue: "teal",
    steps: [STEPS.areas, STEPS.routes],
  },
  {
    id: "grow-team",
    label: "Grow the team",
    group: "Growth",
    hue: "danger",
    steps: [STEPS.invite, STEPS.jobpost],
  },
  {
    id: "win-work",
    label: "Win more work",
    group: "Growth",
    hue: "ink",
    steps: [STEPS.booking, STEPS.customers],
  },
];

export const defaultWeaveValue: string[] = ["track-crews", "invoice-faster"];

export const defaultWeavePlan: WeavePlan = { order: [], removed: [] };

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const HUES: Record<WeaveHue, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  violet: "color-mix(in oklab, var(--accent) 55%, var(--danger))",
  teal: "color-mix(in oklab, var(--accent) 45%, var(--success))",
  ink: "var(--ink-2)",
};

const ACCENTS: Record<WeaveAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  WeaveDensity,
  {
    chip: string;
    row: string;
    text: string;
    sub: string;
    gap: string;
    cap: string;
  }
> = {
  compact: {
    chip: "h-7 px-2.5 text-[12px]",
    row: "min-h-9 px-2 py-1",
    text: "text-[12px]",
    sub: "text-[10px]",
    gap: "gap-1",
    cap: "pt-1.5 pb-0.5",
  },
  cozy: {
    chip: "h-8 px-3 text-[13px]",
    row: "min-h-11 px-2.5 py-1.5",
    text: "text-[13px]",
    sub: "text-[11px]",
    gap: "gap-1.5",
    cap: "pt-2 pb-1",
  },
  roomy: {
    chip: "h-9 px-3.5 text-[13px]",
    row: "min-h-13 px-3 py-2",
    text: "text-sm",
    sub: "text-[11px]",
    gap: "gap-2",
    cap: "pt-3 pb-1.5",
  },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** How long threads keep following the rows after a change: a glide settles in ~450ms. */
const LOOP_MS = 720;
/** The container width, in px, from which the chips and the plan sit side by side (40rem). */
const WIDE = 640;
const STRAND_X: number[][] = [[5], [3, 7], [2, 5, 8]];

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const minutesText = (n: number) => {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return plural(m, "minute", "minutes");
  const hours = plural(h, "hour", "hours");
  return m === 0 ? hours : `${hours} ${plural(m, "minute", "minutes")}`;
};

/**
 * The plan a set of picks weaves: every picked goal's steps, shared ones once
 * with every goal that brought them, minus the steps taken out by hand, in the
 * hand-made order first and then as the goals listed them.
 */
export function weaveSteps(
  goals: WeaveGoal[],
  picked: string[],
  plan: WeavePlan,
): WovenStep[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const map = new Map<string, WovenStep>();
  for (const id of picked) {
    const goal = byId.get(id);
    if (!goal) continue;
    for (const step of goal.steps) {
      if (plan.removed.includes(step.id)) continue;
      const woven = map.get(step.id);
      if (woven) woven.goals.push(goal);
      else map.set(step.id, { step, goals: [goal] });
    }
  }
  const natural = [...map.values()];
  const rank = new Map(plan.order.map((id, i) => [id, i]));
  const ordered = natural
    .filter((w) => rank.has(w.step.id))
    .sort((a, b) => (rank.get(a.step.id) ?? 0) - (rank.get(b.step.id) ?? 0));
  const rest = natural.filter((w) => !rank.has(w.step.id));
  return [...ordered, ...rest];
}

/** The plan's estimate in minutes, for hosts that show it elsewhere. */
export const weaveMinutes = (steps: WovenStep[]) =>
  steps.reduce((sum, w) => sum + w.step.minutes, 0);

const linePath = (x1: number, y1: number, x2: number, y2: number) =>
  `M${r3(x1)} ${r3(y1)} L${r3(x2)} ${r3(y2)}`;

/** A thread from a chip's edge to a step's edge: level at both ends, and bowed through `twist` at its middle so a pair crosses. */
const weavePath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  twist: number,
) => {
  const dx = Math.max(20, (x2 - x1) * 0.32);
  const xm = (x1 + x2) / 2;
  const ym = (y1 + y2) / 2 + twist;
  return (
    `M${r3(x1)} ${r3(y1)} ` +
    `C${r3(x1 + dx)} ${r3(y1)}, ${r3(xm - dx * 0.5)} ${r3(ym)}, ${r3(xm)} ${r3(ym)} ` +
    `C${r3(xm + dx * 0.5)} ${r3(ym)}, ${r3(x2 - dx)} ${r3(y2)}, ${r3(x2)} ${r3(y2)}`
  );
};

/** A strand down a step's edge, in a 10 by 40 box: one runs straight, a pair twists about each other. */
const strandPath = (i: number, n: number, style: WeaveThreadStyle) => {
  const xs = STRAND_X[Math.min(n, 3) - 1] ?? [5];
  const x = xs[i] ?? 5;
  if (style !== "weave" || n !== 2) return `M${x} 0 V40`;
  const other = xs[1 - i] ?? x;
  return `M${x} 0 C${x} 12 ${other} 12 ${other} 20 C${other} 28 ${x} 28 ${x} 40`;
};

const sameGeom = (a: Record<string, string>, b: Record<string, string>) => {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && bk.every((k) => a[k] === b[k]);
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
/*                                   Chip                                   */
/* ----------------------------------------------------------------------- */

function Tick({ on, motionSafe }: { on: boolean; motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-2.5">
      <AnimatePresence initial={false}>
        {on ? (
          <motion.path
            key="tick"
            d="M2.5 7.4 5.6 10.4 11.5 3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={
              motionSafe ? { pathLength: 0, opacity: 1 } : { opacity: 0 }
            }
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { pathLength: springs.flick, opacity: { duration: 0 } }
                : { duration: durations.fast }
            }
          />
        ) : null}
      </AnimatePresence>
    </svg>
  );
}

type GoalChipProps = {
  goal: WeaveGoal;
  picked: boolean;
  density: WeaveDensity;
  motionSafe: boolean;
  tabIndex: number;
  disabled: boolean;
  hintId: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function GoalChip({
  goal,
  picked,
  density,
  motionSafe,
  tabIndex,
  disabled,
  hintId,
  nodeRef,
  onToggle,
  onFocus,
  onNav,
}: GoalChipProps) {
  const hue = HUES[goal.hue];
  const d = DENSITY[density];
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      tabIndex={tabIndex}
      aria-pressed={picked}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onClick={onToggle}
      onKeyDown={onNav}
      whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
      transition={springs.flick}
      style={
        picked
          ? {
              borderColor: `color-mix(in oklab, ${hue} 55%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${hue} 13%, transparent)`,
            }
          : undefined
      }
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors duration-200",
        d.chip,
        picked
          ? "text-foreground"
          : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-foreground",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200"
        style={{
          color: hue,
          borderColor: picked
            ? hue
            : `color-mix(in oklab, ${hue} 60%, transparent)`,
          backgroundColor: picked
            ? `color-mix(in oklab, ${hue} 22%, transparent)`
            : "transparent",
        }}
      >
        <Tick on={picked} motionSafe={motionSafe} />
      </span>
      <span className="truncate">{goal.label}</span>
      <span className="font-mono text-[10px] tabular-nums opacity-60">
        {goal.steps.length}
      </span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Step                                   */
/* ----------------------------------------------------------------------- */

function Strands({
  goals,
  style,
}: {
  goals: WeaveGoal[];
  style: WeaveThreadStyle;
}) {
  const shown = goals.slice(0, 3);
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 40"
      preserveAspectRatio="none"
      className="h-full w-2.5 overflow-visible"
    >
      <AnimatePresence initial={false}>
        {shown.map((g, i) => (
          <motion.path
            key={g.id}
            d={strandPath(i, shown.length, style)}
            fill="none"
            stroke={HUES[g.hue]}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
        ))}
      </AnimatePresence>
    </svg>
  );
}

type StepRowProps = {
  woven: WovenStep;
  index: number;
  count: number;
  week: boolean;
  enterDelay: number;
  density: WeaveDensity;
  threadStyle: WeaveThreadStyle;
  motionSafe: boolean;
  selected: boolean;
  dragged: boolean;
  settling: boolean;
  dragY: MotionValue<number>;
  disabled: boolean;
  hintId: string;
  nodeRef: (node: HTMLLIElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onRemove: () => void;
  onGripDown: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onGripMove: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onGripUp: (event: React.PointerEvent<HTMLSpanElement>) => void;
};

function StepRow({
  woven,
  index,
  count,
  week,
  enterDelay,
  density,
  threadStyle,
  motionSafe,
  selected,
  dragged,
  settling,
  dragY,
  disabled,
  hintId,
  nodeRef,
  onFocus,
  onKeyDown,
  onRemove,
  onGripDown,
  onGripMove,
  onGripUp,
}: StepRowProps) {
  const inHand = dragged || settling;
  const d = DENSITY[density];
  const names = woven.goals.map((g) => g.label).join(" and ");
  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={selected}
      aria-label={`${woven.step.label}, ${plural(woven.step.minutes, "minute", "minutes")}, position ${index + 1} of ${count}, ${week ? "this week" : "later"}, from ${names}`}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      layout={motionSafe && !inHand ? "position" : false}
      initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: motionSafe ? -distances.step : 0,
        transition: exitFor(durations.base),
      }}
      transition={{
        layout: springs.glide,
        x: motionSafe
          ? { ...springs.glide, delay: enterDelay }
          : { duration: 0 },
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? enterDelay : 0,
        },
      }}
      style={{ y: inHand ? dragY : 0 }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-2 border bg-surface-0 transition-[box-shadow,border-color,background-color] duration-200",
        d.row,
        inHand
          ? "z-10 border-[color-mix(in_oklab,var(--gw-accent)_45%,var(--hairline-strong))] shadow-[0_12px_30px_-12px_color-mix(in_oklab,black_45%,transparent)]"
          : "border-hairline hover:bg-surface-1",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        className={cn(
          "flex size-6 shrink-0 touch-none items-center justify-center rounded-2 text-ink-3 transition-colors select-none",
          disabled
            ? "cursor-not-allowed"
            : dragged
              ? "cursor-grabbing bg-surface-2 text-foreground"
              : "cursor-grab hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <GripVertical className="size-3.5" />
      </span>
      <span className="flex min-h-6 self-stretch">
        <Strands goals={woven.goals} style={threadStyle} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-medium text-foreground", d.text)}>
          {woven.step.label}
        </span>
        <span className={cn("flex min-w-0 items-center gap-1.5", d.sub)}>
          {woven.goals.map((g, i) => (
            <span
              key={g.id}
              className="flex min-w-0 items-center gap-1 text-ink-3"
            >
              {i > 0 ? <span aria-hidden>+</span> : null}
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: HUES[g.hue] }}
              />
              <span className="truncate">{g.label}</span>
            </span>
          ))}
        </span>
      </span>
      <span className="font-mono text-[11px] whitespace-nowrap text-ink-3 tabular-nums">
        {woven.step.minutes} min
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${woven.step.label}`}
        aria-disabled={disabled || undefined}
        onClick={onRemove}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 opacity-50 transition-[opacity,background-color,color] group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type DragState = {
  id: string;
  pointerId: number;
  startY: number;
  top: number;
  height: number;
  /** The top of the first row: the stack every slot is measured from. */
  base: number;
  others: { id: string; height: number }[];
  gap: number;
  /** The Later caption's height plus its gap, or 0 when the list is short enough to have none. */
  laterH: number;
  from: number;
  index: number;
  listTop: number;
  listBottom: number;
};

type Batch = { ids: string[]; seq: number };

/**
 * An onboarding step where goals weave a plan. Goal chips sit in groups on
 * the left; picking one draws a tick on `springs.flick` and sends a thread
 * from the chip to each step it brings, drawn end to end on `springs.glide`
 * as the steps themselves glide into the plan on the right in a `cascade`.
 * A step two goals share arrives once and carries both colours as a twisted
 * pair of strands; the threads cross on their way to it. Putting a goal back
 * pulls its steps out on the exit ease while shared steps stay and lose one
 * strand, and the estimate in the header rolls on `springs.snap`.
 *
 * The plan is a listbox: Up and Down move, Alt with Up or Down moves a step
 * and the rest glide around it, Delete takes one out, and the grip drags a
 * row with the pointer, the row in hand landing on glide. The first three
 * steps are banded This week. Under reduced motion nothing draws or travels:
 * ticks, threads and rows appear in place, and every count still changes.
 *
 * Threads are measured from the chips and rows and follow them only while a
 * glide is in flight; the measuring stops once settled, when the tab is
 * hidden, or when the surface is off screen. Below a 40rem container the
 * chips stack above the plan and the strands on each row carry the colours
 * alone.
 */
export function GoalWeave({
  threadStyle = "weave",
  density = "cozy",
  accent = "cobalt",
  goals = defaultWeaveGoals,
  value,
  defaultValue = defaultWeaveValue,
  onChange,
  plan,
  defaultPlan = defaultWeavePlan,
  onPlanChange,
  onContinue,
  thisWeek = 3,
  status = "ready",
  onRetry,
  title = "What do you want from Fieldline?",
  planLabel = "Your plan",
  continueLabel = "Continue",
  label,
  height = 540,
  disabled = false,
  className,
}: GoalWeaveProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const chipHintId = `${uid}-chip-hint`;
  const planHintId = `${uid}-plan-hint`;
  const planTitleId = `${uid}-plan-title`;

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const picked = value ?? own;
  const [ownPlan, setOwnPlan] = React.useState<WeavePlan>(defaultPlan);
  const currentPlan = plan ?? ownPlan;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [activeStep, setActiveStep] = React.useState<string | null>(null);
  const [batch, setBatch] = React.useState<Batch>({ ids: [], seq: 0 });
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  const [settlingId, setSettlingId] = React.useState<string | null>(null);
  const [geom, setGeom] = React.useState<Record<string, string>>({});
  const [wide, setWide] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);

  const dragY = useMotionValue(0);
  const dragRef = React.useRef<DragState | null>(null);
  const settle = React.useRef<ReturnType<typeof animate> | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const stepNodes = React.useRef(new Map<string, HTMLLIElement>());
  const pathNodes = React.useRef(new Map<string, SVGPathElement>());
  const shapeRef = React.useRef<{
    rows: WovenStep[];
    style: WeaveThreadStyle;
  }>({ rows: [], style: threadStyle });
  const awakeRef = React.useRef(true);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(goals.map((g) => [g.id, g]));
  const woven = weaveSteps(goals, picked, currentPlan);
  const shown =
    dragOrder && dragOrder.length === woven.length
      ? dragOrder
          .map((id) => woven.find((w) => w.step.id === id))
          .filter((w): w is WovenStep => w !== undefined)
      : woven;
  const minutes = weaveMinutes(woven);
  const hours = Math.floor(minutes / 60);
  const weekCount = Math.min(Math.max(0, thisWeek), woven.length);

  const groups = goals.reduce<{ name: string; goals: WeaveGoal[] }[]>(
    (acc, g) => {
      const group = acc.find((x) => x.name === g.group);
      if (group) group.goals.push(g);
      else acc.push({ name: g.group, goals: [g] });
      return acc;
    },
    [],
  );
  const chipIds = goals.map((g) => g.id);
  const activeChipId =
    activeChip && chipIds.includes(activeChip)
      ? activeChip
      : (chipIds[0] ?? null);
  const stepIds = shown.map((w) => w.step.id);
  const activeStepId =
    activeStep && stepIds.includes(activeStep)
      ? activeStep
      : (stepIds[0] ?? null);

  const threadKey = shown
    .map((w) => `${w.step.id}:${w.goals.map((g) => g.id).join("+")}`)
    .join("|");
  const batchStep = cascade(Math.max(1, batch.ids.length));
  const delayFor = (stepId: string) => {
    const i = batch.ids.indexOf(stepId);
    return i < 0 ? 0 : r3(Math.min(i, 8) * batchStep);
  };
  const pairs = shown.flatMap((w) =>
    w.goals.slice(0, 3).map((g) => ({
      key: `${g.id}:${w.step.id}`,
      hue: HUES[g.hue],
      delay: delayFor(w.step.id),
    })),
  );

  /* ------------------------------ measuring ---------------------------- */

  React.useEffect(() => {
    shapeRef.current = { rows: shown, style: threadStyle };
  });

  /** Reads every thread's two ends and writes the paths; `commit` also stores them for the next render. */
  const measure = React.useCallback((commit: boolean) => {
    const body = bodyRef.current;
    const list = listRef.current;
    const pane = paneRef.current;
    if (!body || !list || !pane) return;
    const { rows, style } = shapeRef.current;
    const br = body.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const pr = pane.getBoundingClientRect();
    const next: Record<string, string> = {};
    for (const w of rows) {
      const stepNode = stepNodes.current.get(w.step.id);
      if (!stepNode) continue;
      const sr = stepNode.getBoundingClientRect();
      const cy = sr.top + sr.height / 2;
      if (cy < lr.top || cy > lr.bottom) continue;
      const strands = w.goals.slice(0, 3);
      const n = strands.length;
      strands.forEach((g, i) => {
        const chipNode = chipNodes.current.get(g.id);
        if (!chipNode) return;
        const cr = chipNode.getBoundingClientRect();
        const ccy = cr.top + cr.height / 2;
        if (ccy < pr.top || ccy > pr.bottom) return;
        const off = n > 1 ? (i - (n - 1) / 2) * 4 : 0;
        const x1 = cr.right - br.left;
        const y1 = ccy - br.top;
        const x2 = sr.left - br.left + 1;
        const y2 = cy - br.top + off;
        next[`${g.id}:${w.step.id}`] =
          style === "lines"
            ? linePath(x1, y1, x2, y2)
            : weavePath(x1, y1, x2, y2, -off * 1.5);
      });
    }
    for (const [key, d] of Object.entries(next)) {
      pathNodes.current.get(key)?.setAttribute("d", d);
    }
    if (commit) setGeom((prev) => (sameGeom(prev, next) ? prev : next));
  }, []);

  // After any change to the plan the rows glide for ~450ms; the threads
  // follow them frame by frame until then, and not a frame longer.
  React.useEffect(() => {
    if (!wide || threadStyle === "none" || !ready) return;
    const until = performance.now() + (motionSafe ? LOOP_MS : 0);
    let raf = 0;
    const tick = () => {
      const more = performance.now() < until && awakeRef.current;
      measure(!more);
      raf = more ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(() => {
      // The first frame commits too, so paths that just mounted have a d.
      measure(true);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [threadKey, wide, threadStyle, density, ready, motionSafe, measure]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const body = bodyRef.current;
    const list = listRef.current;
    const pane = paneRef.current;
    let raf = 0;
    const request = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure(true);
      });
    };
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === root) setWide(entry.contentRect.width >= WIDE);
      }
      request();
    });
    ro.observe(root);
    if (body) ro.observe(body);
    if (list) ro.observe(list);
    list?.addEventListener("scroll", request, { passive: true });
    pane?.addEventListener("scroll", request, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      list?.removeEventListener("scroll", request);
      pane?.removeEventListener("scroll", request);
    };
  }, [measure, ready]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let onScreen = true;
    let visible = document.visibilityState !== "hidden";
    const update = () => {
      const was = awakeRef.current;
      awakeRef.current = onScreen && visible;
      if (!was && awakeRef.current) measure(true);
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) onScreen = entry.isIntersecting;
            update();
          });
    io?.observe(root);
    const onVisibility = () => {
      visible = document.visibilityState !== "hidden";
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [measure]);

  React.useEffect(
    () => () => {
      settle.current?.stop();
    },
    [],
  );

  // Focus moves to a neighbour after a row is taken out — bound after the
  // DOM has changed.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    stepNodes.current.get(focusReq.id)?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- changes ----------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  const setPlanValue = (next: WeavePlan, change: WeavePlanChange) => {
    if (plan === undefined) setOwnPlan(next);
    onPlanChange?.(next, change);
  };

  const planText = (rows: WovenStep[]) =>
    rows.length === 0
      ? "The plan is empty."
      : `Plan: ${plural(rows.length, "step", "steps")}, about ${minutesText(weaveMinutes(rows))}.`;

  const toggleGoal = (id: string) => {
    if (inert) return;
    const goal = byId.get(id);
    if (!goal) return;
    const wasPicked = picked.includes(id);
    const next = wasPicked ? picked.filter((x) => x !== id) : [...picked, id];
    if (value === undefined) setOwn(next);
    onChange?.(next, { kind: wasPicked ? "unpick" : "pick", goalId: id });

    let nextPlan = currentPlan;
    if (!wasPicked) {
      // Picking a goal again brings back any of its steps taken out by hand.
      const restored = goal.steps
        .map((s) => s.id)
        .filter((sid) => currentPlan.removed.includes(sid));
      if (restored.length > 0) {
        nextPlan = {
          ...currentPlan,
          removed: currentPlan.removed.filter((sid) => !restored.includes(sid)),
        };
        setPlanValue(nextPlan, { kind: "restore", stepIds: restored });
      }
    }
    const after = weaveSteps(goals, next, nextPlan);
    if (!wasPicked) {
      const added = after
        .filter((w) => !woven.some((b) => b.step.id === w.step.id))
        .map((w) => w.step.id);
      setBatch((b) => ({ ids: added, seq: b.seq + 1 }));
      const shared = after
        .filter(
          (w) => w.goals.some((g) => g.id === id) && !added.includes(w.step.id),
        )
        .map((w) => w.step.label);
      announce(
        `${goal.label} picked. ${plural(added.length, "step", "steps")} added${
          shared.length > 0 ? `, ${shared.join(" and ")} already in` : ""
        }. ${planText(after)}`,
      );
    } else {
      const pulled = woven.filter(
        (w) => !after.some((a) => a.step.id === w.step.id),
      ).length;
      const stays = woven
        .filter(
          (w) =>
            w.goals.some((g) => g.id === id) &&
            after.some((a) => a.step.id === w.step.id),
        )
        .map((w) => w.step.label);
      announce(
        `${goal.label} put back. ${plural(pulled, "step", "steps")} pulled out${
          stays.length > 0
            ? `; ${stays.join(" and ")} ${stays.length === 1 ? "stays" : "stay"}`
            : ""
        }. ${planText(after)}`,
      );
    }
  };

  const moveStep = (id: string, from: number, to: number) => {
    if (inert) return;
    const ids = woven.map((w) => w.step.id);
    const target = clamp(to, 0, ids.length - 1);
    if (target === from || ids[from] !== id) return;
    ids.splice(from, 1);
    ids.splice(target, 0, id);
    setPlanValue(
      { ...currentPlan, order: ids },
      { kind: "move", stepId: id, from, to: target },
    );
    const w = woven.find((x) => x.step.id === id);
    announce(
      `Moved ${w?.step.label ?? "the step"} to position ${target + 1} of ${ids.length}, ${
        target < thisWeek ? "this week" : "later"
      }.`,
    );
  };

  const removeStep = (id: string) => {
    if (inert) return;
    const i = stepIds.indexOf(id);
    const w = shown[i];
    if (i < 0 || !w) return;
    const hadFocus =
      typeof document !== "undefined" &&
      stepNodes.current.get(id)?.contains(document.activeElement);
    const neighbour = stepIds[i + 1] ?? stepIds[i - 1] ?? null;
    const next: WeavePlan = {
      order: currentPlan.order.filter((x) => x !== id),
      removed: [...currentPlan.removed, id],
    };
    setPlanValue(next, { kind: "remove", stepId: id });
    const after = weaveSteps(goals, picked, next);
    announce(`${w.step.label} taken out. ${planText(after)}`);
    if (hadFocus && neighbour) {
      setActiveStep(neighbour);
      setFocusReq((f) => ({ id: neighbour, seq: (f?.seq ?? 0) + 1 }));
    }
  };

  const submit = () => {
    if (inert || woven.length === 0) return;
    onContinue?.({
      goals: picked,
      steps: woven.map((w) => w.step),
      minutes,
    });
    announce(
      `Continuing with ${plural(woven.length, "step", "steps")}, about ${minutesText(minutes)}.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onChipNav = (event: React.KeyboardEvent, id: string) => {
    const i = chipIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = chipIds.length - 1;
    else return;
    event.preventDefault();
    const target = chipIds[clamp(to, 0, chipIds.length - 1)];
    if (target) chipNodes.current.get(target)?.focus();
  };

  const onStepKey = (event: React.KeyboardEvent, id: string, index: number) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const dir = event.key === "ArrowUp" ? -1 : 1;
      if (event.altKey) {
        if (!dragRef.current) moveStep(id, index, index + dir);
        return;
      }
      const target = stepIds[clamp(index + dir, 0, stepIds.length - 1)];
      if (target) stepNodes.current.get(target)?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target =
        event.key === "Home" ? stepIds[0] : stepIds[stepIds.length - 1];
      if (target) stepNodes.current.get(target)?.focus();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (!dragRef.current) removeStep(id);
      return;
    }
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      endDrag(null, true);
    }
  };

  /* -------------------------------- drag ------------------------------- */

  const capture = (element: Element, pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // No live pointer to capture.
    }
  };

  const release = (element: Element, pointerId: number) => {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Already released, or never captured.
    }
  };

  /** Where the row in hand sits when it is the `index`th row: the others stacked from the top, the Later caption counted once past it. */
  const slotTop = (d: DragState, index: number) => {
    let top = d.base;
    for (let k = 0; k < index; k += 1) {
      top += (d.others[k]?.height ?? 0) + d.gap;
    }
    if (d.laterH > 0 && index >= thisWeek) top += d.laterH;
    return top;
  };

  const onGripDown = (
    event: React.PointerEvent<HTMLSpanElement>,
    id: string,
  ) => {
    if (inert || event.button !== 0 || dragRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const rects = shown
      .map((w) => ({
        id: w.step.id,
        rect: stepNodes.current.get(w.step.id)?.getBoundingClientRect(),
      }))
      .filter((x): x is { id: string; rect: DOMRect } => x.rect !== undefined);
    const me = rects.find((x) => x.id === id);
    if (!me) return;
    // The gap between two rows with nothing between them; the pair either
    // side of the Later caption is skipped.
    let gap = 6;
    for (let k = 1; k < rects.length; k += 1) {
      if (k === thisWeek) continue;
      const a = rects[k - 1];
      const b = rects[k];
      if (a && b) {
        gap = Math.max(0, b.rect.top - a.rect.bottom);
        break;
      }
    }
    const beforeLater = rects[thisWeek - 1];
    const atLater = rects[thisWeek];
    const laterH =
      beforeLater && atLater
        ? Math.max(0, atLater.rect.top - beforeLater.rect.bottom - gap)
        : 0;
    const first = rects[0];
    const from = rects.findIndex((x) => x.id === id);
    const lr = list.getBoundingClientRect();
    event.preventDefault();
    stepNodes.current.get(id)?.focus({ preventScroll: true });
    capture(event.currentTarget, event.pointerId);
    settle.current?.stop();
    settle.current = null;
    dragY.set(0);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      top: me.rect.top,
      height: me.rect.height,
      base: first?.rect.top ?? me.rect.top,
      others: rects
        .filter((x) => x.id !== id)
        .map((x) => ({ id: x.id, height: x.rect.height })),
      gap,
      laterH,
      from,
      index: from,
      listTop: lr.top,
      listBottom: lr.bottom,
    };
    setSettlingId(null);
    setDragId(id);
  };

  const onGripMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    const raw = d.top + (event.clientY - d.startY);
    const top = clamp(
      raw,
      Math.min(d.listTop, d.top),
      Math.max(d.listBottom - d.height, d.top),
    );
    const centre = top + d.height / 2;
    // The row in hand takes whichever slot its centre is nearest to.
    let index = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= d.others.length; i += 1) {
      const dist = Math.abs(centre - (slotTop(d, i) + d.height / 2));
      if (dist < best) {
        best = dist;
        index = i;
      }
    }
    if (index !== d.index) {
      d.index = index;
      const ids = d.others.map((o) => o.id);
      ids.splice(index, 0, d.id);
      setDragOrder(ids);
    }
    dragY.set(top - slotTop(d, index));
    measure(false);
  };

  const endDrag = (
    event: React.PointerEvent<HTMLSpanElement> | null,
    cancel: boolean,
  ) => {
    const d = dragRef.current;
    if (!d) return;
    if (event) {
      if (event.pointerId !== d.pointerId) return;
      release(event.currentTarget, event.pointerId);
    }
    dragRef.current = null;
    const to = cancel ? d.from : d.index;
    const w = woven.find((x) => x.step.id === d.id);
    if (!cancel && to !== d.from && w) {
      const ids = d.others.map((o) => o.id);
      ids.splice(to, 0, d.id);
      setPlanValue(
        { ...currentPlan, order: ids },
        { kind: "move", stepId: d.id, from: d.from, to },
      );
      announce(
        `Moved ${w.step.label} to position ${to + 1} of ${ids.length}, ${
          to < thisWeek ? "this week" : "later"
        }.`,
      );
    } else if (w) {
      announce(
        cancel
          ? `Move cancelled. ${w.step.label} stays at position ${d.from + 1}.`
          : `${w.step.label} stays at position ${d.from + 1}.`,
      );
    }
    setDragOrder(null);
    setDragId(null);
    // The row in hand glides the rest of the way into its slot.
    const current = dragY.get();
    if (cancel) dragY.set(current - (slotTop(d, d.from) - slotTop(d, d.index)));
    if (motionSafe && Math.abs(dragY.get()) > 0.5) {
      setSettlingId(d.id);
      settle.current = animate(dragY, 0, {
        ...springs.glide,
        onUpdate: () => measure(false),
        onComplete: () => {
          settle.current = null;
          setSettlingId(null);
          measure(true);
        },
      });
    } else {
      dragY.set(0);
      setSettlingId(null);
      measure(true);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const paneClass =
    "shrink-0 overflow-y-auto overscroll-contain border-b border-hairline @min-[40rem]:w-[44%] @min-[40rem]:max-w-[22rem] @min-[40rem]:border-r @min-[40rem]:border-b-0";

  const caption = (key: string, text: string, week: boolean) => (
    <motion.li
      key={key}
      role="presentation"
      aria-hidden
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "flex items-center gap-2 px-1 font-mono text-[10px] tracking-[0.08em] uppercase",
        d.cap,
        week ? "text-(--gw-accent)" : "text-ink-3",
      )}
    >
      <span
        className={cn(
          "h-2.5 w-0.5 rounded-full",
          week ? "bg-(--gw-accent)" : "bg-hairline-strong",
        )}
      />
      {text}
    </motion.li>
  );

  const summary =
    woven.length === 0
      ? picked.length === 0
        ? "Nothing planned yet"
        : "Every step is out"
      : `${plural(woven.length, "step", "steps")} · ${weekCount} this week`;

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
      style={{ height, ["--gw-accent" as string]: ACCENTS[accent] }}
    >
      <p id={chipHintId} className="sr-only">
        Arrows move between goals. Space or Enter picks a goal or puts it back.
      </p>
      <p id={planHintId} className="sr-only">
        Up and Down move between steps. Alt with Up or Down moves a step. Delete
        takes it out of the plan.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready ? (
          <p className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2">
            <Clock aria-hidden className="size-3.5 text-(--gw-accent)" />
            <span className="sr-only">About {minutesText(minutes)}</span>
            <span
              aria-hidden
              className="flex items-baseline gap-1 font-mono text-[13px] text-foreground"
            >
              {hours > 0 ? (
                <>
                  <Roll value={hours} motionSafe={motionSafe} />
                  <span className="text-[11px] text-ink-2">h</span>
                </>
              ) : null}
              <Roll
                value={hours > 0 ? minutes % 60 : minutes}
                motionSafe={motionSafe}
              />
              <span className="text-[11px] text-ink-2">min</span>
            </span>
          </p>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The goals didn&apos;t load.</p>
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
        <div
          aria-hidden
          className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row"
        >
          <div className={cn(paneClass, "flex flex-col gap-3 px-4 py-3")}>
            {[0, 1, 2].map((g) => (
              <div key={g} className="flex flex-col gap-1.5">
                <span className="h-2.5 w-12 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-8 rounded-full bg-surface-2 motion-safe:animate-pulse"
                      style={{
                        width: 76 + (((g * 3 + i) * 19) % 40),
                        animationDelay: `${(g * 3 + i) * 60}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-3">
            <span className="mx-1 mb-1 h-2.5 w-14 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="relative flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row"
        >
          <div
            ref={paneRef}
            role="toolbar"
            aria-label="Goals"
            className={cn(paneClass, "flex flex-col gap-3 px-4 py-3")}
          >
            {goals.length === 0 ? (
              <p className="text-[12px] text-ink-3">No goals to pick from.</p>
            ) : (
              groups.map((group) => (
                <div
                  key={group.name}
                  role="group"
                  aria-label={group.name}
                  className="flex flex-col gap-1.5"
                >
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {group.name}
                  </span>
                  <div className={cn("flex flex-wrap", d.gap)}>
                    {group.goals.map((goal) => (
                      <GoalChip
                        key={goal.id}
                        goal={goal}
                        picked={picked.includes(goal.id)}
                        density={density}
                        motionSafe={motionSafe}
                        tabIndex={activeChipId === goal.id ? 0 : -1}
                        disabled={inert}
                        hintId={chipHintId}
                        nodeRef={(node) => {
                          if (node) chipNodes.current.set(goal.id, node);
                          else chipNodes.current.delete(goal.id);
                        }}
                        onToggle={() => toggleGoal(goal.id)}
                        onFocus={() => setActiveChip(goal.id)}
                        onNav={(event) => onChipNav(event, goal.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-1.5">
              <p
                id={planTitleId}
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {planLabel}
              </p>
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
                {plural(woven.length, "step", "steps")}
              </p>
            </div>
            <div
              ref={listRef}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
            >
              {woven.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
                  <Route aria-hidden className="size-5 text-ink-3" />
                  <p className="max-w-[18rem] text-sm text-ink-2">
                    {picked.length === 0
                      ? "Pick a goal and its first steps weave in here."
                      : "Every step is out. Press a goal again to bring its steps back."}
                  </p>
                  <div
                    aria-hidden
                    className="flex w-full max-w-[16rem] flex-col gap-1.5"
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-8 rounded-2 border border-dashed border-hairline-strong"
                        style={{ opacity: 1 - i * 0.28 }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <ul
                  role="listbox"
                  aria-labelledby={planTitleId}
                  className="relative flex flex-col gap-1.5"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {shown.flatMap((w, i) => {
                      const id = w.step.id;
                      const items: React.ReactNode[] = [];
                      if (i === 0)
                        items.push(caption("cap-week", "This week", true));
                      if (i === thisWeek && thisWeek > 0) {
                        items.push(caption("cap-later", "Later", false));
                      }
                      items.push(
                        <StepRow
                          key={id}
                          woven={w}
                          index={i}
                          count={shown.length}
                          week={i < thisWeek}
                          enterDelay={delayFor(id)}
                          density={density}
                          threadStyle={threadStyle}
                          motionSafe={motionSafe}
                          selected={activeStepId === id}
                          dragged={dragId === id}
                          settling={settlingId === id}
                          dragY={dragY}
                          disabled={inert}
                          hintId={planHintId}
                          nodeRef={(node) => {
                            if (node) stepNodes.current.set(id, node);
                            else stepNodes.current.delete(id);
                          }}
                          onFocus={() => setActiveStep(id)}
                          onKeyDown={(event) => onStepKey(event, id, i)}
                          onRemove={() => removeStep(id)}
                          onGripDown={(event) => onGripDown(event, id)}
                          onGripMove={onGripMove}
                          onGripUp={(event) => endDrag(event, false)}
                        />,
                      );
                      return items;
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </div>

          {/* The threads, chip to step, drawn over both columns. Hidden when
              the columns stack: the strands on each row carry the colours. */}
          <svg
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-10 hidden h-full w-full overflow-visible",
              threadStyle !== "none" && "@min-[40rem]:block",
            )}
          >
            <AnimatePresence initial={false}>
              {threadStyle === "none"
                ? null
                : pairs.map((p) => (
                    <motion.path
                      key={p.key}
                      ref={(node) => {
                        if (node) pathNodes.current.set(p.key, node);
                        else pathNodes.current.delete(p.key);
                      }}
                      d={geom[p.key] ?? ""}
                      fill="none"
                      stroke={p.hue}
                      strokeWidth={threadStyle === "lines" ? 1 : 1.5}
                      strokeLinecap="round"
                      opacity={0.85}
                      initial={
                        motionSafe
                          ? { pathLength: 0, opacity: 0.85 }
                          : { opacity: 0 }
                      }
                      animate={{ pathLength: 1, opacity: 0.85 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={
                        motionSafe
                          ? {
                              pathLength: { ...springs.glide, delay: p.delay },
                              opacity: { duration: 0 },
                            }
                          : { duration: durations.fast }
                      }
                    />
                  ))}
            </AnimatePresence>
          </svg>
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
        <p className="min-w-0 truncate text-[12px] text-ink-2">{summary}</p>
        <motion.button
          type="button"
          onClick={submit}
          aria-disabled={inert || woven.length === 0 || undefined}
          whileTap={
            motionSafe && !inert && woven.length > 0
              ? { scale: 0.97 }
              : undefined
          }
          transition={springs.flick}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
            !inert && woven.length > 0
              ? "bg-(--gw-accent) text-primary-foreground hover:opacity-90"
              : "cursor-default bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          {continueLabel}
          <ArrowRight aria-hidden className="size-3.5" />
        </motion.button>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
