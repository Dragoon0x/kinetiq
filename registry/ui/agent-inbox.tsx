"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Bot,
  Check,
  ChevronDown,
  CornerUpLeft,
  RotateCcw,
  TriangleAlert,
  Undo2,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InboxDecision = "pending" | "approved" | "returned";
export type InboxChecks = "passed" | "failed" | "running";
export type InboxRisk = "low" | "medium" | "high";
export type InboxSwipe = "both" | "approve" | "off";
export type InboxDensity = "compact" | "cozy" | "roomy";
export type InboxStatus = "ready" | "loading" | "error";

export type AgentInboxProps = {
  /** What a sideways swipe does: right approves and left sends back, only right approves, or nothing (buttons only). @default "both" */
  swipe?: InboxSwipe;
  /** Cards carry checkboxes, and a toolbar slides in to decide several at once. @default true */
  batch?: boolean;
  /** How much each card says: one line, a summary and the diff bar, or the summary and every file. @default "cozy" */
  density?: InboxDensity;
  /** Controlled tasks, decided and waiting. */
  tasks?: InboxTask[];
  /** Initial tasks when uncontrolled. @default defaultInboxTasks */
  defaultTasks?: InboxTask[];
  /** Fires from the swipe, button, key or undo that changed a task, with the whole new list. */
  onTasksChange?: (tasks: InboxTask[]) => void;
  /** Tasks were approved (one, or a batch). */
  onApprove?: (tasks: InboxTask[]) => void;
  /** Tasks were sent back with this note. */
  onReturn?: (tasks: InboxTask[], note: string) => void;
  /** A decision was undone: the task is waiting again. */
  onUndo?: (task: InboxTask) => void;
  /** How far a card must travel to commit, as a share of its width, 0.2 to 0.8. @default 0.4 */
  threshold?: number;
  /** Quick notes offered when sending back. @default ["Add tests", "Smaller change", "Wrong place"] */
  notes?: string[];
  /** The moment relative times count from (Date or ms). @default the newest task's time */
  now?: number | Date;
  /** The queue is loading, or failed to load. @default "ready" */
  status?: InboxStatus;
  /** Retry was pressed after the queue failed to load. */
  onRetry?: () => void;
  /** The queue's name, shown in the header. @default "Review queue" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Play the decisions. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be decided. */
  disabled?: boolean;
  /** Classes for the root. It is 540px tall by default; pass a height class to change it. */
  className?: string;
};

export type InboxFile = {
  path: string;
  added: number;
  removed: number;
};

export type InboxTask = {
  /** Unique within the queue. */
  id: string;
  /** What the agent did, in a line. */
  title: string;
  /** The agent that did it. */
  agent: string;
  /** Where it did it: a repository path, a service. */
  area: string;
  summary: string;
  files: InboxFile[];
  checks?: InboxChecks;
  risk?: InboxRisk;
  /** When the agent finished, in ms since the epoch. */
  at: number;
  /** @default "pending" */
  status?: InboxDecision;
  /** Why it was sent back. */
  note?: string;
  /** When it was decided, in ms since the epoch. */
  decidedAt?: number;
};

const MIN = 60_000;
/** A fixed morning, so the default queue renders the same everywhere. */
const T = Date.UTC(2026, 8, 30, 10, 30);

/** Six changes Fieldline's agents have finished and are waiting on. */
export const defaultInboxTasks: InboxTask[] = [
  {
    id: "jitter",
    title: "Retry payouts with jitter",
    agent: "retry-tuner",
    area: "basin/payouts",
    summary:
      "Adds full jitter to the payout retry backoff, so a bank outage does not end in a burst of retries the moment it recovers.",
    files: [
      { path: "payouts/retry_scheduler.ts", added: 18, removed: 4 },
      { path: "payouts/retry_scheduler.test.ts", added: 42, removed: 0 },
    ],
    checks: "passed",
    risk: "medium",
    at: T - 12 * MIN,
  },
  {
    id: "webhook-timeout",
    title: "Raise the webhook timeout to 20 s",
    agent: "ops-runner",
    area: "basin/webhooks",
    summary:
      "Coldbrook acknowledges webhooks in up to 14 s at peak, so the 10 s limit was dropping them.",
    files: [
      { path: "webhooks/webhook_timeout.ts", added: 1, removed: 1 },
      { path: "docs/webhooks.md", added: 3, removed: 1 },
    ],
    checks: "passed",
    risk: "low",
    at: T - 34 * MIN,
  },
  {
    id: "ledger-export",
    title: "Remove the unused ledger export",
    agent: "cleanup",
    area: "basin/ledger",
    summary:
      "Deletes the CSV ledger export, which has had no calls in 90 days, and the job that built it.",
    files: [
      { path: "ledger/export_csv.ts", added: 0, removed: 212 },
      { path: "ledger/cron.ts", added: 0, removed: 9 },
      { path: "ledger/index.ts", added: 0, removed: 2 },
    ],
    checks: "passed",
    risk: "medium",
    at: T - 61 * MIN,
  },
  {
    id: "refund-keys",
    title: "Idempotency keys on refunds",
    agent: "retry-tuner",
    area: "basin/refunds",
    summary:
      "Every refund now carries an idempotency key, so a retried refund can never pay out twice.",
    files: [
      { path: "refunds/create_refund.ts", added: 27, removed: 6 },
      { path: "refunds/keys.ts", added: 31, removed: 0 },
      { path: "refunds/create_refund.test.ts", added: 58, removed: 3 },
    ],
    checks: "running",
    risk: "high",
    at: T - 2 * 60 * MIN,
  },
  {
    id: "settle-rename",
    title: "Rename settle_batch to settle_window",
    agent: "cleanup",
    area: "basin/settlement",
    summary: "Renames the job and its metrics so the name says what it does.",
    files: [
      { path: "settlement/settle_window.ts", added: 4, removed: 4 },
      { path: "dashboards/settlement.json", added: 6, removed: 6 },
    ],
    checks: "passed",
    risk: "low",
    at: T - 3 * 60 * MIN,
  },
  {
    id: "invoice-rounding",
    title: "Round invoice tax per line",
    agent: "invoice-fixer",
    area: "basin/invoices",
    summary:
      "Rounds the tax on each line before summing, which is what Coldbrook Bank reconciles against.",
    files: [
      { path: "invoices/totals.ts", added: 9, removed: 5 },
      { path: "invoices/totals.test.ts", added: 24, removed: 2 },
    ],
    checks: "failed",
    risk: "medium",
    at: T - 5 * 60 * MIN,
  },
];

type Exit = { dir: 1 | -1; order: Map<string, number>; count: number };
type Undo = { ids: string[]; prev: InboxTask[]; decision: InboxDecision };

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const pending = (t: InboxTask) => (t.status ?? "pending") === "pending";
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/**
 * Which ids arrived in the latest change of the list. Ids present on the
 * first render count as already there, so nothing enters on page load.
 */
function useBirths(ids: string[]) {
  const key = ids.join(",");
  const [b, setB] = React.useState(() => ({
    gen: 0,
    key,
    born: new Map(ids.map((id) => [id, -1])),
  }));
  if (b.key !== key) {
    const gen = b.gen + 1;
    const born = new Map<string, number>();
    for (const id of ids) born.set(id, b.born.get(id) ?? gen);
    setB({ gen, key, born });
  }
  return (id: string) => b.born.get(id) === b.gen;
}

/**
 * A number that rolls: the old value leaves one way as the new one arrives
 * from the other, both stacked in one cell so the width never jumps.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setDir(value >= prev ? 1 : -1);
    setPrev(value);
  }
  return (
    <span className="relative inline-grid overflow-clip tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="[grid-area:1/1]"
          variants={{
            from: (d: number) => ({
              y: motionSafe ? d * distances.step : 0,
              opacity: 0,
            }),
            at: { y: 0, opacity: 1 },
            gone: (d: number) => ({
              y: motionSafe ? -d * distances.step : 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="from"
          animate="at"
          exit="gone"
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** "+42 −7" and five blocks split between them, the way a reviewer reads a change. */
function DiffStat({ files }: { files: InboxFile[] }) {
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const total = added + removed;
  const greens = total === 0 ? 0 : Math.round((5 * added) / total);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
      <span className="sr-only">
        {added} lines added, {removed} removed
      </span>
      <span aria-hidden className={added ? "text-success" : "text-ink-3"}>
        +{added}
      </span>
      <span aria-hidden className={removed ? "text-danger" : "text-ink-3"}>
        −{removed}
      </span>
      <span aria-hidden className="inline-flex gap-px">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-[1px]",
              total === 0
                ? "bg-hairline-strong"
                : i < greens
                  ? "bg-success"
                  : "bg-danger",
            )}
          />
        ))}
      </span>
    </span>
  );
}

function ChecksBadge({
  checks,
  short,
}: {
  checks?: InboxChecks;
  short: boolean;
}) {
  if (!checks) return null;
  const text =
    checks === "passed"
      ? "Checks passed"
      : checks === "failed"
        ? "Checks failed"
        : "Checks running";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px]",
        checks === "passed"
          ? "text-success"
          : checks === "failed"
            ? "text-danger"
            : "text-ink-3",
      )}
      title={text}
    >
      {checks === "passed" ? (
        <Check aria-hidden className="size-3.5" />
      ) : checks === "failed" ? (
        <X aria-hidden className="size-3.5" />
      ) : (
        <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
          <circle
            cx="7"
            cy="7"
            r="5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1.6"
          />
          <path
            d="M7 2a5 5 0 0 1 5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className={cn(short && "sr-only")}>{text}</span>
    </span>
  );
}

type CardProps = {
  ref?: React.Ref<HTMLLIElement>;
  task: InboxTask;
  fresh: boolean;
  returnDir: 1 | -1;
  density: InboxDensity;
  swipe: InboxSwipe;
  batch: boolean;
  threshold: number;
  selected: boolean;
  active: boolean;
  noting: boolean;
  notes: string[];
  now: number;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLElement | null) => void;
  onFocusCard: () => void;
  onKeys: (event: React.KeyboardEvent<HTMLElement>) => void;
  onSelect: () => void;
  onApprove: () => void;
  onAskNote: () => void;
  onSendBack: (note: string) => void;
  onCancelNote: () => void;
};

/**
 * One task. The card is dragged sideways 1:1; the decision it is heading for
 * shows underneath and arms past the threshold. Its x is a motion value of
 * its own, so nothing re-renders while it moves, and it carries no `initial`
 * position for StrictMode to re-apply.
 */
function Card({
  ref,
  task,
  fresh,
  returnDir,
  density,
  swipe,
  batch,
  threshold,
  selected,
  active,
  noting,
  notes,
  now,
  motionSafe,
  disabled,
  bind,
  onFocusCard,
  onKeys,
  onSelect,
  onApprove,
  onAskNote,
  onSendBack,
  onCancelNote,
}: CardProps) {
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const filesId = `${uid}-files`;
  const noteId = `${uid}-note`;
  const x = useMotionValue(0);
  const width = React.useRef(320);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [held, setHeld] = React.useState(false);

  const home = (velocity = 0) => {
    anim.current?.stop();
    anim.current = motionSafe
      ? animate(x, 0, { ...springs.snap, velocity })
      : animate(x, 0, { duration: 0 });
  };

  React.useEffect(() => () => anim.current?.stop(), []);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || swipe === "off" || noting,
    onStart: ({ event }) => {
      const el = event.currentTarget as Element | null;
      width.current = Math.max(160, el?.getBoundingClientRect().width ?? 320);
      anim.current?.stop();
      setHeld(true);
    },
    onMove: ({ offset }) => {
      const w = width.current;
      // Left only sends back when the queue allows it; otherwise it gives
      // like a rubber band and comes home.
      const v =
        offset.x < 0 && swipe !== "both" ? rubberband(offset.x, w) : offset.x;
      x.set(r2(v));
    },
    onEnd: ({ velocity }) => {
      setHeld(false);
      const w = width.current;
      const reach = threshold * w;
      const landing = project(x.get(), velocity.x, 0.99);
      if (landing > reach) {
        onApprove();
        return;
      }
      if (landing < -reach && swipe === "both") {
        home(velocity.x);
        onAskNote();
        return;
      }
      home(velocity.x);
    },
    onCancel: () => {
      setHeld(false);
      home();
    },
  });

  const reach = useTransform(x, (v) =>
    r2(Math.abs(v) / (threshold * width.current)),
  );
  const approveSide = useTransform(x, (v) =>
    v > 0 ? r2(Math.min(1, v / 28)) : 0,
  );
  const returnSide = useTransform(x, (v) =>
    v < 0 ? r2(Math.min(1, -v / 28)) : 0,
  );
  const armedTarget = useTransform(reach, (r): number => (r >= 1 ? 1 : 0));
  const armed = useSpring(armedTarget, {
    stiffness: springs.snap.stiffness,
    damping: springs.snap.damping,
    mass: springs.snap.mass,
  });
  const iconScale = useTransform(armed, (a) => r2(0.8 + 0.2 * a));
  const labelOpacity = useTransform(armed, (a) => r2(0.55 + 0.45 * a));
  const lift = useTransform(x, (v) =>
    Math.abs(v) < 0.5
      ? "none"
      : `0 ${r2(Math.min(8, Math.abs(v) / 20))}px ${r2(Math.min(22, Math.abs(v) / 8))}px color-mix(in oklab, black 16%, transparent)`,
  );

  const focusNote = React.useCallback((node: HTMLTextAreaElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const added = task.files.reduce((n, f) => n + f.added, 0);
  const removed = task.files.reduce((n, f) => n + f.removed, 0);
  const compact = density === "compact";
  const roomy = density === "roomy";
  const filesOpen = open || roomy;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSendBack(text);
  };

  const actionButton = (kind: "approve" | "return") => (
    <button
      type="button"
      disabled={disabled}
      aria-label={
        compact
          ? kind === "approve"
            ? `Approve ${task.title}`
            : `Send back ${task.title}`
          : undefined
      }
      onClick={kind === "approve" ? onApprove : onAskNote}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "w-8 shrink-0" : "flex-1 px-2.5 @min-[40rem]:flex-none",
        kind === "approve"
          ? "border-success/30 bg-success/10 text-success enabled:hover:bg-success/15"
          : "border-hairline-strong text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
        noting && kind === "return" && "border-warn/40 bg-warn/10 text-warn",
        FOCUS,
      )}
    >
      {kind === "approve" ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <CornerUpLeft aria-hidden className="size-3.5" />
      )}
      {compact ? null : kind === "approve" ? "Approve" : "Send back"}
    </button>
  );

  return (
    <motion.li
      ref={ref}
      layout={motionSafe ? "position" : false}
      className="relative"
      initial={
        fresh
          ? { opacity: 0, x: motionSafe ? returnDir * distances.shift * 3 : 0 }
          : false
      }
      animate={{ opacity: 1, x: 0 }}
      variants={{
        gone: (c: Exit) => ({
          opacity: 0,
          x: motionSafe ? `${c.dir * 105}%` : 0,
          transition: {
            ...exitFor(durations.slow),
            delay: (c.order.get(task.id) ?? 0) * cascade(c.count),
          },
        }),
      }}
      exit="gone"
      transition={{
        layout: springs.glide,
        x: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      {swipe === "off" ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-clip rounded-3"
        >
          <motion.div
            className="absolute inset-0 flex items-center bg-success/15 pl-4 text-success"
            style={{ opacity: approveSide }}
          >
            <motion.span
              className="inline-flex items-center gap-1.5 text-[12px] font-medium"
              style={{ scale: iconScale, opacity: labelOpacity }}
            >
              <Check className="size-4" />
              Approve
            </motion.span>
          </motion.div>
          {swipe === "both" ? (
            <motion.div
              className="absolute inset-0 flex items-center justify-end bg-warn/15 pr-4 text-warn"
              style={{ opacity: returnSide }}
            >
              <motion.span
                className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                style={{ scale: iconScale, opacity: labelOpacity }}
              >
                Send back
                <CornerUpLeft className="size-4" />
              </motion.span>
            </motion.div>
          ) : null}
        </div>
      )}
      <motion.article
        ref={bind}
        tabIndex={active ? 0 : -1}
        aria-labelledby={titleId}
        aria-describedby={`${uid}-hint`}
        onFocus={(event) => {
          if (event.target === event.currentTarget) onFocusCard();
        }}
        onKeyDown={onKeys}
        {...drag}
        className={cn(
          "relative touch-pan-y rounded-3 border bg-card transition-colors select-none",
          selected
            ? "border-cobalt-bright/50"
            : noting
              ? "border-warn/40"
              : "border-hairline",
          held ? "cursor-grabbing" : swipe !== "off" && "cursor-grab",
          FOCUS,
        )}
        style={{ x, boxShadow: lift }}
      >
        <span id={`${uid}-hint`} className="sr-only">
          A approves, R sends back
          {batch ? ", X selects" : ""}
          {compact ? "" : ", Enter shows the files"}.
        </span>
        <div
          className={cn(
            "flex flex-wrap gap-x-3",
            compact ? "items-center gap-y-2 px-3 py-2" : "gap-y-3 p-3",
          )}
        >
          {batch ? (
            <span
              className={cn(
                "relative inline-flex size-4 shrink-0",
                !compact && "mt-0.5",
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={disabled}
                aria-label={`Select ${task.title}`}
                onChange={onSelect}
                onPointerDown={(event) => event.stopPropagation()}
                className={cn(
                  "peer size-4 cursor-pointer appearance-none rounded-1 border border-hairline-strong bg-card transition-colors checked:border-cobalt-bright checked:bg-cobalt-bright disabled:cursor-not-allowed",
                  FOCUS,
                )}
              />
              <Check
                aria-hidden
                strokeWidth={3}
                className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 basis-[11rem]">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright"
              >
                <Bot className="size-3" />
              </span>
              <h4
                id={titleId}
                title={task.title}
                className="min-w-0 truncate text-[13.5px] font-medium text-foreground"
              >
                {task.title}
              </h4>
              {compact ? (
                <span className="ml-auto hidden shrink-0 @min-[30rem]:inline-flex">
                  <DiffStat files={task.files} />
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 text-[11px] text-ink-3 tabular-nums",
                  compact ? "hidden @min-[40rem]:inline" : "ml-auto",
                )}
              >
                {ago(task.at, now)}
              </span>
            </div>
            {compact ? null : (
              <>
                <p
                  className={cn(
                    "mt-1 text-[12.5px] leading-5 text-ink-2",
                    roomy ? "line-clamp-2" : "line-clamp-1",
                  )}
                >
                  {task.summary}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-3">
                  <span className="inline-flex h-5 items-center rounded-1 bg-surface-2 px-1.5 font-mono text-ink-2">
                    {task.agent}
                  </span>
                  <span className="truncate font-mono">{task.area}</span>
                  <DiffStat files={task.files} />
                  {roomy ? null : (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={filesId}
                      onClick={() => setOpen((o) => !o)}
                      onPointerDown={(event) => event.stopPropagation()}
                      className={cn(
                        "inline-flex h-5 items-center gap-0.5 rounded-1 text-ink-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      {plural(task.files.length, "file")}
                      <motion.span
                        aria-hidden
                        className="inline-flex"
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      >
                        <ChevronDown className="size-3" />
                      </motion.span>
                    </button>
                  )}
                  <ChecksBadge checks={task.checks} short={!roomy} />
                  {task.risk === "high" || (roomy && task.risk) ? (
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full border px-1.5",
                        task.risk === "high"
                          ? "border-warn/40 text-warn"
                          : "border-hairline text-ink-3",
                      )}
                    >
                      {task.risk === "high"
                        ? "High risk"
                        : task.risk === "medium"
                          ? "Medium risk"
                          : "Low risk"}
                    </span>
                  ) : null}
                </div>
                <AnimatePresence initial={false}>
                  {filesOpen ? (
                    <motion.ul
                      key="files"
                      id={filesId}
                      role="list"
                      aria-label={`Files changed: ${added} lines added, ${removed} removed`}
                      className="overflow-clip"
                      initial={
                        motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{
                        height: motionSafe ? 0 : "auto",
                        opacity: 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={{
                        height: motionSafe ? springs.glide : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }}
                    >
                      {task.files.map((f) => (
                        <li
                          key={f.path}
                          className="mt-1.5 flex items-center gap-2 font-mono text-[11px] first:mt-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-ink-2">
                            {f.path}
                          </span>
                          <span className="shrink-0 text-success">
                            +{f.added}
                          </span>
                          <span className="shrink-0 text-danger">
                            −{f.removed}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </>
            )}
          </div>
          <div
            className={cn(
              "flex shrink-0 gap-2",
              compact ? "" : "w-full @min-[40rem]:w-auto @min-[40rem]:flex-col",
            )}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {actionButton("return")}
            {actionButton("approve")}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {noting ? (
            <motion.div
              key="note"
              className="overflow-clip"
              initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: motionSafe ? 0 : "auto",
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="border-t border-hairline px-3 pt-2.5 pb-3">
                <label
                  htmlFor={noteId}
                  className="mb-1.5 block text-[11px] text-ink-3"
                >
                  What should {task.agent} change?
                </label>
                <textarea
                  ref={focusNote}
                  id={noteId}
                  rows={2}
                  value={draft}
                  disabled={disabled}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      // Handled here, where focus is.
                      event.preventDefault();
                      event.stopPropagation();
                      onCancelNote();
                    } else if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.stopPropagation();
                      send();
                    } else {
                      event.stopPropagation();
                    }
                  }}
                  className={cn(
                    "block w-full resize-none rounded-2 border border-hairline bg-surface-2 px-2.5 py-1.5 text-[13px] text-foreground select-text placeholder:text-ink-3",
                    FOCUS,
                  )}
                  placeholder="Add tests for the empty batch"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {notes.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDraft(n)}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full border border-hairline px-2.5 text-[12px] text-ink-2 hover:border-hairline-strong hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={onCancelNote}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 px-2.5 text-[12px] text-ink-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !draft.trim()}
                    onClick={send}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-warn/40 bg-warn/10 px-2.5 text-[12px] font-medium text-warn transition-colors enabled:hover:bg-warn/15 disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    <CornerUpLeft aria-hidden className="size-3.5" />
                    Send back
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.article>
    </motion.li>
  );
}

/**
 * What your agents finished and are waiting on you for. Each card carries
 * the change — summary, area, a diff summary, checks, risk — and two
 * decisions. A card follows the finger 1:1 sideways while the decision it
 * is heading for shows underneath, arming on snap past `threshold`; the
 * release is projected, so a flick commits, and a short throw springs home
 * on snap with its velocity. An approved card leaves right on the exit ease
 * while the cards under it close the gap on glide; sending back asks for a
 * note first.
 *
 * Checkboxes select several and a toolbar slides down over the header on
 * snap to decide them at once, leaving in a cascade. The header's counts
 * roll their digits on snap as the queue empties, and the last decision
 * brings the inbox-zero state, its check drawn on flick and its badge
 * landing on recoil. Every decision can be undone; the card comes back from
 * the side it left on glide.
 *
 * Cards are a roving list: Up and Down move, A approves, R sends back, X
 * selects, Enter opens the files, and Escape closes a note. Under reduced
 * motion a drag still follows the finger, but nothing else travels.
 */
export function AgentInbox({
  swipe = "both",
  batch = true,
  density = "cozy",
  tasks,
  defaultTasks = defaultInboxTasks,
  onTasksChange,
  onApprove,
  onReturn,
  onUndo,
  threshold = 0.4,
  notes = ["Add tests", "Smaller change", "Wrong place"],
  now,
  status = "ready",
  onRetry,
  title = "Review queue",
  label,
  sound = false,
  disabled = false,
  className,
}: AgentInboxProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const zeroId = `${uid}-zero`;
  const reach = Math.min(0.8, Math.max(0.2, threshold));

  const [own, setOwn] = React.useState(defaultTasks);
  const list = tasks ?? own;
  const waiting = list.filter(pending);
  const decided = list.filter((t) => !pending(t));
  const approved = decided.filter((t) => t.status === "approved").length;
  const returned = decided.filter((t) => t.status === "returned").length;
  const nowMs =
    now !== undefined ? toMs(now) : list.reduce((m, t) => Math.max(m, t.at), 0);

  const [selection, setSelection] = React.useState<string[]>([]);
  const chosen = selection.filter((id) => waiting.some((t) => t.id === id));
  const [noting, setNoting] = React.useState<string | null>(null);
  const [batchNote, setBatchNote] = React.useState("");
  const [exit, setExit] = React.useState<Exit>({
    dir: 1,
    order: new Map(),
    count: 1,
  });
  const [undo, setUndo] = React.useState<Undo | null>(null);
  const [order, setOrder] = React.useState<string[]>([]);
  const [returnDir, setReturnDir] = React.useState<1 | -1>(1);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const cards = React.useRef(new Map<string, HTMLElement>());
  const focusOnMount = React.useCallback((node: HTMLInputElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const zeroRef = React.useRef<HTMLHeadingElement | null>(null);
  const focusNext = React.useRef<string | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);

  const fresh = useBirths(waiting.map((t) => t.id));
  const freshLog = useBirths(decided.map((t) => t.id));
  const roving =
    waiting.find((t) => t.id === activeId)?.id ?? waiting[0]?.id ?? null;

  const commit = (next: InboxTask[]) => {
    if (tasks === undefined) setOwn(next);
    onTasksChange?.(next);
  };

  /** Where focus goes when these cards leave: the card that takes their place. */
  const planFocus = (ids: string[]) => {
    const root = document.activeElement;
    const inside = ids.some((id) => cards.current.get(id)?.contains(root));
    if (!inside) return;
    const set = new Set(ids);
    const first = waiting.findIndex((t) => set.has(t.id));
    const rest = waiting.filter((t) => !set.has(t.id));
    focusNext.current = rest[Math.min(first, rest.length - 1)]?.id ?? "__zero";
  };

  const decide = (
    ids: string[],
    decision: "approved" | "returned",
    note?: string,
  ) => {
    if (disabled || ids.length === 0) return;
    const set = new Set(ids);
    const prev = list.filter((t) => set.has(t.id));
    const next = list.map((t) =>
      set.has(t.id)
        ? {
            ...t,
            status: decision,
            note: decision === "returned" ? note : undefined,
            decidedAt: nowMs,
          }
        : t,
    );
    planFocus(ids);
    setExit({
      dir: decision === "approved" ? 1 : -1,
      order: new Map(ids.map((id, i) => [id, i])),
      count: ids.length,
    });
    setUndo({ ids, prev, decision });
    setOrder((o) => [...ids, ...o.filter((id) => !set.has(id))]);
    setSelection((s) => s.filter((id) => !set.has(id)));
    setNoting(null);
    setBatchNote("");
    audio.play("swish", {
      pitch: decision === "approved" ? 1.15 : 0.85,
      gain: 0.5,
    });
    const left = waiting.length - prev.filter(pending).length;
    if (left === 0) audio.play("chime", { pitch: 1, gain: 0.45 });
    commit(next);
    const what =
      ids.length === 1
        ? (prev[0]?.title ?? "the task").replace(/[.\s]+$/, "")
        : plural(ids.length, "task");
    say(
      `${decision === "approved" ? "Approved" : "Sent back"} ${what}. ${
        left === 0 ? "Nothing waiting on you." : `${left} waiting.`
      }`,
    );
    if (decision === "approved") onApprove?.(prev);
    else onReturn?.(prev, note ?? "");
  };

  const undoLast = () => {
    if (disabled || !undo) return;
    const back = new Map(undo.prev.map((t) => [t.id, t]));
    const next = list.map((t) => back.get(t.id) ?? t);
    setReturnDir(undo.decision === "approved" ? 1 : -1);
    setOrder((o) => o.filter((id) => !back.has(id)));
    setUndo(null);
    focusNext.current = undo.ids[0] ?? null;
    audio.play("swish", { pitch: 1, gain: 0.35 });
    commit(next);
    say(`Undone. ${plural(waiting.length + undo.ids.length, "task")} waiting.`);
    for (const t of undo.prev) onUndo?.(t);
  };

  // Focus lands on the card that took the place of the one that left (or
  // the inbox-zero heading), once the list has re-rendered.
  const waitingKey = waiting.map((t) => t.id).join(",");
  React.useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    if (want === "__zero") zeroRef.current?.focus({ preventScroll: true });
    else cards.current.get(want)?.focus({ preventScroll: true });
  }, [waitingKey]);

  const toggleSelect = (id: string) => {
    if (disabled || !batch) return;
    setSelection((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  };

  const onCardKeys = (
    event: React.KeyboardEvent<HTMLElement>,
    task: InboxTask,
  ) => {
    if (event.target !== event.currentTarget) return;
    const i = waiting.findIndex((t) => t.id === task.id);
    const go = (j: number) => {
      const t = waiting[Math.min(waiting.length - 1, Math.max(0, j))];
      if (t) cards.current.get(t.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(waiting.length - 1);
        return;
      case "a":
      case "A":
        event.preventDefault();
        decide([task.id], "approved");
        return;
      case "r":
      case "R":
        event.preventDefault();
        setNoting(task.id);
        return;
      case "x":
      case "X":
      case " ":
        if (!batch) return;
        event.preventDefault();
        toggleSelect(task.id);
        return;
      case "Enter": {
        event.preventDefault();
        const button = event.currentTarget.querySelector<HTMLButtonElement>(
          "button[aria-expanded]",
        );
        button?.click();
        return;
      }
    }
  };

  const toolbarKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = [
      ...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i === -1) return;
    event.preventDefault();
    const d = event.key === "ArrowRight" ? 1 : -1;
    buttons[(i + d + buttons.length) % buttons.length]?.focus();
  };

  const log = [...decided].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    }
    return (b.decidedAt ?? 0) - (a.decidedAt ?? 0);
  });
  const lastTitle =
    undo && undo.prev.length === 1
      ? undo.prev[0]?.title
      : undo
        ? plural(undo.prev.length, "task")
        : "";

  const chip = (text: string, n: number, dot: string): React.ReactNode => (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {text}
      <span className="font-mono text-foreground">
        <Roll value={n} motionSafe={motionSafe} />
      </span>
    </span>
  );

  const toolbarButton = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50",
    FOCUS,
  );

  return (
    <div
      role="region"
      aria-label={label ?? title}
      className={cn(
        "@container flex h-[540px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* Header: the queue and its counts, or the batch toolbar over them. */}
      <div className="grid shrink-0 border-b border-hairline">
        <motion.div
          className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
          animate={{ opacity: chosen.length ? 0 : 1 }}
          transition={{ duration: durations.fast }}
          inert={chosen.length > 0}
        >
          <h3 className="mr-auto text-[13px] font-medium">{title}</h3>
          <span className="flex flex-wrap items-center gap-1.5">
            {chip("Waiting", waiting.length, "bg-cobalt-bright")}
            {chip("Approved", approved, "bg-success")}
            {chip("Sent back", returned, "bg-warn")}
          </span>
        </motion.div>
        <AnimatePresence initial={false}>
          {chosen.length ? (
            <motion.div
              key="toolbar"
              ref={toolbarRef}
              role="toolbar"
              aria-label="Selected tasks"
              onKeyDown={toolbarKeys}
              className="col-start-1 row-start-1 flex items-center gap-1.5 bg-cobalt-wash px-3 py-2"
              initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
            >
              <span className="mr-auto inline-flex items-center gap-1 text-[12px] text-foreground">
                <Roll value={chosen.length} motionSafe={motionSafe} /> selected
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setNoting("__batch")}
                className={cn(
                  toolbarButton,
                  "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <CornerUpLeft aria-hidden className="size-3.5" />
                <span className="hidden @min-[30rem]:inline">Send back</span>
                <span className="sr-only @min-[30rem]:hidden">Send back</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => decide(chosen, "approved")}
                className={cn(
                  toolbarButton,
                  "bg-success/15 text-success hover:bg-success/20",
                )}
              >
                <Check aria-hidden className="size-3.5" />
                Approve {chosen.length}
              </button>
              <button
                type="button"
                disabled={disabled || chosen.length === waiting.length}
                onClick={() => setSelection(waiting.map((t) => t.id))}
                className={cn(
                  toolbarButton,
                  "hidden text-ink-2 hover:text-foreground @min-[40rem]:inline-flex",
                )}
              >
                Select all
              </button>
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => {
                  setSelection([]);
                  setNoting(null);
                }}
                className={cn(
                  toolbarButton,
                  "w-8 justify-center px-0 text-ink-2 hover:text-foreground",
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {noting === "__batch" && chosen.length ? (
          <motion.div
            key="batch-note"
            className="shrink-0 overflow-clip border-b border-hairline bg-surface-1"
            initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: motionSafe ? 0 : "auto",
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            <form
              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (batchNote.trim()) {
                  decide(chosen, "returned", batchNote.trim());
                }
              }}
            >
              <input
                ref={focusOnMount}
                aria-label={`What should change in the ${plural(chosen.length, "task")}`}
                value={batchNote}
                onChange={(event) => setBatchNote(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNoting(null);
                  }
                }}
                placeholder={`Note for ${plural(chosen.length, "task")}`}
                className={cn(
                  "h-8 min-w-0 flex-1 basis-[12rem] rounded-2 border border-hairline bg-surface-2 px-2.5 text-[13px] placeholder:text-ink-3",
                  FOCUS,
                )}
              />
              {notes.slice(0, 2).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBatchNote(n)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border border-hairline px-2.5 text-[12px] text-ink-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="submit"
                disabled={!batchNote.trim()}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-warn/40 bg-warn/10 px-2.5 text-[12px] font-medium text-warn disabled:opacity-50",
                  FOCUS,
                )}
              >
                <CornerUpLeft aria-hidden className="size-3.5" />
                Send back {chosen.length}
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 [scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain">
          {status === "loading" ? (
            <ul
              aria-label="Loading the queue"
              className="flex flex-col gap-2 p-3"
            >
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-3 border border-hairline p-3"
                >
                  {[58, 86, 40].map((w, j) => (
                    <span
                      key={j}
                      className="h-2.5 rounded-full bg-surface-2"
                      style={{ width: `${w - i * 5}%` }}
                    />
                  ))}
                </li>
              ))}
            </ul>
          ) : status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-[13px]">The queue did not load.</p>
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            </div>
          ) : waiting.length === 0 ? (
            <Zero
              headingRef={zeroRef}
              headingId={zeroId}
              approved={approved}
              returned={returned}
              canUndo={!!undo}
              motionSafe={motionSafe}
              disabled={disabled}
              onUndo={undoLast}
            />
          ) : (
            <ol
              role="list"
              aria-label="Waiting for review"
              className="flex flex-col gap-2 p-3"
            >
              <AnimatePresence initial={false} mode="popLayout" custom={exit}>
                {waiting.map((task) => (
                  <Card
                    key={task.id}
                    task={task}
                    fresh={fresh(task.id)}
                    returnDir={returnDir}
                    density={density}
                    swipe={swipe}
                    batch={batch}
                    threshold={reach}
                    selected={chosen.includes(task.id)}
                    active={roving === task.id}
                    noting={noting === task.id}
                    notes={notes}
                    now={nowMs}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    bind={(node) => {
                      if (node) cards.current.set(task.id, node);
                      else cards.current.delete(task.id);
                    }}
                    onFocusCard={() => setActiveId(task.id)}
                    onKeys={(event) => onCardKeys(event, task)}
                    onSelect={() => toggleSelect(task.id)}
                    onApprove={() => decide([task.id], "approved")}
                    onAskNote={() => setNoting(task.id)}
                    onSendBack={(note) => decide([task.id], "returned", note)}
                    onCancelNote={() => {
                      setNoting(null);
                      cards.current.get(task.id)?.focus();
                    }}
                  />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>

        {/* The day's decisions, on wide layouts. */}
        <aside
          aria-label="Reviewed"
          className="hidden w-72 shrink-0 flex-col border-l border-hairline @min-[60rem]:flex"
        >
          <p className="flex h-10 shrink-0 items-center gap-1.5 px-3 text-[11px] tracking-[0.06em] text-ink-3 uppercase">
            Reviewed
            <span className="font-mono">
              <Roll value={decided.length} motionSafe={motionSafe} />
            </span>
          </p>
          {log.length === 0 ? (
            <p className="px-3 text-[12px] text-ink-3">
              Decisions you make appear here.
            </p>
          ) : (
            <ol
              role="list"
              className="flex flex-1 [scrollbar-width:thin] flex-col gap-1.5 overflow-y-auto overscroll-contain px-3 pb-3"
            >
              <AnimatePresence initial={false}>
                {log.map((t) => {
                  const canUndo = !!undo?.ids.includes(t.id);
                  return (
                    <motion.li
                      key={t.id}
                      layout={motionSafe ? "position" : false}
                      className="flex gap-2 rounded-2 border border-hairline px-2.5 py-2"
                      initial={
                        freshLog(t.id)
                          ? { opacity: 0, y: motionSafe ? -distances.step : 0 }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        layout: springs.glide,
                        y: motionSafe ? springs.glide : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                          t.status === "approved"
                            ? "bg-success/15 text-success"
                            : "bg-warn/15 text-warn",
                        )}
                      >
                        {t.status === "approved" ? (
                          <Check className="size-2.5" />
                        ) : (
                          <CornerUpLeft className="size-2.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-foreground">
                          <span className="sr-only">
                            {t.status === "approved"
                              ? "Approved: "
                              : "Sent back: "}
                          </span>
                          {t.title}
                        </span>
                        {t.note ? (
                          <span className="block truncate text-[11px] text-ink-3">
                            “{t.note}”
                          </span>
                        ) : null}
                      </span>
                      {canUndo ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={undoLast}
                          className={cn(
                            "inline-flex h-6 shrink-0 items-center gap-1 rounded-1 px-1.5 text-[11px] text-ink-2 hover:text-foreground",
                            FOCUS,
                          )}
                        >
                          <Undo2 aria-hidden className="size-3" />
                          Undo
                        </button>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          )}
        </aside>
      </div>

      {/* The last decision, with Undo, below the wide layout. */}
      {undo && waiting.length > 0 ? (
        <div className="flex h-11 shrink-0 items-center gap-2 border-t border-hairline px-3 text-[12px] @min-[60rem]:hidden">
          {undo.decision === "approved" ? (
            <Check aria-hidden className="size-3.5 shrink-0 text-success" />
          ) : (
            <CornerUpLeft aria-hidden className="size-3.5 shrink-0 text-warn" />
          )}
          <span className="min-w-0 flex-1 truncate text-ink-2">
            {undo.decision === "approved" ? "Approved" : "Sent back"}{" "}
            <span className="text-foreground">{lastTitle}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={undoLast}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline px-2 text-[12px] text-ink-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <Undo2 aria-hidden className="size-3.5" />
            Undo
          </button>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** Inbox zero: a tray whose check draws on flick and whose badge lands on recoil. */
function Zero({
  headingRef,
  headingId,
  approved,
  returned,
  canUndo,
  motionSafe,
  disabled,
  onUndo,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  headingId: string;
  approved: number;
  returned: number;
  canUndo: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onUndo: () => void;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center"
    >
      <svg aria-hidden viewBox="0 0 64 64" className="size-16">
        <path
          d="M10 34 18 14h28l8 20v14a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z"
          fill="none"
          className="stroke-hairline-strong"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M10 34h13l3 6h12l3-6h13"
          fill="none"
          className="stroke-hairline-strong"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <motion.circle
          cx="46"
          cy="16"
          r="9"
          style={{
            originX: 0.5,
            originY: 0.5,
            fill: "oklch(from var(--success) 0.7 c h)",
          }}
          initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            scale: motionSafe
              ? { ...springs.recoil, delay: 0.1 }
              : { duration: 0 },
            opacity: { duration: durations.fast, delay: 0.1 },
          }}
        />
        <motion.path
          d="M42 16.2 45 19l5-6"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-card"
          initial={{ pathLength: motionSafe ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe ? { ...springs.flick, delay: 0.32 } : { duration: 0 }
          }
        />
      </svg>
      <h4
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className={cn("rounded-1 text-[15px] font-medium", FOCUS)}
      >
        Nothing waiting on you.
      </h4>
      <p className="text-[12px] text-ink-3">
        {plural(approved, "change")} approved · {returned} sent back
      </p>
      {canUndo ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onUndo}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Undo2 aria-hidden className="size-3.5" />
          Undo last
        </button>
      ) : null}
    </section>
  );
}
