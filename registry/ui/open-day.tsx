"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Brain,
  Coffee,
  Inbox,
  ListChecks,
  RotateCcw,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type DayKind = "focus" | "lunch" | "review" | "inbox" | "prep";
export type DayCardStyle = "soft" | "outline" | "solid";
export type DayTone = "calm" | "warm" | "mono";
export type DayStatus = "ready" | "loading" | "error";

export type DaySuggestion = {
  id: string;
  label: string;
  kind: DayKind;
  /** Default length, minutes. */
  minutes: number;
};

export type DayBlock = {
  id: string;
  /** The suggestion it came from. */
  suggestion: string;
  label: string;
  kind: DayKind;
  /** ms since the epoch */
  start: number;
  /** ms since the epoch, exclusive */
  end: number;
};

export type OpenDayProps = {
  /** Pixels per hour of the column; the drag maps to it. @default 40 */
  hourHeight?: number;
  /** How blocks and suggestions are drawn: a tinted fill, a dashed outline, or solid pigment. @default "soft" */
  cardStyle?: DayCardStyle;
  /** The block colours. @default "calm" */
  tone?: DayTone;
  /** Any time on the day shown, ms (read in UTC). @default defaultOpenDayDate */
  date?: number;
  /** Working hours as whole hours. @default [9, 17] */
  workingHours?: [number, number];
  /** Blocks offered beside the day. @default defaultDaySuggestions */
  suggestions?: DaySuggestion[];
  /** Controlled placed blocks. */
  value?: DayBlock[];
  /** Initial placed blocks when uncontrolled. @default [] */
  defaultValue?: DayBlock[];
  /** Fires from the drop, key or press that changed the day, with every block. */
  onValueChange?: (blocks: DayBlock[]) => void;
  /** A block landed. Return a promise to save it; a rejection marks it unsaved. */
  onPlace?: (block: DayBlock) => void | Promise<unknown>;
  /** A suggestion was dismissed. */
  onDismiss?: (suggestion: DaySuggestion) => void;
  /** A placed block was removed; its suggestion goes back beside the day. */
  onRemove?: (block: DayBlock) => void;
  /** The current time, ms; "next free hour" counts from it on its own day. Never read from the clock. @default defaultOpenDayNow */
  now?: number;
  /** Whether the day has loaded. Loading shows a skeleton; error marks every placed block unsaved. @default "ready" */
  status?: DayStatus;
  /** Retry was pressed on the sync banner; unsaved blocks are placed again. */
  onRetry?: () => void;
  /** The quarter the column snaps to, minutes. @default 15 */
  step?: number;
  /** Height of the day, px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be placed, moved or dismissed. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Thursday 15 October 2026. */
export const defaultOpenDayDate = Date.UTC(2026, 9, 15);
/** 08:40 that morning, before the working day starts. */
export const defaultOpenDayNow = Date.UTC(2026, 9, 15, 8, 40);

export const defaultDaySuggestions: DaySuggestion[] = [
  { id: "focus", label: "Focus time", kind: "focus", minutes: 120 },
  { id: "lunch", label: "Lunch", kind: "lunch", minutes: 60 },
  { id: "review", label: "Design review", kind: "review", minutes: 30 },
  { id: "inbox", label: "Inbox zero", kind: "inbox", minutes: 30 },
  { id: "prep", label: "1:1 prep", kind: "prep", minutes: 45 },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const ON_PIGMENT = "oklch(0.24 0.02 258)";
const COMPACT = 26;
const GUTTER = 30;

/** Filled shapes: each kind's hue at a fixed lightness, so blocks read in both themes. */
const TONES: Record<DayTone, Record<DayKind, string>> = {
  calm: {
    focus: "oklch(from var(--accent-bright) 0.8 0.1 h)",
    lunch: "oklch(from var(--signal) 0.84 0.1 h)",
    review: "oklch(from var(--accent-bright) 0.8 0.1 300)",
    inbox: "oklch(from var(--signal) 0.84 0.08 205)",
    prep: "oklch(from var(--accent-bright) 0.85 0.07 235)",
  },
  warm: {
    focus: "oklch(from var(--warn) 0.84 0.11 h)",
    lunch: "oklch(from var(--danger) 0.82 0.1 h)",
    review: "oklch(from var(--danger) 0.82 0.09 350)",
    inbox: "oklch(from var(--warn) 0.87 0.08 100)",
    prep: "oklch(from var(--danger) 0.85 0.06 45)",
  },
  mono: {
    focus: "oklch(from var(--ink-3) 0.78 0.012 h)",
    lunch: "oklch(from var(--ink-3) 0.88 0.01 h)",
    review: "oklch(from var(--ink-3) 0.82 0.012 h)",
    inbox: "oklch(from var(--ink-3) 0.9 0.008 h)",
    prep: "oklch(from var(--ink-3) 0.85 0.01 h)",
  },
};
const ICON: Record<DayKind, typeof Brain> = {
  focus: Brain,
  lunch: Coffee,
  review: Users,
  inbox: Inbox,
  prep: ListChecks,
};

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
const pad = (n: number) => String(n).padStart(2, "0");
/** Minutes of the day as a fixed 24-hour clock. */
const hhmm = (m: number) =>
  `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
const length = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The block's look, from the card style and its pigment. */
function look(style: DayCardStyle, pigment: string) {
  if (style === "solid") {
    return {
      className: "border border-transparent",
      style: { backgroundColor: pigment, color: ON_PIGMENT },
    };
  }
  // Longhands only: a border-color shorthand beside a border-left-color
  // makes React warn on every re-render.
  if (style === "outline") {
    return {
      className: "border-[1.5px] border-dashed bg-card text-foreground",
      style: {
        borderTopColor: pigment,
        borderRightColor: pigment,
        borderBottomColor: pigment,
        borderLeftColor: pigment,
      },
    };
  }
  const edge = `color-mix(in oklab, ${pigment} 55%, transparent)`;
  return {
    className: "border border-l-[3px] text-foreground",
    style: {
      backgroundColor: `color-mix(in oklab, ${pigment} 26%, var(--card))`,
      borderTopColor: edge,
      borderRightColor: edge,
      borderBottomColor: edge,
      borderLeftColor: pigment,
    },
  };
}

type Flight = {
  suggestion: DaySuggestion;
  /** Where it lands, minutes from midnight, or null while it has nowhere to go. */
  slot: number | null;
  stage: "drag" | "drop" | "home";
};

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * An empty calendar day: the working hours as a calm column, suggested blocks
 * floating beside it, and an empty message that sits in the largest free
 * stretch of the day and shrinks as the day fills.
 *
 * A suggestion follows the finger 1:1, tucked down to a compact chip while it
 * is held, and a dashed slot shows where it would land (snapped to the
 * quarter, moved on to the next free time that fits). Released over the day it
 * drops onto the slot on `springs.snap` with the throw's velocity, then
 * stretches to its default length on `springs.glide` a beat later: it lands,
 * then settles into its time. Released anywhere else it flies home on snap.
 *
 * Keyboard: the suggestions are one roving list; Enter places the focused
 * one at the next free hour with the same drop and stretch, Delete dismisses
 * it. Placed blocks move a quarter with Up and Down and leave with Delete.
 * A failed save keeps the block, marked unsaved, under a Retry banner. Under
 * reduced motion nothing travels: blocks fade in at their time and the
 * message changes in place.
 */
export function OpenDay({
  hourHeight = 40,
  cardStyle = "soft",
  tone = "calm",
  date = defaultOpenDayDate,
  workingHours = [9, 17],
  suggestions = defaultDaySuggestions,
  value,
  defaultValue = [],
  onValueChange,
  onPlace,
  onDismiss,
  onRemove,
  now = defaultOpenDayNow,
  status = "ready",
  onRetry,
  step = 15,
  height = 540,
  disabled = false,
  className,
}: OpenDayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const ready = status === "ready";

  const d = new Date(date);
  const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const [h0, h1raw] = workingHours;
  const h1 = Math.max(h0 + 1, h1raw);
  const open0 = h0 * 60;
  const open1 = h1 * 60;
  const perMin = Math.max(20, hourHeight) / 60;
  const columnH = Math.round((open1 - open0) * perMin);
  const palette = TONES[tone] ?? TONES.calm;
  const toMin = (ms: number) => Math.round((ms - dayMs) / MIN);
  const toMs = (m: number) => dayMs + m * MIN;

  /* -------------------------------- blocks ----------------------------- */

  const [own, setOwn] = React.useState<DayBlock[]>(defaultValue);
  const blocks = value ?? own;
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  const placedFrom = new Set(blocks.map((b) => b.suggestion));
  const rail = suggestions.filter(
    (s) => !placedFrom.has(s.id) && !dismissed.includes(s.id),
  );

  const [unsaved, setUnsaved] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setBlocks = (next: DayBlock[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const save = (block: DayBlock) => {
    let result: void | Promise<unknown>;
    try {
      result = onPlace?.(block);
    } catch {
      setUnsaved((u) => [...u.filter((x) => x !== block.id), block.id]);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving((s) => [...s, block.id]);
      (result as Promise<unknown>).then(
        () => {
          if (!alive.current) return;
          setSaving((s) => s.filter((x) => x !== block.id));
          setUnsaved((u) => u.filter((x) => x !== block.id));
        },
        () => {
          if (!alive.current) return;
          setSaving((s) => s.filter((x) => x !== block.id));
          setUnsaved((u) => [...u.filter((x) => x !== block.id), block.id]);
          setAnnouncement(`${block.label} isn't saved yet.`);
        },
      );
    } else {
      setUnsaved((u) => u.filter((x) => x !== block.id));
    }
  };

  /* --------------------------------- time ------------------------------ */

  const spans = blocks
    .map((b) => ({ id: b.id, start: toMin(b.start), end: toMin(b.end) }))
    .sort((a, b) => a.start - b.start);
  const free = (start: number, len: number, ignore?: string) =>
    start >= open0 &&
    start + len <= open1 &&
    spans.every(
      (s) => s.id === ignore || s.end <= start || s.start >= start + len,
    );

  /** The first time at or after `from` (in `stride` steps) where `len` fits, else the last before it. */
  const fitAt = (from: number, len: number, stride: number) => {
    for (let t = from; t + len <= open1; t += stride)
      if (free(t, len)) return t;
    for (let t = from - stride; t >= open0; t -= stride)
      if (free(t, len)) return t;
    return null;
  };
  const nowMin = toMin(now);
  const today = nowMin >= 0 && nowMin < 24 * 60;
  const nextHour = () => {
    const from = today ? Math.max(open0, Math.ceil(nowMin / 60) * 60) : open0;
    return from;
  };

  const booked = spans.reduce(
    (sum, s) =>
      sum + Math.max(0, Math.min(open1, s.end) - Math.max(open0, s.start)),
    0,
  );
  const openMinutes = open1 - open0 - booked;
  const fill = booked / (open1 - open0);

  // The largest free stretch, where the empty message sits.
  let gapFrom = open0;
  let gapTo = open0;
  {
    let cursor = open0;
    for (const s of [...spans, { id: "", start: open1, end: open1 }]) {
      if (s.start - cursor > gapTo - gapFrom) {
        gapFrom = cursor;
        gapTo = s.start;
      }
      cursor = Math.max(cursor, s.end);
    }
  }
  const gapPx = (gapTo - gapFrom) * perMin;

  /* ------------------------------- geometry ---------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const columnRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const blockRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = React.useRef<string | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(COMPACT);
  const origin = React.useRef({ x: 0, y: 0, w: 0, h: 0 });
  const flights = React.useRef<AnimationPlaybackControls[]>([]);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const flightRef = React.useRef<Flight | null>(null);
  const setFlightBoth = (f: Flight | null) => {
    flightRef.current = f;
    setFlight(f);
  };
  const halt = () => {
    for (const c of flights.current) c.stop();
    flights.current = [];
  };
  React.useEffect(() => () => halt(), []);

  const rel = (rect: DOMRect) => {
    const root = rootRef.current?.getBoundingClientRect();
    return {
      x: rect.left - (root?.left ?? 0),
      y: rect.top - (root?.top ?? 0),
    };
  };

  /** Where a slot is drawn, relative to the root, after scrolling it into view. */
  const slotBox = (start: number, len: number) => {
    const column = columnRef.current;
    const scroller = scrollRef.current;
    if (!column) return null;
    if (scroller) {
      const top = column.offsetTop + (start - open0) * perMin;
      const bottom = top + len * perMin;
      if (top < scroller.scrollTop + 8)
        scroller.scrollTop = Math.max(0, top - 8);
      else if (bottom > scroller.scrollTop + scroller.clientHeight - 8) {
        scroller.scrollTop = bottom - scroller.clientHeight + 8;
      }
    }
    const rect = column.getBoundingClientRect();
    const at = rel(rect);
    return {
      x: r2(at.x + GUTTER + 4),
      y: r2(at.y + (start - open0) * perMin),
      w: r2(rect.width - GUTTER - 8),
      h: r2(Math.max(COMPACT, len * perMin - 2)),
    };
  };

  const commit = (s: DaySuggestion, start: number) => {
    const block: DayBlock = {
      id: `${s.id}-${start}`,
      suggestion: s.id,
      label: s.label,
      kind: s.kind,
      start: toMs(start),
      end: toMs(start + s.minutes),
    };
    setBlocks([...blocks, block]);
    save(block);
    const left = Math.max(0, openMinutes - s.minutes);
    setAnnouncement(
      `${s.label} placed ${hhmm(start)} to ${hhmm(start + s.minutes)}. ${left ? `${length(left)} still open.` : "The day is full."}`,
    );
  };

  /** The drop: onto the slot on snap with the throw, then out to full length on glide. */
  const land = (s: DaySuggestion, start: number, velocity = { x: 0, y: 0 }) => {
    halt();
    const box = slotBox(start, s.minutes);
    if (!box || !motionSafe) {
      setFlightBoth(null);
      commit(s, start);
      focusAfter(s.id);
      return;
    }
    setFlightBoth({ suggestion: s, slot: start, stage: "drop" });
    const drop = { ...springs.snap };
    const stretch = { ...springs.glide, delay: 0.07 };
    let done = 0;
    const finish = () => {
      done += 1;
      if (done < 2 || !alive.current) return;
      setFlightBoth(null);
      commit(s, start);
      focusAfter(s.id);
    };
    flights.current = [
      animate(x, box.x, { ...drop, velocity: velocity.x }),
      animate(y, box.y, { ...drop, velocity: velocity.y, onComplete: finish }),
      animate(w, box.w, drop),
      animate(h, box.h, { ...stretch, onComplete: finish }),
    ];
  };

  const flyHome = (s: DaySuggestion, velocity = { x: 0, y: 0 }) => {
    halt();
    if (!motionSafe) {
      setFlightBoth(null);
      return;
    }
    setFlightBoth({ suggestion: s, slot: null, stage: "home" });
    const o = origin.current;
    flights.current = [
      animate(x, o.x, { ...springs.snap, velocity: velocity.x }),
      animate(y, o.y, {
        ...springs.snap,
        velocity: velocity.y,
        onComplete: () => {
          if (alive.current) setFlightBoth(null);
        },
      }),
      animate(w, o.w, springs.snap),
      animate(h, o.h, springs.snap),
    ];
  };

  const lift = (s: DaySuggestion) => {
    const card = cardRefs.current.get(s.id);
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    const at = rel(rect);
    origin.current = { x: at.x, y: at.y, w: rect.width, h: rect.height };
    halt();
    x.jump(at.x);
    y.jump(at.y);
    w.jump(rect.width);
    h.jump(rect.height);
    return true;
  };

  /** After a card leaves the rail, focus goes to its neighbour, or the day. */
  const focusAfter = (id: string) => {
    const i = rail.findIndex((s) => s.id === id);
    const next = rail[i + 1] ?? rail[i - 1];
    pendingFocus.current = next ? `card:${next.id}` : "column";
  };

  // A block still landing commits when its springs finish; a second
  // placement started over it would stop them, so it waits the half second.
  const landing = () => flightRef.current?.stage === "drop";
  const holding = (s: DaySuggestion) =>
    flightRef.current?.stage === "drag" &&
    flightRef.current.suggestion.id === s.id;

  const placeNext = (s: DaySuggestion) => {
    if (disabled || !ready || landing()) return;
    const start =
      fitAt(nextHour(), s.minutes, 60) ?? fitAt(nextHour(), s.minutes, step);
    if (start === null) {
      setAnnouncement(`No free time left for ${s.label}.`);
      return;
    }
    if (motionSafe && lift(s)) h.jump(COMPACT);
    land(s, start);
  };

  const dismiss = (s: DaySuggestion) => {
    if (disabled) return;
    focusAfter(s.id);
    setDismissed((list) => [...list, s.id]);
    onDismiss?.(s);
    setAnnouncement(`${s.label} dismissed.`);
  };

  /* -------------------------------- drag ------------------------------- */

  const slotAt = (clientX: number, clientY: number, s: DaySuggestion) => {
    const column = columnRef.current;
    if (!column) return null;
    const rect = column.getBoundingClientRect();
    if (
      clientX < rect.left - 24 ||
      clientX > rect.right + 24 ||
      clientY < rect.top - 24 ||
      clientY > rect.bottom + 24
    ) {
      return null;
    }
    const raw = open0 + (clientY - rect.top) / perMin - s.minutes / 2;
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.min(open1 - s.minutes, Math.max(open0, snapped));
    return fitAt(clamped, s.minutes, step);
  };

  const [roving, setRoving] = React.useState<string | null>(null);
  const rovingId = rail.some((s) => s.id === roving)
    ? roving
    : (rail[0]?.id ?? null);

  /* ------------------------------- blocks ------------------------------ */

  const nudge = (b: DayBlock, delta: number) => {
    const start = toMin(b.start) + delta;
    const len = toMin(b.end) - toMin(b.start);
    if (!free(start, len, b.id)) return;
    const moved = { ...b, start: toMs(start), end: toMs(start + len) };
    setBlocks(blocks.map((x) => (x.id === b.id ? moved : x)));
    save(moved);
    setAnnouncement(`${b.label} ${hhmm(start)} to ${hhmm(start + len)}.`);
  };
  const remove = (b: DayBlock) => {
    if (disabled) return;
    setBlocks(blocks.filter((x) => x.id !== b.id));
    setUnsaved((u) => u.filter((x) => x !== b.id));
    onRemove?.(b);
    setAnnouncement(`${b.label} removed. It's back with the suggestions.`);
    pendingFocus.current = `card:${b.suggestion}`;
  };

  const retry = () => {
    onRetry?.();
    for (const id of unsaved) {
      const b = blocks.find((x) => x.id === id);
      if (b) save(b);
    }
  };

  // Focus that has to move after a card leaves the rail (or comes back) is
  // carried here and applied once the render that moved it has landed.
  React.useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "column") {
      const last = blocks[blocks.length - 1];
      if (last) blockRefs.current.get(last.id)?.focus();
    } else {
      // The card's own focus handler makes it the roving stop.
      cardRefs.current.get(target.slice(5))?.focus();
    }
  });

  /* -------------------------------- render ----------------------------- */

  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const errorIds = status === "error" ? blocks.map((b) => b.id) : unsaved;
  const nowY =
    today && nowMin >= open0 && nowMin <= open1
      ? (nowMin - open0) * perMin
      : null;
  const message =
    booked === 0
      ? "Nothing booked yet"
      : openMinutes <= 0
        ? "Day is full"
        : `${length(openMinutes)} open`;
  const flightLook = flight
    ? look(cardStyle, palette[flight.suggestion.kind])
    : null;

  const card = (s: DaySuggestion) => {
    const Icon = ICON[s.kind];
    const lifted = flight?.suggestion.id === s.id;
    const l = look(cardStyle, palette[s.kind]);
    return (
      <SuggestionCard
        key={s.id}
        suggestion={s}
        lifted={lifted}
        roving={rovingId === s.id}
        disabled={disabled || !ready}
        lookClass={l.className}
        lookStyle={l.style}
        Icon={Icon}
        register={(node) => {
          if (node) cardRefs.current.set(s.id, node);
          else cardRefs.current.delete(s.id);
        }}
        onFocus={() => setRoving(s.id)}
        onKey={(event) => {
          const i = rail.findIndex((r) => r.id === s.id);
          const go = (to: number) => {
            const next = rail[Math.min(rail.length - 1, Math.max(0, to))];
            if (!next) return;
            setRoving(next.id);
            cardRefs.current.get(next.id)?.focus();
          };
          if (["ArrowDown", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            go(i + 1);
          } else if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
            event.preventDefault();
            go(i - 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            go(0);
          } else if (event.key === "End") {
            event.preventDefault();
            go(rail.length - 1);
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            dismiss(s);
          }
        }}
        onPlace={() => placeNext(s)}
        onDismiss={() => dismiss(s)}
        onDragStart={() => {
          if (landing() || !lift(s)) return;
          setFlightBoth({ suggestion: s, slot: null, stage: "drag" });
          if (motionSafe) {
            // Tucked to a chip while held, so the slot under it stays readable.
            flights.current = [animate(h, COMPACT, springs.flick)];
          }
        }}
        onDragMove={(dx, dy, cx, cy) => {
          if (!holding(s)) return;
          const o = origin.current;
          x.set(r2(o.x + dx));
          y.set(r2(o.y + dy));
          const slot = slotAt(cx, cy, s);
          const f = flightRef.current;
          if (f && f.slot !== slot) setFlightBoth({ ...f, slot });
        }}
        onDragEnd={(vx, vy) => {
          if (!holding(s)) return;
          const f = flightRef.current;
          if (f?.slot != null) land(s, f.slot, { x: vx, y: vy });
          else flyHome(s, { x: vx, y: vy });
        }}
        onDragCancel={() => {
          if (holding(s)) flyHome(s);
        }}
      />
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1 basis-32">
            <p id={titleId} className="truncate text-sm font-semibold">
              {WEEKDAYS[d.getUTCDay()]} {d.getUTCDate()}{" "}
              {MONTHS[d.getUTCMonth()]}
            </p>
            <p className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
              {hhmm(open0)}–{hhmm(open1)}
            </p>
          </div>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline px-2 font-mono text-[11px] text-ink-2 tabular-nums">
            {ready ? `${length(Math.max(0, openMinutes))} open` : "Loading"}
          </span>
        </header>

        {status === "error" || unsaved.length ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[color-mix(in_oklab,var(--warn)_30%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-4 py-2"
          >
            <TriangleAlert
              aria-hidden
              className="size-3.5 shrink-0 text-warn"
            />
            <p className="min-w-0 flex-1 basis-40 text-[12px] text-ink-2">
              Couldn&apos;t sync with your calendar.{" "}
              {errorIds.length === 1
                ? "1 block is unsaved."
                : `${errorIds.length} blocks are unsaved.`}
            </p>
            <button
              type="button"
              onClick={retry}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-ink-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        >
          <div className="flex flex-col gap-3 p-4 @min-[19rem]:grid @min-[19rem]:grid-cols-[minmax(0,1fr)_8rem] @min-[19rem]:items-start">
            <div
              role="group"
              aria-label="Suggested blocks"
              className={cn(
                "-mx-4 -my-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-1",
                "[mask-image:linear-gradient(90deg,transparent,black_10px,black_calc(100%-10px),transparent)]",
                "@min-[19rem]:order-last @min-[19rem]:mx-0 @min-[19rem]:my-0 @min-[19rem]:flex-col @min-[19rem]:overflow-visible @min-[19rem]:[mask-image:none] @min-[19rem]:p-0",
              )}
            >
              <span className="hidden text-[11px] font-medium text-ink-3 @min-[19rem]:block">
                Suggested
              </span>
              {ready ? (
                rail.length ? (
                  rail.map(card)
                ) : (
                  <span className="text-[11px] text-ink-3">All placed</span>
                )
              ) : (
                [0, 1, 2].map((k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="h-12 w-32 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[19rem]:w-full"
                  />
                ))
              )}
            </div>

            <div
              ref={columnRef}
              role="group"
              aria-label={`Working hours, ${message.toLowerCase()}`}
              className="relative"
              style={{ height: columnH }}
            >
              {hours.map((hour, i) => (
                <React.Fragment key={hour}>
                  <span
                    aria-hidden
                    className="absolute left-0 w-6 -translate-y-1/2 text-right font-mono text-[10px] leading-none text-ink-3 tabular-nums"
                    style={{ top: Math.max(5, Math.round(i * hourHeight)) }}
                  >
                    {pad(hour)}
                  </span>
                  <span
                    aria-hidden
                    className="absolute right-0 h-px bg-hairline"
                    style={{ top: Math.round(i * hourHeight), left: GUTTER }}
                  />
                </React.Fragment>
              ))}
              <span
                aria-hidden
                className="absolute right-0 h-px bg-hairline"
                style={{ top: columnH - 1, left: GUTTER }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-hairline"
                style={{ left: GUTTER }}
              />

              {!ready ? (
                <>
                  <span
                    aria-hidden
                    className="absolute right-1 h-14 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ top: hourHeight * 0.5, left: GUTTER + 4 }}
                  />
                  <span
                    aria-hidden
                    className="absolute right-1 h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ top: hourHeight * 3.2, left: GUTTER + 4 }}
                  />
                </>
              ) : null}

              {ready && flight?.slot != null && flight.stage === "drag" ? (
                <span
                  aria-hidden
                  className="absolute right-1 z-10 rounded-2 border-[1.5px] border-dashed border-ink-3/60 bg-surface-1"
                  style={{
                    top: Math.round((flight.slot - open0) * perMin),
                    height: Math.max(
                      COMPACT,
                      Math.round(flight.suggestion.minutes * perMin) - 2,
                    ),
                    left: GUTTER + 4,
                  }}
                >
                  <span className="absolute top-1 right-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
                    {hhmm(flight.slot)}
                  </span>
                </span>
              ) : null}

              {ready ? (
                <motion.div
                  aria-hidden={booked > 0 && openMinutes <= 0}
                  className="pointer-events-none absolute right-0 flex -translate-y-1/2 flex-col items-center justify-center text-center"
                  style={{ left: GUTTER, originY: "50%" }}
                  initial={false}
                  animate={{
                    top: Math.round(((gapFrom + gapTo) / 2 - open0) * perMin),
                    scale: Number((1 - 0.28 * fill).toFixed(3)),
                    opacity: gapPx < 30 ? 0 : 1,
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.glide,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: 0 }
                  }
                >
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">
                      {message}
                    </span>
                    {booked === 0 || gapPx > 90 ? (
                      <span className="mt-0.5 block max-w-44 text-[11px] leading-snug text-ink-3">
                        Drag a block in, or pick one and press Enter.
                      </span>
                    ) : null}
                  </span>
                </motion.div>
              ) : null}

              {nowY !== null ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-0 z-10 h-px bg-signal"
                  style={{ top: Math.round(nowY), left: GUTTER - 3 }}
                >
                  <span className="absolute -top-[2.5px] -left-0.5 size-1.5 rounded-full bg-signal" />
                </span>
              ) : null}

              {ready
                ? blocks.map((b) => {
                    const start = toMin(b.start);
                    const len = toMin(b.end) - start;
                    const l = look(cardStyle, palette[b.kind]);
                    const Icon = ICON[b.kind];
                    const isUnsaved = errorIds.includes(b.id);
                    const isSaving = saving.includes(b.id);
                    const tall = len * perMin >= 34;
                    return (
                      <motion.button
                        key={b.id}
                        ref={(node: HTMLButtonElement | null) => {
                          if (node) blockRefs.current.set(b.id, node);
                          else blockRefs.current.delete(b.id);
                        }}
                        type="button"
                        aria-label={`${b.label}, ${hhmm(start)} to ${hhmm(start + len)}${isUnsaved ? ", unsaved" : isSaving ? ", saving" : ""}. Up and Down move it, Delete removes it.`}
                        onKeyDown={(event) => {
                          if (disabled) return;
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            nudge(b, -step);
                          } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            nudge(b, step);
                          } else if (
                            event.key === "Delete" ||
                            event.key === "Backspace"
                          ) {
                            event.preventDefault();
                            remove(b);
                          }
                        }}
                        initial={motionSafe ? false : { opacity: 0 }}
                        animate={{
                          opacity: 1,
                          top: Math.round((start - open0) * perMin),
                        }}
                        transition={{
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                          top: motionSafe ? springs.snap : { duration: 0 },
                        }}
                        className={cn(
                          "absolute right-1 flex items-start gap-1.5 overflow-hidden rounded-2 px-2 text-left",
                          tall
                            ? "flex-col justify-start py-1.5"
                            : "items-center py-0",
                          l.className,
                          isUnsaved && "border-dashed",
                          FOCUS_RING,
                        )}
                        style={{
                          ...l.style,
                          left: GUTTER + 4,
                          height: Math.max(
                            COMPACT,
                            Math.round(len * perMin) - 2,
                          ),
                          ...(isUnsaved
                            ? {
                                borderTopColor: "var(--warn)",
                                borderRightColor: "var(--warn)",
                                borderBottomColor: "var(--warn)",
                                borderLeftColor: "var(--warn)",
                              }
                            : {}),
                        }}
                      >
                        <span className="flex w-full min-w-0 items-center gap-1.5">
                          <Icon aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate text-[12px] leading-tight font-medium">
                            {b.label}
                          </span>
                          {isUnsaved ? (
                            <span
                              aria-hidden
                              title="Unsaved"
                              className="ml-auto size-1.5 shrink-0 rounded-full bg-warn"
                            />
                          ) : null}
                        </span>
                        {tall ? (
                          <span className="font-mono text-[10.5px] leading-tight tabular-nums opacity-75">
                            {hhmm(start)}–{hhmm(start + len)}
                            {isUnsaved
                              ? " · unsaved"
                              : isSaving
                                ? " · saving"
                                : ""}
                          </span>
                        ) : null}
                      </motion.button>
                    );
                  })
                : null}
            </div>
          </div>
        </div>
      </div>

      {flight && flightLook ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-30 flex items-center gap-1.5 overflow-hidden rounded-2 px-2 shadow-[0_10px_24px_color-mix(in_oklab,black_18%,transparent)]",
            flightLook.className,
          )}
          style={{ ...flightLook.style, x, y, width: w, height: h }}
        >
          {React.createElement(ICON[flight.suggestion.kind], {
            "aria-hidden": true,
            className: "size-3.5 shrink-0",
          })}
          <span className="truncate text-[12px] font-medium">
            {flight.suggestion.label}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums opacity-75">
            {flight.slot != null
              ? hhmm(flight.slot)
              : length(flight.suggestion.minutes)}
          </span>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                             Suggestion card                             */
/* ----------------------------------------------------------------------- */

function SuggestionCard({
  suggestion,
  lifted,
  roving,
  disabled,
  lookClass,
  lookStyle,
  Icon,
  register,
  onFocus,
  onKey,
  onPlace,
  onDismiss,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  suggestion: DaySuggestion;
  lifted: boolean;
  roving: boolean;
  disabled: boolean;
  lookClass: string;
  lookStyle: React.CSSProperties;
  Icon: typeof Brain;
  register: (node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPlace: () => void;
  onDismiss: () => void;
  onDragStart: () => void;
  onDragMove: (
    dx: number,
    dy: number,
    clientX: number,
    clientY: number,
  ) => void;
  onDragEnd: (vx: number, vy: number) => void;
  onDragCancel: () => void;
}) {
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => onDragStart(),
    onMove: ({ offset, point }) =>
      onDragMove(offset.x, offset.y, point.x, point.y),
    onEnd: ({ velocity }) => onDragEnd(velocity.x, velocity.y),
    onCancel: () => onDragCancel(),
    onTap: (event) => {
      // A tap on the dismiss button is that button's, not a placement.
      if ((event.target as HTMLElement).closest("[data-dismiss]")) return;
      onPlace();
    },
  });
  return (
    <div className="relative w-32 shrink-0 @min-[19rem]:w-full">
      <button
        ref={register}
        type="button"
        tabIndex={roving ? 0 : -1}
        aria-label={`${suggestion.label}, ${length(suggestion.minutes)}. Enter places it at the next free hour, Delete dismisses it.`}
        aria-disabled={disabled || undefined}
        onFocus={onFocus}
        onKeyDown={onKey}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it is Enter or Space.
          if (event.detail === 0 && !disabled) onPlace();
        }}
        {...drag}
        className={cn(
          "flex w-full touch-pan-x flex-col gap-0.5 rounded-2 py-1.5 pr-6 pl-2 text-left transition-[opacity,box-shadow] select-none @min-[19rem]:touch-pan-y",
          lookClass,
          FOCUS_RING,
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab hover:shadow-[0_4px_12px_color-mix(in_oklab,black_10%,transparent)] active:cursor-grabbing",
          lifted && "opacity-30",
        )}
        style={lookStyle}
      >
        <span className="flex min-w-0 items-start gap-1.5">
          <Icon aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="line-clamp-2 text-[12px] leading-tight font-medium">
            {suggestion.label}
          </span>
        </span>
        <span className="font-mono text-[10.5px] tabular-nums opacity-75">
          {length(suggestion.minutes)}
        </span>
      </button>
      <button
        type="button"
        data-dismiss=""
        tabIndex={-1}
        aria-label={`Dismiss ${suggestion.label}`}
        onClick={onDismiss}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-1 opacity-60 hover:bg-[color-mix(in_oklab,black_8%,transparent)] hover:opacity-100"
        style={{ color: lookStyle.color }}
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  );
}
