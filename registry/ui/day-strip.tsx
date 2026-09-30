"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DayStripProps = {
  /** The first day on the strip, as an ISO date (`2026-09-28`). */
  start: string;
  /** How many days the strip holds. @default 35 */
  days?: number;
  /** Controlled: the ISO date under the lens. */
  value?: string;
  /** Starting day when uncontrolled. @default `today` if it is on the strip, else `start` */
  defaultValue?: string;
  /** Fires from the throw, tap, key or wheel that chose a day, with its ISO date. */
  onValueChange?: (day: string) => void;
  /** Events per day, by ISO date: up to three dots are drawn under a day. */
  events?: Readonly<Record<string, number>>;
  /** The ISO date to mark as today. */
  today?: string;
  /** The strip's accessible name. @default "Day" */
  label?: string;
  /** How quickly a throw dies, 0 to 1: a light strip coasts through weeks, a heavy one stops in days. @default 0.5 */
  friction?: number;
  /** The lens's magnification, 1 to 1.6. At 1 the frame marks the day and nothing swells. @default 1.3 */
  lens?: number;
  /** How many days fit across the strip, 3 to 15. @default 7 */
  visible?: number;
  /** Dots under days with events, and the count in the header. @default true */
  dots?: boolean;
  /** A tick per day passing the lens and a detent as one lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const DAY_MS = 86_400_000;
/** The most a pull past the first or last day can give, in days. */
const EDGE = 2;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
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
] as const;
const MONTHS_LONG = [
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
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (t: number) => t * t * (3 - 2 * t);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An ISO day as a count of days since 1970-01-01. The arithmetic is all UTC,
 * so a server in one time zone and a browser in another draw the same days.
 */
function dayNumber(iso: string | undefined): number | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

type Day = {
  iso: string;
  weekday: number;
  date: number;
  month: number;
  year: number;
  events: number;
  today: boolean;
  name: string;
};

const plural = (n: number, one: string) =>
  n === 1 ? `1 ${one}` : `${n} ${one}s`;

/**
 * A strip of days you throw. It follows the finger 1:1 and rubber-bands past
 * the first and last day; let go, and the throw is projected with a
 * deceleration set by `friction` to the day it would come to rest on, then
 * decays onto exactly that day (the same time constant, its end fixed), so
 * it keeps its momentum and lands soft under the centre lens. The lens
 * catches the day with a small swell on the recoil spring. Tapping a day
 * glides it to the lens; a sideways trackpad swipe scrolls it and settles
 * when the wheel goes quiet.
 *
 * Every day is placed from one motion value (the strip's position, in days)
 * in percent of its own width, so the markup is right at any width. The lens
 * magnifies with a fisheye: a day swells by `lens` as it nears the centre and
 * its neighbours part to make room. A tick sounds as each day passes the
 * lens — a ratchet that slows as a throw dies — and a detent as one lands.
 *
 * It is a listbox: Left and Right move a day, PageUp and PageDown a week,
 * Home and End the ends, with the same flight and sounds. Under reduced
 * motion the strip still follows the finger, but a release, tap or key puts
 * the day under the lens in one step, and the detent still sounds.
 */
export function DayStrip({
  start,
  days = 35,
  value,
  defaultValue,
  onValueChange,
  events,
  today,
  label = "Day",
  friction = 0.5,
  lens = 1.3,
  visible = 7,
  dots = true,
  sound = false,
  disabled = false,
  className,
}: DayStripProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const id = React.useId();
  const count = Math.max(1, Math.round(Number.isFinite(days) ? days : 35));
  const vis = Math.round(clamp(Number.isFinite(visible) ? visible : 7, 3, 15));
  const zoom = r2(clamp(Number.isFinite(lens) ? lens : 1.3, 1, 1.6));
  // A light strip keeps its speed for longer: the throw's time constant, ms.
  const tau = lerp(650, 160, clamp01(friction));
  const first = dayNumber(start) ?? 0;

  const list = React.useMemo<Day[]>(() => {
    const todayNumber = dayNumber(today);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date((first + i) * DAY_MS);
      const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const n = Math.max(0, Math.round(events?.[iso] ?? 0));
      const isToday = todayNumber === first + i;
      const weekday = d.getUTCDay();
      const name = [
        `${WEEKDAYS_LONG[weekday] ?? ""} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`,
        isToday ? "today" : null,
        n > 0 ? plural(n, "event") : null,
      ]
        .filter(Boolean)
        .join(", ");
      return {
        iso,
        weekday,
        date: d.getUTCDate(),
        month: d.getUTCMonth(),
        year: d.getUTCFullYear(),
        events: n,
        today: isToday,
        name,
      };
    });
  }, [count, first, events, today]);

  const indexOf = (iso: string | undefined): number | null => {
    const d = dayNumber(iso);
    if (d === null) return null;
    return clamp(d - first, 0, count - 1);
  };
  const [own, setOwn] = React.useState(() => {
    const fromDefault = indexOf(defaultValue);
    if (fromDefault !== null) return fromDefault;
    const t = dayNumber(today);
    return t !== null && t >= first && t < first + count ? t - first : 0;
  });
  const selected = clamp(
    (value !== undefined ? indexOf(value) : null) ?? own,
    0,
    count - 1,
  );

  // The day passing under the lens right now: a reading for the header.
  const [under, setUnder] = React.useState(selected);
  const [, setReleased] = React.useState(0);
  const [grabbing, setGrabbing] = React.useState(false);

  const pos = useMotionValue(selected);
  const catchScale = useMotionValue(1);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const flight = React.useRef<AnimationPlaybackControls | null>(null);
  const catchRun = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(selected);
  const launch = React.useRef<{ velocity: number; throw: boolean } | null>(
    null,
  );
  const landing = React.useRef<number | null>(null);
  const lensDay = React.useRef(selected);
  const dragging = React.useRef(false);
  const from = React.useRef(0);
  const cellWidth = React.useRef(1);
  const detach = React.useRef<(() => void) | null>(null);
  const wheel = React.useRef<{ raw: number; timer: number } | null>(null);
  // Only a throw, tap, key or wheel is heard; a host moving the strip is not.
  const audible = React.useRef(false);

  const latest = React.useRef({ audio, motionSafe, count, disabled, vis });
  React.useEffect(() => {
    latest.current = { audio, motionSafe, count, disabled, vis };
  });

  const land = React.useCallback(() => {
    landing.current = null;
    const now = latest.current;
    if (!audible.current) return;
    const r = viewportRef.current?.getBoundingClientRect();
    now.audio.play("detent", {
      pitch: 0.85,
      gain: 0.5,
      pan: r ? panFrom(r.left + r.width / 2, null) : 0,
    });
    if (!now.motionSafe) return;
    // The lens catches the day: a swell and two small settles, a landing.
    catchRun.current?.stop();
    catchRun.current = animate(catchScale, 1, {
      ...springs.recoil,
      velocity: 1.5,
    });
  }, [catchScale]);

  const fly = (
    target: number,
    thrown: { velocity: number; throw: boolean } | null,
  ) => {
    flight.current?.stop();
    const at = pos.get();
    landing.current = audible.current ? target : null;
    if (!motionSafe) {
      pos.set(target);
      if (landing.current !== null) land();
      return;
    }
    if (Math.abs(at - target) < 0.04) {
      flight.current = animate(pos, target, springs.flick);
      if (landing.current !== null) land();
      return;
    }
    if (thrown?.throw && at >= 0 && at <= count - 1) {
      // Momentum: decay onto the chosen day with the throw's own time
      // constant, so the speed it leaves the finger with is the speed it has.
      flight.current = animate(pos, target, {
        type: "inertia",
        velocity: thrown.velocity,
        power: tau / 1000,
        timeConstant: tau,
        modifyTarget: () => target,
        restDelta: 0.003,
      });
      return;
    }
    // A tap, a key, or a release past an end: a move, not a throw.
    flight.current = animate(pos, target, {
      ...(thrown?.throw ? springs.snap : springs.glide),
      ...(thrown ? { velocity: thrown.velocity } : {}),
    });
  };

  // The flight: looks at every commit and acts when the day moved or a
  // release is waiting. A release the host did not take flies back.
  React.useLayoutEffect(() => {
    const moved = shown.current !== selected;
    const thrown = launch.current;
    launch.current = null;
    shown.current = selected;
    if ((!moved && !thrown) || dragging.current) return;
    audible.current = thrown !== null;
    fly(selected, thrown);
  });

  // Ticks and the landing come from the strip itself, on the frame a day
  // crosses the lens or settles under it, whatever moved it.
  React.useEffect(() => {
    const unsubscribe = pos.on("change", (p) => {
      const now = latest.current;
      const k = clamp(Math.round(p), 0, now.count - 1);
      if (k !== lensDay.current) {
        lensDay.current = k;
        setUnder(k);
        if (audible.current) {
          const speed = Math.abs(pos.getVelocity());
          const r = viewportRef.current?.getBoundingClientRect();
          // Faster days tick a little higher and louder: a ratchet spinning up.
          now.audio.play("tick", {
            pitch: r2(0.9 + Math.min(0.5, speed / 50)),
            gain: r2(Math.min(0.5, 0.26 + speed / 120)),
            pan: r ? panFrom(r.left + r.width / 2, null) : 0,
          });
        }
      }
      const target = landing.current;
      if (target !== null && Math.abs(p - target) < 0.04) land();
    });
    return unsubscribe;
  }, [pos, land]);

  React.useEffect(() => {
    const owned = wheel;
    return () => {
      flight.current?.stop();
      catchRun.current?.stop();
      detach.current?.();
      detach.current = null;
      if (owned.current) window.clearTimeout(owned.current.timer);
      owned.current = null;
    };
  }, []);

  const commit = (next: number, velocity: number, thrown: boolean) => {
    launch.current = { velocity, throw: thrown };
    setReleased((c) => c + 1);
    if (next === selected) return;
    if (value === undefined) setOwn(next);
    const day = list[next];
    if (day) onValueChange?.(day.iso);
  };

  // A sideways trackpad swipe (or a shifted wheel) scrolls the strip under
  // the finger's own momentum, and settles on the nearest day once it stops.
  const onWheelRef = React.useRef<(dx: number) => void>(() => {});
  React.useEffect(() => {
    onWheelRef.current = (dx: number) => {
      const el = viewportRef.current;
      if (!el || dragging.current) return;
      const w = el.clientWidth / vis || 1;
      if (!wheel.current) {
        flight.current?.stop();
        landing.current = null;
        audible.current = true;
        wheel.current = { raw: pos.get(), timer: 0 };
      }
      const session = wheel.current;
      window.clearTimeout(session.timer);
      session.raw = clamp(session.raw + dx / w, -vis, count - 1 + vis);
      pos.set(r3(rubberClamp(session.raw, 0, count - 1, EDGE)));
      session.timer = window.setTimeout(() => {
        wheel.current = null;
        commit(clamp(Math.round(pos.get()), 0, count - 1), 0, false);
      }, 140);
    };
  });
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (latest.current.disabled) return;
      const { x, y } = wheelPixels(event);
      const dx =
        Math.abs(x) > Math.abs(y) ? x : event.shiftKey && y !== 0 ? y : 0;
      if (dx === 0) return;
      event.preventDefault();
      onWheelRef.current(dx);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const endDrag = () => {
    dragging.current = false;
    detach.current?.();
    detach.current = null;
    setGrabbing(false);
  };

  /** Which day a point on the strip shows, undoing the lens's fisheye. */
  const dayAt = (clientX: number) => {
    const el = viewportRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const u = (clientX - (r.left + r.width / 2)) / (r.width / vis);
    const half = (zoom + 1) / 2;
    const d =
      Math.abs(u) <= half ? u / half : u - (Math.sign(u) * (zoom - 1)) / 2;
    return clamp(Math.round(pos.get() + d), 0, count - 1);
  };

  const drag = useDrag({
    axis: "x",
    disabled,
    onStart: () => {
      flight.current?.stop();
      if (wheel.current) window.clearTimeout(wheel.current.timer);
      wheel.current = null;
      landing.current = null;
      dragging.current = true;
      audible.current = true;
      from.current = pos.get();
      cellWidth.current = (viewportRef.current?.clientWidth ?? vis) / vis || 1;
      setGrabbing(true);
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancel();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ offset }) => {
      if (!dragging.current) return;
      const raw = from.current - offset.x / cellWidth.current;
      pos.set(r3(rubberClamp(raw, 0, count - 1, EDGE)));
    },
    onEnd: ({ velocity }) => {
      if (!dragging.current) return;
      endDrag();
      const v = -velocity.x / cellWidth.current;
      const rate = Math.exp(-1 / tau);
      const target = clamp(
        Math.round(project(pos.get(), v, rate)),
        0,
        count - 1,
      );
      commit(target, v, true);
    },
    onCancel: () => cancel(),
    onTap: (event) => {
      const target = dayAt(event.clientX);
      if (target === null) return;
      audible.current = true;
      commit(target, 0, false);
    },
  });

  function cancel() {
    if (!dragging.current) return;
    endDrag();
    launch.current = { velocity: 0, throw: false };
    setReleased((c) => c + 1);
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageUp: -7,
      PageDown: 7,
    };
    let next: number | null = null;
    if (event.key in steps) next = selected + (steps[event.key] ?? 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    if (dragging.current) return;
    audible.current = true;
    commit(clamp(next, 0, count - 1), 0, false);
  };

  const shownDay = list[clamp(under, 0, count - 1)];
  // Tall enough for the magnified day inside the lens frame, with room round
  // it: weekday, date and dots are 46 px at rest (38 without dots).
  const height = Math.round((dots ? 46 : 38) * zoom + 24);
  const optionId = (i: number) => `${id}-day-${i}`;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-5 items-center justify-between gap-3 px-1">
        <p className="truncate text-sm font-medium text-foreground">
          {shownDay
            ? `${MONTHS_LONG[shownDay.month] ?? ""} ${shownDay.year}`
            : ""}
        </p>
        {shownDay ? (
          <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {WEEKDAYS[shownDay.weekday]} {shownDay.date}
            {dots
              ? ` · ${shownDay.events > 0 ? plural(shownDay.events, "event") : "free"}`
              : ""}
          </p>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-activedescendant={optionId(selected)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        onLostPointerCapture={(event) => {
          // A touch is implicitly captured by the day it lands on; when the
          // drag takes the capture for the strip, that loss bubbles up here.
          if (event.target === event.currentTarget) {
            drag.onLostPointerCapture(event);
          }
        }}
        className={cn(
          "relative w-full touch-pan-y rounded-3 border border-hairline bg-card outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : grabbing
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
        style={{ height }}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-1/2 rounded-2 border border-hairline-strong bg-surface-2"
          style={{
            width: `calc(100% / ${vis} * ${zoom})`,
            x: "-50%",
            scale: catchScale,
          }}
        />
        <div
          className="absolute inset-0 overflow-clip rounded-3 [contain:paint]"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div
            className="absolute inset-y-0 left-1/2"
            style={{
              width: `calc(100% / ${vis})`,
              marginLeft: `calc(100% / ${vis} / -2)`,
            }}
          >
            {list.map((day, i) => (
              <Cell
                key={day.iso}
                id={optionId(i)}
                index={i}
                day={day}
                pos={pos}
                zoom={zoom}
                dots={dots}
                selected={i === selected}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  id,
  index,
  day,
  pos,
  zoom,
  dots,
  selected,
}: {
  id: string;
  index: number;
  day: Day;
  pos: MotionValue<number>;
  zoom: number;
  dots: boolean;
  selected: boolean;
}) {
  // Placed in percent of its own width: its offset from the lens in days,
  // plus half the lens's extra width once it is a day or more away, so the
  // magnified day has room and the rest keep their spacing.
  const x = useTransform(pos, (p) => {
    const d = index - p;
    return `${r2((d + ((zoom - 1) / 2) * clamp(d, -1, 1)) * 100)}%`;
  });
  const near = useTransform(pos, (p) =>
    smooth(clamp01(1 - Math.abs(index - p))),
  );
  const scale = useTransform(near, (t) => r3(1 + (zoom - 1) * t));
  const tone = useTransform(
    near,
    (t) =>
      `color-mix(in oklab, var(--accent-bright) ${Math.round(t * 100)}%, var(--ink-3))`,
  );
  const weekend = day.weekday === 0 || day.weekday === 6;
  const shown = Math.min(3, day.events);

  return (
    <motion.div
      id={id}
      role="option"
      aria-selected={selected}
      aria-label={day.name}
      className="absolute inset-0 flex items-center justify-center"
      style={{ x }}
    >
      <motion.div
        className="flex flex-col items-center gap-0.5"
        style={{ scale }}
      >
        <motion.span
          className={cn(
            "text-[10px] leading-3 tracking-[0.06em] uppercase",
            day.date === 1 ? "font-semibold" : "font-medium",
          )}
          style={{ color: tone }}
        >
          {day.date === 1 ? MONTHS[day.month] : WEEKDAYS[day.weekday]}
        </motion.span>
        <span
          className={cn(
            "text-lg leading-6 font-medium tabular-nums",
            day.today
              ? "font-semibold text-cobalt-bright"
              : weekend
                ? "text-ink-2"
                : "text-foreground",
          )}
        >
          {day.date}
        </span>
        {dots ? (
          <span className="flex h-1.5 items-center gap-0.5">
            {Array.from({ length: shown }, (_, k) => (
              <span key={k} className="size-1 rounded-full bg-cobalt-bright" />
            ))}
          </span>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
