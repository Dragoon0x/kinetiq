"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  rubberband,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BinDayWeekday =
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type BinDayColours = "council" | "pastel" | "mono";

export type BinDayProps = {
  /** The current moment, ms or Date. Today, and so which bin is due, is read from it. */
  now: number | Date;
  /** Controlled collection weekday. */
  day?: BinDayWeekday;
  /** Collection weekday when uncontrolled. @default "thu" */
  defaultDay?: BinDayWeekday;
  /** Fires from the week strip with the chosen weekday. */
  onDayChange?: (day: BinDayWeekday) => void;
  /** Controlled: this collection's bin has been dealt with. */
  done?: boolean;
  /** Initial done state when uncontrolled; it is kept for this collection only. @default false */
  defaultDone?: boolean;
  /** Fires from Done, Undo or a drag that changed it. */
  onDoneChange?: (done: boolean) => void;
  /** How many bins take turns, one per collection: Rubbish, Recycling, Garden, Food. @default 3 */
  bins?: number;
  /** How the bins are coloured. @default "council" */
  colours?: BinDayColours;
  /** Names for the bins, in rotation order. */
  names?: string[];
  /** Shifts which bin a week starts the rotation on. @default 0 */
  offset?: number;
  /** Minutes east of UTC used to read `now` as a calendar day. @default 0 */
  utcOffset?: number;
  /** The widget's accessible name. @default "Bin day" */
  label?: string;
  /** Play the bins landing and the strip's steps. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Calendar, as day numbers so the server and the browser agree        */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
const WEEKDAYS: BinDayWeekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MO = [
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
const toMs = (v: number | Date) => (typeof v === "number" ? v : v.getTime());
const weekdayOf = (day: number) => new Date(day * DAY).getUTCDay();
const short = (day: number) => {
  const d = new Date(day * DAY);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const long = (day: number) => {
  const d = new Date(day * DAY);
  return `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MO_LONG[d.getUTCMonth()]}`;
};
/** Weeks start on Monday: day 0 was a Thursday. */
const weekOf = (day: number) => Math.floor((day + 3) / 7);

/* ------------------------------------------------------------------ */
/* Bins                                                                */
/* ------------------------------------------------------------------ */

type Kind = "rubbish" | "recycling" | "garden" | "food";
const KINDS: Kind[] = ["rubbish", "recycling", "garden", "food"];
const KIND_NAME: Record<Kind, string> = {
  rubbish: "Rubbish",
  recycling: "Recycling",
  garden: "Garden",
  food: "Food",
};

/** Fixed pigments: a bin is the same colour on a light page and a dark one. */
const PAINT: Record<
  BinDayColours,
  Record<Kind, { body: string; lid: string }>
> = {
  council: {
    rubbish: { body: "oklch(0.39 0.012 250)", lid: "oklch(0.32 0.012 250)" },
    recycling: { body: "oklch(0.52 0.13 255)", lid: "oklch(0.45 0.13 255)" },
    garden: { body: "oklch(0.52 0.12 148)", lid: "oklch(0.45 0.12 148)" },
    food: { body: "oklch(0.52 0.08 58)", lid: "oklch(0.45 0.08 58)" },
  },
  pastel: {
    rubbish: { body: "oklch(0.78 0.02 250)", lid: "oklch(0.71 0.025 250)" },
    recycling: { body: "oklch(0.8 0.07 240)", lid: "oklch(0.73 0.08 240)" },
    garden: { body: "oklch(0.82 0.07 150)", lid: "oklch(0.75 0.08 150)" },
    food: { body: "oklch(0.82 0.06 62)", lid: "oklch(0.75 0.07 62)" },
  },
  mono: {
    rubbish: { body: "oklch(0.32 0 0)", lid: "oklch(0.27 0 0)" },
    recycling: { body: "oklch(0.5 0 0)", lid: "oklch(0.44 0 0)" },
    garden: { body: "oklch(0.66 0 0)", lid: "oklch(0.6 0 0)" },
    food: { body: "oklch(0.8 0 0)", lid: "oklch(0.73 0 0)" },
  },
};

/** Each bin's front sign, drawn in its own lid colour on a pale plate. */
const ICON: Record<Kind, React.ReactNode> = {
  rubbish: (
    <>
      <path d="M15.6 23.4h6.8l.9 5.8h-8.6Z" />
      <path d="M17.4 23.4l1.6-2 1.6 2" />
    </>
  ),
  recycling: (
    <>
      <path d="M19 20.8l4.2 7.4h-8.4Z" />
      <path d="M21.7 28.2h1.5l-.8-1.4" />
    </>
  ),
  garden: (
    <>
      <path d="M15.2 29c0-5.2 3.4-7.4 8-7.6 0 4.6-2.4 7.6-8 7.6Z" />
      <path d="M15.2 29l5-4.6" />
    </>
  ),
  food: (
    <>
      <path d="M19 23.2c-2.9-1.5-4.6 1-3.6 3.4.8 2.2 2.5 2.9 3.6 2 1.1.9 2.8.2 3.6-2 1-2.4-.7-4.9-3.6-3.4Z" />
      <path d="M19 23.2l.8-1.9" />
    </>
  ),
};

/** The scene, in px: bins stand at the back, the kerb is the bottom edge. */
const SCENE_H = 96;
const BIN_W = 38;
const BIN_H = 48;
const ROW_TOP = 4;
const SLOT = 54;
/** How far forward the kerb is from the row. */
const KERB = 30;
/** A bin at the kerb is nearer the viewer. */
const NEAR = 0.12;

/** How much a bin foreshortens tipped back on its wheels, and the body it shortens. */
const TIP = 0.07;
const BODY_H = 35.4;
/** How far an open lid lifts, in px per unit of its spring. */
const LID = 5;

const r2 = (v: number) => Math.round(v * 100) / 100;

type BinValues = {
  y: MotionValue<number>;
  tilt: MotionValue<number>;
  rock: MotionValue<number>;
  lid: MotionValue<number>;
};

function Bin({
  kind,
  colours,
  values,
  left,
  tag,
  grabbable,
}: {
  kind: Kind;
  colours: BinDayColours;
  values: BinValues;
  left: number;
  tag: string | null;
  grabbable: boolean;
}) {
  const paint = (PAINT[colours] ?? PAINT.council)[kind];
  const scale = useTransform(values.y, (y) =>
    r2(1 + (NEAR * Math.max(0, Math.min(KERB, y))) / KERB),
  );
  const z = useTransform(values.y, (y) => (y > 2 ? 2 : 1));
  // Tipped back on its wheels, a bin's front foreshortens and the top of
  // its lid comes into view.
  const bodyScale = useTransform(values.tilt, (t) => r2(1 - TIP * t));
  // The body's top comes down as it foreshortens; the lid rides on it.
  const sink = useTransform(values.tilt, (t) => r2(TIP * BODY_H * t));
  const open = useTransform(values.lid, (l) => Math.max(0, l));
  const lidY = useTransform(
    [values.lid, sink] as MotionValue<number>[],
    ([l = 0, k = 0]: number[]) => r2(k - LID * Math.max(0, l)),
  );
  const gapH = useTransform(open, (l) => r2(LID * l));
  const gapY = useTransform(
    [gapH, sink] as MotionValue<number>[],
    ([g = 0, k = 0]: number[]) => r2(k - g),
  );
  const lidTop = useTransform(
    [values.lid, values.tilt] as MotionValue<number>[],
    ([l = 0, t = 0]: number[]) => r2(0.6 + 2.6 * t + 1.6 * Math.max(0, l)),
  );
  const lidTopY = useTransform(lidTop, (h) => r2(6 - h));

  return (
    <motion.div
      data-bin={kind}
      className={cn(
        "absolute",
        grabbable ? "cursor-grab touch-pan-x active:cursor-grabbing" : "",
      )}
      style={{
        left,
        top: ROW_TOP,
        width: BIN_W,
        height: BIN_H,
        y: values.y,
        scale,
        rotate: values.rock,
        originX: 0.5,
        originY: 1,
        zIndex: z,
      }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${BIN_W} ${BIN_H}`}
        width={BIN_W}
        height={BIN_H}
        className="block overflow-visible"
      >
        <ellipse cx={19} cy={46.6} rx={17} ry={1.6} className="fill-ink-3/25" />
        <ellipse cx={7} cy={45.4} rx={3.2} ry={2.5} fill="oklch(0.24 0 0)" />
        <ellipse cx={31} cy={45.4} rx={3.2} ry={2.5} fill="oklch(0.24 0 0)" />
        <motion.g style={{ scaleY: bodyScale, originX: 0.5, originY: 1 }}>
          <path
            d="M3 9h32l-2.6 33.6a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8Z"
            fill={paint.body}
          />
          <path
            d="M26 9h9l-2.6 33.6a2 2 0 0 1-2 1.8h-3.4Z"
            fill="oklch(0 0 0)"
            opacity={0.14}
          />
          <rect
            x={12}
            y={19}
            width={14}
            height={12}
            rx={2}
            fill="oklch(0.96 0.006 90)"
            opacity={0.9}
          />
          <g
            fill="none"
            stroke={paint.lid}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICON[kind]}
          </g>
        </motion.g>
        <motion.rect
          x={3.4}
          y={9}
          width={31.2}
          rx={0.6}
          fill="oklch(0.16 0.01 250)"
          style={{ height: gapH, y: gapY }}
        />
        <motion.g style={{ y: lidY }}>
          <rect
            x={6}
            y={2.4}
            width={26}
            height={2.6}
            rx={1.3}
            fill={paint.lid}
          />
          <motion.rect
            x={2.2}
            width={33.6}
            rx={1.4}
            fill={paint.lid}
            opacity={0.75}
            style={{ y: lidTopY, height: lidTop }}
          />
          <rect
            x={1.6}
            y={5.6}
            width={34.8}
            height={4.4}
            rx={1.4}
            fill={paint.lid}
          />
          <rect
            x={3}
            y={5.9}
            width={32}
            height={0.8}
            rx={0.4}
            fill="oklch(1 0 0)"
            opacity={0.22}
          />
        </motion.g>
      </svg>
      {tag ? (
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 font-mono text-[9px] leading-none tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">
          {tag}
        </span>
      ) : null}
    </motion.div>
  );
}

function Crescent() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className="absolute top-1 right-1 size-2 fill-current text-ink-3"
    >
      <path d="M5.4 1.1a3 3 0 1 0 1.5 4.8A2.5 2.5 0 1 1 5.4 1.1Z" />
    </svg>
  );
}

type Latest = {
  roll: (
    i: number,
    toKerb: boolean,
    velocity: number,
    audible: boolean,
  ) => void;
  onY: (i: number, y: number) => void;
};

/**
 * Which bin goes out, and when. The bins stand in a row by the house and
 * the one due this collection has been rolled to the kerb: a bin that moves
 * tips back onto its wheels, rolls on the glide spring and grows as it comes
 * forward, then drops onto its feet with a rock and a lid thrown open by the
 * jolt, both on the recoil spring. Done rolls it home with a tick, Undo rolls
 * it out again with a thud, and the bin after it wears a "Next" tag. The due
 * bin can be dragged too, 1:1 and rubber-banded, and a release lands where
 * the throw was heading; the others are not due and will not go.
 *
 * Underneath, the next seven days, starting today, are the collection-day
 * picker: a real radio group whose pill hops between days on the snap
 * spring, with a crescent on the night the bin goes out. Under reduced
 * motion nothing tips, rolls or rocks: bins swap places and the pill swaps
 * days, and every word still changes.
 */
export function BinDay({
  now,
  day,
  defaultDay = "thu",
  onDayChange,
  done,
  defaultDone = false,
  onDoneChange,
  bins = 3,
  colours = "council",
  names,
  offset = 0,
  utcOffset = 0,
  label = "Bin day",
  sound = false,
  disabled = false,
  className,
}: BinDayProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const lineId = `${uid}-line`;

  const n = Math.max(2, Math.min(4, Math.round(bins)));
  const scheme: BinDayColours = colours in PAINT ? colours : "council";
  const nameOf = (i: number) => {
    const kind = KINDS[i] ?? "rubbish";
    return names?.[i] ?? KIND_NAME[kind];
  };

  const today = Math.floor((toMs(now) + utcOffset * 60_000) / DAY);
  const todayWd = weekdayOf(today);

  const [ownDay, setOwnDay] = React.useState<BinDayWeekday>(defaultDay);
  const collection: BinDayWeekday =
    day !== undefined && WEEKDAYS.includes(day) ? day : ownDay;
  const until = (WEEKDAYS.indexOf(collection) - todayWd + 7) % 7;
  const dueDay = today + until;
  const binOf = (d: number) => (((weekOf(d) + offset) % n) + n) % n;
  const due = binOf(dueDay);
  const next = binOf(dueDay + 7);

  // Uncontrolled, Done belongs to one collection: when its day has passed,
  // the next bin is due and nothing is done yet.
  const [doneFor, setDoneFor] = React.useState<number | null>(() =>
    defaultDone ? dueDay : null,
  );
  const isDone = done ?? doneFor === dueDay;

  const [values] = React.useState<BinValues[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({
      y: motionValue(i === due && !isDone ? KERB : 0),
      tilt: motionValue(0),
      rock: motionValue(0),
      lid: motionValue(0),
    })),
  );
  const pill = React.useState(() => motionValue(until))[0];

  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const shown = React.useRef<boolean[]>(
    Array.from({ length: 4 }, (_, i) => i === due && !isDone),
  );
  const heading = React.useRef<("kerb" | "row" | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const audible = React.useRef<boolean[]>([false, false, false, false]);
  const pending = React.useRef<{ velocity: number; audible: boolean } | null>(
    null,
  );
  const grabbed = React.useRef<{ i: number; start: number } | null>(null);
  const latest = React.useRef<Latest | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const panOf = (i: number) => {
    const el = sceneRef.current?.querySelector(`[data-bin="${KINDS[i]}"]`);
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** Down onto its feet at the kerb: the tilt, the rock and the lid all recoil. */
  const land = (i: number) => {
    const v = values[i];
    if (!v) return;
    heading.current[i] = null;
    if (audible.current[i]) {
      audible.current[i] = false;
      audio.play("thud", { pitch: 0.9, gain: 0.6, pan: panOf(i) });
    }
    if (!motionSafe) return;
    const side = i % 2 === 0 ? 1 : -1;
    run(`tilt-${i}`, animate(v.tilt, 0, springs.recoil));
    run(
      `rock-${i}`,
      animate(v.rock, 0, { ...springs.recoil, velocity: side * 90 }),
    );
    // Thrown up by the jolt from closed: drawn only above zero, the
    // recoil's swings read as the lid slamming and bouncing.
    run(`lid-${i}`, animate(v.lid, 0, { ...springs.recoil, velocity: 22 }));
  };

  /** Home in the row: it stands up with a small settle. */
  const arrive = (i: number) => {
    const v = values[i];
    if (!v) return;
    heading.current[i] = null;
    if (audible.current[i]) {
      audible.current[i] = false;
      audio.play("tick", { pitch: 0.85, gain: 0.5, pan: panOf(i) });
    }
    if (!motionSafe) return;
    run(`tilt-${i}`, animate(v.tilt, 0, springs.snap));
    run(
      `rock-${i}`,
      animate(v.rock, 0, {
        ...springs.snap,
        velocity: (i % 2 === 0 ? -1 : 1) * 40,
      }),
    );
  };

  const roll = (
    i: number,
    toKerb: boolean,
    velocity: number,
    loud: boolean,
  ) => {
    const v = values[i];
    if (!v) return;
    const target = toKerb ? KERB : 0;
    audible.current[i] = loud;
    if (!motionSafe) {
      anims.current.get(`y-${i}`)?.stop();
      v.y.set(target);
      v.tilt.set(0);
      v.rock.set(0);
      v.lid.set(0);
      heading.current[i] = toKerb ? "kerb" : "row";
      if (toKerb) land(i);
      else arrive(i);
      return;
    }
    heading.current[i] = toKerb ? "kerb" : "row";
    if (Math.abs(v.y.get() - target) < 1.5) {
      v.y.set(target);
      if (toKerb) land(i);
      else arrive(i);
      return;
    }
    run(`tilt-${i}`, animate(v.tilt, 1, springs.flick));
    run(`y-${i}`, animate(v.y, target, { ...springs.glide, velocity }));
  };

  const onY = (i: number, y: number) => {
    const h = heading.current[i];
    if (h === "kerb" && y >= KERB - 1.5) land(i);
    else if (h === "row" && y <= 1.5) arrive(i);
  };

  React.useEffect(() => {
    latest.current = { roll, onY };
  });

  // Where each bin should stand. A change — from Done, a drag, the strip, a
  // new day — rolls the bins whose place changed. It re-runs harmlessly:
  // a bin already heading to its place is left alone.
  const places = Array.from(
    { length: 4 },
    (_, i) => i < n && i === due && !isDone,
  );
  const placesKey = places.map((p) => (p ? 1 : 0)).join("");
  React.useEffect(() => {
    const hint = pending.current;
    pending.current = null;
    placesKey.split("").forEach((p, i) => {
      const toKerb = p === "1";
      if (shown.current[i] === toKerb) return;
      shown.current[i] = toKerb;
      latest.current?.roll(
        i,
        toKerb,
        hint?.velocity ?? 0,
        hint?.audible ?? false,
      );
    });
  }, [placesKey]);

  // A hint is for the commit its handler caused, and no later one.
  React.useEffect(() => {
    pending.current = null;
  });

  React.useEffect(() => {
    const offs = values.map((v, i) =>
      v.y.on("change", (y) => latest.current?.onY(i, y)),
    );
    return () => offs.forEach((off) => off());
  }, [values]);

  // The pill follows the collection day across the strip.
  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("pill")?.stop();
      pill.set(until);
      return;
    }
    run("pill", animate(pill, until, springs.snap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until, motionSafe]);

  // A first look: the bin at the kerb has just been set down.
  React.useEffect(() => {
    if (!motionSafe) return;
    const i = shown.current.findIndex(Boolean);
    const v = values[i];
    if (!v) return;
    const t = window.setTimeout(() => {
      run(`rock-${i}`, animate(v.rock, 0, { ...springs.recoil, velocity: 60 }));
      run(`lid-${i}`, animate(v.lid, 0, { ...springs.recoil, velocity: 16 }));
    }, 320);
    return () => window.clearTimeout(t);
    // Once per mount; the bins it moves are already in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const setDone = (next: boolean, velocity = 0) => {
    if (disabled) return;
    if (next === isDone) {
      // Nothing to change: the bin goes back where it belongs.
      const i = due;
      latest.current?.roll(i, !isDone, velocity, true);
      return;
    }
    pending.current = { velocity, audible: true };
    if (done === undefined) setDoneFor(next ? dueDay : null);
    else {
      // Controlled: the bin goes back to where the host has it; when the
      // host answers, the bins roll from there.
      latest.current?.roll(due, !isDone, velocity, false);
    }
    onDoneChange?.(next);
  };

  const choose = (index: number) => {
    if (disabled) return;
    const target = WEEKDAYS[weekdayOf(today + index)];
    if (!target) return;
    const cells =
      stripRef.current?.querySelectorAll<HTMLElement>("[role='radio']");
    cells?.[index]?.focus();
    if (target === collection) return;
    const rect = cells?.[index]?.getBoundingClientRect();
    audio.play("tick", {
      pitch: 1.5,
      gain: 0.32,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    pending.current = { velocity: 0, audible: true };
    if (day === undefined) setOwnDay(target);
    onDayChange?.(target);
  };
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      const g = grabbed.current;
      const v = g ? values[g.i] : undefined;
      if (!g || !v) return;
      g.start = v.y.get();
      for (const key of [`y-${g.i}`, `rock-${g.i}`]) {
        anims.current.get(key)?.stop();
      }
      heading.current[g.i] = null;
      if (motionSafe) run(`tilt-${g.i}`, animate(v.tilt, 1, springs.flick));
    },
    onMove: ({ offset }) => {
      const g = grabbed.current;
      const v = g ? values[g.i] : undefined;
      if (!g || !v) return;
      const raw = g.start + offset.y;
      // The due bin follows the hand between the row and the kerb; the
      // others are not going anywhere and barely give.
      v.y.set(
        r2(
          g.i === due
            ? rubberClamp(raw, 0, KERB, 40)
            : rubberband(raw - g.start, 60) * 0.35 + g.start,
        ),
      );
    },
    onEnd: ({ velocity }) => {
      const g = grabbed.current;
      grabbed.current = null;
      const v = g ? values[g.i] : undefined;
      if (!g || !v) return;
      if (g.i !== due) {
        latest.current?.roll(
          g.i,
          shown.current[g.i] ?? false,
          velocity.y,
          false,
        );
        return;
      }
      const landing = project(v.y.get(), velocity.y, 0.99);
      setDone(landing < KERB / 2, velocity.y);
    },
    onCancel: () => {
      const g = grabbed.current;
      grabbed.current = null;
      if (!g) return;
      latest.current?.roll(g.i, shown.current[g.i] ?? false, 0, false);
    },
    onTap: () => {
      const g = grabbed.current;
      grabbed.current = null;
      const v = g ? values[g.i] : undefined;
      if (!g || !v || !motionSafe) return;
      // A knock on a bin rattles its lid.
      run(`lid-${g.i}`, animate(v.lid, 0, { ...springs.recoil, velocity: 14 }));
    },
  });

  /* Words -------------------------------------------------------------- */

  const dueName = nameOf(due);
  const nextName = nameOf(next);
  const dueKind = KINDS[due] ?? "rubbish";
  const pigment = (PAINT[scheme] ?? PAINT.council)[dueKind].body;
  const chip = isDone
    ? "Done"
    : until === 0
      ? "Today"
      : until === 1
        ? "Out tonight"
        : `Out ${WD[weekdayOf(dueDay - 1)]} night`;
  const whenSpoken =
    until === 0
      ? "is collected today"
      : until === 1
        ? "goes out tonight"
        : `goes out ${WD_LONG[weekdayOf(dueDay - 1)]} night`;
  const line = isDone
    ? `Next: ${nextName}, ${short(dueDay + 7)}`
    : `${short(dueDay)} · then ${nextName}`;
  const others = Array.from({ length: n }, (_, i) => i)
    .filter((i) => isDone || i !== due)
    .map(nameOf);
  const listed =
    others.length <= 1
      ? (others[0] ?? "")
      : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
  const picture = isDone
    ? "All bins are by the house."
    : `${dueName} is out at the kerb. ${listed} ${others.length === 1 ? "is" : "are"} by the house.`;

  const sayKey = `${dueDay}|${due}|${isDone}|${collection}|${n}`;
  const [said, setSaid] = React.useState({
    key: sayKey,
    done: isDone,
    day: collection,
    n: 0,
    text: "",
  });
  if (said.key !== sayKey) {
    setSaid({
      key: sayKey,
      done: isDone,
      day: collection,
      n: said.n + 1,
      text:
        isDone && !said.done
          ? `${dueName} done. Next: ${nextName}, ${long(dueDay + 7)}.`
          : collection !== said.day
            ? `Collection day ${WD_LONG[WEEKDAYS.indexOf(collection)]}. ${dueName} ${whenSpoken}.`
            : `${dueName} ${whenSpoken}.`,
    });
  }

  const pillLeft = useTransform(
    pill,
    (p) => `calc((100% + 4px) * ${Number((p / 7).toFixed(3))})`,
  );
  const rowWidth = n * SLOT;

  return (
    <div className={cn("w-full max-w-xs", className)}>
      <div
        role="group"
        aria-label={label}
        aria-describedby={`${titleId} ${lineId}`}
        className={cn(
          "flex flex-col gap-3 rounded-4 border border-hairline bg-card p-3",
          disabled && "opacity-50",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              id={titleId}
              className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: pigment }}
              />
              <span className="truncate" title={dueName}>
                {dueName}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-[0.06em] uppercase",
                  isDone
                    ? "bg-success/12 text-success"
                    : until <= 1
                      ? "bg-warn/14 text-warn"
                      : "bg-surface-2 text-ink-2",
                )}
              >
                {chip}
              </span>
            </p>
            <p
              id={lineId}
              title={line}
              className="mt-0.5 truncate text-xs text-ink-3"
            >
              {line}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDone(!isDone)}
            aria-label={
              isDone ? `Undo: ${dueName} back out` : `Mark ${dueName} done`
            }
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed",
              isDone
                ? "border-hairline text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground"
                : "border-transparent bg-primary text-primary-foreground enabled:hover:bg-primary/90",
            )}
          >
            {isDone ? "Undo" : "Done"}
          </button>
        </div>

        <div
          ref={sceneRef}
          role="img"
          aria-label={picture}
          onPointerDown={(event) => {
            const hit =
              event.target instanceof Element
                ? event.target.closest("[data-bin]")
                : null;
            const i = hit
              ? KINDS.indexOf(hit.getAttribute("data-bin") as Kind)
              : -1;
            grabbed.current = i >= 0 && i < n ? { i, start: 0 } : null;
            if (grabbed.current) drag.onPointerDown(event);
          }}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onLostPointerCapture={drag.onLostPointerCapture}
          className="relative overflow-clip rounded-3 bg-surface-0 [contain:paint] select-none"
          style={{ height: SCENE_H }}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[38px] border-b border-hairline bg-surface-2 bg-[repeating-linear-gradient(90deg,var(--hairline)_0_1px,transparent_1px_14px)]"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-3 border-t border-hairline-strong bg-surface-2 bg-[repeating-linear-gradient(90deg,var(--hairline-strong)_0_1px,transparent_1px_30px)]"
          />
          <div
            className="absolute inset-y-0 left-1/2"
            style={{ width: rowWidth, marginLeft: -rowWidth / 2 }}
          >
            {Array.from({ length: n }, (_, i) => {
              const kind = KINDS[i] ?? "rubbish";
              const v = values[i];
              if (!v) return null;
              return (
                <Bin
                  key={kind}
                  kind={kind}
                  colours={scheme}
                  values={v}
                  left={i * SLOT + (SLOT - BIN_W) / 2}
                  tag={
                    i === next ? "Next" : isDone && i === due ? "Done" : null
                  }
                  grabbable={!disabled && i === due}
                />
              );
            })}
          </div>
        </div>

        <div
          ref={stripRef}
          role="radiogroup"
          aria-label="Collection day"
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            const keys: Record<string, number> = {
              ArrowRight: until + 1,
              ArrowDown: until + 1,
              ArrowLeft: until - 1,
              ArrowUp: until - 1,
              Home: 0,
              End: 6,
            };
            const to = keys[event.key];
            if (to === undefined) return;
            event.preventDefault();
            choose((to + 7) % 7);
          }}
          className="relative grid grid-cols-7 gap-1"
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-2"
            style={{
              left: pillLeft,
              width: "calc((100% - 24px) / 7)",
              background: `color-mix(in oklab, ${pigment} 18%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${pigment} 55%, transparent)`,
            }}
          />
          {Array.from({ length: 7 }, (_, k) => {
            const d = today + k;
            const wd = weekdayOf(d);
            const checked = k === until;
            const eve = !isDone && until >= 1 && k === until - 1;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${long(d)}${k === 0 ? ", today" : ""}`}
                tabIndex={checked ? 0 : -1}
                disabled={disabled}
                onClick={() => choose(k)}
                className={cn(
                  "relative flex h-10 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "enabled:hover:bg-surface-2 disabled:cursor-not-allowed",
                )}
              >
                {eve ? <Crescent /> : null}
                <span className="font-mono text-[9px] leading-none text-ink-3 uppercase">
                  {WD[wd]?.slice(0, 2)}
                </span>
                <span
                  className={cn(
                    "text-xs leading-none tabular-nums",
                    k === 0
                      ? "font-semibold text-foreground"
                      : checked
                        ? "font-medium text-foreground"
                        : "text-ink-2",
                  )}
                >
                  {new Date(d * DAY).getUTCDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
