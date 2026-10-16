"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  Database,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  User,
  Users,
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
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type SpokeQuestion =
  | {
      kind: "text";
      id: string;
      label: string;
      placeholder?: string;
      /** Must not be left empty. A string is what Next says when it is. */
      required?: boolean | string;
      hint?: string;
    }
  | { kind: "choice"; id: string; label: string; options: string[] }
  | { kind: "toggle"; id: string; label: string; hint?: string };

export type SpokeIcon =
  "profile" | "team" | "billing" | "data" | "alerts" | "security";

export type SpokeTask = {
  id: string;
  title: string;
  icon: SpokeIcon;
  /** What the task is, in a few words. */
  blurb: string;
  /** One to three questions, asked one at a time. */
  questions: SpokeQuestion[];
};

/** Answers by task id, then by question id. */
export type SpokeAnswers = Record<string, Record<string, string | boolean>>;

export type SpokeRingStyle = "gapped" | "solid" | "ticks";
export type SpokeWizardStatus = "ready" | "loading" | "error";

export type SpokeWizardProps = {
  /** The tasks around the hub, clockwise from twelve o'clock. @default defaultSpokeTasks (six) */
  tasks?: SpokeTask[];
  /** How many of the tasks are on the hub, 3 to 6. @default 5 */
  spokeCount?: number;
  /** Controlled finished task ids. */
  completed?: string[];
  /** Finished task ids when uncontrolled. @default [] */
  defaultCompleted?: string[];
  /** Fires from the Finish press that completed a task, with every finished id. */
  onCompletedChange?: (ids: string[]) => void;
  /** Answers already given, by task and question. @default {} */
  defaultAnswers?: SpokeAnswers;
  /** Fires from the Finish press, with that task's answers. */
  onTaskComplete?: (
    taskId: string,
    answers: Record<string, string | boolean>,
  ) => void;
  /** Fires from the press that finished the last task, with every answer. */
  onFinish?: (answers: SpokeAnswers) => void;
  /** The Ready state's Open workspace button was pressed. */
  onLaunch?: () => void;
  /** Fires when a spoke's flow opens, moves to another question, or closes (null). */
  onOpenChange?: (taskId: string | null, question: number) => void;
  /** The ring's drawing: segments with gaps, one solid track, or a ring of ticks. @default "gapped" */
  ringStyle?: SpokeRingStyle;
  /** Filled segments, finished spokes, focus and primary buttons. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The workspace being set up, in the hub. @default "Fernworks" */
  workspace?: string;
  /** The heading. @default "Set up your workspace" */
  title?: string;
  /** The Ready state's button. @default "Open workspace" */
  launchLabel?: string;
  /** Whether the tasks have loaded. @default "ready" */
  status?: SpokeWizardStatus;
  /** Try again was pressed after the tasks failed to load. */
  onReload?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultSpokeTasks: SpokeTask[] = [
  {
    id: "profile",
    title: "Profile",
    icon: "profile",
    blurb: "Name and time zone",
    questions: [
      {
        kind: "text",
        id: "name",
        label: "Workspace name",
        placeholder: "Fernworks",
        required: "Name the workspace to go on.",
        hint: "People see this in invites and on invoices.",
      },
      {
        kind: "choice",
        id: "zone",
        label: "Time zone",
        options: ["Europe/Lisbon", "America/Halifax", "Asia/Singapore"],
      },
    ],
  },
  {
    id: "team",
    title: "Team",
    icon: "team",
    blurb: "Invite your people",
    questions: [
      {
        kind: "text",
        id: "invites",
        label: "Invite by email",
        placeholder: "ana@fernworks.example, li@fernworks.example",
        hint: "Separate addresses with commas. You can skip this.",
      },
      {
        kind: "choice",
        id: "role",
        label: "They join as",
        options: ["Member", "Admin", "Viewer"],
      },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    icon: "billing",
    blurb: "Plan and invoices",
    questions: [
      {
        kind: "choice",
        id: "plan",
        label: "Plan",
        options: ["Starter", "Team", "Scale"],
      },
      {
        kind: "text",
        id: "email",
        label: "Invoices go to",
        placeholder: "accounts@fernworks.example",
        required: "Add an address for invoices to go on.",
      },
    ],
  },
  {
    id: "data",
    title: "Data",
    icon: "data",
    blurb: "Bring your data in",
    questions: [
      {
        kind: "choice",
        id: "source",
        label: "Start from",
        options: ["Upload a CSV", "Connect a warehouse", "Start empty"],
      },
      {
        kind: "choice",
        id: "keep",
        label: "Keep raw events for",
        options: ["30 days", "90 days", "1 year"],
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    icon: "alerts",
    blurb: "Where we reach you",
    questions: [
      {
        kind: "choice",
        id: "channel",
        label: "Send alerts by",
        options: ["Email", "Chat", "Pager"],
      },
      {
        kind: "toggle",
        id: "quiet",
        label: "Quiet hours",
        hint: "Hold anything that is not urgent from 22:00 to 07:00.",
      },
    ],
  },
  {
    id: "security",
    title: "Security",
    icon: "security",
    blurb: "Sign-in rules",
    questions: [
      {
        kind: "toggle",
        id: "twoStep",
        label: "Require two-step sign-in",
        hint: "For everyone in the workspace.",
      },
      {
        kind: "choice",
        id: "session",
        label: "Sessions last",
        options: ["8 hours", "24 hours", "7 days"],
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const EMPTY_IDS: string[] = [];
const EMPTY_ANSWERS: SpokeAnswers = {};

const ICONS: Record<SpokeIcon, typeof User> = {
  profile: User,
  team: Users,
  billing: CreditCard,
  data: Database,
  alerts: Bell,
  security: ShieldCheck,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const HAS_FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2";

/** The hub's drawing box; nodes are placed by percentage of it. */
const VB = { w: 680, h: 380, cx: 340, cy: 190, r: 74, rx: 238, ry: 140 };

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Spoke i of n, clockwise from twelve o'clock, in degrees. */
const angleOf = (i: number, n: number) => -90 + (i * 360) / Math.max(1, n);

const pointAt = (cx: number, cy: number, r: number, deg: number) => ({
  x: r3(cx + r * Math.cos(rad(deg))),
  y: r3(cy + r * Math.sin(rad(deg))),
});

/** A circular arc, clockwise from a0 to a1 degrees; empty when it has no length. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  if (a1 - a0 < 0.05) return "";
  const s = pointAt(cx, cy, r, a0);
  const e = pointAt(cx, cy, r, Math.min(a1, a0 + 359.9));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/** A wedge from the centre, for clipping ticks as a segment fills. */
function sectorPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  if (a1 - a0 < 0.05) return "";
  const arc = arcPath(cx, cy, r, a0, a1);
  return `M ${r3(cx)} ${r3(cy)} L ${arc.slice(2)} Z`;
}

const summaryOf = (
  task: SpokeTask,
  given: Record<string, string | boolean> | undefined,
) => {
  if (!given) return null;
  const parts = task.questions
    .map((q) => {
      const v = given[q.id];
      if (v === undefined || v === "") return null;
      if (typeof v === "boolean") return v ? q.label : null;
      return v;
    })
    .filter((v): v is string => Boolean(v));
  return parts.length ? parts.slice(0, 2).join(" · ") : "Done";
};

/* ----------------------------------------------------------------------- */
/*                                  The ring                                */
/* ----------------------------------------------------------------------- */

/**
 * One task's share of the ring. Its fill is a single progress value on
 * `springs.glide`; the arc (or, for ticks, the wedge that uncovers lit
 * ticks) is rebuilt from it, so the fill sweeps from the segment's start.
 */
function Segment({
  index,
  count,
  done,
  gap,
  ringStyle,
  cx,
  cy,
  r,
  width,
  motionSafe,
  clipId,
}: {
  index: number;
  count: number;
  done: boolean;
  gap: MotionValue<number>;
  ringStyle: SpokeRingStyle;
  cx: number;
  cy: number;
  r: number;
  width: number;
  motionSafe: boolean;
  clipId: string;
}) {
  const p = useMotionValue(done ? 1 : 0);
  React.useEffect(() => {
    const to = done ? 1 : 0;
    if (p.get() === to) return;
    const run = animate(
      p,
      to,
      motionSafe
        ? { ...springs.glide, delay: done ? 0.24 : 0 }
        : { duration: durations.fast, ease: easings.enter },
    );
    return () => run.stop();
  }, [done, motionSafe, p]);

  const half = 180 / Math.max(1, count);
  const mid = angleOf(index, count);
  const fill = useTransform([p, gap] as MotionValue<number>[], ([pv, gv]) => {
    const g = Number(gv ?? 0);
    const a0 = mid - half + g;
    const a1 = mid + half - g;
    return arcPath(cx, cy, r, a0, a0 + (a1 - a0) * Number(pv ?? 0));
  });
  const wedge = useTransform(p, (pv) =>
    sectorPath(cx, cy, r + width, mid - half, mid - half + 2 * half * pv),
  );
  // A gapped segment's track: its whole share minus the gap at each end.
  const track = useTransform(gap, (g) =>
    arcPath(cx, cy, r, mid - half + g, mid + half - g),
  );

  if (ringStyle === "ticks") {
    const per = Math.max(4, Math.round(48 / Math.max(1, count)));
    const ticks = Array.from(
      { length: per },
      (_, t) => mid - half + ((t + 0.5) * 2 * half) / per,
    );
    const tick = (a: number, key: number, className: string) => {
      const a0 = pointAt(cx, cy, r - width * 0.55, a);
      const a1 = pointAt(cx, cy, r + width * 0.55, a);
      return (
        <line
          key={key}
          x1={a0.x}
          y1={a0.y}
          x2={a1.x}
          y2={a1.y}
          strokeWidth={Math.max(1.5, width * 0.22)}
          strokeLinecap="round"
          className={className}
        />
      );
    };
    return (
      <g>
        <defs>
          <clipPath id={clipId}>
            <motion.path d={wedge} />
          </clipPath>
        </defs>
        {ticks.map((a, k) => tick(a, k, "stroke-(--sw-track)"))}
        <g clipPath={`url(#${clipId})`}>
          {ticks.map((a, k) => tick(a, k, "stroke-(--sw-accent)"))}
        </g>
      </g>
    );
  }

  return (
    <g>
      {ringStyle === "gapped" ? (
        <motion.path
          d={track}
          fill="none"
          className="stroke-(--sw-track)"
          strokeWidth={width}
          strokeLinecap="round"
        />
      ) : null}
      <motion.path
        d={fill}
        fill="none"
        className="stroke-(--sw-accent)"
        strokeWidth={width}
        strokeLinecap={ringStyle === "gapped" ? "round" : "butt"}
      />
    </g>
  );
}

function Ring({
  tasks,
  done,
  ready,
  ringStyle,
  size,
  motionSafe,
  idBase,
}: {
  tasks: SpokeTask[];
  done: Set<string>;
  ready: boolean;
  ringStyle: SpokeRingStyle;
  size: "hub" | "mini";
  motionSafe: boolean;
  idBase: string;
}) {
  const hub = size === "hub";
  const cx = hub ? VB.cx : 24;
  const cy = hub ? VB.cy : 24;
  const r = hub ? VB.r : 18;
  const width = hub ? 10 : 5;
  const baseGap = ringStyle === "gapped" ? (hub ? 5 : 8) : 0;
  // The gaps close into one ring when every task is done.
  const gap = useMotionValue(ready ? 0 : baseGap);
  React.useEffect(() => {
    const to = ready ? 0 : baseGap;
    if (gap.get() === to) return;
    const run = animate(
      gap,
      to,
      motionSafe
        ? { ...springs.glide, delay: ready ? 0.5 : 0 }
        : { duration: durations.fast },
    );
    return () => run.stop();
  }, [ready, baseGap, motionSafe, gap]);

  return (
    <g>
      {ringStyle === "solid" ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="stroke-(--sw-track)"
          strokeWidth={width}
        />
      ) : null}
      {tasks.map((t, i) => (
        <Segment
          key={`${t.id}-${ringStyle}-${tasks.length}`}
          index={i}
          count={tasks.length}
          done={done.has(t.id)}
          gap={gap}
          ringStyle={ringStyle}
          cx={cx}
          cy={cy}
          r={r}
          width={width}
          motionSafe={motionSafe}
          clipId={`${idBase}-${size}-${i}`}
        />
      ))}
    </g>
  );
}

/** Digits that roll toward the way the count moved. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-grid overflow-clip tabular-nums"
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="[grid-area:1/1]"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${d * 70}%` : 0,
            }),
            shown: { opacity: 1, y: "0%" },
            // The old count leaves as the new one arrives, both waiting
            // for the segment to start filling.
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${-d * 70}%` : 0,
              transition: {
                ...exitFor(durations.fast),
                delay: motionSafe ? 0.3 : 0,
              },
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? {
                  y: { ...springs.snap, delay: 0.3 },
                  opacity: { duration: durations.fast, delay: 0.3 },
                }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The flow                                */
/* ----------------------------------------------------------------------- */

function SpokeFlow({
  task,
  question,
  draft,
  error,
  dir,
  from,
  motionSafe,
  uid,
  onAnswer,
  onBack,
  onNext,
  onClose,
  onPanel,
}: {
  task: SpokeTask;
  question: number;
  draft: Record<string, string | boolean>;
  error: string | null;
  dir: number;
  from: { x: number; y: number };
  motionSafe: boolean;
  uid: string;
  onAnswer: (id: string, value: string | boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  onPanel: (node: HTMLFormElement | null) => void;
}) {
  const q = task.questions[question];
  const Icon = ICONS[task.icon] ?? User;
  const last = question >= task.questions.length - 1;
  const fieldId = `${uid}-field`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;
  const headId = `${uid}-flow-title`;

  const field = !q ? null : q.kind === "text" ? (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[13px] font-medium text-foreground"
      >
        {q.label}
        {q.required ? <span className="text-ink-3"> (required)</span> : null}
      </label>
      <input
        id={fieldId}
        data-sw-first={question}
        type="text"
        value={typeof draft[q.id] === "string" ? (draft[q.id] as string) : ""}
        placeholder={q.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [q.hint ? hintId : "", error ? errorId : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => {
          const v = event.currentTarget.value;
          onAnswer(q.id, v);
        }}
        className={cn(
          "h-9 w-full rounded-2 border bg-card px-3 text-[13px] text-foreground placeholder:text-ink-3",
          error
            ? "border-danger"
            : "border-input focus-visible:border-(--sw-accent)",
          FOCUS_RING,
        )}
      />
      {q.hint ? (
        <p id={hintId} className="text-[12px] leading-4 text-ink-3">
          {q.hint}
        </p>
      ) : null}
    </div>
  ) : q.kind === "choice" ? (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-medium text-foreground">
        {q.label}
      </legend>
      <div className="flex flex-col gap-1.5 @min-[30rem]/spoke-wizard:flex-row @min-[30rem]/spoke-wizard:flex-wrap">
        {q.options.map((opt, i) => {
          const on = (draft[q.id] ?? q.options[0]) === opt;
          return (
            <label
              key={opt}
              className={cn(
                "relative flex h-9 cursor-pointer items-center gap-2 rounded-2 border px-3 text-[13px] transition-colors",
                on
                  ? "border-(--sw-accent) bg-[color-mix(in_oklab,var(--sw-accent)_9%,transparent)] text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                HAS_FOCUS,
              )}
            >
              <input
                type="radio"
                name={`${uid}-${q.id}`}
                value={opt}
                checked={on}
                data-sw-first={i === 0 ? question : undefined}
                onChange={() => onAnswer(q.id, opt)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  on ? "border-(--sw-accent)" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-1.5 rounded-full bg-(--sw-accent)"
                  initial={false}
                  animate={{ scale: on ? 1 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              {opt}
            </label>
          );
        })}
      </div>
    </fieldset>
  ) : (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p
          id={`${fieldId}-label`}
          className="text-[13px] font-medium text-foreground"
        >
          {q.label}
        </p>
        {q.hint ? (
          <p id={hintId} className="mt-0.5 text-[12px] leading-4 text-ink-3">
            {q.hint}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        data-sw-first={question}
        aria-checked={draft[q.id] === true}
        aria-labelledby={`${fieldId}-label`}
        aria-describedby={q.hint ? hintId : undefined}
        onClick={() => onAnswer(q.id, draft[q.id] !== true)}
        onKeyDown={(event) => {
          // Space toggles; Enter moves on, as it does on every question.
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
          draft[q.id] === true
            ? "bg-(--sw-fill)"
            : "bg-surface-2 ring-1 ring-hairline-strong",
          FOCUS_RING,
        )}
      >
        <motion.span
          className="absolute left-0.5 size-5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
          initial={false}
          animate={{ x: draft[q.id] === true ? 16 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </button>
    </div>
  );

  return (
    <motion.form
      ref={onPanel}
      aria-labelledby={headId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="flex w-full max-w-[28rem] flex-col gap-4 justify-self-center rounded-4 border border-hairline-strong bg-card p-4 shadow-[0_12px_32px_color-mix(in_oklab,black_12%,transparent)] @min-[30rem]/spoke-wizard:p-5"
      initial={{
        opacity: 0,
        x: motionSafe ? from.x : 0,
        y: motionSafe ? from.y : 0,
        scale: motionSafe ? 0.96 : 1,
      }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: motionSafe ? from.x : 0,
        y: motionSafe ? from.y : 0,
        scale: motionSafe ? 0.94 : 1,
        transition: exitFor(durations.base),
      }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        default: motionSafe ? springs.glide : { duration: 0 },
      }}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the hub"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
        </button>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--sw-accent)_13%,transparent)] text-(--sw-accent)"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headId}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {task.title}
          </h3>
          <p className="text-[12px] leading-4 text-ink-3 tabular-nums">
            Question {question + 1} of {task.questions.length}
          </p>
        </div>
        <span aria-hidden className="flex items-center gap-1">
          {task.questions.map((_, i) => (
            <motion.span
              key={i}
              className={cn(
                "h-1.5 rounded-full",
                i <= question ? "bg-(--sw-accent)" : "bg-surface-2",
              )}
              initial={false}
              animate={{ width: i === question ? 16 : 6 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ))}
        </span>
      </div>
      <div className="grid [grid-template-areas:'q']">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={question}
            custom={dir}
            className="min-w-0 [grid-area:q]"
            variants={{
              enter: (k: number) => ({
                opacity: 0,
                x: motionSafe ? k * distances.shift : 0,
              }),
              shown: { opacity: 1, x: 0 },
              leave: (k: number) => ({
                opacity: 0,
                x: motionSafe ? -k * distances.shift : 0,
                transition: exitFor(durations.fast),
              }),
            }}
            initial="enter"
            animate="shown"
            exit="leave"
            transition={{
              opacity: { duration: durations.base, ease: easings.enter },
              x: motionSafe ? springs.glide : { duration: 0 },
            }}
          >
            {field}
          </motion.div>
        </AnimatePresence>
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="-mt-2 flex items-center gap-1.5 text-[12px] text-danger"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-2 border border-hairline bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          {question === 0 ? "Back to hub" : "Back"}
        </button>
        <button
          type="submit"
          className={cn(
            "inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-2 bg-(--sw-fill) px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90",
            FOCUS_RING,
          )}
        >
          {last ? (
            <>
              <Check aria-hidden className="size-3.5" />
              Finish
            </>
          ) : (
            "Next"
          )}
        </button>
      </div>
    </motion.form>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The hub                                 */
/* ----------------------------------------------------------------------- */

/**
 * A non-linear setup drawn as a hub and spokes: a ring divided into one
 * segment per task, with each task's node at the end of its spoke. A spoke
 * opens its short flow, grown out of the spoke's direction on
 * `springs.glide` as the hub recedes; finishing returns to the hub, where
 * that spoke's segment fills with a glide sweep from its start, the node's
 * check draws on `springs.flick`, the spoke line turns solid and the count
 * rolls on `springs.snap`. When every spoke is done the gaps close into one
 * ring and the centre lands a check on `springs.recoil`: Ready.
 *
 * The spokes are a list of buttons in ring order, so Tab walks them
 * clockwise (arrow keys too); each flow is a form where Enter moves on and
 * Escape returns. Under 34rem the hub becomes a list with a small ring.
 * Under reduced motion the flow cross-fades in place and segments fill on a
 * short tween.
 */
export function SpokeWizard({
  tasks = defaultSpokeTasks,
  spokeCount = 5,
  completed: completedProp,
  defaultCompleted = EMPTY_IDS,
  onCompletedChange,
  defaultAnswers = EMPTY_ANSWERS,
  onTaskComplete,
  onFinish,
  onLaunch,
  onOpenChange,
  ringStyle = "gapped",
  accent = "var(--accent-bright)",
  workspace = "Fernworks",
  title = "Set up your workspace",
  launchLabel = "Open workspace",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: SpokeWizardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = `sw${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const titleId = `${uid}-title`;
  const ready = status === "ready";

  const shown = tasks.slice(
    0,
    Math.max(1, Math.min(6, Math.round(spokeCount))),
  );
  const n = shown.length;
  const [ownDone, setOwnDone] = React.useState<string[]>(defaultCompleted);
  const doneIds = completedProp ?? ownDone;
  const done = new Set(doneIds.filter((id) => shown.some((t) => t.id === id)));
  const doneCount = done.size;
  const allDone = n > 0 && doneCount === n;
  const [answers, setAnswers] = React.useState<SpokeAnswers>(defaultAnswers);

  const [open, setOpen] = React.useState<{
    id: string;
    question: number;
    dir: number;
    draft: Record<string, string | boolean>;
    error: string | null;
  } | null>(null);
  const [returnTo, setReturnTo] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<HTMLFormElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Focus follows the swap: into the flow's first field when the panel
  // arrives, back to its spoke when the hub is in front again.
  const openQuestion = open?.question ?? -1;
  React.useEffect(() => {
    if (!panel || openQuestion < 0) return;
    // The question leaving is still in the panel; only the arriving one
    // carries this index.
    panel
      .querySelector<HTMLElement>(`[data-sw-first="${openQuestion}"]`)
      ?.focus({ preventScroll: true });
  }, [panel, openQuestion]);
  React.useEffect(() => {
    if (!returnTo || open) return;
    const node = nodes.current.get(returnTo);
    if (node?.isConnected) node.focus({ preventScroll: true });
  }, [returnTo, open]);

  const task = open ? (shown.find((t) => t.id === open.id) ?? null) : null;
  const openIndex = task ? shown.indexOf(task) : -1;
  const dirAngle = openIndex >= 0 ? angleOf(openIndex, n) : -90;
  const from = {
    x: r3(Math.cos(rad(dirAngle)) * distances.shift),
    y: r3(Math.sin(rad(dirAngle)) * distances.shift),
  };

  const openTask = (t: SpokeTask) => {
    if (disabled || !ready) return;
    setOpen({
      id: t.id,
      question: 0,
      dir: 1,
      draft: { ...(answers[t.id] ?? {}) },
      error: null,
    });
    setReturnTo(t.id);
    onOpenChange?.(t.id, 0);
    say(`${t.title}, question 1 of ${t.questions.length}.`);
  };

  const close = () => {
    if (!open) return;
    setOpen(null);
    onOpenChange?.(null, 0);
    say("Back at the hub.");
  };

  const answer = (id: string, value: string | boolean) =>
    setOpen((o) =>
      o ? { ...o, draft: { ...o.draft, [id]: value }, error: null } : o,
    );

  const back = () => {
    if (!open || !task) return;
    if (open.question === 0) {
      close();
      return;
    }
    const q = open.question - 1;
    setOpen({ ...open, question: q, dir: -1, error: null });
    onOpenChange?.(open.id, q);
  };

  const next = () => {
    if (!open || !task) return;
    const q = task.questions[open.question];
    // A choice left alone keeps the option it shows as chosen.
    const draft =
      q?.kind === "choice" && open.draft[q.id] === undefined
        ? { ...open.draft, [q.id]: q.options[0] ?? "" }
        : open.draft;
    if (q?.kind === "text" && q.required && !String(draft[q.id] ?? "").trim()) {
      setOpen({
        ...open,
        draft,
        error:
          typeof q.required === "string"
            ? q.required
            : `${q.label} is required.`,
      });
      say(`${q.label} is required.`);
      return;
    }
    if (open.question < task.questions.length - 1) {
      const nq = open.question + 1;
      setOpen({ ...open, draft, question: nq, dir: 1, error: null });
      onOpenChange?.(open.id, nq);
      say(`Question ${nq + 1} of ${task.questions.length}.`);
      return;
    }
    // Finish: the answers are kept, the spoke is done, and the hub returns.
    const given = { ...draft };
    for (const qq of task.questions) {
      if (qq.kind === "choice" && given[qq.id] === undefined)
        given[qq.id] = qq.options[0] ?? "";
      if (qq.kind === "toggle" && given[qq.id] === undefined)
        given[qq.id] = false;
    }
    const nextAnswers = { ...answers, [task.id]: given };
    setAnswers(nextAnswers);
    const ids = Array.from(new Set([...doneIds, task.id]));
    if (completedProp === undefined) setOwnDone(ids);
    onCompletedChange?.(ids);
    onTaskComplete?.(task.id, given);
    setOpen(null);
    onOpenChange?.(null, 0);
    const nowDone = shown.filter((t) => ids.includes(t.id)).length;
    if (nowDone === n) {
      onFinish?.(nextAnswers);
      say(`${task.title} done. Every task is done: ${workspace} is ready.`);
    } else {
      const pending = shown.find((t) => !ids.includes(t.id));
      say(
        `${task.title} done. ${nowDone} of ${n}.${pending ? ` ${pending.title} is next.` : ""}`,
      );
    }
  };

  const onNodeKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const t = shown[(i + step + n) % n];
    if (t) nodes.current.get(t.id)?.focus();
  };

  const nextUp = shown.find((t) => !done.has(t.id));

  /* -------------------------------- parts -------------------------------- */

  const centre = (
    <div className="flex flex-col items-center text-center">
      <AnimatePresence initial={false} mode="popLayout">
        {allDone ? (
          <motion.span
            key="ready"
            className="flex size-9 items-center justify-center rounded-full bg-(--sw-fill) text-white shadow-[0_6px_16px_color-mix(in_oklab,var(--sw-accent)_35%,transparent)]"
            initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    scale: { ...springs.recoil, delay: 0.55 },
                    opacity: { duration: durations.fast, delay: 0.55 },
                  }
                : { duration: durations.fast }
            }
          >
            <Check aria-hidden className="size-5" strokeWidth={2.75} />
          </motion.span>
        ) : (
          <motion.span
            key="count"
            className="flex items-baseline gap-0.5 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          >
            <RollingCount value={doneCount} motionSafe={motionSafe} />
            <span className="text-[14px] font-medium text-ink-3">/{n}</span>
          </motion.span>
        )}
      </AnimatePresence>
      <span className="mt-0.5 text-[11px] leading-4 font-medium tracking-[0.06em] text-ink-3 uppercase">
        {allDone ? "Ready" : "done"}
      </span>
      <span className="sr-only">
        {allDone
          ? `${workspace} is ready.`
          : `${doneCount} of ${n} tasks done.`}
      </span>
    </div>
  );

  const hub = (
    <div className="relative mx-auto w-full max-w-[44rem] @min-[34rem]/spoke-wizard:aspect-[680/380]">
      {/* Spokes and the ring: decoration; the list below carries the meaning. */}
      <svg
        aria-hidden
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="pointer-events-none absolute inset-0 hidden size-full @min-[34rem]/spoke-wizard:block"
      >
        {shown.map((t, i) => {
          const a = angleOf(i, n);
          const s = pointAt(VB.cx, VB.cy, VB.r + 12, a);
          const e = {
            x: r3(VB.cx + VB.rx * Math.cos(rad(a))),
            y: r3(VB.cy + VB.ry * Math.sin(rad(a))),
          };
          const on = done.has(t.id);
          return (
            <line
              key={t.id}
              x1={s.x}
              y1={s.y}
              x2={e.x}
              y2={e.y}
              strokeWidth={on ? 1.5 : 1}
              strokeDasharray={on ? undefined : "3 4"}
              strokeLinecap="round"
              className={cn(
                "transition-[stroke] duration-500",
                on ? "stroke-(--sw-accent)" : "stroke-hairline-strong",
              )}
            />
          );
        })}
        <circle
          cx={VB.cx}
          cy={VB.cy}
          r={VB.r - 14}
          className="fill-card stroke-hairline"
          strokeWidth={1}
        />
        <Ring
          tasks={shown}
          done={done}
          ready={allDone}
          ringStyle={ringStyle}
          size="hub"
          motionSafe={motionSafe}
          idBase={idBase}
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 @min-[34rem]/spoke-wizard:block">
        {centre}
      </div>

      {/* The list form: a small ring and the count beside it. */}
      <div className="mb-3 flex items-center gap-3 @min-[34rem]/spoke-wizard:hidden">
        <svg aria-hidden viewBox="0 0 48 48" className="size-12 shrink-0">
          <Ring
            tasks={shown}
            done={done}
            ready={allDone}
            ringStyle={ringStyle}
            size="mini"
            motionSafe={motionSafe}
            idBase={idBase}
          />
        </svg>
        <div className="min-w-0">
          <p className="text-[15px] leading-5 font-semibold text-foreground tabular-nums">
            {allDone ? "Ready" : `${doneCount} of ${n} done`}
          </p>
          <p className="truncate text-[12px] leading-4 text-ink-3">
            {allDone
              ? `${workspace} is set up`
              : nextUp
                ? `${nextUp.title} next`
                : ""}
          </p>
        </div>
      </div>

      <ul
        role="list"
        aria-label={`${workspace} setup tasks`}
        className="flex flex-col gap-2 @min-[34rem]/spoke-wizard:pointer-events-none @min-[34rem]/spoke-wizard:absolute @min-[34rem]/spoke-wizard:inset-0"
      >
        {shown.map((t, i) => {
          const a = angleOf(i, n);
          const left = `${r3(((VB.cx + VB.rx * Math.cos(rad(a))) / VB.w) * 100)}%`;
          const top = `${r3(((VB.cy + VB.ry * Math.sin(rad(a))) / VB.h) * 100)}%`;
          const isDone = done.has(t.id);
          const Icon = ICONS[t.icon] ?? User;
          const summary = isDone
            ? (summaryOf(t, answers[t.id]) ?? "Done")
            : `${t.blurb} · ${t.questions.length === 1 ? "1 question" : `${t.questions.length} questions`}`;
          return (
            <li
              key={t.id}
              className="@min-[34rem]/spoke-wizard:pointer-events-auto @min-[34rem]/spoke-wizard:absolute @min-[34rem]/spoke-wizard:top-(--sw-y) @min-[34rem]/spoke-wizard:left-(--sw-x) @min-[34rem]/spoke-wizard:w-[min(9.5rem,23cqw)] @min-[34rem]/spoke-wizard:-translate-x-1/2 @min-[34rem]/spoke-wizard:-translate-y-1/2"
              style={{ "--sw-x": left, "--sw-y": top } as React.CSSProperties}
            >
              <button
                ref={(node) => {
                  if (node) nodes.current.set(t.id, node);
                  else nodes.current.delete(t.id);
                }}
                type="button"
                onClick={() => openTask(t)}
                onKeyDown={(event) => onNodeKey(event, i)}
                aria-label={`${t.title}, ${isDone ? `done, ${summary}` : `to do, ${summary}`}`}
                aria-disabled={disabled || undefined}
                className={cn(
                  "group/sw-node flex w-full items-center gap-2.5 rounded-3 border bg-card px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-200",
                  "@min-[34rem]/spoke-wizard:px-2.5 @min-[34rem]/spoke-wizard:py-2",
                  isDone
                    ? "border-[color-mix(in_oklab,var(--sw-accent)_45%,var(--hairline))]"
                    : "border-hairline hover:border-hairline-strong",
                  "hover:shadow-[0_6px_18px_color-mix(in_oklab,black_9%,transparent)]",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                    isDone
                      ? "bg-[color-mix(in_oklab,var(--sw-accent)_14%,transparent)] text-(--sw-accent)"
                      : "bg-surface-2 text-ink-2",
                  )}
                >
                  <Icon className="size-4" />
                  <span
                    className={cn(
                      "absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card transition-colors duration-300",
                      isDone
                        ? "bg-(--sw-fill) text-white"
                        : "bg-surface-2 text-transparent",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="size-2.5">
                      <motion.path
                        d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={false}
                        animate={{ pathLength: isDone ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.flick, delay: isDone ? 0.36 : 0 }
                            : { duration: 0 }
                        }
                      />
                    </svg>
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-5 font-semibold text-foreground">
                    {t.title}
                  </span>
                  <span
                    className="truncate text-[11px] leading-4 text-ink-3"
                    title={summary}
                  >
                    {summary}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover/sw-node:translate-x-0.5 @min-[34rem]/spoke-wizard:hidden"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const body =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col items-center gap-4 py-12">
        <span className="sr-only">Loading the setup.</span>
        <span
          aria-hidden
          className="size-32 rounded-full border-[10px] border-surface-2 motion-safe:animate-pulse"
        />
        <span aria-hidden className="h-3 w-40 rounded-full bg-surface-2" />
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The setup did not load.</p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="grid items-center-safe [grid-template-areas:'stage']">
        <motion.div
          className="min-w-0 [grid-area:stage]"
          inert={open !== null}
          initial={false}
          animate={{
            opacity: open ? 0 : 1,
            scale: open && motionSafe ? 0.97 : 1,
          }}
          transition={{
            opacity: open
              ? { duration: durations.fast, ease: easings.exit }
              : { duration: durations.base, ease: easings.enter, delay: 0.08 },
            scale: motionSafe ? springs.glide : { duration: 0 },
          }}
        >
          {hub}
        </motion.div>
        <AnimatePresence>
          {open && task ? (
            <div key="flow" className="grid min-w-0 [grid-area:stage]">
              <SpokeFlow
                task={task}
                question={open.question}
                draft={open.draft}
                error={open.error}
                dir={open.dir}
                from={from}
                motionSafe={motionSafe}
                uid={`${uid}-${task.id}`}
                onAnswer={answer}
                onBack={back}
                onNext={next}
                onClose={close}
                onPanel={setPanel}
              />
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    );

  return (
    <div
      className={cn("@container/spoke-wizard w-full", className)}
      style={
        {
          "--sw-accent": accent,
          "--sw-fill": `oklch(from ${accent} 0.58 0.15 h)`,
          "--sw-track": "color-mix(in oklab, var(--ink-3) 24%, transparent)",
        } as React.CSSProperties
      }
    >
      <div
        role="region"
        aria-labelledby={titleId}
        className={cn(
          "relative mx-auto flex max-h-[35rem] w-full max-w-[48rem] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-surface-0 text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_12%,transparent)]",
          disabled && "opacity-70",
        )}
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-card px-4 py-3">
          <div className="min-w-0 flex-1 basis-40">
            <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
              {title}
            </h2>
            <p className="truncate text-[12px] leading-4 text-ink-3 tabular-nums">
              {workspace} · {doneCount} of {n} done
            </p>
          </div>
          <AnimatePresence initial={false}>
            {allDone && ready ? (
              <motion.button
                key="launch"
                type="button"
                onClick={() => onLaunch?.()}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-2 bg-(--sw-fill) px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90",
                  FOCUS_RING,
                )}
                initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  opacity: { duration: durations.base, delay: 0.6 },
                  x: motionSafe
                    ? { ...springs.snap, delay: 0.6 }
                    : { duration: 0 },
                }}
              >
                {launchLabel}
                <ChevronRight aria-hidden className="size-3.5" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </header>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-4 @min-[34rem]/spoke-wizard:p-5">
          {body}
        </div>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
