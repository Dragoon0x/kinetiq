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
  type Transition,
} from "motion/react";
import {
  ChartGantt,
  Check,
  ChevronLeft,
  GripVertical,
  List,
  Minus,
  Plus,
  RotateCcw,
  SquareKanban,
  X,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  project as projectThrow,
  rubberband,
  rubberClamp,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { BinLid, type BinLidState } from "@/registry/ui/bin-lid";
import { FollowKnot } from "@/registry/ui/follow-knot";
import { PinPress } from "@/registry/ui/pin-press";

/* --------------------------------- types --------------------------------- */

export type TrackerStatus = "todo" | "doing" | "review" | "done";
export type TrackerPriority = "high" | "medium" | "low";
export type TrackerView = "list" | "board" | "timeline";
export type TrackerDrawer = "overlay" | "push" | "sheet";
export type TrackerDensity = "compact" | "cozy" | "roomy";
export type TrackerLoad = "ready" | "loading" | "error";

export type TrackerPerson = { id: string; name: string };

export type TrackerProject = {
  id: string;
  name: string;
  /** Three letters that prefix its task numbers: "FLD". */
  key: string;
};

export type TrackerSubtask = { id: string; title: string; done: boolean };

export type TrackerTask = {
  id: string;
  /** The project's id. */
  project: string;
  title: string;
  status: TrackerStatus;
  priority: TrackerPriority;
  /** A person's id. Unassigned when absent. */
  assignee?: string;
  /** First day of work, YYYY-MM-DD. */
  start: string;
  /** Last day, YYYY-MM-DD, on or after `start`. */
  due: string;
  /** One short word: an area of the product. */
  tag?: string;
  description?: string;
  subtasks?: TrackerSubtask[];
  /** Other people watching it. */
  watchers?: number;
  /** Whether the viewer watches it. */
  watching?: boolean;
};

export type ProjectTrackerProps = {
  /** The projects in the sidebar. @default defaultTrackerProjects */
  projects?: TrackerProject[];
  /** Everyone a task can be assigned to. @default defaultTrackerPeople */
  people?: TrackerPerson[];
  /** Controlled tasks, for every project. */
  tasks?: TrackerTask[];
  /** Initial tasks when uncontrolled. @default defaultTrackerTasks */
  defaultTasks?: TrackerTask[];
  /** Fires with every task after any change: a status, a drop, a date, an edit, a new task or a deletion. */
  onTasksChange?: (tasks: TrackerTask[]) => void;
  /** Controlled project id. */
  project?: string;
  /** Initial project when uncontrolled. @default the first project */
  defaultProject?: string;
  /** Fires from the sidebar row or key that chose a project. */
  onProjectChange?: (id: string) => void;
  /** Controlled view: the tasks as a list, a board of status columns, or bars on a timeline. */
  view?: TrackerView;
  /** Initial view when uncontrolled. @default "list" */
  defaultView?: TrackerView;
  /** Fires from the view switch with the new view. */
  onViewChange?: (view: TrackerView) => void;
  /** Controlled open task: its id puts it in the drawer, null closes the drawer. */
  task?: string | null;
  /** Initially open task when uncontrolled. @default null */
  defaultTask?: string | null;
  /** Fires from the row, card, bar or key that opened a task, and with null when the drawer closes. */
  onTaskChange?: (id: string | null) => void;
  /** Controlled pinned project ids, shown first in the sidebar. */
  pinned?: string[];
  /** Initially pinned projects when uncontrolled. @default ["field"] */
  defaultPinned?: string[];
  /** Fires from the pin with every pinned id. */
  onPinnedChange?: (ids: string[]) => void;
  /** A task was made with New task. */
  onTaskCreate?: (task: TrackerTask) => void;
  /** A task changed, with what it was before. */
  onTaskUpdate?: (task: TrackerTask, previous: TrackerTask) => void;
  /** A task was deleted (after its undo window). */
  onTaskDelete?: (task: TrackerTask) => void;
  /** Today (Date or ms): the timeline's line, and what is due or late. @default defaultTrackerNow */
  now?: Date | number;
  /** How the task drawer presents: over the work from the right, pushing the work aside, or rising from the bottom. @default "overlay" */
  drawer?: TrackerDrawer;
  /** Row height 32, 40 or 48px, with card padding and the timeline's rows and days to match. @default "cozy" */
  density?: TrackerDensity;
  /** Whether the tasks have arrived. @default "ready" */
  status?: TrackerLoad;
  /** "Try again" was pressed after the tasks failed to load. */
  onRetry?: () => void;
  /** The screen's accessible name. @default "Project tracker" */
  label?: string;
  /** Play the swishes and clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Wednesday 30 September 2026. */
export const defaultTrackerNow = Date.UTC(2026, 8, 30, 10, 0);

export const defaultTrackerPeople: TrackerPerson[] = [
  { id: "ines", name: "Ines Park" },
  { id: "tomas", name: "Tomas Reyes" },
  { id: "mira", name: "Mira Chen" },
  { id: "juno", name: "Juno Adeyemi" },
];

export const defaultTrackerProjects: TrackerProject[] = [
  { id: "field", name: "Field app 3.0", key: "FLD" },
  { id: "billing", name: "Billing revamp", key: "BIL" },
  { id: "help", name: "Help center", key: "HLP" },
];

/** Title, status, priority, assignee, start, due (September or October days), tag. */
const SEED: Record<
  string,
  [string, TrackerStatus, TrackerPriority, string, string, string, string][]
> = {
  field: [
    [
      "Offline sync for job notes",
      "doing",
      "high",
      "ines",
      "09-24",
      "10-02",
      "Sync",
    ],
    [
      "Crash on photo upload over 4G",
      "doing",
      "high",
      "tomas",
      "09-28",
      "10-01",
      "Bug",
    ],
    [
      "Signature capture on delivery",
      "review",
      "medium",
      "mira",
      "09-22",
      "09-30",
      "Forms",
    ],
    ["Parts list search", "review", "low", "tomas", "09-25", "10-01", "Parts"],
    [
      "Route list sorts by distance",
      "todo",
      "medium",
      "juno",
      "10-01",
      "10-06",
      "Routes",
    ],
    [
      "Push when a job is reassigned",
      "todo",
      "medium",
      "tomas",
      "10-02",
      "10-08",
      "Alerts",
    ],
    ["Dark map tiles", "todo", "low", "mira", "10-05", "10-09", "Maps"],
    ["Sign in with SSO", "done", "high", "ines", "09-16", "09-23", "Auth"],
    [
      "Job timer survives a restart",
      "done",
      "medium",
      "juno",
      "09-18",
      "09-25",
      "Jobs",
    ],
  ],
  billing: [
    ["Proration preview", "doing", "high", "mira", "09-25", "10-05", "Plans"],
    [
      "Card retry schedule",
      "review",
      "high",
      "ines",
      "09-21",
      "09-30",
      "Payments",
    ],
    [
      "Invoice PDF redesign",
      "todo",
      "medium",
      "juno",
      "10-01",
      "10-12",
      "Invoices",
    ],
    [
      "Tax ID on receipts",
      "todo",
      "low",
      "tomas",
      "10-06",
      "10-10",
      "Receipts",
    ],
    [
      "Usage export to CSV",
      "done",
      "medium",
      "juno",
      "09-14",
      "09-24",
      "Export",
    ],
  ],
};

const NOTES: Record<string, { text: string; steps: [string, boolean][] }> = {
  "Offline sync for job notes": {
    text: "Notes written without signal queue on the device and sync in order once the van is back in range. Conflicts keep both versions.",
    steps: [
      ["Queue writes in local storage", true],
      ["Replay the queue in order", true],
      ["Show a pending badge on unsynced notes", false],
      ["Keep both sides of a conflict", false],
    ],
  },
  "Crash on photo upload over 4G": {
    text: "Uploads over a weak connection time out and the retry reads a recycled buffer. Seen on 3% of sessions last week.",
    steps: [
      ["Reproduce on a throttled connection", true],
      ["Copy the buffer before retrying", false],
    ],
  },
};

const DAY = 86_400_000;
const isoAt = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const dayOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
const md = (s: string) => `2026-${s}`;

/** Fourteen tasks over two projects, around the last day of September. */
export const defaultTrackerTasks: TrackerTask[] = Object.entries(SEED).flatMap(
  ([projectId, rows]) => {
    const key =
      defaultTrackerProjects.find((p) => p.id === projectId)?.key ?? "TSK";
    return rows.map(
      ([title, status, priority, assignee, start, due, tag], i) => {
        const note = NOTES[title];
        return {
          id: `${key.toLowerCase()}-${i + 1}`,
          project: projectId,
          title,
          status,
          priority,
          assignee,
          start: md(start),
          due: md(due),
          tag,
          description:
            note?.text ??
            `${tag} work for ${projectId === "field" ? "the field app" : "billing"}. Ship it behind a flag first.`,
          subtasks:
            note?.steps.map(([t, done], k) => ({
              id: `s${k + 1}`,
              title: t,
              done,
            })) ?? [],
          watchers: (title.length * 7) % 5,
          watching: i === 0,
        };
      },
    );
  },
);

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (d: Date | number) => (typeof d === "number" ? d : d.getTime());
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const WEEK = "SMTWTFS";

const short = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const relative = (iso: string, today: number) => {
  const gap = dayOf(iso) - today;
  return gap === 0
    ? "Today"
    : gap === 1
      ? "Tomorrow"
      : gap === -1
        ? "Yesterday"
        : short(iso);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const STATUSES: { id: TrackerStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "review", label: "In review" },
  { id: "done", label: "Done" },
];
const statusName = (s: TrackerStatus) =>
  STATUSES.find((x) => x.id === s)?.label ?? s;

/** Status hues as pigment: fixed lightness, so a bar reads the same in both themes. */
const TONE: Record<TrackerStatus, string> = {
  todo: "var(--ink-3)",
  doing: "var(--accent-bright)",
  review: "var(--warn)",
  done: "var(--success)",
};
const pigment = (s: TrackerStatus, alpha: number) =>
  s === "todo"
    ? `color-mix(in oklab, var(--ink-3) ${Math.round(alpha * 100)}%, transparent)`
    : `oklch(from ${TONE[s]} 0.66 0.13 h / ${alpha})`;

const PRIORITIES: { id: TrackerPriority; label: string }[] = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const VIEWS: { id: TrackerView; label: string; icon: LucideIcon }[] = [
  { id: "list", label: "List", icon: List },
  { id: "board", label: "Board", icon: SquareKanban },
  { id: "timeline", label: "Timeline", icon: ChartGantt },
];

const DENSITY: Record<
  TrackerDensity,
  { row: number; card: string; day: number; text: string }
> = {
  compact: { row: 32, card: "p-2 gap-1.5", day: 26, text: "text-[12px]" },
  cozy: { row: 40, card: "p-2.5 gap-2", day: 32, text: "text-[13px]" },
  roomy: { row: 48, card: "p-3 gap-2.5", day: 38, text: "text-sm" },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Arrow keys walk a radiogroup and choose as they go. */
function roveRadio(
  event: React.KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  choose: (to: number) => void,
) {
  const dir =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!dir || count < 1) return;
  event.preventDefault();
  const to = (index + dir + count) % count;
  choose(to);
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLElement>("[role=radio]")
    [to]?.focus();
}

function Face({
  person,
  size = 22,
}: {
  person?: TrackerPerson;
  size?: number;
}) {
  if (!person) {
    return (
      <span
        aria-hidden
        className="shrink-0 rounded-full border border-dashed border-hairline-strong"
        style={{ width: size, height: size }}
      />
    );
  }
  const turn = (hash(person.id) % 12) * 30;
  return (
    <span
      aria-hidden
      title={person.name}
      className="flex shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
      style={{
        width: size,
        height: size,
        background: `oklch(from var(--accent-bright) 0.66 0.12 calc(h + ${turn}) / 0.18)`,
        color: `oklch(from var(--accent-bright) 0.6 0.14 calc(h + ${turn}))`,
      }}
    >
      {initials(person.name)}
    </span>
  );
}

function Due({ task, today }: { task: TrackerTask; today: number }) {
  const late = task.status !== "done" && dayOf(task.due) < today;
  const soon = task.status !== "done" && dayOf(task.due) === today;
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[10px] tabular-nums",
        late ? "text-danger" : soon ? "text-warn" : "text-ink-3",
      )}
    >
      {relative(task.due, today)}
    </span>
  );
}

/* ------------------------------ shared morph ------------------------------ */

type MorphProps = {
  uid: string;
  id: string;
  /** Changes when the arrangement does, never for a date or a title. */
  arrangement: string;
  motionSafe: boolean;
};

const morph = (motionSafe: boolean): Transition =>
  motionSafe ? { layout: springs.glide } : { layout: { duration: 0 } };

/** The box a task is drawn in: a row, a card or a bar, one object between them. */
function Plate({
  uid,
  id,
  arrangement,
  motionSafe,
  className,
  style,
}: MorphProps & { className?: string; style?: React.CSSProperties }) {
  return (
    <motion.span
      aria-hidden
      layoutId={`${uid}-plate-${id}`}
      layoutDependency={arrangement}
      transition={morph(motionSafe)}
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ borderRadius: 8, ...style }}
    />
  );
}

/** The task's title, which glides to its new place without stretching. */
function Title({
  uid,
  id,
  arrangement,
  motionSafe,
  className,
  children,
}: MorphProps & { className?: string; children: React.ReactNode }) {
  return (
    <motion.span
      layout="position"
      layoutId={`${uid}-title-${id}`}
      layoutDependency={arrangement}
      transition={morph(motionSafe)}
      className={cn("relative block", className)}
    >
      {children}
    </motion.span>
  );
}

/**
 * A part only one view draws (a checkbox, a grip, a meta line). It rides
 * along when its task moves within the view, and arrives a beat after a
 * morph, once the plate is nearly home.
 */
function Rider({
  uid,
  id,
  part,
  arrangement,
  motionSafe,
  className,
  children,
}: MorphProps & {
  part: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.span
      layout="position"
      layoutId={`${uid}-${part}-${id}`}
      layoutDependency={arrangement}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        layout: motionSafe ? springs.glide : { duration: 0 },
        opacity: {
          duration: durations.base,
          delay: motionSafe ? 0.24 : 0,
          ease: easings.enter,
        },
      }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

/* --------------------------------- board ---------------------------------- */

type CardProps = MorphProps & {
  task: TrackerTask;
  person?: TrackerPerson;
  today: number;
  d: (typeof DENSITY)[TrackerDensity];
  focusable: boolean;
  disabled: boolean;
  bind: (node: HTMLElement | null) => void;
  /** The column the pointer is over while this card is carried. */
  onOver: (status: TrackerStatus | null) => void;
  onDrop: (status: TrackerStatus) => void;
  onOpen: (el: HTMLElement) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
};

/**
 * A board card. It follows the pointer 1:1 in two dimensions and lifts on
 * flick; let go over another column and the status changes, and the card
 * flies from the hand to its slot through the shared plate. Touch carries it
 * by its grip, so a swipe elsewhere still scrolls the board.
 */
function BoardCard({
  task,
  person,
  today,
  d,
  focusable,
  disabled,
  bind,
  onOver,
  onDrop,
  onOpen,
  onKey,
  onFocus,
  ...morphProps
}: CardProps) {
  const { motionSafe } = morphProps;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const lift = useMotionValue(0);
  const [held, setHeld] = React.useState(false);
  const columns = React.useRef<
    { status: TrackerStatus; left: number; right: number }[]
  >([]);
  const over = React.useRef<TrackerStatus | null>(null);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const halt = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };
  React.useEffect(() => halt, []);

  const settle = (vx = 0, vy = 0) => {
    halt();
    const t = (v: number): Transition =>
      motionSafe ? { ...springs.snap, velocity: v } : { duration: 0 };
    anims.current = [
      animate(x, 0, t(vx)),
      animate(y, 0, t(vy)),
      animate(lift, 0, motionSafe ? springs.glide : { duration: 0 }),
    ];
  };

  const drag = useDrag({
    threshold: 5,
    disabled,
    onStart: ({ event }) => {
      halt();
      const board = (event.currentTarget as Element | null)?.closest(
        "[data-tracker-board]",
      );
      columns.current = [
        ...(board?.querySelectorAll<HTMLElement>("[data-tracker-column]") ??
          []),
      ].map((col) => {
        const r = col.getBoundingClientRect();
        return {
          status: col.getAttribute("data-tracker-column") as TrackerStatus,
          left: r.left,
          right: r.right,
        };
      });
      setHeld(true);
      anims.current = [
        animate(lift, 1, motionSafe ? springs.flick : { duration: 0 }),
      ];
    },
    onMove: ({ offset, point }) => {
      x.set(r2(offset.x));
      y.set(r2(offset.y));
      const col = columns.current.find(
        (c) => point.x >= c.left && point.x <= c.right,
      );
      const next = col ? col.status : null;
      if (next !== over.current) {
        over.current = next;
        onOver(next);
      }
    },
    onEnd: ({ velocity }) => {
      const target = over.current;
      over.current = null;
      setHeld(false);
      onOver(null);
      if (target && target !== task.status) onDrop(target);
      else settle(velocity.x, velocity.y);
    },
    onCancel: () => {
      over.current = null;
      setHeld(false);
      onOver(null);
      settle();
    },
    onTap: (event) => onOpen(event.currentTarget as HTMLElement),
  });

  const scale = useTransform(lift, (l) => r2(1 + 0.03 * l));
  const rotate = useTransform(x, (v) =>
    motionSafe ? r2(clamp(v / 40, -3, 3)) : 0,
  );
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(10 * l)}px ${r2(24 * l)}px color-mix(in oklab, black ${Math.round(20 * l)}%, transparent)`,
  );

  return (
    <motion.li
      className={cn("relative list-none", held ? "z-30" : "z-0")}
      style={{ x, y, scale, rotate, boxShadow: shadow, borderRadius: 10 }}
    >
      <Plate
        {...morphProps}
        id={task.id}
        className="border border-hairline bg-card"
        style={{ borderRadius: 10 }}
      />
      <button
        ref={bind}
        type="button"
        tabIndex={focusable ? 0 : -1}
        disabled={disabled}
        aria-label={`${task.title}, ${person?.name ?? "unassigned"}, due ${relative(task.due, today)}`}
        aria-describedby={`${morphProps.uid}-board-hint`}
        onFocus={onFocus}
        onKeyDown={onKey}
        {...drag}
        onPointerDown={(event) => {
          // A touch carries the card by its grip; anywhere else it scrolls.
          if (
            event.pointerType === "touch" &&
            !(event.target as Element).closest("[data-tracker-grip]")
          )
            return;
          drag.onPointerDown(event);
        }}
        onClick={(event) => {
          if (event.detail === 0) onOpen(event.currentTarget);
        }}
        className={cn(
          "relative flex w-full flex-col text-left select-none",
          held ? "cursor-grabbing" : "cursor-grab",
          d.card,
          FOCUS,
        )}
        style={{ borderRadius: 10 }}
      >
        <span className="flex items-start gap-1.5">
          <Title
            {...morphProps}
            id={task.id}
            className={cn("min-w-0 flex-1 font-medium", d.text)}
          >
            {task.title}
          </Title>
          <Rider
            {...morphProps}
            id={task.id}
            part="grip"
            className="-mt-0.5 -mr-1 shrink-0"
          >
            <span
              data-tracker-grip=""
              aria-hidden
              className="flex size-6 touch-none items-center justify-center rounded-1 text-ink-3"
            >
              <GripVertical className="size-3.5" />
            </span>
          </Rider>
        </span>
        <Rider
          {...morphProps}
          id={task.id}
          part="card-meta"
          className="flex items-center gap-2"
        >
          {task.tag ? (
            <span className="truncate rounded-1 bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">
              {task.tag}
            </span>
          ) : null}
          <span className="flex-1" />
          <Due task={task} today={today} />
          <Face person={person} size={20} />
        </Rider>
      </button>
    </motion.li>
  );
}

/* -------------------------------- timeline -------------------------------- */

type BarProps = MorphProps & {
  task: TrackerTask;
  axisStart: number;
  axisEnd: number;
  dayW: number;
  rowH: number;
  focusable: boolean;
  disabled: boolean;
  bind: (node: HTMLElement | null) => void;
  /** Move the task by whole days (both ends), or change its due date. */
  onShift: (days: number, which: "both" | "due") => void;
  onOpen: (el: HTMLElement) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onTick: () => void;
  /** The first row: its drag label shows under the bar, clear of the dates header. */
  first: boolean;
};

/**
 * A timeline bar: its left edge is the start, its right edge the due date.
 * It slides along its row 1:1 and lands on the day the throw was heading
 * for, on snap with the release velocity, while its dates change under it.
 */
function TimelineBar({
  task,
  axisStart,
  axisEnd,
  dayW,
  rowH,
  focusable,
  disabled,
  bind,
  onShift,
  onOpen,
  onKey,
  onFocus,
  onTick,
  first,
  ...morphProps
}: BarProps) {
  const { motionSafe } = morphProps;
  const start = dayOf(task.start);
  const due = dayOf(task.due);
  const x = useMotionValue(0);
  const [held, setHeld] = React.useState(false);
  const [hint, setHint] = React.useState(0);
  const moving = React.useRef<AnimationPlaybackControls | null>(null);
  const handoff = React.useRef<{ px: number; velocity: number } | null>(null);
  const seenStart = React.useRef(start);

  // The dates moved under the bar: it keeps its place on screen, then
  // springs onto the new day with the hand's speed.
  React.useLayoutEffect(() => {
    const was = seenStart.current;
    seenStart.current = start;
    const h = handoff.current;
    handoff.current = null;
    if (!h || was === start) return;
    x.jump(r2(x.get() - (start - was) * dayW));
    moving.current?.stop();
    moving.current = animate(
      x,
      0,
      motionSafe ? { ...springs.snap, velocity: h.velocity } : { duration: 0 },
    );
  }, [start, dayW, motionSafe, x]);
  React.useEffect(() => () => moving.current?.stop(), []);

  const minPx = (axisStart - start) * dayW;
  const maxPx = (axisEnd - due) * dayW;
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      moving.current?.stop();
      setHeld(true);
    },
    onMove: ({ offset }) => {
      const v = rubberClamp(offset.x, minPx, maxPx, dayW * 2);
      x.set(r2(v));
      const days = Math.round(clamp(v, minPx, maxPx) / dayW);
      if (days !== hint) {
        setHint(days);
        onTick();
      }
    },
    onEnd: ({ velocity }) => {
      setHeld(false);
      setHint(0);
      const landing = clamp(
        projectThrow(x.get(), velocity.x, 0.99),
        minPx,
        maxPx,
      );
      const days = Math.round(landing / dayW);
      if (days !== 0) {
        handoff.current = { px: x.get(), velocity: velocity.x };
        onShift(days, "both");
      } else {
        moving.current = animate(
          x,
          0,
          motionSafe
            ? { ...springs.snap, velocity: velocity.x }
            : { duration: 0 },
        );
      }
    },
    onCancel: () => {
      setHeld(false);
      setHint(0);
      moving.current = animate(x, 0, springs.snap);
    },
    onTap: (event) => onOpen(event.currentTarget as HTMLElement),
  });

  const left = (start - axisStart) * dayW;
  const width = Math.max(dayW, (due - start + 1) * dayW);
  const shownStart = isoAt(start + hint);
  const shownDue = isoAt(due + hint);
  return (
    <motion.div
      className={cn("absolute", held ? "z-20" : "z-10")}
      style={{
        left,
        width,
        top: Math.round(rowH * 0.18),
        height: Math.round(rowH * 0.64),
        x,
      }}
    >
      <Plate
        {...morphProps}
        id={task.id}
        className="border"
        style={{
          borderRadius: 999,
          background: pigment(task.status, 0.24),
          borderColor: pigment(task.status, 0.62),
        }}
      />
      <button
        ref={bind}
        type="button"
        tabIndex={focusable ? 0 : -1}
        disabled={disabled}
        aria-label={`${task.title}, ${short(task.start)} to ${short(task.due)}, ${statusName(task.status)}`}
        aria-describedby={`${morphProps.uid}-timeline-hint`}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (
            !event.altKey &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight")
          ) {
            event.preventDefault();
            const step = event.key === "ArrowLeft" ? -1 : 1;
            if (event.shiftKey) {
              if (due + step >= start && due + step <= axisEnd)
                onShift(step, "due");
            } else if (start + step >= axisStart && due + step <= axisEnd) {
              handoff.current = { px: 0, velocity: 0 };
              onShift(step, "both");
            }
            return;
          }
          onKey(event);
        }}
        {...drag}
        onClick={(event) => {
          if (event.detail === 0) onOpen(event.currentTarget);
        }}
        className={cn(
          "relative flex h-full w-full touch-pan-y items-center overflow-clip rounded-full px-2 select-none",
          held ? "cursor-grabbing" : "cursor-grab",
          FOCUS,
        )}
      >
        {width >= 64 ? (
          <Rider
            {...morphProps}
            id={task.id}
            part="dates"
            className="truncate font-mono text-[10px] text-foreground/80 tabular-nums"
          >
            {short(shownStart)} – {short(shownDue)}
          </Rider>
        ) : null}
      </button>
      {held ? (
        <span
          className={cn(
            "pointer-events-none absolute left-0 rounded-1 bg-foreground px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-background tabular-nums",
            first ? "top-full mt-1" : "-top-5",
          )}
        >
          {short(shownStart)} – {short(shownDue)}
        </span>
      ) : null}
    </motion.div>
  );
}

/* --------------------------------- drawer --------------------------------- */

type DrawerProps = {
  task: TrackerTask;
  project?: TrackerProject;
  people: TrackerPerson[];
  look: TrackerDrawer;
  phone: boolean;
  width: number;
  today: number;
  motionSafe: boolean;
  sound: boolean;
  disabled: boolean;
  closing: boolean;
  /** 0 hidden, 1 in place: written here, read by the work behind for the push. */
  shown: MotionValue<number>;
  onUpdate: (patch: Partial<TrackerTask>, said: string) => void;
  onClose: (velocity?: number) => void;
  onArmed: (armed: boolean) => void;
  onDelete: () => void;
  bindTitle: (node: HTMLInputElement | null) => void;
};

/**
 * The task in full. Every field is a real control; the composed watch and
 * delete buttons sit at its foot. The header drags it away along its own axis.
 */
function Drawer({
  task,
  project,
  people,
  look,
  phone,
  width,
  today,
  motionSafe,
  sound,
  disabled,
  closing,
  shown,
  onUpdate,
  onClose,
  onArmed,
  onDelete,
  bindTitle,
}: DrawerProps) {
  const uid = React.useId();
  const side = look !== "sheet";
  const modal = look !== "push" || phone;
  const node = React.useRef<HTMLDivElement | null>(null);
  const size = React.useRef(1);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const [draft, setDraft] = React.useState<string | null>(null);
  const commitTitle = () => {
    const v = (draft ?? "").trim();
    if (draft !== null && v && v !== task.title) {
      onUpdate({ title: v }, `Renamed to ${v}.`);
    }
    setDraft(null);
  };
  const subtasks = task.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;

  const drag = useDrag({
    axis: side ? "x" : "y",
    threshold: 4,
    disabled: closing,
    onStart: () => {
      anim.current?.stop();
      size.current = Math.max(
        1,
        side
          ? (node.current?.offsetWidth ?? 1)
          : (node.current?.offsetHeight ?? 1),
      );
    },
    onMove: ({ offset }) => {
      const o = side ? offset.x : offset.y;
      const px = o < 0 ? -rubberband(-o, size.current) : o;
      shown.set(Number((1 - px / size.current).toFixed(4)));
    },
    onEnd: ({ velocity }) => {
      const v = side ? velocity.x : velocity.y;
      const travelled = (1 - shown.get()) * size.current;
      if (projectThrow(travelled, v, 0.99) > size.current * 0.4) {
        onClose(-v / size.current);
        return;
      }
      anim.current = animate(
        shown,
        1,
        motionSafe
          ? { ...springs.glide, velocity: -v / size.current }
          : { duration: 0 },
      );
    },
    onCancel: () => {
      anim.current = animate(shown, 1, springs.glide);
    },
  });
  React.useEffect(() => () => anim.current?.stop(), []);

  const offset = useTransform(shown, (s) =>
    motionSafe ? `${r2((1 - s) * 100)}%` : "0%",
  );
  const opacity = useTransform(shown, (s) =>
    motionSafe ? 1 : r2(clamp(s, 0, 1)),
  );
  const fill = useMotionValue(
    subtasks.length ? doneCount / subtasks.length : 0,
  );
  const fillTo = subtasks.length ? doneCount / subtasks.length : 0;
  React.useEffect(() => {
    const c = animate(
      fill,
      fillTo,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => c.stop();
  }, [fill, fillTo, motionSafe]);

  const chip = (on: boolean) =>
    cn(
      "relative inline-flex h-7 min-w-0 items-center justify-start gap-1.5 rounded-2 px-2 text-[11px] font-medium transition-colors",
      on
        ? "bg-cobalt-wash text-foreground"
        : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
      FOCUS,
    );
  const field = "grid grid-cols-[72px_1fr] items-center gap-2";
  const fieldLabel = "text-[11px] text-ink-3";
  const stepper = (which: "start" | "due") => {
    const value = dayOf(task[which]);
    const lo = which === "due" ? dayOf(task.start) : -Infinity;
    const hi = which === "start" ? dayOf(task.due) : Infinity;
    const name = which === "start" ? "Start" : "Due";
    const set = (n: number) =>
      onUpdate({ [which]: isoAt(n) }, `${name} ${short(isoAt(n))}.`);
    const btn = cn(
      "inline-flex size-7 items-center justify-center rounded-2 border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
      FOCUS,
    );
    return (
      <div className={field}>
        <span className={fieldLabel}>{name}</span>
        <div
          role="group"
          aria-label={`${name} date`}
          className="flex items-center gap-1.5"
        >
          <button
            type="button"
            aria-label={`${name} a day earlier`}
            aria-disabled={value - 1 < lo || undefined}
            onClick={() => value - 1 >= lo && set(value - 1)}
            className={btn}
          >
            <Minus aria-hidden className="size-3.5" />
          </button>
          <span className="w-16 text-center font-mono text-xs tabular-nums">
            {relative(task[which], today)}
          </span>
          <button
            type="button"
            aria-label={`${name} a day later`}
            aria-disabled={value + 1 > hi || undefined}
            onClick={() => value + 1 <= hi && set(value + 1)}
            className={btn}
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      ref={node}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      aria-labelledby={`${uid}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (draft !== null && (event.target as Element).tagName === "INPUT") {
            setDraft(null);
            return;
          }
          onClose();
          return;
        }
        if (!modal || event.key !== "Tab") return;
        const all = [
          ...(node.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input, [tabindex]",
          ) ?? []),
        ].filter((n) => n.tabIndex >= 0);
        const first = all[0];
        const last = all[all.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className={cn(
        "@container/drawer absolute z-40 flex flex-col bg-popover text-foreground",
        side
          ? "inset-y-0 right-0 border-l border-hairline-strong shadow-[-16px_0_40px_color-mix(in_oklab,black_16%,transparent)]"
          : "inset-x-0 bottom-0 h-[82%] rounded-t-4 border-t border-hairline-strong shadow-[0_-16px_40px_color-mix(in_oklab,black_18%,transparent)]",
      )}
      style={{
        width: side ? (phone ? "100%" : width) : undefined,
        x: side ? offset : 0,
        y: side ? 0 : offset,
        opacity,
      }}
    >
      <div
        {...drag}
        className={cn(
          "flex shrink-0 cursor-grab touch-none flex-col border-b border-hairline px-4 active:cursor-grabbing",
          side ? "pt-3" : "pt-2",
        )}
      >
        {side ? null : (
          <span
            aria-hidden
            className="mx-auto h-1 w-9 rounded-full bg-ink-3/40"
          />
        )}
        <div className="flex h-9 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: pigment(task.status, 1) }}
            />
            <span className="truncate">
              {project?.key ?? "TSK"}-{task.id.replace(/\D+/g, "") || "1"} ·{" "}
              {statusName(task.status)}
            </span>
          </span>
          <button
            type="button"
            aria-label="Close task"
            onClick={() => onClose()}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <h2 id={`${uid}-title`} className="sr-only">
          {task.title}
        </h2>
        <input
          ref={bindTitle}
          aria-label="Task title"
          value={draft ?? task.title}
          disabled={disabled}
          onChange={(event) => {
            const v = event.currentTarget.value;
            setDraft(v);
          }}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            // Enter keeps the field: focus stays where the typing was.
            if (event.key === "Enter") commitTitle();
          }}
          className={cn(
            "-mx-1.5 mb-3 h-9 rounded-2 bg-transparent px-1.5 text-base font-semibold hover:bg-surface-2 focus:bg-surface-2",
            FOCUS_IN,
          )}
        />
      </div>

      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        <div className={field}>
          <span className={fieldLabel}>Status</span>
          <div
            role="radiogroup"
            aria-label="Status"
            className="grid grid-cols-2 gap-1 @min-[340px]/drawer:grid-cols-4"
          >
            {STATUSES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={task.status === s.id}
                tabIndex={task.status === s.id ? 0 : -1}
                disabled={disabled}
                onClick={() =>
                  task.status !== s.id &&
                  onUpdate({ status: s.id }, `Moved to ${s.label}.`)
                }
                onKeyDown={(event) =>
                  roveRadio(event, i, STATUSES.length, (to) => {
                    const next = STATUSES[to];
                    if (next)
                      onUpdate({ status: next.id }, `Moved to ${next.label}.`);
                  })
                }
                className={chip(task.status === s.id)}
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: pigment(s.id, 1) }}
                />
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={field}>
          <span className={fieldLabel}>Assignee</span>
          <div
            role="radiogroup"
            aria-label="Assignee"
            className="flex flex-wrap gap-1"
          >
            {people.map((p, i) => {
              const on = task.assignee === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={p.name}
                  tabIndex={on || (!task.assignee && i === 0) ? 0 : -1}
                  disabled={disabled}
                  onClick={() =>
                    !on &&
                    onUpdate({ assignee: p.id }, `Assigned to ${p.name}.`)
                  }
                  onKeyDown={(event) =>
                    roveRadio(event, i, people.length, (to) => {
                      const next = people[to];
                      if (next)
                        onUpdate(
                          { assignee: next.id },
                          `Assigned to ${next.name}.`,
                        );
                    })
                  }
                  className={cn(chip(on), "px-1.5")}
                >
                  <Face person={p} size={20} />
                  <span className="hidden @min-[340px]/drawer:inline">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={field}>
          <span className={fieldLabel}>Priority</span>
          <div role="radiogroup" aria-label="Priority" className="flex gap-1">
            {PRIORITIES.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={task.priority === p.id}
                tabIndex={task.priority === p.id ? 0 : -1}
                disabled={disabled}
                onClick={() =>
                  task.priority !== p.id &&
                  onUpdate({ priority: p.id }, `${p.label} priority.`)
                }
                onKeyDown={(event) =>
                  roveRadio(event, i, PRIORITIES.length, (to) => {
                    const next = PRIORITIES[to];
                    if (next)
                      onUpdate(
                        { priority: next.id },
                        `${next.label} priority.`,
                      );
                  })
                }
                className={chip(task.priority === p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {stepper("start")}
        {stepper("due")}

        {task.description ? (
          <p className="text-[13px] leading-5 text-ink-2">{task.description}</p>
        ) : null}

        {subtasks.length ? (
          <section
            aria-labelledby={`${uid}-steps`}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id={`${uid}-steps`} className="text-xs font-semibold">
                Subtasks
              </h3>
              <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                {doneCount}/{subtasks.length}
              </span>
            </div>
            <span className="block h-1 overflow-clip rounded-full bg-surface-2">
              <motion.span
                className="block h-full rounded-full bg-success"
                style={{ scaleX: fill, originX: 0 }}
              />
            </span>
            <ul className="flex flex-col">
              {subtasks.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s.done}
                    disabled={disabled}
                    onClick={() =>
                      onUpdate(
                        {
                          subtasks: subtasks.map((x) =>
                            x.id === s.id ? { ...x, done: !x.done } : x,
                          ),
                        },
                        `${s.title}, ${s.done ? "not done" : "done"}.`,
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-2 px-1 py-1.5 text-left text-[13px] hover:bg-surface-2",
                      FOCUS_IN,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
                        s.done
                          ? "border-success bg-success text-background"
                          : "border-hairline-strong",
                      )}
                    >
                      {s.done ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className={cn(s.done && "text-ink-3 line-through")}>
                      {s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3">
        <FollowKnot
          size="sm"
          label="Watch"
          pressedLabel="Watching"
          releaseLabel="Unwatch"
          target={task.title}
          pressed={!!task.watching}
          onPressedChange={(next) =>
            onUpdate(
              { watching: next },
              next ? "Watching this task." : "Stopped watching.",
            )
          }
          count={task.watchers ?? 0}
          describeCount={(n) => `${n} watching`}
          sound={sound}
          disabled={disabled}
        />
        <BinLid
          size="sm"
          label="Delete"
          itemName={task.title}
          window={4000}
          onStateChange={(s: BinLidState) => onArmed(s === "armed")}
          onDelete={onDelete}
          sound={sound}
          disabled={disabled}
        />
      </div>
    </motion.div>
  );
}

/* ---------------------------------- app ----------------------------------- */

type Said = { n: number; text: string };

/**
 * A complete project screen. A projects sidebar (pinned first) chooses the
 * project; its tasks show as a list grouped by status, a board of status
 * columns, or bars on a timeline — and switching between them is one morph:
 * every task's plate glides from row to card to bar on glide (the bar's ends
 * are its dates, so the due date becomes the bar's end) while its title
 * glides to its new place without stretching and the details one view has
 * arrive a beat later.
 *
 * Board cards are carried 1:1 to another column and fly into their slot;
 * timeline bars slide along their row and land on the day the throw was
 * heading for, on snap. A task opens in a drawer — over the work, pushing it
 * aside, or rising as a sheet — with every field editable, subtasks whose bar
 * fills on glide, and the composed watch and delete buttons; the pin in the
 * header is the composed pin. The sidebar becomes a stack on a phone.
 *
 * Everything has a keyboard path: rows, cards and bars rove with the arrows,
 * Space ticks a task, Shift with Left or Right moves a card a column or a
 * bar's due date, Left and Right move a bar a day, Enter opens, Escape closes.
 * Under reduced motion nothing travels: views and drawers cross-fade, drags
 * land at once, and every change is still shown and announced.
 */
export function ProjectTracker({
  projects = defaultTrackerProjects,
  people = defaultTrackerPeople,
  tasks,
  defaultTasks = defaultTrackerTasks,
  onTasksChange,
  project,
  defaultProject,
  onProjectChange,
  view,
  defaultView = "list",
  onViewChange,
  task,
  defaultTask = null,
  onTaskChange,
  pinned,
  defaultPinned = ["field"],
  onPinnedChange,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  now = defaultTrackerNow,
  drawer: look = "overlay",
  density = "cozy",
  status = "ready",
  onRetry,
  label = "Project tracker",
  sound = false,
  disabled = false,
  className,
}: ProjectTrackerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const today = Math.floor(toMs(now) / DAY);

  /* ------------------------------ the data ------------------------------- */

  const [ownTasks, setOwnTasks] = React.useState(defaultTasks);
  const all = tasks ?? ownTasks;
  const [ownProject, setOwnProject] = React.useState(
    defaultProject ?? projects[0]?.id ?? "",
  );
  const projectId = project ?? ownProject;
  const current = projects.find((p) => p.id === projectId) ?? projects[0];
  const [ownView, setOwnView] = React.useState<TrackerView>(defaultView);
  const shownView = view ?? ownView;
  const [ownTask, setOwnTask] = React.useState<string | null>(defaultTask);
  const openId = task === undefined ? ownTask : task;
  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pins = pinned ?? ownPinned;

  const list = all.filter((t) => t.project === current?.id);
  const open = all.find((t) => t.id === openId) ?? null;
  const personOf = (id?: string) => people.find((p) => p.id === id);
  const arrangement = `${shownView}|${current?.id}|${list.map((t) => `${t.id}:${t.status}`).join(",")}`;

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const commit = (next: TrackerTask[]) => {
    if (tasks === undefined) setOwnTasks(next);
    onTasksChange?.(next);
  };
  const update = (
    id: string,
    patch: Partial<TrackerTask>,
    sentence: string,
  ) => {
    const prev = all.find((t) => t.id === id);
    if (!prev) return;
    const nextTask = { ...prev, ...patch };
    commit(all.map((t) => (t.id === id ? nextTask : t)));
    onTaskUpdate?.(nextTask, prev);
    say(sentence);
  };

  /* ------------------------------ the frame ------------------------------ */

  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  const phone = width !== null && width < 640;
  const desk = width !== null && width >= 1024;
  const sidebarW = desk ? 216 : 184;
  const mainW = width === null ? 576 : phone ? width : width - sidebarW;
  const drawerW = Math.round(clamp(mainW * 0.52, 280, 340));
  const pushing = look === "push" && !phone;
  const modalDrawer = !pushing;

  // A phone shows one screen at a time: the projects, or the project.
  const [screen, setScreen] = React.useState<"projects" | "project">("project");
  const stack = useMotionValue(1);
  // The projects screen is parked behind the project: hidden once covered.
  const [parked, setParked] = React.useState(true);
  const stackFocus = React.useRef<"nav" | "head" | null>(null);
  const navNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const headNode = React.useRef<HTMLHeadingElement | null>(null);
  const newTaskButton = React.useRef<HTMLButtonElement | null>(null);
  const stackAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const goScreen = (next: "projects" | "project") => {
    setScreen(next);
    stackAnim.current?.stop();
    setParked(false);
    const t: Transition = motionSafe
      ? springs.glide
      : { duration: durations.base };
    stackAnim.current = animate(stack, next === "project" ? 1 : 0, {
      ...t,
      onComplete: () => {
        if (next === "project") setParked(true);
      },
    });
    if (next === "projects") refocus.current = null;
    stackFocus.current = next === "projects" ? "nav" : "head";
  };
  const projectX = useTransform(stack, (s) =>
    phone && motionSafe ? `${r2((1 - s) * 100)}%` : "0%",
  );
  const projectsX = useTransform(stack, (s) =>
    phone && motionSafe ? `${r2(-s * 25)}%` : "0%",
  );
  // The projects screen is parked behind the project: hidden once covered.
  const stackFade = useTransform(stack, (s) =>
    phone && !motionSafe ? r2(s) : 1,
  );

  /* ------------------------------- focus --------------------------------- */

  const nodes = React.useRef(new Map<string, HTMLElement>());
  const bind = (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const columnsOf = STATUSES.map((s) => list.filter((t) => t.status === s.id));
  const order =
    shownView === "board" || shownView === "list"
      ? columnsOf.flat()
      : [...list].sort(
          (a, b) =>
            STATUSES.findIndex((s) => s.id === a.status) -
            STATUSES.findIndex((s) => s.id === b.status),
        );
  const tabId =
    focusId && order.some((t) => t.id === focusId)
      ? focusId
      : (order[0]?.id ?? null);
  const focusTask = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    nodes.current.get(id)?.focus();
  };
  /** Focus to restore once what covered it is gone: a task's id or a node. */
  const refocus = React.useRef<string | HTMLElement | null>(null);

  const navKey = (event: React.KeyboardEvent<HTMLElement>, t: TrackerTask) => {
    const i = order.findIndex((x) => x.id === t.id);
    let to: TrackerTask | undefined;
    if (
      shownView === "board" &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const col = STATUSES.findIndex((s) => s.id === t.status);
      const dir = event.key === "ArrowLeft" ? -1 : 1;
      if (event.shiftKey) {
        event.preventDefault();
        const next = STATUSES[col + dir];
        if (next) moveTo(t, next.id, "keyboard");
        return;
      }
      const row = columnsOf[col]?.findIndex((x) => x.id === t.id) ?? 0;
      for (let c = col + dir; c >= 0 && c < STATUSES.length; c += dir) {
        const cells = columnsOf[c] ?? [];
        if (cells.length) {
          to = cells[Math.min(row, cells.length - 1)];
          break;
        }
      }
    } else if (event.key === "ArrowDown") to = order[i + 1];
    else if (event.key === "ArrowUp") to = order[i - 1];
    else if (event.key === "Home") to = order[0];
    else if (event.key === "End") to = order[order.length - 1];
    else if (event.key === " " && shownView === "list") {
      event.preventDefault();
      toggleDone(t);
      return;
    } else return;
    event.preventDefault();
    focusTask(to?.id);
  };

  /* ------------------------------- actions ------------------------------- */

  const chooseView = (next: TrackerView) => {
    if (next === shownView) return;
    if (view === undefined) setOwnView(next);
    onViewChange?.(next);
    audio.play("swish", {
      pitch: next === "list" ? 0.9 : next === "board" ? 1 : 1.12,
      gain: 0.4,
    });
    say(
      `${VIEWS.find((v) => v.id === next)?.label ?? next} view, ${list.length} ${list.length === 1 ? "task" : "tasks"}.`,
    );
  };

  const chooseProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (id !== projectId) {
      if (project === undefined) setOwnProject(id);
      onProjectChange?.(id);
      audio.play("click", { pitch: 1.05, gain: 0.4 });
      if (openId) closeDrawer();
    }
    const n = all.filter((t) => t.project === id).length;
    say(`${p.name}, ${n} ${n === 1 ? "task" : "tasks"}.`);
    if (phone) goScreen("project");
  };

  const moveTo = (
    t: TrackerTask,
    to: TrackerStatus,
    via: "pointer" | "keyboard",
  ) => {
    if (t.status === to) return;
    audio.play("click", {
      pitch: 0.9 + 0.1 * STATUSES.findIndex((s) => s.id === to),
      gain: 0.45,
    });
    update(t.id, { status: to }, `${t.title} moved to ${statusName(to)}.`);
    // The card is remade in its new column; focus follows it there.
    if (via === "keyboard") refocus.current = t.id;
  };

  const toggleDone = (t: TrackerTask) => {
    const to: TrackerStatus = t.status === "done" ? "todo" : "done";
    audio.play("click", { pitch: to === "done" ? 1.2 : 0.85, gain: 0.45 });
    update(
      t.id,
      { status: to },
      `${t.title}, ${to === "done" ? "done" : "reopened"}.`,
    );
  };

  const shiftTask = (t: TrackerTask, days: number, which: "both" | "due") => {
    const start = which === "both" ? isoAt(dayOf(t.start) + days) : t.start;
    const due = isoAt(dayOf(t.due) + days);
    audio.play("click", { pitch: 1.1, gain: 0.35 });
    update(
      t.id,
      { start, due },
      `${t.title}, ${short(start)} to ${short(due)}.`,
    );
  };

  const pinProject = (on: boolean) => {
    if (!current) return;
    const next = on
      ? [...pins.filter((x) => x !== current.id), current.id]
      : pins.filter((x) => x !== current.id);
    if (pinned === undefined) setOwnPinned(next);
    onPinnedChange?.(next);
    say(on ? `${current.name} pinned.` : `${current.name} unpinned.`);
  };

  /* -------------------------------- drawer ------------------------------- */

  const shown = useMotionValue(openId ? 1 : 0);
  const [closingId, setClosingId] = React.useState<string | null>(null);
  const [lastOpen, setLastOpen] = React.useState<TrackerTask | null>(open);
  if (open && open !== lastOpen) setLastOpen(open);
  const drawerTask = open ?? (closingId ? lastOpen : null);
  const armed = React.useRef<string | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const [titleNode, setTitleNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  const wantTitle = React.useRef<"focus" | "select" | null>(null);
  const drawerAnim = React.useRef<AnimationPlaybackControls | null>(null);

  const setOpen = (id: string | null) => {
    if (task === undefined) setOwnTask(id);
    onTaskChange?.(id);
  };

  const openTask = (t: TrackerTask, el: HTMLElement | null) => {
    if (disabled) return;
    returnTo.current = el;
    setFocusId(t.id);
    wantTitle.current = "focus";
    if (openId !== t.id) audio.play("swish", { pitch: 1.15, gain: 0.35 });
    setClosingId(null);
    setOpen(t.id);
    say(`${t.title}, ${statusName(t.status)}.`);
  };

  const removeTask = (id: string) => {
    const t = all.find((x) => x.id === id);
    if (!t) return;
    commit(all.filter((x) => x.id !== id));
    onTaskDelete?.(t);
    say(`${t.title} deleted.`);
  };

  const closeDrawer = (velocity?: number) => {
    const id = openId;
    if (!id) return;
    // Closing while the undo window is open throws it away for good.
    if (armed.current === id) {
      armed.current = null;
      removeTask(id);
    }
    audio.play("swish", { pitch: 0.85, gain: 0.3 });
    setClosingId(id);
    setOpen(null);
    const t: Transition = !motionSafe
      ? { duration: durations.fast }
      : velocity !== undefined
        ? { ...springs.glide, velocity }
        : exitFor(durations.slow);
    drawerAnim.current?.stop();
    drawerAnim.current = animate(shown, 0, {
      ...t,
      onComplete: () => setClosingId((c) => (c === id ? null : c)),
    });
    refocus.current = returnTo.current?.isConnected ? returnTo.current : id;
  };

  // The drawer comes in whenever a task is open — by press, key or host.
  React.useEffect(() => {
    if (!openId) return;
    drawerAnim.current?.stop();
    drawerAnim.current = animate(
      shown,
      1,
      motionSafe
        ? springs.glide
        : { duration: durations.base, ease: easings.enter },
    );
  }, [openId, shown, motionSafe]);

  // Focus goes back once the drawer no longer makes the work inert.
  React.useEffect(() => {
    const target = refocus.current;
    if (!target || (openId && modalDrawer)) return;
    refocus.current = null;
    let node: HTMLElement | null | undefined =
      typeof target === "string" ? nodes.current.get(target) : target;
    // A task that was deleted hands focus to the first task left, or to
    // New task when there is none.
    if (!node?.isConnected) {
      node = nodes.current.get(order[0]?.id ?? "") ?? newTaskButton.current;
    }
    node?.focus({ preventScroll: true });
  });

  // On a phone, focus follows the screen that slid in.
  React.useEffect(() => {
    const which = stackFocus.current;
    if (!which) return;
    stackFocus.current = null;
    if (which === "nav") navNodes.current.get(current?.id ?? "")?.focus();
    else headNode.current?.focus({ preventScroll: true });
  });

  // Its title takes focus once the drawer has it.
  React.useEffect(() => {
    if (!titleNode || !wantTitle.current) return;
    const how = wantTitle.current;
    wantTitle.current = null;
    titleNode.focus({ preventScroll: true });
    if (how === "select") titleNode.select();
  }, [titleNode, openId]);

  const newTask = (el: HTMLElement) => {
    if (disabled || !current) return;
    const n = all.filter((t) => t.project === current.id).length + 1;
    let id = `${current.key.toLowerCase()}-${n}`;
    for (let k = n; all.some((t) => t.id === id); k += 1)
      id = `${current.key.toLowerCase()}-${k + 1}`;
    const t: TrackerTask = {
      id,
      project: current.id,
      title: "Untitled task",
      status: "todo",
      priority: "medium",
      start: isoAt(today),
      due: isoAt(today + 2),
      subtasks: [],
      watchers: 0,
      watching: true,
    };
    commit([...all, t]);
    onTaskCreate?.(t);
    returnTo.current = el;
    wantTitle.current = "select";
    setClosingId(null);
    setOpen(id);
    audio.play("swish", { pitch: 1.15, gain: 0.35 });
    say(`New task in ${statusName("todo")}. Type its title.`);
  };

  const pushPad = useTransform(shown, (s) =>
    pushing ? Math.round(clamp(s, 0, 1) * drawerW) : 0,
  );
  const scrim = useTransform(shown, (s) =>
    pushing ? 0 : r2(clamp(s, 0, 1) * 0.32),
  );

  /* ------------------------------- render -------------------------------- */

  const morphProps = { uid, arrangement, motionSafe };
  const [over, setOver] = React.useState<TrackerStatus | null>(null);

  const axisStart = today - 7;
  const axisEnd = today + 20;
  const days = axisEnd - axisStart + 1;
  const dayW = d.day;
  const labelW = phone ? 112 : 168;
  const [timelineNode, setTimelineNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  React.useEffect(() => {
    // Today sits a few days in, so the week behind it still shows.
    timelineNode?.scrollTo({
      left: Math.max(0, (today - axisStart - 3) * dayW),
    });
  }, [timelineNode, today, axisStart, dayW]);

  const doneCount = list.filter((t) => t.status === "done").length;
  const pinnedProjects = projects.filter((p) => pins.includes(p.id));
  const restProjects = projects.filter((p) => !pins.includes(p.id));
  const navOrder = [...pinnedProjects, ...restProjects];
  const [navFocus, setNavFocus] = React.useState<string | null>(null);
  const navTab =
    navFocus && navOrder.some((p) => p.id === navFocus)
      ? navFocus
      : (current?.id ?? null);

  const projectRow = (p: TrackerProject) => {
    const on = p.id === current?.id;
    const openCount = all.filter(
      (t) => t.project === p.id && t.status !== "done",
    ).length;
    const turn = (hash(p.id) % 12) * 30;
    return (
      <motion.li
        key={p.id}
        layoutId={`${uid}-nav-${p.id}`}
        transition={
          motionSafe ? { layout: springs.glide } : { layout: { duration: 0 } }
        }
      >
        <button
          ref={(node) => {
            if (node) navNodes.current.set(p.id, node);
            else navNodes.current.delete(p.id);
          }}
          type="button"
          aria-current={on ? "page" : undefined}
          tabIndex={navTab === p.id ? 0 : -1}
          disabled={disabled}
          onFocus={() => setNavFocus(p.id)}
          onClick={() => chooseProject(p.id)}
          onKeyDown={(event) => {
            const i = navOrder.findIndex((x) => x.id === p.id);
            const to =
              event.key === "ArrowDown"
                ? navOrder[i + 1]
                : event.key === "ArrowUp"
                  ? navOrder[i - 1]
                  : event.key === "Home"
                    ? navOrder[0]
                    : event.key === "End"
                      ? navOrder[navOrder.length - 1]
                      : undefined;
            if (!to) return;
            event.preventDefault();
            setNavFocus(to.id);
            navNodes.current.get(to.id)?.focus();
          }}
          className={cn(
            "relative flex h-9 w-full items-center gap-2.5 rounded-2 px-2.5 text-left text-[13px] transition-colors",
            on
              ? "text-foreground"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
        >
          {on ? (
            <motion.span
              layoutId={`${uid}-nav-pill`}
              aria-hidden
              className="absolute inset-0 rounded-2 bg-cobalt-wash"
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ) : null}
          <span
            aria-hidden
            className="relative size-2 shrink-0 rounded-full"
            style={{
              background: `oklch(from var(--accent-bright) 0.64 0.14 calc(h + ${turn}))`,
            }}
          />
          <span className="relative min-w-0 flex-1 truncate font-medium">
            {p.name}
          </span>
          <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
            {openCount}
          </span>
        </button>
      </motion.li>
    );
  };

  const nav = (
    <nav aria-label="Projects" className="flex flex-col gap-4 px-2 py-3">
      {pinnedProjects.length ? (
        <div>
          <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Pinned
          </p>
          <ul className="flex flex-col gap-0.5">
            {pinnedProjects.map(projectRow)}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {pinnedProjects.length ? "Projects" : "All projects"}
        </p>
        <ul className="flex flex-col gap-0.5">
          {restProjects.map(projectRow)}
        </ul>
      </div>
    </nav>
  );

  const opener = (t: TrackerTask) => (el: HTMLElement) => openTask(t, el);

  const listView = (
    <motion.div
      layoutScroll
      className="absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pt-1 pb-6"
    >
      {STATUSES.map((s, si) => {
        const rows = columnsOf[si] ?? [];
        return (
          <section
            key={s.id}
            aria-labelledby={`${uid}-g-${s.id}`}
            className="mt-3 first:mt-1"
          >
            <h3
              id={`${uid}-g-${s.id}`}
              className="flex h-7 items-center gap-2 px-1 text-[11px] font-semibold text-ink-2"
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: pigment(s.id, 1) }}
              />
              {s.label}
              <span className="font-mono font-normal text-ink-3 tabular-nums">
                {rows.length}
              </span>
            </h3>
            {rows.length === 0 ? (
              <p className="px-1 pb-1 text-[11px] text-ink-3">Nothing here.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((t) => {
                  const person = personOf(t.assignee);
                  const done = t.status === "done";
                  return (
                    <li
                      key={t.id}
                      className="relative flex items-center"
                      style={{ height: d.row }}
                    >
                      <Plate
                        {...morphProps}
                        id={t.id}
                        className="border border-hairline bg-card"
                      />
                      <Rider
                        {...morphProps}
                        id={t.id}
                        part="check"
                        className="relative ml-2 shrink-0"
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          aria-label={`Done: ${t.title}`}
                          tabIndex={-1}
                          disabled={disabled}
                          onClick={() => toggleDone(t)}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full",
                            FOCUS,
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-4 items-center justify-center rounded-full border transition-colors",
                              done
                                ? "border-success bg-success text-background"
                                : "border-hairline-strong",
                            )}
                          >
                            {done ? (
                              <Check className="size-3" strokeWidth={3} />
                            ) : null}
                          </span>
                        </button>
                      </Rider>
                      <button
                        ref={bind(t.id)}
                        type="button"
                        tabIndex={tabId === t.id ? 0 : -1}
                        disabled={disabled}
                        aria-label={`${t.title}, ${statusName(t.status)}, ${person?.name ?? "unassigned"}, due ${relative(t.due, today)}`}
                        aria-describedby={`${uid}-list-hint`}
                        onFocus={() => setFocusId(t.id)}
                        onKeyDown={(event) => navKey(event, t)}
                        onClick={(event) => openTask(t, event.currentTarget)}
                        className={cn(
                          "relative flex h-full min-w-0 flex-1 items-center gap-3 rounded-2 pr-3 pl-1.5 text-left hover:bg-surface-2/60",
                          FOCUS_IN,
                        )}
                      >
                        <Title
                          {...morphProps}
                          id={t.id}
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            d.text,
                            done && "text-ink-3 line-through",
                          )}
                        >
                          {t.title}
                        </Title>
                        <Rider
                          {...morphProps}
                          id={t.id}
                          part="row-meta"
                          className="flex shrink-0 items-center gap-3"
                        >
                          {t.tag && mainW >= 520 ? (
                            <span className="rounded-1 bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">
                              {t.tag}
                            </span>
                          ) : null}
                          {desk ? (
                            <span className="w-14 text-[11px] text-ink-3 capitalize">
                              {t.priority}
                            </span>
                          ) : null}
                          <Due task={t} today={today} />
                          <Face person={person} />
                        </Rider>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </motion.div>
  );

  const boardView = (
    <motion.div
      layoutScroll
      data-tracker-board=""
      className={cn(
        "absolute inset-0 flex [scrollbar-width:thin] gap-2 overflow-auto overscroll-contain px-3 pt-2 pb-6",
        mainW < 520 && "snap-x snap-mandatory",
      )}
    >
      {STATUSES.map((s, si) => {
        const cells = columnsOf[si] ?? [];
        return (
          <section
            key={s.id}
            data-tracker-column={s.id}
            aria-labelledby={`${uid}-c-${s.id}`}
            className={cn(
              "flex shrink-0 flex-col gap-1.5 self-start rounded-3 p-1.5 transition-colors",
              over === s.id
                ? "bg-cobalt-wash outline-1 outline-cobalt-bright/40 outline-dashed"
                : "bg-surface-2/50",
              mainW < 520
                ? "w-[78%] snap-start"
                : mainW < 720
                  ? "min-w-[132px] flex-1"
                  : "min-w-[172px] flex-1",
            )}
          >
            <h3
              id={`${uid}-c-${s.id}`}
              className="flex h-7 items-center gap-2 px-1 text-[11px] font-semibold text-ink-2"
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: pigment(s.id, 1) }}
              />
              {s.label}
              <span className="font-mono font-normal text-ink-3 tabular-nums">
                {cells.length}
              </span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {cells.map((t) => (
                <BoardCard
                  key={t.id}
                  {...morphProps}
                  id={t.id}
                  task={t}
                  person={personOf(t.assignee)}
                  today={today}
                  d={d}
                  focusable={tabId === t.id}
                  disabled={disabled}
                  bind={bind(t.id)}
                  onOver={setOver}
                  onDrop={(to) => moveTo(t, to, "pointer")}
                  onOpen={opener(t)}
                  onKey={(event) => navKey(event, t)}
                  onFocus={() => setFocusId(t.id)}
                />
              ))}
              {cells.length === 0 ? (
                <li className="flex h-14 list-none items-center justify-center rounded-2 border border-dashed border-hairline-strong text-[11px] text-ink-3">
                  Drop here
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </motion.div>
  );

  const timelineView = (
    <motion.div
      layoutScroll
      ref={setTimelineNode}
      className="absolute inset-0 [scrollbar-width:thin] overflow-auto overscroll-contain pb-4"
    >
      <div className="relative" style={{ width: labelW + days * dayW }}>
        <div className="sticky top-0 z-30 flex h-10 border-b border-hairline bg-background">
          <div
            className="sticky left-0 z-10 flex shrink-0 items-end bg-background px-3 pb-1.5 text-[11px] font-semibold text-ink-2"
            style={{ width: labelW }}
          >
            Task
          </div>
          {Array.from({ length: days }, (_, i) => {
            const n = axisStart + i;
            const date = new Date(n * DAY);
            const dow = date.getUTCDay();
            const first = date.getUTCDate() === 1 || i === 0;
            return (
              <div
                key={n}
                aria-hidden
                className={cn(
                  "relative flex shrink-0 flex-col items-center justify-end pb-1 font-mono text-[10px] tabular-nums",
                  n === today
                    ? "text-cobalt-bright"
                    : dow === 0 || dow === 6
                      ? "text-ink-3/70"
                      : "text-ink-3",
                )}
                style={{ width: dayW }}
              >
                {first ? (
                  <span className="absolute top-0.5 left-1 text-[9px] font-semibold tracking-[0.06em] text-ink-2 uppercase">
                    {MONTHS[date.getUTCMonth()]}
                  </span>
                ) : null}
                <span className="text-[8px] leading-none">{WEEK[dow]}</span>
                <span className="leading-tight">{date.getUTCDate()}</span>
              </div>
            );
          })}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute top-10 bottom-0 z-[5] w-px bg-cobalt-bright"
          style={{ left: labelW + (today - axisStart) * dayW + dayW / 2 }}
        />
        <ul aria-label="Tasks on the timeline">
          {order.map((t) => (
            <li
              key={t.id}
              className="relative flex border-b border-hairline/60"
              style={{ height: d.row + 6 }}
            >
              <div
                className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-hairline bg-background px-3"
                style={{ width: labelW }}
              >
                <Rider
                  {...morphProps}
                  id={t.id}
                  part="tl-face"
                  className="shrink-0"
                >
                  <Face person={personOf(t.assignee)} size={18} />
                </Rider>
                <Title
                  {...morphProps}
                  id={t.id}
                  className={cn("min-w-0 flex-1 truncate", d.text)}
                >
                  {t.title}
                </Title>
              </div>
              <div className="relative shrink-0" style={{ width: days * dayW }}>
                {Array.from({ length: days }, (_, i) => {
                  const dow = new Date((axisStart + i) * DAY).getUTCDay();
                  return dow === 0 || dow === 6 ? (
                    <span
                      key={i}
                      aria-hidden
                      className="absolute inset-y-0 bg-surface-2/50"
                      style={{ left: i * dayW, width: dayW }}
                    />
                  ) : null;
                })}
                <TimelineBar
                  {...morphProps}
                  id={t.id}
                  task={t}
                  axisStart={axisStart}
                  axisEnd={axisEnd}
                  dayW={dayW}
                  rowH={d.row + 6}
                  focusable={tabId === t.id}
                  disabled={disabled}
                  bind={bind(t.id)}
                  onShift={(n, which) => shiftTask(t, n, which)}
                  onOpen={opener(t)}
                  onKey={(event) => navKey(event, t)}
                  onFocus={() => setFocusId(t.id)}
                  onTick={() => audio.play("click", { pitch: 1.4, gain: 0.2 })}
                  first={order[0]?.id === t.id}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );

  const body =
    status === "loading" ? (
      <div
        aria-busy="true"
        aria-label="Loading tasks"
        className="absolute inset-0 flex flex-col gap-1.5 px-3 pt-3"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden
            className="block rounded-2 bg-surface-2"
            style={{ height: d.row, opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 overflow-auto px-6 text-center">
        <p className="text-sm font-medium">Tasks didn&rsquo;t load</p>
        <p className="text-xs text-ink-3">
          Nothing was lost. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : list.length === 0 ? (
      <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 overflow-auto px-6 text-center">
        <p className="text-sm font-medium">No tasks yet</p>
        <p className="text-xs text-ink-3">
          Add the first one and it shows up in every view.
        </p>
        <button
          type="button"
          onClick={(event) => newTask(event.currentTarget)}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90",
            FOCUS,
          )}
        >
          <Plus aria-hidden className="size-3.5" />
          New task
        </button>
      </div>
    ) : (
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={`${current?.id}`}
          className="absolute inset-0"
          initial={
            motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{
            y: springs.glide,
            opacity: { duration: durations.base, ease: easings.enter },
          }}
        >
          <motion.div
            key={motionSafe ? "views" : shownView}
            className="absolute inset-0"
            initial={motionSafe ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base }}
          >
            {shownView === "list"
              ? listView
              : shownView === "board"
                ? boardView
                : timelineView}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );

  const header = (
    <header className="@container/head flex shrink-0 flex-col gap-2 border-b border-hairline px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goScreen("projects")}
          aria-label="Projects"
          className={cn(
            "-ml-1 inline-flex h-9 shrink-0 items-center gap-0.5 rounded-2 pr-1 pl-1 text-[13px] text-cobalt-bright hover:bg-cobalt-wash @min-[360px]/head:pr-2 @min-[640px]/tracker:hidden",
            FOCUS,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
          <span className="hidden @min-[360px]/head:inline">Projects</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2
            ref={headNode}
            tabIndex={-1}
            className="truncate text-sm font-semibold outline-none"
          >
            {current?.name ?? "Project"}
          </h2>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {list.length} {list.length === 1 ? "task" : "tasks"} · {doneCount}{" "}
            done
          </p>
        </div>
        {current ? (
          <PinPress
            compact
            size="sm"
            name={`Pin ${current.name}`}
            pressed={pins.includes(current.id)}
            onPressedChange={pinProject}
            sound={sound}
            disabled={disabled}
          />
        ) : null}
        <button
          ref={newTaskButton}
          type="button"
          disabled={disabled || !current}
          onClick={(event) => newTask(event.currentTarget)}
          aria-label="New task"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
            FOCUS,
          )}
        >
          <Plus aria-hidden className="size-4" />
          <span className="hidden @min-[420px]/head:inline">New task</span>
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label="View"
        className="flex h-8 w-fit items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
      >
        {VIEWS.map((v, i) => {
          const on = v.id === shownView;
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={v.label}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => chooseView(v.id)}
              onKeyDown={(event) =>
                roveRadio(event, i, VIEWS.length, (to) => {
                  const next = VIEWS[to];
                  if (next) chooseView(next.id);
                })
              }
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors",
                on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                FOCUS,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-view`}
                  aria-hidden
                  className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <Icon aria-hidden className="relative size-3.5" />
              <span className="relative hidden @min-[360px]/head:inline">
                {v.label}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );

  const hints = (
    <>
      <p id={`${uid}-list-hint`} className="sr-only">
        Up and Down move between tasks, Space marks a task done, Enter opens it.
      </p>
      <p id={`${uid}-board-hint`} className="sr-only">
        Arrow keys move between cards, Shift with Left or Right moves the card
        to the next column, Enter opens it.
      </p>
      <p id={`${uid}-timeline-hint`} className="sr-only">
        Left and Right move the task a day, Shift with Left or Right changes its
        due date, Up and Down move between tasks, Enter opens it.
      </p>
    </>
  );

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      className={cn(
        "@container/tracker relative isolate flex h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        disabled && "opacity-60",
        className,
      )}
      inert={disabled}
    >
      {hints}
      {/* Sidebar: a column from 640px, a screen of its own below. */}
      <motion.aside
        className={cn(
          "absolute inset-y-0 left-0 z-0 w-full overflow-y-auto overscroll-contain border-r border-hairline bg-surface-1 @min-[640px]/tracker:relative @min-[640px]/tracker:w-[184px] @min-[640px]/tracker:shrink-0 @min-[1024px]/tracker:w-[216px]",
        )}
        style={{
          x: projectsX,
          visibility:
            phone && parked && screen === "project" ? "hidden" : "visible",
        }}
        inert={(phone && screen === "project") || (!!openId && modalDrawer)}
      >
        <div className="flex h-12 items-center gap-2 border-b border-hairline px-4">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-2 bg-primary text-[11px] font-bold text-primary-foreground"
          >
            F
          </span>
          <span className="truncate text-sm font-semibold">Fernworks</span>
        </div>
        {nav}
      </motion.aside>

      <motion.div
        className="absolute inset-0 z-10 flex flex-col bg-background @min-[640px]/tracker:relative @min-[640px]/tracker:z-0 @min-[640px]/tracker:min-w-0 @min-[640px]/tracker:flex-1"
        style={{ x: projectX, opacity: stackFade }}
        inert={phone && screen === "projects"}
      >
        <div inert={!!openId && modalDrawer} className="contents">
          {header}
        </div>
        <div className="relative flex-1 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ right: pushPad }}
            inert={!!openId && modalDrawer}
          >
            {body}
          </motion.div>
          {drawerTask && !pushing ? (
            <motion.div
              aria-hidden
              className="absolute inset-0 z-30 bg-black"
              style={{ opacity: scrim }}
              onPointerDown={() => closeDrawer()}
            />
          ) : null}
          {drawerTask ? (
            <Drawer
              key={drawerTask.id}
              task={drawerTask}
              project={projects.find((p) => p.id === drawerTask.project)}
              people={people}
              look={look}
              phone={phone}
              width={drawerW}
              today={today}
              motionSafe={motionSafe}
              sound={sound}
              disabled={disabled || !open}
              closing={!open}
              shown={shown}
              onUpdate={(patch, sentence) => {
                if (patch.status && patch.status !== drawerTask.status) {
                  audio.play("click", { pitch: 1, gain: 0.4 });
                }
                update(drawerTask.id, patch, sentence);
              }}
              onClose={closeDrawer}
              onArmed={(on) => {
                armed.current = on
                  ? drawerTask.id
                  : armed.current === drawerTask.id
                    ? null
                    : armed.current;
              }}
              onDelete={() => {
                // A window that ran out after the drawer closed was
                // already honoured by the close.
                const id = drawerTask.id;
                if (armed.current !== id) return;
                armed.current = null;
                closeDrawer();
                removeTask(id);
              }}
              bindTitle={setTitleNode}
            />
          ) : null}
        </div>
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
