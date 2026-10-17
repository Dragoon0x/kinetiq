"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Archive,
  CircleAlert,
  CircleCheck,
  CornerDownLeft,
  Download,
  Flag,
  GitMerge,
  LoaderCircle,
  RotateCcw,
  Search,
  Tag,
  Ticket,
  Trash2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type BatchItemStatus = "open" | "progress" | "closed";
export type BatchPriority = "low" | "medium" | "high" | "urgent";
export type BatchChipStyle = "pill" | "tag" | "stub";
export type BatchPhase = "items" | "actions";
export type BatchStatus = "ready" | "loading" | "error";
export type BatchAccent = "cobalt" | "plum" | "mint" | "ink";
export type BatchActionIcon =
  | "assign"
  | "priority"
  | "done"
  | "label"
  | "merge"
  | "export"
  | "duplicate"
  | "delete";

export type BatchItem = {
  id: string;
  /** The short key a chip shows ("GW-1042"). */
  key: string;
  title: string;
  status: BatchItemStatus;
  priority?: BatchPriority;
  /** Initials of whoever has it. */
  assignee?: string;
  /** When it last changed, in ms since the epoch. */
  updated?: number;
  /** More words that find it. */
  keywords?: string[];
};

export type BatchAction = {
  id: string;
  label: string;
  icon: BatchActionIcon;
  /** Statuses it can act on. Others are skipped and shown struck through. @default every status */
  appliesTo?: BatchItemStatus[];
  /** Why nothing picked fits it ("These are already closed"). */
  unsupportedReason?: string;
  /** Fewest supported items it needs. */
  min?: number;
  /** Most supported items it takes at once. */
  max?: number;
  /** The summary after it runs; "{n}" becomes "2 tickets" ("Moved {n} to Done"). */
  past?: string;
  /** Destructive actions are drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
  keywords?: string[];
};

export type BatchRunResult = {
  /** Items that did not go through, each with the reason shown to the person. */
  failed?: { id: string; reason: string }[];
};

export type BatchPaletteProps = {
  /** How a picked item is drawn in the tray and the fan. @default "pill" */
  chipStyle?: BatchChipStyle;
  /** Degrees between neighbouring chips when they fan out over an action; 0 is a neat stack. @default 6 */
  fanSpread?: number;
  /** Highlight, chips and checks. A name or any CSS colour. @default "cobalt" */
  accent?: BatchAccent | (string & {});
  /** Everything that can be picked. @default defaultBatchItems */
  items?: BatchItem[];
  /** What can be done to the picked items. @default defaultBatchActions */
  actions?: BatchAction[];
  /** Controlled: ids of the picked items, in the order they were picked. */
  selection?: string[];
  /** Initial pick when uncontrolled. @default [] */
  defaultSelection?: string[];
  /** Fires with the new pick from the key, click or run that changed it. */
  onSelectionChange?: (ids: string[]) => void;
  /** Run an action on the supported picked items. Return (or resolve to) `{ failed }` for a partial failure. */
  onRunAction?: (
    action: BatchAction,
    items: BatchItem[],
  ) => void | BatchRunResult | Promise<void | BatchRunResult>;
  /** The tray's Clear was pressed. */
  onClearSelection?: () => void;
  /** Controlled list: picking items or choosing an action. */
  phase?: BatchPhase;
  /** Initial list when uncontrolled. @default "items" */
  defaultPhase?: BatchPhase;
  /** Fires from the Tab, click or run that switched lists. */
  onPhaseChange?: (phase: BatchPhase) => void;
  /** Most chips fanned over an action; the rest are counted. @default 6 */
  maxFan?: number;
  /** Whether the items have arrived: skeleton rows while loading, a message with Try again on error. @default "ready" */
  status?: BatchStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The time ages are read from, in ms. @default defaultBatchNow */
  now?: number;
  /** What one item and many are called. @default ["ticket", "tickets"] */
  itemNoun?: [string, string];
  /** The field's placeholder while picking. @default "Find tickets…" */
  placeholder?: string;
  /** The palette's accessible name. @default "Batch actions" */
  label?: string;
  /** Escape on an empty field while picking. Without it Escape is left to the page. */
  onDismiss?: () => void;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Friday 16 October 2026, 13:20 UTC. */
export const defaultBatchNow = Date.UTC(2026, 9, 16, 13, 20);
const HOUR = 3_600_000;
const N = defaultBatchNow;

export const defaultBatchItems: BatchItem[] = [
  {
    id: "gw-1042",
    key: "GW-1042",
    title: "Gauge readings drift after firmware 4.2",
    status: "open",
    priority: "high",
    assignee: "IP",
    updated: N - 2 * HOUR,
    keywords: ["firmware", "drift"],
  },
  {
    id: "gw-1043",
    key: "GW-1043",
    title: "Export to CSV drops the unit column",
    status: "open",
    priority: "medium",
    assignee: "TR",
    updated: N - 5 * HOUR,
    keywords: ["export", "csv"],
  },
  {
    id: "gw-1045",
    key: "GW-1045",
    title: "Calibration reminders sent twice",
    status: "progress",
    priority: "medium",
    assignee: "JV",
    updated: N - 26 * HOUR,
    keywords: ["email", "calibration"],
  },
  {
    id: "gw-1047",
    key: "GW-1047",
    title: "Dashboard tiles flicker on resize",
    status: "open",
    priority: "low",
    assignee: "TR",
    updated: N - 3 * HOUR,
    keywords: ["dashboard", "ui"],
  },
  {
    id: "gw-1048",
    key: "GW-1048",
    title: "Sensor offline banner never clears",
    status: "open",
    priority: "urgent",
    assignee: "IP",
    updated: N - 1 * HOUR,
    keywords: ["sensor", "banner"],
  },
  {
    id: "gw-1050",
    key: "GW-1050",
    title: "Readings drift after update (duplicate)",
    status: "closed",
    priority: "low",
    updated: N - 50 * HOUR,
    keywords: ["firmware", "duplicate"],
  },
  {
    id: "gw-1051",
    key: "GW-1051",
    title: "Celsius and Fahrenheit toggle for reports",
    status: "open",
    priority: "low",
    updated: N - 8 * HOUR,
    keywords: ["units", "reports"],
  },
  {
    id: "gw-1053",
    key: "GW-1053",
    title: "Alert thresholds reset on save",
    status: "progress",
    priority: "high",
    assignee: "JV",
    updated: N - 4 * HOUR,
    keywords: ["alerts", "settings"],
  },
  {
    id: "gw-1054",
    key: "GW-1054",
    title: "Mobile app signs out every hour",
    status: "open",
    priority: "medium",
    updated: N - 30 * HOUR,
    keywords: ["mobile", "session"],
  },
  {
    id: "gw-1056",
    key: "GW-1056",
    title: "Typo in the onboarding checklist",
    status: "closed",
    priority: "low",
    assignee: "IP",
    updated: N - 72 * HOUR,
    keywords: ["copy"],
  },
];

const LIVE: BatchItemStatus[] = ["open", "progress"];

export const defaultBatchActions: BatchAction[] = [
  {
    id: "assign",
    label: "Assign to me",
    icon: "assign",
    appliesTo: LIVE,
    unsupportedReason: "Closed tickets can’t be assigned",
    max: 20,
    past: "Assigned {n} to you",
  },
  {
    id: "done",
    label: "Move to Done",
    icon: "done",
    appliesTo: LIVE,
    unsupportedReason: "These are already closed",
    past: "Moved {n} to Done",
  },
  {
    id: "priority",
    label: "Set priority to High",
    icon: "priority",
    appliesTo: LIVE,
    unsupportedReason: "Closed tickets keep their priority",
    past: "Raised {n} to High",
  },
  {
    id: "label",
    label: "Add label “firmware”",
    icon: "label",
    past: "Labelled {n}",
  },
  {
    id: "merge",
    label: "Merge into one ticket",
    icon: "merge",
    appliesTo: LIVE,
    unsupportedReason: "Only open tickets merge",
    min: 2,
    max: 4,
    past: "Merged {n}",
  },
  {
    id: "export",
    label: "Export as CSV",
    icon: "export",
    max: 50,
    past: "Exported {n}",
  },
  {
    id: "duplicate",
    label: "Close as duplicate",
    icon: "duplicate",
    appliesTo: LIVE,
    unsupportedReason: "These are already closed",
    past: "Closed {n} as duplicates",
  },
  {
    id: "delete",
    label: "Delete",
    icon: "delete",
    tone: "danger",
    max: 5,
    past: "Deleted {n}",
  },
];

const ICONS: Record<BatchActionIcon, typeof Tag> = {
  assign: UserPlus,
  priority: Flag,
  done: CircleCheck,
  label: Tag,
  merge: GitMerge,
  export: Download,
  duplicate: Archive,
  delete: Trash2,
};

const ACCENTS: Record<BatchAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  open: "Open",
  progress: "In progress",
  closed: "Closed",
};

const STATUS_INK: Record<BatchItemStatus, string> = {
  open: "var(--bp-accent)",
  progress: "var(--warn)",
  closed: "var(--ink-3)",
};

const PRIORITY_DOT: Record<BatchPriority, string> = {
  low: "bg-ink-3",
  medium: "bg-warn",
  high: "bg-danger",
  urgent: "bg-danger",
};

const TRAY_H = 48;
const LIST_H = 300;
const ROW_H = 40;
const ACTION_H = 48;
const HEADER_H = 28;
const LIST_PAD = 6;
const NARROW = 544;
const EMPTY: string[] = [];
const NOUN: [string, string] = ["ticket", "tickets"];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/* --------------------------------- helpers -------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const age = (now: number, at: number): string => {
  const hours = Math.round((now - at) / HOUR);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
};

const matches = (text: string, query: string): boolean => {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const t = text.toLowerCase();
  return q.split(/\s+/).every((word) => t.includes(word));
};

type Verdict = {
  supported: BatchItem[];
  unsupported: Set<string>;
  over: Set<string>;
  reason: string | null;
};

/** What an action would do to the pick: which items it touches, skips, or cannot take. */
const judge = (
  action: BatchAction,
  picked: BatchItem[],
  noun: [string, string],
): Verdict => {
  const unsupported = new Set<string>();
  const supported: BatchItem[] = [];
  for (const item of picked) {
    if (action.appliesTo && !action.appliesTo.includes(item.status)) {
      unsupported.add(item.id);
    } else supported.push(item);
  }
  const over = new Set<string>();
  let reason: string | null = null;
  if (!picked.length) reason = `Pick ${noun[1]} first`;
  else if (!supported.length)
    reason = action.unsupportedReason ?? "None of these fit";
  else if (action.min !== undefined && supported.length < action.min)
    reason = `Pick ${action.min} or more`;
  else if (action.max !== undefined && supported.length > action.max) {
    reason = `Up to ${action.max} at once`;
    for (const item of supported.slice(action.max)) over.add(item.id);
  }
  return { supported, unsupported, over, reason };
};

const counted = (n: number, noun: [string, string]) =>
  `${n} ${n === 1 ? noun[0] : noun[1]}`;

type Point = { x: number; y: number };

/** A chip or a row key by id: namespaced attributes, so no ref map can go stale. */
const findIn = (root: Element | null, attr: string, id: string) => {
  if (!root) return null;
  const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  return root.querySelector(`[${attr}="${safe}"]`);
};

/** An element's top-left in the palette's own box. */
const relTo = (
  root: Element | null,
  el: Element | null | undefined,
): Point | null => {
  if (!el || !root) return null;
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: r2(a.left - b.left), y: r2(a.top - b.top) };
};

/* ---------------------------------- chips --------------------------------- */

function ChipFace({
  item,
  chipStyle,
  failed = false,
  struck = false,
  small = false,
  compact = false,
  children,
}: {
  item: BatchItem;
  chipStyle: BatchChipStyle;
  failed?: boolean;
  struck?: boolean;
  small?: boolean;
  /** Only the number after the prefix, for a fan on a narrow palette. */
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const ink = failed ? "var(--danger)" : "var(--bp-accent)";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 font-mono whitespace-nowrap tabular-nums transition-[opacity,border-color,color] duration-200",
        small ? "h-6 text-[10.5px]" : "h-7 text-[11px]",
        chipStyle === "pill" &&
          "rounded-full border bg-[color-mix(in_oklab,var(--bp-chip)_14%,var(--popover))] px-2.5 text-[var(--bp-chip)]",
        chipStyle === "tag" &&
          "rounded-1 border border-hairline-strong bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] pr-2 pl-3 text-foreground",
        chipStyle === "stub" && "rounded-2 border bg-card px-3 text-foreground",
        struck && "border-dashed opacity-45",
      )}
      style={
        {
          "--bp-chip": ink,
          borderColor:
            chipStyle === "tag"
              ? undefined
              : `color-mix(in oklab, ${ink} 34%, transparent)`,
          // The stub's punched sides: two holes cut by a mask, so the chip
          // reads the same over a row, the tray or the highlight.
          maskImage:
            chipStyle === "stub"
              ? "radial-gradient(circle 3.5px at 0 50%, transparent 96%, black), radial-gradient(circle 3.5px at 100% 50%, transparent 96%, black)"
              : undefined,
          maskComposite: chipStyle === "stub" ? "intersect" : undefined,
          WebkitMaskComposite: chipStyle === "stub" ? "source-in" : undefined,
        } as React.CSSProperties
      }
    >
      {chipStyle === "tag" ? (
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[3px] rounded-full"
          style={{
            backgroundColor: failed ? "var(--danger)" : STATUS_INK[item.status],
          }}
        />
      ) : null}
      {failed ? (
        <CircleAlert aria-hidden className="size-3 shrink-0 text-danger" />
      ) : null}
      <span className={cn(struck && "line-through")}>
        {compact ? item.key.replace(/^.*-/, "") : item.key}
      </span>
      {children}
    </span>
  );
}

/**
 * The copy of a row's key that flies to the tray. It animates a plain 0→1
 * spring and writes the position itself, because a motion value bound to an
 * element that has only just mounted can sit idle.
 */
function Ghost({
  item,
  chipStyle,
  measureFrom,
  measure,
  onLand,
}: {
  item: BatchItem;
  chipStyle: BatchChipStyle;
  measureFrom: (id: string) => Point | null;
  measure: (id: string) => Point | null;
  onLand: (id: string) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(0);
  const land = React.useRef(onLand);
  React.useEffect(() => {
    land.current = onLand;
  });
  // Lifted off the row's key before the first paint: the row is still there.
  React.useLayoutEffect(() => {
    const from = measureFrom(item.id);
    if (!from) return;
    x.jump(from.x);
    y.jump(from.y);
    opacity.jump(1);
  }, [item.id, measureFrom, opacity, x, y]);
  React.useEffect(() => {
    const from = { x: x.get(), y: y.get() };
    const to = measure(item.id) ?? from;
    const run = animate(0, 1, {
      ...springs.snap,
      onUpdate: (t) => {
        x.set(r2(lerp(from.x, to.x, t)));
        y.set(r2(lerp(from.y, to.y, t)));
      },
      onComplete: () => land.current(item.id),
    });
    // A flight that never finishes (a hidden tab) still lands.
    const safety = window.setTimeout(() => land.current(item.id), 900);
    return () => {
      run.stop();
      window.clearTimeout(safety);
    };
  }, [item.id, measure, x, y]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30 shadow-[0_6px_16px_color-mix(in_oklab,black_18%,transparent)]"
      style={{ x, y, opacity }}
    >
      <ChipFace item={item} chipStyle={chipStyle} />
    </motion.span>
  );
}

type FanTarget = { x: number; y: number; rotate: number };

/**
 * A picked item fanned over the highlighted action. It starts on its chip in
 * the tray, glides to its place in the fan, follows the highlight from row to
 * row, and on the way out goes back to its tray chip — or, when the action
 * just took it, sinks into the row.
 */
function FanChip({
  item,
  chipStyle,
  target,
  delay,
  struck,
  failed,
  running,
  small,
  motionSafe,
  trayPoint,
  absorbed,
  layer,
}: {
  item: BatchItem;
  chipStyle: BatchChipStyle;
  /** Stacking: the first picked lies on top, the rest tuck under it. */
  layer: number;
  target: FanTarget;
  delay: number;
  struck: boolean;
  failed: boolean;
  running: boolean;
  small: boolean;
  motionSafe: boolean;
  trayPoint: (id: string) => Point | null;
  absorbed: (id: string) => boolean;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const x = useMotionValue(target.x);
  const y = useMotionValue(target.y);
  const rotate = useMotionValue(target.rotate);
  const opacity = useMotionValue(0);
  const scale = useMotionValue(1);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const first = React.useRef(true);

  const stopAll = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };

  // Placed on its tray chip before the first paint, so it leaves from there.
  React.useLayoutEffect(() => {
    const from = motionSafe ? trayPoint(item.id) : null;
    if (from) {
      x.jump(from.x);
      y.jump(from.y);
      rotate.jump(0);
    }
    first.current = true;
    // Mount only: later moves glide from wherever it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isPresent) return;
    stopAll();
    if (!motionSafe) {
      x.jump(target.x);
      y.jump(target.y);
      rotate.jump(target.rotate);
      runs.current = [
        animate(opacity, 1, { duration: durations.fast, ease: easings.enter }),
      ];
      return;
    }
    const wait = first.current ? delay : 0;
    first.current = false;
    const spring = { ...springs.glide, delay: wait };
    runs.current = [
      animate(x, target.x, spring),
      animate(y, target.y, spring),
      animate(rotate, target.rotate, spring),
      animate(opacity, 1, { duration: durations.fast, delay: wait }),
      animate(scale, 1, springs.snap),
    ];
    return stopAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, target.x, target.y, target.rotate, motionSafe]);

  React.useEffect(() => {
    if (isPresent) return;
    stopAll();
    const home = trayPoint(item.id);
    let gone = false;
    const done = () => {
      if (gone) return;
      gone = true;
      safeToRemove?.();
    };
    // A stopped animation never completes; the chip still leaves.
    const safety = window.setTimeout(done, 700);
    if (!motionSafe) {
      runs.current = [
        animate(opacity, 0, { ...exitFor(durations.fast), onComplete: done }),
      ];
    } else if (home && !absorbed(item.id)) {
      // Back to its chip: a move, so it glides; it fades only as it arrives.
      runs.current = [
        animate(x, home.x, springs.glide),
        animate(y, home.y, springs.glide),
        animate(rotate, 0, springs.glide),
        animate(opacity, 0, {
          duration: durations.fast,
          delay: 0.26,
          onComplete: done,
        }),
      ];
    } else {
      // Taken by the action: it sinks into the row on the exit ease.
      const ease = { duration: durations.base, ease: easings.exit };
      runs.current = [
        animate(scale, 0.6, ease),
        animate(opacity, 0, { ...ease, onComplete: done }),
        animate(y, y.get() + 10, ease),
      ];
    }
    return () => {
      window.clearTimeout(safety);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(() => stopAll, []);

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0"
      style={{
        x,
        y,
        rotate,
        opacity,
        scale,
        originX: 0.5,
        originY: 0.5,
        zIndex: layer,
      }}
    >
      <motion.span
        className="block shadow-[0_4px_12px_color-mix(in_oklab,black_16%,transparent)]"
        style={{ borderRadius: 999 }}
        animate={running && motionSafe ? { y: [0, -3, 0] } : { y: 0 }}
        transition={
          running && motionSafe
            ? {
                duration: 0.6,
                repeat: Infinity,
                ease: easings.move,
                delay: delay * 2,
              }
            : { duration: durations.fast }
        }
      >
        <ChipFace
          item={item}
          chipStyle={chipStyle}
          struck={struck}
          failed={failed}
          small={small}
          compact={small}
        />
      </motion.span>
    </motion.span>
  );
}

/* -------------------------------- component ------------------------------- */

/**
 * A command menu that gathers several items before choosing what to do with
 * them. Space (once you are moving with the arrows) or Enter picks the
 * highlighted row: a copy of its key flies to the tray at the top and lands
 * there as a chip on the snap spring. Tab moves to the actions, and the chips
 * glide out of the tray to fan over the highlighted action like a hand of
 * cards, following the highlight from row to row, with the ones the action
 * would skip or cannot take struck through — so you see exactly what it will
 * touch before you run it.
 *
 * Running calls `onRunAction` with the supported items; a partial failure
 * comes back as `{ failed }`, and those chips glide home tinted while the rest
 * sink into the action. Backspace on an empty field drops the last chip, Shift
 * and Tab go back, Escape steps back, then clears, then dismisses. Under
 * reduced motion chips fade in place and the fan fades over the row.
 */
export function BatchPalette({
  chipStyle = "pill",
  fanSpread = 6,
  accent = "cobalt",
  items = defaultBatchItems,
  actions = defaultBatchActions,
  selection,
  defaultSelection = EMPTY,
  onSelectionChange,
  onRunAction,
  onClearSelection,
  phase,
  defaultPhase = "items",
  onPhaseChange,
  maxFan = 6,
  status = "ready",
  onRetry,
  now = defaultBatchNow,
  itemNoun = NOUN,
  placeholder = "Find tickets…",
  label = "Batch actions",
  onDismiss,
  className,
}: BatchPaletteProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;

  const [ownSelection, setOwnSelection] = React.useState(defaultSelection);
  const picked = selection ?? ownSelection;
  const [ownPhase, setOwnPhase] = React.useState<BatchPhase>(defaultPhase);
  const shownPhase = phase ?? ownPhase;

  const [itemQuery, setItemQuery] = React.useState("");
  const [actionQuery, setActionQuery] = React.useState("");
  const [itemActive, setItemActive] = React.useState(0);
  const [actionActive, setActionActive] = React.useState(0);
  const [ghosts, setGhosts] = React.useState<{ id: string; n: number }[]>([]);
  const [running, setRunning] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<Map<string, string>>(
    () => new Map(),
  );
  const [result, setResult] = React.useState<{
    text: string;
    failed: number;
    actionId: string;
  } | null>(null);
  const [said, setSaid] = React.useState("");
  const [width, setWidth] = React.useState(0);
  const narrow = width > 0 && width < NARROW;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootEl(node);
  }, []);
  const trayRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyEl, setBodyEl] = React.useState<HTMLDivElement | null>(null);
  const [bodyH, setBodyH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!bodyEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setBodyH(Math.round(entry.borderBoxSize[0]?.blockSize ?? 0));
    });
    ro.observe(bodyEl);
    return () => ro.disconnect();
  }, [bodyEl]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const navigating = React.useRef(false);
  const runToken = React.useRef(0);
  const mounted = React.useRef(false);
  const absorbedIds = React.useRef(new Set<string>());
  const latestPick = React.useRef<string[]>([]);
  const layerY = useMotionValue(0);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!rootEl || typeof ResizeObserver === "undefined") return;
    // The palette's own width: the fan is laid out from its right edge.
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.borderBoxSize[0]?.inlineSize ?? 0));
    });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);

  const byId = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const pickedItems = React.useMemo(
    () =>
      picked
        .map((id) => byId.get(id))
        .filter((item): item is BatchItem => Boolean(item)),
    [picked, byId],
  );
  const pickedSet = new Set(picked);
  React.useEffect(() => {
    latestPick.current = picked;
  });

  /* ------------------------------ the two lists ----------------------------- */

  const sections = React.useMemo(() => {
    if (status !== "ready") return [];
    const found = items.filter((item) =>
      matches(
        [item.key, item.title, ...(item.keywords ?? [])].join(" "),
        itemQuery,
      ),
    );
    return (["open", "progress", "closed"] as BatchItemStatus[])
      .map((s) => ({
        id: s,
        label: STATUS_LABEL[s],
        rows: found.filter((item) => item.status === s),
      }))
      .filter((section) => section.rows.length);
  }, [items, itemQuery, status]);
  const itemRows = sections.flatMap((section) => section.rows);

  const actionRows = React.useMemo(
    () =>
      actions.filter((action) =>
        matches(
          [action.label, ...(action.keywords ?? [])].join(" "),
          actionQuery,
        ),
      ),
    [actions, actionQuery],
  );
  const verdicts = React.useMemo(
    () =>
      new Map(
        actionRows.map((action) => [
          action.id,
          judge(action, pickedItems, itemNoun),
        ]),
      ),
    [actionRows, pickedItems, itemNoun],
  );

  const inActions = shownPhase === "actions";
  const rows = inActions ? actionRows.length : itemRows.length;
  const activeIndex = clamp(
    inActions ? actionActive : itemActive,
    0,
    Math.max(0, rows - 1),
  );
  const activeItem = inActions ? undefined : itemRows[activeIndex];
  const activeAction = inActions ? actionRows[activeIndex] : undefined;
  const activeVerdict = activeAction
    ? verdicts.get(activeAction.id)
    : undefined;

  const itemTops: number[] = [];
  {
    let y = LIST_PAD;
    for (const section of sections) {
      y += HEADER_H;
      for (let i = 0; i < section.rows.length; i += 1) {
        itemTops.push(y);
        y += ROW_H;
      }
    }
  }
  const actionTop = (index: number) => LIST_PAD + HEADER_H + index * ACTION_H;
  const pillTop = inActions
    ? actionTop(activeIndex)
    : (itemTops[activeIndex] ?? LIST_PAD + HEADER_H);
  const pillH = inActions ? ACTION_H : ROW_H;

  /* --------------------------------- geometry -------------------------------- */

  const find = React.useCallback(
    (attr: string, id: string) => findIn(rootRef.current, attr, id),
    [],
  );
  const rel = React.useCallback(
    (el: Element | null | undefined) => relTo(rootRef.current, el),
    [],
  );

  /** Where the list's content starts, in the palette's box: the fan layer's origin. */
  const contentTop = React.useCallback(() => {
    const list = listRef.current;
    const root = rootRef.current;
    if (!list || !root) return 0;
    return r2(
      list.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        list.scrollTop,
    );
  }, []);

  // The fan layer follows the list's scroll without a render.
  React.useLayoutEffect(() => {
    layerY.jump(contentTop());
  });

  // Read fresh from the layout rather than from the layer's value: a child's
  // effect runs before the parent has moved the layer.
  const trayPoint = React.useCallback(
    (id: string): Point | null => {
      const p = rel(find("data-bp-chip", id));
      return p ? { x: p.x, y: r2(p.y - contentTop()) } : null;
    },
    [rel, find, contentTop],
  );

  const measureKey = React.useCallback(
    (id: string): Point | null => rel(find("data-bp-key", id)),
    [rel, find],
  );

  const measureSlot = React.useCallback(
    (id: string): Point | null => {
      const tray = trayRef.current;
      if (tray) tray.scrollLeft = tray.scrollWidth;
      return rel(find("data-bp-chip", id));
    },
    [rel, find],
  );

  const absorbed = React.useCallback(
    (id: string) => absorbedIds.current.has(id),
    [],
  );

  /* --------------------------------- changes -------------------------------- */

  const commitSelection = (next: string[]) => {
    if (selection === undefined) setOwnSelection(next);
    onSelectionChange?.(next);
  };

  const setPhase = (next: BatchPhase) => {
    if (next === shownPhase) return;
    if (phase === undefined) setOwnPhase(next);
    onPhaseChange?.(next);
    navigating.current = false;
    // Only the run that just settled decides which chips sink into the row.
    if (next === "actions") absorbedIds.current.clear();
    if (listRef.current) listRef.current.scrollTop = 0;
    setSaid(
      next === "actions"
        ? `Actions for ${counted(picked.length, itemNoun)}.`
        : `Back to ${itemNoun[1]}.`,
    );
  };

  const toggle = (item: BatchItem) => {
    if (pickedSet.has(item.id)) {
      commitSelection(picked.filter((id) => id !== item.id));
      setFailed((map) => {
        if (!map.has(item.id)) return map;
        const next = new Map(map);
        next.delete(item.id);
        return next;
      });
      setSaid(
        `Removed ${item.key}. ${counted(picked.length - 1, itemNoun)} picked.`,
      );
      return;
    }
    commitSelection([...picked, item.id]);
    if (motionSafe) {
      setGhosts((list) => [
        ...list.filter((g) => g.id !== item.id),
        { id: item.id, n: (list[list.length - 1]?.n ?? 0) + 1 },
      ]);
    }
    setSaid(
      `Added ${item.key}. ${counted(picked.length + 1, itemNoun)} picked.`,
    );
  };

  const removeLast = () => {
    const last = pickedItems[pickedItems.length - 1];
    if (last) toggle(last);
  };

  const clearAll = () => {
    if (!picked.length) return;
    absorbedIds.current.clear();
    commitSelection([]);
    setFailed(new Map());
    setResult(null);
    onClearSelection?.();
    setSaid("Cleared the pick.");
  };

  const land = React.useCallback((id: string) => {
    setGhosts((list) => list.filter((g) => g.id !== id));
  }, []);

  const run = (action: BatchAction) => {
    if (running) return;
    const verdict = judge(action, pickedItems, itemNoun);
    if (verdict.reason) {
      setSaid(`${action.label} is unavailable: ${verdict.reason}.`);
      return;
    }
    const token = ++runToken.current;
    setRunning(action.id);
    setSaid(
      `${action.label}: running on ${counted(verdict.supported.length, itemNoun)}.`,
    );
    const settle = (outcome: void | BatchRunResult) => {
      if (!mounted.current || token !== runToken.current) return;
      const failures = outcome?.failed ?? [];
      const failedIds = new Set(failures.map((f) => f.id));
      const doneIds = verdict.supported
        .map((item) => item.id)
        .filter((id) => !failedIds.has(id));
      const skipped = verdict.unsupported.size;
      absorbedIds.current = new Set(doneIds);
      setRunning(null);
      setFailed(new Map(failures.map((f) => [f.id, f.reason])));
      // The pick may have changed while the run was out: keep what is
      // picked now, less what went through.
      const done = new Set(doneIds);
      const keep = latestPick.current.filter(
        (id) =>
          failedIds.has(id) ||
          (!done.has(id) &&
            !verdict.unsupported.has(id) &&
            !verdict.supported.some((item) => item.id === id)),
      );
      commitSelection(keep);
      const past = doneIds.length
        ? (action.past ?? `${action.label}: {n}`).replace(
            "{n}",
            counted(doneIds.length, itemNoun),
          )
        : `${action.label} failed`;
      const firstFail = failures[0];
      const failText = firstFail
        ? ` · ${failures.length} failed: ${byId.get(firstFail.id)?.key ?? firstFail.id} ${firstFail.reason}`
        : "";
      const skipText = skipped ? ` · skipped ${skipped}` : "";
      const text = `${past}${skipText}${failText}`;
      setResult({ text, failed: failures.length, actionId: action.id });
      setSaid(`${text}.`);
      setPhase("items");
    };
    let outcome: ReturnType<NonNullable<typeof onRunAction>>;
    try {
      outcome = onRunAction?.(action, verdict.supported);
    } catch {
      outcome = {
        failed: verdict.supported.map((item) => ({
          id: item.id,
          reason: "could not be reached",
        })),
      };
    }
    if (outcome && typeof (outcome as Promise<unknown>).then === "function") {
      (outcome as Promise<void | BatchRunResult>).then(settle, () =>
        settle({
          failed: verdict.supported.map((item) => ({
            id: item.id,
            reason: "could not be reached",
          })),
        }),
      );
    } else {
      settle(outcome as void | BatchRunResult);
    }
  };

  const retryFailed = () => {
    const action = actions.find((a) => a.id === result?.actionId);
    if (!action) return;
    run(action);
  };

  /* -------------------------------- keyboard -------------------------------- */

  const reveal = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const top = inActions ? actionTop(index) : (itemTops[index] ?? 0);
    const h = inActions ? ACTION_H : ROW_H;
    if (top - HEADER_H < list.scrollTop)
      list.scrollTop = Math.max(0, top - HEADER_H - LIST_PAD);
    else if (top + h + LIST_PAD > list.scrollTop + list.clientHeight)
      list.scrollTop = top + h + LIST_PAD - list.clientHeight;
  };

  const move = (next: number) => {
    if (!rows) return;
    const to = clamp(next, 0, rows - 1);
    if (inActions) setActionActive(to);
    else setItemActive(to);
    reveal(to);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "PageDown":
      case "PageUp": {
        event.preventDefault();
        navigating.current = true;
        const step =
          event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowUp"
              ? -1
              : event.key === "PageDown"
                ? 5
                : -5;
        move(activeIndex + step);
        break;
      }
      case " ":
        if (inActions || !activeItem) return;
        if (field.value.trim() === "" || navigating.current) {
          event.preventDefault();
          toggle(activeItem);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (inActions) {
          if (activeAction) run(activeAction);
        } else if (activeItem) toggle(activeItem);
        break;
      case "Tab":
        // Tab only ever switches toward the other list, so focus can always
        // leave the field in the direction it is not switching.
        if (!event.shiftKey && !inActions) {
          event.preventDefault();
          setPhase("actions");
        } else if (event.shiftKey && inActions) {
          event.preventDefault();
          setPhase("items");
        }
        break;
      case "Backspace":
        if (field.value === "" && picked.length) {
          event.preventDefault();
          removeLast();
        }
        break;
      case "Escape":
        if (field.value) {
          event.preventDefault();
          if (inActions) setActionQuery("");
          else setItemQuery("");
        } else if (inActions) {
          event.preventDefault();
          setPhase("items");
        } else if (onDismiss) {
          event.preventDefault();
          onDismiss();
        }
        break;
      default:
        break;
    }
  };

  /* --------------------------------- the fan -------------------------------- */

  const fanned = pickedItems.slice(0, Math.max(1, maxFan));
  const extra = pickedItems.length - fanned.length;
  // Laid out from the palette's measured width, never read from the DOM in
  // render: the hand hangs from a pivot below the row, right-aligned.
  const fanTargets = (() => {
    if (!width || !inActions || !activeAction || !fanned.length) return null;
    const chipW = narrow ? 46 : 74;
    const right = width - 14;
    const n = fanned.length;
    const mid = (n - 1) / 2;
    const spread = clamp(narrow ? fanSpread * 0.7 : fanSpread, 0, 30);
    const pivot = 120;
    const reach = pivot * Math.sin((mid * spread * Math.PI) / 180);
    // Each later chip shows its digits from under the one before it, and the
    // whole hand keeps to the right of the action's name.
    const budget = width * (narrow ? 0.46 : 0.6);
    const step =
      n > 1
        ? clamp((budget - chipW - 2 * reach) / (n - 1), 12, narrow ? 24 : 38)
        : 0;
    const cx = right - chipW / 2 - mid * step - reach;
    const cy = actionTop(activeIndex) + ACTION_H / 2 - 13;
    return fanned.map((_, i) => {
      const k = i - mid;
      const theta = (k * spread * Math.PI) / 180;
      return {
        x: r2(cx + pivot * Math.sin(theta) + k * step - chipW / 2),
        y: r2(cy + pivot * (1 - Math.cos(theta))),
        rotate: r2(k * spread),
      };
    });
  })();

  /* --------------------------------- render -------------------------------- */

  const optionId = (key: string) => `${uid}-opt-${key}`;
  const activeDescendant =
    status !== "ready"
      ? undefined
      : inActions
        ? activeAction
          ? optionId(`a-${activeAction.id}`)
          : undefined
        : activeItem
          ? optionId(`i-${activeItem.id}`)
          : undefined;
  const fieldName = inActions
    ? `Choose an action for ${counted(picked.length, itemNoun)}`
    : `Find ${itemNoun[1]}`;
  const landing = new Set(ghosts.map((g) => g.id));

  return (
    <div
      className={cn("@container w-full", className)}
      style={
        {
          "--bp-accent": ACCENTS[accent as BatchAccent] ?? accent,
        } as React.CSSProperties
      }
    >
      <div
        ref={bindRoot}
        role="group"
        aria-label={label}
        className="relative mx-auto flex w-full max-w-[38rem] flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_50px_color-mix(in_oklab,black_22%,transparent)]"
      >
        {/* The tray: what the action will be given. */}
        <div
          className="flex shrink-0 items-center gap-2 border-b border-hairline pr-2 pl-3"
          style={{ height: TRAY_H }}
        >
          <div
            ref={trayRef}
            className="relative flex-1 [scrollbar-width:none] overflow-x-auto overflow-y-hidden overscroll-x-contain"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 10px, black calc(100% - 14px), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 10px, black calc(100% - 14px), transparent)",
            }}
          >
            <div
              className={cn(
                "relative flex w-max items-center gap-1.5 px-2.5 py-2 transition-opacity duration-200",
                inActions && "opacity-35",
              )}
            >
              {pickedItems.length === 0 ? (
                <span className="text-xs whitespace-nowrap text-ink-3">
                  {`Nothing picked yet · Space adds the highlighted ${itemNoun[0]}`}
                </span>
              ) : null}
              <AnimatePresence initial={false} mode="popLayout">
                {pickedItems.map((item) => (
                  <motion.span
                    key={item.id}
                    data-bp-chip={item.id}
                    layout={motionSafe ? "position" : false}
                    className="inline-flex"
                    // Hidden while its copy is still in the air; it shows the
                    // moment the copy lands in its place.
                    initial={{
                      opacity: !motionSafe || landing.has(item.id) ? 0 : 1,
                      scale: 1,
                    }}
                    animate={{
                      opacity: landing.has(item.id) ? 0 : 1,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.85 : 1,
                      transition: exitFor(durations.fast),
                    }}
                    transition={{
                      layout: springs.glide,
                      opacity: {
                        duration: landing.has(item.id) ? 0 : durations.fast,
                      },
                    }}
                  >
                    <ChipFace
                      item={item}
                      chipStyle={chipStyle}
                      failed={failed.has(item.id)}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={`Remove ${item.key}`}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => toggle(item)}
                        className="-mr-1 grid size-4 place-items-center rounded-full text-current opacity-60 transition-opacity hover:opacity-100"
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    </ChipFace>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
          {picked.length ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {picked.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            aria-disabled={!picked.length || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
              FOCUS,
            )}
          >
            Clear
          </button>
        </div>

        {/* The field, with the two lists it switches between. */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
          {inActions ? (
            <Zap
              aria-hidden
              className="size-4 shrink-0 text-[var(--bp-accent)]"
            />
          ) : (
            <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-label={fieldName}
            aria-describedby={hintId}
            placeholder={inActions ? "Choose an action…" : placeholder}
            value={inActions ? actionQuery : itemQuery}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              const value = event.currentTarget.value;
              navigating.current = false;
              if (inActions) {
                setActionQuery(value);
                setActionActive(0);
              } else {
                setItemQuery(value);
                setItemActive(0);
              }
            }}
            onKeyDown={onKeyDown}
            className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/25 focus-visible:outline-solid"
          />
          <div className="flex shrink-0 items-center rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] p-0.5">
            {(["items", "actions"] as BatchPhase[]).map((p) => {
              const on = shownPhase === p;
              const Icon = p === "items" ? Ticket : Zap;
              return (
                <button
                  key={p}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={on}
                  aria-label={
                    p === "items"
                      ? `Pick ${itemNoun[1]}`
                      : `Actions for ${counted(picked.length, itemNoun)}`
                  }
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setPhase(p)}
                  className={cn(
                    "relative inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-xs transition-colors",
                    on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-phase`}
                      aria-hidden
                      className="absolute inset-0 rounded-[6px] bg-popover shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <Icon aria-hidden className="relative size-3.5 shrink-0" />
                  <span className="relative hidden @min-[34rem]:inline">
                    {p === "items" ? "Pick" : "Act"}
                  </span>
                  {p === "actions" && picked.length ? (
                    <span className="relative font-mono text-[10px] text-[var(--bp-accent)] tabular-nums">
                      {picked.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <p id={hintId} className="sr-only">
          {inActions
            ? "Up and Down choose an action, Enter runs it, Shift Tab goes back to picking."
            : "Up and Down move, Space or Enter picks, Tab moves to the actions, Backspace removes the last pick."}
        </p>

        <AnimatePresence initial={false}>
          {result && !inActions ? (
            <motion.div
              key="result"
              className="overflow-hidden border-b border-hairline"
              initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {result.failed ? (
                    <CircleAlert
                      aria-hidden
                      className="size-4 shrink-0 text-danger"
                    />
                  ) : (
                    <CircleCheck
                      aria-hidden
                      className="size-4 shrink-0 text-success"
                    />
                  )}
                  <span className="text-ink-2">{result.text}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {result.failed ? (
                    <button
                      type="button"
                      onClick={retryFailed}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-xs text-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                        FOCUS,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      {`Retry ${result.failed}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 px-2 text-xs text-ink-3 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          ref={listRef}
          tabIndex={-1}
          onScroll={() => layerY.set(contentTop())}
          className="relative overflow-x-hidden overflow-y-auto overscroll-contain outline-none"
          style={{ maxHeight: LIST_H }}
          // Measured, never reserved: the body is as tall as what it holds, up
          // to its cap, and glides between heights as results come and go.
          initial={false}
          animate={{
            height: bodyH === null ? "auto" : Math.min(LIST_H, bodyH),
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div ref={setBodyEl}>
            <div
              id={listId}
              role="listbox"
              aria-label={fieldName}
              aria-multiselectable={inActions ? undefined : true}
              aria-busy={status === "loading" || undefined}
              className="relative"
              style={{ paddingTop: LIST_PAD, paddingBottom: LIST_PAD }}
            >
              {status === "ready" && rows ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1.5 top-0 rounded-2 bg-[color-mix(in_oklab,var(--bp-accent)_12%,transparent)]"
                  initial={false}
                  animate={{ y: pillTop, height: pillH }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}

              {status === "loading" ? (
                <div aria-hidden className="flex flex-col px-3">
                  {[64, 48, 72, 40, 56].map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3"
                      style={{ height: ROW_H }}
                    >
                      <span className="size-4 shrink-0 rounded-1 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]" />
                      <span className="h-2.5 w-14 shrink-0 rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]" />
                      <span
                        className={cn(
                          "h-2.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                          motionSafe && "animate-pulse",
                        )}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : status === "ready" && !inActions ? (
                sections.length ? (
                  sections.map((section) => {
                    const headId = `${uid}-h-${section.id}`;
                    return (
                      <div
                        key={section.id}
                        role="group"
                        aria-labelledby={headId}
                      >
                        <p
                          id={headId}
                          className="flex items-end px-3 pb-1.5 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                          style={{ height: HEADER_H }}
                        >
                          {section.label}
                        </p>
                        {section.rows.map((item) => {
                          const index = itemRows.indexOf(item);
                          const on = pickedSet.has(item.id);
                          return (
                            <div
                              key={item.id}
                              id={optionId(`i-${item.id}`)}
                              role="option"
                              aria-selected={on}
                              aria-label={`${item.key}, ${item.title}, ${STATUS_LABEL[item.status]}${item.priority ? `, ${item.priority} priority` : ""}${failed.has(item.id) ? `, failed: ${failed.get(item.id)}` : ""}`}
                              onPointerDown={(event) => event.preventDefault()}
                              onPointerMove={() => {
                                if (index !== activeIndex) setItemActive(index);
                              }}
                              onClick={() => {
                                inputRef.current?.focus();
                                setItemActive(index);
                                toggle(item);
                              }}
                              className="relative flex cursor-pointer items-center gap-2.5 px-3 select-none"
                              style={{ height: ROW_H }}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
                                  on
                                    ? "border-transparent bg-[var(--bp-accent)] text-background"
                                    : "border-hairline-strong",
                                )}
                              >
                                {on ? (
                                  <motion.svg
                                    viewBox="0 0 12 12"
                                    className="size-3"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <motion.path
                                      d="M2.5 6.2 5 8.5 9.5 3.5"
                                      initial={
                                        motionSafe ? { pathLength: 0 } : false
                                      }
                                      animate={{ pathLength: 1 }}
                                      transition={
                                        motionSafe
                                          ? springs.flick
                                          : { duration: 0 }
                                      }
                                    />
                                  </motion.svg>
                                ) : null}
                              </span>
                              <span
                                data-bp-key={item.id}
                                className={cn(
                                  "w-[4.25rem] shrink-0 font-mono text-[11px] tabular-nums transition-opacity",
                                  failed.has(item.id)
                                    ? "text-danger"
                                    : "text-ink-3",
                                  landing.has(item.id) && "opacity-30",
                                )}
                              >
                                {item.key}
                              </span>
                              <span
                                title={item.title}
                                className={cn(
                                  "min-w-0 flex-1 truncate text-[13px]",
                                  index === activeIndex
                                    ? "text-foreground"
                                    : "text-ink-2",
                                )}
                              >
                                {item.title}
                              </span>
                              {item.priority ? (
                                <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-ink-3 capitalize @min-[34rem]:inline-flex">
                                  <span
                                    aria-hidden
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      PRIORITY_DOT[item.priority],
                                    )}
                                  />
                                  {item.priority}
                                </span>
                              ) : null}
                              {item.updated !== undefined ? (
                                <span className="hidden w-8 shrink-0 text-right font-mono text-[10.5px] text-ink-3 tabular-nums @min-[34rem]:inline">
                                  {age(now, item.updated)}
                                </span>
                              ) : null}
                              <span
                                aria-hidden
                                className={cn(
                                  "grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold",
                                  item.assignee
                                    ? "bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] text-ink-2"
                                    : "border border-dashed border-hairline-strong",
                                )}
                              >
                                {item.assignee ?? ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-xs text-ink-3">
                    {`No ${itemNoun[1]} match “${itemQuery.trim()}”.`}
                  </p>
                )
              ) : status === "ready" ? (
                <div role="group" aria-labelledby={`${uid}-h-actions`}>
                  <p
                    id={`${uid}-h-actions`}
                    className="flex items-end px-3 pb-1.5 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                    style={{ height: HEADER_H }}
                  >
                    {picked.length
                      ? `Do this to ${counted(picked.length, itemNoun)}`
                      : "Actions"}
                  </p>
                  {actionRows.length ? (
                    actionRows.map((action, index) => {
                      const verdict = verdicts.get(action.id);
                      const Icon = ICONS[action.icon] ?? Zap;
                      const disabled = Boolean(verdict?.reason);
                      const busy = running === action.id;
                      const skips = verdict?.unsupported.size ?? 0;
                      const meta = verdict?.reason
                        ? verdict.reason
                        : `${counted(verdict?.supported.length ?? 0, itemNoun)}${skips ? ` · skips ${skips}` : ""}`;
                      return (
                        <div
                          key={action.id}
                          id={optionId(`a-${action.id}`)}
                          role="option"
                          aria-selected={index === activeIndex}
                          aria-disabled={disabled || undefined}
                          aria-busy={busy || undefined}
                          aria-label={`${action.label}, ${meta}`}
                          onPointerDown={(event) => event.preventDefault()}
                          onPointerMove={() => {
                            if (index !== activeIndex) setActionActive(index);
                          }}
                          onClick={() => {
                            inputRef.current?.focus();
                            setActionActive(index);
                            run(action);
                          }}
                          className={cn(
                            "relative flex cursor-pointer items-center gap-2.5 px-3 select-none",
                            disabled && "cursor-default",
                          )}
                          style={{ height: ACTION_H }}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                              action.tone === "danger"
                                ? "text-danger"
                                : "text-ink-2",
                              disabled && "opacity-50",
                            )}
                          >
                            {busy ? (
                              <LoaderCircle
                                className={cn(
                                  "size-3.5",
                                  motionSafe && "animate-spin",
                                )}
                              />
                            ) : (
                              <Icon className="size-3.5" />
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              className={cn(
                                "truncate text-[13px] leading-tight",
                                action.tone === "danger"
                                  ? "text-danger"
                                  : index === activeIndex
                                    ? "text-foreground"
                                    : "text-ink-2",
                                disabled && "opacity-55",
                              )}
                            >
                              {action.label}
                            </span>
                            <span
                              className={cn(
                                "truncate text-[11px] leading-tight",
                                disabled
                                  ? "text-ink-3"
                                  : skips
                                    ? "text-warn"
                                    : "text-ink-3",
                              )}
                            >
                              {busy
                                ? `Running on ${counted(verdict?.supported.length ?? 0, itemNoun)}…`
                                : meta}
                            </span>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="px-3 py-4 text-xs text-ink-3">
                      {`No action matches “${actionQuery.trim()}”.`}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            {status === "error" ? (
              <div className="flex flex-col items-start gap-3 p-4">
                <p className="text-[13px] text-foreground">{`The ${itemNoun[1]} didn’t load.`}</p>
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3 py-2 text-[11px] text-ink-3">
          {inActions ? (
            <>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft aria-hidden className="size-3" />
                run
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono text-[10px]">⇧ ⇥</kbd>
                back
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono text-[10px]">␣</kbd>
                pick
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono text-[10px]">⇥</kbd>
                actions
              </span>
              <span className="hidden items-center gap-1 @min-[34rem]:inline-flex">
                <kbd className="font-mono text-[10px]">⌫</kbd>
                drop last
              </span>
            </>
          )}
          <span className="ml-auto font-mono text-[10px] tabular-nums">
            {status === "ready"
              ? inActions
                ? `${actionRows.length} actions`
                : `${itemRows.length} ${itemRows.length === 1 ? itemNoun[0] : itemNoun[1]}`
              : status === "loading"
                ? "loading"
                : "offline"}
          </span>
        </div>

        {/* Flights and the fan ride above everything, clipped by the palette. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          {ghosts.map((ghost) => {
            const item = byId.get(ghost.id);
            return item ? (
              <Ghost
                key={`${ghost.id}-${ghost.n}`}
                item={item}
                chipStyle={chipStyle}
                measureFrom={measureKey}
                measure={measureSlot}
                onLand={land}
              />
            ) : null;
          })}
          <motion.div className="absolute top-0 left-0" style={{ y: layerY }}>
            <AnimatePresence>
              {fanTargets && activeVerdict
                ? fanned.map((item, i) => {
                    const target = fanTargets[i];
                    if (!target) return null;
                    return (
                      <FanChip
                        key={item.id}
                        item={item}
                        chipStyle={chipStyle}
                        layer={fanned.length - i}
                        target={target}
                        delay={i * cascade(fanned.length)}
                        struck={
                          activeVerdict.unsupported.has(item.id) ||
                          activeVerdict.over.has(item.id)
                        }
                        failed={failed.has(item.id)}
                        running={running !== null}
                        small={narrow}
                        motionSafe={motionSafe}
                        trayPoint={trayPoint}
                        absorbed={absorbed}
                      />
                    );
                  })
                : null}
            </AnimatePresence>
            {fanTargets && extra > 0 && fanTargets.length ? (
              <span
                className="absolute top-0 left-0 inline-flex h-5 items-center rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] px-1.5 font-mono text-[10px] text-ink-2"
                style={{
                  // A count bubble on the last chip's corner, inside the palette.
                  transform: `translate(${r2((fanTargets[fanTargets.length - 1]?.x ?? 0) + (narrow ? 46 : 74) - 28)}px, ${r2((fanTargets[fanTargets.length - 1]?.y ?? 0) - 12)}px)`,
                  zIndex: 50,
                }}
              >
                {`+${extra}`}
              </span>
            ) : null}
          </motion.div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
