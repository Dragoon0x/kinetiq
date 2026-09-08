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

/** One printed trade. `time` is already formatted, so no clock is read here. */
export type Fill = {
  id: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  time: string;
};

export type FillTapeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The tape, oldest first. */
  fills: Fill[];
  /** Rows kept on screen; older ones collapse off the top. @default 7 */
  capacity?: number;
  /** The pair the tape is for. @default "BSN/USD" */
  symbol?: string;
  /** Unit printed after sizes and spoken in row labels. @default "BSN" */
  sizeUnit?: string;
  /** Turns money into its printed string. */
  format?: (value: number) => string;
  /** Turns a size into its printed string. */
  formatSize?: (size: number) => string;
  /** Controlled latch on the Hold control. */
  held?: boolean;
  /** Initial latch for uncontrolled usage. @default false */
  defaultHeld?: boolean;
  /** Fires from the press or key that toggled the latch. */
  onHeldChange?: (held: boolean) => void;
  /** Fires from the effect that observed the effective hold — latch, hover or focus. */
  onPausedChange?: (paused: boolean, waiting: number) => void;
  /** Fires from the effect that observed the printed volume change. */
  onVolumeSettle?: (volume: number, fills: number) => void;
  /** The line the tape shows before its first print. @default "No fills yet" */
  emptyLabel?: string;
  className?: string;
};

/** Explicit locale: a server and a client formatting differently would be a
 *  hydration mismatch on every price the tape prints. */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const sizes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const defaultFormat = (value: number) => money.format(value);
const defaultFormatSize = (size: number) => sizes.format(size);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const STILL = { duration: 0 } as const;

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The session volume rolls its columns on `snap` — one crisp overshoot as the
 * figure lands. Hidden from assistive technology: the footer already carries
 * the same total as a sentence.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // total gains a place and only the new column mounts.
        const key = text.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : STILL}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Time and sales, printed downward. The newest fill mounts at the foot of the
 * tape and arrives from a `step` below on `snap`, while the rows above it glide
 * up one line — a `layout` move, because that is exactly what it is. At capacity
 * the row at the top collapses out on the exit ease and the column, measured by
 * a ResizeObserver, settles to its new height, so no space is ever reserved for
 * a row that has not arrived.
 *
 * Holding is the other half, and it is honest rather than cosmetic: hovering,
 * focusing or pressing Hold freezes the printed rows at the snapshot you were
 * reading, and fills arriving meanwhile are counted into a waiting chip instead
 * of being dropped. The session volume freezes with the rows — a total that
 * kept counting under a frozen tape would be a lie — and rolls up through the
 * whole backlog on release.
 *
 * It is an `<ol>` of `<li>` rows whose labels speak the side in words, so
 * nothing rests on colour, and Hold is a real `aria-pressed` button reachable
 * by Tab. The component prints only what it is given: it never mints a fill and
 * never reads a clock. Under reduced motion rows appear and leave without
 * travel while the tape still advances, because a tape that stopped telling you
 * what traded would be broken rather than calm.
 */
export function FillTape({
  ref,
  fills,
  capacity = 7,
  symbol = "BSN/USD",
  sizeUnit = "BSN",
  format = defaultFormat,
  formatSize = defaultFormatSize,
  held,
  defaultHeld = false,
  onHeldChange,
  onPausedChange,
  onVolumeSettle,
  emptyLabel = "No fills yet",
  className,
}: FillTapeProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [latchState, setLatchState] = React.useState(defaultHeld);
  const [hovering, setHovering] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [height, setHeight] = React.useState<number | null>(null);

  const latched = held ?? latchState;
  const paused = latched || hovering || focused;

  // The frozen tape, adjusted during render rather than synced in an effect:
  // an effect would paint one frame of the new rows before the freeze caught up.
  // The guard is the tape's own shape, not the array's identity — a caller that
  // rebuilds `fills` every render must not put this into a loop.
  const shape = `${fills.length}:${fills[fills.length - 1]?.id ?? ""}`;
  const [snapshot, setSnapshot] = React.useState({ shape, fills });
  if (!paused && snapshot.shape !== shape) setSnapshot({ shape, fills });

  const printed = snapshot.fills;
  const shown = printed.slice(-Math.max(1, capacity));
  const waiting = Math.max(0, fills.length - printed.length);
  const volume = printed.reduce((sum, fill) => sum + Math.max(0, fill.size), 0);
  const notional = printed.reduce(
    (sum, fill) => sum + Math.max(0, fill.size) * fill.price,
    0,
  );

  const innerRef = React.useRef<HTMLOListElement | null>(null);
  const pausedRef = React.useRef({ paused, waiting });
  const pausedCallback = useLatest(onPausedChange);
  const volumeCallback = useLatest(onVolumeSettle);

  React.useEffect(() => {
    const element = innerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so no height is ever
    // read synchronously inside an effect body.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    // The count matters while held as well as at the transition: a producer
    // showing "3 waiting" has to hear about the fourth.
    const last = pausedRef.current;
    if (last.paused === paused && last.waiting === waiting) return;
    pausedRef.current = { paused, waiting };
    pausedCallback.current?.(paused, waiting);
  }, [paused, waiting, pausedCallback]);

  React.useEffect(() => {
    volumeCallback.current?.(volume, printed.length);
  }, [volume, printed.length, volumeCallback]);

  const toggleLatch = () => {
    const next = !latched;
    if (held === undefined) setLatchState(next);
    onHeldChange?.(next);
  };

  return (
    <div
      ref={ref}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        // Moving between the tape's own controls is not leaving the tape.
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
      }}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pb-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {symbol}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <AnimatePresence initial={false}>
            {waiting > 0 ? (
              <motion.span
                key="waiting"
                className="flex h-6 items-center rounded-full bg-cobalt-wash px-2 font-mono text-[10px] text-cobalt-bright tabular-nums"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                {waiting} waiting
              </motion.span>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            aria-pressed={latched}
            aria-label={
              latched ? `Release tape, ${waiting} fills waiting` : "Hold tape"
            }
            onClick={toggleLatch}
            className={cn(
              "flex h-6 items-center rounded-full border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              latched
                ? "bg-surface-2 text-foreground"
                : "text-ink-3 hover:bg-accent hover:text-foreground",
            )}
          >
            {latched ? "Held" : "Hold"}
          </button>
        </span>
      </div>

      {/* Measured, not reserved: the box animates to the column's own height so
          a tape that is filling up never sits over a hole. */}
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={height === null ? {} : { height }}
        transition={motionSafe ? springs.glide : STILL}
      >
        <ol
          ref={innerRef}
          role="list"
          aria-labelledby={labelId}
          className="flex flex-col justify-end gap-px"
        >
          {/* One row tall, so the first print costs the box no height at all. */}
          {shown.length === 0 ? (
            <li className="flex h-7 items-center justify-center font-mono text-[11px] text-ink-3">
              {emptyLabel}
            </li>
          ) : null}
          <AnimatePresence initial={false}>
            {shown.map((fill) => {
              const buy = fill.side === "buy";
              return (
                <motion.li
                  key={fill.id}
                  layout={motionSafe}
                  aria-label={`${buy ? "Buy" : "Sell"} ${formatSize(fill.size)} ${sizeUnit} at ${format(fill.price)}, ${fill.time}`}
                  initial={{
                    opacity: 0,
                    y: motionSafe ? distances.step : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, transition: exitFor() }}
                  transition={
                    motionSafe
                      ? springs.snap
                      : { duration: durations.fast, ease: easings.enter }
                  }
                  className="grid h-7 grid-cols-[2px_auto_auto_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-1 px-1.5 font-mono text-[11px]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-4 w-full rounded-full",
                      buy ? "bg-success" : "bg-danger",
                    )}
                  />
                  <span aria-hidden className="text-ink-3 tabular-nums">
                    {fill.time}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "w-7 tracking-[0.06em] uppercase",
                      buy ? "text-success" : "text-danger",
                    )}
                  >
                    {buy ? "Buy" : "Sell"}
                  </span>
                  <span
                    aria-hidden
                    className="truncate text-right text-ink tabular-nums"
                  >
                    {format(fill.price)}
                  </span>
                  <span aria-hidden className="text-ink-2 tabular-nums">
                    {formatSize(fill.size)}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </motion.div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-hairline px-1.5 pt-2 font-mono text-[10px]">
        <span className="text-ink-3">
          <span className="sr-only">{`${printed.length} fills printed, ${formatSize(volume)} ${sizeUnit}, ${format(notional)}`}</span>
          <span aria-hidden className="flex items-center gap-1">
            <Rolling text={formatSize(volume)} motionSafe={motionSafe} />
            {sizeUnit}
          </span>
        </span>
        <span aria-hidden className="text-ink-3 tabular-nums">
          {format(notional)}
        </span>
      </div>

      <span aria-live="polite" className="sr-only">
        {paused ? "Tape held" : "Tape running"}
      </span>
    </div>
  );
}
