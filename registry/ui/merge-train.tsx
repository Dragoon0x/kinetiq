"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  GitPullRequest,
  OctagonPause,
  RotateCcw,
  TrainFront,
  Trash2,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type MergeTrainCarStyle = "card" | "pill" | "boxcar";
export type MergeTrainTrackStyle = "rails" | "transit" | "ruled";
export type MergeTrainAccentName = "cobalt" | "plum" | "mint" | "ink";
export type MergeTrainStatus = "running" | "loading" | "empty" | "error";
export type TrainResult = "queued" | "running" | "passed" | "failed" | "merged";
export type TrainCheckState = "pending" | "running" | "passed" | "failed";

/** One check a station runs on a car. */
export type TrainCheck = {
  label: string;
  state: TrainCheckState;
  /** A short note: a duration, a reviewer's verdict, a failure. */
  note?: string;
};

/** A stop on the line after the depot. */
export type TrainStation = {
  id: string;
  label: string;
};

/** One change an agent opened, as a car. */
export type TrainChange = {
  id: string;
  /** The pull request number. */
  number: number;
  title: string;
  /** The agent that opened it. */
  agent: string;
  /** "quill/basin-backoff". */
  branch?: string;
  /** Where the car is: -1 in the depot, else an index into `stations`. */
  stop: number;
  /** How it is doing at that stop. A failed car stands on the siding; a merged one has left. */
  result: TrainResult;
  /** The checks at its current stop. */
  checks?: TrainCheck[];
  /** How far through its current stop, 0–1. */
  progress?: number;
  /** Why it failed, in a few words. */
  failedReason?: string;
};

export type MergeTrainProps = {
  /** Every car, in a stable order (the train is drawn from `stop` and `result`). @default defaultTrainChanges */
  changes?: TrainChange[];
  /** The stops after the depot, in order. @default defaultTrainStations */
  stations?: TrainStation[];
  /** Controlled queue order of the cars waiting in the depot, next to leave first. */
  order?: string[];
  /** Initial queue order when uncontrolled. @default the depot cars in `changes` order */
  defaultOrder?: string[];
  /** Fires from Alt+Arrow or the Move buttons with the new queue order. */
  onReorder?: (order: string[]) => void;
  /** Controlled open car, or null. */
  open?: string | null;
  /** Initial open car when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires from Enter, a click, Escape or Close with the open car (or null). */
  onOpenChange?: (id: string | null) => void;
  /** Retry was pressed on a car standing on the siding. */
  onRetry?: (change: TrainChange) => void;
  /** Delete, Backspace or Remove pulled a car from the train. It leaves at once. */
  onRemoveCar?: (change: TrainChange) => void;
  /** Hold the train: the last station's lamp turns to stop and nothing merges. @default false */
  held?: boolean;
  /** Why the train is held, shown in the banner. @default "main is frozen for the 4.2 release" */
  heldReason?: string;
  /** Changes merged so far today, for the header. @default 0 */
  merged?: number;
  /** Whether the train's data has arrived. @default "running" */
  status?: MergeTrainStatus;
  /** "Try again" was pressed after the train failed to load. */
  onReload?: () => void;
  /** The heading. @default "Merge train" */
  title?: string;
  /** Under the heading. @default "waylight/app · main" */
  subtitle?: string;
  /** How a car is drawn: a card with its checks, a compact pill, or a boxcar with wheels and couplers. @default "card" */
  carStyle?: MergeTrainCarStyle;
  /** How the line is drawn: rails and sleepers, one transit line with station rings, or a ruled hairline. @default "rails" */
  trackStyle?: MergeTrainTrackStyle;
  /** Running cars, focus and the open car: a named pigment or any CSS colour. @default "cobalt" */
  accent?: MergeTrainAccentName | (string & {});
  /** Read only: cars can be looked at but not opened, moved or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultTrainStations: TrainStation[] = [
  { id: "tests", label: "Tests" },
  { id: "review", label: "Review" },
  { id: "merge", label: "Merge" },
];

/** Waylight's agent fleet — Atlas, Ferry, Quill and Moss — with six changes in the train. */
export const defaultTrainChanges: TrainChange[] = [
  {
    id: "pr-2479",
    number: 2479,
    title: "Cache warmup for city tiles",
    agent: "Atlas",
    branch: "atlas/tile-warmup",
    stop: 2,
    result: "running",
    progress: 0.6,
    checks: [
      { label: "Rebase on main", state: "passed", note: "clean" },
      { label: "Merge", state: "running" },
    ],
  },
  {
    id: "pr-2481",
    number: 2481,
    title: "Paginate the fleet API",
    agent: "Ferry",
    branch: "ferry/fleet-pages",
    stop: 1,
    result: "running",
    progress: 0.45,
    checks: [
      { label: "Ines Varga", state: "passed", note: "approved" },
      { label: "Code owners", state: "running" },
    ],
  },
  {
    id: "pr-2484",
    number: 2484,
    title: "Retry backoff for Basinworks export",
    agent: "Quill",
    branch: "quill/basin-backoff",
    stop: 0,
    result: "running",
    progress: 0.7,
    checks: [
      { label: "Unit", state: "passed", note: "1m 12s" },
      { label: "Lint", state: "passed", note: "8s" },
      { label: "Integration", state: "running" },
    ],
  },
  {
    id: "pr-2486",
    number: 2486,
    title: "Drop the legacy webhook signer",
    agent: "Moss",
    branch: "moss/signer-v1",
    stop: -1,
    result: "queued",
  },
  {
    id: "pr-2488",
    number: 2488,
    title: "Typed config for routes",
    agent: "Ferry",
    branch: "ferry/route-config",
    stop: -1,
    result: "queued",
  },
  {
    id: "pr-2490",
    number: 2490,
    title: "Tile renderer 4.3",
    agent: "Atlas",
    branch: "atlas/renderer-43",
    stop: -1,
    result: "queued",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const ACCENTS: Record<MergeTrainAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--mt-ink": ACCENTS[accent as MergeTrainAccentName] ?? accent,
    "--mt-wash": "color-mix(in oklab, var(--mt-ink) 12%, transparent)",
    "--mt-soft": "color-mix(in oklab, var(--mt-ink) 34%, transparent)",
  }) as React.CSSProperties;

/** Lamps and pips are small filled objects: pigment at a fixed lightness. */
const PIGMENT = {
  success: "oklch(from var(--success) 0.7 0.15 h)",
  danger: "oklch(from var(--danger) 0.64 0.2 h)",
  warn: "oklch(from var(--warn) 0.8 0.14 h)",
} as const;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Placement on the yard grid: rows on a phone, columns from 30rem up. */
const PLACE =
  "[grid-row:var(--mt-i)] [grid-column:var(--mt-lane)] @min-[30rem]:[grid-row:var(--mt-lane)] @min-[30rem]:[grid-column:var(--mt-i)]";

type Lamp = "idle" | "busy" | "clear" | "stop" | "fault";

const LAMP: Record<Lamp, { label: string; style: React.CSSProperties }> = {
  idle: {
    label: "idle",
    style: { backgroundColor: "var(--hairline-strong)" },
  },
  busy: { label: "busy", style: { backgroundColor: "var(--mt-ink)" } },
  clear: { label: "clear", style: { backgroundColor: PIGMENT.success } },
  stop: { label: "stopped", style: { backgroundColor: PIGMENT.danger } },
  fault: {
    label: "a car failed here",
    style: { backgroundColor: PIGMENT.warn },
  },
};

const PIP: Record<TrainCheckState, React.CSSProperties> = {
  pending: { backgroundColor: "transparent" },
  running: { backgroundColor: "var(--mt-soft)" },
  passed: { backgroundColor: PIGMENT.success },
  failed: { backgroundColor: PIGMENT.danger },
};

/* ----------------------------------------------------------------------- */
/*                                 Measured                                 */
/* ----------------------------------------------------------------------- */

/** Height of a node, kept by a ResizeObserver bound when the node arrives. */
function useMeasuredHeight() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry ? Math.round(entry.contentRect.height) : 0;
      setHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Placed = {
  change: TrainChange;
  /** 1-based grid index along the line: 1 is the depot. */
  i: number;
  lane: "main" | "siding";
  /** Depot queue position, or stack position on a crowded siding. */
  q: number;
};

/**
 * A merge queue drawn as a train. The pull requests agents have opened are
 * cars on a line through the depot and the stations — tests, review, merge
 * — coupled front to back. When the host moves a car to its next stop the
 * train advances on `glide`, the front car first and each car behind a
 * `cascade()` later, like slack running out of a real train; a car that
 * fails uncouples and drops onto the siding on `recoil` — two visible
 * bounces — while the cars behind close the gap. A merged car pulls away on
 * the exit ease.
 *
 * Every car lives in one grid, keyed and in a stable order, so a move is a
 * change of grid cell that motion's layout animation carries; below a 30rem
 * container the grid turns and the line runs down the page. The cars are a
 * listbox in line order: arrows walk, Home and End jump, Enter opens a car's
 * checks below the yard, Delete pulls it from the train, and Alt with an
 * arrow moves a waiting car in the queue. Under reduced motion cars change
 * places with a fade, and pips and lamps still change.
 */
export function MergeTrain({
  changes = defaultTrainChanges,
  stations = defaultTrainStations,
  order,
  defaultOrder,
  onReorder,
  open,
  defaultOpen = null,
  onOpenChange,
  onRetry,
  onRemoveCar,
  held = false,
  heldReason = "main is frozen for the 4.2 release",
  merged = 0,
  status = "running",
  onReload,
  title = "Merge train",
  subtitle = "waylight/app · main",
  carStyle = "card",
  trackStyle = "rails",
  accent = "cobalt",
  disabled = false,
  className,
}: MergeTrainProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const panelId = `${uid}-panel`;

  const [removed, setRemoved] = React.useState<string[]>([]);
  const [ownOrder, setOwnOrder] = React.useState<string[] | undefined>(
    defaultOrder,
  );
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const openId = open === undefined ? ownOpen : open;
  const [active, setActive] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const yardRef = React.useRef<HTMLDivElement | null>(null);

  const live = changes.filter(
    (c) => !removed.includes(c.id) && c.result !== "merged",
  );
  const n = stations.length;

  // The depot's queue: the host's order, then anything it did not name.
  const depot = live.filter((c) => c.stop < 0);
  const wanted = order ?? ownOrder ?? [];
  const queue = [
    ...wanted
      .map((id) => depot.find((c) => c.id === id))
      .filter((c): c is TrainChange => !!c),
    ...depot.filter((c) => !wanted.includes(c.id)),
  ];

  const placed = new Map<string, Placed>();
  // The depot is a stack: the next car to leave on top, the rest behind it.
  queue.forEach((change, q) =>
    placed.set(change.id, { change, i: 1, lane: "main", q }),
  );
  const sidingCount = new Map<number, number>();
  for (const change of live) {
    if (change.stop < 0) continue;
    const stop = Math.min(n - 1, change.stop);
    if (change.result === "failed") {
      const q = sidingCount.get(stop) ?? 0;
      sidingCount.set(stop, q + 1);
      placed.set(change.id, { change, i: stop + 2, lane: "siding", q });
    } else {
      placed.set(change.id, { change, i: stop + 2, lane: "main", q: 0 });
    }
  }

  // Line order, for the keyboard: depot queue, then the line front to back
  // as read (left to right, top to bottom), then the siding.
  const lineOrder = [
    ...queue,
    ...live
      .filter((c) => c.stop >= 0 && c.result !== "failed")
      .sort((a, b) => a.stop - b.stop),
    ...live
      .filter((c) => c.stop >= 0 && c.result === "failed")
      .sort((a, b) => a.stop - b.stop),
  ];
  const focusId =
    active && lineOrder.some((c) => c.id === active)
      ? active
      : (lineOrder[0]?.id ?? null);

  // Front of the train first: rank among cars on the main line by stop.
  const mainRank = new Map<string, number>();
  [...live]
    .filter((c) => placed.get(c.id)?.lane === "main")
    .sort((a, b) => b.stop - a.stop)
    .forEach((c, rank) => mainRank.set(c.id, rank));
  const lag = cascade(Math.max(2, live.length));

  const occupied = new Map<number, TrainChange>();
  for (const p of placed.values()) {
    if (p.lane === "main" && p.q === 0) occupied.set(p.i, p.change);
  }

  const lampOf = (stationIndex: number): Lamp => {
    if (held && stationIndex === n - 1) return "stop";
    const car = occupied.get(stationIndex + 2);
    const failedHere = live.some(
      (c) => c.result === "failed" && Math.min(n - 1, c.stop) === stationIndex,
    );
    if (car?.result === "running") return "busy";
    if (car?.result === "passed") return "clear";
    if (failedHere) return "fault";
    return "idle";
  };

  // Spoken changes: a car that fails, merges or moves on, from the props
  // that changed, frozen in the render that saw them.
  const [prev, setPrev] = React.useState(changes);
  if (prev !== changes) {
    const said: string[] = [];
    for (const c of changes) {
      const was = prev.find((p) => p.id === c.id);
      if (!was) continue;
      const at = stations[Math.min(n - 1, Math.max(0, c.stop))]?.label ?? "";
      if (c.result === "failed" && was.result !== "failed") {
        said.push(`PR ${c.number} failed at ${at} and left the line`);
      } else if (c.result === "merged" && was.result !== "merged") {
        said.push(`PR ${c.number} merged`);
      } else if (c.stop > was.stop && c.result !== "failed") {
        said.push(`PR ${c.number} moved to ${at}`);
      } else if (c.stop < 0 && was.result === "failed") {
        said.push(`PR ${c.number} is back in the depot`);
      }
    }
    setPrev(changes);
    if (said.length > 0) setAnnouncement(`${said.join(". ")}.`);
  }

  /* ---------------------------- interactions ---------------------------- */

  const setOpenId = (id: string | null) => {
    if (open === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };

  const focusCar = (id: string) => {
    setActive(id);
    const el = yardRef.current?.querySelector<HTMLElement>(
      `[data-mt-car="${CSS.escape(id)}"]`,
    );
    el?.focus();
  };

  const remove = (change: TrainChange) => {
    if (disabled) return;
    const at = lineOrder.findIndex((c) => c.id === change.id);
    const next = lineOrder[at + 1] ?? lineOrder[at - 1];
    setRemoved((r) => [...r, change.id]);
    onRemoveCar?.(change);
    if (openId === change.id) setOpenId(null);
    setAnnouncement(`PR ${change.number} pulled from the train.`);
    if (next) focusCar(next.id);
  };

  const move = (change: TrainChange, delta: number) => {
    if (disabled || change.stop >= 0) return;
    const ids = queue.map((c) => c.id);
    const from = ids.indexOf(change.id);
    const to = Math.min(ids.length - 1, Math.max(0, from + delta));
    if (from < 0 || to === from) return;
    ids.splice(from, 1);
    ids.splice(to, 0, change.id);
    if (order === undefined) setOwnOrder(ids);
    onReorder?.(ids);
    setAnnouncement(
      `PR ${change.number} is ${ordinal(to + 1)} in the queue of ${queue.length}.`,
    );
  };

  const onCarKey = (e: React.KeyboardEvent, change: TrainChange) => {
    const at = lineOrder.findIndex((c) => c.id === change.id);
    const go = (i: number) => {
      const target = lineOrder[Math.min(lineOrder.length - 1, Math.max(0, i))];
      if (target) focusCar(target.id);
    };
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
    if (e.altKey && (back || fwd)) {
      e.preventDefault();
      move(change, back ? -1 : 1);
      return;
    }
    if (back || fwd) {
      e.preventDefault();
      go(at + (back ? -1 : 1));
      return;
    }
    switch (e.key) {
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(lineOrder.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!disabled) setOpenId(openId === change.id ? null : change.id);
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        remove(change);
        break;
      case "Escape":
        if (openId) {
          e.preventDefault();
          setOpenId(null);
        }
        break;
      default:
        break;
    }
  };

  /* -------------------------------- parts ------------------------------- */

  const [panelRef, panelH] = useMeasuredHeight();

  const whereOf = (change: TrainChange, p: Placed | undefined) => {
    if (change.stop < 0) {
      const q = queue.findIndex((c) => c.id === change.id);
      return `waiting, ${ordinal(q + 1)} in the queue`;
    }
    const label = stations[Math.min(n - 1, change.stop)]?.label ?? "";
    return p?.lane === "siding"
      ? `on the siding after ${label}`
      : `at ${label}`;
  };

  const stateWord = (change: TrainChange) => {
    if (change.result === "running" && held && change.stop === n - 1)
      return "held";
    return change.result;
  };

  const carNodes = live.map((change) => {
    const p = placed.get(change.id);
    if (!p) return null;
    const checks = change.checks ?? [];
    const passed = checks.filter((c) => c.state === "passed").length;
    const word = stateWord(change);
    const failed = change.result === "failed";
    const running = change.result === "running" && word !== "held";
    // A car is coupled to the one directly behind it on the main line;
    // waiting cars are not coupled yet, so couplers join station to station.
    const behind =
      p.lane === "main" && p.i > 2 ? occupied.get(p.i - 1) : undefined;
    const coupled = !!behind;
    const rank = mainRank.get(change.id) ?? 0;
    const name = `PR ${change.number} ${change.title}, by ${change.agent}, ${whereOf(change, p)}, ${word}${
      checks.length
        ? `: ${passed} of ${plural(checks.length, "check")} passed`
        : ""
    }`;
    const isOpen = openId === change.id;
    const pill = carStyle === "pill";
    const boxcar = carStyle === "boxcar";

    return (
      <motion.div
        key={change.id}
        data-mt-car={change.id}
        role="option"
        aria-selected={isOpen}
        aria-label={name}
        aria-controls={isOpen ? panelId : undefined}
        tabIndex={focusId === change.id ? 0 : -1}
        onFocus={() => setActive(change.id)}
        onClick={() => {
          if (!disabled) setOpenId(isOpen ? null : change.id);
        }}
        onKeyDown={(e) => onCarKey(e, change)}
        layout={motionSafe ? "position" : false}
        initial={false}
        animate={{ opacity: 1 }}
        exit={
          motionSafe
            ? { opacity: 0, scale: 0.94, transition: exitFor(durations.base) }
            : { opacity: 0, transition: { duration: durations.fast } }
        }
        transition={{
          // Landing on the siding is the one move with bounce; every other
          // move is the train gliding, front car first.
          layout: failed
            ? springs.recoil
            : { ...springs.glide, delay: p.lane === "main" ? rank * lag : 0 },
        }}
        className={cn(
          "group/merge-train relative z-[var(--mt-z)] flex cursor-pointer flex-col self-center select-none",
          // A crowded depot or siding stacks its cars a few pixels apart.
          p.q > 0 &&
            "[translate:calc(var(--mt-q)*-6px)_calc(var(--mt-q)*-5px)] focus-visible:z-[3]",
          PLACE,
          p.q === 0 &&
            "transition-[translate] duration-150 motion-safe:focus-visible:-translate-y-0.5",
          FOCUS,
          disabled && "cursor-default",
        )}
        style={
          {
            "--mt-i": p.i,
            "--mt-lane": p.lane === "main" ? 2 : 3,
            "--mt-q": Math.min(2, p.q),
            "--mt-z": p.q > 0 ? Math.max(0, 2 - p.q) : 2,
          } as React.CSSProperties
        }
      >
        {/* The coupler reaches back across the gap to the car behind. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 h-2 w-[3px] origin-bottom -translate-x-1/2 rounded-full bg-ink-3 @min-[30rem]:top-1/2 @min-[30rem]:right-full @min-[30rem]:bottom-auto @min-[30rem]:left-auto @min-[30rem]:h-[3px] @min-[30rem]:w-3.5 @min-[30rem]:origin-right @min-[30rem]:translate-x-0 @min-[30rem]:-translate-y-1/2"
          initial={false}
          animate={{ opacity: coupled ? 1 : 0, scale: coupled ? 1 : 0.2 }}
          transition={{
            scale: motionSafe ? springs.flick : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        />
        <span
          className={cn(
            "relative flex w-full flex-col overflow-hidden border bg-card text-left shadow-[var(--shadow-raised)] transition-colors",
            pill ? "h-8 justify-center rounded-full px-2.5" : "rounded-3",
            boxcar && "rounded-2",
            !pill && "px-2.5 pt-2 pb-2.5",
            // A boxcar's wheels need their own strip under the pips.
            boxcar && "pb-4",
            failed
              ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
              : running
                ? "border-[var(--mt-soft)]"
                : "border-hairline-strong",
            isOpen && "ring-2 ring-[var(--mt-soft)]",
            "group-hover/merge-train:border-[var(--mt-soft)]",
          )}
        >
          {boxcar ? (
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-1.5 bg-[var(--mt-wash)]"
            />
          ) : null}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-[11px] leading-4 font-medium text-foreground tabular-nums">
              <span className="text-ink-3">#</span>
              {change.number}
            </span>
            <span
              aria-hidden
              title={change.agent}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border border-hairline-strong font-mono text-[8px] leading-none text-ink-2",
                p.lane === "siding" && "hidden @min-[30rem]:flex",
              )}
            >
              {change.agent.charAt(0).toUpperCase()}
            </span>
            {pill ? (
              <span
                aria-hidden
                className="ml-auto size-1.5 shrink-0 rounded-full"
                style={
                  failed
                    ? PIP.failed
                    : running
                      ? { backgroundColor: "var(--mt-ink)" }
                      : change.result === "passed"
                        ? PIP.passed
                        : { backgroundColor: "var(--hairline-strong)" }
                }
              />
            ) : (
              <span
                aria-hidden
                className="ml-auto size-1.5 shrink-0 rounded-full @min-[30rem]:hidden"
                style={
                  failed
                    ? PIP.failed
                    : running
                      ? { backgroundColor: "var(--mt-ink)" }
                      : change.result === "passed"
                        ? PIP.passed
                        : { backgroundColor: "var(--hairline-strong)" }
                }
              />
            )}
            {pill ? null : (
              <span
                className={cn(
                  "ml-auto hidden truncate font-mono text-[10px] leading-4 tracking-[0.04em] uppercase @min-[30rem]:inline",
                  failed
                    ? "text-danger"
                    : word === "held"
                      ? "text-warn"
                      : running
                        ? "text-[var(--mt-ink)]"
                        : "text-ink-3",
                )}
              >
                {word === "queued" ? "waiting" : word}
              </span>
            )}
          </span>
          {pill ? null : (
            <span
              title={change.title}
              className={cn(
                "mt-0.5 truncate text-[12px] leading-4 text-ink-2",
                p.lane === "siding" && "hidden @min-[30rem]:block",
              )}
            >
              {change.title}
            </span>
          )}
          {pill || checks.length === 0 ? null : (
            <span aria-hidden className="mt-1.5 flex items-center gap-1">
              {checks.map((check, k) => (
                <motion.span
                  key={k}
                  title={`${check.label}: ${check.state}`}
                  className="size-1.5 rounded-full border border-hairline-strong"
                  initial={false}
                  animate={{ scale: check.state === "passed" ? 1 : 0.85 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                  style={PIP[check.state]}
                />
              ))}
              <span className="ml-1 font-mono text-[10px] leading-3 text-ink-3 tabular-nums">
                {`${passed}/${checks.length}`}
              </span>
            </span>
          )}
          {running && !pill ? (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--mt-wash)]"
            >
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left bg-[var(--mt-ink)]"
                initial={false}
                animate={{ scaleX: r3(clamp01(change.progress ?? 0)) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </span>
          ) : null}
          {boxcar ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 bottom-[3px] flex justify-between"
            >
              {[0, 1, 2, 3].map((w) => (
                <span
                  key={w}
                  className="size-1.5 rounded-full border border-hairline-strong bg-surface-2"
                />
              ))}
            </span>
          ) : null}
        </span>
      </motion.div>
    );
  });

  const stops = [{ id: "depot", label: "Depot" }, ...stations];

  const track = (
    <>
      <div
        aria-hidden
        className="pointer-events-none relative z-0 [grid-column:2] [grid-row:1/-1] @min-[30rem]:[grid-column:1/-1] @min-[30rem]:[grid-row:2]"
      >
        {trackStyle === "rails" ? (
          <>
            <span className="absolute inset-y-0 left-1/2 w-7 -translate-x-1/2 bg-[repeating-linear-gradient(180deg,var(--hairline-strong)_0_2px,transparent_2px_9px)] @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-1/2 @min-[30rem]:left-0 @min-[30rem]:h-7 @min-[30rem]:w-auto @min-[30rem]:translate-x-0 @min-[30rem]:-translate-y-1/2 @min-[30rem]:bg-[repeating-linear-gradient(90deg,var(--hairline-strong)_0_2px,transparent_2px_9px)]" />
            <span className="absolute inset-y-0 left-[calc(50%-10px)] w-0.5 bg-ink-3/60 @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-[calc(50%-10px)] @min-[30rem]:left-0 @min-[30rem]:h-0.5 @min-[30rem]:w-auto" />
            <span className="absolute inset-y-0 left-[calc(50%+8px)] w-0.5 bg-ink-3/60 @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-[calc(50%+8px)] @min-[30rem]:left-0 @min-[30rem]:h-0.5 @min-[30rem]:w-auto" />
          </>
        ) : trackStyle === "transit" ? (
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-[var(--mt-soft)] @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-1/2 @min-[30rem]:left-0 @min-[30rem]:h-1 @min-[30rem]:w-auto @min-[30rem]:translate-x-0 @min-[30rem]:-translate-y-1/2" />
        ) : (
          <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-ink-3/70 @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-1/2 @min-[30rem]:left-0 @min-[30rem]:border-t @min-[30rem]:border-l-0" />
        )}
      </div>
      <div
        aria-hidden
        className="pointer-events-none relative z-0 [grid-column:3] [grid-row:2/-1] @min-[30rem]:[grid-column:2/-1] @min-[30rem]:[grid-row:3]"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-1/2 -translate-x-1/2 @min-[30rem]:inset-x-0 @min-[30rem]:inset-y-auto @min-[30rem]:top-1/2 @min-[30rem]:left-0 @min-[30rem]:translate-x-0 @min-[30rem]:-translate-y-1/2",
            trackStyle === "ruled"
              ? "border-l border-dashed border-ink-3/50 @min-[30rem]:border-t @min-[30rem]:border-l-0"
              : "w-0.5 bg-hairline-strong @min-[30rem]:h-0.5 @min-[30rem]:w-auto",
          )}
        />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-background py-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase [writing-mode:vertical-rl] @min-[30rem]:top-1 @min-[30rem]:right-0 @min-[30rem]:bottom-auto @min-[30rem]:left-auto @min-[30rem]:translate-x-0 @min-[30rem]:py-0 @min-[30rem]:pl-1 @min-[30rem]:[writing-mode:horizontal-tb]">
          siding
        </span>
      </div>
      {trackStyle === "transit"
        ? stations.map((s, k) => (
            <span
              key={s.id}
              aria-hidden
              className={cn(
                PLACE,
                "pointer-events-none relative z-[1] size-3 self-center justify-self-center rounded-full border-2 border-[var(--mt-ink)] bg-background",
              )}
              style={{ "--mt-i": k + 2, "--mt-lane": 2 } as React.CSSProperties}
            />
          ))
        : null}
    </>
  );

  const labels = stops.map((s, k) => {
    const lamp: Lamp | null = k === 0 ? null : lampOf(k - 1);
    const behind = k === 0 ? Math.max(0, queue.length - 1) : 0;
    return (
      <div
        key={s.id}
        className={cn(
          PLACE,
          // A platform sign: upright beside its row on a phone, a caption
          // over its column from 30rem.
          "flex min-w-0 flex-col items-center gap-1.5 self-center @min-[30rem]:flex-row @min-[30rem]:self-end",
        )}
        style={{ "--mt-i": k + 1, "--mt-lane": 1 } as React.CSSProperties}
      >
        <span
          title={lamp ? `${s.label}: ${LAMP[lamp].label}` : undefined}
          className={cn(
            "size-2 shrink-0 rounded-full transition-colors",
            !lamp && "border border-ink-3",
          )}
          style={lamp ? LAMP[lamp].style : undefined}
        >
          {lamp ? (
            <span className="sr-only">{`${s.label} lamp: ${LAMP[lamp].label}`}</span>
          ) : null}
        </span>
        <span className="rotate-180 truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase [writing-mode:vertical-rl] @min-[30rem]:rotate-0 @min-[30rem]:[writing-mode:horizontal-tb]">
          {s.label}
        </span>
        {behind > 0 ? (
          <span className="shrink-0 rounded-full bg-surface-2 px-1 font-mono text-[9px] text-ink-3 tabular-nums">
            {`+${behind}`}
          </span>
        ) : null}
      </div>
    );
  });

  const openChange = openId ? live.find((c) => c.id === openId) : undefined;
  const openPlaced = openChange ? placed.get(openChange.id) : undefined;
  const openQueueAt = openChange
    ? queue.findIndex((c) => c.id === openChange.id)
    : -1;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
    FOCUS,
  );

  const panel = (
    <motion.div
      initial={false}
      animate={{ height: openChange ? panelH : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className="overflow-hidden"
    >
      <div ref={panelRef}>
        <AnimatePresence initial={false} mode="popLayout">
          {openChange ? (
            <motion.div
              key={openChange.id}
              id={panelId}
              role="region"
              aria-label={`PR ${openChange.number} ${openChange.title}`}
              onKeyDown={(e) => {
                // Escape closes the car from wherever focus is inside it.
                if (e.key !== "Escape") return;
                e.preventDefault();
                setOpenId(null);
                focusCar(openChange.id);
              }}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe ? springs.glide : { duration: 0 },
              }}
              className="mx-4 mb-4 flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] font-medium">
                    <GitPullRequest
                      aria-hidden
                      className="size-3.5 shrink-0 text-[var(--mt-ink)]"
                    />
                    <span className="font-mono text-[12px] tabular-nums">
                      <span className="text-ink-3">#</span>
                      {openChange.number}
                    </span>
                    <span className="min-w-0 truncate" title={openChange.title}>
                      {openChange.title}
                    </span>
                  </p>
                  <p className="truncate font-mono text-[11px] leading-4 text-ink-3">
                    {`${openChange.agent}${openChange.branch ? ` · ${openChange.branch}` : ""} · ${whereOf(openChange, openPlaced)}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    setOpenId(null);
                    focusCar(openChange.id);
                  }}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {openChange.result === "failed" && openChange.failedReason ? (
                <p className="flex items-start gap-1.5 text-[12px] leading-4 text-danger">
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                  />
                  {openChange.failedReason}
                </p>
              ) : null}
              {(openChange.checks ?? []).length > 0 ? (
                <ul role="list" className="flex flex-col gap-1">
                  {(openChange.checks ?? []).map((check, k) => (
                    <li
                      key={k}
                      className="flex items-center gap-2 text-[12px] leading-5"
                    >
                      {check.state === "passed" ? (
                        <Check
                          aria-hidden
                          className="size-3.5 shrink-0 text-success"
                        />
                      ) : check.state === "failed" ? (
                        <X
                          aria-hidden
                          className="size-3.5 shrink-0 text-danger"
                        />
                      ) : (
                        <CircleDashed
                          aria-hidden
                          className={cn(
                            "size-3.5 shrink-0",
                            check.state === "running"
                              ? "text-[var(--mt-ink)]"
                              : "text-ink-3",
                          )}
                        />
                      )}
                      <span className="min-w-0 truncate text-foreground">
                        {check.label}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">
                        {check.note ?? check.state}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-ink-3">
                  Checks start when it reaches Tests.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {openChange.result === "failed" ? (
                  <button
                    type="button"
                    aria-disabled={disabled || undefined}
                    onClick={() => {
                      if (!disabled) onRetry?.(openChange);
                    }}
                    className={cn(
                      button,
                      "border-[var(--mt-soft)] text-[var(--mt-ink)]",
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Retry
                  </button>
                ) : null}
                {openChange.stop < 0 ? (
                  <>
                    <button
                      type="button"
                      aria-disabled={disabled || openQueueAt <= 0 || undefined}
                      onClick={() => move(openChange, -1)}
                      className={button}
                    >
                      <ArrowLeft aria-hidden className="size-3.5" />
                      Move ahead
                    </button>
                    <button
                      type="button"
                      aria-disabled={
                        disabled || openQueueAt >= queue.length - 1 || undefined
                      }
                      onClick={() => move(openChange, 1)}
                      className={button}
                    >
                      <ArrowRight aria-hidden className="size-3.5" />
                      Move back
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-disabled={disabled || undefined}
                  onClick={() => remove(openChange)}
                  className={cn(button, "ml-auto hover:text-danger")}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                  Remove from train
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  const trainCount = live.filter((c) => c.result !== "failed").length;
  const sidingTotal = live.length - trainCount;

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy className="flex flex-col gap-3 px-4 py-6">
        <span className="sr-only">Loading the train</span>
        <div
          aria-hidden
          className="grid grid-cols-2 gap-3 @min-[30rem]:grid-cols-4"
        >
          {[0, 1, 2, 3].map((k) => (
            <span key={k} className="h-16 rounded-3 bg-surface-2" />
          ))}
        </div>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-ink-2">The train didn’t load.</p>
        {onReload ? (
          <button type="button" onClick={onReload} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    const empty = status === "empty" || live.length === 0;
    body = (
      <>
        {held ? (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] px-3 py-2 text-[12px] leading-4 text-foreground">
            <OctagonPause
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-warn"
            />
            <span>{`Train held: ${heldReason}. Nothing merges until it is released.`}</span>
          </div>
        ) : null}
        <div className="px-4 pb-4">
          <div
            ref={yardRef}
            role={empty ? undefined : "listbox"}
            aria-labelledby={empty ? undefined : titleId}
            aria-describedby={empty ? undefined : hintId}
            aria-orientation={empty ? undefined : "horizontal"}
            className="relative grid [grid-template-columns:1.25rem_minmax(0,1fr)_minmax(0,4.75rem)] [grid-template-rows:repeat(var(--mt-n),minmax(4rem,auto))] gap-x-3 gap-y-2 pt-2.5 pb-1 @min-[30rem]:[grid-template-columns:repeat(var(--mt-n),minmax(0,1fr))] @min-[30rem]:[grid-template-rows:auto_minmax(4.75rem,auto)_minmax(4.75rem,auto)] @min-[30rem]:gap-x-3.5"
            style={{ "--mt-n": stops.length } as React.CSSProperties}
          >
            {labels}
            {track}
            {empty ? (
              <div className="relative z-[1] [grid-column:2/-1] [grid-row:1] flex flex-col items-center justify-center gap-1 self-center rounded-3 border border-dashed border-hairline-strong bg-background px-3 py-3 text-center @min-[30rem]:[grid-column:1/-1] @min-[30rem]:[grid-row:3]">
                <p className="text-[13px] text-ink-2">The depot is empty.</p>
                <p className="text-[12px] text-ink-3">
                  Changes join the train when an agent opens them.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>{carNodes}</AnimatePresence>
            )}
          </div>
        </div>
        {panel}
      </>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span
          aria-hidden
          className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--mt-wash)] text-[var(--mt-ink)] @min-[20rem]:flex"
        >
          <TrainFront className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            id={titleId}
            className="truncate text-[15px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p
            className="truncate text-[12px] leading-4 text-ink-3"
            title={subtitle}
          >
            {subtitle}
          </p>
          <p className="truncate font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
            {`${trainCount} in train${sidingTotal ? ` · ${sidingTotal} out` : ""} · ${merged} merged`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 self-start">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] tracking-[0.08em] uppercase",
              held
                ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] text-warn"
                : "border-[var(--mt-soft)] text-[var(--mt-ink)]",
            )}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: held ? PIGMENT.warn : "var(--mt-ink)",
              }}
            />
            {held
              ? "Held"
              : status === "empty" || live.length === 0
                ? "Idle"
                : "Running"}
          </span>
        </div>
      </header>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain pt-1">
        {body}
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move between cars. Enter opens a car, Delete pulls it from
        the train, Alt with an arrow moves a waiting car in the queue.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
