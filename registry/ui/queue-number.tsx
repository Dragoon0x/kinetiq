"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QueueNumberProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The number now being served. */
  serving: number;
  /** The customer's own number. */
  ticket: number;
  /** Estimated seconds per ticket ahead. @default 90 */
  secondsPerTicket?: number;
  /** Whether the estimate counts down. @default true */
  running?: boolean;
  /** How a number prints. @default "A-042" style, padded to three digits */
  format?: (value: number) => string;
  /** The counter's name, printed above the figure. @default "Now serving" */
  label?: string;
  className?: string;
};

const defaultFormat = (value: number) =>
  `A-${String(Math.max(0, Math.floor(value))).padStart(3, "0")}`;

/** Each face of a column, in em, so the strip scales with the type size. */
const FACE = 1.15;
/** Ten faces and a second zero: the strip wraps 9 → 0 without changing direction. */
const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the wait stops counting where nobody is. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * One digit of the odometer. The column tracks its running position — the
 * whole count, not the face — through a motion value on `snap`, and shows
 * position mod ten on an eleven-face strip. Going 9 → 0 therefore rolls on
 * upward into the spare zero and lands on the first, pixel for pixel the same
 * face, so the board only ever clicks over in one direction.
 */
function Column({
  position,
  motionSafe,
}: {
  position: number;
  motionSafe: boolean;
}) {
  const pos = useMotionValue(position);
  const y = useTransform(pos, (latest) => {
    const face = ((latest % 10) + 10) % 10;
    return `${(-face * FACE).toFixed(3)}em`;
  });

  React.useEffect(() => {
    if (!motionSafe) {
      pos.set(position);
      return;
    }
    const controls = animate(pos, position, springs.snap);
    return () => controls.stop();
  }, [position, motionSafe, pos]);

  return (
    <span
      className="relative inline-block w-[1ch] overflow-hidden"
      style={{ height: `${FACE}em` }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {FACES.map((face, index) => (
          <span
            key={index}
            className="flex items-center justify-center"
            style={{ height: `${FACE}em` }}
          >
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * The board. Digits are columns keyed from the right, so the units column
 * keeps its identity when the number grows a digit; letters and punctuation
 * from the format print as they are.
 */
function Odometer({
  value,
  format,
  motionSafe,
  className,
}: {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
}) {
  const text = format(value);
  const chars = text.split("");
  const digitsAfter = chars.map(
    (_, index) => chars.slice(index + 1).filter((c) => /\d/.test(c)).length,
  );
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center font-mono tabular-nums",
        className,
      )}
    >
      {chars.map((char, index) => {
        const key = chars.length - index;
        if (!/\d/.test(char)) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        // The column's position is the count with the digits to its right
        // dropped — the tens column of 42 sits at 4, and of 142 at 14.
        const position = Math.floor(
          Math.max(0, value) / 10 ** (digitsAfter[index] ?? 0),
        );
        return <Column key={key} position={position} motionSafe={motionSafe} />;
      })}
    </span>
  );
}

/**
 * A branch queue display for one customer. The "Now serving" figure is an
 * odometer whose digits roll up to each new face on `snap` — one crisp
 * overshoot, the click of a counter board. Beneath it a card carries the
 * customer's own number, how many are before them, and an estimated wait that
 * counts down one second at a time on a timer that runs only while `running`
 * and the document is visible; whenever `serving` changes, the estimate
 * re-syncs to the tickets that remain. When `serving` reaches the ticket the
 * card is called: it tints cobalt, reads "Your turn", and breathes on `drift`
 * between two keyframes with a reversing repeat — an ambient pulse, never a
 * bounce.
 *
 * The board is a labelled group with a plain-text copy of the figure; the
 * card's status sentence changes per serving change, never per second. Under
 * reduced motion digits swap in place, the called card tints without
 * breathing, and the countdown still ticks, because the wait is information.
 */
export function QueueNumber({
  ref,
  serving,
  ticket,
  secondsPerTicket = 90,
  running = true,
  format = defaultFormat,
  label = "Now serving",
  className,
}: QueueNumberProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const labelId = React.useId();

  const ahead = ticket - serving - 1;
  const called = serving === ticket;
  const passed = serving > ticket;
  const base = Math.max(0, ticket - serving) * Math.max(0, secondsPerTicket);

  // The estimate re-syncs the moment the board clicks over. Adjusting state
  // during render keeps the new figure in the same commit as the new serving.
  const [remaining, setRemaining] = React.useState(base);
  const [synced, setSynced] = React.useState(serving);
  if (synced !== serving) {
    setSynced(serving);
    setRemaining(base);
  }

  // One interval for as long as there is something to count, rather than one
  // re-armed per second.
  const counting = running && visible && !called && !passed && remaining > 0;
  React.useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(
      () => setRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [counting]);

  const standing = called
    ? "Your turn"
    : passed
      ? "Called earlier"
      : ahead === 0
        ? "Next"
        : `${ahead} before you`;
  const minutes = Math.ceil(base / 60);
  const spoken = called
    ? `Your number ${format(ticket)}, your turn`
    : passed
      ? `Your number ${format(ticket)}, called earlier`
      : `Your number ${format(ticket)}, ${standing.toLowerCase()}, about ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const fade = { duration: durations.fast, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-col items-center gap-1 rounded-3 border border-hairline bg-surface-1 px-4 py-5"
      >
        <span
          id={labelId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
        </span>
        <Odometer
          value={serving}
          format={format}
          motionSafe={motionSafe}
          className="text-5xl leading-none font-semibold text-ink"
        />
        <span className="sr-only">{format(serving)}</span>
      </div>

      <motion.div
        aria-hidden
        initial={false}
        animate={{ scale: called && motionSafe ? 1.03 : 1 }}
        transition={
          called && motionSafe
            ? { ...springs.drift, repeat: Infinity, repeatType: "reverse" }
            : springs.snap
        }
        className={cn(
          "flex items-center justify-between gap-3 rounded-3 border px-4 py-3 transition-colors",
          called
            ? "border-cobalt-bright bg-cobalt-wash"
            : passed
              ? "border-hairline bg-surface-2 text-ink-3"
              : "border-hairline bg-surface-2",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] text-ink-3">Your number</span>
          <span className="font-mono text-xl leading-none font-semibold text-ink tabular-nums">
            {format(ticket)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <motion.span
            key={standing}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
            className={cn(
              "text-sm font-medium",
              called ? "text-cobalt-bright" : "text-ink-2",
            )}
          >
            {standing}
          </motion.span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {called || passed ? "now" : `wait ~${clock(remaining)}`}
          </span>
        </span>
      </motion.div>

      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
