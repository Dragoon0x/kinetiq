"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TimeoutRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The member, shown and spoken. */
  name: string;
  /** The member's handle, shown under the name. */
  handle?: string;
  /** Where the timeout applies; named in both sentences. @default "Coldbrook" */
  room?: string;
  /** The house rule cited on the row. @default "Room rule 3" */
  reason?: string;
  /** The timeout span in seconds. Changing it starts a new run. @default 600 */
  seconds?: number;
  /** Controlled timeout state. */
  active?: boolean;
  /** Initial timeout state for uncontrolled use. @default false */
  defaultActive?: boolean;
  /** Fires when the timeout starts, is lifted, or runs out. */
  onActiveChange?: (active: boolean) => void;
  /** Seconds Extend adds to the remainder. @default 300 */
  extendSeconds?: number;
  /** Fires from Extend with the new whole span. */
  onExtend?: (total: number) => void;
  /** Fires each time the whole second changes. */
  onRemainingChange?: (seconds: number) => void;
  /** Fires once when the remainder reaches zero. */
  onExpire?: () => void;
  /** Fires when a moderator ends the timeout early. */
  onLift?: () => void;
  /** False hides Extend and Lift — a member reading their own timeout. @default true */
  canModerate?: boolean;
  /** Holds both controls; the ring still drains and still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart a run. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const clock = (value: number) => {
  const whole = Math.max(0, Math.ceil(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Spoken spans are words, and words are pluralised: never "1 minutes". */
const spanPhrase = (value: number) => {
  const whole = Math.max(1, Math.round(value));
  if (whole >= 60) {
    const minutes = Math.round(whole / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${whole} ${whole === 1 ? "second" : "seconds"}`;
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const CENTRE = 22;
const RADIUS = 18;

/**
 * Marks on the ring so a span has structure rather than one blank sweep: a tick
 * per minute up to twelve, quarters below two minutes. Every coordinate comes
 * out of sin/cos, which Node and Chromium do not round identically, so each one
 * is fixed to three decimals before it can reach an attribute.
 */
const ticksFor = (span: number) => {
  const divisions =
    span >= 120 ? Math.min(12, Math.max(2, Math.round(span / 60))) : 4;
  return Array.from({ length: divisions }, (_, index) => {
    const radians = ((-90 + (index * 360) / divisions) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      key: `tick-${index}`,
      x1: Number((CENTRE + cos * (RADIUS - 2.4)).toFixed(3)),
      y1: Number((CENTRE + sin * (RADIUS - 2.4)).toFixed(3)),
      x2: Number((CENTRE + cos * (RADIUS + 2.4)).toFixed(3)),
      y2: Number((CENTRE + sin * (RADIUS + 2.4)).toFixed(3)),
    };
  });
};

type RunProps = {
  initialSeconds: number;
  span: number;
  phase: "grow" | "drain";
  target: number;
  visible: boolean;
  motionSafe: boolean;
  onTick: (left: number) => void;
  onGrown: () => void;
  onEnd: () => void;
};

/**
 * One timeout run. Mounting is the reset, so a second timeout can never inherit
 * the first one's remainder — but an Extend deliberately does *not* remount:
 * it moves this instance into its grow phase, which is what makes extending
 * read as more of the same run rather than the start of a new one.
 */
function TimeoutRun({
  initialSeconds,
  span,
  phase,
  target,
  visible,
  motionSafe,
  onTick,
  onGrown,
  onEnd,
}: RunProps) {
  const left = useMotionValue(initialSeconds);
  const offset = useMotionValue(0);
  const tickRef = useLatest(onTick);
  const grownRef = useLatest(onGrown);
  const endRef = useLatest(onEnd);
  // A run that is already leaving must stop counting: its remaining frames
  // would otherwise report an expiry against the state that replaced it.
  const present = useIsPresent();
  const ticks = React.useMemo(() => ticksFor(span), [span]);

  // The arc reads against the span in force, and Extend changes that span
  // mid-run — so the fraction is recomputed here rather than captured once.
  React.useEffect(() => {
    const apply = (value: number) => {
      const fraction = 1 - value / Math.max(1, span);
      offset.set(Math.max(0, Math.min(1, Number(fraction.toFixed(4)))));
    };
    apply(left.get());
    return left.on("change", apply);
  }, [left, offset, span]);

  React.useEffect(() => {
    let last = Math.ceil(left.get());
    return left.on("change", (value) => {
      const next = Math.max(0, Math.ceil(value));
      if (next === last) return;
      last = next;
      tickRef.current(next);
    });
  }, [left, tickRef]);

  React.useEffect(() => {
    if (!visible || !present) return;
    if (phase === "grow") {
      // Two keyframes, one spring: the arc grows to its new share and hands
      // back to the drain from onComplete rather than from a timer.
      const controls = motionSafe
        ? animate(left, target, {
            ...springs.glide,
            onComplete: () => grownRef.current(),
          })
        : animate(left, target, {
            duration: durations.fast,
            ease: easings.move,
            onComplete: () => grownRef.current(),
          });
      return () => controls.stop();
    }
    const remaining = left.get();
    if (remaining <= 0) return;
    const controls = animate(left, 0, {
      // A minute is a minute: the drain is linear whatever the motion
      // preference, and a hidden tab holds it where it stands.
      duration: remaining,
      ease: easings.linear,
      onComplete: () => endRef.current(),
    });
    return () => controls.stop();
  }, [visible, present, phase, target, motionSafe, left, grownRef, endRef]);

  return (
    <motion.svg
      viewBox="0 0 44 44"
      aria-hidden
      className="absolute inset-0 size-full text-cobalt-bright"
      initial={motionSafe ? { opacity: 0, scale: 0.94 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      style={{ originX: 0.5, originY: 0.5 }}
    >
      {ticks.map((tick) => (
        <line
          key={tick.key}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
          strokeLinecap="round"
        />
      ))}
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2.5"
      />
      <motion.circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        transform="rotate(-90 22 22)"
        style={{ strokeDashoffset: offset }}
      />
    </motion.svg>
  );
}

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

/**
 * Muted, for a while. A moderator's timeout hangs on the member's avatar as an
 * arc that retreats linearly across the span — ticked at each minute so the
 * wait has structure — while the disc itself dims and a mute glyph takes the
 * corner. The remainder lives in one motion value that the arc reads and the
 * mm:ss figure steps from, so they can never disagree and no clock is read
 * during render.
 *
 * **Extend** is the move that belongs to this component alone: rather than
 * restarting, the run enters a grow phase where the arc springs back out to its
 * new share on `glide` and then resumes draining from there, handed over by the
 * grow's own `onComplete`. **Lift** ends it now. Either ending clears the ring
 * with a pop — the arc leaves on the exit ease while the disc comes back to
 * full on `recoil`, ζ0.53's two visible bounces, the one celebratory move here,
 * and the corner glyph cross-fades from muted to a speech mark.
 *
 * The state is a visible sentence, never colour alone, and a polite status
 * region speaks one frozen line per change — started, extended, cleared — while
 * the counting figure stays plain text so nobody is read a number every second.
 * A hidden tab holds the run where it stands. Under reduced motion the arc
 * still drains and the figure still counts, because a remainder is information;
 * nothing pops and nothing travels.
 */
export function TimeoutRing({
  ref,
  name,
  handle,
  room = "Coldbrook",
  reason = "Room rule 3",
  seconds = 600,
  active,
  defaultActive = false,
  onActiveChange,
  extendSeconds = 300,
  onExtend,
  onRemainingChange,
  onExpire,
  onLift,
  canModerate = true,
  disabled = false,
  className,
}: TimeoutRingProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const period = Math.max(1, Math.round(seconds));
  const [uncontrolled, setUncontrolled] = React.useState(defaultActive);
  const isControlled = active !== undefined;
  const isActive = isControlled ? active : uncontrolled;

  // A run is identified by the timeout state and the span it counts from.
  // Deriving it during render is what lets a new span reset the remainder in
  // the same commit that changed it.
  const runKey = `${isActive ? "on" : "off"}:${period}`;
  const [run, setRun] = React.useState(() => ({
    key: runKey,
    id: 0,
    span: period,
    target: period,
    phase: "drain" as "grow" | "drain",
    grew: false,
    ended: false,
  }));
  if (run.key !== runKey) {
    // Changing the span while nobody is timed out is not a run: bumping the id
    // there would re-announce a clearing that never happened.
    const touchesRun = run.key.startsWith("on") || runKey.startsWith("on");
    setRun({
      key: runKey,
      id: touchesRun ? run.id + 1 : run.id,
      span: period,
      target: period,
      phase: "drain",
      grew: false,
      ended: false,
    });
  }
  const running = isActive && !run.ended;

  const [endedBy, setEndedBy] = React.useState<"hand" | "clock" | null>(null);
  const [tick, setTick] = React.useState<{ id: number; left: number } | null>(
    null,
  );
  const left = tick && tick.id === run.id ? tick.left : run.span;

  const expireRef = useLatest(onExpire);
  const tickOutRef = useLatest(onRemainingChange);

  const setActiveState = (next: boolean) => {
    if (!isControlled) setUncontrolled(next);
    onActiveChange?.(next);
  };

  const handleTick = (value: number) => {
    setTick({ id: run.id, left: value });
    tickOutRef.current?.(value);
  };

  const handleGrown = () => {
    setRun((prev) => ({ ...prev, phase: "drain" }));
  };

  const handleEnd = () => {
    // Never from inside an updater: the state settles first, then the host
    // hears about it.
    setRun((prev) => ({ ...prev, ended: true }));
    setEndedBy("clock");
    setActiveState(false);
    expireRef.current?.();
  };

  const lift = () => {
    setRun((prev) => ({ ...prev, ended: true }));
    setEndedBy("hand");
    setActiveState(false);
    onLift?.();
  };

  const extend = () => {
    const add = Math.max(1, Math.round(extendSeconds));
    const nextLeft = Math.max(0, left) + add;
    const nextSpan = Math.max(run.span, nextLeft);
    setRun((prev) => ({
      ...prev,
      span: nextSpan,
      target: nextLeft,
      phase: "grow",
      grew: true,
    }));
    // The figure is not set here on purpose: it climbs from the run's own ticks
    // as the arc grows, so the two never disagree.
    onExtend?.(nextSpan);
  };

  // The spoken sentence is frozen at the moment of the change, so a fast
  // extend-then-lift never leaves the reading a step behind.
  const spokenKey = running
    ? `${run.id}:on:${run.span}`
    : `${run.id}:off:${endedBy ?? "none"}`;
  const [spoken, setSpoken] = React.useState(() => ({
    key: spokenKey,
    text: "",
  }));
  if (spoken.key !== spokenKey) {
    setSpoken({
      key: spokenKey,
      text: running
        ? run.grew
          ? `${name}'s timeout now runs ${spanPhrase(run.span)}.`
          : `${name} is timed out in ${room} for ${spanPhrase(run.span)} under ${reason}.`
        : endedBy === "clock"
          ? `The timeout has run out. ${name} can post in ${room} again.`
          : `${name} can post in ${room} again.`,
    });
  }

  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`${name} timeout`}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center">
          <motion.span
            aria-hidden
            initial={false}
            animate={
              motionSafe
                ? { opacity: running ? 0.5 : 1, scale: running ? 0.94 : 1 }
                : { opacity: running ? 0.5 : 1 }
            }
            // Settling into a timeout glides; coming out of one pops. Two
            // keyframes either way, as a spring requires.
            transition={
              motionSafe ? (running ? springs.glide : springs.recoil) : fade
            }
            style={{ originX: 0.5, originY: 0.5 }}
            className="grid size-9 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
          >
            {initialsOf(name)}
          </motion.span>

          <AnimatePresence initial={false}>
            {running ? (
              <TimeoutRun
                key={`run-${run.id}`}
                initialSeconds={period}
                span={run.span}
                phase={run.phase}
                target={run.target}
                visible={visible}
                motionSafe={motionSafe}
                onTick={handleTick}
                onGrown={handleGrown}
                onEnd={handleEnd}
              />
            ) : null}
          </AnimatePresence>

          {/* Both corner marks share one grid cell and cross-fade, so nothing
              reserves room for the state that is not showing. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full border border-hairline bg-surface-0"
          >
            <motion.svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="col-start-1 row-start-1 size-2.5 text-ink-3"
              animate={{ opacity: running ? 1 : 0 }}
              transition={fade}
            >
              <path d="M8.5 3.5 5.5 6H3.5v4h2l3 2.5z" />
              <path d="m11 6.5 3 3M14 6.5l-3 3" />
            </motion.svg>
            <motion.svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="col-start-1 row-start-1 size-2.5 text-success"
              animate={{ opacity: running ? 0 : 1 }}
              transition={fade}
            >
              <path d="M13 8.5a4.5 4.5 0 0 1-4.5 4.5H3.5l1.4-1.9A4.5 4.5 0 1 1 13 8.5" />
            </motion.svg>
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-snug font-medium">
            {name}
          </span>
          {handle ? (
            <span className="truncate text-[11px] leading-snug text-ink-3">
              @{handle}
            </span>
          ) : null}
        </span>

        <span
          className={cn(
            "shrink-0 font-mono text-xs tabular-nums transition-colors",
            running ? "text-ink" : "text-ink-3",
          )}
        >
          {running ? `${clock(left)} left` : "Clear"}
        </span>
      </div>

      <p className="text-xs leading-snug text-ink-2">
        {running
          ? `Timed out in ${room} under ${reason}. No posting until the ring clears.`
          : `Can post in ${room}.`}
      </p>

      {canModerate ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || !running}
            onClick={extend}
            className={chip}
          >
            Extend {spanPhrase(extendSeconds)}
          </button>
          <button
            type="button"
            disabled={disabled || !running}
            onClick={lift}
            className={chip}
          >
            Lift timeout
          </button>
        </div>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </div>
  );
}
