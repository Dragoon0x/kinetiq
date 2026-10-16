"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  Archive,
  FolderInput,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  Tag,
  Trash2,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

/** One record the action runs on. */
export type BatchItem = {
  id: string;
  /** What the item is called: a person, a file, a record. */
  label: string;
  /** A second line: the subject, a path, a size. */
  detail?: string;
  /** For the built-in simulation only: fail this item with this reason. */
  error?: string;
  /** For the built-in simulation only: the failure clears on a retry. */
  recovers?: boolean;
};

export type BatchActionIcon =
  "archive" | "move" | "reassign" | "tag" | "delete" | "list";

export type BatchAction = {
  id: string;
  /** The verb on the button and in the question: "Archive". */
  label: string;
  /** The verb in the summary: "Archived". */
  past: string;
  /** The verb while it runs: "Archiving". */
  progressive: string;
  /** One plain sentence on what the action does. */
  description: string;
  /** The glyph in the header. @default "list" */
  icon?: BatchActionIcon;
  /** Label for the target picker, when the action needs one: "To". */
  targetLabel?: string;
  /** The places or people the action can go to. */
  targets?: string[];
};

export type BatchCellState =
  "idle" | "queued" | "active" | "done" | "failed" | "skipped";

export type BatchRunContext = {
  action: string;
  target?: string;
  /** 1 on the first pass, 2 on the first retry, and so on. */
  attempt: number;
};

export type BatchProgress = { done: number; failed: number; left: number };

export type BatchSummary = {
  action: string;
  target?: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  /** The failures grouped by their reason, largest group first. */
  reasons: { reason: string; ids: string[] }[];
  /** Stop was pressed before every item was reached. */
  cancelled: boolean;
};

export type BatchRunnerCellShape = "square" | "round" | "bar";
export type BatchRunnerPalette = "cobalt" | "moss" | "graphite" | "dusk";
export type BatchRunnerStatus = "ready" | "loading" | "error";

export type BatchRunnerProps = {
  /** The selection the action runs on, in reading order. @default defaultBatchItems (248 conversations) */
  items?: BatchItem[];
  /** The actions offered in the picker. @default defaultBatchActions (archive, move, reassign) */
  actions?: BatchAction[];
  /** Controlled action id. */
  action?: string;
  /** Initial action when uncontrolled. @default the first action */
  defaultAction?: string;
  /** Fires from the press or key that picked another action. */
  onActionChange?: (action: string) => void;
  /** The work for one item, called one at a time in reading order. A throw or a rejection fails the item with the error's message as its reason. @default a simulation paced by `pace` */
  run?: (item: BatchItem, context: BatchRunContext) => void | Promise<void>;
  /** Milliseconds per item for the built-in simulation; a retry takes at least 280ms per item so each one can be seen. @default 24 */
  pace?: number;
  /** Start the run by itself the first time the dialog scrolls into view. @default false */
  autoStart?: boolean;
  /** What one item is called. @default { one: "conversation", other: "conversations" } */
  itemLabel?: { one: string; other: string };
  /** Where the selection came from, under the title. @default "From Open · Coldbrook Support" */
  source?: string;
  /** The primary press started the run, with every id in it. */
  onRun?: (info: { action: string; target?: string; ids: string[] }) => void;
  /** Retry failed was pressed, with the ids it reruns. */
  onRetry?: (ids: string[]) => void;
  /** Cancel (before the run) or Stop (during it) was pressed. */
  onCancel?: (progress: BatchProgress) => void;
  /** The run paused (Escape or Pause) or resumed. */
  onPauseChange?: (paused: boolean) => void;
  /** Fires as each item lands, with the counts across the whole selection. */
  onProgress?: (progress: BatchProgress) => void;
  /** A pass finished or stopped; the summary the sentence is written from. */
  onComplete?: (summary: BatchSummary) => void;
  /** Done was pressed (or Escape on the summary). */
  onClose?: () => void;
  /** The cells: rounded squares, dots, or tall tally bars. @default "square" */
  cellShape?: BatchRunnerCellShape;
  /** The largest cell edge in px; cells shrink below it to keep the grid under `maxGridHeight`. @default 11 */
  cellSize?: number;
  /** The done pigment, the row band and the progress line. Failures stay red in every palette. @default "cobalt" */
  palette?: BatchRunnerPalette;
  /** Tallest the grid of cells may grow, px, before its cells shrink to fit. @default 200 */
  maxGridHeight?: number;
  /** Whether the selection has been counted. @default "ready" */
  status?: BatchRunnerStatus;
  /** Try again was pressed after the selection failed to load. */
  onReload?: () => void;
  /** Trap Tab inside the dialog and mark it modal; pass it when you render it in an overlay. @default false */
  modal?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Mara",
  "Tomas",
  "Ines",
  "Joel",
  "Priya",
  "Kenji",
  "Sade",
  "Lena",
  "Arlo",
  "Noor",
  "Felix",
  "Yara",
  "Owen",
  "Rhea",
  "Dario",
  "Maya",
  "Iker",
  "Elif",
  "Theo",
  "Wren",
];
const LAST = [
  "Ruiz",
  "Reyes",
  "Okafor",
  "Lind",
  "Varga",
  "Haddad",
  "Moreau",
  "Sato",
  "Brandt",
  "Quinn",
  "Abara",
  "Novak",
  "Ferro",
  "Laine",
  "Osei",
  "Park",
];
const SUBJECTS = [
  "Refund for order #",
  "Can't sign in after the reset",
  "Invoice shows the wrong tax",
  "Change the delivery address",
  "Damaged on arrival, order #",
  "Cancel my plan at renewal",
  "Two charges this month",
  "Where is order #?",
  "Add a seat to our team",
  "Export my account data",
  "Promo code not accepted",
  "Swap the size on order #",
];

/** Where the default selection fails on its first pass, and why. */
const DEFAULT_FAILURES: Record<number, { error: string; recovers: boolean }> = {
  61: { error: "Timed out while saving", recovers: true },
  140: { error: "Locked by a legal hold", recovers: false },
  197: { error: "Timed out while saving", recovers: true },
};

/**
 * 248 open conversations in a Coldbrook support inbox, seeded so every
 * machine draws the same selection. Three fail on the first pass: two time out
 * and go through on a retry, one sits under a legal hold and fails again.
 */
export const defaultBatchItems: BatchItem[] = (() => {
  const rand = mulberry32(1683);
  return Array.from({ length: 248 }, (_, i): BatchItem => {
    const name = `${FIRST[Math.floor(rand() * FIRST.length)] ?? "Mara"} ${
      LAST[Math.floor(rand() * LAST.length)] ?? "Ruiz"
    }`;
    const subject = (
      SUBJECTS[Math.floor(rand() * SUBJECTS.length)] ??
      SUBJECTS[0] ??
      ""
    ).replace("#", String(4000 + Math.floor(rand() * 999)));
    const fail = DEFAULT_FAILURES[i];
    return {
      id: `cv-${7100 + i}`,
      label: name,
      detail: subject,
      ...(fail ? { error: fail.error, recovers: fail.recovers } : {}),
    };
  });
})();

export const defaultBatchActions: BatchAction[] = [
  {
    id: "archive",
    label: "Archive",
    past: "Archived",
    progressive: "Archiving",
    description:
      "They leave the inbox and keep their history. A new reply brings a conversation back.",
    icon: "archive",
  },
  {
    id: "move",
    label: "Move",
    past: "Moved",
    progressive: "Moving",
    description:
      "They move to the folder you pick, with their tags and history intact.",
    icon: "move",
    targetLabel: "To",
    targets: ["Escalations", "Billing follow-ups", "Later this week"],
  },
  {
    id: "reassign",
    label: "Reassign",
    past: "Reassigned",
    progressive: "Reassigning",
    description:
      "The new owner gets one digest instead of a notification per conversation.",
    icon: "reassign",
    targetLabel: "To",
    targets: ["Mara Ruiz", "Tomas Reyes", "Joel Okafor", "Nobody"],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * Cells are filled objects, so they are pigment: each token's hue and chroma at
 * a fixed lightness, which reads the same on a light card and a dark one.
 */
const PALETTES: Record<BatchRunnerPalette, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.62 0.17 h)",
  moss: "oklch(from var(--success) 0.64 0.14 h)",
  graphite: "oklch(from var(--ink-2) 0.52 0.015 h)",
  dusk: "oklch(from var(--accent-bright) 0.6 0.15 318)",
};
const FAIL = "oklch(from var(--danger) 0.6 0.19 h)";

const ICONS: Record<BatchActionIcon, typeof Archive> = {
  archive: Archive,
  move: FolderInput,
  reassign: UserRoundPlus,
  tag: Tag,
  delete: Trash2,
  list: ListChecks,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const countOf = (n: number, label: { one: string; other: string }) =>
  `${n} ${n === 1 ? label.one : label.other}`;

const reasonOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : "Something went wrong";

/** The summary as one plain sentence, counts and plurals right. */
function sentenceOf(
  s: BatchSummary,
  a: BatchAction | undefined,
  label: { one: string; other: string },
): string {
  const past = a?.past ?? "Finished";
  const to = s.target ? ` to ${s.target}` : "";
  const fails =
    s.failed > 0 ? ` ${s.failed} could not be ${past.toLowerCase()}.` : "";
  if (s.cancelled) {
    const left =
      s.skipped > 0
        ? ` ${s.skipped} ${s.skipped === 1 ? "was" : "were"} left as ${
            s.skipped === 1 ? "it was" : "they were"
          }.`
        : "";
    return `${past} ${countOf(s.done, label)}${to}, then stopped.${fails}${left}`;
  }
  if (s.failed === 0) {
    return s.total === 1
      ? `${past} the ${label.one}${to}.`
      : `${past} all ${countOf(s.total, label)}${to}.`;
  }
  return `${past} ${s.done} of ${countOf(s.total, label)}${to}.${fails}`;
}

type Layout = { w: number; h: number; g: number; cols: number };

/**
 * The biggest cell, up to `size`, whose grid still fits under `maxH` at this
 * width. Bars are half as wide and half again as tall, so the same item count
 * folds into fewer, taller rows.
 */
function fitLayout(
  width: number,
  n: number,
  size: number,
  shape: BatchRunnerCellShape,
  maxH: number,
): Layout {
  let best: Layout | null = null;
  for (let s = Math.max(4, size); s >= 4; s -= 0.5) {
    const w = r2(shape === "bar" ? Math.max(3, s * 0.5) : s);
    const h = r2(shape === "bar" ? s * 1.5 : s);
    const g = Math.max(2, Math.round(s * 0.28));
    const cols = Math.max(1, Math.floor((width + g) / (w + g)));
    const rows = Math.ceil(n / cols);
    best = { w, h, g, cols };
    if (rows * h + (rows - 1) * g <= maxH) return best;
  }
  return best ?? { w: 4, h: 4, g: 2, cols: Math.max(1, Math.floor(width / 6)) };
}

/** The server knows no width: it draws at full size and lets CSS wrap. */
function initialLayout(size: number, shape: BatchRunnerCellShape): Layout {
  const s = Math.max(4, size);
  return {
    w: r2(shape === "bar" ? Math.max(3, s * 0.5) : s),
    h: r2(shape === "bar" ? s * 1.5 : s),
    g: Math.max(2, Math.round(s * 0.28)),
    cols: 0,
  };
}

/**
 * A box whose height follows its content on glide, measured, so the dialog
 * never jumps when a phase swaps what it holds.
 */
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
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      // Clipped while it glides, with room for focus rings at the edges.
      style={{ overflow: "clip", overflowClipMargin: 8 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Cell                                   */
/* ----------------------------------------------------------------------- */

type CellProps = {
  id: string;
  index: number;
  state: BatchCellState;
  name: string;
  tabbable: boolean;
  motionSafe: boolean;
  register: (id: string, node: HTMLSpanElement | null) => void;
};

/**
 * Every cell's look lives once on the grid, keyed by data attributes, so a
 * selection of hundreds stays a few dozen bytes per cell in the markup and a
 * tick re-renders one attribute, not a class list.
 */
const CELL_LOOK = [
  "[&_[data-br-cell]]:relative [&_[data-br-cell]]:block [&_[data-br-cell]]:h-(--br-h) [&_[data-br-cell]]:w-(--br-w) [&_[data-br-cell]]:cursor-default [&_[data-br-cell]]:rounded-(--br-r)",
  "[&_[data-br-cell]]:outline-none [&_[data-br-cell]:focus-visible]:outline-2 [&_[data-br-cell]:focus-visible]:outline-offset-1 [&_[data-br-cell]:focus-visible]:outline-ring [&_[data-br-cell]:focus-visible]:outline-solid",
  "[&_[data-br-s]]:absolute [&_[data-br-s]]:inset-0 [&_[data-br-s]]:overflow-clip [&_[data-br-s]]:rounded-(--br-r) [&_[data-br-s]]:transition-[background-color] [&_[data-br-s]]:duration-150",
  "[&_[data-br-s=idle]]:bg-[color-mix(in_oklab,var(--ink-3)_10%,transparent)] [&_[data-br-s=idle]]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ink-3)_26%,transparent)]",
  "[&_[data-br-s=queued]]:bg-[color-mix(in_oklab,var(--ink-3)_16%,transparent)] [&_[data-br-s=queued]]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ink-3)_40%,transparent)]",
  "[&_[data-br-s=active]]:bg-[color-mix(in_oklab,var(--br-done)_34%,transparent)] [&_[data-br-s=active]]:shadow-[0_0_0_1.5px_var(--br-done)]",
  "[&_[data-br-s=done]]:bg-(--br-done) [&_[data-br-s=failed]]:bg-(--br-fail)",
  "[&_[data-br-s=skipped]]:border [&_[data-br-s=skipped]]:border-dashed [&_[data-br-s=skipped]]:border-[color-mix(in_oklab,var(--ink-3)_70%,transparent)]",
].join(" ");

/**
 * One item. Its box never moves; the fill inside it is what lands. A cell that
 * finishes is stamped — it grows from 55% to full size on flick as the pigment
 * floods in — so a row of them reads as one ripple. A failure fills red with a
 * slash and does not bounce.
 */
const Cell = React.memo(function Cell({
  id,
  index,
  state,
  name,
  tabbable,
  motionSafe,
  register,
}: CellProps) {
  const fill = React.useRef<HTMLSpanElement | null>(null);
  const [seen, setSeen] = React.useState(state);
  const [stamp, setStamp] = React.useState(0);
  // Decided in render from the new state, so the stamp starts in the commit
  // that paints the colour.
  if (seen !== state) {
    setSeen(state);
    if (state === "done" || state === "failed") setStamp((n) => n + 1);
  }

  React.useEffect(() => {
    const node = fill.current;
    if (!node || stamp === 0 || !motionSafe) return;
    const controls = animate(node, { scale: [0.55, 1] }, springs.flick);
    // A re-run finishes the stamp rather than freezing it half grown.
    return () => controls.complete();
  }, [stamp, motionSafe]);

  return (
    <span
      ref={(node) => register(id, node)}
      role="gridcell"
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      data-br-cell={index}
    >
      <span ref={fill} aria-hidden data-br-s={state}>
        {state === "failed" ? (
          <span className="absolute top-1/2 left-[12%] h-px w-[76%] -rotate-45 bg-card" />
        ) : null}
      </span>
    </span>
  );
});

/* ----------------------------------------------------------------------- */
/*                                The dialog                                */
/* ----------------------------------------------------------------------- */

type Phase = "confirm" | "running" | "paused" | "done";

type Run = {
  token: number;
  kind: "run" | "retry";
  queue: string[];
  inflight: Set<string>;
  total: number;
  landed: number;
  quarter: number;
  paused: boolean;
  stopped: boolean;
  action: string;
  target?: string;
};

type Latest = {
  run: BatchRunnerProps["run"];
  pace: number;
  onProgress: BatchRunnerProps["onProgress"];
  onComplete: BatchRunnerProps["onComplete"];
  byId: Map<string, BatchItem>;
  items: BatchItem[];
  actionOf: (id: string) => BatchAction | undefined;
  itemLabel: { one: string; other: string };
};

const QUARTERS = ["", "A quarter done", "Half done", "Three quarters done"];

/**
 * A bulk-action dialog that runs inside itself. It confirms the scope — the
 * action from a segmented picker, its target, and one cell per item in reading
 * order — then works through the selection where the visitor can watch: a
 * soft band glides down the grid a row at a time on glide while each cell
 * under it is stamped done on flick, so every row reads as a ripple; failures
 * fill red with a slash, keep their reason, and never bounce. Live counts and a
 * progress line follow along; Escape pauses after the item in flight, Stop
 * leaves the rest untouched. Finishing folds the counts into one plain
 * sentence with the failures grouped by reason, and Retry failed reruns only
 * the red cells.
 *
 * It is a `role="dialog"` with a roving radiogroup for the action and a
 * `role="grid"` of cells with one tab stop (arrows, Home/End, Page keys) whose
 * names say each item and its state. Under reduced motion nothing travels or
 * grows: cells change colour on a short tween, the band steps, and every count
 * and sentence still updates.
 */
export function BatchRunner({
  items = defaultBatchItems,
  actions = defaultBatchActions,
  action,
  defaultAction,
  onActionChange,
  run,
  pace = 24,
  autoStart = false,
  itemLabel = { one: "conversation", other: "conversations" },
  source = "From Open · Coldbrook Support",
  onRun,
  onRetry,
  onCancel,
  onPauseChange,
  onProgress,
  onComplete,
  onClose,
  cellShape = "square",
  cellSize = 11,
  palette = "cobalt",
  maxGridHeight = 200,
  status = "ready",
  onReload,
  modal = false,
  disabled = false,
  className,
}: BatchRunnerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const n = items.length;

  /* ------------------------------ action -------------------------------- */

  const [ownAction, setOwnAction] = React.useState(
    () => defaultAction ?? actions[0]?.id ?? "",
  );
  const actionId = action ?? ownAction;
  const current =
    actions.find((a) => a.id === actionId) ??
    actions[0] ??
    defaultBatchActions[0];
  const [targets, setTargets] = React.useState<Record<string, string>>({});
  const target = current?.targets?.length
    ? (targets[current.id] ?? current.targets[0])
    : undefined;

  /* ------------------------------- cells -------------------------------- */

  const [phase, setPhase] = React.useState<Phase>("confirm");
  const [states, setStates] = React.useState<
    ReadonlyMap<string, BatchCellState>
  >(() => new Map());
  const [reasons, setReasons] = React.useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [head, setHead] = React.useState(-1);
  const [summary, setSummary] = React.useState<BatchSummary | null>(null);
  const [passTotal, setPassTotal] = React.useState(0);
  const [passKind, setPassKind] = React.useState<"run" | "retry">("run");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  const statesRef = React.useRef(new Map<string, BatchCellState>());
  const reasonsRef = React.useRef(new Map<string, string>());
  const runRef = React.useRef<Run | null>(null);
  const tokens = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const alive = React.useRef(false);

  const byId = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const indexOf = React.useMemo(
    () => new Map(items.map((item, i) => [item.id, i])),
    [items],
  );

  const latest = React.useRef<Latest>({
    run,
    pace,
    onProgress,
    onComplete,
    byId,
    items,
    actionOf: () => undefined,
    itemLabel,
  });
  React.useEffect(() => {
    latest.current = {
      run,
      pace,
      onProgress,
      onComplete,
      byId,
      items,
      actionOf: (id) => actions.find((a) => a.id === id),
      itemLabel,
    };
  });

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      runRef.current = null;
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  /* ------------------------------ counting ------------------------------ */

  const tally = (map: ReadonlyMap<string, BatchCellState>) => {
    let done = 0;
    let failed = 0;
    let skipped = 0;
    for (const item of latest.current.items) {
      const s = map.get(item.id);
      if (s === "done") done += 1;
      else if (s === "failed") failed += 1;
      else if (s === "skipped") skipped += 1;
    }
    return { done, failed, skipped };
  };

  const progressOf = (map: ReadonlyMap<string, BatchCellState>) => {
    const t = tally(map);
    return {
      done: t.done,
      failed: t.failed,
      left: latest.current.items.length - t.done - t.failed,
    };
  };

  const publish = () => {
    setStates(new Map(statesRef.current));
    setReasons(new Map(reasonsRef.current));
  };

  const summarise = (r: Run): BatchSummary => {
    const map = statesRef.current;
    const t = tally(map);
    const groups = new Map<string, string[]>();
    for (const item of latest.current.items) {
      if (map.get(item.id) !== "failed") continue;
      const why = reasonsRef.current.get(item.id) ?? "Something went wrong";
      const list = groups.get(why);
      if (list) list.push(item.id);
      else groups.set(why, [item.id]);
    }
    return {
      action: r.action,
      target: r.target,
      total: latest.current.items.length,
      done: t.done,
      failed: t.failed,
      skipped: t.skipped,
      reasons: [...groups.entries()]
        .map(([reason, ids]) => ({ reason, ids }))
        .sort((a, b) => b.ids.length - a.ids.length),
      cancelled: r.stopped,
    };
  };

  /* -------------------------------- run --------------------------------- */

  const finish = (r: Run) => {
    if (runRef.current !== r) return;
    runRef.current = null;
    const s = summarise(r);
    setSummary(s);
    setPhase("done");
    publish();
    say(
      sentenceOf(
        s,
        latest.current.actionOf(s.action),
        latest.current.itemLabel,
      ),
    );
    latest.current.onComplete?.(s);
  };

  // The built-in simulation is pacing for show, so it waits while the dialog
  // is off screen or the tab is hidden: a step that comes due then is parked
  // and released when the dialog is seen again. (A host's own run is real
  // work and is never held.)
  const seen = React.useRef(true);
  const parked = React.useRef<(() => void)[]>([]);
  const simulate = (item: BatchItem | undefined, attempt: number, ms: number) =>
    new Promise<void>((resolve, reject) => {
      const land = () => {
        if (item?.error && (attempt === 1 || !item.recovers)) {
          reject(new Error(item.error));
        } else resolve();
      };
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        if (seen.current) land();
        else parked.current.push(land);
      }, ms);
      timers.current.add(t);
    });

  const attempts = React.useRef(new Map<string, number>());

  const settle = (r: Run, id: string, error: string | null) => {
    if (runRef.current !== r || !alive.current) return;
    r.inflight.delete(id);
    statesRef.current.set(id, error === null ? "done" : "failed");
    if (error === null) reasonsRef.current.delete(id);
    else reasonsRef.current.set(id, error);
    r.landed += 1;
    publish();
    latest.current.onProgress?.(progressOf(statesRef.current));
    // Spoken per quarter of the pass, never per item.
    const q = Math.floor((r.landed / Math.max(1, r.total)) * 4);
    if (q > r.quarter && q < 4) {
      r.quarter = q;
      say(`${QUARTERS[q] ?? ""}, ${r.landed} of ${r.total}.`);
    }
    pump(r);
  };

  const pump = (r: Run) => {
    if (runRef.current !== r || !alive.current) return;
    if (r.paused) return;
    if (r.stopped) {
      if (r.inflight.size === 0) finish(r);
      return;
    }
    const { pace: p, run: work } = latest.current;
    // One at a time, in reading order: the cells land as the work does.
    const limit = 1;
    let started = false;
    while (r.inflight.size < limit && r.queue.length > 0) {
      const id = r.queue.shift();
      if (id === undefined) break;
      r.inflight.add(id);
      started = true;
      const attempt = (attempts.current.get(id) ?? 0) + 1;
      attempts.current.set(id, attempt);
      statesRef.current.set(id, "active");
      setHead(indexOf.get(id) ?? -1);
      const item = latest.current.byId.get(id);
      const ms = Math.round(
        r.kind === "retry" ? Math.max(280, p) : Math.max(4, p),
      );
      let job: Promise<void>;
      try {
        job = work
          ? Promise.resolve(
              item
                ? work(item, { action: r.action, target: r.target, attempt })
                : undefined,
            )
          : simulate(item, attempt, ms);
      } catch (error) {
        job = Promise.reject(error);
      }
      job.then(
        () => settle(r, id, null),
        (error: unknown) => settle(r, id, reasonOf(error)),
      );
    }
    if (started) publish();
    if (r.inflight.size === 0 && r.queue.length === 0) finish(r);
  };

  const begin = (ids: string[], kind: "run" | "retry") => {
    tokens.current += 1;
    const r: Run = {
      token: tokens.current,
      kind,
      queue: [...ids],
      inflight: new Set(),
      total: ids.length,
      landed: 0,
      quarter: 0,
      paused: false,
      stopped: false,
      action: current?.id ?? "",
      target,
    };
    for (const id of ids) {
      statesRef.current.set(id, "queued");
      reasonsRef.current.delete(id);
    }
    runRef.current = r;
    setPassTotal(ids.length);
    setPassKind(kind);
    setSummary(null);
    setPhase("running");
    publish();
    pump(r);
  };

  const start = () => {
    if (disabled || !ready || phase !== "confirm" || n === 0 || !current)
      return;
    const ids = items.map((item) => item.id);
    statesRef.current = new Map();
    reasonsRef.current = new Map();
    attempts.current = new Map();
    onRun?.({ action: current.id, target, ids });
    say(`${current.progressive} ${countOf(n, itemLabel)}.`);
    begin(ids, "run");
  };

  const retry = () => {
    if (disabled || phase !== "done") return;
    const ids = items
      .filter((item) => statesRef.current.get(item.id) === "failed")
      .map((item) => item.id);
    if (ids.length === 0) return;
    onRetry?.(ids);
    say(`Retrying ${countOf(ids.length, itemLabel)}.`);
    begin(ids, "retry");
  };

  const pause = () => {
    const r = runRef.current;
    if (!r || r.paused || r.stopped || phase !== "running") return;
    r.paused = true;
    setPhase("paused");
    onPauseChange?.(true);
    say(`Paused at ${r.landed + r.inflight.size} of ${r.total}.`);
  };

  const resume = () => {
    const r = runRef.current;
    if (!r || !r.paused) return;
    r.paused = false;
    setPhase("running");
    onPauseChange?.(false);
    say("Resumed.");
    pump(r);
  };

  const stop = () => {
    const r = runRef.current;
    if (!r || r.stopped) return;
    r.stopped = true;
    r.paused = false;
    for (const id of r.queue) statesRef.current.set(id, "skipped");
    r.queue = [];
    publish();
    onCancel?.(progressOf(statesRef.current));
    pump(r);
  };

  const cancelConfirm = () => {
    if (disabled) return;
    onCancel?.({ done: 0, failed: 0, left: n });
  };

  /* ----------------------------- auto start ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);

  // Whether anyone can see the dialog: in view, in a visible tab.
  React.useEffect(() => {
    if (!root) return;
    let inView = true;
    const update = () => {
      seen.current = inView && !document.hidden;
      if (!seen.current) return;
      const waiting = parked.current;
      parked.current = [];
      for (const land of waiting) land();
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      update();
    });
    io.observe(root);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [root]);
  const startRef = React.useRef(start);
  React.useEffect(() => {
    startRef.current = start;
  });
  React.useEffect(() => {
    if (!autoStart || !root || phase !== "confirm" || !ready) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          startRef.current();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [autoStart, root, phase, ready]);

  /* ------------------------------- layout ------------------------------- */

  const [gridNode, setGridNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!gridNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w * 100) / 100);
    });
    ro.observe(gridNode);
    return () => ro.disconnect();
  }, [gridNode]);
  const layout =
    width > 0
      ? fitLayout(width, Math.max(1, n), cellSize, cellShape, maxGridHeight)
      : initialLayout(cellSize, cellShape);
  const cols = layout.cols;

  /* ------------------------------ the band ------------------------------ */

  const bandY = useMotionValue(0);
  const headRow = cols > 0 && head >= 0 ? Math.floor(head / cols) : 0;
  const bandTarget = r2(headRow * (layout.h + layout.g));
  React.useEffect(() => {
    if (!motionSafe) {
      bandY.jump(bandTarget);
      return;
    }
    const controls = animate(bandY, bandTarget, springs.glide);
    return () => controls.stop();
  }, [bandTarget, motionSafe, bandY]);

  /* ---------------------------- progress line --------------------------- */

  const counts = (() => {
    let done = 0;
    let failed = 0;
    let skipped = 0;
    for (const item of items) {
      const s = states.get(item.id);
      if (s === "done") done += 1;
      else if (s === "failed") failed += 1;
      else if (s === "skipped") skipped += 1;
    }
    return { done, failed, skipped, left: n - done - failed - skipped };
  })();
  const fraction =
    phase === "confirm" || n === 0
      ? 0
      : r2((counts.done + counts.failed + counts.skipped) / n);
  const progress = useMotionValue(0);
  React.useEffect(() => {
    if (!motionSafe) {
      progress.jump(fraction);
      return;
    }
    const controls = animate(progress, fraction, springs.glide);
    return () => controls.stop();
  }, [fraction, motionSafe, progress]);

  /* ------------------------------ keyboard ------------------------------ */

  const cellNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const register = React.useCallback(
    (id: string, node: HTMLSpanElement | null) => {
      if (node) cellNodes.current.set(id, node);
      else cellNodes.current.delete(id);
    },
    [],
  );
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const [gridFocused, setGridFocused] = React.useState(false);
  const activeIdx = clamp(focusIdx, 0, Math.max(0, n - 1));

  const focusCell = (i: number) => {
    const to = clamp(i, 0, n - 1);
    const item = items[to];
    if (!item) return;
    setFocusIdx(to);
    cellNodes.current.get(item.id)?.focus();
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const c = Math.max(1, cols || 1);
    const i = activeIdx;
    const rowStart = i - (i % c);
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + c,
      ArrowUp: i - c,
      Home: event.ctrlKey || event.metaKey ? 0 : rowStart,
      End:
        event.ctrlKey || event.metaKey
          ? n - 1
          : Math.min(n - 1, rowStart + c - 1),
      PageDown: i + c * 5,
      PageUp: i - c * 5,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusCell(to);
  };

  const cellIndexFrom = (target: EventTarget | null) => {
    const el =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-br-cell]")
        : null;
    if (!el) return null;
    const i = Number(el.dataset.brCell);
    return Number.isFinite(i) ? i : null;
  };

  const focusReason = (reason: string) => {
    const at = items.findIndex(
      (item) =>
        states.get(item.id) === "failed" && reasons.get(item.id) === reason,
    );
    if (at >= 0) focusCell(at);
  };

  /* ------------------------------ dialog keys --------------------------- */

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Ours, in every phase: the stage behind must not close on it.
      event.preventDefault();
      event.stopPropagation();
      if (phase === "running") pause();
      else if (phase === "confirm") cancelConfirm();
      else if (phase === "done") onClose?.();
      return;
    }
    if (modal && event.key === "Tab" && root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  /* -------------------------------- picker ------------------------------ */

  const pickerRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const choose = (id: string, focus = false) => {
    if (disabled || phase !== "confirm") return;
    if (action === undefined) setOwnAction(id);
    if (id !== actionId) onActionChange?.(id);
    if (focus) pickerRefs.current.get(id)?.focus();
  };
  const onPickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = actions.findIndex((a) => a.id === current?.id);
    const map: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: actions.length - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = actions[(to + actions.length) % actions.length];
    if (next) choose(next.id, true);
  };

  /* ------------------------------- footer ------------------------------- */

  const primaryRef = React.useRef<HTMLButtonElement | null>(null);
  const failedNow = counts.failed;
  const secondaryShown = phase !== "done" || failedNow > 0;

  const onSecondary = () => {
    if (phase === "confirm") cancelConfirm();
    else if (phase === "running" || phase === "paused") {
      const r = runRef.current;
      const willHaveFailures =
        r !== null &&
        items.some((item) => statesRef.current.get(item.id) === "failed");
      // The button may turn into Retry or leave; focus is kept either way.
      if (!willHaveFailures) primaryRef.current?.focus();
      stop();
    } else if (phase === "done") {
      retry();
    }
  };

  const onPrimary = () => {
    if (phase === "confirm") start();
    else if (phase === "running") pause();
    else if (phase === "paused") resume();
    else onClose?.();
  };

  /* -------------------------------- copy -------------------------------- */

  const Icon = ICONS[current?.icon ?? "list"] ?? ListChecks;
  const landedNow = counts.done + counts.failed + counts.skipped;
  const title = !ready
    ? status === "loading"
      ? "Counting the selection"
      : "The selection did not load"
    : phase === "confirm"
      ? `${current?.label ?? "Run"} ${countOf(n, itemLabel)}?`
      : phase === "running"
        ? passKind === "retry"
          ? `Retrying ${countOf(passTotal, itemLabel)}`
          : `${current?.progressive ?? "Running"} ${countOf(n, itemLabel)}`
        : phase === "paused"
          ? `Paused at ${landedNow} of ${n}`
          : summary?.cancelled
            ? `${current?.label ?? "Run"} stopped`
            : `${current?.label ?? "Run"} complete`;

  const primaryLabel =
    phase === "confirm"
      ? `${current?.label ?? "Run"} ${n}`
      : phase === "running"
        ? "Pause"
        : phase === "paused"
          ? "Resume"
          : "Done";
  const secondaryLabel =
    phase === "confirm"
      ? "Cancel"
      : phase === "running"
        ? "Stop"
        : phase === "paused"
          ? "Stop here"
          : `Retry failed (${failedNow})`;
  const primaryHeld = disabled || !ready || (phase === "confirm" && n === 0);

  const inspectIdx =
    hoverIdx ??
    (gridFocused ? activeIdx : null) ??
    (phase === "running" && head >= 0 ? head : null);
  const inspected = inspectIdx === null ? undefined : items[inspectIdx];
  const stateWord = (s: BatchCellState, id: string) =>
    s === "done"
      ? (current?.past ?? "done").toLowerCase()
      : s === "failed"
        ? `failed: ${reasons.get(id) ?? "something went wrong"}`
        : s === "active"
          ? "working"
          : s === "skipped"
            ? "left as it was"
            : s === "queued"
              ? "waiting"
              : "not started";

  const cellName = (item: BatchItem, i: number, s: BatchCellState) =>
    `${i + 1}. ${item.label}${item.detail ? `, ${item.detail}` : ""}, ${stateWord(s, item.id)}`;

  const rowsOf = (): BatchItem[][] => {
    const c = cols > 0 ? cols : n;
    const out: BatchItem[][] = [];
    for (let i = 0; i < n; i += c) out.push(items.slice(i, i + c));
    return out;
  };

  const doneColor = PALETTES[palette] ?? PALETTES.cobalt;
  const tween = { duration: durations.base, ease: easings.enter };

  /* ------------------------------- render ------------------------------- */

  const picker =
    phase === "confirm" && ready ? (
      <div className="flex flex-col gap-2.5 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            role="radiogroup"
            aria-label="Action"
            onKeyDown={onPickerKeyDown}
            className="inline-flex h-8 items-center rounded-full border border-hairline bg-surface-1 p-0.5"
          >
            {actions.map((a) => {
              const on = a.id === current?.id;
              return (
                <button
                  key={a.id}
                  ref={(node) => {
                    if (node) pickerRefs.current.set(a.id, node);
                    else pickerRefs.current.delete(a.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={disabled || undefined}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(a.id)}
                  className={cn(
                    "relative inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium transition-colors",
                    on ? "text-foreground" : "text-ink-2 hover:text-foreground",
                    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-pill`}
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline-strong bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_10%,transparent)]"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span className="relative">{a.label}</span>
                </button>
              );
            })}
          </div>
          {current?.targets?.length ? (
            <label className="inline-flex h-8 items-center gap-2 text-[12px] text-ink-2">
              {current.targetLabel ?? "To"}
              <select
                value={target}
                disabled={disabled}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  const id = current.id;
                  setTargets((t) => ({ ...t, [id]: value }));
                }}
                className={cn(
                  "h-8 max-w-44 rounded-2 border border-hairline bg-card px-2 text-[13px] text-foreground",
                  FOCUS_RING,
                )}
              >
                {current.targets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="grid">
          <AnimatePresence initial={false}>
            <motion.p
              key={current?.id}
              id={descId}
              className="text-[13px] leading-5 text-ink-2 [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
              transition={tween}
            >
              {current?.description}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    ) : null;

  const grid = (
    <div
      className="relative rounded-3 border border-hairline bg-surface-1 p-2.5"
      onPointerLeave={() => setHoverIdx(null)}
    >
      {status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-1">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex flex-wrap gap-1 overflow-clip">
              {Array.from({ length: 28 }, (_, i) => (
                <span
                  key={i}
                  className="size-2.5 shrink-0 rounded-[2px] bg-[color-mix(in_oklab,var(--ink-3)_14%,transparent)] motion-safe:animate-pulse"
                  style={{ animationDelay: `${(row * 7 + i) * 40}ms` }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-[13px] text-foreground">
            The selection could not be counted.
          </p>
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className="[scrollbar-width:thin] overflow-y-auto overscroll-contain"
          style={{ maxHeight: maxGridHeight + 4, padding: 2, margin: -2 }}
        >
          <div
            ref={setGridNode}
            role="grid"
            aria-label={`${countOf(n, itemLabel)}, one cell each`}
            aria-describedby={hintId}
            aria-readonly
            onKeyDown={onGridKeyDown}
            onFocus={(event) => {
              setGridFocused(true);
              const i = cellIndexFrom(event.target);
              if (i !== null) setFocusIdx(i);
            }}
            onBlur={(event) => {
              const to = event.relatedTarget;
              if (!(to instanceof Node && event.currentTarget.contains(to))) {
                setGridFocused(false);
              }
            }}
            onPointerOver={(event) => {
              const i = cellIndexFrom(event.target);
              if (i !== null && i !== hoverIdx) setHoverIdx(i);
            }}
            className={cn("relative grid", CELL_LOOK)}
            style={
              {
                gridTemplateColumns:
                  cols > 0
                    ? `repeat(${cols}, ${layout.w}px)`
                    : `repeat(auto-fill, ${layout.w}px)`,
                gap: layout.g,
                justifyContent: "center",
                "--br-w": `${layout.w}px`,
                "--br-h": `${layout.h}px`,
                "--br-r":
                  cellShape === "round"
                    ? "999px"
                    : cellShape === "bar"
                      ? "1.5px"
                      : "2px",
              } as React.CSSProperties
            }
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -inset-x-1.5 top-0 rounded-2 bg-[color-mix(in_oklab,var(--br-done)_13%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--br-done)_22%,transparent)]"
              style={{ y: bandY, height: layout.h + 6, marginTop: -3 }}
              initial={false}
              animate={{
                opacity:
                  phase === "running" && cols > 0
                    ? 1
                    : phase === "paused"
                      ? 0.45
                      : 0,
              }}
              transition={{ duration: durations.base, ease: easings.move }}
            />
            {rowsOf().map((row, ri) => (
              <div key={ri} role="row" className="contents">
                {row.map((item, ci) => {
                  const i = ri * (cols > 0 ? cols : n) + ci;
                  const s = states.get(item.id) ?? "idle";
                  return (
                    <Cell
                      key={item.id}
                      id={item.id}
                      index={i}
                      state={s}
                      name={cellName(item, i, s)}
                      tabbable={i === activeIdx}
                      motionSafe={motionSafe}
                      register={register}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const inspector = ready ? (
    <p
      aria-hidden
      className="mt-2 flex h-5 min-w-0 items-center gap-1.5 text-[12px] text-ink-3"
    >
      {inspected && inspectIdx !== null ? (
        <>
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            #{inspectIdx + 1}
          </span>
          <span className="min-w-0 truncate">
            <span className="text-ink-2">{inspected.label}</span>
            {inspected.detail ? ` · ${inspected.detail}` : ""}
          </span>
          <span
            className={cn(
              "shrink-0",
              states.get(inspected.id) === "failed"
                ? "text-danger"
                : "text-ink-2",
            )}
          >
            — {stateWord(states.get(inspected.id) ?? "idle", inspected.id)}
          </span>
        </>
      ) : (
        <span className="truncate">
          Each cell is one {itemLabel.one}. Hover or focus one to read it.
        </span>
      )}
    </p>
  ) : null;

  const countsRow =
    phase === "running" || phase === "paused" ? (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-(--br-done)" />
          <span className="font-mono text-foreground tabular-nums">
            {counts.done}
          </span>
          {(current?.past ?? "done").toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-(--br-fail)" />
          <span className="font-mono text-foreground tabular-nums">
            {counts.failed}
          </span>
          failed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-[2px] shadow-[inset_0_0_0_1px_var(--ink-3)]"
          />
          <span className="font-mono text-foreground tabular-nums">
            {counts.left}
          </span>
          left
        </span>
      </div>
    ) : null;

  const sentence =
    phase === "done" && summary ? (
      <motion.div
        className="flex flex-col gap-2 pt-3"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween}
      >
        <p className="text-[13px] leading-5 text-foreground">
          {sentenceOf(
            summary,
            actions.find((a) => a.id === summary.action),
            itemLabel,
          )}
        </p>
        {summary.reasons.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {summary.reasons.map((group) => (
              <li key={group.reason}>
                <button
                  type="button"
                  onClick={() => focusReason(group.reason)}
                  className={cn(
                    "inline-flex h-7 max-w-full items-center gap-2 rounded-2 px-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px] bg-(--br-fail)"
                  />
                  <span className="shrink-0 font-mono text-foreground tabular-nums">
                    {group.ids.length}
                  </span>
                  <span className="min-w-0 truncate">{group.reason}</span>
                  <span className="sr-only">, show the first one</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </motion.div>
    ) : null;

  const button =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-[background-color,color,opacity]";

  return (
    <div
      ref={setRoot}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      aria-describedby={phase === "confirm" && ready ? descId : undefined}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container/batch-runner relative flex w-full flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_16%,transparent)]",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--br-done": doneColor,
          "--br-fail": FAIL,
        } as React.CSSProperties
      }
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-3 @min-[30rem]/batch-runner:px-5 @min-[30rem]/batch-runner:pt-5">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-3 bg-[color-mix(in_oklab,var(--br-done)_14%,transparent)] text-(--br-done)"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="grid text-[15px] leading-6 font-semibold">
            <AnimatePresence initial={false}>
              <motion.span
                key={title}
                className="text-balance [grid-area:1/1]"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: durations.fast } }}
                transition={tween}
              >
                {title}
              </motion.span>
            </AnimatePresence>
          </h2>
          <p
            className="truncate text-[12px] leading-5 text-ink-3"
            title={source}
          >
            {current?.targets?.length && target && phase !== "confirm"
              ? `${source} · to ${target}`
              : source}
          </p>
        </div>
      </header>

      <div
        aria-hidden
        className="relative mx-4 h-0.5 overflow-clip rounded-full bg-hairline @min-[30rem]/batch-runner:mx-5"
      >
        <motion.span
          className="absolute inset-0 origin-left rounded-full bg-(--br-done)"
          style={{ scaleX: progress }}
        />
      </div>

      <p id={hintId} className="sr-only">
        Arrow keys move between cells, Home and End to the ends of a row, Page
        Up and Page Down five rows. Escape pauses a run.
      </p>

      <Measured glide={motionSafe}>
        <div className="px-4 pt-3 pb-4 @min-[30rem]/batch-runner:px-5">
          {picker}
          {grid}
          {inspector}
          {countsRow}
          {sentence}
        </div>
      </Measured>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-1 px-4 py-3 @min-[30rem]/batch-runner:px-5">
        {secondaryShown ? (
          <button
            key="secondary"
            type="button"
            onClick={onSecondary}
            aria-disabled={disabled || undefined}
            className={cn(
              button,
              "border border-hairline bg-card text-foreground hover:bg-surface-2",
              phase === "done" && "text-danger",
              FOCUS_RING,
            )}
          >
            {phase === "done" ? (
              <RotateCcw aria-hidden className="size-3.5" />
            ) : null}
            {secondaryLabel}
          </button>
        ) : null}
        <button
          key="primary"
          ref={primaryRef}
          type="button"
          onClick={() => {
            if (!primaryHeld) onPrimary();
          }}
          aria-disabled={primaryHeld || undefined}
          className={cn(
            button,
            "bg-primary text-primary-foreground hover:opacity-90 aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          {phase === "running" ? (
            <Pause aria-hidden className="size-3.5" />
          ) : phase === "paused" ? (
            <Play aria-hidden className="size-3.5" />
          ) : null}
          {primaryLabel}
        </button>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
