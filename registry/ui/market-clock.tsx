"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One stretch of the day the market is open, in minutes from midnight. */
export type MarketSession = { label: string; from: number; to: number };

export type MarketClockProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Minutes since midnight, possibly fractional. The host owns the clock. */
  minute: number;
  /** Open stretches; everything outside them is closed. */
  sessions?: MarketSession[];
  /** Venue name; the group's accessible name. @default "Market" */
  label?: string;
  /** Small caption under the venue name. */
  zone?: string;
  /** How close the next change must be before the arc ahead breathes. @default 30 */
  soonMinutes?: number;
  /** Controlled pinned session label. */
  selected?: string | null;
  /** Initial pinned session for uncontrolled usage. @default null */
  defaultSelected?: string | null;
  /** Fires from the press or key that pinned or cleared a session. */
  onSelectedChange?: (label: string | null) => void;
  /** Fires from the effect that observed the flip, once per flip. */
  onStateChange?: (open: boolean) => void;
  /** Formats every time on the face and in the legend. */
  formatTime?: (minute: number) => string;
  className?: string;
};

const DAY = 1440;
const RING = 41;
const HAND = 27;

const DEFAULT_SESSIONS: MarketSession[] = [
  { label: "Morning", from: 540, to: 750 },
  { label: "Afternoon", from: 810, to: 990 },
];

const norm = (minute: number) => ((minute % DAY) + DAY) % DAY;
const pad = (value: number) => String(value).padStart(2, "0");
const clockFace = (minute: number) =>
  `${pad(Math.floor(norm(minute) / 60))}:${pad(Math.floor(norm(minute) % 60))}`;

const untilLabel = (minutes: number) => {
  const total = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(total / 60);
  return hours > 0 ? `${hours}h ${total % 60}m` : `${total}m`;
};

/** A point on the dial: midnight at the top, clockwise through the day. */
const polar = (angle: number, radius: number): [number, number] => {
  const radians = ((angle - 90) * Math.PI) / 180;
  // Rounded before it reaches an attribute: Node and the browser can differ in
  // the last digits of sin and cos, and a coordinate that differs by 1e-15 is a
  // hydration mismatch.
  return [
    Number((50 + radius * Math.cos(radians)).toFixed(3)),
    Number((50 + radius * Math.sin(radians)).toFixed(3)),
  ];
};

/** An arc between two minutes of the day, drawn clockwise. */
const arc = (from: number, to: number, radius: number) => {
  const sweep = norm(to - from);
  if (sweep < 0.5) return "";
  const start = (from / DAY) * 360;
  const [x1, y1] = polar(start, radius);
  const [x2, y2] = polar(start + (sweep / DAY) * 360, radius);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${
    sweep > DAY / 2 ? 1 : 0
  } 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

/**
 * A twenty-four hour face, so a venue's sessions can be drawn as arcs where
 * they actually sit. Open stretches are struck in `cobalt-bright` and the rest
 * of the ring stays hairline; the hand sweeps from a `minute` the host
 * supplies — a prop rather than a clock read during render, which is what
 * keeps the face deterministic on the server. Its rotation is accumulated
 * across midnight so it never spins backwards through 359°, and it travels on
 * a linear tween matched to the step, because a sweeping hand that overshoots
 * is a lie about the time.
 *
 * The arc ahead — from the hand to the next change, open or close — is drawn
 * over the ring in `signal` and shrinks as the hand eats it; inside
 * `soonMinutes` it breathes on `drift` between two opacities, the only ambient
 * motion on the face. Below, the state pill snaps between Open and Closed and
 * a line counts down. Each legend row is a real button: pinning one retargets
 * the countdown at that session and brightens its arc on `flick`, and Escape
 * anywhere in the group unpins. Under reduced motion the hand jumps, the arc
 * stops breathing, and everything the clock actually says still changes.
 */
export function MarketClock({
  ref,
  minute,
  sessions = DEFAULT_SESSIONS,
  label = "Market",
  zone,
  soonMinutes = 30,
  selected,
  defaultSelected = null,
  onSelectedChange,
  onStateChange,
  formatTime = clockFace,
  className,
}: MarketClockProps) {
  const motionSafe = useMotionSafe();
  const titleId = React.useId();

  const ordered = React.useMemo(
    () => [...sessions].sort((a, b) => a.from - b.from),
    [sessions],
  );

  const now = norm(minute);
  const current = ordered.find((s) => now >= s.from && now < s.to) ?? null;
  const isOpen = current !== null;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultSelected,
  );
  const pinnedLabel = selected === undefined ? uncontrolled : selected;
  const pinned = ordered.find((s) => s.label === pinnedLabel) ?? null;

  // The next boundary: the end of the session we are in, otherwise the next
  // start ahead of us, wrapping once into tomorrow.
  const nextStart =
    ordered.find((s) => s.from > now)?.from ?? (ordered[0]?.from ?? 0) + DAY;
  const boundary = pinned
    ? now >= pinned.from && now < pinned.to
      ? pinned.to
      : pinned.from > now
        ? pinned.from
        : pinned.from + DAY
    : current
      ? current.to
      : nextStart;
  const until = boundary - now;
  const soon = until <= soonMinutes;

  const closing = pinned ? now >= pinned.from && now < pinned.to : isOpen;
  const changeLabel = pinned
    ? `${pinned.label} ${closing ? "closes" : "opens"} in ${untilLabel(until)}`
    : `${closing ? "Closes" : "Opens"} in ${untilLabel(until)}`;

  // Reported from the effect that observed the flip, once per flip — never
  // from render, which React may run more than once for the same minute.
  const stateRef = React.useRef(isOpen);
  const changeRef = React.useRef(onStateChange);
  React.useEffect(() => {
    changeRef.current = onStateChange;
  });
  React.useEffect(() => {
    if (stateRef.current === isOpen) return;
    stateRef.current = isOpen;
    changeRef.current?.(isOpen);
  }, [isOpen]);

  // The hand's rotation accumulates so that crossing midnight carries on
  // clockwise instead of unwinding a full turn; a backwards jump (a reset)
  // simply rewinds by its own size.
  const raw = (now / DAY) * 360;
  const [spin, setSpin] = React.useState({ raw, rotation: raw, step: 0 });
  if (spin.raw !== raw) {
    const back = spin.raw - raw;
    const delta =
      raw >= spin.raw
        ? raw - spin.raw
        : back > 180
          ? raw + 360 - spin.raw
          : -back;
    setSpin({ raw, rotation: spin.rotation + delta, step: Math.abs(delta) });
  }

  const pick = (next: string | null) => {
    if (selected === undefined) setUncontrolled(next);
    onSelectedChange?.(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || pinnedLabel === null) return;
    event.preventDefault();
    pick(null);
  };

  const faceLabel = `${label}, ${isOpen ? "open" : "closed"}. ${changeLabel}. Sessions: ${ordered
    .map((s) => `${s.label} ${formatTime(s.from)} to ${formatTime(s.to)}`)
    .join(", ")}.`;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 id={titleId} className="truncate text-sm font-semibold">
            {label}
          </h3>
          {zone ? (
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {zone}
            </span>
          ) : null}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isOpen ? "open" : "closed"}
            className={cn(
              "flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
              isOpen
                ? "bg-success/14 text-success"
                : "bg-muted text-muted-foreground",
            )}
            initial={
              motionSafe
                ? { opacity: 0, y: -distances.nudge }
                : { opacity: 0, y: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                isOpen ? "bg-success" : "bg-ink-3",
              )}
            />
            {isOpen ? "Open" : "Closed"}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-[212px]">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={faceLabel}
          className="block h-auto w-full"
        >
          <circle
            cx="50"
            cy="50"
            r={RING}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="6"
          />

          {Array.from({ length: 24 }, (_, hour) => {
            const major = hour % 6 === 0;
            const [x1, y1] = polar(hour * 15, major ? 31 : 33);
            const [x2, y2] = polar(hour * 15, 36);
            return (
              <line
                key={hour}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? "var(--ink-3)" : "var(--hairline-strong)"}
                strokeWidth={major ? 1.2 : 0.8}
                strokeLinecap="round"
              />
            );
          })}

          {[0, 6, 12, 18].map((hour) => {
            const [x, y] = polar(hour * 15, 22);
            return (
              <text
                key={hour}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--ink-3)"
                className="font-mono"
                fontSize="6"
              >
                {pad(hour)}
              </text>
            );
          })}

          {ordered.map((session) => (
            <motion.path
              key={session.label}
              d={arc(session.from, session.to, RING)}
              fill="none"
              stroke="var(--accent-bright)"
              strokeLinecap="butt"
              initial={false}
              animate={{
                strokeWidth: pinned?.label === session.label ? 9 : 6,
                opacity: !pinned || pinned.label === session.label ? 1 : 0.4,
              }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            />
          ))}

          {/* The stretch between the hand and the next change. It shrinks as
              the hand eats it, and breathes once the change is close. */}
          <motion.path
            d={arc(now, boundary, RING)}
            fill="none"
            stroke="var(--signal)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ opacity: 1 }}
            animate={{ opacity: motionSafe && soon ? 0.4 : 1 }}
            transition={
              motionSafe && soon
                ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
                : { duration: durations.fast, ease: easings.enter }
            }
          />

          <motion.g
            initial={false}
            animate={{ rotate: spin.rotation }}
            transition={{
              duration:
                !motionSafe || spin.step === 0
                  ? 0
                  : Math.min(0.8, Math.max(0.1, spin.step / 3)),
              ease: easings.linear,
            }}
            // Only origin* keys survive motion's transform-origin rewrite on
            // SVG children; anything else spins the hand about the corner.
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <line
              x1="50"
              y1="50"
              x2="50"
              y2={50 - HAND}
              stroke="var(--ink)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="50" cy={50 - HAND} r="2" fill="var(--ink)" />
          </motion.g>
          <circle cx="50" cy="50" r="2.6" fill="var(--ink)" />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {/* Keyed by the verb, not the whole line: the minutes tick down in
            place, and only a real change of state cross-fades. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={`${pinnedLabel ?? ""}-${closing ? "close" : "open"}`}
            className="text-center text-sm font-medium"
            initial={
              motionSafe
                ? { opacity: 0, y: distances.nudge }
                : { opacity: 0, y: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {changeLabel}
          </motion.p>
        </AnimatePresence>
        <p className="font-mono text-[11px] text-ink-3 tabular-nums">
          {formatTime(now)} · next {formatTime(norm(boundary))}
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {ordered.map((session) => {
          const on = pinnedLabel === session.label;
          return (
            <li key={session.label}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => pick(on ? null : session.label)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on ? "bg-cobalt-wash" : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    on ? "bg-cobalt-bright" : "bg-ink-3",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {session.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {formatTime(session.from)}–{formatTime(session.to)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Only the word, so it speaks once per flip rather than once a tick. */}
      <p role="status" className="sr-only">
        {label} {isOpen ? "open" : "closed"}
      </p>
    </div>
  );
}
