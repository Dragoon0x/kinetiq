"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
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

/** One block on a day. Times are minutes from midnight; `day` is an ISO date. */
export type OpenDayEvent = {
  id: string;
  title: string;
  /** The day it sits on, "YYYY-MM-DD". */
  day: string;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  /** The suggestion it was laid in from, when it was one. */
  suggestionId?: string;
};

/** A block the open day offers; it is laid in at these times. */
export type OpenDaySuggestion = {
  id: string;
  title: string;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  /** A short reason, read under the title where there is room. */
  note?: string;
};

export type OpenDayChange = {
  type: "add" | "remove";
  event: OpenDayEvent;
  /** How it was added: from a suggestion, drawn with the pointer, or keyed in. */
  source: "suggestion" | "draw" | "keyboard" | "delete";
};

export type OpenDaySpan = "work" | "day" | "full";
export type OpenDayWash = "sun" | "plain" | "ink";
export type OpenDayDensity = "compact" | "cozy" | "roomy";
export type OpenDayStatus = "ready" | "loading" | "error";

export type OpenDayProps = {
  /** Controlled day shown, "YYYY-MM-DD". */
  date?: string;
  /** Initial day when uncontrolled. @default defaultOpenDayDate */
  defaultDate?: string;
  /** Fires from the stepper with the day it moved to. */
  onDateChange?: (date: string) => void;
  /** Controlled blocks, every day's; the view keeps the shown day's. */
  events?: OpenDayEvent[];
  /** Initial blocks when uncontrolled. @default [] */
  defaultEvents?: OpenDayEvent[];
  /** Fires with every block after one was laid in, drawn or removed. */
  onChange?: (events: OpenDayEvent[], change: OpenDayChange) => void;
  /** The blocks offered while the day is open. @default defaultOpenDaySuggestions */
  suggestions?: OpenDaySuggestion[];
  /** The hours drawn: the working day (8 to 18), the waking day (6 to 22) or all 24. @default "work" */
  span?: OpenDaySpan;
  /** First hour drawn; overrides `span`. */
  startHour?: number;
  /** Hour the column ends on, exclusive; overrides `span`. */
  endHour?: number;
  /** Today, "YYYY-MM-DD": where the Today button goes and the only day with a now-line. @default defaultOpenDayDate */
  today?: string;
  /** The now-line, in minutes from midnight on `today`. Never read from the clock. @default 580 */
  now?: number;
  /** The wash behind an open column: sunrise to dusk, a plain tint, or ink. @default "sun" */
  wash?: OpenDayWash;
  /** Height of a half hour: compact rows, cozy ones, or roomy ones. @default "cozy" */
  density?: OpenDayDensity;
  /** Whether the day has arrived. @default "ready" */
  status?: OpenDayStatus;
  /** Retry was pressed after a failed load. */
  onRetry?: () => void;
  /** The calendar's name, over the date. @default "Basinworks" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the hours scroll inside it. @default 560 */
  height?: number;
  /** Read only: nothing can be laid in, drawn or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Tuesday 13 October 2026. */
export const defaultOpenDayDate = "2026-10-13";

/** 09:40, as minutes from midnight. */
export const defaultOpenDayNow = 9 * 60 + 40;

export const defaultOpenDaySuggestions: OpenDaySuggestion[] = [
  {
    id: "focus",
    title: "Focus time",
    start: 9 * 60,
    end: 11 * 60,
    note: "Two quiet hours before lunch",
  },
  {
    id: "walk",
    title: "Lunch walk",
    start: 12 * 60 + 30,
    end: 13 * 60,
    note: "Half an hour outside",
  },
  {
    id: "plan",
    title: "Plan tomorrow",
    start: 16 * 60 + 30,
    end: 17 * 60,
    note: "Set up the morning",
  },
];

export const defaultOpenDayEvents: OpenDayEvent[] = [];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const SPANS: Record<OpenDaySpan, [number, number]> = {
  work: [8, 18],
  day: [6, 22],
  full: [0, 24],
};

/** Height of one half-hour cell. */
const CELL_H: Record<OpenDayDensity, number> = {
  compact: 20,
  cozy: 26,
  roomy: 34,
};

/** Blocks land on the half hour: the unit a calendar actually books in. */
const STEP = 30;
/** Travel before a press is a drag rather than a tap. */
const DRAG_SLOP = 4;
/** One breath of the wash: in on drift, out on drift. */
const BREATH_MS = 2800;
const GLIDE_MS = 480;
const DAY_MS = 86_400_000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Days are UTC dates, so the same string renders the same on both ends. */
const parseDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y || 2026, (m || 1) - 1, d || 1);
};

const formatDay = (ms: number): string => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};

const shiftDay = (iso: string, days: number) =>
  formatDay(parseDay(iso) + days * DAY_MS);

const describeDay = (iso: string) => {
  const t = new Date(parseDay(iso));
  return {
    weekday: WEEKDAYS[t.getUTCDay()] ?? "Day",
    day: t.getUTCDate(),
    month: MONTHS[t.getUTCMonth()] ?? "",
  };
};

/** Fixed 24-hour clock: a locale lookup during render would not survive hydration. */
const clock = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60) % 24;
  return `${pad2(h)}:${pad2(total % 60)}`;
};

const hoursWord = (minutes: number): string => {
  const h = minutes / 60;
  const text = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${text} ${h === 1 ? "hour" : "hours"}`;
};

type Interval = { start: number; end: number };

/** How much of the span is free, and its longest free stretch. */
const coverage = (list: Interval[], s: number, e: number) => {
  const sorted = list
    .map((x) => ({ start: Math.max(s, x.start), end: Math.min(e, x.end) }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);
  let covered = 0;
  let gap: [number, number] = [s, s];
  let cursor = s;
  for (const x of sorted) {
    if (x.start - cursor > gap[1] - gap[0]) gap = [cursor, x.start];
    if (x.end > cursor) {
      covered += x.end - Math.max(x.start, cursor);
      cursor = x.end;
    }
  }
  if (e - cursor > gap[1] - gap[0]) gap = [cursor, e];
  return { open: e - s - covered, gap };
};

type Slot = { col: number; cols: number };

/** Packs overlapping blocks into the fewest columns, cluster by cluster. */
const packColumns = (list: OpenDayEvent[]): Map<string, Slot> => {
  const slots = new Map<string, Slot>();
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: string[] = [];
  let ends: number[] = [];
  const close = () => {
    for (const id of cluster) {
      const slot = slots.get(id);
      if (slot) slot.cols = ends.length;
    }
    cluster = [];
    ends = [];
  };
  for (const event of sorted) {
    if (ends.length > 0 && event.start >= Math.max(...ends)) close();
    let col = ends.findIndex((end) => end <= event.start);
    if (col === -1) {
      col = ends.length;
      ends.push(event.end);
    } else {
      ends[col] = event.end;
    }
    slots.set(event.id, { col, cols: 1 });
    cluster.push(event.id);
  }
  close();
  return slots;
};

const noopSubscribe = () => () => {};

/** Capture throws on a synthetic pointer id; the drag works without it. */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No live pointer to capture.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

/**
 * The wash is pigment on a surface, so it is mixed from the tokens: amber
 * at the top of the column for the morning, almost nothing at noon, cobalt
 * at the bottom for dusk. Plain and ink are the same shape in one colour.
 */
const WASHES: Record<
  OpenDayWash,
  { top: string; mid: string; bottom: string }
> = {
  sun: {
    top: "color-mix(in oklab, var(--warn) 34%, transparent)",
    mid: "color-mix(in oklab, var(--warn) 6%, transparent)",
    bottom: "color-mix(in oklab, var(--accent) 26%, transparent)",
  },
  plain: {
    top: "color-mix(in oklab, var(--ink) 7%, transparent)",
    mid: "color-mix(in oklab, var(--ink) 2%, transparent)",
    bottom: "color-mix(in oklab, var(--ink) 7%, transparent)",
  },
  ink: {
    top: "color-mix(in oklab, var(--ink) 18%, transparent)",
    mid: "color-mix(in oklab, var(--ink) 3%, transparent)",
    bottom: "color-mix(in oklab, var(--ink) 18%, transparent)",
  },
};

type Draft = {
  id: string;
  start: number;
  end: number;
  /** Drawing stretches with the pointer or the arrows; naming holds the input. */
  mode: "drawing" | "naming";
  via: "pointer" | "keyboard";
};

/* ----------------------------------------------------------------------- */
/*                                   Wash                                   */
/* ----------------------------------------------------------------------- */

function Wash({
  wash,
  gridH,
  phase,
  shown,
  motionSafe,
}: {
  wash: OpenDayWash;
  gridH: number;
  phase: number;
  shown: boolean;
  motionSafe: boolean;
}) {
  const paint = WASHES[wash];
  const lift = motionSafe && shown && phase === 1;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{
        height: gridH * 1.3,
        background: `linear-gradient(to bottom, ${paint.top} 0%, ${paint.mid} 52%, ${paint.bottom} 100%)`,
      }}
      initial={false}
      animate={{
        opacity: shown ? (phase === 1 ? 0.72 : 1) : 0,
        y: lift ? -Math.round(gridH * 0.2) : 0,
      }}
      transition={
        motionSafe
          ? { ...springs.drift, opacity: { duration: durations.page } }
          : { duration: durations.base }
      }
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Ghost row                               */
/* ----------------------------------------------------------------------- */

function Ghost({
  suggestion,
  index,
  layoutKey,
  motionSafe,
  enter,
  disabled,
  onPress,
}: {
  suggestion: OpenDaySuggestion;
  index: number;
  layoutKey: string | undefined;
  motionSafe: boolean;
  enter: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <motion.button
      layoutId={layoutKey}
      layout={motionSafe ? true : false}
      type="button"
      aria-disabled={disabled || undefined}
      aria-label={`Add ${suggestion.title}, ${clock(suggestion.start)} to ${clock(suggestion.end)}`}
      onClick={onPress}
      initial={
        enter ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        y: motionSafe
          ? { ...springs.glide, delay: index * cascade(3) }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "flex h-9 w-full shrink-0 items-center gap-2 rounded-2 border border-dashed border-hairline-strong px-2.5 text-left transition-colors",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-cobalt-bright/60 hover:bg-cobalt-wash/60",
        FOCUS_RING,
      )}
    >
      <Plus aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
        {suggestion.title}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
        {clock(suggestion.start)}-{clock(suggestion.end)}
      </span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Block                                  */
/* ----------------------------------------------------------------------- */

type BlockProps = {
  event: OpenDayEvent;
  top: number;
  height: number;
  slot: Slot;
  layoutKey: string | undefined;
  motionSafe: boolean;
  /** Fades in when it mounts, for a block with no ghost to glide from. */
  enter: boolean;
  landed: boolean;
  selected: boolean;
  tabIndex: number;
  disabled: boolean;
  hintId: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onNav: (event: React.KeyboardEvent) => void;
  onSettled: () => void;
};

function Block({
  event,
  top,
  height,
  slot,
  layoutKey,
  motionSafe,
  enter,
  landed,
  selected,
  tabIndex,
  disabled,
  hintId,
  nodeRef,
  onFocus,
  onToggle,
  onRemove,
  onNav,
  onSettled,
}: BlockProps) {
  const short = height < 40;
  return (
    <motion.div
      layoutId={layoutKey}
      layout={motionSafe ? true : false}
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onLayoutAnimationComplete={onSettled}
      className="group pointer-events-auto absolute"
      style={{
        top,
        height,
        left: `${(slot.col / slot.cols) * 100}%`,
        width: `calc(${100 / slot.cols}% - 3px)`,
      }}
    >
      <div className="relative h-full">
        {/* The shell carries the colour and takes the landing: it remounts
            to recoil, so the button underneath keeps its focus. */}
        <motion.span
          key={landed ? "landed" : "still"}
          aria-hidden
          initial={landed && motionSafe ? { scale: 1.045 } : false}
          animate={{ scale: 1 }}
          transition={springs.recoil}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2 border border-l-2 border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] border-l-cobalt-bright bg-cobalt-wash transition-colors",
            selected &&
              "border-cobalt-bright bg-[color-mix(in_oklab,var(--accent-bright)_22%,var(--bg-1))]",
          )}
          style={{ transformOrigin: "50% 60%" }}
        />
        <button
          ref={nodeRef}
          type="button"
          tabIndex={tabIndex}
          aria-pressed={selected}
          aria-label={`${event.title}, ${clock(event.start)} to ${clock(event.end)}`}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          onFocus={onFocus}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              onRemove();
              return;
            }
            onNav(e);
          }}
          className={cn(
            "relative flex h-full w-full min-w-0 overflow-hidden rounded-2 text-left",
            short
              ? "flex-row items-center gap-1.5 px-1.5"
              : "flex-col justify-start gap-0 px-2 py-1",
            disabled ? "cursor-default" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-semibold text-cobalt-bright">
            {event.title}
          </span>
          <span className="shrink-0 font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
            {clock(event.start)}-{clock(event.end)}
          </span>
        </button>
        {!disabled ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove ${event.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={cn(
              "absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-1 bg-card/80 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100",
              selected && "opacity-100",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A calendar's day view with nothing on it, designed as a place to start
 * rather than a blank. The hour column is drawn with its now-line; while the
 * day is open a sunrise-to-dusk wash behind the hours breathes on
 * `springs.drift` — one slow lift every few seconds, stopped when the tab or
 * the card is out of sight — and the headline says the day is open above
 * three suggested blocks drawn as ghost cards.
 *
 * Pressing a suggestion lays it in: the ghost card glides out of the list
 * onto the column at its hour on `springs.glide` and settles with a small
 * `springs.recoil` scale as it lands, the rest of the list closing up on the
 * same spring while the headline re-counts the open hours. Dragging on empty
 * hours draws a block that stretches with the pointer in half hours, and the
 * release opens a one-line title whose Enter commits it. Removing a block
 * glides its ghost back into the list; removing the last one returns the
 * open state and the wash breathes again. The stepper slides the day in on
 * `springs.snap` from the side it came from.
 *
 * The hours are one grid of half-hour cells: Up and Down move, Page Up and
 * Page Down jump two hours, Enter starts a block at the cell, Up and Down
 * then stretch it, Enter opens its title, Enter again commits and Escape
 * cancels. Suggestions are buttons; blocks are focusable, Up and Down walk
 * between them and Delete removes one. Every change is announced with the
 * hours left open. Under reduced motion nothing travels or breathes: ghosts
 * fade out and blocks fade in at their hour, and the day cross-fades.
 */
export function OpenDay({
  date,
  defaultDate = defaultOpenDayDate,
  onDateChange,
  events,
  defaultEvents = defaultOpenDayEvents,
  onChange,
  suggestions = defaultOpenDaySuggestions,
  span = "work",
  startHour,
  endHour,
  today = defaultOpenDayDate,
  now = defaultOpenDayNow,
  wash = "sun",
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Basinworks",
  label,
  height = 560,
  disabled = false,
  className,
}: OpenDayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const gridHintId = `${uid}-grid-hint`;
  const blockHintId = `${uid}-block-hint`;

  const [ownDate, setOwnDate] = React.useState(defaultDate);
  const shownDate = date ?? ownDate;
  const [ownEvents, setOwnEvents] =
    React.useState<OpenDayEvent[]>(defaultEvents);
  const all = events ?? ownEvents;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [dir, setDir] = React.useState(0);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [activeCell, setActiveCell] = React.useState<number | null>(null);
  const [activeBlock, setActiveBlock] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState(0);
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    kind: "block" | "cell" | "input";
    key: string | number;
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so nothing already on the
  // page fades in; true for what mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const cellNodes = React.useRef(new Map<number, HTMLDivElement>());
  const blockNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const drawRef = React.useRef<{
    pointerId: number;
    anchor: number;
    startY: number;
  } | null>(null);
  const draftLive = React.useRef(false);
  const seq = React.useRef(0);
  const settleTimer = React.useRef<number | null>(null);
  /** The block whose glide is in flight; its landing is what recoils. */
  const pendingLand = React.useRef<string | null>(null);

  /* -------------------------------- shape ------------------------------ */

  const [spanStartHour, spanEndHour] = SPANS[span] ?? SPANS.work;
  const firstHour = clamp(Math.round(startHour ?? spanStartHour), 0, 23);
  const lastHour = clamp(Math.round(endHour ?? spanEndHour), firstHour + 1, 24);
  const dayStart = firstHour * 60;
  const dayEnd = lastHour * 60;
  const cellH = CELL_H[density] ?? CELL_H.cozy;
  const ppm = cellH / STEP;
  const cells = Math.round((dayEnd - dayStart) / STEP);
  const gridH = cells * cellH;
  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, i) => firstHour + i,
  );

  const dayEvents = all.filter((e) => e.day === shownDate);
  const placed = new Set(
    dayEvents.map((e) => e.suggestionId).filter((s): s is string => !!s),
  );
  const offered = suggestions.filter(
    (s) => !placed.has(s.id) && s.start >= dayStart && s.end <= dayEnd,
  );
  const slots = packColumns(dayEvents);
  const { open, gap } = coverage(dayEvents, dayStart, dayEnd);
  const isOpen = dayEvents.length === 0;
  const when = describeDay(shownDate);
  const isToday = shownDate === today;
  const nowShown = isToday && now >= dayStart && now <= dayEnd;

  const headline = isOpen
    ? `Your ${when.weekday} is open`
    : open === 0
      ? "No time open"
      : `${hoursWord(open)} open`;
  const subline = isOpen
    ? `Nothing booked ${clock(dayStart)} to ${clock(dayEnd)}`
    : open === 0
      ? "Every hour is booked"
      : `Longest gap ${clock(gap[0])} to ${clock(gap[1])}`;

  const snapCell = (minute: number) =>
    clamp(Math.floor(minute / STEP) * STEP, dayStart, dayEnd - STEP);
  const activeMin =
    activeCell !== null
      ? snapCell(activeCell)
      : nowShown
        ? snapCell(now)
        : dayStart;

  const sortedBlocks = [...dayEvents].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const activeBlockId =
    activeBlock && sortedBlocks.some((e) => e.id === activeBlock)
      ? activeBlock
      : (sortedBlocks[0]?.id ?? null);

  const busyAt = (minute: number) =>
    dayEvents.some((e) => e.start <= minute && e.end > minute);

  /* ------------------------------ breathing ---------------------------- */

  const breathing = isOpen && ready && motionSafe && onScreen && pageShown;

  React.useEffect(() => {
    if (!breathing) return;
    const id = window.setInterval(() => setPhase((p) => 1 - p), BREATH_MS);
    return () => window.clearInterval(id);
  }, [breathing]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    watcher.observe(root);
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(
    () => () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
    },
    [],
  );

  /* -------------------------------- focus ------------------------------ */

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.kind === "block"
        ? blockNodes.current.get(String(focusReq.key))
        : focusReq.kind === "cell"
          ? cellNodes.current.get(Number(focusReq.key))
          : inputRef.current;
    node?.focus({ preventScroll: focusReq.kind !== "block" });
  }, [focusReq]);

  const requestFocus = (
    kind: "block" | "cell" | "input",
    key: string | number,
  ) => setFocusReq((f) => ({ kind, key, seq: (f?.seq ?? 0) + 1 }));

  /* ------------------------------- changes ----------------------------- */

  const commitEvents = (next: OpenDayEvent[], change: OpenDayChange) => {
    if (events === undefined) setOwnEvents(next);
    onChange?.(next, change);
  };

  const openWords = (list: OpenDayEvent[]) => {
    const onDay = list.filter((e) => e.day === shownDate);
    if (onDay.length === 0) return `Your ${when.weekday} is open.`;
    const left = coverage(onDay, dayStart, dayEnd).open;
    return left === 0 ? "No time open." : `${hoursWord(left)} open.`;
  };

  /** Scrolls the column so a block about to land is in view, instantly. */
  const ensureVisible = (start: number, end: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = (start - dayStart) * ppm;
    const bottom = (end - dayStart) * ppm;
    const view = scroller.clientHeight;
    let st = scroller.scrollTop;
    if (top < st + 8) st = Math.max(0, top - 8);
    else if (bottom > st + view - 8) {
      st = Math.min(bottom - view + 8, Math.max(0, top - 8));
    }
    if (st !== scroller.scrollTop) scroller.scrollTop = st;
  };

  const settle = (id: string) => {
    if (pendingLand.current !== id) return;
    pendingLand.current = null;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setLanded(id);
  };

  const addEvent = (
    event: OpenDayEvent,
    source: OpenDayChange["source"],
    focusIt: boolean,
  ) => {
    if (inert) return;
    ensureVisible(event.start, event.end);
    const next = [...all, event];
    commitEvents(next, { type: "add", event, source });
    setSelected(null);
    if (source === "suggestion" && motionSafe) {
      // The recoil waits for the glide; if the layout callback never
      // comes (the ghost was off screen), the timer lands it anyway.
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
      pendingLand.current = event.id;
      settleTimer.current = window.setTimeout(() => settle(event.id), GLIDE_MS);
    } else {
      pendingLand.current = null;
      setLanded(event.id);
    }
    setAnnouncement(
      `${event.title} added, ${clock(event.start)} to ${clock(event.end)}. ${openWords(next)}`,
    );
    if (focusIt) {
      setActiveBlock(event.id);
      requestFocus("block", event.id);
    }
  };

  const removeEvent = (event: OpenDayEvent, moveFocus: boolean) => {
    if (inert) return;
    const next = all.filter((e) => e.id !== event.id);
    commitEvents(next, { type: "remove", event, source: "delete" });
    setSelected((s) => (s === event.id ? null : s));
    setLanded((l) => (l === event.id ? null : l));
    setAnnouncement(`${event.title} removed. ${openWords(next)}`);
    if (moveFocus) {
      const i = sortedBlocks.findIndex((e) => e.id === event.id);
      const neighbour = sortedBlocks[i + 1] ?? sortedBlocks[i - 1];
      if (neighbour) {
        setActiveBlock(neighbour.id);
        requestFocus("block", neighbour.id);
      } else {
        setActiveCell(snapCell(event.start));
        requestFocus("cell", snapCell(event.start));
      }
    }
  };

  const laySuggestion = (s: OpenDaySuggestion) => {
    if (inert) return;
    addEvent(
      {
        id: `${s.id}@${shownDate}`,
        title: s.title,
        day: shownDate,
        start: s.start,
        end: s.end,
        suggestionId: s.id,
      },
      "suggestion",
      true,
    );
  };

  /* -------------------------------- draft ------------------------------ */

  const newId = () => {
    seq.current += 1;
    return `block-${seq.current}`;
  };

  const startDraft = (minute: number, via: Draft["via"]) => {
    const start = snapCell(minute);
    draftLive.current = true;
    setDraft({
      id: newId(),
      start,
      end: Math.min(dayEnd, start + STEP),
      mode: "drawing",
      via,
    });
    setSelected(null);
  };

  const cancelDraft = (refocus: boolean) => {
    const d = draft;
    draftLive.current = false;
    setDraft(null);
    if (refocus && d) {
      setActiveCell(d.start);
      requestFocus("cell", d.start);
    }
    setAnnouncement("Block cancelled.");
  };

  const nameDraft = () => {
    setDraft((d) => (d && d.mode === "drawing" ? { ...d, mode: "naming" } : d));
    requestFocus("input", "input");
  };

  const commitDraft = (rawTitle: string) => {
    const d = draft;
    if (!d || !draftLive.current) return;
    draftLive.current = false;
    const titleText = rawTitle.trim() || "New block";
    setDraft(null);
    addEvent(
      {
        id: d.id,
        title: titleText,
        day: shownDate,
        start: d.start,
        end: d.end,
      },
      d.via === "pointer" ? "draw" : "keyboard",
      true,
    );
  };

  const minuteAt = (clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return dayStart;
    const rect = grid.getBoundingClientRect();
    return snapCell(dayStart + (clientY - rect.top) / ppm);
  };

  const onGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (inert || draft || event.button !== 0) return;
    const anchor = minuteAt(event.clientY);
    capturePointer(event.currentTarget, event.pointerId);
    drawRef.current = {
      pointerId: event.pointerId,
      anchor,
      startY: event.clientY,
    };
    setActiveCell(anchor);
    startDraft(anchor, "pointer");
  };

  const onGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - draw.startY) < DRAG_SLOP) return;
    const m = minuteAt(event.clientY);
    const start = m >= draw.anchor ? draw.anchor : m;
    const end = Math.min(dayEnd, (m >= draw.anchor ? m : draw.anchor) + STEP);
    setDraft((d) =>
      d && (d.start !== start || d.end !== end) ? { ...d, start, end } : d,
    );
  };

  const onGridPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== event.pointerId) return;
    releasePointer(event.currentTarget, event.pointerId);
    drawRef.current = null;
    nameDraft();
  };

  /* ------------------------------ keyboard ----------------------------- */

  const moveCell = (to: number) => {
    const m = snapCell(to);
    setActiveCell(m);
    requestFocus("cell", m);
  };

  const onCellKey = (event: React.KeyboardEvent, minute: number) => {
    const { key } = event;
    if (draft && draft.via === "keyboard" && draft.mode === "drawing") {
      if (key === "ArrowDown") {
        event.preventDefault();
        setDraft((d) =>
          d ? { ...d, end: Math.min(dayEnd, d.end + STEP) } : d,
        );
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        setDraft((d) =>
          d ? { ...d, end: Math.max(d.start + STEP, d.end - STEP) } : d,
        );
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        nameDraft();
        return;
      }
      if (key === "Escape") {
        event.preventDefault();
        cancelDraft(true);
        return;
      }
      return;
    }
    if (key === "ArrowDown") moveCell(minute + STEP);
    else if (key === "ArrowUp") moveCell(minute - STEP);
    else if (key === "PageDown") moveCell(minute + 120);
    else if (key === "PageUp") moveCell(minute - 120);
    else if (key === "Home") moveCell(dayStart);
    else if (key === "End") moveCell(dayEnd - STEP);
    else if ((key === "Enter" || key === " ") && !inert && !draft) {
      event.preventDefault();
      startDraft(minute, "keyboard");
      setAnnouncement(
        `Block started at ${clock(minute)}. Down stretches it, Enter names it.`,
      );
      return;
    } else return;
    event.preventDefault();
  };

  const onBlockNav = (event: React.KeyboardEvent, id: string) => {
    const i = sortedBlocks.findIndex((e) => e.id === id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = sortedBlocks.length - 1;
    else if (event.key === "Escape") {
      setSelected(null);
      return;
    } else return;
    event.preventDefault();
    const target = sortedBlocks[clamp(to, 0, sortedBlocks.length - 1)];
    if (target) {
      setActiveBlock(target.id);
      blockNodes.current.get(target.id)?.focus();
    }
  };

  /* -------------------------------- days ------------------------------- */

  const goTo = (next: string, step: number) => {
    if (inert || next === shownDate) return;
    if (draft) cancelDraft(false);
    setDir(step);
    setSelected(null);
    setLanded(null);
    setActiveCell(null);
    if (date === undefined) setOwnDate(next);
    onDateChange?.(next);
    const d = describeDay(next);
    const n = all.filter((e) => e.day === next).length;
    setAnnouncement(
      `${d.weekday} ${d.day} ${d.month}. ${n === 0 ? "Open." : `${n} ${n === 1 ? "block" : "blocks"}.`}`,
    );
  };

  /* ------------------------------- render ------------------------------ */

  const draftTop = draft ? (draft.start - dayStart) * ppm : 0;
  const draftH = draft ? (draft.end - draft.start) * ppm - 2 : 0;
  const nowY = (now - dayStart) * ppm;

  const stepButton = (step: -1 | 1, Icon: typeof ChevronLeft, name: string) => (
    <button
      type="button"
      aria-label={name}
      aria-disabled={inert || undefined}
      onClick={() => goTo(shiftDay(shownDate, step), step)}
      className={cn(
        "flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors",
        inert ? "cursor-default" : "hover:bg-surface-2 hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );

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
      style={{ height }}
    >
      <p id={gridHintId} className="sr-only">
        Up and Down move by half an hour. Enter starts a block, Up and Down
        stretch it, Enter names it, Escape cancels.
      </p>
      <p id={blockHintId} className="sr-only">
        Delete removes. Up and Down move between blocks.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="min-w-0">
          <p
            id={titleId}
            className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {title}
          </p>
          <p className="flex items-baseline gap-1.5 text-sm font-semibold">
            <span className="truncate">
              {when.weekday.slice(0, 3)} {when.day} {when.month.slice(0, 3)}
            </span>
            <span className="hidden text-[11px] font-normal text-ink-3 @min-[26rem]:inline">
              {when.month} {when.day}
            </span>
          </p>
        </div>
        <div
          role="group"
          aria-label="Day"
          className="flex shrink-0 items-center gap-0.5"
        >
          {stepButton(-1, ChevronLeft, "Previous day")}
          <button
            type="button"
            aria-disabled={inert || isToday || undefined}
            onClick={() =>
              goTo(today, parseDay(today) > parseDay(shownDate) ? 1 : -1)
            }
            className={cn(
              "h-7 rounded-2 px-2 text-xs transition-colors",
              inert || isToday
                ? "cursor-default text-ink-3"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Today
          </button>
          {stepButton(1, ChevronRight, "Next day")}
        </div>
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-3">
            <span className="h-5 w-40 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-3 w-28 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="mt-1 h-9 rounded-2 bg-surface-1 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-t border-hairline">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex items-start gap-2 border-b border-hairline px-3"
                style={{ height: cellH * 2 }}
              >
                <span className="mt-1.5 h-2.5 w-5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The day didn&apos;t load.</p>
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
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <LayoutGroup id={uid}>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={{ dir, motionSafe }}
            >
              <motion.div
                key={shownDate}
                custom={{ dir, motionSafe }}
                variants={{
                  enter: (c: { dir: number; motionSafe: boolean }) => ({
                    x: c.motionSafe ? c.dir * distances.shift : 0,
                    opacity: 0,
                  }),
                  center: { x: 0, opacity: 1 },
                  exit: (c: { dir: number; motionSafe: boolean }) => ({
                    x: c.motionSafe ? -c.dir * distances.step : 0,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.base }
                }
                className="flex min-h-0 w-full flex-1 flex-col bg-card @min-[36rem]:flex-row"
              >
                {/* Headline and the suggested blocks. */}
                <motion.div
                  layout={motionSafe ? "position" : false}
                  transition={{ layout: springs.glide }}
                  className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-3 @min-[36rem]:order-last @min-[36rem]:w-60 @min-[36rem]:border-l @min-[36rem]:border-hairline"
                >
                  <div className="relative flex flex-col gap-0.5">
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.p
                        key={headline}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.snap,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                        className="text-[15px] leading-5 font-semibold tracking-tight"
                      >
                        {headline}
                      </motion.p>
                    </AnimatePresence>
                    <p className="text-[11px] text-ink-3">{subline}</p>
                  </div>

                  {offered.length > 0 ? (
                    <ul
                      aria-label="Suggested blocks"
                      className="relative flex flex-col gap-1.5"
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        {offered.map((s, i) => (
                          <motion.li
                            key={s.id}
                            layout={motionSafe ? "position" : false}
                            transition={{ layout: springs.glide }}
                            className="list-none"
                          >
                            <Ghost
                              suggestion={s}
                              index={i}
                              layoutKey={
                                motionSafe
                                  ? `${uid}-${shownDate}-${s.id}`
                                  : undefined
                              }
                              motionSafe={motionSafe}
                              enter={live}
                              disabled={inert}
                              onPress={() => laySuggestion(s)}
                            />
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  ) : suggestions.length === 0 && isOpen ? (
                    <p className="text-[11px] text-ink-2">
                      Drag on the hours to add a block.
                    </p>
                  ) : null}
                </motion.div>

                {/* The hours. */}
                <div
                  ref={scrollRef}
                  className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline @min-[36rem]:border-t-0"
                >
                  <div className="flex">
                    <div
                      aria-hidden
                      className="relative w-9 shrink-0 @min-[24rem]:w-12"
                      style={{ height: gridH }}
                    >
                      {hours.map((h, i) => (
                        <span
                          key={h}
                          className="absolute right-1.5 font-mono text-[10px] text-ink-3 tabular-nums"
                          style={{
                            top: i * cellH * 2,
                            transform: "translateY(-50%)",
                          }}
                        >
                          <span className="@min-[24rem]:hidden">{pad2(h)}</span>
                          <span className="hidden @min-[24rem]:inline">
                            {pad2(h)}:00
                          </span>
                        </span>
                      ))}
                    </div>

                    <div
                      className="relative min-w-0 flex-1 overflow-hidden"
                      style={{ height: gridH }}
                    >
                      <Wash
                        wash={wash}
                        gridH={gridH}
                        phase={phase}
                        shown={isOpen}
                        motionSafe={motionSafe}
                      />

                      <div
                        ref={gridRef}
                        role="grid"
                        aria-label={`Hours, ${when.weekday} ${when.day} ${when.month}`}
                        aria-describedby={gridHintId}
                        aria-rowcount={cells}
                        aria-colcount={1}
                        className="absolute inset-0 touch-none select-none"
                        onPointerDown={onGridPointerDown}
                        onPointerMove={onGridPointerMove}
                        onPointerUp={onGridPointerUp}
                        onPointerCancel={onGridPointerUp}
                      >
                        {Array.from({ length: cells }, (_, i) => {
                          const minute = dayStart + i * STEP;
                          const onHour = minute % 60 === 0;
                          const inDraft =
                            !!draft &&
                            minute >= draft.start &&
                            minute < draft.end;
                          const busy = busyAt(minute);
                          return (
                            <div
                              key={minute}
                              role="row"
                              aria-rowindex={i + 1}
                              style={{ height: cellH }}
                            >
                              <div
                                ref={(node) => {
                                  if (node) cellNodes.current.set(minute, node);
                                  else cellNodes.current.delete(minute);
                                }}
                                role="gridcell"
                                tabIndex={minute === activeMin ? 0 : -1}
                                aria-selected={inDraft || undefined}
                                aria-label={`${clock(minute)}, ${busy ? "busy" : "free"}`}
                                onFocus={() => setActiveCell(minute)}
                                onKeyDown={(e) => onCellKey(e, minute)}
                                className={cn(
                                  "h-full w-full border-t transition-colors",
                                  onHour
                                    ? "border-hairline"
                                    : "border-dashed border-[color-mix(in_oklab,var(--hairline)_60%,transparent)]",
                                  !inert && !busy && "hover:bg-surface-1/70",
                                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {nowShown ? (
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center"
                          initial={false}
                          animate={{ y: nowY }}
                          transition={
                            motionSafe ? springs.drift : { duration: 0 }
                          }
                        >
                          <span className="-ml-1 size-2 shrink-0 rounded-full bg-signal" />
                          <span className="h-px flex-1 bg-signal" />
                        </motion.div>
                      ) : null}

                      <div
                        role="group"
                        aria-label="Blocks"
                        className="pointer-events-none absolute inset-0"
                      >
                        <AnimatePresence initial={false}>
                          {dayEvents.map((event) => {
                            const slot = slots.get(event.id) ?? {
                              col: 0,
                              cols: 1,
                            };
                            const top = (event.start - dayStart) * ppm + 1;
                            const h = Math.max(
                              cellH - 2,
                              (event.end - event.start) * ppm - 2,
                            );
                            return (
                              <Block
                                key={event.id}
                                event={event}
                                top={top}
                                height={h}
                                slot={slot}
                                layoutKey={
                                  motionSafe
                                    ? event.suggestionId
                                      ? `${uid}-${shownDate}-${event.suggestionId}`
                                      : `${uid}-${event.id}`
                                    : undefined
                                }
                                motionSafe={motionSafe}
                                enter={live && !event.suggestionId}
                                landed={landed === event.id}
                                selected={selected === event.id}
                                tabIndex={event.id === activeBlockId ? 0 : -1}
                                disabled={inert}
                                hintId={blockHintId}
                                nodeRef={(node) => {
                                  if (node)
                                    blockNodes.current.set(event.id, node);
                                  else blockNodes.current.delete(event.id);
                                }}
                                onFocus={() => setActiveBlock(event.id)}
                                onToggle={() =>
                                  setSelected((s) =>
                                    s === event.id ? null : event.id,
                                  )
                                }
                                onRemove={() => removeEvent(event, true)}
                                onNav={(e) => onBlockNav(e, event.id)}
                                onSettled={() => settle(event.id)}
                              />
                            );
                          })}
                        </AnimatePresence>
                      </div>

                      {draft ? (
                        <div
                          className="absolute right-[3px] left-0 z-10 flex flex-col overflow-hidden rounded-2 border border-dashed border-cobalt-bright bg-cobalt-wash/80 px-2 py-1"
                          style={{ top: draftTop + 1, height: draftH }}
                        >
                          {draft.mode === "naming" ? (
                            <input
                              ref={inputRef}
                              type="text"
                              aria-label={`Title for the block ${clock(draft.start)} to ${clock(draft.end)}`}
                              placeholder="New block"
                              maxLength={60}
                              autoComplete="off"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitDraft(e.currentTarget.value);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelDraft(true);
                                }
                              }}
                              onBlur={(e) => {
                                if (!draftLive.current) return;
                                if (e.currentTarget.value.trim()) {
                                  commitDraft(e.currentTarget.value);
                                } else cancelDraft(false);
                              }}
                              className="h-4 w-full min-w-0 bg-transparent text-[12px] leading-4 font-semibold text-cobalt-bright placeholder:text-cobalt-bright/50 focus:outline-none"
                            />
                          ) : (
                            <span className="truncate text-[12px] leading-4 font-semibold text-cobalt-bright">
                              {draft.via === "keyboard"
                                ? "New block"
                                : "Drag to size"}
                            </span>
                          )}
                          <span className="font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
                            {clock(draft.start)}-{clock(draft.end)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </LayoutGroup>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
