"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ZoneBusy = {
  /** Minutes from midnight on the person's own clock. */
  start: number;
  /** Minutes from midnight on the person's own clock, exclusive. */
  end: number;
  title?: string;
};

export type ZonePerson = {
  id: string;
  name: string;
  /** A short place name for the zone: "Lisbon", "New York". */
  zone: string;
  /** Minutes ahead of UTC on the day shown (DST already applied). */
  offset: number;
  /** Working hours on their own clock, whole or fractional hours. */
  hours: [number, number];
  busy?: ZoneBusy[];
};

export type ZoneSlot = {
  /** ms since the epoch */
  start: number;
  /** ms since the epoch */
  end: number;
  /** minutes */
  duration: number;
  /** How many people are free for the whole slot. */
  free: number;
  total: number;
  everyoneFree: boolean;
};

export type ZoneBandStyle = "glass" | "solid" | "outline";
export type ZoneTone = "cool" | "warm" | "mono";
export type ZoneStatus = "ready" | "loading" | "error";

export type ZoneOverlapProps = {
  /** How the meeting band is drawn: a translucent wash, a pigment fill, or a dashed outline. @default "glass" */
  bandStyle?: ZoneBandStyle;
  /** Pixels per hour of the shared timeline; the drag maps to it. @default 44 */
  hourWidth?: number;
  /** The palette: cobalt band and teal overlap, amber band and coral busy blocks, or ink with colour only where everyone is free. @default "cool" */
  tone?: ZoneTone;
  /** The team. The first person is "you": the timeline runs on their clock. @default defaultZonePeople */
  people?: ZonePerson[];
  /** Any time on the day shown, ms (its UTC date is the reference day). @default defaultZoneDate */
  date?: number;
  /** The current time, ms, for local clocks and the now-line. Never read from the clock. @default defaultZoneNow */
  now?: number;
  /** Controlled band start, minutes from midnight on the reference clock. */
  value?: number;
  /** Initial band start when uncontrolled. @default 840 (14:00) */
  defaultValue?: number;
  /** Fires from the drag, press or key that moved the band, with its new start. */
  onValueChange?: (start: number) => void;
  /** Controlled meeting length, minutes. */
  duration?: number;
  /** Initial length when uncontrolled. @default 45 */
  defaultDuration?: number;
  /** Fires from the stepper, bracket key or edge drag that changed the length. */
  onDurationChange?: (minutes: number) => void;
  /** Shortest meeting, minutes. @default 15 */
  minDuration?: number;
  /** Longest meeting, minutes. @default 240 */
  maxDuration?: number;
  /** Pick (or Enter on the band) was pressed with the band's slot. */
  onPick?: (slot: ZoneSlot) => void;
  /** Suggest moved the band: the next slot where everyone is free, or the best partial one. */
  onSuggest?: (slot: ZoneSlot) => void;
  /** Whether the calendars have arrived. @default "ready" */
  status?: ZoneStatus;
  /** "Try again" was pressed after the calendars failed to load. */
  onRetry?: () => void;
  /** The meeting's name. @default "Design sync" */
  title?: string;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be moved or picked. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DAY = 1440;
const STEP = 15;
const SLICES = DAY / STEP;

/** Tuesday 20 October 2026. */
export const defaultZoneDate = Date.UTC(2026, 9, 20);
/** 10:40 in Lisbon that morning. */
export const defaultZoneNow = Date.UTC(2026, 9, 20, 9, 40);

/**
 * A Waylight design team across four zones. Their working hours meet for one
 * hour, 14:00–15:00 UTC, and a New York standup takes its first quarter: the
 * only 45 minutes that suit all five is 15:15–16:00 in Lisbon.
 */
export const defaultZonePeople: ZonePerson[] = [
  {
    id: "ana",
    name: "Ana Ferreira",
    zone: "Lisbon",
    offset: 60,
    hours: [9, 18],
    busy: [
      { start: 600, end: 660, title: "Crit" },
      { start: 780, end: 840, title: "Lunch" },
    ],
  },
  {
    id: "tome",
    name: "Tomé Rocha",
    zone: "Lisbon",
    offset: 60,
    hours: [9, 17],
    busy: [
      { start: 690, end: 720, title: "1:1" },
      { start: 960, end: 1020, title: "Vendor call" },
    ],
  },
  {
    id: "jonas",
    name: "Jonas Lindqvist",
    zone: "Helsinki",
    offset: 180,
    hours: [10, 18],
    busy: [
      { start: 720, end: 780, title: "Lunch" },
      { start: 900, end: 930, title: "Review" },
    ],
  },
  {
    id: "maya",
    name: "Maya Okafor",
    zone: "New York",
    offset: -240,
    hours: [9, 17],
    busy: [
      { start: 600, end: 615, title: "Standup" },
      { start: 720, end: 780, title: "Lunch" },
    ],
  },
  {
    id: "rui",
    name: "Rui Adeyemi",
    zone: "Denver",
    offset: -360,
    hours: [8, 16],
    busy: [{ start: 600, end: 660, title: "Planning" }],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

type Avail = "free" | "busy" | "off";
type Spring = (typeof springs)[keyof typeof springs];

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const ROW_H = 50;
const RULER_H = 28;
const LANE_H = 34;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const snapQ = (m: number) => Math.round(m / STEP) * STEP;
const mod = (v: number, n: number) => ((v % n) + n) % n;

/** A fixed 24-hour clock: a locale lookup during render would not survive hydration. */
const clock = (minutes: number) => {
  const m = mod(Math.round(minutes), DAY);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const lengthLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const HUES = [262, 205, 162, 80, 30, 320, 235];
function hueOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  }
  return HUES[(h >>> 0) % HUES.length] ?? 262;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Where a reference-clock minute falls on someone's own clock, and on which day. */
function localOf(minute: number, person: ZonePerson, refOffset: number) {
  const local = minute + person.offset - refOffset;
  const shift = Math.floor(local / DAY);
  return { minute: local - shift * DAY, shift };
}

function stateAt(minute: number, person: ZonePerson, refOffset: number): Avail {
  const { minute: lm } = localOf(minute, person, refOffset);
  const [a, b] = person.hours;
  if (lm < a * 60 || lm >= b * 60) return "off";
  for (const block of person.busy ?? []) {
    if (lm >= block.start && lm < block.end) return "busy";
  }
  return "free";
}

/** Each person's day in quarter hours, read at the middle of each quarter. */
function sliceTable(people: ZonePerson[], refOffset: number): Avail[][] {
  return people.map((p) =>
    Array.from({ length: SLICES }, (_, i) =>
      stateAt(i * STEP + STEP / 2, p, refOffset),
    ),
  );
}

/** Runs of one state for drawing, in reference minutes. */
function runsOf(row: Avail[]): { state: Avail; start: number; end: number }[] {
  const out: { state: Avail; start: number; end: number }[] = [];
  row.forEach((state, i) => {
    const last = out[out.length - 1];
    if (last && last.state === state) last.end = (i + 1) * STEP;
    else out.push({ state, start: i * STEP, end: (i + 1) * STEP });
  });
  return out;
}

/** Whether a person is free for the whole of [start, start + length). */
function freeFor(row: Avail[], start: number, length: number): boolean {
  const a = Math.floor(start / STEP);
  const b = Math.ceil((start + length) / STEP);
  if (a < 0 || b > SLICES) return false;
  for (let i = a; i < b; i += 1) if (row[i] !== "free") return false;
  return true;
}

/** The worst thing standing in someone's way in a span: busy beats off. */
function blockerFor(row: Avail[], start: number, length: number): Avail {
  const a = Math.max(0, Math.floor(start / STEP));
  const b = Math.min(SLICES, Math.ceil((start + length) / STEP));
  let seen: Avail = "free";
  for (let i = a; i < b; i += 1) {
    const s = row[i];
    if (s === "busy") return "busy";
    if (s === "off") seen = "off";
  }
  return seen;
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

/**
 * A find-a-time surface: a team's days on one shared timeline, one row per
 * person, with their working hours, the hours they are asleep hatched, their
 * busy blocks, and under them an Everyone lane holding the stretches where
 * all of them are free. The meeting band spans every row and carries each
 * person's local time on a flag. Dragged, it follows the pointer 1:1 and
 * lands on a quarter hour on snap with the throw's velocity; pressed track
 * moves it there on glide; its right edge changes the length.
 *
 * As the band enters a stretch where everyone is free it blooms: one value
 * springs to 1 on snap and brightens the band and widens its glow, all in
 * CSS from a single custom property, so nothing re-renders per frame. Below
 * 36rem the rows become a list with one local-time column under a day strip
 * that carries the same band. The band is a slider: arrows move it fifteen
 * minutes, brackets change the length, Enter picks, S suggests. Under reduced
 * motion the band moves without travel and the bloom cross-fades.
 */
export function ZoneOverlap({
  bandStyle = "glass",
  hourWidth = 44,
  tone = "cool",
  people = defaultZonePeople,
  date = defaultZoneDate,
  now = defaultZoneNow,
  value,
  defaultValue = 840,
  onValueChange,
  duration,
  defaultDuration = 45,
  onDurationChange,
  minDuration = 15,
  maxDuration = 240,
  onPick,
  onSuggest,
  status = "ready",
  onRetry,
  title = "Design sync",
  height = 540,
  disabled = false,
  className,
}: ZoneOverlapProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const hw = Math.round(clamp(hourWidth, 16, 120));
  const ppm = hw / 60;
  /** A reference minute as pixels on the track, rounded for the markup. */
  const px = (minutes: number) => r2(minutes * ppm);
  const trackW = 24 * hw;
  const ref = people[0];
  const refOffset = ref?.offset ?? 0;
  const refZone = ref?.zone ?? "UTC";

  const minLen = Math.max(STEP, snapQ(minDuration));
  const maxLen = Math.max(minLen, Math.min(DAY, snapQ(maxDuration)));

  /* -------------------------------- values -------------------------------- */

  const [ownStart, setOwnStart] = React.useState(() => snapQ(defaultValue));
  const [ownLen, setOwnLen] = React.useState(() =>
    clamp(snapQ(defaultDuration), minLen, maxLen),
  );
  const len = clamp(snapQ(duration ?? ownLen), minLen, maxLen);
  const start = clamp(snapQ(value ?? ownStart), 0, DAY - len);

  const table = React.useMemo(
    () => sliceTable(people, refOffset),
    [people, refOffset],
  );

  /** Slices where everyone is free. */
  const common = React.useMemo(
    () =>
      Array.from(
        { length: SLICES },
        (_, i) => table.length > 0 && table.every((row) => row[i] === "free"),
      ),
    [table],
  );
  const windows = React.useMemo(() => {
    const out: { start: number; end: number }[] = [];
    common.forEach((ok, i) => {
      if (!ok) return;
      const last = out[out.length - 1];
      if (last && last.end === i * STEP) last.end = (i + 1) * STEP;
      else out.push({ start: i * STEP, end: (i + 1) * STEP });
    });
    return out;
  }, [common]);

  /* --------------------------- motion values ---------------------------- */

  const startMv = useMotionValue(start);
  const lenMv = useMotionValue(len);
  const bloom = useMotionValue(0);
  const startVar = useTransform(startMv, (v) => r2(v));
  const lenVar = useTransform(lenMv, (v) => r2(v));
  const bloomVar = useTransform(bloom, (v) => Number(v.toFixed(3)));
  const anims = React.useRef<{
    start?: AnimationPlaybackControls;
    len?: AnimationPlaybackControls;
    bloom?: AnimationPlaybackControls;
    scroll?: AnimationPlaybackControls;
  }>({});
  const goal = React.useRef({ start, len });

  // While the hand is on the band its readouts follow the snapped quarter it
  // points at; React renders only when that quarter changes.
  const [live, setLive] = React.useState<{
    start: number;
    len: number;
  } | null>(null);
  const shownStart = live?.start ?? start;
  const shownLen = live?.len ?? len;

  const freeNow = table.map((row) => freeFor(row, shownStart, shownLen));
  const freeCount = freeNow.filter(Boolean).length;
  const everyone = people.length > 0 && freeCount === people.length;

  const [picked, setPicked] = React.useState<{
    start: number;
    len: number;
  } | null>(null);
  const isPicked =
    picked !== null && picked.start === start && picked.len === len && !live;
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      running.start?.stop();
      running.len?.stop();
      running.bloom?.stop();
      running.scroll?.stop();
    };
  }, []);

  const moveStart = React.useCallback(
    (to: number, spring: Spring | null, velocity = 0) => {
      anims.current.start?.stop();
      goal.current.start = to;
      if (!spring || !motionSafe) {
        startMv.jump(to);
        return;
      }
      anims.current.start = animate(startMv, to, { ...spring, velocity });
    },
    [motionSafe, startMv],
  );

  const moveLen = React.useCallback(
    (to: number, velocity = 0) => {
      anims.current.len?.stop();
      goal.current.len = to;
      if (!motionSafe) {
        lenMv.jump(to);
        return;
      }
      anims.current.len = animate(lenMv, to, { ...springs.snap, velocity });
    },
    [lenMv, motionSafe],
  );

  // A host that moves the band or changes the length gets the same landing a
  // drag would; our own commits have already set the goal.
  React.useEffect(() => {
    if (goal.current.start !== start) moveStart(start, springs.glide);
    if (goal.current.len !== len) moveLen(len);
  }, [start, len, moveStart, moveLen]);

  // The bloom: up on snap (a crisp arrival), down on glide (a soft leaving).
  React.useEffect(() => {
    anims.current.bloom?.stop();
    const to = everyone && ready ? 1 : 0;
    anims.current.bloom = animate(
      bloom,
      to,
      motionSafe
        ? to === 1
          ? springs.snap
          : springs.glide
        : { duration: durations.fast, ease: easings.move },
    );
  }, [everyone, ready, motionSafe, bloom]);

  /* ------------------------------- helpers -------------------------------- */

  const dayStartUtc = (() => {
    const d = new Date(date);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();
  const refMidnight = dayStartUtc - refOffset * MIN;
  const dateLabel = (() => {
    const d = new Date(dayStartUtc);
    return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
  })();
  const nowMin = (now - refMidnight) / MIN;

  const slotOf = (s: number, l: number): ZoneSlot => {
    const free = table.filter((row) => freeFor(row, s, l)).length;
    return {
      start: refMidnight + s * MIN,
      end: refMidnight + (s + l) * MIN,
      duration: l,
      free,
      total: people.length,
      everyoneFree: people.length > 0 && free === people.length,
    };
  };

  const blockers = (s: number, l: number) =>
    people
      .map((p, i) => ({ p, why: blockerFor(table[i] ?? [], s, l) }))
      .filter((x) => x.why !== "free");

  const describe = (s: number, l: number) => {
    const span = `${clock(s)} to ${clock(s + l)} ${refZone} time`;
    const b = blockers(s, l);
    if (b.length === 0) return `${span}, everyone free`;
    const names = b
      .map(
        (x) =>
          `${x.p.name.split(" ")[0]} ${x.why === "busy" ? "busy" : "outside hours"}`,
      )
      .join(", ");
    return `${span}, ${b.length} not free: ${names}`;
  };

  const ensureVisible = (s: number, l: number, glide: boolean) => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const nameW =
      el.querySelector<HTMLElement>("[data-zo-name]")?.offsetWidth ?? 0;
    const left = s * ppm;
    const right = (s + l) * ppm;
    const viewL = el.scrollLeft;
    const viewR = el.scrollLeft + el.clientWidth - nameW;
    let to = el.scrollLeft;
    if (left < viewL + 16) to = left - 16;
    else if (right > viewR - 16) to = right - (el.clientWidth - nameW) + 16;
    to = Math.round(clamp(to, 0, el.scrollWidth - el.clientWidth));
    if (to === el.scrollLeft) return;
    anims.current.scroll?.stop();
    if (!glide || !motionSafe) {
      el.scrollLeft = to;
      return;
    }
    anims.current.scroll = animate(el.scrollLeft, to, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollLeft = Math.round(v);
      },
    });
  };

  // The day opens on the band, centred, once the rows have a width.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const nameW =
      el.querySelector<HTMLElement>("[data-zo-name]")?.offsetWidth ?? 0;
    const view = el.clientWidth - nameW;
    el.scrollLeft = Math.round(
      clamp(
        (goal.current.start + goal.current.len / 2) * ppm - view / 2,
        0,
        el.scrollWidth - el.clientWidth,
      ),
    );
  }, [ppm, ready]);

  const commitStart = (
    to: number,
    how: "drag" | "key" | "press" | "suggest",
    velocity = 0,
  ) => {
    const target = clamp(snapQ(to), 0, DAY - len);
    moveStart(
      target,
      how === "drag"
        ? springs.snap
        : how === "key"
          ? springs.snap
          : springs.glide,
      velocity,
    );
    if (target !== start) {
      if (value === undefined) setOwnStart(target);
      onValueChange?.(target);
    }
    if (how !== "drag") ensureVisible(target, len, how !== "key");
    const ok = table.every((row) => freeFor(row, target, len));
    const b = blockers(target, len).length;
    say(
      ok
        ? `Everyone free, ${clock(target)} to ${clock(target + len)}.`
        : `${clock(target)} to ${clock(target + len)}. ${b} not free.`,
    );
  };

  const commitLen = (to: number, velocity = 0) => {
    const next = clamp(snapQ(to), minLen, maxLen);
    const s = Math.min(start, DAY - next);
    moveLen(next, velocity);
    if (s !== start) {
      moveStart(s, springs.snap);
      if (value === undefined) setOwnStart(s);
      onValueChange?.(s);
    }
    if (next !== len) {
      if (duration === undefined) setOwnLen(next);
      onDurationChange?.(next);
    }
    const ok = table.every((row) => freeFor(row, s, next));
    say(
      `${lengthLabel(next)}. ${ok ? "Everyone free." : `${blockers(s, next).length} not free.`}`,
    );
  };

  const suggest = () => {
    if (disabled || !ready) return;
    let found: number | null = null;
    for (let k = 1; k <= SLICES; k += 1) {
      const s = mod(start + k * STEP, DAY);
      if (s + len > DAY) continue;
      if (table.every((row) => freeFor(row, s, len))) {
        found = s;
        break;
      }
    }
    if (found === null) {
      // No hour suits everyone: the earliest slot that suits the most.
      let best = 0;
      let bestFree = -1;
      for (let s = 0; s + len <= DAY; s += STEP) {
        const f = table.filter((row) => freeFor(row, s, len)).length;
        if (f > bestFree) {
          bestFree = f;
          best = s;
        }
      }
      commitStart(best, "suggest");
      say(
        `No time suits everyone for ${lengthLabel(len)}. Best: ${bestFree} of ${people.length} free at ${clock(best)}.`,
      );
      onSuggest?.(slotOf(best, len));
      return;
    }
    commitStart(found, "suggest");
    onSuggest?.(slotOf(found, len));
  };

  const pick = () => {
    if (disabled || !ready) return;
    setPicked({ start, len });
    say(`Picked ${clock(start)} to ${clock(start + len)}.`);
    onPick?.(slotOf(start, len));
  };

  /* -------------------------------- drags --------------------------------- */

  const drag = React.useRef<{ from: number; scale: number } | null>(null);

  const dragStart = (scale: number) => {
    anims.current.start?.stop();
    anims.current.scroll?.stop();
    drag.current = { from: startMv.get(), scale };
  };
  const dragMove = ({ offset }: DragInfo) => {
    const d = drag.current;
    if (!d || d.scale <= 0) return;
    const raw = d.from + offset.x / d.scale;
    const v = rubberClamp(raw, 0, DAY - len, 90);
    startMv.set(r2(v));
    const q = clamp(snapQ(v), 0, DAY - len);
    setLive((l) =>
      l && l.start === q && l.len === len ? l : { start: q, len },
    );
  };
  const dragEnd = ({ velocity }: DragInfo) => {
    const d = drag.current;
    drag.current = null;
    setLive(null);
    if (!d || d.scale <= 0) return;
    // A flick commits to where it would have come to rest.
    const v = velocity.x / d.scale;
    commitStart(project(startMv.get(), v, 0.99), "drag", v);
  };
  const dragCancel = () => {
    drag.current = null;
    setLive(null);
    moveStart(start, springs.snap);
  };

  const wide = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !ready,
    onStart: () => dragStart(ppm),
    onMove: dragMove,
    onEnd: dragEnd,
    onCancel: dragCancel,
  });
  const strip = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !ready,
    onStart: () =>
      dragStart((stripRef.current?.getBoundingClientRect().width ?? 0) / DAY),
    onMove: dragMove,
    onEnd: dragEnd,
    onCancel: dragCancel,
  });

  const lenDrag = React.useRef<number | null>(null);
  const grip = useDrag({
    axis: "x",
    threshold: 2,
    disabled: disabled || !ready,
    onStart: () => {
      anims.current.len?.stop();
      lenDrag.current = lenMv.get();
    },
    onMove: ({ offset }) => {
      const from = lenDrag.current;
      if (from === null) return;
      const raw = from + offset.x / ppm;
      const v = rubberClamp(raw, minLen, Math.min(maxLen, DAY - start), 60);
      lenMv.set(r2(v));
      const q = clamp(snapQ(v), minLen, Math.min(maxLen, DAY - start));
      setLive((l) =>
        l && l.len === q && l.start === start ? l : { start, len: q },
      );
    },
    onEnd: ({ velocity }) => {
      lenDrag.current = null;
      setLive(null);
      commitLen(lenMv.get(), velocity.x / ppm);
    },
    onCancel: () => {
      lenDrag.current = null;
      setLive(null);
      moveLen(len);
    },
  });

  /* ------------------------------- keyboard ------------------------------- */

  const onBandKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || !ready) return;
    const big = event.shiftKey ? 60 : STEP;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        commitStart(start + big, "key");
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        commitStart(start - big, "key");
        return;
      case "PageUp":
        event.preventDefault();
        commitStart(start + 60, "key");
        return;
      case "PageDown":
        event.preventDefault();
        commitStart(start - 60, "key");
        return;
      case "Home":
        event.preventDefault();
        commitStart(0, "key");
        return;
      case "End":
        event.preventDefault();
        commitStart(DAY - len, "key");
        return;
      case "]":
        event.preventDefault();
        commitLen(len + STEP);
        return;
      case "[":
        event.preventDefault();
        commitLen(len - STEP);
        return;
      case "Enter":
        event.preventDefault();
        pick();
        return;
      case "s":
      case "S":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        suggest();
        return;
      default:
        return;
    }
  };

  /* -------------------------------- render -------------------------------- */

  const palette = {
    cool: {
      band: "var(--accent-bright)",
      free: "oklch(from var(--signal) 0.74 0.13 h)",
      busy: "oklch(from var(--accent-bright) 0.68 0.1 300)",
    },
    warm: {
      band: "oklch(from var(--warn) 0.72 0.15 h)",
      free: "oklch(from var(--signal) 0.74 0.12 h)",
      busy: "oklch(from var(--danger) 0.7 0.13 h)",
    },
    mono: {
      band: "var(--ink-2)",
      free: "oklch(from var(--signal) 0.74 0.13 h)",
      busy: "oklch(from var(--ink-3) 0.62 0.01 h)",
    },
  }[tone] ?? {
    band: "var(--accent-bright)",
    free: "oklch(from var(--signal) 0.74 0.13 h)",
    busy: "oklch(from var(--accent-bright) 0.68 0.1 300)",
  };

  // The band's colour leans toward the overlap colour as it blooms.
  const bandTint =
    "color-mix(in oklab, var(--zo-free) calc(var(--zo-bloom) * 70%), var(--zo-band))";
  const glow =
    "0 0 calc(var(--zo-bloom) * 22px) calc(var(--zo-bloom) * 5px) color-mix(in oklab, var(--zo-free) calc(var(--zo-bloom) * 60%), transparent)";
  const bandSurface: React.CSSProperties =
    bandStyle === "solid"
      ? {
          backgroundColor: `color-mix(in oklab, oklch(from ${bandTint} 0.8 0.11 h) calc(62% + var(--zo-bloom) * 22%), transparent)`,
          borderColor: `oklch(from ${bandTint} 0.66 0.13 h)`,
          borderStyle: "solid",
          boxShadow: glow,
        }
      : bandStyle === "outline"
        ? {
            backgroundColor: `color-mix(in oklab, ${bandTint} calc(var(--zo-bloom) * 10%), transparent)`,
            borderColor: bandTint,
            borderStyle: "dashed",
            boxShadow: glow,
          }
        : {
            backgroundColor: `color-mix(in oklab, ${bandTint} calc(14% + var(--zo-bloom) * 16%), transparent)`,
            borderColor: `color-mix(in oklab, ${bandTint} 60%, transparent)`,
            borderStyle: "solid",
            boxShadow: glow,
          };

  const avatar = (p: ZonePerson, size = "size-7 text-[10px]") => {
    const hue = hueOf(p.name);
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full leading-none font-semibold",
          size,
        )}
        style={{
          backgroundColor: `oklch(from var(--accent-bright) 0.86 0.07 ${hue})`,
          color: `oklch(from var(--accent-bright) 0.34 0.08 ${hue})`,
        }}
      >
        {initials(p.name)}
      </span>
    );
  };

  const localNow = (p: ZonePerson) => {
    const l = localOf(nowMin, p, refOffset);
    return clock(l.minute);
  };

  const flagOf = (p: ZonePerson, i: number) => {
    const l = localOf(shownStart, p, refOffset);
    const why = blockerFor(table[i] ?? [], shownStart, shownLen);
    return { time: clock(l.minute), shift: l.shift, why };
  };

  const dot = (why: Avail) =>
    why === "free"
      ? "bg-(--zo-free)"
      : why === "busy"
        ? "bg-(--zo-busy)"
        : "bg-ink-3/60";

  const whyWord = (why: Avail) =>
    why === "free" ? "Free" : why === "busy" ? "Busy" : "Off hours";

  const flipFlags = shownStart > DAY - 180;
  /** Everyone-free windows long enough for the meeting. */
  const fits = windows.filter((w) => w.end - w.start >= len);
  const capText = everyone
    ? "Everyone free"
    : `${people.length - freeCount} not free`;

  const hourStep = hourWidth >= 36 ? 1 : 2;

  const header = (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="min-w-0 flex-1 basis-44">
        <p id={titleId} className="truncate text-sm font-semibold">
          {title}
        </p>
        <p className="truncate text-[11px] text-ink-3 tabular-nums">
          {dateLabel} ·{" "}
          {ready
            ? `${clock(shownStart)}–${clock(shownStart + shownLen)} ${refZone}`
            : "Loading calendars"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Meeting length"
          className="inline-flex h-8 items-center rounded-2 border border-hairline bg-surface-1"
        >
          <button
            type="button"
            aria-label="Shorter by 15 minutes"
            aria-disabled={disabled || !ready || len <= minLen || undefined}
            onClick={() => {
              if (!disabled && ready && len > minLen) commitLen(len - STEP);
            }}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-l-2 text-ink-2 transition-colors hover:text-foreground aria-disabled:opacity-40",
              FOCUS_RING,
            )}
          >
            <Minus aria-hidden className="size-3.5" />
          </button>
          <span className="min-w-16 px-1 text-center font-mono text-[11px] text-foreground tabular-nums">
            {lengthLabel(shownLen)}
          </span>
          <button
            type="button"
            aria-label="Longer by 15 minutes"
            aria-disabled={disabled || !ready || len >= maxLen || undefined}
            onClick={() => {
              if (!disabled && ready && len < maxLen) commitLen(len + STEP);
            }}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-r-2 text-ink-2 transition-colors hover:text-foreground aria-disabled:opacity-40",
              FOCUS_RING,
            )}
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={suggest}
          aria-label="Suggest a time"
          aria-disabled={disabled || !ready || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          <Sparkles aria-hidden className="size-3.5" />
          <span className="hidden @min-[22rem]:inline">Suggest</span>
        </button>
        <button
          type="button"
          onClick={pick}
          aria-disabled={disabled || !ready || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-50",
            FOCUS_RING,
          )}
          style={{ backgroundColor: "var(--zo-band-ink)" }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {isPicked ? (
              <motion.span
                key="ok"
                className="inline-flex"
                initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.snap,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
              </motion.span>
            ) : null}
          </AnimatePresence>
          {isPicked ? "Picked" : "Pick"}
        </button>
      </div>
    </header>
  );

  // The summary line: who stands in the way, or that nobody does.
  const summary = (
    <div className="flex min-w-0 items-center gap-2 border-b border-hairline px-4 py-2 text-[12px]">
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 font-medium transition-colors duration-300",
          everyone ? "text-foreground" : "text-ink-2",
        )}
        style={{
          backgroundColor: everyone
            ? "color-mix(in oklab, var(--zo-free) 20%, transparent)"
            : "var(--bg-2)",
        }}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            everyone ? "bg-(--zo-free)" : "bg-ink-3",
          )}
        />
        {ready
          ? everyone
            ? "Everyone free"
            : `${freeCount} of ${people.length} free`
          : "Loading"}
      </span>
      <span className="min-w-0 truncate text-ink-3">
        {ready
          ? everyone
            ? `${windows.length === 1 ? "The only window today" : `${windows.length} windows today`} · ${lengthLabel(shownLen)}`
            : blockers(shownStart, shownLen)
                .map(
                  (x) =>
                    `${x.p.name.split(" ")[0]} ${x.why === "busy" ? "busy" : "outside hours"}`,
                )
                .join(" · ")
          : ""}
      </span>
    </div>
  );

  const band = (
    <motion.div
      role="slider"
      tabIndex={disabled || !ready ? -1 : 0}
      aria-label="Meeting time"
      aria-describedby={hintId}
      aria-valuemin={0}
      aria-valuemax={DAY - len}
      aria-valuenow={start}
      aria-valuetext={describe(start, len)}
      aria-disabled={disabled || undefined}
      data-zo-band=""
      onKeyDown={onBandKey}
      {...wide}
      className={cn(
        "absolute top-0 bottom-0 z-[2] cursor-grab touch-pan-y rounded-2 border-[1.5px] select-none active:cursor-grabbing",
        FOCUS_RING,
      )}
      style={{
        left: "calc(var(--zo-start) * var(--zo-hw) * 1px / 60)",
        width: "calc(var(--zo-len) * var(--zo-hw) * 1px / 60)",
        ...bandSurface,
      }}
    >
      {/* The cap: the band's verdict, riding it in the ruler. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[10px] font-medium whitespace-nowrap shadow-sm transition-colors duration-300",
          flipFlags ? "right-0" : "left-0",
          everyone ? "text-foreground" : "text-ink-2",
        )}
        style={{
          backgroundColor: everyone
            ? "color-mix(in oklab, var(--zo-free) 30%, var(--card))"
            : "var(--card)",
          boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={capText}
            initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {capText}
          </motion.span>
        </AnimatePresence>
      </span>
      {people.map((p, i) => {
        const f = flagOf(p, i);
        return (
          <span
            key={p.id}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inline-flex h-5 items-center gap-1 rounded-full bg-popover px-1.5 font-mono text-[10px] whitespace-nowrap text-foreground tabular-nums shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]",
              flipFlags ? "right-1" : "left-1",
            )}
            style={{ top: RULER_H + i * ROW_H + (ROW_H - 20) / 2 }}
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", dot(f.why))}
            />
            {f.time}
            {f.shift !== 0 ? (
              <span className="text-ink-3">{f.shift > 0 ? "+1" : "−1"}</span>
            ) : null}
          </span>
        );
      })}
      {/* The length grip on the right edge; its own square hit box. */}
      <span
        aria-hidden
        data-zo-grip=""
        {...grip}
        onPointerDown={(event) => {
          event.stopPropagation();
          grip.onPointerDown(event);
        }}
        className="absolute -right-2.5 flex h-7 w-5 cursor-ew-resize touch-pan-y items-center justify-center"
        style={{ bottom: (LANE_H - 28) / 2 }}
      >
        <span className="h-5 w-1.5 rounded-full border border-hairline-strong bg-popover shadow-sm" />
      </span>
    </motion.div>
  );

  const nowVisible = nowMin >= 0 && nowMin <= DAY;

  const timeline = (
    <div
      ref={scrollerRef}
      onClick={onTrackPress}
      className="[scrollbar-width:thin] overflow-x-auto overscroll-x-contain"
    >
      <div
        role="group"
        aria-labelledby={titleId}
        aria-label="Team availability"
        className="relative grid"
        style={{
          gridTemplateColumns: `var(--zo-name-w) ${trackW}px`,
          width: `calc(var(--zo-name-w) + ${trackW}px)`,
        }}
      >
        {/* Ruler */}
        <div
          data-zo-name=""
          className="sticky left-0 z-[3] flex items-end border-r border-b border-hairline bg-card px-3 pb-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
          style={{ height: RULER_H }}
        >
          {refZone}
        </div>
        <div
          data-zo-track=""
          className="relative border-b border-hairline"
          style={{ height: RULER_H }}
        >
          {Array.from({ length: 24 / hourStep + 1 }, (_, k) => {
            const h = k * hourStep;
            return (
              <span
                key={h}
                aria-hidden
                className="absolute bottom-1 -translate-x-1/2 font-mono text-[10px] text-ink-3 tabular-nums"
                style={{ left: Math.min(trackW - 8, Math.max(8, h * hw)) }}
              >
                {String(h % 24).padStart(2, "0")}
              </span>
            );
          })}
        </div>

        {/* People */}
        {people.map((p, i) => {
          const row = table[i] ?? [];
          const f = flagOf(p, i);
          return (
            <React.Fragment key={p.id}>
              <div
                className="sticky left-0 z-[3] flex items-center gap-2 border-r border-b border-hairline bg-card px-3"
                style={{ height: ROW_H }}
              >
                {avatar(p)}
                <div className="min-w-0 leading-tight">
                  <p
                    className="truncate text-[12px] font-medium text-foreground"
                    title={p.name}
                  >
                    {p.name}
                    {i === 0 ? (
                      <span className="font-normal text-ink-3"> · you</span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
                    {p.zone} {localNow(p)}
                  </p>
                </div>
                <span className="sr-only">
                  {`, ${f.time} at the band, ${whyWord(f.why).toLowerCase()}.`}
                </span>
              </div>
              <div
                aria-hidden
                data-zo-track=""
                className="relative cursor-pointer border-b border-hairline"
                style={{ height: ROW_H }}
              >
                {runsOf(row).map((run) =>
                  run.state === "off" ? (
                    <span
                      key={run.start}
                      className="absolute inset-y-0 bg-surface-2"
                      style={{
                        left: px(run.start),
                        width: px(run.end - run.start),
                        backgroundImage:
                          "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 6px)",
                      }}
                    />
                  ) : null,
                )}
                {(p.busy ?? []).map((b, k) => {
                  const s = b.start - (p.offset - refOffset);
                  const e = b.end - (p.offset - refOffset);
                  const a = clamp(s, 0, DAY);
                  const z = clamp(e, 0, DAY);
                  if (z <= a) return null;
                  const w = px(z - a);
                  return (
                    <span
                      key={k}
                      title={b.title}
                      className="absolute inset-y-2 flex items-center overflow-hidden rounded-2 border px-1.5 text-[10px] whitespace-nowrap text-ink-2"
                      style={{
                        left: r2(px(a) + 1),
                        width: r2(Math.max(2, w - 2)),
                        backgroundColor:
                          "color-mix(in oklab, var(--zo-busy) 20%, var(--card))",
                        borderColor:
                          "color-mix(in oklab, var(--zo-busy) 50%, transparent)",
                      }}
                    >
                      {w >= 44 ? b.title : null}
                    </span>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}

        {/* Everyone */}
        <div
          className="sticky left-0 z-[3] flex items-center gap-2 border-r border-hairline bg-card px-3 text-[12px] font-medium text-foreground"
          style={{ height: LANE_H }}
        >
          Everyone
          <span className="font-mono text-[10px] font-normal text-ink-3 tabular-nums">
            {windows.length === 1 ? "1 window" : `${windows.length} windows`}
          </span>
        </div>
        <div
          aria-hidden
          data-zo-track=""
          className="relative cursor-pointer"
          style={{ height: LANE_H }}
        >
          {windows.map((w) => {
            const lit =
              everyone &&
              shownStart >= w.start &&
              shownStart + shownLen <= w.end;
            return (
              <span
                key={w.start}
                className="absolute inset-y-1.5 rounded-full transition-[background-color,box-shadow] duration-300"
                style={{
                  left: r2(px(w.start) + 1),
                  width: r2(Math.max(4, px(w.end - w.start) - 2)),
                  backgroundColor: lit
                    ? "var(--zo-free)"
                    : "color-mix(in oklab, var(--zo-free) 42%, transparent)",
                  boxShadow: lit
                    ? "0 0 0 3px color-mix(in oklab, var(--zo-free) 22%, transparent)"
                    : "none",
                }}
              />
            );
          })}
          {windows.length === 0 ? (
            <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-ink-3">
              No hour suits everyone
            </span>
          ) : null}
        </div>

        {/* The band and the now-line, over every track. */}
        <div
          className="pointer-events-none absolute top-0 bottom-0"
          style={{ left: "var(--zo-name-w)", width: trackW }}
        >
          {nowVisible ? (
            <span
              aria-hidden
              className="absolute top-0 bottom-0 z-[1] w-px bg-danger/70"
              style={{ left: px(nowMin) }}
            >
              <span className="absolute top-0 -left-[3px] size-[7px] rounded-full bg-danger" />
            </span>
          ) : null}
          {ready ? <div className="pointer-events-auto">{band}</div> : null}
        </div>
      </div>
    </div>
  );

  // Pressing an empty part of a track moves the band there, centred. A
  // click, not a pointerdown: a finger panning the day never moves the band.
  function onTrackPress(event: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !ready) return;
    const target = event.target as HTMLElement;
    if (
      target.closest("[data-zo-band]") ||
      !target.closest("[data-zo-track]")
    ) {
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    const grid = el.firstElementChild as HTMLElement | null;
    const nameW =
      el.querySelector<HTMLElement>("[data-zo-name]")?.offsetWidth ?? 0;
    if (!grid) return;
    const x = event.clientX - grid.getBoundingClientRect().left - nameW;
    if (x < 0 || x > trackW) return;
    commitStart(x / ppm - len / 2, "press");
  }

  function chooseWindow(event: React.MouseEvent<HTMLButtonElement>) {
    if (disabled || !ready) return;
    const at = Number(event.currentTarget.dataset.zoWindow);
    if (!Number.isFinite(at)) return;
    commitStart(at, "suggest");
    onSuggest?.(slotOf(at, len));
  }

  function onStripPress(event: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !ready) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-zo-band]")) return;
    const box = stripRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const m = ((event.clientX - box.left) / box.width) * DAY;
    commitStart(m - len / 2, "press");
  }

  const list = (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div>
        <div
          ref={stripRef}
          onClick={onStripPress}
          className="relative h-11 cursor-pointer"
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-3 h-5 overflow-hidden rounded-full bg-surface-2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 6px)",
            }}
          >
            {windows.map((w) => (
              <span
                key={w.start}
                className="absolute inset-y-0"
                style={{
                  left: `${r2((w.start / DAY) * 100)}%`,
                  width: `${r2(((w.end - w.start) / DAY) * 100)}%`,
                  backgroundColor: "var(--zo-free)",
                }}
              />
            ))}
          </div>
          {ready ? (
            <motion.div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label="Meeting time"
              aria-describedby={hintId}
              aria-valuemin={0}
              aria-valuemax={DAY - len}
              aria-valuenow={start}
              aria-valuetext={describe(start, len)}
              aria-disabled={disabled || undefined}
              data-zo-band=""
              onKeyDown={onBandKey}
              {...strip}
              className={cn(
                "absolute top-1 h-9 min-w-3 cursor-grab touch-pan-y rounded-2 border-[1.5px] select-none before:absolute before:-inset-x-3 before:inset-y-0 before:content-[''] active:cursor-grabbing",
                FOCUS_RING,
              )}
              style={{
                left: "calc(var(--zo-start) / 1440 * 100%)",
                width: "calc(var(--zo-len) / 1440 * 100%)",
                ...bandSurface,
              }}
            />
          ) : null}
        </div>
        <div
          aria-hidden
          className="mt-1 flex justify-between font-mono text-[10px] text-ink-3 tabular-nums"
        >
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
      <ul className="flex flex-col">
        {people.map((p, i) => {
          const f = flagOf(p, i);
          const end = localOf(shownStart + shownLen, p, refOffset);
          return (
            <li
              key={p.id}
              className="flex items-center gap-2.5 border-b border-hairline py-2 last:border-b-0"
            >
              {avatar(p, "size-7 text-[10px]")}
              <div className="min-w-0 flex-1 leading-tight">
                <p
                  className="truncate text-[13px] font-medium text-foreground"
                  title={p.name}
                >
                  {p.name}
                </p>
                <p className="truncate text-[11px] text-ink-3">
                  {p.zone}
                  {i === 0 ? " · you" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-[12px] text-foreground tabular-nums">
                  {f.time}–{clock(end.minute)}
                  {f.shift !== 0 ? (
                    <span className="text-ink-3">
                      {f.shift > 0 ? " +1" : " −1"}
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-ink-3">
                  <span className={cn("size-1.5 rounded-full", dot(f.why))} />
                  {whyWord(f.why)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const best = (
    <aside className="hidden flex-col gap-2 border-l border-hairline p-3 @min-[64rem]:flex">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Best times
      </p>
      {fits.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          Nothing fits everyone for {lengthLabel(len)}.
        </p>
      ) : (
        fits.slice(0, 4).map((w) => {
          const on = start >= w.start && start + len <= w.end;
          return (
            <button
              key={w.start}
              type="button"
              aria-pressed={on}
              data-zo-window={w.start}
              onClick={chooseWindow}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-2 border px-2.5 py-2 text-left transition-colors",
                on
                  ? "border-[color-mix(in_oklab,var(--zo-free)_55%,transparent)] bg-[color-mix(in_oklab,var(--zo-free)_12%,transparent)]"
                  : "border-hairline hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <span className="font-mono text-[12px] text-foreground tabular-nums">
                {clock(w.start)}–{clock(w.end)}
              </span>
              <span className="text-[11px] text-ink-3">
                {lengthLabel(w.end - w.start)} window
              </span>
            </button>
          );
        })
      )}
    </aside>
  );

  const loadingRows = (
    <div aria-hidden className="flex flex-col gap-2 px-4 py-3">
      {people.map((p, i) => (
        <div
          key={p.id}
          className="flex items-center gap-3"
          style={{ height: ROW_H - 8 }}
        >
          <span className="size-7 shrink-0 rounded-full border border-dashed border-hairline-strong" />
          <span
            className="h-2.5 shrink-0 rounded-full border border-dashed border-hairline-strong"
            style={{ width: 56 + ((i * 23) % 40) }}
          />
          <span className="h-6 flex-1 rounded-2 border border-dashed border-hairline-strong motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );

  return (
    <motion.div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container grid w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--zo-start" as string]: startVar,
        ["--zo-len" as string]: lenVar,
        ["--zo-bloom" as string]: bloomVar,
        ["--zo-hw" as string]: hw,
        ["--zo-band" as string]: palette.band,
        ["--zo-band-ink" as string]:
          tone === "mono"
            ? "var(--primary)"
            : `oklch(from ${palette.band} 0.5 0.15 h)`,
        ["--zo-free" as string]: palette.free,
        ["--zo-busy" as string]: palette.busy,
      }}
    >
      {header}
      {summary}
      <p id={hintId} className="sr-only">
        Left and Right move the meeting fifteen minutes, Shift with them an
        hour. The bracket keys change its length. Enter picks the time, S
        suggests the next time everyone is free.
      </p>
      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Calendars did not load.</p>
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
      ) : (
        <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {status === "loading" ? (
            <div aria-busy="true">
              <p className="sr-only">Loading calendars.</p>
              {loadingRows}
            </div>
          ) : (
            <>
              <div className="hidden @min-[36rem]:grid @min-[64rem]:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="min-w-0 [--zo-name-w:9.5rem] @min-[48rem]:[--zo-name-w:11rem]">
                  {timeline}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[11px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-4 rounded-1 border border-hairline bg-card"
                      />
                      Working
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-4 rounded-1 border"
                        style={{
                          backgroundColor:
                            "color-mix(in oklab, var(--zo-busy) 20%, var(--card))",
                          borderColor:
                            "color-mix(in oklab, var(--zo-busy) 50%, transparent)",
                        }}
                      />
                      Busy
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-4 rounded-1 bg-surface-2"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 4px)",
                        }}
                      />
                      Outside hours
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-4 rounded-full bg-(--zo-free)"
                      />
                      Everyone free
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 px-4 pb-3 @min-[64rem]:hidden">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Best times
                    </span>
                    {fits.length === 0 ? (
                      <span className="text-[12px] text-ink-3">
                        Nothing suits everyone for {lengthLabel(len)}.
                      </span>
                    ) : null}
                    {fits.slice(0, 4).map((w) => {
                      const on = start >= w.start && start + len <= w.end;
                      return (
                        <button
                          key={w.start}
                          type="button"
                          aria-pressed={on}
                          data-zo-window={w.start}
                          onClick={chooseWindow}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] tabular-nums transition-colors",
                            on
                              ? "border-[color-mix(in_oklab,var(--zo-free)_55%,transparent)] bg-[color-mix(in_oklab,var(--zo-free)_14%,transparent)] text-foreground"
                              : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          {clock(w.start)}–{clock(w.end)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {best}
              </div>
              <div className="@min-[36rem]:hidden">{list}</div>
            </>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
