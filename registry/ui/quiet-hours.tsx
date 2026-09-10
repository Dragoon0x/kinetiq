"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QuietHoursProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled minute of the day quiet begins. */
  start?: number;
  /** Initial start for uncontrolled usage. @default 1320 (10:00 pm) */
  defaultStart?: number;
  /** Controlled minute of the day quiet ends. */
  end?: number;
  /** Initial end for uncontrolled usage. @default 420 (7:00 am) */
  defaultEnd?: number;
  /** Fires from the setter that moved a handle, with both ends. */
  onRangeChange?: (range: { start: number; end: number }) => void;
  /** Controlled switch state. */
  enabled?: boolean;
  /** Initial switch state for uncontrolled usage. @default true */
  defaultEnabled?: boolean;
  /** Fires from the switch. */
  onEnabledChange?: (enabled: boolean) => void;
  /** The host's minute of the day, 0–1439. Never a clock read in here. @default 1230 */
  nowMinutes?: number;
  /** Minutes per keyboard nudge and per pointer snap. @default 15 */
  step?: number;
  /** Fires each time the window opens or closes around `nowMinutes`. */
  onQuietChange?: (quiet: boolean) => void;
  /** The strip's heading. @default "Quiet hours" */
  label?: string;
  className?: string;
};

const DAY = 1440;
/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;
/** Six-hourly marks under the rail; midnight reads at both ends. */
const TICKS = ["12a", "6a", "12p", "6p", "12a"];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const wrap = (minute: number): number => ((minute % DAY) + DAY) % DAY;
const round3 = (value: number): number => Number(value.toFixed(3));
const percentOf = (minute: number): number => round3((minute / DAY) * 100);

/** 12-hour clock, built in one string so nothing splices a name together. */
const clockOf = (minute: number): string => {
  const total = wrap(Math.round(minute));
  const hour24 = Math.floor(total / 60);
  const rest = total % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${suffix}`;
};

/** Short units for the printed line: "1 h 28 min", "48 min". */
const gapOf = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/** Minutes forward from `from` to `to` around the dial. */
const forward = (from: number, to: number): number => wrap(to - from);

const inWindow = (minute: number, start: number, end: number): boolean =>
  start === end
    ? false
    : start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * A bell that loses its sound. Each arc is its own path run by `pathLength`, so
 * the bell never asks motion to interpolate a `d` whose command count changed.
 */
function QuietBell({
  quiet,
  motionSafe,
}: {
  quiet: boolean;
  motionSafe: boolean;
}) {
  const draw = motionSafe ? springs.flick : { duration: durations.fast };
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-5 shrink-0">
      <path {...STROKE} d="M6.4 12.6V9.2a3.6 3.6 0 0 1 7.2 0v3.4" />
      <path {...STROKE} d="M5 12.6h10" />
      <path {...STROKE} d="M8.5 14.8a1.7 1.7 0 0 0 3 0" />
      <motion.path
        {...STROKE}
        d="M3.2 7.4a5 5 0 0 1 1.3-2.6"
        initial={false}
        animate={{ pathLength: quiet ? 0 : 1, opacity: quiet ? 0 : 1 }}
        transition={draw}
      />
      <motion.path
        {...STROKE}
        d="M16.8 7.4a5 5 0 0 0-1.3-2.6"
        initial={false}
        animate={{ pathLength: quiet ? 0 : 1, opacity: quiet ? 0 : 1 }}
        transition={draw}
      />
    </svg>
  );
}

type HandleProps = {
  which: "start" | "end";
  minute: number;
  quiet: boolean;
  motionSafe: boolean;
  dragging: boolean;
  handleRef: React.Ref<HTMLDivElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

function RangeHandle({
  which,
  minute,
  quiet,
  motionSafe,
  dragging,
  handleRef,
  onKeyDown,
}: HandleProps) {
  return (
    <motion.div
      ref={handleRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={DAY - 1}
      aria-valuenow={Math.round(minute)}
      aria-valuetext={
        which === "start"
          ? `Quiet starts at ${clockOf(minute)}.`
          : `Quiet ends at ${clockOf(minute)}.`
      }
      aria-label={which === "start" ? "Quiet hours start" : "Quiet hours end"}
      onKeyDown={onKeyDown}
      initial={false}
      animate={{ left: `${percentOf(minute)}%` }}
      // A value under a finger must not lag, so a drag moves the handle at
      // once and only a settled or keyed change rides the layout spring.
      transition={dragging || !motionSafe ? { duration: 0 } : springs.glide}
      className={cn(
        "pointer-events-none absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-0 shadow-sm transition-colors",
        quiet ? "border-cobalt-bright" : "border-hairline-strong",
        focusRing,
      )}
    />
  );
}

/**
 * The same hours, quiet every night. Two handles set a window on a 24-hour rail
 * and the shade between them is painted from percentages rounded to three
 * decimals — as two segments when the window crosses midnight, because a night
 * that runs past the date line is still one window. Dragging moves a handle 1:1
 * with the pointer, capturing it only after four pixels of travel so a plain
 * click is never swallowed; letting go or nudging with the keyboard re-shades
 * on `glide`, the layout spring.
 *
 * The bell says which side of the line the moment is on: inside the window its
 * two sound arcs retract by `pathLength` on `flick` and it dims to `ink-3`,
 * outside they stroke back on. Underneath, the next change counts down in the
 * host's own minute — "Quiet starts in 1 h 28 min" becomes "Quiet ends in 48
 * min" the moment the window opens — over a hairline that drains toward that
 * boundary as a rounded fraction. Nothing in here schedules anything or reads a
 * clock: `nowMinutes` is a prop and every other reading is derived from it.
 *
 * Each handle is a real `role="slider"`: Arrow keys move by `step`, Page Up and
 * Page Down by an hour, Home and End jump to midnight and a quarter to
 * midnight, and each carries a spoken value ("Quiet starts at 10:00 pm."). The
 * switch is a real `role="switch"`. A status region says the settled range and
 * says when the window opens or closes, frozen at the change. Under reduced
 * motion nothing travels — the shade is repainted at once and the arcs swap
 * without drawing — but the countdown still runs, because it is information.
 */
export function QuietHours({
  ref,
  start,
  defaultStart = 1320,
  end,
  defaultEnd = 420,
  onRangeChange,
  enabled,
  defaultEnabled = true,
  onEnabledChange,
  nowMinutes = 1230,
  step = 15,
  onQuietChange,
  label = "Quiet hours",
  className,
}: QuietHoursProps) {
  const motionSafe = useMotionSafe();
  const headingId = `${React.useId()}-heading`;

  const [ownRange, setOwnRange] = React.useState({
    start: wrap(defaultStart),
    end: wrap(defaultEnd),
  });
  const from = wrap(start ?? ownRange.start);
  const to = wrap(end ?? ownRange.end);

  const [ownEnabled, setOwnEnabled] = React.useState(defaultEnabled);
  const on = enabled ?? ownEnabled;

  const now = wrap(nowMinutes);
  const quiet = on && inWindow(now, from, to);

  const startRef = React.useRef<HTMLDivElement | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const [said, setSaid] = React.useState("");

  // The crossing is frozen while rendering rather than from an effect, so the
  // sentence belongs to the minute that caused it and is spoken once.
  const [crossed, setCrossed] = React.useState(quiet);
  if (crossed !== quiet) {
    setCrossed(quiet);
    setSaid(quiet ? "Quiet hours started." : "Quiet hours ended.");
  }

  const quietChangeRef = useLatest(onQuietChange);
  const reported = React.useRef(quiet);
  React.useEffect(() => {
    if (reported.current === quiet) return;
    reported.current = quiet;
    quietChangeRef.current?.(quiet);
  }, [quiet, quietChangeRef]);

  const [dragging, setDragging] = React.useState<"start" | "end" | null>(null);

  // A change is armed by the gesture that asks for it and spoken only once the
  // values coming back have actually changed — so a controlled host that
  // refuses one is never contradicted, and a drag says nothing until it lands.
  const [echo, setEcho] = React.useState({
    start: from,
    end: to,
    on,
    armed: false,
  });
  const arm = () => setEcho({ start: from, end: to, on, armed: true });
  if (echo.armed && dragging === null) {
    setEcho({ start: from, end: to, on, armed: false });
    if (echo.start !== from || echo.end !== to) {
      setSaid(`Quiet hours run from ${clockOf(from)} to ${clockOf(to)}.`);
    } else if (echo.on !== on) {
      setSaid(on ? "Quiet hours are on." : "Quiet hours are off.");
    }
    // A gesture that changed nothing disarms in silence rather than staying
    // armed to speak for some later change it had nothing to do with.
  }

  const isControlled = start !== undefined && end !== undefined;

  const commit = (which: "start" | "end", minute: number) => {
    const snapped = wrap(Math.round(minute / step) * step);
    const other = which === "start" ? to : from;
    // The two ends may not meet: a window with no width is not a window.
    const settled = snapped === other ? wrap(snapped + step) : snapped;
    const next =
      which === "start"
        ? { start: settled, end: to }
        : { start: from, end: settled };
    if (next.start === from && next.end === to) return;
    if (!isControlled) setOwnRange(next);
    onRangeChange?.(next);
  };

  const gesture = React.useRef<{
    id: number;
    which: "start" | "end";
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);

  const minuteFrom = (clientX: number, rect: DOMRect): number => {
    if (rect.width === 0) return from;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * DAY;
  };

  const nearer = (minute: number): "start" | "end" => {
    const toStart = Math.min(forward(minute, from), forward(from, minute));
    const toEnd = Math.min(forward(minute, to), forward(to, minute));
    return toEnd < toStart ? "end" : "start";
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minute = minuteFrom(event.clientX, rect);
    const which = nearer(minute);
    gesture.current = {
      id: event.pointerId,
      which,
      startX: event.clientX,
      dragging: false,
      rect,
    };
    arm();
    setDragging(which);
    (which === "start" ? startRef : endRef).current?.focus();
    commit(which, minute);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag, and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(active.which, minuteFrom(event.clientX, active.rect));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    // A live region that changed on every frame of a drag would babble, so the
    // armed sentence waits here until the drag lands.
    setDragging(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const keyHandler =
    (which: "start" | "end") =>
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = which === "start" ? from : to;
      const move =
        event.key === "ArrowRight" || event.key === "ArrowUp"
          ? step
          : event.key === "ArrowLeft" || event.key === "ArrowDown"
            ? -step
            : event.key === "PageUp"
              ? 60
              : event.key === "PageDown"
                ? -60
                : null;
      const next =
        move !== null
          ? current + move
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? DAY - step
              : null;
      if (next === null) return;
      event.preventDefault();
      arm();
      commit(which, next);
    };

  const toggle = () => {
    const next = !on;
    arm();
    if (enabled === undefined) setOwnEnabled(next);
    onEnabledChange?.(next);
  };

  // Two fixed segments: the small-hours one has no width unless the window
  // crosses midnight, so nothing mounts or unmounts as the range wraps.
  const wraps = from > to;
  const shades = [
    {
      id: "evening",
      left: percentOf(from),
      width: percentOf(wraps ? DAY - from : to - from),
    },
    { id: "small-hours", left: 0, width: percentOf(wraps ? to : 0) },
  ];

  const until = quiet ? forward(now, to) : forward(now, from);
  const span = quiet ? forward(from, to) : forward(to, from);
  const left = span === 0 ? 0 : round3(until / span);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "transition-colors",
            quiet ? "text-ink-3" : "text-foreground",
          )}
        >
          <QuietBell quiet={quiet} motionSafe={motionSafe} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id={headingId}
            className="block truncate text-sm font-medium text-foreground"
          >
            {label}
          </span>
          <span className="block truncate font-mono text-[11px] text-ink-3 tabular-nums">
            {`${clockOf(from)} – ${clockOf(to)}`}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          // A switch's name stays the thing it switches: `aria-checked`
          // already carries the state, and saying it twice reads as two.
          aria-label={label}
          onClick={toggle}
          className={cn(
            "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
            on ? "bg-cobalt-bright" : "bg-hairline-strong",
            focusRing,
          )}
        >
          <motion.span
            aria-hidden
            className="size-4 rounded-full bg-surface-0 shadow-sm"
            initial={false}
            animate={{ x: on ? 16 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </button>
      </div>

      <div className="px-2 pt-4">
        <div
          role="group"
          aria-labelledby={headingId}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={() => {
            gesture.current = null;
            setDragging(null);
          }}
          className="relative h-7 w-full touch-none select-none"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-hairline-strong"
          >
            {shades.map((shade) => (
              <motion.span
                key={shade.id}
                className={cn(
                  "absolute inset-y-0 transition-colors",
                  on ? "bg-cobalt-bright/40" : "bg-hairline-strong",
                )}
                initial={false}
                animate={{
                  left: `${shade.left}%`,
                  width: `${shade.width}%`,
                  opacity: on ? 1 : 0.35,
                }}
                transition={
                  dragging || !motionSafe ? { duration: 0 } : springs.glide
                }
              />
            ))}
          </span>

          {/* The host's minute, marked on the rail. It moves on a short linear
              tween because a clock hand does not overshoot. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground/45"
            initial={false}
            animate={{ left: `${percentOf(now)}%` }}
            transition={{
              duration: motionSafe ? durations.fast : 0,
              ease: easings.linear,
            }}
          />

          <RangeHandle
            which="start"
            minute={from}
            quiet={quiet}
            motionSafe={motionSafe}
            dragging={dragging === "start"}
            handleRef={startRef}
            onKeyDown={keyHandler("start")}
          />
          <RangeHandle
            which="end"
            minute={to}
            quiet={quiet}
            motionSafe={motionSafe}
            dragging={dragging === "end"}
            handleRef={endRef}
            onKeyDown={keyHandler("end")}
          />
        </div>

        <div
          aria-hidden
          className="flex justify-between pt-1 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {TICKS.map((tick, index) => (
            <span key={`${tick}-${index}`}>{tick}</span>
          ))}
        </div>
      </div>

      <p className="pt-3 text-xs text-ink-2">
        {on
          ? quiet
            ? `Quiet ends in ${gapOf(until)}`
            : `Quiet starts in ${gapOf(until)}`
          : "Quiet hours are off"}
      </p>
      <span
        aria-hidden
        className="mt-1.5 block h-px w-full overflow-hidden bg-hairline-strong"
      >
        <motion.span
          className="block h-px origin-left bg-cobalt-bright"
          initial={false}
          animate={{ scaleX: on ? left : 0 }}
          transition={{
            duration: motionSafe ? durations.fast : 0,
            ease: easings.linear,
          }}
        />
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
