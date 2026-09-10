"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CountdownDelivery = "sent" | "delivered" | "read";

export type CountdownEvent = {
  id: string;
  /** Own messages sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** What is being waited for — "Bay four opens". */
  title: string;
  /** The sentence the event face shows once it has arrived. */
  opensLine: string;
  /** Where it happens, printed under the event line. */
  where?: string;
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own messages only. @default "sent" */
  delivery?: CountdownDelivery;
};

export type CountdownCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The message. */
  event: CountdownEvent;
  /** The run's length in seconds. Changing it is the reset: the run starts over. */
  seconds: number;
  /** Runs the countdown. @default false */
  running?: boolean;
  /** Fires from the run each time the whole second changes. */
  onRemainingChange?: (seconds: number) => void;
  /** Fires once, when the remainder reaches zero. */
  onReached?: () => void;
  /** Forces the hours column. @default on when `seconds` is 3600 or more */
  showHours?: boolean;
  /** Names the sender in the delivery sentence. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
/** A prerender has no document to ask, and the run has not started anyway. */
const getServerVisible = () => true;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the run. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Strips a stop the words already carry, so a sentence never doubles one. */
const bareOf = (line: string): string => line.trim().replace(/[.!?]+$/, "");

const phraseOf = (total: number): string => {
  const whole = Math.max(0, Math.round(total));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0)
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (rest > 0 || parts.length === 0)
    parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
};

const deliverySentence = (delivery: CountdownDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/**
 * One digit column, ten faces tall, taking its new position on `snap`. Each
 * column moves on its own, which is why a change of minute reads as a change of
 * minute rather than the whole readout redrawing.
 */
function DigitColumn({
  char,
  motionSafe,
}: {
  char: string;
  motionSafe: boolean;
}) {
  const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
  if (digit < 0) {
    return <span className="inline-block px-px opacity-60">{char}</span>;
  }
  return (
    <span className="relative inline-block h-[1.1em] w-[0.62em] overflow-hidden">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${digit * -10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((face) => (
          <span
            key={face}
            className="flex h-[1.1em] items-center justify-center"
          >
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

type BodyProps = {
  event: CountdownEvent;
  seconds: number;
  running: boolean;
  hours: boolean;
  motionSafe: boolean;
  onTick: (left: number) => void;
  onEnd: () => void;
};

/**
 * One run. Mounting is the reset — a new `seconds` is a new body, so a second
 * run can never inherit the first one's remainder — and the whole card reads
 * from a single motion value, which is why the digits, the rail and the flip
 * can never disagree. No clock is read anywhere: the remainder is animated from
 * the length the props named down to zero.
 */
function CountdownBody({
  event,
  seconds,
  running,
  hours,
  motionSafe,
  onTick,
  onEnd,
}: BodyProps) {
  const left = useMotionValue(Math.max(0, seconds));
  const [whole, setWhole] = React.useState(() =>
    Math.max(0, Math.ceil(seconds)),
  );
  const [reached, setReached] = React.useState(() => seconds <= 0);
  const [said, setSaid] = React.useState("");
  const [wasRunning, setWasRunning] = React.useState(running);

  const tickRef = useLatest(onTick);
  const endRef = useLatest(onEnd);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const goal = bareOf(event.title).toLowerCase();
  const arrived = `${bareOf(event.opensLine)}.`;

  const railScale = useTransform(left, (value) =>
    seconds > 0 ? Math.max(0, Math.min(1, value / seconds)) : 0,
  );

  React.useEffect(() => {
    let last = Math.max(0, Math.ceil(left.get()));
    return left.on("change", (value) => {
      const next = Math.max(0, Math.ceil(value));
      if (next === last) return;
      last = next;
      setWhole(next);
      tickRef.current(next);
      // Coarse milestones only: a region that spoke every second would be
      // unusable, so the readout stays aria-live="off" and this speaks twice.
      if (next === 60) setSaid(`One minute until ${goal}.`);
      else if (next === 10) setSaid(`Ten seconds until ${goal}.`);
    });
  }, [left, tickRef, goal]);

  React.useEffect(() => {
    if (!running || !visible || reached) return;
    const remaining = left.get();
    if (remaining <= 0) return;
    const controls = animate(left, 0, {
      // A remainder is a measurement: it drains at the same linear rate
      // whatever the motion preference, and a hidden tab holds it where it is.
      duration: remaining,
      ease: easings.linear,
      onComplete: () => {
        setReached(true);
        setSaid(arrived);
        endRef.current();
      },
    });
    return () => controls.stop();
  }, [running, visible, reached, left, endRef, arrived]);

  // Adjusted in render rather than pushed from an effect: the sentence is
  // frozen at the moment the run is started or held, with the figure that
  // moment carried.
  if (wasRunning !== running) {
    setWasRunning(running);
    if (!reached) {
      setSaid(
        running
          ? `Counting down, ${phraseOf(whole)} until ${goal}.`
          : `Held at ${phraseOf(whole)}.`,
      );
    }
  }

  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const readout = hours
    ? `${pad(hh)}:${pad(mm)}:${pad(ss)}`
    : `${pad(mm)}:${pad(ss)}`;

  const turn = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <>
      {/* Both faces share one cell, so the card keeps one box and the turn has
          something to turn inside. */}
      <div className="grid" style={{ perspective: "700px" }}>
        <motion.div
          aria-hidden={reached}
          className="col-start-1 row-start-1 flex flex-col gap-2"
          style={{ backfaceVisibility: "hidden", transformOrigin: "center" }}
          initial={false}
          animate={
            motionSafe
              ? { rotateX: reached ? 90 : 0, opacity: 1 }
              : { rotateX: 0, opacity: reached ? 0 : 1 }
          }
          transition={turn}
        >
          <p
            role="timer"
            aria-live="off"
            aria-label={`${phraseOf(whole)} until ${goal}.`}
            className="flex items-center font-mono text-[26px] leading-none font-semibold tabular-nums"
          >
            <span aria-hidden className="flex items-center">
              {readout.split("").map((char, index) => (
                <DigitColumn key={index} char={char} motionSafe={motionSafe} />
              ))}
            </span>
          </p>

          <span
            aria-hidden
            className="h-1 w-full overflow-hidden rounded-full bg-current/15"
          >
            <motion.span
              className="block h-full origin-left rounded-full bg-current/55"
              style={{ scaleX: railScale }}
            />
          </span>

          {/* Both captions in one cell, cross-faded, so no height is reserved
              for the state that is not showing. */}
          <span className="grid text-[11px] leading-4">
            <motion.span
              aria-hidden={!running}
              className="col-start-1 row-start-1 opacity-70"
              initial={false}
              animate={{ opacity: running ? 0.7 : 0 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {`Counting down to ${goal}`}
            </motion.span>
            <motion.span
              aria-hidden={running}
              className="col-start-1 row-start-1 opacity-70"
              initial={false}
              animate={{ opacity: running ? 0 : 0.7 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {`Held at ${phraseOf(whole)}`}
            </motion.span>
          </span>
        </motion.div>

        <motion.div
          aria-hidden={!reached}
          className="col-start-1 row-start-1 flex flex-col gap-1.5"
          style={{ backfaceVisibility: "hidden", transformOrigin: "center" }}
          initial={false}
          animate={
            motionSafe
              ? { rotateX: reached ? 0 : -90, opacity: 1 }
              : { rotateX: 0, opacity: reached ? 1 : 0 }
          }
          transition={turn}
        >
          <span className="flex h-6 w-fit items-center rounded-full bg-current/15 px-2 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase">
            Now on
          </span>
          <p className="text-[13px] leading-5 font-medium">{arrived}</p>
          {event.where ? (
            <p className="text-[12px] leading-4 opacity-80">{event.where}</p>
          ) : null}
        </motion.div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  );
}

/**
 * A message that is counting, and the moment it stops. Each digit column is ten
 * faces tall and takes its new position on `snap`, one crisp overshoot, so the
 * seconds column rolls every second while the minutes column sits still until
 * it is its turn — the roll is per column, which is why a change of minute
 * reads as a change of minute. A rail under the digits drains linearly across
 * the whole span, because a remainder is a measurement and not a flourish, and
 * it keeps draining under reduced motion for the same reason.
 *
 * Reaching zero turns the card: the countdown face rotates from 0 to 90 degrees
 * about its horizontal axis while the event face rotates from -90 to 0, both on
 * `glide` and both two-keyframe, with their back faces hidden so only the face
 * toward you is ever painted — one card turning over rather than two swapping.
 *
 * No clock is read here. The run is one motion value animated from the
 * `seconds` the props named down to zero, started only by `running`, held where
 * it stands while the document is hidden, and stopped in the effect's cleanup;
 * mounting is the reset, so a new `seconds` is a new run rather than a stale one
 * resumed. The readout is a `role="timer"` whose `aria-label` is a sentence but
 * which never announces, while an sr-only status speaks on settle and at coarse
 * milestones only. Under reduced motion the card does not turn: the faces
 * cross-fade in place and the digits swap without rolling.
 */
export function CountdownCard({
  ref,
  event,
  seconds,
  running = false,
  onRemainingChange,
  onReached,
  showHours,
  peerName = "Them",
  label = "Thread",
  className,
}: CountdownCardProps) {
  const motionSafe = useMotionSafe();
  const own = event.from === "me";
  const delivery = event.delivery ?? "sent";
  const hours = showHours ?? seconds >= 3600;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-1">
        <li
          className={cn(
            "flex flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-[92%] flex-col gap-2.5 rounded-3 px-3 py-2.5",
              own
                ? "rounded-br-1 bg-primary text-primary-foreground"
                : "rounded-bl-1 bg-surface-2 text-foreground",
            )}
          >
            <p className="text-[13px] leading-5 font-medium">{event.title}</p>

            {/* Keyed by the run's length: a new length is a new run, and
                mounting is the only reset there is. */}
            <CountdownBody
              key={seconds}
              event={event}
              seconds={seconds}
              running={running}
              hours={hours}
              motionSafe={motionSafe}
              onTick={(left) => onRemainingChange?.(left)}
              onEnd={() => onReached?.()}
            />
          </div>

          <span className="flex items-center gap-1.5 px-1">
            {event.time ? (
              <span className="text-[11px] text-ink-3 tabular-nums">
                {event.time}
              </span>
            ) : null}
            {own ? (
              <span
                role="img"
                aria-label={deliverySentence(delivery, peerName)}
                className={cn(
                  "inline-flex size-3.5 items-center justify-center",
                  delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d={CHECK} />
                  {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
                </svg>
              </span>
            ) : null}
          </span>
        </li>
      </ol>
    </div>
  );
}
