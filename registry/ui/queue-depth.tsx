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

export type PendingDeploy = {
  id: string;
  /** What is being deployed: "ledger-api". */
  service: string;
  /** The change waiting to go: "4f2c". */
  change: string;
  /** Who pushed it. */
  author: string;
  /** How long it has waited already, in seconds. */
  waitedSeconds: number;
};

export type QueueDepthProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The queue as the host knows it. */
  deploys: PendingDeploy[];
  /** Seconds left on the head; the rule drains to its share of the total. */
  headSeconds: number;
  /** What the head's countdown started from. @default 60 */
  headTotalSeconds?: number;
  /** Controlled hold on the head of the queue. */
  held?: boolean;
  /** Initial hold for uncontrolled usage. @default false */
  defaultHeld?: boolean;
  /** Fires from the press or key that flipped the Hold switch. */
  onHeldChange?: (held: boolean) => void;
  /** The settled order — a state, so it also fires on the first commit. */
  onQueueChange?: (ids: string[]) => void;
  /** Fires from the press that moved a row up one place. */
  onPromote?: (id: string) => void;
  /** Fires when a row is folded into the one above it. */
  onMerge?: (intoId: string, fromId: string) => void;
  /** Names the queue for assistive technology. @default "Deploy queue" */
  label?: string;
  className?: string;
};

type Queue = { order: string[]; merges: Record<string, string[]> };

const WORDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
const ordinal = (n: number): string => {
  const word = WORDS[n - 1];
  if (word) return word;
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th"}`;
};

const changePhrase = (count: number): string =>
  `${count} ${count === 1 ? "change" : "changes"}`;

const deployPhrase = (count: number): string =>
  `${count} ${count === 1 ? "deploy" : "deploys"}`;

/** Waits read as minutes past ninety seconds: nobody counts 400 seconds. */
const waitPhrase = (seconds: number): string => {
  if (seconds >= 90) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const whole = Math.round(seconds);
  return `${whole} ${whole === 1 ? "second" : "seconds"}`;
};

const waitShort = (seconds: number): string =>
  seconds >= 90
    ? `${Math.round(seconds / 60)} min`
    : `${Math.round(seconds)} s`;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * What is waiting to go out, in the order it will go. The head carries a rule
 * that drains to the seconds left on `glide` — the seconds come from a prop, so
 * the queue never reads a clock — and a Hold switch stops it, because a queue
 * you cannot stop is not a queue.
 *
 * Pressing a row promotes it one place: the two neighbours exchange under
 * `layout` on `glide`, a FLIP rather than a re-render, and the new position is
 * spoken. Two adjacent rows for the same service can be merged, the lower one
 * leaving on `exitFor()` while the upper takes its changes and its count rolls
 * in one grid cell that cross-fades, so a second merge can never blank the
 * number. Depth reads as a count and a wait in the head: this is a list with a
 * clock on it, never a capacity bar.
 *
 * The order and the merges are the component's own state, reconciled against
 * `deploys` during render — ids that leave the prop drop out of both, and ids
 * that arrive join the back. Each row is a real button under a roving tabindex
 * with Arrow keys, Home and End, and its accessible name says where it sits and
 * where pressing would put it. Under reduced motion nothing FLIPs and the
 * promotion is an instant exchange, while the rule still drains and the count
 * still rolls, because how much is waiting is information.
 */
export function QueueDepth({
  ref,
  deploys,
  headSeconds,
  headTotalSeconds = 60,
  held,
  defaultHeld = false,
  onHeldChange,
  onQueueChange,
  onPromote,
  onMerge,
  label = "Deploy queue",
  className,
}: QueueDepthProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownHeld, setOwnHeld] = React.useState(defaultHeld);
  const holding = held !== undefined ? held : ownHeld;

  const [queue, setQueue] = React.useState<Queue>(() => ({
    order: deploys.map((deploy) => deploy.id),
    merges: {},
  }));
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  // The order and the merges are reconciled against the prop in render, off an
  // anchor: an effect would commit one pass showing a row the host has already
  // shipped, or hiding one it has just added.
  const roster = deploys.map((deploy) => deploy.id).join();
  const [anchor, setAnchor] = React.useState(roster);
  if (anchor !== roster) {
    const ids = deploys.map((deploy) => deploy.id);
    const order = queue.order.filter((id) => ids.includes(id));
    const merges: Record<string, string[]> = {};
    for (const id of order) {
      const folded = (queue.merges[id] ?? []).filter((one) =>
        ids.includes(one),
      );
      if (folded.length > 0) merges[id] = folded;
    }
    const carried = new Set([...order, ...Object.values(merges).flat()]);
    setAnchor(roster);
    setQueue({
      order: [...order, ...ids.filter((id) => !carried.has(id))],
      merges,
    });
  }

  const byId = new Map(deploys.map((deploy) => [deploy.id, deploy]));
  const rows = queue.order.flatMap((id) => {
    const deploy = byId.get(id);
    return deploy ? [{ deploy, folded: queue.merges[id] ?? [] }] : [];
  });

  const queueRef = React.useRef(onQueueChange);
  React.useEffect(() => {
    queueRef.current = onQueueChange;
  });
  // The order is a state, not an event: a host that mounts beside the queue
  // reads the same order the queue does, from the first commit.
  React.useEffect(() => {
    queueRef.current?.(queue.order);
  }, [queue.order]);

  const setHeld = (next: boolean) => {
    if (held === undefined) setOwnHeld(next);
    setSpoken(next ? "Queue held." : "Queue released.");
    onHeldChange?.(next);
  };

  const promote = (id: string) => {
    const index = queue.order.indexOf(id);
    if (index < 1) return;
    const order = [...queue.order];
    const above = order[index - 1];
    if (!above) return;
    order[index - 1] = id;
    order[index] = above;
    const deploy = byId.get(id);
    setQueue({ order, merges: queue.merges });
    if (deploy) {
      setSpoken(
        `${deploy.service} ${deploy.change} promoted to ${ordinal(index)} of ${deployPhrase(order.length)}.`,
      );
    }
    onPromote?.(id);
  };

  const merge = (id: string) => {
    const index = queue.order.indexOf(id);
    const intoId = queue.order[index - 1];
    if (index < 1 || !intoId) return;
    const folded = [
      ...(queue.merges[intoId] ?? []),
      id,
      ...(queue.merges[id] ?? []),
    ];
    const merges = { ...queue.merges, [intoId]: folded };
    delete merges[id];
    const deploy = byId.get(id);
    const into = byId.get(intoId);
    setQueue({ order: queue.order.filter((one) => one !== id), merges });
    if (deploy && into) {
      setSpoken(
        `${deploy.service} ${deploy.change} merged into ${into.change}, now ${changePhrase(folded.length + 1)} in one deploy.`,
      );
    }
    onMerge?.(intoId, id);
  };

  const focusRow = (index: number) => {
    const target = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (!target) return;
    setFocusId(target.deploy.id);
    document.getElementById(`${baseId}-row-${target.deploy.id}`)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(rows.length - 1);
    }
  };

  const tabbable =
    focusId && rows.some((row) => row.deploy.id === focusId)
      ? focusId
      : (rows[0]?.deploy.id ?? "");
  const waiting = rows.length;
  const totalWait = rows.reduce(
    (sum, row) => sum + row.deploy.waitedSeconds,
    0,
  );
  const left = Math.max(0, Math.min(headTotalSeconds, headSeconds));
  const share =
    headTotalSeconds > 0 ? Number((left / headTotalSeconds).toFixed(6)) : 0;
  const head = rows[0];
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 overflow-clip rounded-3 border border-hairline bg-surface-1 p-2 [contain:paint]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          {/* One cell, cross-faded: a depth that swapped through mode="wait"
              would blank between two quick merges. */}
          <span className="grid">
            <AnimatePresence initial={false}>
              <motion.span
                key={waiting}
                className="col-start-1 row-start-1 font-mono text-[11px] font-medium text-ink tabular-nums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {deployPhrase(waiting)}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            waiting · {waitShort(totalWait)} in all
          </span>
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={holding}
          aria-label="Hold the head of the queue"
          onClick={() => setHeld(!holding)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong pr-2.5 pl-1 transition-colors hover:bg-accent",
            focusRing,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors",
              holding ? "bg-warn" : "bg-hairline-strong",
            )}
          >
            <motion.span
              className="block size-3 rounded-full bg-surface-0"
              initial={false}
              animate={{ x: holding ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
          <span className="font-mono text-[10px] font-medium text-ink">
            Hold
          </span>
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2 border border-dashed border-hairline-strong px-2 py-3 text-center font-mono text-[11px] text-ink-3">
          Nothing is waiting to deploy.
        </p>
      ) : null}

      <ol role="list" className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {rows.map(({ deploy, folded }, index) => {
            const isHead = index === 0;
            const above = rows[index - 1];
            const mergeable = above?.deploy.service === deploy.service;
            const changes = folded.length + 1;
            return (
              <motion.li
                key={deploy.id}
                layout={motionSafe ? "position" : false}
                className={cn(
                  "flex items-stretch gap-1 overflow-clip rounded-2 border bg-surface-0 [contain:paint]",
                  isHead ? "border-cobalt-bright/40" : "border-hairline",
                  isHead && holding && "opacity-70",
                )}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={glide}
              >
                <button
                  type="button"
                  id={`${baseId}-row-${deploy.id}`}
                  // aria-disabled, never `disabled`: the head is often the one
                  // row the roving tabindex points at, and a disabled control
                  // would lock the keyboard out of the list entirely.
                  aria-disabled={isHead}
                  aria-label={
                    isHead
                      ? `Next out: ${deploy.service} ${deploy.change} by ${deploy.author}, ${changePhrase(changes)}, waiting ${waitPhrase(deploy.waitedSeconds)}.`
                      : `${ordinal(index + 1)} in the queue: ${deploy.service} ${deploy.change} by ${deploy.author}, ${changePhrase(changes)}, waiting ${waitPhrase(deploy.waitedSeconds)}. Press to promote to ${ordinal(index)}.`
                  }
                  tabIndex={deploy.id === tabbable ? 0 : -1}
                  onFocus={() => setFocusId(deploy.id)}
                  onClick={() => promote(deploy.id)}
                  onKeyDown={(event) => onRowKeyDown(event, index)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left transition-colors",
                    isHead ? "cursor-default" : "hover:bg-accent",
                    focusRing,
                  )}
                >
                  <span className="flex w-full items-baseline gap-1.5">
                    <span className="w-3.5 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-ink">
                      {deploy.service}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-2">
                      {deploy.change}
                    </span>
                  </span>
                  <span className="flex w-full items-baseline gap-1.5 pl-5 font-mono text-[10px] text-ink-3">
                    <span className="min-w-0 flex-1 truncate">
                      {deploy.author}
                      {isHead
                        ? holding
                          ? " · held"
                          : ` · out in ${Math.round(left)} s`
                        : ""}
                    </span>
                    {changes > 1 ? (
                      <span className="grid shrink-0 justify-items-end">
                        <AnimatePresence initial={false}>
                          <motion.span
                            key={changes}
                            className="col-start-1 row-start-1 text-cobalt-bright tabular-nums"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={fade}
                          >
                            {changePhrase(changes)}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                    ) : null}
                    <span className="shrink-0 tabular-nums">
                      {waitShort(deploy.waitedSeconds)}
                    </span>
                  </span>
                </button>

                {mergeable && above ? (
                  <button
                    type="button"
                    aria-label={`Merge ${deploy.service} ${deploy.change} into ${above.deploy.change} above it`}
                    onClick={() => merge(deploy.id)}
                    className={cn(
                      "my-1 mr-1 flex w-11 shrink-0 items-center justify-center rounded-1 border border-hairline-strong font-mono text-[9px] tracking-[0.08em] text-ink-2 uppercase transition-colors hover:bg-accent",
                      focusRing,
                    )}
                  >
                    Merge
                  </button>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {head ? (
        <div
          role="timer"
          aria-label={
            holding
              ? `${head.deploy.service} ${head.deploy.change} is held at the head of the queue.`
              : `${head.deploy.service} ${head.deploy.change} goes out in ${waitPhrase(left)}.`
          }
          className="relative h-1 w-full overflow-clip rounded-full bg-hairline [contain:paint]"
        >
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
              holding ? "bg-warn" : "bg-cobalt-bright",
            )}
            initial={{ scaleX: share }}
            animate={{ scaleX: share }}
            transition={glide}
          />
        </div>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
