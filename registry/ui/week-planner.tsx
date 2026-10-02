"use client";

import * as React from "react";

import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WeekEvent = {
  id: string;
  title: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms, exclusive. Events stay inside one day. */
  end: number;
  /** A `WeekCalendar` id: its tint colours the event. */
  calendar?: string;
  location?: string;
};

export type WeekCalendar = {
  id: string;
  label: string;
  /** Any CSS colour — a token, never a hex. */
  tint: string;
};

export type WeekDensity = "compact" | "cozy" | "roomy";
export type WeekPlannerStatus = "ready" | "loading" | "error";

export type WeekPlannerProps = {
  /** Minutes every drag, resize and cursor step snaps to. @default 15 */
  snap?: number;
  /** Height of an hour: compact 40px, cozy 52px, roomy 68px, with type and padding to match. @default "cozy" */
  density?: WeekDensity;
  /** The current moment: a Date or epoch ms, or a number from 0 to 24 read as that hour of `today` (13.5 is 13:30). @default defaultWeekPlannerNow */
  now?: Date | number;
  /** Controlled events. */
  events?: WeekEvent[];
  /** Initial events when uncontrolled. @default defaultWeekEvents */
  defaultEvents?: WeekEvent[];
  /** Fires from the drag, key or field that changed the events, with all of them. */
  onEventsChange?: (events: WeekEvent[]) => void;
  /** The calendars events belong to, with their tints. @default defaultWeekCalendars */
  calendars?: WeekCalendar[];
  /** Controlled focused day (any moment in it): its week is shown, and on a phone the day itself. */
  day?: Date | number;
  /** Initial focused day when uncontrolled. @default today */
  defaultDay?: Date | number;
  /** Fires with the new day's midnight (epoch ms) from the arrows, the strip or the keys. */
  onDayChange?: (day: number) => void;
  /** Controlled selected event id. */
  selected?: string | null;
  /** Initial selected event when uncontrolled. @default null */
  defaultSelected?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** The date marked as today. @default the date of `now`, or defaultWeekPlannerToday */
  today?: Date | number;
  /** The hours the grid draws, [first, last). Events outside are clipped to them. @default [7, 21] */
  hours?: [number, number];
  /** Working hours, drawn on the lighter ground. @default [9, 18] */
  workHours?: [number, number];
  /** 1 starts weeks on Monday, 0 on Sunday. @default 1 */
  weekStartsOn?: 0 | 1;
  /** Minutes east of UTC that times are drawn in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** Minutes a keyboard or button creation lasts without a range. @default 30 */
  defaultDuration?: number;
  /** A new event's title, selected for typing over. @default "New event" */
  newTitle?: string;
  /** The calendar new events join. @default the first calendar */
  defaultCalendar?: string;
  /** An event was drawn, made with Enter, or added with New. */
  onCreate?: (event: WeekEvent) => void;
  /** An event moved, resized, was renamed or changed calendar. */
  onUpdate?: (event: WeekEvent, previous: WeekEvent) => void;
  onDelete?: (event: WeekEvent) => void;
  /** The planner's accessible name. @default "Week" */
  label?: string;
  /** Loading draws placeholder blocks; error offers Retry. @default "ready" */
  status?: WeekPlannerStatus;
  onRetry?: () => void;
  /** Play the ticks and landings. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Time, in the zone the planner is told, never the machine's           */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MO_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MO_LONG = [
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

const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const midnight = (ms: number, off: number) =>
  Math.floor((ms + off * MIN) / DAY) * DAY - off * MIN;
const partsOf = (ms: number, off: number) => {
  const d = new Date(ms + off * MIN);
  return {
    wd: d.getUTCDay(),
    date: d.getUTCDate(),
    month: d.getUTCMonth(),
    year: d.getUTCFullYear(),
  };
};
const minuteOf = (ms: number, off: number) =>
  Math.round((ms - midnight(ms, off)) / MIN);
/** A clock reading for minutes from midnight: "09:15", "24:00". */
const hhmm = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
};
const span = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Defaults: Gaugeworks' product team, week of 28 September 2026         */
/* ------------------------------------------------------------------ */

/** Thursday 1 October 2026, midnight UTC. */
export const defaultWeekPlannerToday = Date.UTC(2026, 9, 1);
/** Thursday 1 October 2026, 13:30 UTC. */
export const defaultWeekPlannerNow = Date.UTC(2026, 9, 1, 13, 30);

export const defaultWeekCalendars: WeekCalendar[] = [
  { id: "work", label: "Work", tint: "var(--accent-bright)" },
  { id: "focus", label: "Focus", tint: "var(--success)" },
  { id: "personal", label: "Personal", tint: "var(--warn)" },
];

const ev = (
  id: string,
  title: string,
  day: number,
  from: string,
  to: string,
  calendar: string,
  location?: string,
): WeekEvent => {
  const at = (t: string) => {
    const [h = "0", m = "0"] = t.split(":");
    return Date.UTC(2026, 8, 28 + day, Number(h), Number(m));
  };
  return { id, title, start: at(from), end: at(to), calendar, location };
};

export const defaultWeekEvents: WeekEvent[] = [
  ev("mon-standup", "Stand-up", 0, "09:30", "09:45", "work"),
  ev("mon-roadmap", "Q4 roadmap", 0, "10:00", "12:00", "focus"),
  ev(
    "mon-lunch",
    "Lunch with Amara",
    0,
    "12:30",
    "13:30",
    "personal",
    "Canteen",
  ),
  ev(
    "mon-vendor",
    "Basinworks vendor call",
    0,
    "15:00",
    "16:00",
    "work",
    "Room 2",
  ),
  ev("tue-standup", "Stand-up", 1, "09:30", "09:45", "work"),
  ev(
    "tue-review",
    "Fernworks design review",
    1,
    "11:00",
    "12:30",
    "work",
    "Studio",
  ),
  ev("tue-interview", "Interview: data engineer", 1, "11:30", "12:15", "work"),
  ev("tue-focus", "Focus block", 1, "15:30", "17:30", "focus"),
  ev("wed-standup", "Stand-up", 2, "09:30", "09:45", "work"),
  ev("wed-audit", "Coldbrook Bank audit window", 2, "10:00", "11:30", "work"),
  ev("wed-sync", "Gaugeworks sync", 2, "10:30", "11:15", "work"),
  ev("wed-one", "1:1 with Priya", 2, "14:00", "14:30", "work"),
  ev("wed-climb", "Climbing", 2, "18:00", "19:30", "personal", "North wall"),
  ev("thu-standup", "Stand-up", 3, "09:30", "09:45", "work"),
  ev("thu-pricing", "Pricing page", 3, "10:00", "11:30", "focus"),
  ev("thu-lunch", "Lunch", 3, "12:00", "12:45", "personal"),
  ev("thu-design", "Design review", 3, "14:00", "15:00", "work", "Studio"),
  ev("thu-waylight", "Waylight Pay check-in", 3, "14:30", "15:15", "work"),
  ev("thu-dentist", "Dentist", 3, "16:30", "17:15", "personal"),
  ev("fri-standup", "Stand-up", 4, "09:30", "09:45", "work"),
  ev("fri-demo", "Sprint demo", 4, "11:00", "12:00", "work", "Studio"),
  ev("fri-retro", "Retro", 4, "15:00", "16:00", "work"),
];

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  RING,
);

const HOUR_PX: Record<WeekDensity, number> = {
  compact: 40,
  cozy: 52,
  roomy: 68,
};

/** A touch must rest this long before it draws or lifts, so a swipe scrolls. */
const HOLD_MS = 300;

type Follow = {
  move: (e: React.PointerEvent<HTMLDivElement>) => void;
  up: (e: React.PointerEvent<HTMLDivElement>) => void;
  cancel: (e: React.PointerEvent<HTMLDivElement>) => void;
};

/**
 * A drag only captures the pointer once it has travelled a few pixels, so a
 * press on a thin edge can slip off it first and its moves go elsewhere.
 * Until the capture, moves and the release outside the element are handed
 * to it from the window; after it, they arrive on their own.
 */
function follow(el: Element, pointerId: number, to: Follow): () => void {
  const outside = (e: PointerEvent) =>
    !(e.target instanceof Node && el.contains(e.target));
  const cast = (e: PointerEvent) =>
    e as unknown as React.PointerEvent<HTMLDivElement>;
  const move = (e: PointerEvent) => {
    if (e.pointerId === pointerId && outside(e)) to.move(cast(e));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    if (outside(e)) to.up(cast(e));
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    if (outside(e)) to.cancel(cast(e));
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  return stop;
}

/* ------------------------------------------------------------------ */
/* Overlaps, side by side                                               */
/* ------------------------------------------------------------------ */

type Geo = { day: number; start: number; end: number };
type Slot = { a: number; w: number };

/**
 * Packs one day's events into the fewest columns, closing a cluster as soon
 * as nothing in it is still running, then lets each event widen into the
 * free columns to its right — so a lone event takes the whole day and a pile
 * divides it only where it overlaps.
 */
function pack(items: { id: string; start: number; end: number }[]) {
  const out = new Map<string, Slot>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: { id: string; start: number; end: number; col: number }[] = [];
  let ends: number[] = [];
  const close = () => {
    const cols = Math.max(1, ends.length);
    for (const it of cluster) {
      let reach = 1;
      for (let c = it.col + 1; c < cols; c += 1) {
        const blocked = cluster.some(
          (o) => o.col === c && o.start < it.end && it.start < o.end,
        );
        if (blocked) break;
        reach += 1;
      }
      out.set(it.id, { a: r4(it.col / cols), w: r4(reach / cols) });
    }
    cluster = [];
    ends = [];
  };
  for (const it of sorted) {
    if (ends.length && it.start >= Math.max(...ends)) close();
    let col = ends.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = ends.length;
      ends.push(it.end);
    } else {
      ends[col] = it.end;
    }
    cluster.push({ ...it, col });
  }
  close();
  return out;
}

/* ------------------------------------------------------------------ */
/* An event you can drag, stretch and rename                            */
/* ------------------------------------------------------------------ */

type Frame = {
  left: number;
  top: number;
  colW: number;
  cols: number;
};
type Pt = { x: number; y: number };
type Born = { y: number; h: number; v: number };

type EventBlockProps = {
  event: WeekEvent;
  geo: Geo;
  slot: Slot;
  ppm: number;
  h0: number;
  h1: number;
  snap: number;
  tint: string;
  name: string;
  selected: boolean;
  /** Ended before now. */
  past: boolean;
  /** Shown on a phone (where only the focused day is). */
  inFocus: boolean;
  editing: string | null;
  born?: Born;
  motionSafe: boolean;
  disabled: boolean;
  audio: TactileSound;
  hintId: string;
  bind: (node: HTMLButtonElement | null) => void;
  frame: () => Frame | null;
  lockTouch: (on: boolean) => void;
  onPreview: (id: string, landing: Geo | null) => void;
  onDrop: (id: string, landing: Geo) => void;
  onDragMove: (point: Pt, update: (p: Pt) => void) => void;
  onDragEnd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
  onDraft: (text: string) => void;
  onEditDone: (commit: boolean) => void;
  onDelete: (id: string) => void;
};

type Grip = {
  mode: "move" | "top" | "bottom";
  startX: number;
  startY: number;
  grab: number;
  baseY: number;
  baseH: number;
  day: number;
  armed: boolean;
  touch: boolean;
  timer: number;
  active: boolean;
  cancelled: boolean;
  landing: Geo;
  detach: (() => void) | null;
};

function EventBlock({
  event,
  geo,
  slot,
  ppm,
  h0,
  h1,
  snap,
  tint,
  name,
  selected,
  past,
  inFocus,
  editing,
  born,
  motionSafe,
  disabled,
  audio,
  hintId,
  bind,
  frame,
  lockTouch,
  onPreview,
  onDrop,
  onDragMove,
  onDragEnd,
  onSelect,
  onRename,
  onKey,
  onDraft,
  onEditDone,
  onDelete,
}: EventBlockProps) {
  const id = event.id;
  const top0 = h0 * 60;
  const targetY = r2((geo.start - top0) * ppm);
  const targetH = r2(Math.max(10, (geo.end - geo.start) * ppm));
  const y = useMotionValue(born?.y ?? targetY);
  const h = useMotionValue(born?.h ?? targetH);
  const dx = useMotionValue(0);
  const lift = useMotionValue(0);
  const a = useMotionValue(slot.a);
  const w = useMotionValue(slot.w);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const grip = React.useRef<Grip | null>(null);
  const throwV = React.useRef(born?.v ?? 0);
  const aimed = React.useRef({ y: Number.NaN, h: Number.NaN });
  const shownPpm = React.useRef(ppm);
  const shownDay = React.useRef(geo.day);
  const suppressClick = React.useRef(false);
  const unfollow = React.useRef<(() => void) | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [held, setHeld] = React.useState(false);
  const [settle, setSettle] = React.useState(0);
  const focusInput = React.useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const run = (key: string, c: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, c);
  };

  // Where the data says it is. A drop sets the release speed first, so the
  // block lands on its slot carrying the throw; a density change glides. A
  // landing already on its way to the same place is left to finish, so the
  // second pass (after the host answers) does not start it over from rest.
  React.useEffect(() => {
    if (grip.current?.active) return;
    const scaled = shownPpm.current !== ppm;
    shownPpm.current = ppm;
    const v = throwV.current;
    throwV.current = 0;
    const t = !motionSafe
      ? { duration: 0 }
      : scaled
        ? springs.glide
        : { ...springs.snap, velocity: v };
    const send = (
      key: "y" | "h",
      value: typeof y,
      to: number,
      transition: object,
    ) => {
      if (Math.abs(value.get() - to) <= 0.25) return;
      if (aimed.current[key] === to && anims.current.has(key)) return;
      aimed.current[key] = to;
      anims.current.get(key)?.stop();
      anims.current.set(
        key,
        animate(value, to, {
          ...transition,
          onComplete: () => {
            anims.current.delete(key);
            aimed.current[key] = Number.NaN;
          },
        }),
      );
    };
    send("y", y, targetY, t);
    send(
      "h",
      h,
      targetH,
      motionSafe ? (scaled ? springs.glide : springs.snap) : { duration: 0 },
    );
    if (!anims.current.has("dx") && Math.abs(dx.get()) > 0.5) {
      anims.current.set(
        "dx",
        animate(dx, 0, {
          ...(motionSafe ? springs.snap : { duration: 0 }),
          onComplete: () => anims.current.delete("dx"),
        }),
      );
    }
  }, [targetY, targetH, ppm, settle, motionSafe, y, h, dx]);

  // The overlap columns re-divide on glide.
  React.useEffect(() => {
    if (grip.current?.active) return;
    const t = motionSafe ? springs.glide : { duration: 0 };
    anims.current.get("a")?.stop();
    anims.current.get("w")?.stop();
    anims.current.set("a", animate(a, slot.a, t));
    anims.current.set("w", animate(w, slot.w, t));
  }, [slot.a, slot.w, motionSafe, a, w]);

  // A new day moves the block a whole column at once; the difference is
  // carried in dx and glides out, so the block travels instead of jumping.
  React.useLayoutEffect(() => {
    const from = shownDay.current;
    if (from === geo.day) return;
    shownDay.current = geo.day;
    const f = frame();
    if (!f || f.cols < 2) {
      dx.set(0);
      return;
    }
    dx.set(r2(dx.get() - (geo.day - from) * f.colW));
    anims.current.get("dx")?.stop();
    anims.current.set(
      "dx",
      animate(dx, 0, {
        ...(motionSafe ? springs.snap : { duration: 0 }),
        onComplete: () => anims.current.delete("dx"),
      }),
    );
  }, [geo.day, frame, motionSafe, dx]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      const g = grip.current;
      if (g) {
        window.clearTimeout(g.timer);
        g.detach?.();
      }
      unfollow.current?.();
    };
  }, []);

  const dur = geo.end - geo.start;

  const update = (p: Pt) => {
    const g = grip.current;
    const f = frame();
    if (!g || !f || g.cancelled) return;
    const span = (h1 - h0) * 60 * ppm;
    const yIn = p.y - f.top;
    let landing: Geo;
    if (g.mode === "move") {
      const px = yIn - g.grab;
      y.set(r2(rubberClamp(px, 0, span - g.baseH, 120)));
      const ddx = f.cols > 1 ? p.x - g.startX : 0;
      dx.set(r2(ddx));
      const start = clamp(
        Math.round((px / ppm + top0) / snap) * snap,
        top0,
        h1 * 60 - dur,
      );
      const day =
        f.cols > 1 ? clamp(g.day + Math.round(ddx / f.colW), 0, 6) : g.day;
      landing = { day, start, end: start + dur };
    } else if (g.mode === "bottom") {
      const px = yIn - g.grab;
      const bottom = rubberClamp(px, g.baseY + snap * ppm, span, 80);
      h.set(r2(Math.max(6, bottom - g.baseY)));
      const end = clamp(
        Math.round((px / ppm + top0) / snap) * snap,
        geo.start + snap,
        h1 * 60,
      );
      landing = { day: g.day, start: geo.start, end };
    } else {
      const px = yIn - g.grab;
      const bottom = g.baseY + g.baseH;
      const topPx = rubberClamp(px, 0, bottom - snap * ppm, 80);
      y.set(r2(topPx));
      h.set(r2(Math.max(6, bottom - topPx)));
      const start = clamp(
        Math.round((px / ppm + top0) / snap) * snap,
        top0,
        geo.end - snap,
      );
      landing = { day: g.day, start, end: geo.end };
    }
    const was = g.landing;
    if (
      was.day !== landing.day ||
      was.start !== landing.start ||
      was.end !== landing.end
    ) {
      g.landing = landing;
      const at = g.mode === "bottom" ? landing.end : landing.start;
      audio.play("tick", {
        pitch: r2(0.8 + (0.6 * (at - top0)) / ((h1 - h0) * 60)),
        gain: 0.32,
        pan: panFrom(p.x, null),
      });
      onPreview(id, landing);
    }
  };

  const release = () => {
    const g = grip.current;
    if (!g) return;
    window.clearTimeout(g.timer);
    g.detach?.();
    g.detach = null;
    lockTouch(false);
    setHeld(false);
    run("lift", animate(lift, 0, motionSafe ? springs.flick : { duration: 0 }));
  };

  const cancel = () => {
    const g = grip.current;
    if (!g || g.cancelled) return;
    g.cancelled = true;
    release();
    onPreview(id, null);
    onDragEnd();
    g.active = false;
    setSettle((n) => n + 1);
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || editing !== null,
    onStart: () => {
      const g = grip.current;
      if (!g || !g.armed) {
        if (g) g.cancelled = true;
        return;
      }
      g.active = true;
      suppressClick.current = true;
      for (const key of ["y", "h", "dx"]) {
        anims.current.get(key)?.stop();
        anims.current.delete(key);
      }
      aimed.current = { y: Number.NaN, h: Number.NaN };
      lockTouch(true);
      setHeld(true);
      if (motionSafe) run("lift", animate(lift, 1, springs.flick));
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        cancel();
      };
      window.addEventListener("keydown", onKeyDown, true);
      g.detach = () => window.removeEventListener("keydown", onKeyDown, true);
    },
    onMove: ({ point }) => {
      const g = grip.current;
      if (!g || g.cancelled || !g.active) return;
      update(point);
      onDragMove(point, update);
    },
    onEnd: ({ velocity }) => {
      const g = grip.current;
      if (!g || g.cancelled || !g.active) {
        if (g) release();
        return;
      }
      g.active = false;
      release();
      onDragEnd();
      const l = g.landing;
      throwV.current = g.mode === "bottom" ? 0 : r2(velocity.y);
      if (l.day !== geo.day || l.start !== geo.start || l.end !== geo.end) {
        audio.play("thock", { pitch: 1, gain: 0.6, pan: 0 });
        onDrop(id, l);
      } else {
        onPreview(id, null);
      }
      // After the host has answered, the block goes wherever the data says.
      React.startTransition(() => setSettle((n) => n + 1));
    },
    onCancel: () => {
      const g = grip.current;
      if (g?.active) cancel();
      else release();
    },
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (disabled || editing !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-no-drag]")) return;
    const edge = target?.closest("[data-edge]")?.getAttribute("data-edge");
    const mode: Grip["mode"] =
      edge === "top" ? "top" : edge === "bottom" ? "bottom" : "move";
    const f = frame();
    const yIn = f ? e.clientY - f.top : 0;
    const old = grip.current;
    if (old) window.clearTimeout(old.timer);
    const touch = e.pointerType === "touch";
    const g: Grip = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      grab: mode === "bottom" ? yIn - (y.get() + h.get()) : yIn - y.get(),
      baseY: y.get(),
      baseH: h.get(),
      day: geo.day,
      armed: !touch,
      touch,
      timer: 0,
      active: false,
      cancelled: false,
      landing: { ...geo },
      detach: null,
    };
    if (touch) {
      // A resting finger picks the event up; one that moves first scrolls.
      g.timer = window.setTimeout(() => {
        if (grip.current !== g || g.cancelled) return;
        g.armed = true;
        lockTouch(true);
        setHeld(true);
        if (motionSafe) run("lift", animate(lift, 1, springs.flick));
      }, HOLD_MS);
    }
    grip.current = g;
    unfollow.current?.();
    unfollow.current = follow(e.currentTarget, e.pointerId, {
      move: onPointerMove,
      up: onPointerUp,
      cancel: drag.onPointerCancel,
    });
    drag.onPointerDown(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grip.current;
    if (g && g.touch && !g.armed && !g.cancelled) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 8) {
        window.clearTimeout(g.timer);
        g.cancelled = true;
      }
    }
    drag.onPointerMove(e);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grip.current;
    if (g && !g.active) {
      window.clearTimeout(g.timer);
      if (g.touch && g.armed) {
        // Held and let go without moving: the event is chosen, not opened.
        lockTouch(false);
        setHeld(false);
        run(
          "lift",
          animate(lift, 0, motionSafe ? springs.flick : { duration: 0 }),
        );
      }
    }
    drag.onPointerUp(e);
  };

  const left = useTransform(
    a,
    (v) => `calc((var(--wp-i) + ${r4(v)}) * 100% / var(--wp-n) + 1px)`,
  );
  const width = useTransform(
    w,
    (v) => `calc(${r4(v)} * 100% / var(--wp-n) - 3px)`,
  );
  const scale = useTransform(lift, (l) => r2(1 + 0.02 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(6 * l)}px ${r2(16 * l)}px color-mix(in oklab, black ${Math.round(22 * l)}%, transparent)`,
  );
  const shownH = Math.max(10, (geo.end - geo.start) * ppm);
  const edge = `color-mix(in oklab, ${tint} ${selected ? 70 : 40}%, transparent)`;
  const tiny = shownH < 22;
  const roomy = shownH >= 38;
  const tall = shownH >= 58;

  return (
    <motion.div
      ref={rootRef}
      data-week-event={id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/week-planner-event pointer-events-auto absolute top-0 touch-pan-y select-none [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
        inFocus ? "block" : "hidden @min-[40rem]:block",
        held ? "z-30" : selected ? "z-20" : "z-10",
      )}
      style={
        {
          "--wp-day": geo.day,
          left,
          width,
          y,
          x: dx,
          height: h,
          scale,
          boxShadow: shadow,
        } as unknown as React.ComponentProps<typeof motion.div>["style"]
      }
    >
      <div
        className={cn(
          "relative h-full overflow-clip rounded-2 border border-l-[3px] transition-opacity",
          past && !selected && !held ? "opacity-70" : "opacity-100",
        )}
        style={{
          background: `color-mix(in oklab, ${tint} ${selected || held ? 26 : 16}%, var(--card))`,
          borderTopColor: edge,
          borderRightColor: edge,
          borderBottomColor: edge,
          borderLeftColor: tint,
        }}
      >
        <button
          ref={bind}
          type="button"
          disabled={disabled}
          aria-label={name}
          aria-describedby={hintId}
          aria-pressed={selected}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onSelect(id);
          }}
          onDoubleClick={() => onRename(id)}
          onKeyDown={(e) => onKey(e, id)}
          className={cn(
            "absolute inset-0 rounded-[inherit]",
            disabled
              ? "cursor-not-allowed"
              : held
                ? "cursor-grabbing"
                : "cursor-grab",
            RING_IN,
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none relative flex flex-col px-1.5",
            tiny ? "justify-center py-0" : "pt-1",
          )}
          style={tiny ? { height: Math.max(8, shownH - 2) } : undefined}
        >
          {editing === null ? (
            <span
              className={cn(
                "font-medium text-foreground",
                tiny
                  ? "truncate text-[10px] leading-[10px]"
                  : roomy
                    ? "line-clamp-2 text-xs leading-4"
                    : "truncate text-[11px] leading-4",
              )}
            >
              {event.title}
            </span>
          ) : null}
          {roomy ? (
            <span className="truncate font-mono text-[10px] leading-4 text-ink-2 tabular-nums">
              {hhmm(geo.start)}–{hhmm(geo.end)}
            </span>
          ) : null}
          {tall && event.location ? (
            <span className="flex items-center gap-1 truncate text-[10px] leading-4 text-ink-3">
              <MapPin className="size-2.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          ) : null}
        </span>
        <span
          data-edge="top"
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        />
        <span
          data-edge="bottom"
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center pb-0.5"
        >
          <span className="h-0.5 w-5 rounded-full bg-foreground/30 opacity-0 transition-opacity group-hover/week-planner-event:opacity-100" />
        </span>
        {editing === null && !tiny ? (
          <button
            type="button"
            data-no-drag=""
            tabIndex={-1}
            disabled={disabled}
            aria-label={`Delete ${event.title}`}
            onClick={() => onDelete(id)}
            className={cn(
              "absolute top-0.5 right-0.5 hidden size-5 items-center justify-center rounded-1 bg-card/80 text-ink-2 hover:text-foreground @min-[40rem]:flex",
              "opacity-0 transition-opacity group-hover/week-planner-event:opacity-100",
              RING_IN,
            )}
          >
            <X aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
      {editing !== null ? (
        <input
          ref={focusInput}
          data-no-drag=""
          aria-label="Event title"
          value={editing}
          onChange={(e) => onDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEditDone(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onEditDone(false);
            }
          }}
          onBlur={() => onEditDone(true)}
          className={cn(
            "absolute inset-x-0 top-0 z-10 h-7 rounded-2 border border-cobalt-bright bg-card px-1.5 text-[12px] font-medium text-foreground shadow-[0_4px_12px_color-mix(in_oklab,black_14%,transparent)]",
            RING_IN,
          )}
        />
      ) : null}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The details panel (1200)                                             */
/* ------------------------------------------------------------------ */

function Details({
  event,
  calendars,
  when,
  minutes,
  snap,
  disabled,
  onTitle,
  onCalendar,
  onDuration,
  onDelete,
  onClose,
}: {
  event: WeekEvent;
  calendars: WeekCalendar[];
  when: string;
  minutes: number;
  snap: number;
  disabled: boolean;
  onTitle: (title: string) => void;
  onCalendar: (id: string) => void;
  onDuration: (delta: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(event.title);
  const uid = React.useId();
  const calRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const current = event.calendar ?? calendars[0]?.id;
  const save = () => {
    const t = draft.trim();
    if (t && t !== event.title) onTitle(t);
    else setDraft(event.title);
  };
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Event
        </p>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className={TOOL}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-title`} className="text-xs text-ink-3">
          Title
        </label>
        <input
          id={`${uid}-title`}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape" && draft !== event.title) {
              e.preventDefault();
              setDraft(event.title);
            }
          }}
          className={cn(
            "h-9 rounded-2 border border-hairline-strong bg-card px-2.5 text-sm text-foreground",
            RING_IN,
          )}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-ink-3">When</p>
        <p className="text-[13px] text-foreground tabular-nums">{when}</p>
        {event.location ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            {event.location}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p id={`${uid}-dur`} className="text-xs text-ink-3">
          Duration
        </p>
        <div
          role="group"
          aria-labelledby={`${uid}-dur`}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label={`${snap} minutes shorter`}
            disabled={disabled || minutes <= snap}
            onClick={() => onDuration(-snap)}
            className={cn(TOOL, "border border-hairline")}
          >
            <Minus aria-hidden className="size-3.5" />
          </button>
          <span className="w-16 text-center font-mono text-xs text-foreground tabular-nums">
            {span(minutes)}
          </span>
          <button
            type="button"
            aria-label={`${snap} minutes longer`}
            disabled={disabled}
            onClick={() => onDuration(snap)}
            className={cn(TOOL, "border border-hairline")}
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p id={`${uid}-cal`} className="text-xs text-ink-3">
          Calendar
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-cal`}
          className="flex flex-wrap gap-1.5"
          onKeyDown={(e) => {
            const i = calendars.findIndex((c) => c.id === current);
            const d =
              e.key === "ArrowRight" || e.key === "ArrowDown"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? -1
                  : 0;
            if (!d || i === -1) return;
            e.preventDefault();
            const next =
              calendars[(i + d + calendars.length) % calendars.length];
            if (!next) return;
            onCalendar(next.id);
            calRefs.current.get(next.id)?.focus();
          }}
        >
          {calendars.map((c) => {
            const on = c.id === current;
            return (
              <button
                key={c.id}
                ref={(node) => {
                  if (node) calRefs.current.set(c.id, node);
                  else calRefs.current.delete(c.id);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => onCalendar(c.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                  on
                    ? "border-transparent bg-surface-2 font-medium text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2",
                  RING,
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: c.tint }}
                />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-2 border border-hairline px-3 text-xs text-danger transition-colors hover:bg-surface-2",
          RING,
        )}
      >
        <Trash2 aria-hidden className="size-3.5" />
        Delete event
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The planner                                                          */
/* ------------------------------------------------------------------ */

type Editing = { id: string; draft: string; isNew: boolean };
type Press = {
  x: number;
  y: number;
  armed: boolean;
  touch: boolean;
  timer: number;
  ignored: boolean;
};
type Making = { day: number; anchor: number; last: Geo; cancelled: boolean };

/**
 * A week drawn on its hours. Press empty time and drag, and a block
 * rubber-bands out of the slot you pressed: its far edge follows the
 * pointer 1:1, a snapped line and a live time label show where it will
 * land, and every new slot ticks. Let go and the edge springs onto the
 * snapped time on snap, the event thocks down, and its title is ready to
 * type. Events drag across time and days and stretch from either edge the
 * same way — 1:1 under the pointer, a dashed placeholder at the landing,
 * the others re-dividing their columns on glide — and land on snap with the
 * release velocity. A now line moves through today on drift.
 *
 * The grid is one tab stop with a slot cursor: arrows move it a snap step or
 * a day, Shift stretches a range, Enter creates an event over it. Events are
 * tab stops of their own: arrows move them, Shift changes their end, Enter
 * renames, Delete removes, Escape hands back to the grid. On a phone the
 * planner shows one day with a strip to pick it; touches hold a moment
 * before they draw, so a swipe still scrolls. Under reduced motion drags
 * still follow the pointer but every landing, glide and slide is instant;
 * the times, labels and placeholder still show.
 */
export function WeekPlanner({
  snap = 15,
  density = "cozy",
  now = defaultWeekPlannerNow,
  events,
  defaultEvents,
  onEventsChange,
  calendars = defaultWeekCalendars,
  day,
  defaultDay,
  onDayChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  today,
  hours = [7, 21],
  workHours = [9, 18],
  weekStartsOn = 1,
  zoneOffset = 0,
  defaultDuration = 30,
  newTitle = "New event",
  defaultCalendar,
  onCreate,
  onUpdate,
  onDelete,
  label = "Week",
  status = "ready",
  onRetry,
  sound = false,
  disabled = false,
  className,
}: WeekPlannerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const gridHintId = `${uid}-grid-hint`;
  const off = zoneOffset;
  const step = clamp(Math.round(snap), 1, 120);
  const hourPx = HOUR_PX[density] ?? HOUR_PX.cozy;
  const ppm = hourPx / 60;
  const h0 = clamp(Math.floor(hours[0]), 0, 23);
  const h1 = clamp(Math.ceil(hours[1]), h0 + 1, 24);
  const gridH = (h1 - h0) * hourPx;
  const top0 = h0 * 60;

  const nowIsHour = typeof now === "number" && now >= 0 && now <= 24;
  const todayStart = midnight(
    today !== undefined
      ? toMs(today)
      : nowIsHour
        ? defaultWeekPlannerToday
        : toMs(now),
    off,
  );
  const nowMs =
    Math.round(
      (nowIsHour ? todayStart + (now as number) * 60 * MIN : toMs(now)) / MIN,
    ) * MIN;
  const nowMin = minuteOf(nowMs, off);

  const [ownEvents, setOwnEvents] = React.useState<WeekEvent[]>(
    () => defaultEvents ?? defaultWeekEvents,
  );
  const list = events ?? ownEvents;
  const [ownDay, setOwnDay] = React.useState(() =>
    midnight(defaultDay !== undefined ? toMs(defaultDay) : todayStart, off),
  );
  const focusDay = midnight(day !== undefined ? toMs(day) : ownDay, off);
  const [ownSel, setOwnSel] = React.useState<string | null>(defaultSelected);
  const selId = selected !== undefined ? selected : ownSel;

  const wd = partsOf(focusDay, off).wd;
  const weekStart = focusDay - ((wd - weekStartsOn + 7) % 7) * DAY;
  const focusIdx = Math.round((focusDay - weekStart) / DAY);
  const days = Array.from({ length: 7 }, (_, i) => weekStart + i * DAY);
  const nowIdx = Math.round((midnight(nowMs, off) - weekStart) / DAY);
  const todayIdx = Math.round((todayStart - weekStart) / DAY);

  const [preview, setPreview] = React.useState<{ id: string; geo: Geo } | null>(
    null,
  );
  const [ghost, setGhost] = React.useState<(Geo & { down: boolean }) | null>(
    null,
  );
  const [cursorMin, setCursorMin] = React.useState(() =>
    clamp(
      Math.floor(
        (nowIdx >= 0 && nowIdx < 7 && nowMin >= top0 && nowMin < h1 * 60
          ? nowMin
          : workHours[0] * 60) / step,
      ) * step,
      top0,
      h1 * 60 - step,
    ),
  );
  const [anchor, setAnchor] = React.useState<number | null>(null);
  const [gridFocused, setGridFocused] = React.useState(false);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [born, setBorn] = React.useState<({ id: string } & Born) | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [narrow, setNarrow] = React.useState(false);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [shownWeek, setShownWeek] = React.useState(weekStart);
  const [shownDay, setShownDay] = React.useState(focusDay);
  const [dir, setDir] = React.useState(1);
  if (weekStart !== shownWeek || focusDay !== shownDay) {
    setDir(
      narrow
        ? focusDay >= shownDay
          ? 1
          : -1
        : weekStart >= shownWeek
          ? 1
          : -1,
    );
    setShownWeek(weekStart);
    setShownDay(focusDay);
  }

  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const headRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const editingRef = React.useRef<Editing | null>(null);
  const focusNext = React.useRef<string | null>(null);
  const seq = React.useRef(0);
  const touchLock = React.useRef(false);
  const press = React.useRef<Press | null>(null);
  const making = React.useRef<Making | null>(null);
  const makeDetach = React.useRef<(() => void) | null>(null);
  const unfollowGrid = React.useRef<(() => void) | null>(null);
  const auto = React.useRef<{
    raf: number;
    point: Pt;
    update: (p: Pt) => void;
  } | null>(null);
  const ghostY = useMotionValue(0);
  const ghostH = useMotionValue(0);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ geometry ----------------------------- */

  const geoOf = (e: WeekEvent): Geo | null => {
    const idx = Math.round((midnight(e.start, off) - weekStart) / DAY);
    if (idx < 0 || idx > 6) return null;
    const s = minuteOf(e.start, off);
    const en = s + Math.round((e.end - e.start) / MIN);
    const cs = clamp(s, top0, h1 * 60);
    const ce = clamp(en, top0, h1 * 60);
    if (ce - cs <= 0) return null;
    return { day: idx, start: cs, end: ce };
  };

  const inWeek = list
    .map((e) => ({ e, g: geoOf(e) }))
    .filter((x): x is { e: WeekEvent; g: Geo } => x.g !== null)
    .sort((x, y) => x.g.day - y.g.day || x.g.start - y.g.start);

  const packWith = (override: { id: string; geo: Geo } | null) => {
    const byDay = new Map<
      number,
      { id: string; start: number; end: number }[]
    >();
    for (const { e, g } of inWeek) {
      const geo = override && override.id === e.id ? override.geo : g;
      const bucket = byDay.get(geo.day) ?? [];
      bucket.push({ id: e.id, start: geo.start, end: geo.end });
      byDay.set(geo.day, bucket);
    }
    const out = new Map<string, Slot>();
    for (const bucket of byDay.values()) {
      for (const [k, v] of pack(bucket)) out.set(k, v);
    }
    return out;
  };
  const slots = packWith(preview);
  const resting = preview ? packWith(null) : slots;

  const calOf = (id?: string) =>
    calendars.find((c) => c.id === id) ?? calendars[0];
  const tintOf = (e: WeekEvent) =>
    calOf(e.calendar)?.tint ?? "var(--accent-bright)";
  const instant = (dayIdx: number, min: number) =>
    weekStart + dayIdx * DAY + min * MIN;
  const dayName = (dayIdx: number, long = true) => {
    const p = partsOf(weekStart + dayIdx * DAY, off);
    return long
      ? `${WD_LONG[p.wd] ?? ""} ${p.date} ${MO_LONG[p.month] ?? ""}`
      : `${WD_SHORT[p.wd] ?? ""} ${p.date} ${MO_SHORT[p.month] ?? ""}`;
  };
  const describe = (e: WeekEvent, g: Geo) =>
    `${e.title}, ${dayName(g.day)}, ${hhmm(g.start)} to ${hhmm(g.end)}${
      calOf(e.calendar) ? `, ${calOf(e.calendar)?.label}` : ""
    }`;

  const frame = React.useCallback((): Frame | null => {
    const area = areaRef.current;
    if (!area) return null;
    const r = area.getBoundingClientRect();
    const cols =
      Number(getComputedStyle(area).getPropertyValue("--wp-n").trim()) || 7;
    return { left: r.left, top: r.top, colW: r.width / cols, cols };
  }, []);

  /* ------------------------------- commits ----------------------------- */

  const commitEvents = (next: WeekEvent[]) => {
    if (events === undefined) setOwnEvents(next);
    onEventsChange?.(next);
  };
  const commitDay = (ms: number) => {
    const d = midnight(ms, off);
    if (d === focusDay) return;
    if (day === undefined) setOwnDay(d);
    onDayChange?.(d);
  };
  const commitSel = (id: string | null) => {
    if (id === selId) return;
    if (selected === undefined) setOwnSel(id);
    onSelectedChange?.(id);
  };

  const thock = (x?: number) =>
    audio.play("thock", {
      pitch: 1,
      gain: 0.6,
      pan: x === undefined ? 0 : panFrom(x, null),
    });
  const tick = (min: number) =>
    audio.play("tick", {
      pitch: r2(0.8 + (0.6 * (min - top0)) / ((h1 - h0) * 60)),
      gain: 0.3,
    });

  const update = (id: string, patch: Partial<WeekEvent>) => {
    const prev = list.find((e) => e.id === id);
    if (!prev) return null;
    const next = { ...prev, ...patch };
    commitEvents(list.map((e) => (e.id === id ? next : e)));
    onUpdate?.(next, prev);
    return next;
  };

  const create = (dayIdx: number, s: number, e: number, from?: Born) => {
    seq.current += 1;
    const id = `${safeId}-n${seq.current}`;
    const made: WeekEvent = {
      id,
      title: newTitle,
      start: instant(dayIdx, s),
      end: instant(dayIdx, e),
      calendar: defaultCalendar ?? calendars[0]?.id,
    };
    commitEvents([...list, made]);
    onCreate?.(made);
    if (selected === undefined) setOwnSel(id);
    onSelectedChange?.(id);
    setBorn(from ? { id, ...from } : null);
    const ed = { id, draft: newTitle, isNew: true };
    editingRef.current = ed;
    setEditing(ed);
    setAnchor(null);
    thock();
    say(
      `Created ${newTitle}, ${dayName(dayIdx)}, ${hhmm(s)} to ${hhmm(e)}. Type a title, Enter to keep it.`,
    );
  };

  const remove = (id: string, toGrid: boolean) => {
    const gone = list.find((e) => e.id === id);
    if (!gone) return;
    const g = geoOf(gone);
    commitEvents(list.filter((e) => e.id !== id));
    onDelete?.(gone);
    if (selId === id) commitSel(null);
    if (editingRef.current?.id === id) {
      editingRef.current = null;
      setEditing(null);
    }
    say(`Deleted ${gone.title}.`);
    if (toGrid && g) {
      setCursorMin(clamp(g.start, top0, h1 * 60 - step));
      gridRef.current?.focus();
    }
  };

  const finishEdit = (commit: boolean) => {
    const ed = editingRef.current;
    if (!ed) return;
    editingRef.current = null;
    setEditing(null);
    const target = list.find((e) => e.id === ed.id);
    if (!target) return;
    const title = ed.draft.trim();
    if (!commit && ed.isNew) {
      remove(ed.id, true);
      return;
    }
    if (commit && title && title !== target.title) {
      update(ed.id, { title });
      say(`Renamed to ${title}.`);
    }
    focusNext.current = ed.id;
    buttons.current.get(ed.id)?.focus();
  };

  const startEdit = (id: string) => {
    const target = list.find((e) => e.id === id);
    if (!target || disabled) return;
    const ed = { id, draft: target.title, isNew: false };
    editingRef.current = ed;
    setEditing(ed);
    commitSel(id);
  };

  /* ------------------------------ auto-scroll -------------------------- */

  const stopAuto = () => {
    const a = auto.current;
    if (a?.raf) cancelAnimationFrame(a.raf);
    auto.current = null;
  };
  const autoScroll = (point: Pt, apply: (p: Pt) => void) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const a = auto.current ?? { raf: 0, point, update: apply };
    a.point = point;
    a.update = apply;
    auto.current = a;
    const speedAt = (p: Pt) => {
      const r = sc.getBoundingClientRect();
      const top = r.top + (headRef.current?.offsetHeight ?? 0);
      const edge = 28;
      if (p.y < top + edge) return -Math.min(14, (top + edge - p.y) * 0.4);
      if (p.y > r.bottom - edge)
        return Math.min(14, (p.y - (r.bottom - edge)) * 0.4);
      return 0;
    };
    if (!speedAt(point) || a.raf) return;
    const tickScroll = () => {
      const cur = auto.current;
      if (!cur) return;
      const v = speedAt(cur.point);
      if (!v) {
        cur.raf = 0;
        return;
      }
      sc.scrollTop += v;
      cur.update(cur.point);
      cur.raf = requestAnimationFrame(tickScroll);
    };
    a.raf = requestAnimationFrame(tickScroll);
  };

  /* --------------------------- drawing to create ----------------------- */

  const dayAt = (x: number, f: Frame) =>
    f.cols > 1 ? clamp(Math.floor((x - f.left) / f.colW), 0, 6) : focusIdx;

  const drawTo = (p: Pt) => {
    const m = making.current;
    const f = frame();
    if (!m || m.cancelled || !f) return;
    const spanPx = (h1 - h0) * 60 * ppm;
    const rawPx = p.y - f.top;
    const live = rubberClamp(rawPx, 0, spanPx, 120);
    const anchorPx = (m.anchor - top0) * ppm;
    const rawMin = rawPx / ppm + top0;
    let top: number;
    let height: number;
    let g: Geo;
    if (rawMin >= m.anchor) {
      top = anchorPx;
      height = Math.max(step * ppm * 0.5, live - anchorPx);
      const e = clamp(
        Math.round(rawMin / step) * step,
        m.anchor + step,
        h1 * 60,
      );
      g = { day: m.day, start: m.anchor, end: e };
    } else {
      top = live;
      height = anchorPx + step * ppm - live;
      const s = clamp(Math.round(rawMin / step) * step, top0, m.anchor);
      g = { day: m.day, start: s, end: m.anchor + step };
    }
    ghostY.set(r2(top));
    ghostH.set(r2(Math.max(6, height)));
    if (g.start !== m.last.start || g.end !== m.last.end) {
      m.last = g;
      setGhost({ ...g, down: rawMin >= m.anchor });
      tick(rawMin >= m.anchor ? g.end : g.start);
    }
  };

  const endMaking = () => {
    makeDetach.current?.();
    makeDetach.current = null;
    stopAuto();
    touchLock.current = false;
  };

  const gridDrag = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: ({ point }) => {
      const pr = press.current;
      const f = frame();
      if (!pr || !pr.armed || pr.ignored || !f) {
        if (pr) pr.ignored = true;
        return;
      }
      const startMin = (pr.y - f.top) / ppm + top0;
      const anchorMin = clamp(
        Math.floor(startMin / step) * step,
        top0,
        h1 * 60 - step,
      );
      const d = dayAt(pr.x, f);
      making.current = {
        day: d,
        anchor: anchorMin,
        last: { day: d, start: anchorMin, end: anchorMin + step },
        cancelled: false,
      };
      touchLock.current = true;
      ghostY.set(r2((anchorMin - top0) * ppm));
      ghostH.set(r2(step * ppm));
      setGhost({ day: d, start: anchorMin, end: anchorMin + step, down: true });
      setAnchor(null);
      tick(anchorMin);
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        const m = making.current;
        if (m) m.cancelled = true;
        setGhost(null);
        endMaking();
        say("Cancelled.");
      };
      window.addEventListener("keydown", onKeyDown, true);
      makeDetach.current = () =>
        window.removeEventListener("keydown", onKeyDown, true);
      drawTo(point);
    },
    onMove: ({ point }) => {
      const m = making.current;
      if (!m || m.cancelled) return;
      drawTo(point);
      autoScroll(point, drawTo);
    },
    onEnd: ({ velocity }) => {
      const m = making.current;
      making.current = null;
      endMaking();
      if (!m || m.cancelled) return;
      setGhost(null);
      create(m.last.day, m.last.start, m.last.end, {
        y: ghostY.get(),
        h: ghostH.get(),
        v: r2(velocity.y),
      });
    },
    onCancel: () => {
      making.current = null;
      setGhost(null);
      endMaking();
    },
    onTap: (event) => {
      const pr = press.current;
      const f = frame();
      if (!f || !pr) return;
      const min = clamp(
        Math.floor(((event.clientY - f.top) / ppm + top0) / step) * step,
        top0,
        h1 * 60 - step,
      );
      const d = dayAt(event.clientX, f);
      if (editingRef.current) finishEdit(true);
      commitSel(null);
      setAnchor(null);
      setCursorMin(min);
      commitDay(weekStart + d * DAY);
      gridRef.current?.focus({ preventScroll: true });
    },
  });

  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || status !== "ready") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const old = press.current;
    if (old) window.clearTimeout(old.timer);
    const touch = e.pointerType === "touch";
    const pr: Press = {
      x: e.clientX,
      y: e.clientY,
      armed: !touch,
      touch,
      timer: 0,
      ignored: false,
    };
    if (touch) {
      pr.timer = window.setTimeout(() => {
        if (press.current !== pr || pr.ignored) return;
        pr.armed = true;
        touchLock.current = true;
        tick(top0);
      }, HOLD_MS);
    }
    press.current = pr;
    unfollowGrid.current?.();
    unfollowGrid.current = follow(e.currentTarget, e.pointerId, {
      move: (ev) => onGridPointerMove(ev),
      up: (ev) => onGridPointerUp(ev),
      cancel: gridDrag.onPointerCancel,
    });
    gridDrag.onPointerDown(e);
  };
  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (pr && pr.touch && !pr.armed && !pr.ignored) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 8) {
        window.clearTimeout(pr.timer);
        pr.ignored = true;
      }
    }
    gridDrag.onPointerMove(e);
  };
  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (pr) window.clearTimeout(pr.timer);
    if (!making.current) touchLock.current = false;
    gridDrag.onPointerUp(e);
  };

  /* ------------------------------- keyboard ---------------------------- */

  const cursorSay = (min: number, a: number | null, dayIdx = focusIdx) => {
    if (a === null) {
      say(`${dayName(dayIdx)}, ${hhmm(min)}`);
      return;
    }
    const s = Math.min(a, min);
    const e = Math.max(a, min) + step;
    say(`${hhmm(s)} to ${hhmm(e)} selected`);
  };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.altKey || e.metaKey || e.ctrlKey) return;
    const lo = top0;
    const hi = h1 * 60 - step;
    const moveBy = (delta: number) => {
      e.preventDefault();
      const next = clamp(cursorMin + delta, lo, hi);
      const a = e.shiftKey ? (anchor ?? cursorMin) : null;
      setAnchor(a);
      setCursorMin(next);
      tick(next);
      cursorSay(next, a);
    };
    switch (e.key) {
      case "ArrowUp":
        moveBy(-step);
        return;
      case "ArrowDown":
        moveBy(step);
        return;
      case "PageUp":
        moveBy(-60);
        return;
      case "PageDown":
        moveBy(60);
        return;
      case "Home":
        moveBy(lo - cursorMin);
        return;
      case "End":
        moveBy(hi - cursorMin);
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault();
        const d = e.key === "ArrowRight" ? 1 : -1;
        setAnchor(null);
        commitDay(focusDay + d * DAY);
        tick(cursorMin);
        const p = partsOf(focusDay + d * DAY, off);
        say(
          `${WD_LONG[p.wd] ?? ""} ${p.date} ${MO_LONG[p.month] ?? ""}, ${hhmm(cursorMin)}`,
        );
        return;
      }
      case "t": {
        e.preventDefault();
        commitDay(todayStart);
        const m = clamp(Math.floor(nowMin / step) * step, lo, hi);
        setCursorMin(m);
        setAnchor(null);
        say(`Today, ${hhmm(m)}`);
        return;
      }
      case "Enter":
      case "n": {
        e.preventDefault();
        if (anchor !== null) {
          create(
            focusIdx,
            Math.min(anchor, cursorMin),
            Math.max(anchor, cursorMin) + step,
          );
        } else {
          create(
            focusIdx,
            cursorMin,
            clamp(
              cursorMin + Math.max(step, defaultDuration),
              cursorMin + step,
              h1 * 60,
            ),
          );
        }
        return;
      }
      case "Escape":
        if (anchor !== null) {
          e.preventDefault();
          setAnchor(null);
          say("Range cleared.");
        }
        return;
    }
  };

  const onEventKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled) return;
    const target = list.find((x) => x.id === id);
    const g = target ? geoOf(target) : null;
    if (!target || !g) return;
    const dur = g.end - g.start;
    const land = (patch: Partial<WeekEvent>, text: string) => {
      const next = update(id, patch);
      if (!next) return;
      commitSel(id);
      thock();
      say(text);
    };
    switch (e.key) {
      case "ArrowUp":
      case "ArrowDown": {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? step : -step;
        if (e.shiftKey) {
          const end = clamp(g.end + d, g.start + step, h1 * 60);
          if (end === g.end) return;
          land(
            { end: instant(g.day, end) },
            `${target.title} ends ${hhmm(end)}, ${span(end - g.start)}.`,
          );
        } else {
          const start = clamp(g.start + d, top0, h1 * 60 - dur);
          if (start === g.start) return;
          land(
            { start: instant(g.day, start), end: instant(g.day, start + dur) },
            `${target.title}, ${hhmm(start)} to ${hhmm(start + dur)}.`,
          );
        }
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault();
        const d = e.key === "ArrowRight" ? 1 : -1;
        focusNext.current = id;
        const moved = {
          start: target.start + d * DAY,
          end: target.end + d * DAY,
        };
        land(
          moved,
          `${target.title} moved to ${(() => {
            const p = partsOf(moved.start, off);
            return `${WD_LONG[p.wd] ?? ""} ${p.date} ${MO_LONG[p.month] ?? ""}`;
          })()}.`,
        );
        commitDay(moved.start);
        return;
      }
      case "Enter":
      case "F2":
        e.preventDefault();
        startEdit(id);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        remove(id, true);
        return;
      case "Escape":
        e.preventDefault();
        commitSel(null);
        setCursorMin(clamp(g.start, top0, h1 * 60 - step));
        commitDay(weekStart + g.day * DAY);
        gridRef.current?.focus();
        return;
    }
  };

  /* -------------------------------- effects ---------------------------- */

  React.useEffect(() => {
    if (!rootNode) return;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width < 40 * rem);
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  // Once a touch has picked something up, the finger drags it instead of
  // scrolling the hours.
  React.useEffect(() => {
    if (!scrollNode) return;
    const onTouchMove = (e: TouchEvent) => {
      if (touchLock.current && e.cancelable) e.preventDefault();
    };
    scrollNode.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => scrollNode.removeEventListener("touchmove", onTouchMove);
  }, [scrollNode]);

  // The keyboard cursor stays in view.
  React.useEffect(() => {
    const sc = scrollRef.current;
    if (!gridFocused || !sc) return;
    const head = headRef.current?.offsetHeight ?? 0;
    const lo = Math.min(cursorMin, anchor ?? cursorMin);
    const hi = Math.max(cursorMin, anchor ?? cursorMin) + step;
    const yTop = (lo - top0) * ppm;
    const yBot = (hi - top0) * ppm;
    const view = sc.clientHeight - head;
    if (yTop < sc.scrollTop + 8) {
      sc.scrollTop = Math.max(0, yTop - 8);
    } else if (yBot > sc.scrollTop + view - 8) {
      sc.scrollTop = yBot - view + 8;
    }
  }, [cursorMin, anchor, gridFocused, step, top0, ppm]);

  React.useEffect(
    () => () => {
      stopAuto();
      makeDetach.current?.();
      unfollowGrid.current?.();
      const pr = press.current;
      if (pr) window.clearTimeout(pr.timer);
    },
    [],
  );

  /* --------------------------------- parts ----------------------------- */

  const bindFor = (id: string) => (node: HTMLButtonElement | null) => {
    if (!node) {
      buttons.current.delete(id);
      return;
    }
    buttons.current.set(id, node);
    if (focusNext.current === id) {
      focusNext.current = null;
      node.focus({ preventScroll: true });
    }
  };

  const p0 = partsOf(days[0] ?? weekStart, off);
  const p6 = partsOf(days[6] ?? weekStart, off);
  const rangeLabel =
    p0.month === p6.month
      ? `${p0.date} – ${p6.date} ${MO_SHORT[p6.month] ?? ""} ${p6.year}`
      : `${p0.date} ${MO_SHORT[p0.month] ?? ""} – ${p6.date} ${MO_SHORT[p6.month] ?? ""} ${p6.year}`;
  const focusParts = partsOf(focusDay, off);
  const nowY = (nowMin - top0) * ppm;
  const nowShown =
    nowIdx >= 0 && nowIdx < 7 && nowMin >= top0 && nowMin <= h1 * 60;
  const ticks: number[] = [];
  if (step * ppm >= 6) {
    for (let m = top0 + step; m < h1 * 60; m += step) if (m % 60) ticks.push(m);
  }
  const selEvent = selId ? list.find((e) => e.id === selId) : undefined;
  const selGeo = selEvent ? geoOf(selEvent) : null;
  const todayList = list
    .filter((e) => midnight(e.start, off) === todayStart)
    .sort((x, y) => x.start - y.start);
  const rangeLo = anchor === null ? cursorMin : Math.min(anchor, cursorMin);
  const rangeHi =
    (anchor === null ? cursorMin : Math.max(anchor, cursorMin)) + step;
  const cellId = (dayIdx: number, hour: number) =>
    `${safeId}-c${dayIdx}-${hour}`;
  const cursorHour = Math.floor(cursorMin / 60);
  const colLeft = (idx: number) => ({ "--wp-day": idx }) as React.CSSProperties;

  const newEvent = () => {
    const base =
      focusIdx === nowIdx && nowMin >= top0 && nowMin < h1 * 60
        ? Math.ceil(nowMin / step) * step
        : Math.max(workHours[0] * 60, top0);
    const s = clamp(base, top0, h1 * 60 - step);
    create(
      focusIdx,
      s,
      clamp(s + Math.max(step, defaultDuration), s + step, h1 * 60),
    );
  };

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      className={cn(
        "@container relative h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        inert={disabled}
        className="grid h-full grid-rows-[auto_minmax(0,1fr)] @min-[68rem]:grid-cols-[minmax(0,1fr)_18rem]"
      >
        {/* Header: paging, the range, the legend, New. */}
        <div className="border-b border-hairline">
          <div className="flex h-12 items-center gap-1 px-2 @min-[40rem]:gap-2 @min-[40rem]:px-3">
            <button
              type="button"
              aria-label={narrow ? "Previous day" : "Previous week"}
              onClick={() => commitDay(focusDay - (narrow ? DAY : 7 * DAY))}
              className={TOOL}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label={narrow ? "Next day" : "Next week"}
              onClick={() => commitDay(focusDay + (narrow ? DAY : 7 * DAY))}
              className={TOOL}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
            <p className="min-w-0 truncate pl-1 text-sm font-semibold text-foreground tabular-nums">
              <span className="@min-[40rem]:hidden">
                {WD_SHORT[focusParts.wd]} {focusParts.date}{" "}
                {MO_SHORT[focusParts.month]}
              </span>
              <span className="hidden @min-[40rem]:inline">{rangeLabel}</span>
            </p>
            <span className="flex-1" />
            <ul
              aria-label="Calendars"
              className="mr-1 hidden items-center gap-3 @min-[52rem]:flex"
            >
              {calendars.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-1.5 text-xs text-ink-2"
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: c.tint }}
                  />
                  {c.label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => commitDay(todayStart)}
              disabled={focusDay === todayStart}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                RING,
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={newEvent}
              disabled={status !== "ready"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
                RING,
              )}
            >
              <CalendarPlus aria-hidden className="size-3.5 shrink-0" />
              <span className="hidden @min-[30rem]:inline">New</span>
              <span className="sr-only @min-[30rem]:hidden">New event</span>
            </button>
          </div>
          <div
            role="group"
            aria-label="Days"
            className="grid grid-cols-7 gap-1 px-2 pb-2 @min-[40rem]:hidden"
          >
            {days.map((d, i) => {
              const p = partsOf(d, off);
              const on = i === focusIdx;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-current={d === todayStart ? "date" : undefined}
                  aria-label={dayName(i)}
                  onClick={() => commitDay(d)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center rounded-2 text-[11px] leading-tight transition-colors",
                    on
                      ? "bg-cobalt-wash text-foreground"
                      : "text-ink-2 hover:bg-surface-2",
                    RING_IN,
                  )}
                >
                  <span className="text-[10px] text-ink-3">
                    {(WD_SHORT[p.wd] ?? "").slice(0, 2)}
                  </span>
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full font-medium tabular-nums",
                      d === todayStart && "bg-cobalt-bright text-background",
                    )}
                  >
                    {p.date}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The hours. */}
        <div
          ref={(node) => {
            scrollRef.current = node;
            setScrollNode(node);
          }}
          className="relative row-start-2 [scrollbar-width:thin] overflow-y-auto overscroll-contain @min-[68rem]:col-start-1"
        >
          <div
            ref={headRef}
            className="sticky top-0 z-40 hidden grid-cols-[2.75rem_minmax(0,1fr)] border-b border-hairline bg-card @min-[40rem]:grid"
          >
            <span />
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const p = partsOf(d, off);
                const isToday = d === todayStart;
                return (
                  <button
                    key={d}
                    type="button"
                    tabIndex={-1}
                    aria-label={dayName(i)}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => commitDay(d)}
                    className={cn(
                      "flex h-10 items-center justify-center gap-1.5 border-l border-hairline text-xs",
                      i === focusIdx ? "text-foreground" : "text-ink-2",
                    )}
                  >
                    <span className="text-[11px] text-ink-3">
                      {WD_SHORT[p.wd]}
                    </span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full font-medium tabular-nums",
                        isToday && "bg-cobalt-bright text-background",
                      )}
                    >
                      {p.date}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] @min-[40rem]:grid-cols-[2.75rem_minmax(0,1fr)]"
            style={{ height: gridH }}
          >
            {/* Gutter: hours, snap ticks, now. */}
            <div aria-hidden className="relative">
              {Array.from({ length: h1 - h0 }, (_, k) => {
                const hr = h0 + k;
                const yy = k * hourPx;
                const near = nowShown && Math.abs(yy - nowY) < 12;
                return (
                  <span
                    key={hr}
                    className={cn(
                      "absolute right-1.5 font-mono text-[10px] leading-none text-ink-3 tabular-nums transition-opacity @min-[40rem]:right-2",
                      k === 0 ? "translate-y-1" : "-translate-y-1/2",
                      near && "opacity-0",
                    )}
                    style={{ top: yy }}
                  >
                    {pad2(hr)}
                    <span className="hidden @min-[40rem]:inline">:00</span>
                  </span>
                );
              })}
              {ticks.map((m) => (
                <span
                  key={m}
                  className="absolute right-0 h-px w-1 bg-hairline-strong"
                  style={{ top: r2((m - top0) * ppm) }}
                />
              ))}
              {nowShown ? (
                <motion.span
                  className="absolute right-0.5 z-10 -translate-y-1/2 rounded-1 bg-signal px-1 font-mono text-[10px] leading-4 font-medium text-background tabular-nums"
                  initial={false}
                  animate={{ y: r2(nowY) }}
                  transition={motionSafe ? springs.drift : { duration: 0 }}
                  style={{ top: 0 }}
                >
                  {hhmm(nowMin)}
                </motion.span>
              ) : null}
            </div>

            {/* The day columns. */}
            <div
              ref={areaRef}
              className="relative [--wp-n:1] @min-[40rem]:[--wp-n:7]"
            >
              <div
                ref={gridRef}
                role="grid"
                tabIndex={status === "ready" ? 0 : -1}
                aria-label={`${label}, ${rangeLabel}`}
                aria-describedby={gridHintId}
                aria-activedescendant={
                  gridFocused ? cellId(focusIdx, cursorHour) : undefined
                }
                onFocus={(e) => {
                  if (e.target === e.currentTarget) setGridFocused(true);
                }}
                onBlur={(e) => {
                  if (e.target === e.currentTarget) setGridFocused(false);
                }}
                onKeyDown={onGridKey}
                onPointerDown={onGridPointerDown}
                onPointerMove={onGridPointerMove}
                onPointerUp={onGridPointerUp}
                onPointerCancel={(e) => {
                  touchLock.current = false;
                  gridDrag.onPointerCancel(e);
                }}
                onLostPointerCapture={gridDrag.onLostPointerCapture}
                className={cn(
                  "absolute inset-0 grid touch-pan-y select-none",
                  status === "ready" && !disabled ? "cursor-cell" : "",
                  RING_IN,
                )}
                style={{
                  gridTemplateRows: `repeat(${h1 - h0}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: h1 - h0 }, (_, k) => {
                  const hr = h0 + k;
                  const off_ = hr < workHours[0] || hr >= workHours[1];
                  return (
                    <div
                      key={hr}
                      role="row"
                      className="grid grid-cols-1 @min-[40rem]:grid-cols-7"
                    >
                      {days.map((d, i) => (
                        <div
                          key={d}
                          id={cellId(i, hr)}
                          role="gridcell"
                          aria-label={`${dayName(i)}, ${pad2(hr)}:00`}
                          aria-selected={
                            gridFocused && i === focusIdx && hr === cursorHour
                          }
                          className={cn(
                            "relative border-t border-hairline @min-[40rem]:border-l",
                            i === focusIdx
                              ? "block"
                              : "hidden @min-[40rem]:block",
                            off_ ? "bg-surface-1" : "bg-card",
                            i === todayIdx &&
                              "@min-[40rem]:bg-[color-mix(in_oklab,var(--accent-wash)_45%,transparent)]",
                          )}
                        >
                          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-hairline opacity-50" />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Time already gone, shaded. */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {days.map((d, i) => {
                  const shade =
                    i < nowIdx
                      ? gridH
                      : i === nowIdx
                        ? clamp(nowY, 0, gridH)
                        : 0;
                  if (shade <= 0) return null;
                  return (
                    <motion.span
                      key={d}
                      className={cn(
                        "absolute top-0 bg-[color-mix(in_oklab,var(--ink-3)_7%,transparent)] [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
                        i === focusIdx ? "block" : "hidden @min-[40rem]:block",
                      )}
                      style={{
                        ...colLeft(i),
                        left: "calc(var(--wp-i) * 100% / var(--wp-n))",
                        width: "calc(100% / var(--wp-n))",
                      }}
                      initial={false}
                      animate={{ height: r2(shade) }}
                      transition={motionSafe ? springs.drift : { duration: 0 }}
                    />
                  );
                })}
              </div>

              {/* Events, the placeholder, the ghost, the cursor, now. */}
              <div className="pointer-events-none absolute inset-0">
                <AnimatePresence initial={false} custom={dir}>
                  <motion.div
                    key={narrow ? `d${focusDay}` : `w${weekStart}`}
                    custom={dir}
                    className="absolute inset-0"
                    variants={{
                      in: (d: number) => ({
                        opacity: 0,
                        x: motionSafe ? d * distances.shift : 0,
                      }),
                      at: { opacity: 1, x: 0 },
                      out: (d: number) => ({
                        opacity: 0,
                        x: motionSafe ? -d * distances.step : 0,
                        transition: exitFor(durations.base),
                      }),
                    }}
                    initial="in"
                    animate="at"
                    exit="out"
                    transition={{
                      x: motionSafe ? springs.glide : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                  >
                    {status === "ready"
                      ? inWeek.map(({ e, g }) => {
                          const dragged = preview?.id === e.id;
                          return (
                            <EventBlock
                              key={e.id}
                              event={e}
                              geo={g}
                              slot={
                                (dragged
                                  ? resting.get(e.id)
                                  : slots.get(e.id)) ?? { a: 0, w: 1 }
                              }
                              ppm={ppm}
                              h0={h0}
                              h1={h1}
                              snap={step}
                              tint={tintOf(e)}
                              name={describe(e, g)}
                              selected={selId === e.id}
                              past={e.end <= nowMs}
                              inFocus={g.day === focusIdx}
                              editing={
                                editing?.id === e.id ? editing.draft : null
                              }
                              born={born?.id === e.id ? born : undefined}
                              motionSafe={motionSafe}
                              disabled={disabled}
                              audio={audio}
                              hintId={hintId}
                              bind={bindFor(e.id)}
                              frame={frame}
                              lockTouch={(on) => {
                                touchLock.current = on;
                              }}
                              onPreview={(id, landing) =>
                                setPreview(
                                  landing ? { id, geo: landing } : null,
                                )
                              }
                              onDrop={(id, landing) => {
                                setPreview(null);
                                const target = list.find((x) => x.id === id);
                                const next = update(id, {
                                  start: instant(landing.day, landing.start),
                                  end: instant(landing.day, landing.end),
                                });
                                commitSel(id);
                                if (target && next) {
                                  say(
                                    `${next.title} moved to ${dayName(landing.day)}, ${hhmm(landing.start)} to ${hhmm(landing.end)}.`,
                                  );
                                }
                              }}
                              onDragMove={autoScroll}
                              onDragEnd={stopAuto}
                              onSelect={(id) => {
                                if (
                                  editingRef.current &&
                                  editingRef.current.id !== id
                                ) {
                                  finishEdit(true);
                                }
                                commitSel(selId === id ? null : id);
                              }}
                              onRename={startEdit}
                              onKey={onEventKey}
                              onDraft={(text) => {
                                const ed = editingRef.current;
                                if (!ed) return;
                                const next = { ...ed, draft: text };
                                editingRef.current = next;
                                setEditing(next);
                              }}
                              onEditDone={finishEdit}
                              onDelete={(id) => remove(id, false)}
                            />
                          );
                        })
                      : null}
                  </motion.div>
                </AnimatePresence>

                {preview ? (
                  <motion.span
                    aria-hidden
                    className={cn(
                      "absolute top-0 rounded-2 border-2 border-dashed [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
                      preview.geo.day === focusIdx
                        ? "block"
                        : "hidden @min-[40rem]:block",
                    )}
                    style={{
                      ...colLeft(preview.geo.day),
                      left: `calc((var(--wp-i) + ${slots.get(preview.id)?.a ?? 0}) * 100% / var(--wp-n) + 1px)`,
                      width: `calc(${slots.get(preview.id)?.w ?? 1} * 100% / var(--wp-n) - 3px)`,
                      borderColor: `color-mix(in oklab, ${tintOf(list.find((x) => x.id === preview.id) ?? list[0] ?? { id: "", title: "", start: 0, end: 0 })} 60%, transparent)`,
                    }}
                    initial={false}
                    animate={{
                      y: r2((preview.geo.start - top0) * ppm),
                      height: r2((preview.geo.end - preview.geo.start) * ppm),
                    }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                ) : null}

                {ghost ? (
                  <motion.span
                    aria-hidden
                    className={cn(
                      "absolute top-0 z-30 overflow-clip rounded-2 border border-l-[3px] border-cobalt-bright bg-[color-mix(in_oklab,var(--accent-bright)_20%,var(--card))] px-1.5 py-1 [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
                      ghost.day === focusIdx
                        ? "block"
                        : "hidden @min-[40rem]:block",
                    )}
                    style={{
                      ...colLeft(ghost.day),
                      left: "calc(var(--wp-i) * 100% / var(--wp-n) + 1px)",
                      width: "calc(100% / var(--wp-n) - 3px)",
                      y: ghostY,
                      height: ghostH,
                    }}
                  >
                    <span className="block truncate text-[11px] leading-4 font-medium text-foreground">
                      {newTitle}
                    </span>
                    <span className="block truncate font-mono text-[10px] leading-4 text-ink-2 tabular-nums">
                      {hhmm(ghost.start)}–{hhmm(ghost.end)}
                    </span>
                  </motion.span>
                ) : null}

                {ghost ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute h-0.5 rounded-full bg-cobalt-bright [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
                      ghost.day === focusIdx
                        ? "block"
                        : "hidden @min-[40rem]:block",
                    )}
                    style={{
                      ...colLeft(ghost.day),
                      left: "calc(var(--wp-i) * 100% / var(--wp-n))",
                      width: "calc(100% / var(--wp-n))",
                      top: r2(
                        ((ghost.down ? ghost.end : ghost.start) - top0) * ppm -
                          1,
                      ),
                    }}
                  />
                ) : null}

                {gridFocused && !ghost ? (
                  <span
                    aria-hidden
                    className="absolute z-20 block rounded-2 border-2 border-cobalt-bright bg-[color-mix(in_oklab,var(--accent-bright)_10%,transparent)] [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]"
                    style={{
                      ...colLeft(focusIdx),
                      left: "calc(var(--wp-i) * 100% / var(--wp-n))",
                      width: "calc(100% / var(--wp-n))",
                      top: r2((rangeLo - top0) * ppm),
                      height: r2(Math.max(4, (rangeHi - rangeLo) * ppm)),
                    }}
                  >
                    <span className="absolute -top-px left-1 -translate-y-full rounded-t-1 bg-cobalt-bright px-1 font-mono text-[10px] leading-4 text-background tabular-nums">
                      {hhmm(rangeLo)}
                      {anchor !== null ? `–${hhmm(rangeHi)}` : ""}
                    </span>
                  </span>
                ) : null}

                {nowShown ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-0 top-0 z-20"
                    initial={false}
                    animate={{ y: r2(nowY) }}
                    transition={motionSafe ? springs.drift : { duration: 0 }}
                  >
                    <span className="absolute inset-x-0 hidden h-px bg-signal/40 @min-[40rem]:block" />
                    <span
                      className={cn(
                        "absolute -top-px h-0.5 bg-signal [--wp-i:0] @min-[40rem]:[--wp-i:var(--wp-day)]",
                        nowIdx === focusIdx
                          ? "block"
                          : "hidden @min-[40rem]:block",
                      )}
                      style={{
                        ...colLeft(nowIdx),
                        left: "calc(var(--wp-i) * 100% / var(--wp-n))",
                        width: "calc(100% / var(--wp-n))",
                      }}
                    >
                      <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-signal" />
                    </span>
                  </motion.span>
                ) : null}
              </div>

              {status !== "ready" ? (
                <div className="absolute inset-0 z-30 flex items-start justify-center bg-card/80 pt-16">
                  {status === "loading" ? (
                    <p aria-busy="true" className="text-sm text-ink-3">
                      Loading the week…
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      <p className="text-sm font-medium text-foreground">
                        The calendar did not load
                      </p>
                      <button
                        type="button"
                        onClick={onRetry}
                        className={cn(
                          "inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground hover:bg-surface-2",
                          RING,
                        )}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Details, once there is room. */}
        <aside
          aria-label="Event details"
          className="col-start-2 row-span-2 row-start-1 hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline bg-surface-1 @min-[68rem]:block"
        >
          {selEvent && selGeo ? (
            <Details
              key={selEvent.id}
              event={selEvent}
              calendars={calendars}
              when={`${dayName(selGeo.day, false)} · ${hhmm(selGeo.start)}–${hhmm(selGeo.end)}`}
              minutes={selGeo.end - selGeo.start}
              snap={step}
              disabled={disabled}
              onTitle={(title) => {
                update(selEvent.id, { title });
                say(`Renamed to ${title}.`);
              }}
              onCalendar={(id) => {
                update(selEvent.id, { calendar: id });
                say(`Moved to ${calOf(id)?.label ?? id}.`);
              }}
              onDuration={(delta) => {
                const end = clamp(
                  selGeo.end + delta,
                  selGeo.start + step,
                  h1 * 60,
                );
                if (end === selGeo.end) return;
                update(selEvent.id, { end: instant(selGeo.day, end) });
                thock();
                say(
                  `${selEvent.title} ends ${hhmm(end)}, ${span(end - selGeo.start)}.`,
                );
              }}
              onDelete={() => remove(selEvent.id, true)}
              onClose={() => commitSel(null)}
            />
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Today · {WD_SHORT[partsOf(todayStart, off).wd]}{" "}
                {partsOf(todayStart, off).date}{" "}
                {MO_SHORT[partsOf(todayStart, off).month]}
              </p>
              {todayList.length ? (
                <ul role="list" className="flex flex-col gap-1">
                  {todayList.map((e) => {
                    const s = minuteOf(e.start, off);
                    const en = s + Math.round((e.end - e.start) / MIN);
                    const done = e.end <= nowMs;
                    const live = e.start <= nowMs && nowMs < e.end;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => {
                            commitDay(todayStart);
                            commitSel(e.id);
                            focusNext.current = e.id;
                            buttons.current.get(e.id)?.focus();
                          }}
                          className={cn(
                            "flex h-10 w-full items-center gap-2.5 rounded-2 px-2 text-left transition-colors hover:bg-surface-2",
                            done && "opacity-60",
                            RING_IN,
                          )}
                        >
                          <span
                            aria-hidden
                            className="h-6 w-0.5 shrink-0 rounded-full"
                            style={{ background: tintOf(e) }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-foreground">
                              {e.title}
                            </span>
                            <span className="block font-mono text-[10px] text-ink-3 tabular-nums">
                              {hhmm(s)}–{hhmm(en)}
                            </span>
                          </span>
                          {live ? (
                            <span className="shrink-0 rounded-full bg-signal/15 px-1.5 text-[10px] leading-4 text-signal">
                              Now
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">Nothing on today.</p>
              )}
              <p className="border-t border-hairline pt-3 text-xs leading-5 text-ink-3">
                Drag across empty time to add an event, or focus the grid and
                press Enter. Pick an event to edit it here.
              </p>
            </div>
          )}
        </aside>
      </div>

      <p id={hintId} className="sr-only">
        Up and Down move the event by {step} minutes, Shift with Up or Down
        changes its end, Left and Right move it a day, Enter renames, Delete
        removes, Escape returns to the grid.
      </p>
      <p id={gridHintId} className="sr-only">
        Arrow keys move the slot cursor, Shift with Up or Down selects a range,
        Enter creates an event there, t jumps to now.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
