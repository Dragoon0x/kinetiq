"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  GripHorizontal,
  Pin,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TimeFitStep = {
  id: string;
  title: string;
  /** The agent's estimate, in minutes. */
  minutes: number;
  /** What the step is worth, 1 to 10. Steps rank by value, then by the shorter estimate. */
  value: number;
  /** Who or what runs it. Read out with the step; not drawn. */
  owner?: string;
};

export type TimeFitLineStyle = "rule" | "dashed" | "band";
export type TimeFitDensity = "compact" | "regular" | "roomy";
export type TimeFitStatus = "ready" | "loading" | "error";

/** What Approve hands back: the steps above the line and the time they take. */
export type TimeFitPlan = {
  /** Ids above the line, in rank order. */
  stepIds: string[];
  /** The budget, in minutes. */
  budget: number;
  /** Minutes the steps above the line take. */
  minutes: number;
  /** Minutes after midnight the last of them should finish. */
  finish: number;
  /** The pinned steps alone need more than the budget. */
  over: boolean;
};

export type TimeFitProps = {
  /** The plan's steps, in any order: the component ranks them. @default defaultTimeFitSteps */
  steps?: TimeFitStep[];
  /** Controlled budget, in minutes. */
  budget?: number;
  /** Initial budget when uncontrolled, in minutes. @default 150 */
  defaultBudget?: number;
  /** Fires from the drag or key that moved the line, with the new budget in minutes. */
  onBudgetChange?: (minutes: number) => void;
  /** Controlled pinned step ids: pinned steps always stay above the line. */
  pinned?: string[];
  /** Initial pinned ids when uncontrolled. @default [] */
  defaultPinned?: string[];
  /** Fires from the click or key that pinned or unpinned a step. */
  onPinStep?: (id: string, pinned: boolean) => void;
  /** Approve was pressed: the steps above the line, the minutes they take and when they finish. */
  onApprove?: (plan: TimeFitPlan) => void;
  /** The shortest budget the line allows, minutes. @default 30 */
  minBudget?: number;
  /** The longest budget the line allows, minutes. @default 360 */
  maxBudget?: number;
  /** Minutes per key press and the grain a drag snaps to. @default 5 */
  budgetStep?: number;
  /** When the plan starts, in minutes after midnight; the finish time counts from it. @default 785 (13:05) */
  now?: number;
  /** The budget line's character: a rule with a pill, a dashed cut line, or a band that carries its own text. @default "rule" */
  lineStyle?: TimeFitLineStyle;
  /** Row height and type size. @default "regular" */
  density?: TimeFitDensity;
  /** The line, pins, value meters and Approve — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The plan's name. @default "Launch checklist" */
  title?: string;
  /** Who the plan is for, shown above the title. @default "Fernworks" */
  product?: string;
  /** The surface's accessible name. @default "<product> <title>" */
  label?: string;
  /** Whether the plan has arrived. @default "ready" */
  status?: TimeFitStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** Read only: the line, pins and Approve do nothing. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Fernworks' launch-day checklist, as the agent estimated and scored it. */
export const defaultTimeFitSteps: TimeFitStep[] = [
  {
    id: "freeze",
    title: "Freeze the release branch",
    minutes: 15,
    value: 9,
    owner: "Agent",
  },
  {
    id: "smoke",
    title: "Run checkout smoke tests",
    minutes: 40,
    value: 9,
    owner: "Agent",
  },
  {
    id: "load",
    title: "Load test at twice peak",
    minutes: 90,
    value: 7,
    owner: "Agent",
  },
  {
    id: "status",
    title: "Draft the status page notice",
    minutes: 20,
    value: 6,
    owner: "Mara",
  },
  {
    id: "support",
    title: "Brief the support team",
    minutes: 25,
    value: 7,
    owner: "Joel",
  },
  {
    id: "rollback",
    title: "Rehearse the rollback",
    minutes: 35,
    value: 8,
    owner: "Agent",
  },
  {
    id: "changelog",
    title: "Polish the changelog art",
    minutes: 30,
    value: 2,
    owner: "Priya",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** "45m", "2h", "2h 30m". */
export const formatMinutes = (m: number): string => {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const rest = total % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
};

/** The same, spoken: "2 hours 30 minutes". */
const spokenMinutes = (m: number): string => {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const rest = total % 60;
  const hours = h === 0 ? "" : `${h} ${h === 1 ? "hour" : "hours"}`;
  const mins = rest === 0 ? "" : `${rest} ${rest === 1 ? "minute" : "minutes"}`;
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
};

/** A fixed 24-hour clock: a locale lookup in render would not survive hydration. */
export const formatClock = (minutes: number): string => {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const listOf = (names: string[]): string => {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** By value, then by the shorter estimate, then as given — stable on both sides of hydration. */
function rankSteps(steps: TimeFitStep[]): TimeFitStep[] {
  return steps
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) =>
        b.step.value - a.step.value ||
        a.step.minutes - b.step.minutes ||
        a.index - b.index,
    )
    .map((x) => x.step);
}

type Packing = { fit: Set<string>; used: number; over: boolean };

/**
 * Pinned steps go in first whatever they cost; then each ranked step that
 * still fits, skipping a big one so smaller ones behind it can go in. A bigger
 * budget can therefore admit a big step and push two small ones out — the
 * re-pack moves rows across the line in both directions at once.
 */
function pack(
  ranked: TimeFitStep[],
  pinned: ReadonlySet<string>,
  budget: number,
): Packing {
  const fit = new Set<string>();
  let used = 0;
  for (const step of ranked) {
    if (!pinned.has(step.id)) continue;
    fit.add(step.id);
    used += step.minutes;
  }
  const over = used > budget;
  for (const step of ranked) {
    if (fit.has(step.id) || used + step.minutes > budget) continue;
    fit.add(step.id);
    used += step.minutes;
  }
  return { fit, used, over };
}

/** The packing a host can read without rendering: which steps fit and what they take. */
export function packTimeFit(
  steps: TimeFitStep[],
  pinned: string[],
  budget: number,
): { stepIds: string[]; minutes: number; over: boolean } {
  const ranked = rankSteps(steps);
  const p = pack(ranked, new Set(pinned), budget);
  return {
    stepIds: ranked.filter((s) => p.fit.has(s.id)).map((s) => s.id),
    minutes: p.used,
    over: p.over,
  };
}

/* ----------------------------------------------------------------------- */
/*                           Literal class tables                           */
/* ----------------------------------------------------------------------- */

/**
 * Row height lives in one CSS variable set by a container query, so the
 * server's first paint already has the right rhythm at 316 and at 760: the
 * rows' transforms are `calc(slot × var(--tf-row))`, never measured px.
 */
const ROW_VARS: Record<TimeFitDensity, string> = {
  compact: "[--tf-row:42px] @min-[24rem]/time-fit:[--tf-row:34px]",
  regular: "[--tf-row:46px] @min-[24rem]/time-fit:[--tf-row:40px]",
  roomy: "[--tf-row:52px] @min-[24rem]/time-fit:[--tf-row:48px]",
};

const TITLE_SIZE: Record<TimeFitDensity, string> = {
  compact: "text-[12.5px]",
  regular: "text-[13px]",
  roomy: "text-[13.5px]",
};

const LINE_VARS: Record<TimeFitLineStyle, string> = {
  rule: "[--tf-line:32px]",
  dashed: "[--tf-line:32px]",
  band: "[--tf-line:36px]",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * One digit on a wheel. The wheel turns on snap — one crisp overshoot says
 * the time has been re-committed — and its window is sized by an invisible
 * copy of the digit, so the clock never shifts sideways.
 */
function RollDigit({
  char,
  motionSafe,
}: {
  char: string;
  motionSafe: boolean;
}) {
  const n = DIGITS.indexOf(char);
  if (n < 0)
    return (
      <span
        aria-hidden
        className="inline-block align-top"
        style={{ height: "1em", lineHeight: 1 }}
      >
        {char}
      </span>
    );
  return (
    <span
      aria-hidden
      className="relative inline-block overflow-hidden align-top"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <span className="invisible">{char}</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-n}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            className="block"
            style={{ height: "1em", lineHeight: 1 }}
          >
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function RollClock({
  minutes,
  motionSafe,
}: {
  minutes: number;
  motionSafe: boolean;
}) {
  const text = formatClock(minutes);
  return (
    <span className="inline-flex tabular-nums">
      <span className="sr-only">{text}</span>
      {text.split("").map((char, i) => (
        <RollDigit key={i} char={char} motionSafe={motionSafe} />
      ))}
    </span>
  );
}

function ValueMeter({ value, dim }: { value: number; dim: boolean }) {
  const filled = Math.round(clamp(value, 0, 10) / 2);
  return (
    <span aria-hidden className="inline-flex items-center gap-[2px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-1 rounded-full transition-colors duration-300",
            i < filled
              ? dim
                ? "bg-ink-3/55"
                : "bg-(--tf-accent)"
              : "bg-hairline-strong",
          )}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  step: TimeFitStep;
  rank: number;
  slot: number;
  below: boolean;
  pinned: boolean;
  over: boolean;
  tabbable: boolean;
  density: TimeFitDensity;
  motionSafe: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  onToggle: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
};

function Row({
  step,
  rank,
  slot,
  below,
  pinned,
  over,
  tabbable,
  density,
  motionSafe,
  disabled,
  register,
  onToggle,
  onKey,
  onFocus,
}: RowProps) {
  const side = below ? 1 : 0;
  const id = step.id;
  const nodeRef = React.useCallback(
    (node: HTMLDivElement | null) => register(id, node),
    [register, id],
  );
  const slotValue = useMotionValue(slot);
  const sideValue = useMotionValue(side);

  // Both halves of the position glide on the same spring: the slot (how many
  // rows above) and the side (whether the line's own height sits above it).
  // A step that crosses the line therefore travels in one continuous move.
  React.useEffect(() => {
    if (!motionSafe) {
      slotValue.jump(slot);
      sideValue.jump(side);
      return;
    }
    const a = animate(slotValue, slot, springs.glide);
    const b = animate(sideValue, side, springs.glide);
    return () => {
      a.stop();
      b.stop();
    };
  }, [slot, side, motionSafe, slotValue, sideValue]);

  const y = useTransform(
    [slotValue, sideValue] as MotionValue<number>[],
    ([s, d]) =>
      `calc(${r3(s as number)} * var(--tf-row) + ${r3(d as number)} * var(--tf-line))`,
  );

  // A row that changes side flashes once, so the eye can find what moved.
  const [seenSide, setSeenSide] = React.useState(side);
  const [flashes, setFlashes] = React.useState(0);
  if (seenSide !== side) {
    setSeenSide(side);
    setFlashes((n) => n + 1);
  }

  const name = `${step.title}, ${spokenMinutes(step.minutes)}, value ${step.value} of 10${
    step.owner ? `, ${step.owner}` : ""
  }, ${pinned ? (over ? "pinned, over budget" : "pinned") : below ? "below the line" : "fits"}`;

  return (
    <motion.div
      ref={nodeRef}
      role="option"
      aria-selected={pinned}
      aria-label={name}
      aria-disabled={disabled || undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      onKeyDown={onKey}
      onFocus={onFocus}
      data-tf-row={step.id}
      className={cn(
        "group/time-fit-row absolute inset-x-0 top-0 cursor-pointer rounded-2 select-none",
        disabled && "cursor-default",
        FOCUS_IN,
      )}
      style={{ y, height: "var(--tf-row)" }}
    >
      <motion.span
        key={flashes}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2 bg-(--tf-wash)"
        initial={{ opacity: flashes > 0 && motionSafe ? 1 : 0 }}
        animate={{ opacity: 0 }}
        transition={{ duration: durations.page, ease: easings.enter }}
      />
      <span
        className={cn(
          "relative flex h-full items-center gap-2.5 rounded-2 px-2.5 transition-[background-color,color,opacity] duration-300",
          !disabled && "group-hover/time-fit-row:bg-surface-2",
          below ? "text-ink-3" : "text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors duration-300",
            pinned
              ? over
                ? "bg-danger"
                : "bg-(--tf-accent)"
              : "bg-transparent",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "flex w-5 shrink-0 items-center justify-center font-mono text-[11px] tabular-nums",
            pinned ? "text-(--tf-accent)" : "text-ink-3",
          )}
        >
          {pinned ? <Pin className="size-3.5 fill-current" /> : rank}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span
            title={step.title}
            className={cn(
              "truncate leading-tight transition-colors duration-300",
              TITLE_SIZE[density] ?? TITLE_SIZE.regular,
            )}
          >
            {step.title}
          </span>
          <span
            aria-hidden
            className="flex items-center gap-2 font-mono text-[11px] leading-none text-ink-3 tabular-nums @min-[24rem]/time-fit:hidden"
          >
            {formatMinutes(step.minutes)}
            <ValueMeter value={step.value} dim={below} />
          </span>
        </span>
        <span
          aria-hidden
          className="hidden shrink-0 @min-[24rem]/time-fit:inline-flex"
        >
          <ValueMeter value={step.value} dim={below} />
        </span>
        <span
          aria-hidden
          className={cn(
            "hidden w-12 shrink-0 text-right font-mono text-[12px] tabular-nums @min-[24rem]/time-fit:block",
            below ? "text-ink-3" : "text-ink-2",
          )}
        >
          {formatMinutes(step.minutes)}
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-1 transition-[opacity,color]",
            pinned
              ? "text-(--tf-accent) opacity-100"
              : "text-ink-3 opacity-0 group-hover/time-fit-row:opacity-100 group-focus-visible/time-fit-row:opacity-100",
          )}
        >
          <motion.span
            className="flex"
            initial={false}
            animate={{ scale: pinned ? 1 : 0.86, rotate: pinned ? 0 : -24 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <Pin className={cn("size-3.5", pinned && "fill-current")} />
          </motion.span>
        </span>
      </span>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * An agent's plan packed against the time you have. Steps are ranked by
 * value (ties to the shorter estimate) and packed greedily into the budget:
 * pinned steps first, then each ranked step that still fits. What fits sits
 * above the budget line; what does not sits below it, greyed.
 *
 * The line is the instrument. Dragged, it stays 1:1 under the finger while
 * the budget moves at the plan's average minutes per row, snapped to
 * `budgetStep`; every change re-packs, and the steps that no longer fit slide
 * below the line on `springs.glide` while the ones that now fit rise above it
 * on the same spring — a bigger budget can let a big step in and push two
 * small ones out in the same beat. The finish time rolls on `springs.snap`,
 * and on release the line settles into its slot between the groups on snap
 * with the release velocity. When the pinned steps alone need more than the
 * budget, the line turns danger and Approve explains why it holds.
 *
 * The rows are a multi-select listbox where selected means pinned (Up, Down,
 * Home, End; P or Space pins), the line is a vertical slider (Down and Right
 * add time, Up and Left take it away, Page keys an hour, Home and End the
 * ends), and every re-pack is announced once. Under reduced motion the rows
 * and the line jump and the change of side is a short colour fade.
 */
export function TimeFit({
  steps = defaultTimeFitSteps,
  budget: budgetProp,
  defaultBudget = 150,
  onBudgetChange,
  pinned: pinnedProp,
  defaultPinned,
  onPinStep,
  onApprove,
  minBudget = 30,
  maxBudget = 360,
  budgetStep = 5,
  now = 785,
  lineStyle = "rule",
  density = "regular",
  accent = "var(--accent-bright)",
  title = "Launch checklist",
  product = "Fernworks",
  label,
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: TimeFitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const overId = `${uid}-over`;

  const lo = Math.max(0, Math.min(minBudget, maxBudget));
  const hi = Math.max(lo, maxBudget);
  const grain = Math.max(1, budgetStep);
  const snapBudget = React.useCallback(
    (raw: number) => clamp(Math.round((raw - lo) / grain) * grain + lo, lo, hi),
    [lo, hi, grain],
  );

  /* ------------------------------- values ------------------------------- */

  const [ownBudget, setOwnBudget] = React.useState(defaultBudget);
  const budget = clamp(budgetProp ?? ownBudget, lo, hi);
  const [ownPinned, setOwnPinned] = React.useState<string[]>(
    () => defaultPinned ?? [],
  );
  const pinnedList = pinnedProp ?? ownPinned;
  const pinnedSet = React.useMemo(() => new Set(pinnedList), [pinnedList]);

  const ranked = React.useMemo(() => rankSteps(steps), [steps]);
  const rankOf = React.useMemo(
    () => new Map(ranked.map((s, i) => [s.id, i + 1])),
    [ranked],
  );
  const packing = pack(ranked, pinnedSet, budget);
  const fitList = ranked.filter((s) => packing.fit.has(s.id));
  const belowList = ranked.filter((s) => !packing.fit.has(s.id));
  const order = [...fitList, ...belowList];
  const slotOf = new Map(order.map((s, i) => [s.id, i]));
  const finish = now + packing.used;
  const spare = budget - packing.used;
  const total = steps.reduce((sum, s) => sum + s.minutes, 0);

  const [announcement, setAnnouncement] = React.useState("");

  /** "Load test fits. Draft the status notice moved below the line. Finish 16:30." */
  const describeRepack = (from: Packing, to: Packing, budgetAt: number) => {
    const rose = ranked.filter((s) => to.fit.has(s.id) && !from.fit.has(s.id));
    const fell = ranked.filter((s) => from.fit.has(s.id) && !to.fit.has(s.id));
    const parts: string[] = [];
    if (rose.length)
      parts.push(
        `${listOf(rose.map((s) => s.title))} ${rose.length === 1 ? "fits" : "fit"}.`,
      );
    if (fell.length)
      parts.push(`${listOf(fell.map((s) => s.title))} moved below the line.`);
    if (!parts.length) return "";
    parts.push(
      to.over
        ? `Pinned steps are over budget by ${spokenMinutes(to.used - budgetAt)}.`
        : `Finish ${formatClock(now + to.used)}.`,
    );
    return parts.join(" ");
  };

  /* ------------------------------- budget ------------------------------- */

  /** Commits a budget; the sentence is written from the NEW value. */
  const commitBudget = (next: number, from: number, announce: boolean) => {
    if (next === from) return;
    if (budgetProp === undefined) setOwnBudget(next);
    onBudgetChange?.(next);
    if (!announce) return;
    const said = describeRepack(
      pack(ranked, pinnedSet, from),
      pack(ranked, pinnedSet, next),
      next,
    );
    if (said) setAnnouncement(said);
  };

  const togglePin = (id: string) => {
    if (disabled) return;
    const next = !pinnedSet.has(id);
    const list = next
      ? [...pinnedList, id]
      : pinnedList.filter((p) => p !== id);
    if (pinnedProp === undefined) setOwnPinned(list);
    onPinStep?.(id, next);
    const step = steps.find((s) => s.id === id);
    const moved = describeRepack(
      packing,
      pack(ranked, new Set(list), budget),
      budget,
    );
    setAnnouncement(
      `${step?.title ?? "Step"} ${next ? "pinned" : "unpinned"}.${moved ? ` ${moved}` : ""}`,
    );
  };

  /* ------------------------------ the line ------------------------------ */

  const lineSlot = useMotionValue(fitList.length);
  const lineOffset = useMotionValue(0);
  const dragging = React.useRef(false);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const grip = React.useRef({
    budget: 0,
    last: 0,
    lineY: 0,
    rowH: 40,
    rate: 1,
  });
  const [held, setHeld] = React.useState(false);

  React.useEffect(() => {
    if (dragging.current || !motionSafe) {
      lineSlot.jump(fitList.length);
      return;
    }
    const a = animate(lineSlot, fitList.length, springs.glide);
    return () => a.stop();
  }, [fitList.length, motionSafe, lineSlot]);

  React.useEffect(
    () => () => {
      settle.current?.stop();
    },
    [],
  );

  const lineY = useTransform(
    [lineSlot, lineOffset] as MotionValue<number>[],
    ([s, o]) =>
      `calc(${r3(s as number)} * var(--tf-row) + ${r3(o as number)}px)`,
  );

  const readRowHeight = () => {
    const node = listRef.current;
    if (!node) return 40;
    const v = parseFloat(getComputedStyle(node).getPropertyValue("--tf-row"));
    return Number.isFinite(v) && v > 0 ? v : 40;
  };

  const settleLine = (velocity: number) => {
    settle.current?.stop();
    if (!motionSafe) {
      lineOffset.jump(0);
      return;
    }
    settle.current = animate(lineOffset, 0, { ...springs.snap, velocity });
  };

  const drag = useDrag({
    axis: "y",
    threshold: 2,
    disabled: disabled || status !== "ready" || steps.length === 0,
    onStart: () => {
      settle.current?.stop();
      dragging.current = true;
      setHeld(true);
      const rowH = readRowHeight();
      const avg = steps.length ? total / steps.length : 30;
      grip.current = {
        budget,
        last: budget,
        lineY: lineSlot.get() * rowH + lineOffset.get(),
        rowH,
        // One row of travel is worth about one average step, so the line
        // stays near the slot it is opening while the finger leads it.
        rate: clamp(avg / rowH, 0.25, 4),
      };
    },
    onMove: ({ offset }) => {
      const g = grip.current;
      const raw = g.budget + offset.y * g.rate;
      const next = snapBudget(raw);
      // Reported from the gesture that caused it, once per grain crossed.
      commitBudget(next, g.last, false);
      g.last = next;
      const fitCount = pack(ranked, pinnedSet, next).fit.size;
      lineSlot.jump(fitCount);
      const slotY = fitCount * g.rowH;
      const desired = g.lineY + offset.y - slotY;
      const pinnedAtEnd = raw < lo || raw > hi;
      // Past either end of the budget the line resists rather than leaving
      // the value behind; inside, it is exactly under the finger.
      let y = slotY + (pinnedAtEnd ? rubberband(desired, g.rowH) : desired);
      // The line also stays within the list: past its top or bottom it
      // resists, half a row at most, instead of sliding over the header.
      const maxY = ranked.length * g.rowH;
      if (y < 0) y = rubberband(y, g.rowH / 2);
      else if (y > maxY) y = maxY + rubberband(y - maxY, g.rowH / 2);
      lineOffset.set(r3(y - slotY));
    },
    onEnd: ({ velocity }) => {
      const g = grip.current;
      dragging.current = false;
      setHeld(false);
      const after = pack(ranked, pinnedSet, g.last);
      lineSlot.jump(after.fit.size);
      settleLine(velocity.y);
      const said = describeRepack(
        pack(ranked, pinnedSet, g.budget),
        after,
        g.last,
      );
      setAnnouncement(
        said ||
          `Budget ${spokenMinutes(g.last)}. ${after.fit.size} of ${steps.length} steps fit.`,
      );
    },
    onCancel: () => {
      dragging.current = false;
      setHeld(false);
      lineSlot.jump(pack(ranked, pinnedSet, grip.current.last).fit.size);
      settleLine(0);
    },
  });

  const onLineKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    // The line moves the way the arrow points: down gives it more time.
    const map: Record<string, number> = {
      ArrowDown: budget + grain,
      ArrowRight: budget + grain,
      ArrowUp: budget - grain,
      ArrowLeft: budget - grain,
      PageDown: budget + 60,
      PageUp: budget - 60,
      Home: lo,
      End: hi,
    };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commitBudget(snapBudget(next), budget, true);
  };

  /* ------------------------------- rows -------------------------------- */

  const rowRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const registerRow = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      rowRefs.current.set(id, node);
    },
    [],
  );
  const [active, setActive] = React.useState<string | null>(null);
  const activeId =
    active && slotOf.has(active) ? active : (order[0]?.id ?? null);

  const focusRow = (index: number) => {
    const target = order[clamp(index, 0, order.length - 1)];
    if (!target) return;
    setActive(target.id);
    rowRefs.current.get(target.id)?.focus();
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    step: TimeFitStep,
  ) => {
    const at = slotOf.get(step.id) ?? 0;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRow(at - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(order.length - 1);
        break;
      case " ":
      case "p":
      case "P":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        togglePin(step.id);
        break;
      default:
        break;
    }
  };

  /* ------------------------------ approve ------------------------------ */

  const signature = `${budget}|${[...packing.fit].join(",")}`;
  const [approved, setApproved] = React.useState<string | null>(null);
  const isApproved = approved === signature;

  const approve = () => {
    if (disabled || status !== "ready" || steps.length === 0) return;
    if (packing.over) {
      setAnnouncement(
        `Pinned steps need ${spokenMinutes(packing.used)}, ${spokenMinutes(packing.used - budget)} over the budget. Give the line more time or unpin a step.`,
      );
      return;
    }
    onApprove?.({
      stepIds: fitList.map((s) => s.id),
      budget,
      minutes: packing.used,
      finish,
      over: false,
    });
    setApproved(signature);
    setAnnouncement(
      `Approved ${fitList.length} ${fitList.length === 1 ? "step" : "steps"}, finishing ${formatClock(finish)}.`,
    );
  };

  /* ------------------------------- styles ------------------------------- */

  const vars = {
    "--tf-accent": accent,
    "--tf-wash": `color-mix(in oklab, ${accent} 14%, transparent)`,
    "--tf-solid": `oklch(from ${accent} 0.55 c h)`,
    "--tf-on": "oklch(0.99 0.004 262)",
    "--tf-ink": packing.over ? "var(--danger)" : accent,
  } as React.CSSProperties;

  const name = label ?? `${product} ${title}`;
  const ready = status === "ready" && steps.length > 0;
  const spareText = packing.over
    ? `Over by ${formatMinutes(packing.used - budget)}`
    : belowList.length === 0
      ? `All fit · ${formatMinutes(spare)} spare`
      : `${formatMinutes(spare)} spare`;
  const valueText = packing.over
    ? `${spokenMinutes(budget)}, pinned steps over budget by ${spokenMinutes(packing.used - budget)}`
    : `${spokenMinutes(budget)}, ${fitList.length} of ${steps.length} steps fit, finish ${formatClock(finish)}`;

  /* ------------------------------- body -------------------------------- */

  const header = (
    <header className="flex flex-col gap-1.5 border-b border-hairline px-4 pt-3.5 pb-3">
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
        {`${product} · ${steps.length} ${steps.length === 1 ? "step" : "steps"} by value`}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p id={titleId} className="text-[15px] leading-tight font-semibold">
          {title}
        </p>
        {ready ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] leading-none text-foreground">
            <span className="text-ink-3">Finish</span>
            <RollClock minutes={finish} motionSafe={motionSafe} />
          </span>
        ) : null}
      </div>
      {ready ? (
        <p
          className={cn(
            "text-[12px] tabular-nums transition-colors",
            packing.over ? "text-danger" : "text-ink-2",
          )}
        >
          {packing.over
            ? `Pinned need ${formatMinutes(packing.used)} of ${formatMinutes(budget)}`
            : `Fits ${fitList.length} of ${steps.length} · ${formatMinutes(packing.used)} of ${formatMinutes(budget)}`}
        </p>
      ) : null}
    </header>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy className="flex flex-col gap-2 px-4 py-4">
        <span className="sr-only">Loading the plan</span>
        {[0.72, 0.56, 0.8, 0.5, 0.64].map((w, i) => (
          <span key={i} aria-hidden className="flex h-8 items-center gap-3">
            <span className="size-4 rounded-1 bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${Math.round(w * 100)}%` }}
            />
          </span>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The plan did not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (steps.length === 0) {
    body = (
      <p className="px-6 py-10 text-center text-sm text-ink-2">
        No steps in this plan yet.
      </p>
    );
  } else {
    body = (
      <div className="px-2 py-2">
        <p id={hintId} className="sr-only">
          Up and Down move between steps; P or Space pins a step above the line.
          On the budget line, Down and Right add time, Up and Left take it away,
          Page keys move an hour.
        </p>
        <div
          ref={listRef}
          className={cn(
            "relative",
            ROW_VARS[density] ?? ROW_VARS.regular,
            LINE_VARS[lineStyle] ?? LINE_VARS.rule,
          )}
          style={{
            height: `calc(${order.length} * var(--tf-row) + var(--tf-line))`,
          }}
        >
          <div
            role="listbox"
            aria-multiselectable
            aria-labelledby={titleId}
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            className="absolute inset-0"
          >
            {ranked.map((step) => {
              const slot = slotOf.get(step.id) ?? 0;
              const below = !packing.fit.has(step.id);
              return (
                <Row
                  key={step.id}
                  step={step}
                  rank={rankOf.get(step.id) ?? 0}
                  slot={slot}
                  below={below}
                  pinned={pinnedSet.has(step.id)}
                  over={packing.over}
                  tabbable={step.id === activeId}
                  density={density}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  register={registerRow}
                  onToggle={() => {
                    setActive(step.id);
                    togglePin(step.id);
                  }}
                  onKey={(event) => onRowKey(event, step)}
                  onFocus={() => setActive(step.id)}
                />
              );
            })}
          </div>

          <motion.div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-orientation="vertical"
            aria-label="Time budget"
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={budget}
            aria-valuetext={valueText}
            aria-describedby={packing.over ? overId : hintId}
            aria-disabled={disabled || undefined}
            onKeyDown={onLineKey}
            {...drag}
            className={cn(
              "absolute inset-x-0 top-0 z-[2] flex touch-pan-x items-center rounded-2 select-none",
              disabled
                ? "cursor-default"
                : held
                  ? "cursor-grabbing"
                  : "cursor-grab",
              lineStyle === "dashed" && "justify-center",
              FOCUS_IN,
            )}
            style={{ y: lineY, height: "var(--tf-line)" }}
          >
            <LineArt
              lineStyle={lineStyle}
              budget={budget}
              spareText={spareText}
              over={packing.over}
              held={held}
              motionSafe={motionSafe}
            />
          </motion.div>
        </div>
        {packing.over ? (
          <p id={overId} className="sr-only">
            {`The pinned steps alone need ${spokenMinutes(packing.used)}.`}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={label ? undefined : titleId}
      aria-label={label ? name : undefined}
      className={cn(
        "@container/time-fit w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={vars}
    >
      {header}
      {body}
      {ready ? (
        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
          <span className="hidden text-[12px] text-ink-3 @min-[24rem]/time-fit:inline">
            {belowList.length === 0
              ? "Everything fits."
              : `${belowList.length} ${belowList.length === 1 ? "step waits" : "steps wait"} below the line.`}
          </span>
          <button
            type="button"
            onClick={approve}
            aria-disabled={disabled || packing.over || undefined}
            aria-describedby={packing.over ? overId : undefined}
            className={cn(
              "inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium transition-[background-color,color,opacity] @min-[24rem]/time-fit:w-auto",
              packing.over
                ? "bg-surface-2 text-ink-3"
                : "bg-(--tf-solid) text-(--tf-on) hover:bg-[color-mix(in_oklab,var(--tf-solid)_88%,black)]",
              disabled && "opacity-60",
              FOCUS,
            )}
          >
            {isApproved ? (
              <motion.span
                className="flex"
                initial={
                  motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              >
                <Check aria-hidden className="size-3.5" />
              </motion.span>
            ) : null}
            {packing.over
              ? "Over budget"
              : isApproved
                ? "Approved"
                : `Approve ${fitList.length} ${fitList.length === 1 ? "step" : "steps"}`}
          </button>
        </footer>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Line art                                 */
/* ----------------------------------------------------------------------- */

function LineArt({
  lineStyle,
  budget,
  spareText,
  over,
  held,
  motionSafe,
}: {
  lineStyle: TimeFitLineStyle;
  budget: number;
  spareText: string;
  over: boolean;
  held: boolean;
  motionSafe: boolean;
}) {
  const pill = (
    <motion.span
      aria-hidden
      className={cn(
        "relative inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-card px-2 font-mono text-[11px] font-medium text-(--tf-ink) tabular-nums shadow-raised transition-colors duration-300",
        "border-[color-mix(in_oklab,var(--tf-ink)_55%,transparent)]",
      )}
      initial={false}
      animate={{ scale: held && motionSafe ? 1.06 : 1 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
    >
      <GripHorizontal className="size-3.5 shrink-0" />
      {formatMinutes(budget)}
    </motion.span>
  );

  const spare = (
    <span
      aria-hidden
      className={cn(
        "relative shrink-0 rounded-full bg-card px-1.5 font-mono text-[10.5px] tabular-nums transition-colors duration-300",
        over ? "text-danger" : "text-ink-3",
      )}
    >
      {spareText}
    </span>
  );

  if (lineStyle === "band") {
    return (
      <span
        aria-hidden
        className="relative flex h-full w-full items-center justify-between gap-2 rounded-2 border border-[color-mix(in_oklab,var(--tf-ink)_40%,transparent)] bg-[color-mix(in_oklab,var(--tf-ink)_12%,transparent)] px-2.5 transition-colors duration-300"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-(--tf-ink) tabular-nums">
          <GripHorizontal className="size-3.5 shrink-0" />
          <span className="truncate">{`Budget ${formatMinutes(budget)}`}</span>
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10.5px] tabular-nums",
            over ? "text-danger" : "text-ink-2",
          )}
        >
          {spareText}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden className="relative flex h-full w-full items-center px-1">
      <span
        className={cn(
          "absolute inset-x-1 top-1/2 -translate-y-1/2 transition-colors duration-300",
          lineStyle === "dashed"
            ? "h-0 border-t-2 border-dashed border-(--tf-ink)"
            : "h-0.5 rounded-full bg-(--tf-ink)",
        )}
      />
      {lineStyle === "dashed" ? (
        <span className="relative flex w-full items-center justify-between gap-2">
          <span className="w-0" />
          {pill}
          {spare}
        </span>
      ) : (
        <span className="relative flex w-full items-center justify-between gap-2">
          {pill}
          {spare}
        </span>
      )}
    </span>
  );
}
