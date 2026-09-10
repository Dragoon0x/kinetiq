"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RingtoneStatus = "ringing" | "answered" | "declined" | "missed";

export type RingtonePulseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who is calling; drives the procedural initials and every sentence. */
  callerName: string;
  /** The room the call comes from, printed under the name. */
  roomName?: string;
  /** Controlled status. */
  status?: RingtoneStatus;
  /** Initial status for uncontrolled usage. @default "ringing" */
  defaultStatus?: RingtoneStatus;
  onStatusChange?: (status: RingtoneStatus) => void;
  /** Fires from the Answer control. */
  onAnswer?: () => void;
  /** Fires from the Decline control and from Escape. */
  onDecline?: () => void;
  /** Expanding rings behind the disc. @default 3 */
  rings?: number;
  /** Names the card for assistive technology; defaults to the calling sentence. */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab rings at nobody, so the pulse rests while it is away. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/**
 * Someone is calling — announced by light, never by sound: this ringtone is a
 * visual pulse and plays nothing. While the call is live, rings expand from the
 * caller's disc and fade to nothing on a repeating tween, each a third of a
 * cycle behind the last, and the repeat is gated on document visibility so a
 * hidden tab rings at nobody. The two answers arrive as two directions —
 * Decline slides in from the left, Answer from the right, on `snap` a
 * `cascade(2)` beat apart — because the choice should look like the choice.
 * Answering collapses the rings into the disc on `flick` and swaps the body to
 * a connected line; declining only fades, since a decline never celebrates. The
 * body's height is read by a ResizeObserver and glides between states, so no
 * state reserves room for another, and the card sits in flow rather than
 * floating over whatever the host wrote above it.
 *
 * The card is a group named in one sentence, Escape declines from anywhere
 * inside it, focus lands on the line that replaces the controls rather than
 * being dropped, and a polite status speaks each change once. Under reduced
 * motion the disc holds a steady ring, the controls fade in together, and the
 * words carry everything the pulse carried.
 */
export function RingtonePulse({
  ref,
  callerName,
  roomName,
  status,
  defaultStatus = "ringing",
  onStatusChange,
  onAnswer,
  onDecline,
  rings = 3,
  label,
  className,
}: RingtonePulseProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();

  const [uncontrolled, setUncontrolled] =
    React.useState<RingtoneStatus>(defaultStatus);
  const current = status ?? uncontrolled;
  const ringing = current === "ringing";

  const calling = roomName
    ? `${callerName} is calling from ${roomName}`
    : `${callerName} is calling`;

  const sentenceFor = (next: RingtoneStatus): string =>
    next === "ringing"
      ? calling
      : next === "answered"
        ? "Call answered"
        : next === "declined"
          ? "Call declined"
          : `Missed call from ${callerName}`;

  // The sentence is frozen the moment the status differs, so a render that
  // merely re-derives it cannot make the region repeat a past call.
  const [seen, setSeen] = React.useState(() => ({
    status: current,
    sentence: "",
    stamp: 0,
  }));
  if (seen.status !== current) {
    setSeen({
      status: current,
      sentence: sentenceFor(current),
      stamp: seen.stamp + 1,
    });
  }

  const setStatus = (next: RingtoneStatus) => {
    if (status === undefined) setUncontrolled(next);
    onStatusChange?.(next);
  };

  // Focus follows the swap only when a control here caused it; a status that
  // arrived as a prop must not steal focus from wherever the reader was.
  const moveFocus = React.useRef(false);
  const lineRef = React.useRef<HTMLParagraphElement | null>(null);
  React.useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    lineRef.current?.focus();
  }, [seen.stamp]);

  const answer = () => {
    moveFocus.current = true;
    setStatus("answered");
    onAnswer?.();
  };

  const decline = () => {
    moveFocus.current = true;
    setStatus("declined");
    onDecline?.();
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ringCount = Math.max(1, Math.round(rings));
  const cycle = durations.page * 2;
  const beat = cascade(2);

  const lineWords =
    current === "answered"
      ? `On the call with ${callerName}`
      : current === "declined"
        ? "You declined the call"
        : `Missed call from ${callerName}`;

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
      >
        <div ref={innerRef}>
          <div
            role="group"
            aria-label={label ?? sentenceFor(current)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !ringing) return;
              event.preventDefault();
              decline();
            }}
            className="flex flex-col items-center gap-3 overflow-hidden rounded-3 border border-hairline bg-surface-1 p-4"
          >
            <span className="relative grid size-12 shrink-0 place-items-center">
              {/* The rings live behind the disc inside the card's own clip, so
                  a pulse can never paint over what the host wrote above. */}
              {ringing && motionSafe && visible
                ? Array.from({ length: ringCount }, (_, index) => (
                    <motion.span
                      key={index}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full border border-cobalt-bright"
                      initial={{ scale: 1, opacity: 0.45 }}
                      animate={{ scale: 2.1, opacity: 0 }}
                      transition={{
                        duration: cycle,
                        ease: easings.enter,
                        repeat: Infinity,
                        delay: Number(((index * cycle) / ringCount).toFixed(3)),
                      }}
                    />
                  ))
                : null}
              {ringing && !(motionSafe && visible) ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1.5 rounded-full border border-cobalt-bright/40"
                />
              ) : null}

              <motion.span
                aria-hidden
                className={cn(
                  "relative grid size-12 place-items-center rounded-full border text-sm font-semibold transition-colors",
                  ringing
                    ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                    : "border-hairline bg-surface-2 text-ink-3",
                )}
                initial={false}
                animate={{ scale: motionSafe && !ringing ? 0.96 : 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                {initialsOf(callerName)}
              </motion.span>
            </span>

            <span className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="max-w-full truncate text-sm font-semibold text-foreground">
                {callerName}
              </span>
              <span
                aria-hidden
                className="max-w-full truncate text-xs text-ink-3"
              >
                {ringing
                  ? roomName
                    ? `Incoming call · ${roomName}`
                    : "Incoming call"
                  : (roomName ?? "Call")}
              </span>
            </span>

            {/* popLayout takes the leaving body out of flow, so the frame
                glides to the new body's height instead of stacking both. */}
            <AnimatePresence initial={false} mode="popLayout">
              {ringing ? (
                <motion.div
                  key="controls"
                  className="flex w-full items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <motion.button
                    type="button"
                    onClick={decline}
                    aria-label="Decline the call"
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium text-danger transition-colors hover:bg-danger/10",
                      focusRing,
                    )}
                    initial={
                      motionSafe
                        ? { x: -distances.shift, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? springs.snap
                        : { duration: durations.fast, ease: easings.enter }
                    }
                  >
                    Decline
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={answer}
                    aria-label="Answer the call"
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center rounded-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                      focusRing,
                    )}
                    initial={
                      motionSafe
                        ? { x: distances.shift, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.snap, delay: beat }
                        : { duration: durations.fast, ease: easings.enter }
                    }
                  >
                    Answer
                  </motion.button>
                </motion.div>
              ) : (
                <motion.p
                  key="line"
                  ref={lineRef}
                  tabIndex={-1}
                  className={cn(
                    "w-full rounded-2 bg-surface-2 px-3 py-2 text-center text-xs",
                    current === "answered" ? "text-ink-2" : "text-ink-3",
                    focusRing,
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  {lineWords}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </div>
  );
}
