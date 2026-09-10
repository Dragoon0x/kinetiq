"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MuteDuration = {
  id: string;
  /** Chip copy, also spoken as "Mute for 30 minutes." */
  label: string;
  /** Milliseconds of quiet; 0 means until it is turned back on. */
  ms: number;
};

export type MuteBellProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The channel's name, printed after a hash. */
  channel: string;
  /** The row's second line while notifications are on. */
  topic?: string;
  /** The picker's stops. @default 30 minutes / 1 hour / 8 hours / until you say */
  durations?: MuteDuration[];
  /** Controlled picker state. */
  open?: boolean;
  /** Initial picker state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the bell, Escape, or a chosen duration. */
  onOpenChange?: (open: boolean) => void;
  /** Fires with the chosen duration, or null when notifications come back on. */
  onMuteChange?: (mute: MuteDuration | null) => void;
  /** Fires once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Countdown milliseconds per real millisecond. @default 1 */
  speed?: number;
  /** Names the channel in the spoken sentences. @default `#${channel}` */
  label?: string;
  className?: string;
};

const DEFAULT_DURATIONS: MuteDuration[] = [
  { id: "30m", label: "30 minutes", ms: 30 * 60_000 },
  { id: "1h", label: "1 hour", ms: 60 * 60_000 },
  { id: "8h", label: "8 hours", ms: 8 * 60 * 60_000 },
  { id: "open", label: "Until I say", ms: 0 },
];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Session = { id: string; label: string; ms: number; remaining: number };

/** Short form for the row's second line. */
const shortRemaining = (session: Session): string => {
  if (session.ms === 0) return "until you say";
  const minutes = Math.max(0, Math.ceil(session.remaining / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
};

/** The whole sentence, built in one string so a name never joins two nodes. */
const spokenRemaining = (session: Session): string => {
  if (session.ms === 0) return "Muted until you turn notifications back on.";
  const minutes = Math.max(1, Math.ceil(session.remaining / 60_000));
  if (minutes < 60) {
    return `Muted for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}.`;
  }
  const hours = Math.max(1, Math.ceil(minutes / 60));
  return `Muted for ${hours} more ${hours === 1 ? "hour" : "hours"}.`;
};

const chosenSentence = (duration: MuteDuration): string =>
  duration.ms === 0
    ? "Muted until you turn notifications back on."
    : `Muted for ${duration.label.toLowerCase()}.`;

const chipSentence = (duration: MuteDuration, name: string): string =>
  duration.ms === 0
    ? `Mute ${name} until you turn it back on.`
    : `Mute ${name} for ${duration.label.toLowerCase()}.`;

/** Keeps a callback out of the tick effect's deps, so a re-render never
 *  restarts the countdown mid-minute. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A bell that goes quiet for a stated length of time. Pressing it while
 * notifications are on unfolds a duration picker below the row — a
 * ResizeObserver-measured height joined on `glide`, in flow, so the choices
 * never float over what the host drew above. Choosing one folds the picker and
 * swings the bell: a four-keyframe tween, because a spring takes exactly two,
 * while the slash draws across it on `flick`, the confirmation spring. From
 * there a ring around the bell drains — each second animates it to its next stop
 * linearly, so the ring moves continuously while one interval owns the whole
 * countdown — and the row's second line reads the time left in place of the
 * topic, cross-faded in a single grid cell so nothing reflows. Pressing a muted
 * bell brings notifications back at once and the bell does not swing, because
 * coming back is not an event worth a flourish.
 *
 * The countdown pauses while the document is hidden, lives in an effect with
 * cleanup, and never reads a clock during render. The bell is a disclosure while
 * notifications are on and an action while they are off; its name is one
 * sentence either way, the picker's chips are real buttons, Escape folds the
 * picker and returns focus to the bell, and a status region says what changed as
 * it changes. Under reduced motion nothing swings and the picker's height swaps,
 * but the ring still drains, because a countdown is information.
 */
export function MuteBell({
  ref,
  channel,
  topic,
  durations: stops = DEFAULT_DURATIONS,
  open,
  defaultOpen = false,
  onOpenChange,
  onMuteChange,
  onExpire,
  speed = 1,
  label,
  className,
}: MuteBellProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const pickerId = `${baseId}-picker`;
  const name = label ?? `#${channel}`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [session, setSession] = React.useState<Session | null>(null);
  const [swing, setSwing] = React.useState(0);
  const [said, setSaid] = React.useState("");

  const bellRef = React.useRef<HTMLButtonElement | null>(null);
  const sessionRef = React.useRef(session);
  React.useEffect(() => {
    sessionRef.current = session;
  });
  const expireRef = useLatest(onExpire);

  // A session that has run out stays in state as a spent one: rendering reads
  // it as unmuted, so nothing has to be cleared from inside an effect body.
  const active =
    session && (session.ms === 0 || session.remaining > 0) ? session : null;
  const muted = active !== null;
  const ticking = session !== null && session.ms > 0 && session.remaining > 0;

  React.useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => {
      // A hidden tab does not burn the mute: the countdown is a promise about
      // attention, and nobody was paying any.
      if (document.hidden) return;
      const current = sessionRef.current;
      if (!current) return;
      const next = Math.max(0, current.remaining - 1000 * speed);
      const updated = { ...current, remaining: next };
      sessionRef.current = updated;
      setSession(updated);
      if (next === 0) {
        setSaid("The mute ran out. Notifications are back on.");
        expireRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [ticking, speed, expireRef]);

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const closeToBell = () => {
    setOpen(false);
    requestAnimationFrame(() => bellRef.current?.focus());
  };

  const pressBell = () => {
    if (muted) {
      sessionRef.current = null;
      setSession(null);
      setSaid("Notifications are on.");
      onMuteChange?.(null);
      return;
    }
    setOpen(!isOpen);
  };

  const choose = (duration: MuteDuration) => {
    const next: Session = { ...duration, remaining: duration.ms };
    sessionRef.current = next;
    setSession(next);
    setSwing((count) => count + 1);
    setSaid(chosenSentence(duration));
    onMuteChange?.(duration);
    setOpen(false);
    requestAnimationFrame(() => bellRef.current?.focus());
  };

  // The picker measures its own content, so the fold is exact at any width and
  // no height is reserved for choices that are not showing.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = useMotionValue<number | string>(
    (open ?? defaultOpen) ? "auto" : 0,
  );
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    const target = isOpen ? content : 0;
    if (!seeded.current) {
      seeded.current = true;
      height.set(target);
      return;
    }
    const controls = animate(
      height,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, isOpen, height, motionSafe]);

  // Rounded before it reaches a motion string: an unrounded ratio re-serialises
  // differently on the server and the client, and that is a hydration error.
  const left = active
    ? active.ms === 0
      ? 1
      : Number((active.remaining / active.ms).toFixed(3))
    : 0;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      // Escape is handled for the whole row, not just the picker: the picker
      // opens with focus still on the bell, so a handler on the picker alone
      // would miss the very key press the reader is most likely to make.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        closeToBell();
      }}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            #{channel}
          </span>
          {/* Both lines share one cell, so the row's height never depends on
              which of them is showing. */}
          <span className="grid">
            <motion.span
              aria-hidden={muted}
              className="col-start-1 row-start-1 block truncate text-[11px] text-ink-3"
              initial={false}
              animate={{ opacity: muted ? 0 : 1 }}
              transition={fade}
            >
              {topic}
            </motion.span>
            <motion.span
              aria-hidden={!muted}
              className="col-start-1 row-start-1 block truncate font-mono text-[11px] text-cobalt-bright tabular-nums"
              initial={false}
              animate={{ opacity: muted ? 1 : 0 }}
              transition={fade}
            >
              {active ? `Muted · ${shortRemaining(active)}` : ""}
            </motion.span>
          </span>
        </span>

        <button
          ref={bellRef}
          type="button"
          aria-expanded={muted ? undefined : isOpen}
          aria-controls={muted ? undefined : pickerId}
          aria-label={
            active
              ? `${spokenRemaining(active)} Turn notifications back on.`
              : `Mute ${name}.`
          }
          onClick={pressBell}
          className={cn(
            "relative grid size-9 shrink-0 place-items-center rounded-full transition-colors",
            muted ? "text-ink-3 hover:text-foreground" : "text-foreground",
            "hover:bg-accent",
            focusRing,
          )}
        >
          <svg
            viewBox="0 0 36 36"
            aria-hidden
            fill="none"
            className="size-9"
            stroke="currentColor"
          >
            <motion.circle
              cx="18"
              cy="18"
              r="15.5"
              className="text-cobalt-bright"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              transform="rotate(-90 18 18)"
              initial={false}
              animate={{ strokeDashoffset: Number((1 - left).toFixed(3)) }}
              transition={
                !motionSafe
                  ? { duration: 0 }
                  : muted
                    ? // One tick's worth of drain, so the ring moves
                      // continuously while one interval owns the countdown.
                      { duration: 1, ease: easings.linear }
                    : // Cancelling is not expiring: the ring clears at once.
                      { duration: durations.fast, ease: easings.exit }
              }
            />
            {/* Remounting on each mute replays the keyframes; the tween is the
                honest shape for a swing, since a spring takes only two frames. */}
            <motion.g
              key={swing}
              style={{ originX: 0.5, originY: 0.12 }}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={
                motionSafe && swing > 0
                  ? { rotate: [0, -16, 12, -7, 0] }
                  : { rotate: 0 }
              }
              transition={{ duration: durations.slow, ease: easings.move }}
            >
              <path d="M18 9.5a5 5 0 0 0-5 5c0 3.4-.9 4.9-1.7 5.8-.5.5-.1 1.4.6 1.4h12.2c.7 0 1.1-.9.6-1.4-.8-.9-1.7-2.4-1.7-5.8a5 5 0 0 0-5-5z" />
              <path d="M15.9 24.4a2.2 2.2 0 0 0 4.2 0" />
            </motion.g>
            <motion.path
              d="M11.5 11.5 24.5 24.5"
              strokeWidth="1.8"
              strokeLinecap="round"
              initial={false}
              animate={{ pathLength: muted ? 1 : 0, opacity: muted ? 1 : 0 }}
              transition={
                motionSafe
                  ? { ...springs.flick, opacity: fade }
                  : { duration: durations.fast }
              }
            />
          </svg>
        </button>
      </div>

      <motion.div
        id={pickerId}
        style={{ height }}
        className="overflow-clip [contain:paint]"
      >
        <div ref={innerRef} className="px-1 pt-3 pb-1">
          <div
            role="group"
            aria-label={`Mute ${name} for`}
            aria-hidden={!isOpen}
            className="flex flex-wrap gap-1.5"
          >
            {stops.map((duration) => (
              <motion.button
                key={duration.id}
                type="button"
                tabIndex={isOpen ? 0 : -1}
                aria-label={chipSentence(duration, name)}
                onClick={() => choose(duration)}
                initial={false}
                animate={{ opacity: isOpen ? 1 : 0 }}
                transition={fade}
                className={cn(
                  "flex h-8 items-center rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium transition-colors hover:bg-accent",
                  focusRing,
                )}
              >
                {duration.label}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
