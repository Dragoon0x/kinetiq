"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  cubicBezier,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  Boxes,
  Camera,
  Check,
  ChevronDown,
  FileText,
  GripVertical,
  MessageSquare,
  RotateCcw,
  Sprout,
  TriangleAlert,
  Users,
  Wallet,
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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GoalWeaveGoal = {
  id: string;
  /** "Track inventory". */
  title: string;
  /** One short line under the title. */
  detail?: string;
  /** A 16px glyph drawn in currentColor. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Its thread colour. @default the accent's hue turned 48° per goal */
  tint?: string;
};

export type GoalWeaveTask = {
  id: string;
  /** "Count stock in the yard". */
  title: string;
  /** Roughly how long it takes, in minutes. */
  minutes?: number;
  /** The goals that bring it into the plan; a task in several is shared. */
  goals: string[];
  /** Part of the short plan shown while no goal is chosen. */
  starter?: boolean;
};

export type GoalWeaveCardStyle = "tile" | "chip" | "row";
export type GoalWeaveThreadStyle = "thread" | "stitch" | "ribbon";
export type GoalWeaveStatus = "ready" | "loading" | "error";

export type GoalWeaveProps = {
  /** The goals to choose from. @default defaultGoalWeaveGoals */
  goals?: GoalWeaveGoal[];
  /** Every task a goal can bring, and the starter tasks. @default defaultGoalWeaveTasks */
  tasks?: GoalWeaveTask[];
  /** Controlled: the chosen goal ids. */
  value?: string[];
  /** Initial goals when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the card, key or click that changed the goals, with every chosen id. */
  onGoalsChange?: (ids: string[]) => void;
  /** Fires with the plan's task ids, in order, whenever goals or a reorder change it. */
  onPlanChange?: (taskIds: string[]) => void;
  /** "Use this plan" was pressed. */
  onAccept?: (taskIds: string[], goalIds: string[]) => void;
  /** The goal cards: two-column tiles, wrapping chips, or a list of rows. @default "tile" */
  cardStyle?: GoalWeaveCardStyle;
  /** The threads from goal to task: a fine curve, a dashed stitch, or a soft ribbon. @default "thread" */
  threadStyle?: GoalWeaveThreadStyle;
  /** The chosen cards, the first goal's tint and the primary button. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The question over the goal cards. @default "What should Fernworks help with?" */
  question?: string;
  /** The plan's heading. @default "Your first week" */
  planTitle?: string;
  /** The primary button. @default "Use this plan" */
  acceptLabel?: string;
  /** The most goals that can be chosen at once. @default no limit */
  maxGoals?: number;
  /** Whether the goals have arrived. @default "ready" */
  status?: GoalWeaveStatus;
  /** "Try again" was pressed after the goals failed to load. */
  onRetry?: () => void;
  /** The tallest the step grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be chosen, moved or accepted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** A grounds-maintenance firm setting up Fernworks. */
export const defaultGoalWeaveGoals: GoalWeaveGoal[] = [
  {
    id: "inventory",
    title: "Track inventory",
    detail: "Stock, vans and the yard",
    icon: Boxes,
  },
  {
    id: "crews",
    title: "Plan crews",
    detail: "Who goes where, each day",
    icon: Users,
  },
  {
    id: "quotes",
    title: "Quote faster",
    detail: "From site visit to signed",
    icon: FileText,
  },
  {
    id: "paid",
    title: "Get paid on time",
    detail: "Invoices that follow up",
    icon: Wallet,
  },
  {
    id: "updates",
    title: "Keep customers posted",
    detail: "Arrivals, delays, done",
    icon: MessageSquare,
  },
  {
    id: "photos",
    title: "Log site photos",
    detail: "Before and after, by job",
    icon: Camera,
  },
];

export const defaultGoalWeaveTasks: GoalWeaveTask[] = [
  {
    id: "import",
    title: "Import your customer list",
    minutes: 10,
    goals: ["quotes", "paid", "updates"],
  },
  {
    id: "stock",
    title: "Count stock in the yard",
    minutes: 20,
    goals: ["inventory"],
  },
  {
    id: "vans",
    title: "Add your vans and trailers",
    minutes: 5,
    goals: ["inventory", "crews"],
  },
  {
    id: "reorder",
    title: "Set reorder levels",
    minutes: 5,
    goals: ["inventory"],
  },
  {
    id: "invite",
    title: "Invite your crew",
    minutes: 2,
    goals: ["crews", "photos"],
  },
  {
    id: "rota",
    title: "Draw up next week's rota",
    minutes: 15,
    goals: ["crews"],
  },
  {
    id: "skills",
    title: "Tag who can drive and climb",
    minutes: 5,
    goals: ["crews"],
  },
  {
    id: "prices",
    title: "Load your price list",
    minutes: 10,
    goals: ["quotes"],
  },
  {
    id: "template",
    title: "Pick a quote template",
    minutes: 3,
    goals: ["quotes"],
  },
  { id: "terms", title: "Set payment terms", minutes: 2, goals: ["paid"] },
  {
    id: "reminders",
    title: "Turn on invoice reminders",
    minutes: 1,
    goals: ["paid"],
  },
  {
    id: "texts",
    title: "Write your on-the-way text",
    minutes: 3,
    goals: ["updates"],
  },
  {
    id: "album",
    title: "Make a photo checklist",
    minutes: 5,
    goals: ["photos"],
  },
  {
    id: "first-job",
    title: "Add your first job",
    minutes: 3,
    goals: [],
    starter: true,
  },
  {
    id: "calendar",
    title: "Connect your calendar",
    minutes: 2,
    goals: [],
    starter: true,
  },
  {
    id: "teammate",
    title: "Invite one teammate",
    minutes: 1,
    goals: [],
    starter: true,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const EMPTY: string[] = [];
const ROW_H = 46;
const ROW_GAP = 6;
const STEP = ROW_H + ROW_GAP;
const DRAW_S = 0.42;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const enter = cubicBezier(...easings.enter);
const leave = cubicBezier(...easings.exit);

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** Every goal owns a hue: its own tint, else the accent's turned 48° a goal. */
const tintOf = (goal: GoalWeaveGoal, index: number, accent: string) =>
  goal.tint ??
  (index === 0
    ? `oklch(from ${accent} 0.64 0.15 h)`
    : `oklch(from ${accent} 0.64 0.15 calc(h + ${index * 48}))`);

/** The plan for a set of goals: what stays keeps its place, what is new joins the end. */
function planFor(
  chosen: string[],
  tasks: GoalWeaveTask[],
  goals: GoalWeaveGoal[],
  previous: string[],
): string[] {
  if (chosen.length === 0) {
    return tasks.filter((t) => t.starter).map((t) => t.id);
  }
  const wanted = new Set(
    tasks
      .filter((t) => t.goals.some((g) => chosen.includes(g)))
      .map((t) => t.id),
  );
  const kept = previous.filter((id) => wanted.has(id));
  const keptSet = new Set(kept);
  const added: string[] = [];
  for (const g of goals) {
    if (!chosen.includes(g.id)) continue;
    for (const t of tasks) {
      if (
        t.goals.includes(g.id) &&
        !keptSet.has(t.id) &&
        !added.includes(t.id)
      ) {
        added.push(t.id);
      }
    }
  }
  return [...kept, ...added];
}

/** The first part of a cubic, split at t (de Casteljau), every coordinate rounded. */
function partial(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): string {
  const lerp = (
    a: [number, number],
    b: [number, number],
    k: number,
  ): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const q1 = lerp(p0, p1, t);
  const m = lerp(p1, p2, t);
  const q2 = lerp(q1, m, t);
  const r = lerp(m, lerp(p2, p3, t), t);
  const q3 = lerp(q2, r, t);
  const f = (p: [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  return `M ${f(p0)} C ${f(q1)} ${f(q2)} ${f(q3)}`;
}

/** In view and the tab showing: the only time the threads may be drawn. */
function useLive(node: Element | null): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let shown = !document.hidden;
    const update = () => setLive(seen && shown);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen = entry.isIntersecting;
      update();
    });
    io.observe(node);
    const onVisibility = () => {
      shown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return live;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block"
          style={{ lineHeight: "16px" }}
          initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -8 : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

type RowProps = {
  task: GoalWeaveTask;
  index: number;
  count: number;
  delay: number;
  fresh: boolean;
  starter: boolean;
  dragging: boolean;
  active: boolean;
  tints: { id: string; title: string; tint: string }[];
  motionSafe: boolean;
  disabled: boolean;
  bind: (id: string, node: HTMLElement | null) => void;
  bindGrip: (id: string, node: HTMLButtonElement | null) => void;
  onGripKey: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => void;
  onFocusRow: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, y: number) => void;
  onDragEnd: (id: string) => void;
};

/**
 * One task in the plan. Its slot is a motion value — index × row step — so a
 * reorder glides it there without React rendering per frame; while it is
 * dragged the finger owns that value 1:1, and on release the spring takes
 * the throw's velocity.
 */
function PlanRow({
  task,
  index,
  count,
  delay,
  fresh,
  starter,
  dragging,
  active,
  tints,
  motionSafe,
  disabled,
  bind,
  bindGrip,
  onGripKey,
  onFocusRow,
  onDragStart,
  onDragMove,
  onDragEnd,
}: RowProps) {
  const y: MotionValue<number> = useMotionValue(index * STEP);
  // One stable ref for the row's whole life: motion binds it once.
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => bind(task.id, node),
    [bind, task.id],
  );
  const from = React.useRef(0);
  const release = React.useRef(0);

  React.useEffect(() => {
    if (dragging) return;
    const target = index * STEP;
    if (!motionSafe || Math.abs(y.get() - target) < 0.5) {
      y.set(target);
      return;
    }
    const v = release.current;
    release.current = 0;
    const c = animate(y.get(), target, {
      ...springs.glide,
      velocity: v,
      onUpdate: (n) => y.set(r1(n)),
    });
    return () => c.stop();
  }, [index, dragging, motionSafe, y]);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || starter,
    onStart: () => {
      from.current = y.get();
      onDragStart(task.id);
    },
    onMove: ({ offset }) => {
      const next = r1(
        rubberClamp(
          from.current + offset.y,
          0,
          Math.max(0, (count - 1) * STEP),
          STEP,
        ),
      );
      y.set(next);
      onDragMove(task.id, next);
    },
    onEnd: ({ velocity }) => {
      release.current = velocity.y;
      onDragEnd(task.id);
    },
    onCancel: () => onDragEnd(task.id),
  });

  const names = tints.map((t) => t.title);
  const label = `${task.title}, ${index + 1} of ${count}${
    names.length
      ? `, from ${names.join(" and ")}`
      : starter
        ? ", starter task"
        : ""
  }`;

  return (
    <motion.div
      ref={setRef}
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={count}
      className="absolute inset-x-0 top-0"
      style={{ y, height: ROW_H, zIndex: dragging ? 5 : 1 }}
      exit={{
        opacity: 0,
        x: motionSafe ? -distances.shift : 0,
        transition: exitFor(),
      }}
    >
      <motion.div
        className={cn(
          "flex h-full items-center gap-2 rounded-3 border pr-3 pl-1 transition-[box-shadow,border-color] duration-150",
          starter
            ? "border-dashed border-hairline-strong bg-card"
            : "border-hairline bg-card",
          dragging &&
            "border-hairline-strong shadow-[0_10px_24px_color-mix(in_oklab,black_18%,transparent)]",
        )}
        initial={
          fresh ? { opacity: 0, x: motionSafe ? -distances.step : 0 } : false
        }
        animate={{ opacity: 1, x: 0, scale: dragging && motionSafe ? 1.02 : 1 }}
        transition={{
          opacity: { duration: durations.base, ease: easings.enter, delay },
          x: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
          scale: motionSafe ? springs.flick : { duration: 0 },
        }}
      >
        <button
          ref={(node) => bindGrip(task.id, node)}
          type="button"
          aria-label={label}
          aria-keyshortcuts={starter ? undefined : "Alt+ArrowUp Alt+ArrowDown"}
          tabIndex={active ? 0 : -1}
          aria-disabled={disabled || undefined}
          {...drag}
          onKeyDown={(e) => onGripKey(e, task.id)}
          onFocus={() => onFocusRow(task.id)}
          className={cn(
            "flex h-9 w-7 shrink-0 touch-pan-x items-center justify-center rounded-2 text-ink-3 select-none",
            starter
              ? "cursor-default"
              : "cursor-grab hover:bg-surface-2 hover:text-foreground active:cursor-grabbing",
            FOCUS,
          )}
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1">
          <span
            title={task.title}
            className={cn(
              "block truncate text-[13px] leading-5",
              starter ? "text-ink-2" : "text-foreground",
            )}
          >
            {task.title}
          </span>
          {task.minutes ? (
            <span className="block text-[11px] leading-4 text-ink-3 tabular-nums">
              {task.minutes} min
            </span>
          ) : null}
        </span>
        <span aria-hidden className="flex shrink-0 items-center -space-x-0.5">
          {tints.map((t) => (
            <span
              key={t.id}
              className="size-2 rounded-full ring-2 ring-card"
              style={{ backgroundColor: t.tint }}
            />
          ))}
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The step                                */
/* ----------------------------------------------------------------------- */

function GoalCard({
  goal,
  on,
  off,
  tint,
  count,
  cardStyle,
  tabbable,
  disabled,
  motionSafe,
  wide,
  hintId,
  bind,
  onToggle,
  onKey,
  onFocusCard,
}: {
  goal: GoalWeaveGoal;
  on: boolean;
  off: boolean;
  tint: string;
  count: number;
  cardStyle: GoalWeaveCardStyle;
  tabbable: boolean;
  disabled: boolean;
  motionSafe: boolean;
  wide: boolean;
  hintId: string;
  bind: (id: string, node: HTMLElement | null) => void;
  onToggle: (goal: GoalWeaveGoal, at: number) => void;
  onKey: (event: React.KeyboardEvent, goal: GoalWeaveGoal) => void;
  onFocusCard: (id: string) => void;
}) {
  const Icon = goal.icon ?? Sprout;
  // One stable ref for the card's whole life: motion binds it once.
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => bind(goal.id, node),
    [bind, goal.id],
  );
  return (
    <motion.div
      ref={setRef}
      role="checkbox"
      aria-checked={on}
      aria-label={`${goal.title}, ${plural(count, "task", "tasks")}`}
      aria-disabled={disabled || off || undefined}
      aria-describedby={off ? hintId : undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={(e) => onToggle(goal, e.timeStamp)}
      onKeyDown={(e) => onKey(e, goal)}
      onFocus={() => onFocusCard(goal.id)}
      initial={false}
      animate={{ y: on && motionSafe ? -2 : 0 }}
      transition={motionSafe ? springs.snap : { duration: 0 }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 rounded-3 border bg-card text-left transition-[border-color,box-shadow,background-color] duration-200 select-none",
        cardStyle === "tile" && "min-w-0 flex-col items-start gap-1.5 p-2.5",
        cardStyle === "chip" && "h-9 max-w-full rounded-full pr-3.5 pl-2",
        cardStyle === "row" && "h-11 px-2.5",
        on
          ? "shadow-[0_6px_16px_color-mix(in_oklab,black_10%,transparent)]"
          : "border-hairline hover:border-hairline-strong",
        (disabled || off) && "cursor-not-allowed opacity-60",
        FOCUS,
      )}
      style={on ? { borderColor: tint } : undefined}
    >
      <span aria-hidden className="flex w-full min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center border transition-colors duration-200",
            cardStyle === "chip" ? "rounded-full" : "rounded-1",
            on
              ? "border-transparent text-primary-foreground"
              : "border-hairline-strong text-transparent",
          )}
          style={on ? { backgroundColor: tint } : undefined}
        >
          <svg viewBox="0 0 16 16" className="size-3">
            <motion.path
              d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: on ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </span>
        <Icon
          className={cn(
            "size-4 shrink-0",
            on ? "text-foreground" : "text-ink-3",
          )}
        />
        {cardStyle === "tile" ? null : (
          <span className="min-w-0 truncate text-[13px] font-medium">
            {goal.title}
          </span>
        )}
        {cardStyle === "row" ? (
          <span className="ml-auto hidden shrink-0 truncate text-[11px] text-ink-3 @min-[26rem]/goal-weave:inline">
            {plural(count, "task", "tasks")}
          </span>
        ) : null}
      </span>
      {cardStyle === "tile" ? (
        <span className="block w-full min-w-0">
          <span
            aria-hidden
            className="line-clamp-2 block text-[13px] leading-5 font-medium text-foreground @min-[26rem]/goal-weave:truncate"
          >
            {goal.title}
          </span>
          {goal.detail ? (
            <span className="hidden truncate text-[11px] leading-4 text-ink-3 @min-[26rem]/goal-weave:block">
              {goal.detail}
            </span>
          ) : null}
        </span>
      ) : null}
      <motion.span
        aria-hidden
        className="absolute top-1/2 -right-[4px] -mt-[3.5px] size-[7px] rounded-full ring-2 ring-card"
        style={{ backgroundColor: tint }}
        initial={false}
        animate={{ scale: on && wide ? 1 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </motion.div>
  );
}

type Thread = {
  key: string;
  goal: string;
  task: string;
  /** When it started growing or retracting, in ms; NaN until first drawn. */
  born: number;
  delay: number;
  dir: 1 | -1;
};

/**
 * A goal-selection step whose plan assembles itself. Choosing a goal threads
 * its tasks into the plan: a curve is drawn out of the goal's card to each of
 * its tasks — the cubic split at a growing t, every point rounded — while the
 * task arrives from 8px left on glide, staggered by cascade() so a goal's
 * tasks weave in as one movement. Removing a goal retracts its threads into
 * the card and pulls out the tasks only it brought; shared tasks stay, held
 * by the other goals' threads. The threads follow the rows through every
 * glide and drag, from a geometry loop that runs only while something moves.
 *
 * The goal cards are checkboxes that follow the arrow keys; the plan rows
 * rove with Up and Down, and Alt with Up or Down moves a task (or drag its
 * grip). With nothing chosen a short starter plan stands in. Under 40rem the
 * plan lives in a drawer under the goals. Under reduced motion threads and
 * rows fade instead of drawing and travelling; every change still shows.
 */
export function GoalWeave({
  goals = defaultGoalWeaveGoals,
  tasks = defaultGoalWeaveTasks,
  value,
  defaultValue = EMPTY,
  onGoalsChange,
  onPlanChange,
  onAccept,
  cardStyle = "tile",
  threadStyle = "thread",
  accent = "var(--accent-bright)",
  question = "What should Fernworks help with?",
  planTitle = "Your first week",
  acceptLabel = "Use this plan",
  maxGoals,
  status = "ready",
  onRetry,
  maxHeight = 560,
  disabled = false,
  className,
}: GoalWeaveProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    title: `${uid}-title`,
    goals: `${uid}-goals`,
    plan: `${uid}-plan`,
    drawer: `${uid}-drawer`,
    hint: `${uid}-hint`,
  };
  const ready = status === "ready";
  const ink = `oklch(from ${accent} 0.53 0.17 h)`;

  const [own, setOwn] = React.useState<string[]>(() => [...defaultValue]);
  const chosen = value ?? own;
  const chosenKey = chosen.join("|");
  const taskById = React.useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );
  const tints = React.useMemo(
    () => new Map(goals.map((g, i) => [g.id, tintOf(g, i, accent)])),
    [goals, accent],
  );

  const [order, setOrder] = React.useState<string[]>(() =>
    planFor(chosen, tasks, goals, []),
  );
  const [seenKey, setSeenKey] = React.useState(chosenKey);
  const [fresh, setFresh] = React.useState<Record<string, number>>({});
  const [threads, setThreads] = React.useState<Thread[]>(() =>
    goals.flatMap((g) =>
      chosen.includes(g.id)
        ? tasks
            .filter((t) => t.goals.includes(g.id))
            .map((t, i) => ({
              key: `${g.id}:${t.id}`,
              goal: g.id,
              task: t.id,
              born: Number.NaN,
              delay: i * cascade(4),
              dir: 1 as const,
            }))
        : [],
    ),
  );
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [frozen, setFrozen] = React.useState<string[] | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [activeGoal, setActiveGoal] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [badge, setBadge] = React.useState<{ n: number; d: number } | null>(
    null,
  );
  const [accepted, setAccepted] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((x) => ({ n: x.n + 1, text }));

  // A host that changes the goals gets the same weave a press would.
  if (seenKey !== chosenKey) {
    setSeenKey(chosenKey);
    const next = planFor(chosen, tasks, goals, order);
    if (next.join("|") !== order.join("|")) setOrder(next);
  }

  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const live = useLive(content);
  const [wide, setWide] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLElement>());
  const bornAt = React.useRef(new Map<string, number>());
  const rowNodes = React.useRef(new Map<string, HTMLElement>());
  const gripNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const pathNodes = React.useRef(new Map<string, SVGPathElement>());
  const goalsEdge = React.useRef<HTMLDivElement | null>(null);
  const threadsRef = React.useRef(threads);
  const awake = React.useRef({ until: 0, frame: 0 });
  const focusAsk = React.useRef<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    threadsRef.current = threads;
  });

  React.useLayoutEffect(() => {
    if (!content) return;
    const measure = () => setWide(content.clientWidth >= 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [content]);

  React.useEffect(() => {
    const pending = timers.current;
    const loop = awake.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      cancelAnimationFrame(loop.frame);
      loop.frame = 0;
    };
  }, []);

  /* ------------------------------ the weave ----------------------------- */

  /**
   * One frame of threads: read every card and row where it stands now (rows
   * may be mid-glide or under a finger), split each curve at its progress and
   * write the path straight to the DOM. Returns whether anything is still
   * drawing or retracting.
   */
  const drawFrame = React.useCallback(
    (now: number): boolean => {
      const svg = svgRef.current;
      if (!svg || !content) return false;
      const box = content.getBoundingClientRect();
      const sx = box.width > 0 ? content.clientWidth / box.width : 1;
      let moving = false;
      const dead: string[] = [];
      for (const th of threadsRef.current) {
        const path = pathNodes.current.get(th.key);
        if (!path) continue;
        // A thread made before the step was ever drawn starts on its first frame.
        let born = th.born;
        if (Number.isNaN(born)) {
          born = bornAt.current.get(th.key) ?? now;
          bornAt.current.set(th.key, born);
        }
        const card = cardNodes.current.get(th.goal);
        const row = rowNodes.current.get(th.task);
        if (!card || !row) {
          path.setAttribute("d", "");
          if (th.dir === -1) dead.push(th.key);
          continue;
        }
        const a = card.getBoundingClientRect();
        const b = row.getBoundingClientRect();
        // The thread leaves the card's right edge and runs straight behind
        // any card beside it to the goals' edge, then curves to the task.
        const y0 = (a.top + a.height / 2 - box.top) * sx;
        const x0 = (a.right - box.left) * sx;
        const edge = goalsEdge.current
          ? (goalsEdge.current.getBoundingClientRect().right - box.left) * sx
          : x0;
        const p0: [number, number] = [Math.max(x0, edge), y0];
        const p3: [number, number] = [
          (b.left - box.left) * sx,
          (b.top + b.height / 2 - box.top) * sx,
        ];
        const dx = Math.max(16, (p3[0] - p0[0]) * 0.6);
        const p1: [number, number] = [p0[0] + dx, p0[1]];
        const p2: [number, number] = [p3[0] - dx, p3[1]];
        const run = p0[0] - x0;
        const bend = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
        const share = run + bend > 0 ? run / (run + bend) : 0;
        const k = clamp((now - born - th.delay * 1000) / (DRAW_S * 1000), 0, 1);
        let t: number;
        let opacity = 1;
        if (motionSafe) {
          t = th.dir === 1 ? enter(k) : 1 - leave(k);
        } else {
          t = 1;
          opacity = th.dir === 1 ? k : 1 - k;
        }
        if (k < 1) moving = true;
        else if (th.dir === -1) dead.push(th.key);
        // Progress runs along the straight part first, then the curve.
        let d = "";
        if (t > 0.001) {
          if (share > 0 && t <= share) {
            d = `M ${r2(x0)} ${r2(y0)} H ${r2(x0 + run * (t / share))}`;
          } else {
            const ct = share >= 1 ? 1 : (t - share) / (1 - share);
            const curve = partial(p0, p1, p2, p3, Math.min(1, ct));
            d =
              run > 0.5
                ? `M ${r2(x0)} ${r2(y0)} H ${r2(p0[0])} ${curve.replace(/^M [^C]+/, "")}`
                : curve;
          }
        }
        path.setAttribute("d", d);
        path.style.opacity = String(r2(opacity));
      }
      if (dead.length > 0) {
        const gone = new Set(dead);
        threadsRef.current = threadsRef.current.filter((t) => !gone.has(t.key));
        setThreads((list) => list.filter((t) => !gone.has(t.key)));
      }
      return moving;
    },
    [content, motionSafe],
  );

  const wake = React.useCallback(
    (ms = 900) => {
      const loop = awake.current;
      loop.until = Math.max(loop.until, performance.now() + ms);
      if (loop.frame || !wide || !live) return;
      const tick = () => {
        const now = performance.now();
        const moving = drawFrame(now);
        if (moving || now < loop.until) {
          loop.frame = requestAnimationFrame(tick);
        } else {
          loop.frame = 0;
        }
      };
      loop.frame = requestAnimationFrame(tick);
    },
    [drawFrame, wide, live],
  );

  // Draw whenever the set of threads, the plan or the layout changes, and
  // once the step comes into view; stop when it leaves.
  const threadKey = threads.map((t) => `${t.key}${t.dir}`).join("|");
  React.useEffect(() => {
    if (!wide || !live) {
      cancelAnimationFrame(awake.current.frame);
      awake.current.frame = 0;
      return;
    }
    wake(900);
  }, [wide, live, threadKey, order, wake]);

  React.useEffect(() => {
    if (!content || !wide) return;
    const ro = new ResizeObserver(() => wake(120));
    ro.observe(content);
    return () => ro.disconnect();
  }, [content, wide, wake]);

  /* ------------------------------- actions ------------------------------ */

  const writeOrder = (next: string[]) => {
    setOrder(next);
    onPlanChange?.(next);
  };

  const toggle = (goal: GoalWeaveGoal, at: number) => {
    if (disabled || !ready) return;
    const on = !chosen.includes(goal.id);
    if (on && maxGoals !== undefined && chosen.length >= maxGoals) {
      say(`Up to ${plural(maxGoals, "goal", "goals")}. Remove one first.`);
      return;
    }
    const nextGoals = on
      ? [...chosen, goal.id]
      : chosen.filter((g) => g !== goal.id);
    if (value === undefined) setOwn(nextGoals);
    setSeenKey(nextGoals.join("|"));
    onGoalsChange?.(nextGoals);
    const nextOrder = planFor(nextGoals, tasks, goals, order);
    const before = new Set(order);
    const after = new Set(nextOrder);
    const added = nextOrder.filter((id) => !before.has(id));
    const left = order.filter((id) => !after.has(id));
    const mine = tasks.filter(
      (t) => t.goals.includes(goal.id) && after.has(t.id),
    );
    const step = cascade(Math.max(1, mine.length));
    // The event's own time: the same clock the drawing frames run on.
    const now = at;
    if (on) {
      const fr: Record<string, number> = {};
      mine.forEach((t, i) => {
        if (added.includes(t.id)) fr[t.id] = r2(i * step + 0.08);
      });
      setFresh(fr);
      setThreads((list) => [
        ...list.filter((t) => t.goal !== goal.id),
        ...mine.map((t, i) => ({
          key: `${goal.id}:${t.id}`,
          goal: goal.id,
          task: t.id,
          born: now,
          delay: r2(i * step),
          dir: 1 as const,
        })),
      ]);
    } else {
      setFresh({});
      setThreads((list) =>
        list.map((t) =>
          t.goal === goal.id
            ? { ...t, dir: -1 as const, born: now, delay: 0 }
            : t,
        ),
      );
    }
    writeOrder(nextOrder);
    setAccepted(false);
    const delta = nextOrder.length - order.length;
    if (!open && !wide && delta !== 0)
      setBadge((b) => ({ n: (b?.n ?? 0) + 1, d: delta }));
    const shared = tasks.filter(
      (t) => t.goals.includes(goal.id) && after.has(t.id) && !t.starter,
    ).length;
    say(
      on
        ? `${goal.title} added ${plural(added.length, "task", "tasks")}${
            mine.length > added.length
              ? `, ${mine.length - added.length} already there`
              : ""
          }. ${nextOrder.length} in the plan.`
        : nextGoals.length === 0
          ? `${goal.title} removed. Back to the starter plan.`
          : `${goal.title} removed. ${plural(left.length, "task", "tasks")} left the plan${
              shared ? `, ${shared} stayed, shared` : ""
            }.`,
    );
    wake(1200);
  };

  const move = (id: string, to: number, announce: boolean) => {
    const from = order.indexOf(id);
    const target = clamp(to, 0, order.length - 1);
    if (from === -1 || from === target) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(target, 0, id);
    writeOrder(next);
    setAccepted(false);
    if (announce) {
      say(
        `${taskById.get(id)?.title ?? "Task"} moved to ${target + 1} of ${next.length}.`,
      );
    }
    wake(700);
  };

  const onGripKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const at = order.indexOf(id);
    const last = order.length - 1;
    const starter = chosen.length === 0;
    const go = (to: number) => {
      const target = order[clamp(to, 0, last)];
      if (!target) return;
      focusAsk.current = target;
      setActiveRow(target);
    };
    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      event.altKey
    ) {
      event.preventDefault();
      if (disabled || starter) return;
      move(id, at + (event.key === "ArrowUp" ? -1 : 1), true);
      focusAsk.current = id;
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      go(at - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      go(at + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      go(0);
    } else if (event.key === "End") {
      event.preventDefault();
      go(last);
    }
  };

  React.useEffect(() => {
    const want = focusAsk.current;
    if (!want) return;
    const node = gripNodes.current.get(want) ?? cardNodes.current.get(want);
    if (node?.isConnected) {
      focusAsk.current = null;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
    }
  });

  const cols = cardStyle === "tile" ? 2 : 1;
  const onCardKey = (event: React.KeyboardEvent, goal: GoalWeaveGoal) => {
    const at = goals.findIndex((g) => g.id === goal.id);
    const last = goals.length - 1;
    const vertical = cardStyle === "tile" ? cols : 1;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(goal, event.timeStamp);
      return;
    }
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at + vertical,
      ArrowUp: at - vertical,
      Home: 0,
      End: last,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = goals[clamp(to, 0, last)];
    if (!next) return;
    setActiveGoal(next.id);
    focusAsk.current = next.id;
  };

  const accept = () => {
    if (disabled || !ready || order.length === 0) return;
    onAccept?.(order, chosen);
    setAccepted(true);
    say(`Plan saved: ${plural(order.length, "task", "tasks")}.`);
  };

  /* ------------------------------- render ------------------------------- */

  const plan = order
    .map((id) => taskById.get(id))
    .filter((t): t is GoalWeaveTask => t !== undefined);
  // While a row is under a finger its DOM node must not move — moving it
  // drops the pointer capture — so the DOM keeps the order the drag began
  // with, and every row is placed by its slot, not by where it sits.
  const domPlan = frozen
    ? [
        ...frozen.filter((id) => order.includes(id)),
        ...order.filter((id) => !frozen.includes(id)),
      ]
        .map((id) => taskById.get(id))
        .filter((t): t is GoalWeaveTask => t !== undefined)
    : plan;
  const starterPlan = chosen.length === 0;
  const minutes = plan.reduce((t, x) => t + (x.minutes ?? 0), 0);
  const firstRow =
    activeRow && order.includes(activeRow) ? activeRow : order[0];
  const firstGoal =
    activeGoal && goals.some((g) => g.id === activeGoal)
      ? activeGoal
      : goals[0]?.id;
  const full = maxGoals !== undefined && chosen.length >= maxGoals;

  const bindCard = React.useCallback((id: string, node: HTMLElement | null) => {
    if (node) cardNodes.current.set(id, node);
    else cardNodes.current.delete(id);
  }, []);
  const bindRow = React.useCallback((id: string, node: HTMLElement | null) => {
    if (node) rowNodes.current.set(id, node);
    else rowNodes.current.delete(id);
  }, []);
  const bindGrip = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) gripNodes.current.set(id, node);
      else gripNodes.current.delete(id);
    },
    [],
  );

  const cards = (
    <div
      role="group"
      aria-labelledby={ids.goals}
      className={cn(
        cardStyle === "tile"
          ? "grid grid-cols-2 gap-2"
          : cardStyle === "chip"
            ? "flex flex-wrap gap-2"
            : "flex flex-col gap-1.5",
      )}
    >
      {!ready
        ? Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "rounded-3 bg-surface-2 motion-safe:animate-pulse",
                cardStyle === "tile"
                  ? "h-16"
                  : cardStyle === "chip"
                    ? "h-9 w-32"
                    : "h-11",
              )}
            />
          ))
        : goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              on={chosen.includes(g.id)}
              off={!chosen.includes(g.id) && full}
              tint={tints.get(g.id) ?? ink}
              count={tasks.filter((t) => t.goals.includes(g.id)).length}
              cardStyle={cardStyle}
              tabbable={g.id === firstGoal}
              disabled={disabled}
              motionSafe={motionSafe}
              wide={wide}
              hintId={ids.hint}
              bind={bindCard}
              onToggle={toggle}
              onKey={onCardKey}
              onFocusCard={setActiveGoal}
            />
          ))}
    </div>
  );

  const rows = (
    <div
      role="list"
      aria-labelledby={ids.plan}
      aria-describedby={ids.hint}
      className="relative"
    >
      <motion.div
        className="relative"
        initial={false}
        animate={{ height: Math.max(0, plan.length * STEP - ROW_GAP) }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <AnimatePresence initial={false}>
          {domPlan.map((task) => (
            <PlanRow
              key={task.id}
              task={task}
              index={order.indexOf(task.id)}
              count={plan.length}
              delay={fresh[task.id] ?? 0}
              fresh={fresh[task.id] !== undefined}
              starter={!!task.starter && starterPlan}
              dragging={dragId === task.id}
              active={task.id === firstRow}
              tints={task.goals
                .filter((g) => chosen.includes(g))
                .map((g) => ({
                  id: g,
                  title: goals.find((x) => x.id === g)?.title ?? g,
                  tint: tints.get(g) ?? ink,
                }))}
              motionSafe={motionSafe}
              disabled={disabled}
              bind={bindRow}
              bindGrip={bindGrip}
              onGripKey={onGripKey}
              onFocusRow={setActiveRow}
              onDragStart={(id) => {
                setFrozen(order);
                setDragId(id);
                setActiveRow(id);
              }}
              onDragMove={(id, y) => {
                const to = clamp(Math.round(y / STEP), 0, order.length - 1);
                if (to !== order.indexOf(id)) move(id, to, false);
                wake(200);
              }}
              onDragEnd={(id) => {
                setDragId(null);
                setFrozen(null);
                const at = order.indexOf(id);
                if (at !== -1) {
                  say(
                    `${taskById.get(id)?.title ?? "Task"} is ${at + 1} of ${order.length}.`,
                  );
                }
                wake(700);
              }}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  const planHead = (
    <p className="flex items-baseline justify-between gap-2">
      <span
        id={ids.plan}
        className="truncate text-[13px] font-semibold text-foreground"
      >
        {starterPlan ? "A starter plan" : planTitle}
      </span>
      <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
        {plural(plan.length, "task", "tasks")}
        {minutes ? ` · ${minutes} min` : ""}
      </span>
    </p>
  );

  const body =
    status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The goals did not load.</p>
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
    ) : (
      <div
        ref={setContent}
        className="relative grid grid-cols-1 gap-x-12 gap-y-4 p-4 @min-[40rem]/goal-weave:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
      >
        {wide ? (
          <svg
            ref={svgRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
          >
            {threads.map((th) => (
              <path
                key={th.key}
                ref={(node) => {
                  if (node) pathNodes.current.set(th.key, node);
                  else pathNodes.current.delete(th.key);
                }}
                d=""
                fill="none"
                strokeLinecap="round"
                style={{ stroke: tints.get(th.goal) ?? ink }}
                strokeWidth={
                  threadStyle === "ribbon"
                    ? 6
                    : threadStyle === "stitch"
                      ? 2
                      : 1.5
                }
                strokeOpacity={
                  threadStyle === "ribbon"
                    ? 0.3
                    : threadStyle === "stitch"
                      ? 0.9
                      : 0.75
                }
                strokeDasharray={threadStyle === "stitch" ? "4 5" : undefined}
              />
            ))}
          </svg>
        ) : null}
        <div
          ref={goalsEdge}
          className="relative z-10 flex min-w-0 flex-col gap-2.5"
        >
          <p
            id={ids.goals}
            className="text-[13px] font-semibold text-foreground"
          >
            {question}
          </p>
          {cards}
          {goals.length === 0 && ready ? (
            <p className="text-[13px] text-ink-3">
              No goals to choose from yet.
            </p>
          ) : null}
        </div>
        <div className="relative z-10 flex min-w-0 flex-col gap-2.5">
          {wide ? (
            <>
              {planHead}
              {rows}
            </>
          ) : (
            <div className="rounded-3 border border-hairline bg-surface-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={ids.drawer}
                onClick={() => {
                  setOpen((o) => !o);
                  setBadge(null);
                }}
                className={cn(
                  "flex h-11 w-full items-center gap-2 rounded-3 px-3 text-left",
                  FOCUS,
                )}
              >
                <span
                  id={ids.plan}
                  className="min-w-0 truncate text-[13px] font-semibold text-foreground"
                >
                  {starterPlan ? "A starter plan" : planTitle}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-ink-2">
                  <Rolling value={plan.length} motionSafe={motionSafe} />
                  {plan.length === 1 ? "task" : "tasks"}
                </span>
                <AnimatePresence initial={false}>
                  {badge ? (
                    <motion.span
                      key={badge.n}
                      className="shrink-0 rounded-full px-1.5 font-mono text-[10px] text-primary-foreground tabular-nums"
                      style={{ backgroundColor: ink }}
                      initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              scale: springs.recoil,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {badge.d > 0 ? `+${badge.d}` : `−${-badge.d}`}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-ink-3 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </button>
              <Measured glide={motionSafe}>
                {open ? (
                  <div id={ids.drawer} className="border-t border-hairline p-2">
                    {rows}
                  </div>
                ) : null}
              </Measured>
            </div>
          )}
        </div>
      </div>
    );

  return (
    <section
      aria-labelledby={ids.title}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/goal-weave flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={ids.title} className="truncate text-sm font-semibold">
            Set up your workspace
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            Pick your goals; the plan assembles itself
          </p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-2">
          <Rolling value={chosen.length} motionSafe={motionSafe} />
          {chosen.length === 1 ? "goal" : "goals"}
        </span>
      </header>

      <p id={ids.hint} className="sr-only">
        {full ? `Up to ${plural(maxGoals ?? 0, "goal", "goals")}. ` : ""}
        Up and Down move between tasks; Alt with Up or Down moves a task.
      </p>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {body}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        <p className="mr-auto min-w-0 truncate text-[12px] text-ink-2 tabular-nums">
          {starterPlan
            ? "Pick a goal, or start with the basics"
            : `${plural(plan.length, "task", "tasks")} from ${plural(chosen.length, "goal", "goals")}`}
        </p>
        <button
          type="button"
          onClick={accept}
          aria-disabled={disabled || !ready || plan.length === 0 || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium text-primary-foreground transition-opacity aria-disabled:opacity-50",
            FOCUS,
          )}
          style={{ backgroundColor: ink }}
        >
          {accepted ? <Check aria-hidden className="size-3.5" /> : null}
          {accepted ? "Plan saved" : acceptLabel}
        </button>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
