"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Inbox,
  Link2,
  Lock,
  Plus,
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

export type ChainTask = {
  id: string;
  /** Reference, e.g. "BB-412". */
  ref: string;
  title: string;
  /** Who has it. */
  owner?: string;
  /** Working days it takes; weights the critical path. @default 1 */
  days?: number;
  /** Ids of the tasks that must finish before this one can start. */
  blockedBy: string[];
};

/**
 * Task id to the ids blocking it: the live chains, which start from each
 * task's `blockedBy` and change as blockers are added and removed.
 */
export type ChainBlockers = Record<string, string[]>;

export type ChainChange = {
  id: string;
  to: "done" | "open";
  /** Tasks whose last chain this change broke. */
  unblocked: string[];
};

export type ChainBlockerChange = {
  /** The task that is (or was) blocked. */
  id: string;
  blocker: string;
  to: "added" | "removed";
};

export type ChainStyle = "chain" | "line" | "dots";
export type ChainDensity = "compact" | "cozy" | "roomy";
export type ChainAccent = "cobalt" | "signal" | "success";
export type ChainStatus = "ready" | "loading" | "error";

export type BlockerChainsProps = {
  /** How a chain is drawn down the gutter: linked dashes, one plain line, or a run of dots. @default "chain" */
  chainStyle?: ChainStyle;
  /** Row height and type size. @default "cozy" */
  density?: ChainDensity;
  /** The colour of done ticks, the critical path, its switch and a fresh unblock. @default "cobalt" */
  accent?: ChainAccent;
  /** The tasks, in list order, each with the ids blocking it. @default defaultChainTasks */
  tasks?: ChainTask[];
  /** Controlled ids of the done tasks. */
  value?: string[];
  /** Initial done ids when uncontrolled. @default defaultChainDone */
  defaultValue?: string[];
  /** Fires from the press or key that completed or reopened a task, with every done id and what it unblocked. */
  onChange?: (done: string[], change: ChainChange) => void;
  /** Controlled chains: task id to the ids blocking it. */
  blockers?: ChainBlockers;
  /** Initial chains when uncontrolled. @default each task's blockedBy */
  defaultBlockers?: ChainBlockers;
  /** A chain was added from the picker or removed with Delete. */
  onBlockersChange?: (
    blockers: ChainBlockers,
    change: ChainBlockerChange,
  ) => void;
  /** Controlled critical-path switch. */
  criticalPath?: boolean;
  /** Initial switch state when uncontrolled. @default false */
  defaultCriticalPath?: boolean;
  /** The switch was turned. */
  onCriticalPathChange?: (on: boolean) => void;
  /** Whether the tasks have arrived. @default "ready" */
  status?: ChainStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Coldbrook unit fit-out" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the list in px; the rows scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be completed, chained or unchained. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/**
 * Basinworks Builds' fit-out of the Coldbrook unit: twelve tasks from the
 * slab to the inspection, with a kitchen order that gates the end and a pair
 * of fixture tasks that wait on each other.
 */
export const defaultChainTasks: ChainTask[] = [
  {
    id: "bb-402",
    ref: "BB-402",
    title: "Pour the slab",
    owner: "Tomas Reyes",
    days: 2,
    blockedBy: [],
  },
  {
    id: "bb-405",
    ref: "BB-405",
    title: "Frame the walls",
    owner: "Mara Lind",
    days: 5,
    blockedBy: ["bb-402"],
  },
  {
    id: "bb-409",
    ref: "BB-409",
    title: "Rough-in electrics",
    owner: "Kenji Aoki",
    days: 3,
    blockedBy: ["bb-405"],
  },
  {
    id: "bb-411",
    ref: "BB-411",
    title: "Rough-in plumbing",
    owner: "Priya Nair",
    days: 4,
    blockedBy: ["bb-405"],
  },
  {
    id: "bb-414",
    ref: "BB-414",
    title: "Plasterboard",
    owner: "Mara Lind",
    days: 3,
    blockedBy: ["bb-409", "bb-411"],
  },
  {
    id: "bb-416",
    ref: "BB-416",
    title: "Paint",
    owner: "Ines Varga",
    days: 2,
    blockedBy: ["bb-414"],
  },
  {
    id: "bb-421",
    ref: "BB-421",
    title: "Order the kitchen",
    owner: "Tomas Reyes",
    days: 10,
    blockedBy: [],
  },
  {
    id: "bb-418",
    ref: "BB-418",
    title: "Fit the kitchen",
    owner: "Kenji Aoki",
    days: 3,
    blockedBy: ["bb-416", "bb-421"],
  },
  {
    id: "bb-423",
    ref: "BB-423",
    title: "Tile the wet room",
    owner: "Priya Nair",
    days: 2,
    blockedBy: ["bb-411"],
  },
  {
    id: "bb-425",
    ref: "BB-425",
    title: "Final inspection",
    owner: "Ines Varga",
    days: 1,
    blockedBy: ["bb-418", "bb-423"],
  },
  {
    id: "bb-427",
    ref: "BB-427",
    title: "Approve the fixture spec",
    owner: "Ines Varga",
    days: 1,
    blockedBy: ["bb-429"],
  },
  {
    id: "bb-429",
    ref: "BB-429",
    title: "Order fixtures",
    owner: "Tomas Reyes",
    days: 6,
    blockedBy: ["bb-427"],
  },
];

/** The slab is poured. */
export const defaultChainDone: string[] = ["bb-402"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<ChainAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const DENSITY: Record<
  ChainDensity,
  { row: number; text: string; ref: string; pad: string }
> = {
  compact: { row: 34, text: "text-[12px]", ref: "text-[10px]", pad: "py-0.5" },
  cozy: { row: 42, text: "text-[13px]", ref: "text-[11px]", pad: "py-1" },
  roomy: { row: 50, text: "text-[14px]", ref: "text-[11px]", pad: "py-1.5" },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** Horizontal room each chain lane takes in the gutter, in px. */
const LANE = 9;
/** Gutter width with no chains at all: room for the end marks. */
const GUTTER_MIN = 30;
const CORNER = 5;
const BREAK_MS = 560;
const FLASH_MS = 760;
const NUDGE_MS = 130;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const edgeKey = (blocked: string, blocker: string) => `${blocked}<${blocker}`;

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** The chains as the tasks declare them: the uncontrolled starting point. */
export const blockersOf = (tasks: ChainTask[]): ChainBlockers =>
  Object.fromEntries(tasks.map((t) => [t.id, [...t.blockedBy]]));

/** Ids that sit on a cycle of chains: each waits, through others, on itself. */
export const circularTasks = (
  tasks: ChainTask[],
  blockers: ChainBlockers,
): Set<string> => {
  const ids = new Set(tasks.map((t) => t.id));
  const out = new Set<string>();
  const reaches = (from: string, target: string, seen: Set<string>) => {
    for (const next of blockers[from] ?? []) {
      if (!ids.has(next)) continue;
      if (next === target) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      if (reaches(next, target, seen)) return true;
    }
    return false;
  };
  for (const id of ids) {
    if (reaches(id, id, new Set([id]))) out.add(id);
  }
  return out;
};

/** Open tasks whose every blocker is done and that sit on no cycle: what can start now. */
export const unblockedNow = (
  tasks: ChainTask[],
  blockers: ChainBlockers,
  done: string[],
): string[] => {
  const ids = new Set(tasks.map((t) => t.id));
  const doneSet = new Set(done);
  const circular = circularTasks(tasks, blockers);
  return tasks
    .filter(
      (t) =>
        !doneSet.has(t.id) &&
        !circular.has(t.id) &&
        (blockers[t.id] ?? []).every((b) => !ids.has(b) || doneSet.has(b)),
    )
    .map((t) => t.id);
};

/**
 * The longest run of open chains, blocker first, weighted by each task's
 * days: the work that sets the end date. Cycles are left out of it.
 */
export const criticalChain = (
  tasks: ChainTask[],
  blockers: ChainBlockers,
  done: string[],
): { ids: string[]; days: number } => {
  const doneSet = new Set(done);
  const circular = circularTasks(tasks, blockers);
  const open = new Map(
    tasks
      .filter((t) => !doneSet.has(t.id) && !circular.has(t.id))
      .map((t) => [t.id, t]),
  );
  const memo = new Map<string, { days: number; prev: string | null }>();
  const best = (id: string): { days: number; prev: string | null } => {
    const hit = memo.get(id);
    if (hit) return hit;
    const own = open.get(id)?.days ?? 1;
    let out = { days: own, prev: null as string | null };
    for (const b of blockers[id] ?? []) {
      if (!open.has(b)) continue;
      const total = own + best(b).days;
      if (total > out.days) out = { days: total, prev: b };
    }
    memo.set(id, out);
    return out;
  };
  let top: string | null = null;
  let topDays = 0;
  for (const id of open.keys()) {
    const b = best(id);
    if (b.days > topDays) {
      topDays = b.days;
      top = id;
    }
  }
  const ids: string[] = [];
  let cursor = top;
  while (cursor) {
    ids.unshift(cursor);
    cursor = memo.get(cursor)?.prev ?? null;
  }
  return { ids, days: topDays };
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
/*                                  Chains                                  */
/* ----------------------------------------------------------------------- */

type Edge = {
  key: string;
  blocked: string;
  blocker: string;
  lane: number;
  circular: boolean;
  critical: boolean;
};

type Geo = { ys: Record<string, number> };

type Piece = { top: string; bottom: string; whole: string };

/** Lays every chain in the narrowest lane where it crosses no other. */
function assignLanes(
  pairs: { key: string; a: number; b: number }[],
): Record<string, number> {
  const sorted = [...pairs].sort(
    (p, q) => Math.abs(p.b - p.a) - Math.abs(q.b - q.a),
  );
  const lanes: { lo: number; hi: number }[][] = [];
  const out: Record<string, number> = {};
  for (const p of sorted) {
    const lo = Math.min(p.a, p.b);
    const hi = Math.max(p.a, p.b);
    let lane = lanes.findIndex((spans) =>
      spans.every((s) => hi < s.lo || lo > s.hi),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]?.push({ lo, hi });
    out[p.key] = lane;
  }
  return out;
}

/** The chain's path from the blocker's row down the gutter to the blocked row, and its two halves. */
function chainPath(x0: number, lx: number, y0: number, y1: number): Piece {
  const dir = y1 >= y0 ? 1 : -1;
  const span = Math.abs(y1 - y0);
  const mid = r3((y0 + y1) / 2);
  if (span < CORNER * 2 + 2) {
    return {
      whole: `M ${x0} ${y0} H ${lx} V ${y1} H ${x0}`,
      top: `M ${x0} ${y0} H ${lx} V ${mid}`,
      bottom: `M ${lx} ${mid} V ${y1} H ${x0}`,
    };
  }
  const c = CORNER;
  const head = `M ${x0} ${y0} H ${lx + c} Q ${lx} ${y0} ${lx} ${r3(y0 + dir * c)}`;
  const tail = `V ${r3(y1 - dir * c)} Q ${lx} ${y1} ${lx + c} ${y1} H ${x0}`;
  return {
    whole: `${head} ${tail}`,
    top: `${head} V ${mid}`,
    bottom: `M ${lx} ${mid} ${tail}`,
  };
}

const strokeFor = (style: ChainStyle) =>
  style === "chain"
    ? {
        strokeWidth: 2,
        strokeDasharray: "5 3.5",
        strokeLinecap: "round" as const,
      }
    : style === "dots"
      ? {
          strokeWidth: 2.4,
          strokeDasharray: "0 5",
          strokeLinecap: "round" as const,
        }
      : {
          strokeWidth: 1.5,
          strokeDasharray: undefined,
          strokeLinecap: "round" as const,
        };

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  task: ChainTask;
  index: number;
  count: number;
  done: boolean;
  blockedBy: ChainTask[];
  circular: boolean;
  onPath: boolean;
  critOn: boolean;
  flashSeq: number | undefined;
  nudgeSeq: number | undefined;
  density: ChainDensity;
  motionSafe: boolean;
  active: boolean;
  inert: boolean;
  hintId: string;
  pickerOpen: boolean;
  nodeRef: (node: HTMLLIElement | null) => void;
  onToggle: () => void;
  onPick: () => void;
  onUnchain: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function Row({
  task,
  index,
  count,
  done,
  blockedBy,
  circular,
  onPath,
  critOn,
  flashSeq,
  nudgeSeq,
  density,
  motionSafe,
  active,
  inert,
  hintId,
  pickerOpen,
  nodeRef,
  onToggle,
  onPick,
  onUnchain,
  onFocus,
  onNav,
}: RowProps) {
  const d = DENSITY[density];
  const blocked = !done && blockedBy.length > 0;
  // A refused press: the lock badge jumps and lands again on recoil.
  const nudged = nudgeSeq !== undefined;

  const state = done
    ? "done"
    : circular
      ? `circular, waits on ${listWords(blockedBy.map((b) => b.ref))}`
      : blocked
        ? `blocked by ${listWords(blockedBy.map((b) => b.ref))}`
        : "ready";
  const dim = done ? 0.5 : critOn && !onPath ? 0.42 : blocked ? 0.66 : 1;

  return (
    <li
      ref={nodeRef}
      role="option"
      aria-selected={active}
      aria-label={`${task.ref}, ${task.title}${task.owner ? `, ${task.owner}` : ""}, ${state}${
        onPath ? ", on the critical path" : ""
      }, ${index + 1} of ${count}`}
      aria-describedby={hintId}
      aria-disabled={inert || undefined}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onToggle();
          return;
        }
        if ((event.key === "b" || event.key === "B") && !event.metaKey) {
          event.preventDefault();
          onPick();
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onUnchain();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "group relative grid cursor-default items-center gap-x-2 rounded-2 pr-2",
        "grid-cols-[var(--bc-gutter)_1rem_2.75rem_minmax(0,1fr)_auto]",
        d.text,
        !inert && "hover:bg-surface-1",
        active && "bg-surface-1/60",
        FOCUS_RING,
      )}
      style={{ minHeight: d.row }}
    >
      {/* A fresh unblock: the row brightens from its left edge on snap. */}
      <AnimatePresence>
        {flashSeq !== undefined ? (
          <motion.span
            key={flashSeq}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2"
            style={{
              originX: 0,
              background:
                "color-mix(in oklab, var(--bc-accent) 14%, transparent)",
            }}
            initial={motionSafe ? { scaleX: 0, opacity: 1 } : { opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.slow) }}
            transition={
              motionSafe
                ? { scaleX: springs.snap, opacity: { duration: 0 } }
                : { duration: durations.fast }
            }
          />
        ) : null}
      </AnimatePresence>

      {/* The critical path's bar along the row. */}
      <AnimatePresence>
        {critOn && onPath ? (
          <motion.span
            aria-hidden
            className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full"
            style={{ background: "var(--bc-accent)", originY: 0 }}
            initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          />
        ) : null}
      </AnimatePresence>

      {/* The gutter the chains run down; the SVG overlay draws into it. */}
      <span aria-hidden />

      {/* Done mark: a press toggles it; the tick draws on flick. */}
      <motion.span
        aria-hidden
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
          onToggle();
        }}
        className={cn(
          "relative z-10 flex size-4 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-transparent"
            : blocked || circular
              ? "border-hairline-strong bg-surface-2 text-ink-3"
              : "border-hairline-strong bg-card text-ink-3",
          inert ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{ background: done ? "var(--bc-accent)" : undefined }}
        whileTap={motionSafe && !inert ? { scale: 0.86 } : undefined}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        {done ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-2.5 text-card">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : blocked || circular ? (
          <Lock aria-hidden className="size-2" />
        ) : null}
      </motion.span>

      <span
        className={cn(
          "font-mono text-ink-3 tabular-nums",
          d.ref,
          done && "line-through",
        )}
      >
        {task.ref}
      </span>

      <motion.span
        className={cn("flex min-w-0 items-baseline gap-x-2", d.pad)}
        initial={false}
        animate={{ opacity: dim }}
        transition={motionSafe ? springs.snap : { duration: durations.fast }}
      >
        <span className={cn("truncate", done && "line-through")}>
          {task.title}
        </span>
        {task.owner ? (
          <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[34rem]:inline">
            {task.owner}
          </span>
        ) : null}
      </motion.span>

      <span className="relative z-10 flex shrink-0 items-center gap-1.5">
        <AnimatePresence initial={false}>
          {circular ? (
            <motion.span
              key="circular"
              className="inline-flex h-5 items-center gap-1 rounded-full border px-1.5 font-mono text-[10px] tracking-[0.04em] text-danger uppercase"
              style={{
                borderColor:
                  "color-mix(in oklab, var(--danger) 45%, transparent)",
                background:
                  "color-mix(in oklab, var(--danger) 10%, transparent)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert aria-hidden className="size-3" />
              circular
            </motion.span>
          ) : blocked ? (
            <motion.span
              key="lock"
              className="inline-flex h-5 items-center gap-1 rounded-full border border-hairline-strong bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2 tabular-nums"
              initial={{ opacity: 0, y: 0 }}
              animate={{
                opacity: 1,
                y: 0,
                x: nudged && motionSafe ? distances.nudge : 0,
              }}
              exit={{
                opacity: 0,
                y: motionSafe ? distances.step : 0,
                transition: exitFor(),
              }}
              transition={{
                x: springs.recoil,
                opacity: { duration: durations.base, ease: easings.enter },
              }}
            >
              <Lock aria-hidden className="size-3" />
              <span className="hidden @min-[40rem]:inline">
                by {blockedBy.map((b) => b.ref).join(", ")}
              </span>
              <span className="@min-[40rem]:hidden">{blockedBy.length}</span>
              <Link2 aria-hidden className="size-3 text-ink-3" />
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Pointer path to the picker; the keyboard presses B on the row. */}
        {!done && !inert ? (
          <span
            aria-hidden
            onClick={(event) => {
              event.stopPropagation();
              onFocus();
              onPick();
            }}
            className={cn(
              "inline-flex h-5 cursor-pointer items-center gap-0.5 rounded-full border border-dashed border-hairline-strong px-1.5 font-mono text-[10px] text-ink-3 transition-opacity hover:text-foreground",
              "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 @max-[30rem]:opacity-100",
              pickerOpen && "border-solid text-foreground opacity-100",
            )}
          >
            <Plus aria-hidden className="size-3" />
            <span className="hidden @min-[30rem]:inline">chain</span>
          </span>
        ) : null}
      </span>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Pop = {
  id: string;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

type Breaking = {
  key: string;
  piece: Piece;
  colour: string;
};

/**
 * A task list whose blockers are drawn as chains: a line that leaves a
 * blocker's row, runs down the gutter and hooks into the row it holds up.
 * Chains draw in on `springs.glide` when they are revealed, each one in the
 * narrowest lane where it crosses no other. Completing a blocker breaks every
 * chain hanging from it: the line snaps apart at its middle on
 * `springs.recoil`, the blocked task's lock badge drops away, and its row
 * brightens from the left on `springs.snap` while the count of tasks that can
 * start now rolls. A press on a blocked task is refused: its badge jumps on
 * recoil and the announcement names what to finish first. Tasks that wait on
 * each other, through any number of chains, are flagged circular in red.
 *
 * Chain on a row opens a picker — a listbox of the other open tasks — and a
 * choice draws the new chain at once. The critical-path switch lights the
 * longest run of open work by days, bars its rows, and dims the rest.
 *
 * The rows are one listbox: Up and Down move, Space or Enter completes or
 * reopens, B opens the picker, Delete drops the newest chain, and Escape
 * closes the picker and returns to the row. The chains themselves are not
 * focusable; each row's label reads its blockers. Under reduced motion
 * nothing draws, travels or snaps — chains, badges and bars appear and fade
 * in place, the digits change without rolling, and every state is still
 * reached and announced.
 */
export function BlockerChains({
  chainStyle = "chain",
  density = "cozy",
  accent = "cobalt",
  tasks = defaultChainTasks,
  value,
  defaultValue = defaultChainDone,
  onChange,
  blockers,
  defaultBlockers,
  onBlockersChange,
  criticalPath,
  defaultCriticalPath = false,
  onCriticalPathChange,
  status = "ready",
  onRetry,
  title = "Coldbrook unit fit-out",
  label,
  height = 540,
  disabled = false,
  className,
}: BlockerChainsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const popId = `${uid}-pop`;
  const popTitleId = `${uid}-pop-title`;

  const [ownDone, setOwnDone] = React.useState<string[]>(defaultValue);
  const done = value ?? ownDone;
  const [ownBlockers, setOwnBlockers] = React.useState<ChainBlockers>(
    () => defaultBlockers ?? blockersOf(tasks),
  );
  const chains = blockers ?? ownBlockers;
  const [ownCrit, setOwnCrit] = React.useState(defaultCriticalPath);
  const critOn = criticalPath ?? ownCrit;

  const ready = status === "ready";
  const inert = disabled || !ready;

  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pop, setPop] = React.useState<Pop | null>(null);
  const [popActive, setPopActive] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<Record<string, number>>({});
  const [nudge, setNudge] = React.useState<Record<string, number>>({});
  const [breaking, setBreaking] = React.useState<Breaking[]>([]);
  // The chains revealed together by the last change, in draw order: the
  // whole set on first measure, one new chain after a pick.
  const [batch, setBatch] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [listEl, setListEl] = React.useState<HTMLUListElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const optionNodes = React.useRef(new Map<string, HTMLLIElement>());
  const timers = React.useRef(new Set<number>());
  const seq = React.useRef(0);
  const edgeKeys = React.useRef<string[]>([]);
  const lastPieces = React.useRef(
    new Map<string, { piece: Piece; colour: string }>(),
  );
  const returnFocus = React.useRef<string | null>(null);
  const popFirst = React.useRef<string | null>(null);

  const later = React.useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  /* -------------------------------- data ------------------------------- */

  const byId = React.useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );
  const doneSet = new Set(done.filter((id) => byId.has(id)));
  const circular = circularTasks(tasks, chains);
  const total = tasks.length;
  const unblocked = unblockedNow(tasks, chains, done);
  const crit = criticalChain(tasks, chains, done);
  const critSet = new Set(crit.ids);
  const critEdges = new Set(
    crit.ids.slice(1).map((id, i) => edgeKey(id, crit.ids[i] ?? "")),
  );

  const blockersOfTask = (id: string): ChainTask[] =>
    (chains[id] ?? [])
      .map((b) => byId.get(b))
      .filter((t): t is ChainTask => !!t && !doneSet.has(t.id));

  const rowIndex = new Map(tasks.map((t, i) => [t.id, i]));
  const pairs = tasks.flatMap((t) =>
    doneSet.has(t.id)
      ? []
      : blockersOfTask(t.id).map((b) => ({
          key: edgeKey(t.id, b.id),
          blocked: t.id,
          blocker: b.id,
          a: rowIndex.get(b.id) ?? 0,
          b: rowIndex.get(t.id) ?? 0,
        })),
  );
  const lanes = assignLanes(pairs);
  const laneCount = pairs.length
    ? Math.max(...pairs.map((p) => lanes[p.key] ?? 0)) + 1
    : 0;
  const gutter = Math.max(GUTTER_MIN, 18 + laneCount * LANE + 6);
  const edges: Edge[] = pairs.map((p) => ({
    key: p.key,
    blocked: p.blocked,
    blocker: p.blocker,
    lane: lanes[p.key] ?? 0,
    circular: circular.has(p.blocked) && circular.has(p.blocker),
    critical: critEdges.has(p.key),
  }));

  const ids = tasks.map((t) => t.id);
  const active = activeId && byId.has(activeId) ? activeId : (ids[0] ?? null);

  /* ----------------------------- measuring ----------------------------- */

  const shapeKey = `${ids.join("|")}:${density}:${status}:${gutter}`;

  const measure = React.useCallback(() => {
    const list = listEl;
    if (!list) return;
    const ys: Record<string, number> = {};
    for (const [id, node] of rowNodes.current) {
      ys[id] = r3(node.offsetTop + node.offsetHeight / 2);
    }
    setGeo((prev) => {
      if (
        prev &&
        Object.keys(ys).length === Object.keys(prev.ys).length &&
        Object.entries(ys).every(([k, v]) => prev.ys[k] === v)
      ) {
        return prev;
      }
      // The first measure reveals every chain at once, as a cascade.
      if (!prev) setBatch(edgeKeys.current);
      return { ys };
    });
  }, [listEl]);

  // Rows are measured once after each change of shape, and again only when
  // the list itself resizes: nothing runs between.
  React.useLayoutEffect(() => {
    if (!listEl) return;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [listEl, measure, shapeKey]);

  React.useEffect(() => {
    if (!listEl || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    });
    ro.observe(listEl);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [listEl, measure]);

  /* ------------------------------ geometry ----------------------------- */

  const x0 = gutter - 7;
  const colourOf = (edge: Edge) =>
    edge.circular
      ? "var(--danger)"
      : critOn && edge.critical
        ? "var(--bc-accent)"
        : "var(--ink-3)";

  const drawn = geo
    ? edges.flatMap((edge) => {
        const y0 = geo.ys[edge.blocker];
        const y1 = geo.ys[edge.blocked];
        if (y0 === undefined || y1 === undefined) return [];
        const lx = gutter - 15 - edge.lane * LANE;
        return [
          {
            edge,
            piece: chainPath(x0, lx, y0, y1),
            colour: colourOf(edge),
            y0,
            y1,
          },
        ];
      })
    : [];

  // Chains revealed together draw in a cascade; a lone new chain has no delay.
  const step = cascade(Math.max(1, batch.length));
  const delayFor = (key: string) => {
    const i = batch.indexOf(key);
    return i < 0 ? 0 : r3(Math.min(i, 10) * step);
  };

  React.useEffect(() => {
    const now = new Map<string, { piece: Piece; colour: string }>();
    for (const d of drawn)
      now.set(d.edge.key, { piece: d.piece, colour: d.colour });
    lastPieces.current = now;
    edgeKeys.current = edges.map((e) => e.key);
  });

  /* ------------------------------- changes ----------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  /** Marks the chains about to vanish so they can snap apart before they go. */
  const breakChains = (keys: string[]) => {
    if (!motionSafe || keys.length === 0) return;
    const pieces = keys.flatMap((key) => {
      const hit = lastPieces.current.get(key);
      return hit ? [{ key, piece: hit.piece, colour: hit.colour }] : [];
    });
    if (pieces.length === 0) return;
    setBreaking((b) => [...b, ...pieces]);
    later(() => {
      setBreaking((b) => b.filter((x) => !pieces.some((p) => p.key === x.key)));
    }, BREAK_MS);
  };

  const flashRows = (rowIds: string[]) => {
    if (rowIds.length === 0) return;
    seq.current += 1;
    const mark = seq.current;
    setFlash((f) => {
      const next = { ...f };
      for (const id of rowIds) next[id] = mark;
      return next;
    });
    later(() => {
      setFlash((f) => {
        const next = { ...f };
        for (const id of rowIds) if (next[id] === mark) delete next[id];
        return next;
      });
    }, FLASH_MS);
  };

  const refuse = (task: ChainTask) => {
    seq.current += 1;
    const mark = seq.current;
    setNudge((n) => ({ ...n, [task.id]: mark }));
    later(() => {
      setNudge((n) => {
        if (n[task.id] !== mark) return n;
        const next = { ...n };
        delete next[task.id];
        return next;
      });
    }, NUDGE_MS);
    const names = blockersOfTask(task.id).map((b) => b.ref);
    announce(
      circular.has(task.id)
        ? `${task.ref} is circular: it waits on ${listWords(names)}, which waits on it. Drop a chain first.`
        : `${task.ref} is blocked by ${listWords(names)}. Finish that first.`,
    );
  };

  const toggleDone = (id: string) => {
    if (inert) return;
    const task = byId.get(id);
    if (!task) return;
    const was = doneSet.has(id);
    if (!was && (blockersOfTask(id).length > 0 || circular.has(id))) {
      refuse(task);
      return;
    }
    const next = was ? done.filter((d) => d !== id) : [...done, id];
    const before = new Set(unblocked);
    const after = unblockedNow(tasks, chains, next);
    const freed = after.filter((t) => !before.has(t));
    if (!was) {
      // Every chain hanging from this blocker breaks.
      breakChains(edges.filter((e) => e.blocker === id).map((e) => e.key));
      flashRows(freed);
    } else {
      // Its chains come back, drawn together.
      setBatch(
        tasks
          .filter(
            (t) => !doneSet.has(t.id) && (chains[t.id] ?? []).includes(id),
          )
          .map((t) => edgeKey(t.id, id)),
      );
    }
    if (value === undefined) setOwnDone(next);
    onChange?.(next, { id, to: was ? "open" : "done", unblocked: freed });
    const freedRefs = freed.map((f) => byId.get(f)?.ref ?? f);
    announce(
      was
        ? `${task.ref} reopened. ${after.length} of ${total} can start now.`
        : `${task.ref} done.${
            freed.length
              ? ` Chain broken: ${listWords(freedRefs)} ${freed.length === 1 ? "is" : "are"} unblocked.`
              : ""
          } ${after.length} of ${total} can start now.`,
    );
  };

  const setChains = (next: ChainBlockers, change: ChainBlockerChange) => {
    if (blockers === undefined) setOwnBlockers(next);
    onBlockersChange?.(next, change);
  };

  const addChain = (id: string, blocker: string) => {
    if (inert || id === blocker) return;
    const current = chains[id] ?? [];
    if (current.includes(blocker)) return;
    const next = { ...chains, [id]: [...current, blocker] };
    setChains(next, { id, blocker, to: "added" });
    setBatch([edgeKey(id, blocker)]);
    const task = byId.get(id);
    const b = byId.get(blocker);
    const loops = circularTasks(tasks, next).has(id);
    announce(
      `${task?.ref ?? id} now blocked by ${b?.ref ?? blocker}.${
        loops ? " That makes a circle." : ""
      } ${unblockedNow(tasks, next, done).length} of ${total} can start now.`,
    );
  };

  const removeChain = (id: string, blocker: string) => {
    if (inert) return;
    const current = chains[id] ?? [];
    if (!current.includes(blocker)) return;
    const next = { ...chains, [id]: current.filter((b) => b !== blocker) };
    breakChains([edgeKey(id, blocker)]);
    const before = new Set(unblocked);
    const after = unblockedNow(tasks, next, done);
    flashRows(after.filter((t) => !before.has(t)));
    setChains(next, { id, blocker, to: "removed" });
    const task = byId.get(id);
    const b = byId.get(blocker);
    announce(
      `Chain dropped: ${task?.ref ?? id} no longer waits on ${b?.ref ?? blocker}. ${after.length} of ${total} can start now.`,
    );
  };

  const unchainNewest = (id: string) => {
    const current = chains[id] ?? [];
    const newest = [...current].reverse().find((b) => byId.has(b));
    if (!newest) {
      announce(`${byId.get(id)?.ref ?? id} has no chain to drop.`);
      return;
    }
    removeChain(id, newest);
  };

  const setCrit = (on: boolean) => {
    if (disabled) return;
    if (criticalPath === undefined) setOwnCrit(on);
    onCriticalPathChange?.(on);
    announce(
      on
        ? crit.ids.length
          ? `Critical path shown: ${crit.ids.length} ${crit.ids.length === 1 ? "task" : "tasks"}, ${crit.days} ${crit.days === 1 ? "day" : "days"}, ${crit.ids.map((i) => byId.get(i)?.ref ?? i).join(" then ")}.`
          : "Critical path shown: nothing is left on it."
        : "Critical path hidden.",
    );
  };

  /* ------------------------------- picker ------------------------------ */

  const openPicker = (id: string) => {
    if (inert) return;
    const root = rootRef.current;
    const row = rowNodes.current.get(id);
    if (!root || !row) return;
    if (pop?.id === id) {
      closePicker(true);
      return;
    }
    const rr = root.getBoundingClientRect();
    const br = row.getBoundingClientRect();
    const width = Math.round(Math.min(300, rr.width - 16));
    const left = Math.round(
      clamp(br.right - rr.left - width, 8, rr.width - width - 8),
    );
    const below = rr.bottom - br.bottom - 8;
    const above = br.top - rr.top - 8;
    const base = { id, left, width };
    if (below >= 150 || below >= above) {
      setPop({
        ...base,
        top: Math.round(br.bottom - rr.top + 4),
        maxHeight: Math.round(clamp(below - 4, 96, 300)),
      });
    } else {
      setPop({
        ...base,
        bottom: Math.round(rr.bottom - br.top + 4),
        maxHeight: Math.round(clamp(above - 4, 96, 300)),
      });
    }
    returnFocus.current = id;
    const first = tasks.find((t) => t.id !== id && !doneSet.has(t.id));
    popFirst.current = first?.id ?? null;
    setPopActive(first?.id ?? null);
  };

  const closePicker = (focusRow: boolean) => {
    const id = returnFocus.current;
    setPop(null);
    if (focusRow && id)
      rowNodes.current.get(id)?.focus({ preventScroll: true });
  };

  const popFor = pop?.id ?? null;
  React.useEffect(() => {
    if (!popFor) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (rowNodes.current.get(popFor)?.contains(target)) return;
      setPop(null);
    };
    const scroller = scrollRef.current;
    const onScroll = () => setPop(null);
    document.addEventListener("pointerdown", onDown, true);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [popFor]);

  // The picker's first option takes focus once it is on the page.
  React.useLayoutEffect(() => {
    if (!popFor) return;
    const raf = requestAnimationFrame(() => {
      const first = popFirst.current;
      const node = first ? optionNodes.current.get(first) : null;
      (node ?? popRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [popFor]);

  /* ------------------------------ keyboard ----------------------------- */

  const onNav = (event: React.KeyboardEvent, id: string) => {
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else if (event.key === "Escape" && pop) {
      event.preventDefault();
      closePicker(true);
      return;
    } else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) rowNodes.current.get(target)?.focus();
  };

  const onPopNav = (event: React.KeyboardEvent, options: string[]) => {
    const i = popActive ? options.indexOf(popActive) : -1;
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closePicker(true);
      return;
    } else if (event.key === "Tab") {
      closePicker(false);
      return;
    } else return;
    event.preventDefault();
    const target = options[clamp(to, 0, Math.max(0, options.length - 1))];
    if (target) {
      setPopActive(target);
      optionNodes.current.get(target)?.focus({ preventScroll: true });
    }
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const stroke = strokeFor(chainStyle);
  const popTask = pop ? byId.get(pop.id) : undefined;
  const popOptions = pop
    ? tasks.filter((t) => t.id !== pop.id && !doneSet.has(t.id))
    : [];
  const popOptionIds = popOptions.map((t) => t.id);
  const popActiveId =
    popActive && popOptionIds.includes(popActive)
      ? popActive
      : (popOptionIds[0] ?? null);

  const critLine = crit.ids.map((i) => byId.get(i)?.ref ?? i).join(" > ");

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
      style={{ height, ["--bc-accent" as string]: ACCENTS[accent] }}
    >
      <p id={hintId} className="sr-only">
        Space or Enter completes or reopens. B adds a chain. Delete drops the
        newest chain.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && total > 0 ? (
            <p className="flex items-baseline gap-1 text-[11px] text-ink-3">
              <span className="sr-only">
                {unblocked.length} of {total} tasks can start now,{" "}
                {doneSet.size} done
              </span>
              <Roll
                value={unblocked.length}
                motionSafe={motionSafe}
                className="font-mono text-[12px] text-foreground"
              />
              <span aria-hidden>
                of {total} can start now
                <span className="hidden @min-[30rem]:inline">
                  {" "}
                  · {doneSet.size} done
                </span>
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={critOn}
          aria-label="Critical path"
          aria-disabled={disabled || !ready || undefined}
          onClick={() => {
            if (ready) setCrit(!critOn);
          }}
          className={cn(
            "flex h-7 shrink-0 items-center gap-2 rounded-full border px-1 pl-2 text-[11px] transition-colors",
            critOn
              ? "border-transparent text-foreground"
              : "border-hairline-strong text-ink-2 hover:text-foreground",
            FOCUS_RING,
          )}
          style={{
            background: critOn
              ? "color-mix(in oklab, var(--bc-accent) 14%, transparent)"
              : undefined,
          }}
        >
          <Route aria-hidden className="size-3.5" />
          <span className="hidden @min-[24rem]:inline">Critical path</span>
          <span
            aria-hidden
            className={cn(
              "relative flex h-4.5 w-8 items-center rounded-full border transition-colors",
              critOn
                ? "border-transparent"
                : "border-hairline-strong bg-surface-2",
            )}
            style={{ background: critOn ? "var(--bc-accent)" : undefined }}
          >
            <motion.span
              className="absolute top-0.5 size-3 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
              initial={false}
              animate={{ x: critOn ? 16 : 2 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </button>
      </header>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline"
      >
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The tasks didn&apos;t load.
            </p>
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
          <div aria-hidden className="flex flex-col gap-1 px-2 py-2">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="grid items-center gap-x-2 px-2"
                style={{
                  minHeight: d.row,
                  gridTemplateColumns: `${GUTTER_MIN}px 1rem 2.75rem minmax(0,1fr) auto`,
                }}
              >
                <span
                  className="h-px w-4 justify-self-end bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <span
                  className="size-4 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <span
                  className="h-2.5 w-9 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <span
                  className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${38 + ((i * 29) % 40)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
                <span
                  className={cn(
                    "h-5 w-10 rounded-full bg-surface-2 motion-safe:animate-pulse",
                    i % 3 === 0 && "invisible",
                  )}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-foreground">No tasks yet.</p>
            <p className="max-w-[26ch] text-[12px] text-ink-3">
              Add one, and chain it to whatever it waits on.
            </p>
          </div>
        ) : (
          <ul
            ref={setListEl}
            role="listbox"
            aria-labelledby={titleId}
            aria-describedby={hintId}
            className="relative flex flex-col gap-0.5 px-2 py-1.5"
            style={{ ["--bc-gutter" as string]: `${gutter}px` }}
          >
            {/* The chains: one overlay for the whole list, drawn into the
                gutter and never in the way of a press. */}
            <svg
              aria-hidden
              className="pointer-events-none absolute top-0 left-2 h-full overflow-visible"
              style={{ width: gutter }}
            >
              <AnimatePresence initial={false}>
                {drawn.map(({ edge, piece, colour, y0, y1 }) => {
                  const dimmed = critOn && !edge.critical && !edge.circular;
                  const delay = delayFor(edge.key);
                  return (
                    <motion.g
                      key={edge.key}
                      initial={false}
                      animate={{ opacity: dimmed ? 0.3 : 1 }}
                      // A chain that breaks is replaced by its two halves at
                      // once; only under reduced motion does it fade instead.
                      exit={{
                        opacity: 0,
                        transition: motionSafe
                          ? { duration: 0 }
                          : exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                    >
                      <motion.path
                        d={piece.whole}
                        fill="none"
                        stroke={colour}
                        strokeWidth={
                          edge.critical && critOn
                            ? stroke.strokeWidth + 0.6
                            : stroke.strokeWidth
                        }
                        strokeDasharray={stroke.strokeDasharray}
                        strokeLinecap={stroke.strokeLinecap}
                        strokeLinejoin="round"
                        initial={
                          motionSafe
                            ? { pathLength: 0, opacity: 1 }
                            : { opacity: 0 }
                        }
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={
                          motionSafe
                            ? {
                                pathLength: { ...springs.glide, delay },
                                opacity: { duration: 0 },
                              }
                            : { duration: durations.base }
                        }
                      />
                      {/* The blocker's end: a filled stud. */}
                      <motion.circle
                        cx={x0}
                        cy={y0}
                        r={2.4}
                        fill={colour}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: durations.fast, delay }}
                      />
                      {/* The blocked end: an open link hooked on the row. */}
                      <motion.circle
                        cx={x0}
                        cy={y1}
                        r={3}
                        fill="var(--bg-0)"
                        stroke={colour}
                        strokeWidth={1.5}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: durations.fast,
                          delay: motionSafe ? delay + durations.base : 0,
                        }}
                      />
                    </motion.g>
                  );
                })}
              </AnimatePresence>
              {/* A chain that just broke: its two halves part on recoil. */}
              {breaking.map((b) => (
                <g key={`break-${b.key}`}>
                  <motion.path
                    d={b.piece.top}
                    fill="none"
                    stroke={b.colour}
                    strokeWidth={stroke.strokeWidth}
                    strokeDasharray={stroke.strokeDasharray}
                    strokeLinecap={stroke.strokeLinecap}
                    initial={{ y: 0, x: 0, opacity: 1 }}
                    animate={{
                      y: -distances.step,
                      x: -distances.nudge,
                      opacity: 0,
                    }}
                    transition={{
                      y: springs.recoil,
                      x: springs.recoil,
                      opacity: { duration: durations.slow, ease: easings.exit },
                    }}
                  />
                  <motion.path
                    d={b.piece.bottom}
                    fill="none"
                    stroke={b.colour}
                    strokeWidth={stroke.strokeWidth}
                    strokeDasharray={stroke.strokeDasharray}
                    strokeLinecap={stroke.strokeLinecap}
                    initial={{ y: 0, x: 0, opacity: 1 }}
                    animate={{
                      y: distances.step,
                      x: distances.nudge,
                      opacity: 0,
                    }}
                    transition={{
                      y: springs.recoil,
                      x: springs.recoil,
                      opacity: { duration: durations.slow, ease: easings.exit },
                    }}
                  />
                </g>
              ))}
            </svg>

            {tasks.map((task, i) => (
              <Row
                key={task.id}
                task={task}
                index={i}
                count={total}
                done={doneSet.has(task.id)}
                blockedBy={blockersOfTask(task.id)}
                circular={circular.has(task.id)}
                onPath={critSet.has(task.id)}
                critOn={critOn}
                flashSeq={flash[task.id]}
                nudgeSeq={nudge[task.id]}
                density={density}
                motionSafe={motionSafe}
                active={task.id === active}
                inert={inert}
                hintId={hintId}
                pickerOpen={pop?.id === task.id}
                nodeRef={(node) => {
                  if (node) rowNodes.current.set(task.id, node);
                  else rowNodes.current.delete(task.id);
                }}
                onToggle={() => toggleDone(task.id)}
                onPick={() => openPicker(task.id)}
                onUnchain={() => {
                  if (!inert) unchainNewest(task.id);
                }}
                onFocus={() => setActiveId(task.id)}
                onNav={(event) => onNav(event, task.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The critical path, spelled out. */}
      <AnimatePresence initial={false}>
        {ready && total > 0 && critOn ? (
          <motion.div
            key="crit"
            className="shrink-0 overflow-hidden border-t border-hairline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            <p className="flex min-w-0 items-center gap-2 px-4 py-2 text-[11px] text-ink-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--bc-accent)" }}
              />
              {crit.ids.length ? (
                <>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Longest chain
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {crit.ids.length} {crit.ids.length === 1 ? "task" : "tasks"}{" "}
                    · {crit.days} {crit.days === 1 ? "day" : "days"}
                  </span>
                  <span className="hidden min-w-0 truncate font-mono text-ink-3 @min-[40rem]:inline">
                    {critLine}
                  </span>
                </>
              ) : (
                <span>Nothing is left on the path.</span>
              )}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The chain picker. */}
      <AnimatePresence>
        {pop && popTask ? (
          <motion.div
            key={pop.id}
            ref={popRef}
            id={popId}
            role="dialog"
            aria-labelledby={popTitleId}
            tabIndex={-1}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && !event.currentTarget.contains(next)) setPop(null);
            }}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{
              left: pop.left,
              width: pop.width,
              top: pop.top,
              bottom: pop.bottom,
              maxHeight: pop.maxHeight,
            }}
            className="absolute z-20 flex flex-col overflow-hidden rounded-3 border border-hairline-strong bg-popover shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)] outline-none"
          >
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-2.5 py-1.5">
              <p id={popTitleId} className="min-w-0 truncate text-[11px]">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {popTask.ref} waits on
                </span>
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => closePicker(true)}
                className={cn(
                  "flex size-5 items-center justify-center rounded-1 text-ink-3 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
            {popOptions.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-ink-3">
                Every other task is done.
              </p>
            ) : (
              <ul
                role="listbox"
                aria-multiselectable
                aria-label={`Tasks ${popTask.ref} waits on`}
                className="flex flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5"
              >
                {popOptions.map((t) => {
                  const chained = (chains[pop.id] ?? []).includes(t.id);
                  const wouldLoop =
                    !chained &&
                    circularTasks(tasks, {
                      ...chains,
                      [pop.id]: [...(chains[pop.id] ?? []), t.id],
                    }).has(pop.id);
                  return (
                    <li
                      key={t.id}
                      ref={(node) => {
                        if (node) optionNodes.current.set(t.id, node);
                        else optionNodes.current.delete(t.id);
                      }}
                      role="option"
                      aria-selected={chained}
                      tabIndex={t.id === popActiveId ? 0 : -1}
                      onFocus={() => setPopActive(t.id)}
                      onClick={() => {
                        if (chained) removeChain(pop.id, t.id);
                        else addChain(pop.id, t.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.preventDefault();
                          if (chained) removeChain(pop.id, t.id);
                          else addChain(pop.id, t.id);
                          return;
                        }
                        onPopNav(event, popOptionIds);
                      }}
                      className={cn(
                        "grid cursor-pointer grid-cols-[1rem_2.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 py-1.5 text-[12px] hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-3.5 items-center justify-center rounded-1 border",
                          chained
                            ? "border-transparent text-card"
                            : "border-hairline-strong",
                        )}
                        style={{
                          background: chained ? "var(--bc-accent)" : undefined,
                        }}
                      >
                        {chained ? (
                          <svg viewBox="0 0 14 14" className="size-2.5">
                            <motion.path
                              d="M3 7.4 5.8 10 11 4.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={motionSafe ? { pathLength: 0 } : false}
                              animate={{ pathLength: 1 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                        {t.ref}
                      </span>
                      <span className="truncate">{t.title}</span>
                      {wouldLoop ? (
                        <span className="font-mono text-[9px] tracking-[0.06em] text-danger uppercase">
                          loops
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                          {t.days ?? 1}d
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
