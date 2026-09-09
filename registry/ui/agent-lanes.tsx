"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LaneStatus = "queued" | "running" | "done" | "failed" | "stopped";

export type AgentLane = {
  id: string;
  /** The sub-agent's name, e.g. "Drafter". */
  agent: string;
  /** The model behind it; the name's tooltip and part of the bar's value text. */
  model?: string;
  /** What the lane is doing, one line. */
  task: string;
  /** 0..1, owned by the host. */
  progress: number;
  /** @default "queued" */
  status?: LaneStatus;
  /** One line the summary shows once the lane merges. */
  result?: string;
};

export type AgentLanesProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The sub-agents in lane order. */
  lanes: AgentLane[];
  /** Offers a Stop control on running lanes and fires from it. */
  onStop?: (id: string) => void;
  /** Fires when a done lane leaves its lane and joins the summary. */
  onMerge?: (id: string) => void;
  /** Names the lane list. */
  label: string;
  /** The summary row's heading. @default "Merged" */
  mergeLabel?: string;
  className?: string;
};

/** How long a finished lane holds so its tick is read before it merges. */
const MERGE_HOLD_MS = 700;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const WORD: Record<LaneStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const WORD_TONE: Record<LaneStatus, string> = {
  queued: "text-ink-3",
  running: "text-cobalt-bright",
  done: "text-success",
  failed: "text-danger",
  stopped: "text-ink-3",
};

const FILL_TONE: Record<LaneStatus, string> = {
  queued: "bg-hairline-strong",
  running: "bg-cobalt-bright",
  done: "bg-success",
  failed: "bg-danger",
  stopped: "bg-ink-3",
};

const AVATAR_TONE: Record<LaneStatus, string> = {
  queued: "border-hairline-strong bg-surface-2 text-ink-3",
  running: "border-cobalt-bright bg-cobalt-wash text-cobalt-bright",
  done: "border-success bg-success text-background",
  failed: "border-danger bg-surface-2 text-danger",
  stopped: "border-hairline-strong bg-surface-2 text-ink-3",
};

/** A digit that rolls on `snap`; hidden because the count is also printed in words. */
function RollingDigit({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digit = Math.min(9, Math.max(0, value));
  return (
    <span
      aria-hidden
      className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden align-bottom"
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${digit * -10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((face) => (
          <span key={face} className="flex h-[1.25em] items-center">
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Avatar({ lane, className }: { lane: AgentLane; className?: string }) {
  const status = lane.status ?? "queued";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-300",
        AVATAR_TONE[status],
        className,
      )}
    >
      {lane.agent.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LaneRow({
  lane,
  motionSafe,
  onStop,
}: {
  lane: AgentLane;
  motionSafe: boolean;
  onStop?: (id: string) => void;
}) {
  const nameId = React.useId();
  const status = lane.status ?? "queued";
  const running = status === "running";
  const percent = Math.round(Math.min(1, Math.max(0, lane.progress)) * 100);
  const scale = Number((percent / 100).toFixed(4));

  // The row's height is measured so the list closes its gap by the true
  // height when the lane leaves, wrapped task line and all.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.li
      className="overflow-hidden"
      initial={false}
      animate={height === null ? undefined : { height, opacity: 1, y: 0 }}
      // A merged lane leaves downward, toward the summary it joins, on the
      // exit ease; it is a departure, so it never springs.
      exit={{
        height: 0,
        opacity: 0,
        y: motionSafe ? distances.shift : 0,
        transition: exitFor(durations.slow),
      }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.move }
      }
    >
      <div ref={innerRef} className="flex items-center gap-2.5 pb-3">
        <Avatar lane={lane} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex h-5 items-center gap-2">
            <span
              id={nameId}
              className="shrink-0 text-sm font-medium"
              title={lane.model}
            >
              {lane.agent}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-xs text-ink-3"
              title={lane.task}
            >
              {lane.task}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-[11px] font-medium tabular-nums transition-colors",
                WORD_TONE[status],
              )}
            >
              {running ? `${percent}%` : WORD[status]}
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby={nameId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${lane.agent}${lane.model ? ` on ${lane.model}` : ""}, ${lane.task}, ${WORD[status].toLowerCase()}, ${percent} percent`}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
          >
            {/* Progress is a quantity settling, so the fill glides with no
                overshoot and still fills under reduced motion. */}
            <motion.span
              className={cn(
                "absolute inset-0 origin-left rounded-full transition-colors duration-300",
                FILL_TONE[status],
              )}
              initial={false}
              animate={{ scaleX: scale }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
            >
              <motion.span
                className="absolute inset-0 bg-background"
                initial={false}
                animate={{ opacity: running && motionSafe ? [0, 0.35] : 0 }}
                transition={
                  running && motionSafe
                    ? {
                        duration: 0.9,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse",
                      }
                    : { duration: durations.fast }
                }
              />
            </motion.span>
          </div>
        </div>
        {onStop && running ? (
          <button
            type="button"
            aria-label={`Stop ${lane.agent}`}
            onClick={() => onStop(lane.id)}
            className={cn(
              "flex h-6 shrink-0 items-center rounded-2 border border-hairline-strong px-2 text-[11px] font-medium transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Stop
          </button>
        ) : null}
      </div>
    </motion.li>
  );
}

type Last = { kind: "merged" | "stopped"; id: string } | null;

/**
 * Parallel lanes, one per sub-agent, each with a bar the host fills. The
 * fill glides on `glide` with no overshoot — progress is a quantity settling —
 * and a running lane's bar carries a sheen that breathes at the ambient tempo.
 * When a lane's status turns done it holds for a beat, then slides down out
 * of the list on the exit ease while its measured height folds on `glide`,
 * and merges into the summary row beneath: its avatar slides into the stack
 * from `distances.step`, the merged count rolls on `snap`, and its result
 * cross-fades in. Failed and stopped lanes stay put in their word.
 *
 * Every bar is a `role="progressbar"` whose value text reads the lane in
 * words; Stop is a real button. The live region says who finished and how
 * many have merged, who stopped, and when all have merged — once per change.
 * Under reduced motion bars fill on a tween, the done lane fades and folds
 * in place, and the avatar and count swap.
 */
export function AgentLanes({
  ref,
  lanes,
  onStop,
  onMerge,
  label,
  mergeLabel = "Merged",
  className,
}: AgentLanesProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const mergeId = React.useId();

  const [merged, setMerged] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<Last>(null);

  // A lane the host has taken back out of done (a reset) forgets its merge,
  // so it can hold and merge again rather than vanish the instant it lands.
  const doneIds = lanes
    .filter((lane) => lane.status === "done")
    .map((l) => l.id);
  const stale = merged.some((id) => !doneIds.includes(id));
  if (stale) {
    setMerged(merged.filter((id) => doneIds.includes(id)));
    setLast(null);
  }

  const pending = doneIds.filter((id) => !merged.includes(id));
  const pendingKey = pending.join(" ");
  const onMergeRef = React.useRef(onMerge);
  React.useEffect(() => {
    onMergeRef.current = onMerge;
  });
  React.useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(" ");
    const timer = window.setTimeout(() => {
      setMerged((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))]);
      const tail = ids[ids.length - 1];
      if (tail) setLast({ kind: "merged", id: tail });
      ids.forEach((id) => onMergeRef.current?.(id));
    }, MERGE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [pendingKey]);

  const stop = (id: string) => {
    setLast({ kind: "stopped", id });
    onStop?.(id);
  };

  const summary = merged
    .map((id) => lanes.find((lane) => lane.id === id))
    .filter((lane): lane is AgentLane => lane !== undefined);
  const inLanes = lanes.filter((lane) => !merged.includes(lane.id));
  const latest = summary[summary.length - 1];
  const total = lanes.length;
  const allMerged = total > 0 && summary.length === total;

  const lastLane = last ? lanes.find((lane) => lane.id === last.id) : undefined;
  const announcement = allMerged
    ? `All ${total} merged`
    : last && lastLane
      ? last.kind === "merged"
        ? `${lastLane.agent} finished, merged ${summary.length} of ${total}`
        : `${lastLane.agent} stopped`
      : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {inLanes.length} {inLanes.length === 1 ? "lane" : "lanes"}
        </span>
      </div>

      <ul aria-labelledby={labelId} className="flex flex-col">
        <AnimatePresence initial={false}>
          {inLanes.map((lane) => (
            <LaneRow
              key={lane.id}
              lane={lane}
              motionSafe={motionSafe}
              onStop={onStop ? stop : undefined}
            />
          ))}
        </AnimatePresence>
      </ul>

      <section
        aria-labelledby={mergeId}
        className="flex flex-col gap-1 rounded-2 border border-hairline bg-surface-1 px-3 py-2"
      >
        <div className="flex h-7 items-center gap-3">
          <span id={mergeId} className="shrink-0 text-xs font-medium">
            {mergeLabel}
          </span>
          <span className="flex min-w-0 flex-1 items-center -space-x-1.5">
            {summary.map((lane) => (
              <motion.span
                key={lane.id}
                layout={motionSafe ? "position" : false}
                initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={
                  motionSafe ? { ...springs.glide, opacity: fade } : fade
                }
              >
                <Avatar lane={lane} className="ring-2 ring-surface-1" />
              </motion.span>
            ))}
          </span>
          <span className="flex shrink-0 items-center font-mono text-[11px] tabular-nums">
            <RollingDigit value={summary.length} motionSafe={motionSafe} />
            <span className="sr-only">{summary.length}</span>
            <span className="text-ink-3">&nbsp;/ {total}</span>
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={latest ? latest.id : "none"}
            className="h-5 truncate text-xs leading-5 text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {latest ? (
              <>
                <span className="font-medium text-foreground">
                  {latest.agent}
                </span>
                {latest.result ? ` · ${latest.result}` : " · merged"}
              </>
            ) : (
              "Nothing merged yet"
            )}
          </motion.p>
        </AnimatePresence>
      </section>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
