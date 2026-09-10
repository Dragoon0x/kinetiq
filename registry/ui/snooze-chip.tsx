"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SnoozeDuration = {
  id: string;
  /** Chip copy, also spoken as "Snooze for 20 minutes, back at 4:05 pm." */
  label: string;
  /** Minutes from now. Ignored when `at` is set. */
  minutes?: number;
  /** A minute of the day to wake at instead — the next time it comes round. */
  at?: number;
};

export type SnoozeChipProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who or what the notification is from. */
  title: string;
  /** The one line of the notification. */
  body: string;
  /** A quiet third line ("Coldbrook yard"). */
  meta?: string;
  /** The fold's stops. @default 20 minutes / 1 hour / 3 hours / Tomorrow at 9 */
  durations?: SnoozeDuration[];
  /** The host's minute of the day, 0–1439. Never a clock read in here. @default 945 */
  nowMinutes?: number;
  /** Controlled fold state. */
  open?: boolean;
  /** Initial fold state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the chip, from Escape, and from a chosen duration. */
  onOpenChange?: (open: boolean) => void;
  /** Fires with the chosen snooze, or null from Undo. */
  onSnooze?: (
    snooze: { id: string; label: string; wakeMinutes: number } | null,
  ) => void;
  /** Fires once when `nowMinutes` reaches the wake time. */
  onWake?: () => void;
  /** Formats a minute of the day. @default a 12-hour clock */
  format?: (minutes: number) => string;
  /** Copy for the chip. @default "Snooze" */
  snoozeLabel?: string;
  className?: string;
};

const DAY = 1440;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const DEFAULT_DURATIONS: SnoozeDuration[] = [
  { id: "20m", label: "20 minutes", minutes: 20 },
  { id: "1h", label: "1 hour", minutes: 60 },
  { id: "3h", label: "3 hours", minutes: 180 },
  { id: "9am", label: "Tomorrow at 9", at: 540 },
];

const wrap = (minute: number): number => ((minute % DAY) + DAY) % DAY;
const round3 = (value: number): number => Number(value.toFixed(3));
/** Minutes forward from `from` to `to` around the dial. */
const forward = (from: number, to: number): number => wrap(to - from);

const defaultFormat = (minute: number): string => {
  const total = wrap(Math.round(minute));
  const hour24 = Math.floor(total / 60);
  const rest = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${hour24 < 12 ? "am" : "pm"}`;
};

const wakeFor = (duration: SnoozeDuration, now: number): number =>
  duration.at !== undefined
    ? wrap(duration.at)
    : wrap(now + (duration.minutes ?? 0));

/** One string per chip, so no accessible name is spliced from two nodes. */
const chipSentence = (
  duration: SnoozeDuration,
  now: number,
  format: (minutes: number) => string,
): string => {
  const back = format(wakeFor(duration, now));
  return duration.at !== undefined
    ? `Snooze until ${duration.label.toLowerCase()}, back at ${back}.`
    : `Snooze for ${duration.label.toLowerCase()}, back at ${back}.`;
};

const takenSentence = (
  duration: SnoozeDuration,
  wake: number,
  format: (minutes: number) => string,
): string =>
  duration.at !== undefined
    ? `Snoozed until ${duration.label.toLowerCase()}. Back at ${format(wake)}.`
    : `Snoozed for ${duration.label.toLowerCase()}. Back at ${format(wake)}.`;

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Measures a layer, so no height is ever reserved for the state not showing. */
function useMeasured(): [
  React.RefObject<HTMLDivElement | null>,
  number | null,
] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, height];
}

/**
 * A clock whose hands point at the wake time. The endpoints come out of
 * trigonometry and are rounded to three decimals before they reach an
 * attribute, because Node and the browser disagree in the last digits of sine
 * and a mismatched attribute is a hydration error.
 */
function ClockStamp({
  minute,
  motionSafe,
}: {
  minute: number;
  motionSafe: boolean;
}) {
  const hourAngle = ((minute % 720) / 720) * Math.PI * 2;
  const minuteAngle = ((minute % 60) / 60) * Math.PI * 2;
  const hand = (angle: number, length: number) => ({
    x: round3(10 + Math.sin(angle) * length),
    y: round3(10 - Math.cos(angle) * length),
  });
  const hour = hand(hourAngle, 3.2);
  const past = hand(minuteAngle, 4.6);
  const move = motionSafe ? springs.glide : { duration: 0 };
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-5 shrink-0">
      <circle
        cx="10"
        cy="10"
        r="7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.4"
      />
      <motion.line
        x1="10"
        y1="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={false}
        animate={{ x2: hour.x, y2: hour.y }}
        transition={move}
      />
      <motion.line
        x1="10"
        y1="10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        initial={false}
        animate={{ x2: past.x, y2: past.y }}
        transition={move}
      />
    </svg>
  );
}

type Session = {
  id: string;
  label: string;
  wake: number;
  delta: number;
  startedAt: number;
};

/**
 * One notification, put off until a stated time. The Snooze chip unfolds the
 * durations below the card in flow — the block's height is measured by a
 * ResizeObserver and joined on `glide`, so the choices never float outside the
 * component's own box — and picking one does two things at once: the card
 * slides sixteen pixels away and fades on the exit ease, which accelerates
 * rather than springs, while the block collapses to the stamp's own measured
 * height and the stamp lands on `recoil`, ζ0.53, the one place here allowed two
 * bounces. On the stamp a small clock turns its hands to the wake time on
 * `glide`, with the endpoints rounded before they reach an attribute.
 *
 * The wake time is arithmetic rather than a clock: `nowMinutes` comes from the
 * host, the duration is added, the result wraps at midnight and a `format` prop
 * prints it. When the host's minute reaches it the component reports `onWake`
 * once and the card returns. Undo brings it back at once and hands focus back
 * to the chip, so the wrong duration costs nothing.
 *
 * The chip is a disclosure with `aria-expanded`; the fold is a labelled group
 * of real buttons, each named with the time it produces, roved by Left and
 * Right with Home and End at the ends and folded by Escape. Choosing one moves
 * focus to Undo, because the control that had it has just left. Whichever layer
 * is not showing is out of the tab order and hidden from assistive technology.
 * A status region says what changed as it changes. Under reduced motion the two
 * layers cross-fade in place and the hands are drawn at the wake time without
 * turning — the promise still arrives, only the flourish goes.
 */
export function SnoozeChip({
  ref,
  title,
  body,
  meta,
  durations: stops = DEFAULT_DURATIONS,
  nowMinutes = 945,
  open,
  defaultOpen = false,
  onOpenChange,
  onSnooze,
  onWake,
  format = defaultFormat,
  snoozeLabel = "Snooze",
  className,
}: SnoozeChipProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const foldId = `${baseId}-fold`;
  const chipId = (id: string) => `${baseId}-chip-${id}`;

  const now = wrap(nowMinutes);
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [session, setSession] = React.useState<Session | null>(null);
  const [said, setSaid] = React.useState("");
  const [woke, setWoke] = React.useState(0);

  const chipRef = React.useRef<HTMLButtonElement | null>(null);
  const undoRef = React.useRef<HTMLButtonElement | null>(null);

  // A spent snooze is cleared while rendering rather than from an effect, so
  // the sentence belongs to the minute that ended it and is said once.
  if (session !== null && forward(session.startedAt, now) >= session.delta) {
    setSession(null);
    setSaid("Back now.");
    setWoke((count) => count + 1);
  }

  const wakeRef = useLatest(onWake);
  React.useEffect(() => {
    if (woke === 0) return;
    wakeRef.current?.();
  }, [woke, wakeRef]);

  const [cardRef, cardHeight] = useMeasured();
  const [stampRef, stampHeight] = useMeasured();
  const snoozed = session !== null;
  const target = snoozed ? stampHeight : cardHeight;

  const height = useMotionValue<number | string>("auto");
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (target === null) return;
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
  }, [target, height, motionSafe]);

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const closeToChip = () => {
    setOpen(false);
    requestAnimationFrame(() => chipRef.current?.focus());
  };

  const choose = (duration: SnoozeDuration) => {
    const wake = wakeFor(duration, now);
    const delta = Math.max(1, forward(now, wake));
    setSession({
      id: duration.id,
      label: duration.label,
      wake,
      delta,
      startedAt: now,
    });
    setSaid(takenSentence(duration, wake, format));
    setOpen(false);
    onSnooze?.({ id: duration.id, label: duration.label, wakeMinutes: wake });
    // The control that had focus is leaving with the card, so focus follows
    // the thing that replaces it.
    requestAnimationFrame(() => undoRef.current?.focus());
  };

  const undo = () => {
    setSession(null);
    setSaid("Snooze undone.");
    onSnooze?.(null);
    requestAnimationFrame(() => chipRef.current?.focus());
  };

  const focusChip = (index: number) => {
    const clamped = Math.min(stops.length - 1, Math.max(0, index));
    const stop = stops[clamped];
    if (!stop) return;
    document.getElementById(chipId(stop.id))?.focus();
  };

  const chipKeys =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusChip(index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusChip(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusChip(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusChip(stops.length - 1);
      }
    };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <motion.div
        style={{ height }}
        className="relative overflow-clip [contain:paint]"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !isOpen) return;
          event.preventDefault();
          closeToChip();
        }}
      >
        <motion.div
          ref={cardRef}
          aria-hidden={snoozed}
          className={cn(snoozed && "pointer-events-none")}
          initial={false}
          animate={{
            opacity: snoozed ? 0 : 1,
            x: snoozed && motionSafe ? distances.shift : 0,
          }}
          transition={snoozed ? exitFor() : motionSafe ? springs.glide : fade}
        >
          <div className="flex items-start gap-2.5 px-1 pt-1">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-cobalt-wash font-mono text-[11px] font-medium text-cobalt-bright"
            >
              {initialsOf(title)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {title}
              </span>
              <span className="block text-sm leading-snug text-ink-2">
                {body}
              </span>
              {meta ? (
                <span className="block truncate pt-0.5 text-[11px] text-ink-3">
                  {meta}
                </span>
              ) : null}
            </span>
          </div>

          <div className="flex items-center gap-2 px-1 pt-2 pb-1">
            <button
              ref={chipRef}
              type="button"
              tabIndex={snoozed ? -1 : 0}
              aria-expanded={isOpen}
              aria-controls={foldId}
              aria-label={`${snoozeLabel} this notification.`}
              onClick={() => setOpen(!isOpen)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium transition-colors hover:bg-accent",
                focusRing,
              )}
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="7.4" strokeOpacity="0.5" />
                <path d="M10 6.2V10l2.6 1.6" />
              </svg>
              {snoozeLabel}
            </button>
          </div>

          {/* Height only when it is open, so the block's measurement — and the
              glide that follows it — is the whole unfold. */}
          <div
            id={foldId}
            className="overflow-clip [contain:paint]"
            style={{ height: isOpen ? undefined : 0 }}
          >
            <div
              role="group"
              aria-label={`${snoozeLabel} until`}
              aria-hidden={!isOpen}
              className="flex flex-wrap gap-1.5 px-1 pt-1.5 pb-1"
            >
              {stops.map((duration, index) => (
                <motion.button
                  key={duration.id}
                  id={chipId(duration.id)}
                  type="button"
                  tabIndex={isOpen && !snoozed ? 0 : -1}
                  aria-label={chipSentence(duration, now, format)}
                  onClick={() => choose(duration)}
                  onKeyDown={chipKeys(index)}
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

        {/* The stamp is a landing, which is the one thing here that may bounce.
            It sits over the card's box rather than beside it, so nothing is
            reserved for the state that is not showing. */}
        <motion.div
          ref={stampRef}
          aria-hidden={!snoozed}
          className={cn(
            "absolute inset-x-0 top-0",
            !snoozed && "pointer-events-none",
          )}
          initial={false}
          animate={{
            opacity: snoozed ? 1 : 0,
            scale: motionSafe ? (snoozed ? 1 : 0.94) : 1,
          }}
          transition={
            snoozed && motionSafe
              ? { ...springs.recoil, opacity: fade }
              : { duration: durations.fast, ease: easings.enter }
          }
        >
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <span className="text-cobalt-bright">
              <ClockStamp
                minute={session?.wake ?? now}
                motionSafe={motionSafe}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {session ? `Back at ${format(session.wake)}` : ""}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {session ? `${title} · snoozed` : ""}
              </span>
            </span>
            <button
              ref={undoRef}
              type="button"
              tabIndex={snoozed ? 0 : -1}
              aria-label="Undo the snooze and bring the notification back."
              onClick={undo}
              className={cn(
                "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors hover:bg-accent",
                focusRing,
              )}
            >
              Undo
            </button>
          </div>
        </motion.div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
