"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PortfolioPulseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The book's mark. A new value rolls the total, extends the trace, beats. */
  value: number;
  /** Session open — the basis for the change chip. */
  open: number;
  /** Visible heading. @default "Book" */
  label?: React.ReactNode;
  /** Quiet mono line opposite the heading. */
  venue?: string;
  /** Formats the total and the change. */
  format?: (value: number) => string;
  /** Length of the trail window; older points fall off the left. @default 36 */
  points?: number;
  /** Quiet after which the beat stills and the sentence is announced. @default 1600 */
  quietMs?: number;
  /** Fires from the effect that observed the committed tick. */
  onTick?: (value: number, direction: "up" | "down") => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same figure, which is a
 * hydration mismatch on the number this card exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => money.format(value);

/** Drawing height of the lane, in CSS pixels — the viewBox uses the same unit. */
const LANE_H = 32;

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The total, rolling the way the book moved.
 *
 * Each column is a window one face tall holding exactly two faces — the
 * character leaving and the character arriving — and the pair travels half its
 * own height on `snap`. Two faces rather than a ten-digit strip is the point: a
 * strip takes the shortest numeric path, so a book falling from 148,230 to
 * 148,190 would roll a column *upward* while the money went down. A pair can
 * only ever move the way the value moved.
 */
function Roll({
  text,
  previous,
  up,
  generation,
  motionSafe,
}: {
  text: string;
  previous: string;
  up: boolean;
  generation: number;
  motionSafe: boolean;
}) {
  // Aligned from the right, so the units column keeps its identity when the
  // figure gains or loses a place and a new column rolls in from a blank.
  const was =
    previous.length >= text.length
      ? previous.slice(previous.length - text.length)
      : previous.padStart(text.length, " ");

  return (
    <span aria-hidden className="inline-flex h-[1.1em] items-stretch">
      {text.split("").map((char, index) => {
        const key = text.length - index;
        const before = was[index] ?? char;
        if (!motionSafe || before === char || generation === 0) {
          return (
            <span
              key={key}
              className="flex h-full w-[1ch] items-center justify-center"
            >
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative flex h-full w-[1ch] items-center justify-center overflow-hidden"
          >
            {/* Keyed by the tick so each one mounts a fresh pair; the strip is
                two faces tall, which is why one face of travel is 50%. */}
            <motion.span
              key={generation}
              className="absolute inset-x-0 top-0 flex h-[200%] flex-col"
              initial={{ y: up ? "0%" : "-50%" }}
              animate={{ y: up ? "-50%" : "0%" }}
              transition={springs.snap}
            >
              <span className="flex h-1/2 items-center justify-center">
                {up ? before : char}
              </span>
              <span className="flex h-1/2 items-center justify-center">
                {up ? char : before}
              </span>
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A whole book in one beat. Every tick does three things at once: the total's
 * digit columns roll one face on `snap` in the direction the money moved, the
 * trace gains a point whose new segment draws from the previous one with
 * `pathLength` on `flick`, and the beat dot pulses — a ring expands out of it
 * and fades on a tween while the dot itself lands back from 1.4× on `flick`.
 * Once the window is full the whole trace slides left by exactly one pitch on
 * `glide`, driven by a motion value rather than a remount, so a fast tape never
 * restarts its slide mid-flight.
 *
 * Between ticks it stills: after `quietMs` of no change the dot dims to its
 * resting tone and the ring stops firing, so a live book and a paused one are
 * told apart without reading a label. The card never generates a tick — it
 * rolls what `value` is given and reports each committed one through `onTick`
 * from the effect that observed it — and it owns its own trail, so a caller
 * passes a number and gets a history.
 *
 * Announcement is deliberately not per tick: one polite sentence is written
 * after the tape settles, so a burst of forty prints announces the book once
 * rather than forty times. The lane is measured with a ResizeObserver and drawn
 * in CSS pixels, so nothing is stretched and no width is assumed. Under reduced
 * motion the ring never fires, the trace extends without travelling and the
 * digits swap in place — the beat is information about a live book, so the
 * dot's tone still changes.
 */
export function PortfolioPulse({
  ref,
  value,
  open,
  label = "Book",
  venue,
  format = defaultFormat,
  points = 36,
  quietMs = 1600,
  onTick,
  className,
}: PortfolioPulseProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const tickRef = useLatest(onTick);

  const capacity = Math.max(2, Math.floor(points));

  // The committed tape, adjusted during render rather than in an effect: the
  // roll needs the face it is leaving, and an effect would paint the new digit
  // once before the pair could be built.
  const [tape, setTape] = React.useState(() => ({
    value,
    // The face the roll is leaving has to be carried in the state itself: by
    // the render that commits, `value` and `tape.value` are equal again.
    previous: value,
    trail: [value],
    up: true,
    dropped: false,
    generation: 0,
  }));
  if (tape.value !== value) {
    const grown = [...tape.trail, value];
    setTape({
      value,
      previous: tape.value,
      trail: grown.slice(-capacity),
      up: value >= tape.value,
      dropped: grown.length > capacity,
      generation: tape.generation + 1,
    });
  }

  const change = value - open;
  const percent = open === 0 ? 0 : (change / open) * 100;
  const rising = change > 0;
  const falling = change < 0;
  const sentence = `${format(value)}, ${
    rising ? "up" : falling ? "down" : "level"
  } ${Math.abs(percent).toFixed(2)} percent on the open`;

  // A timer decides when the tape has settled: stilling the beat and writing
  // the sentence from the same timeout keeps a burst from interrupting a
  // screen reader once per print.
  const [settled, setSettled] = React.useState({ generation: 0, sentence });
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setSettled({ generation: tape.generation, sentence }),
      Math.max(0, quietMs),
    );
    return () => window.clearTimeout(timer);
  }, [tape.generation, sentence, quietMs]);

  React.useEffect(() => {
    if (tape.generation === 0) return;
    tickRef.current?.(tape.value, tape.up ? "up" : "down");
  }, [tape.generation, tape.value, tape.up, tickRef]);

  const live = tape.generation > 0 && settled.generation !== tape.generation;
  const beatWord = tape.generation === 0 ? "Waiting" : live ? "Live" : "Still";

  const laneRef = React.useRef<HTMLDivElement | null>(null);
  const [laneWidth, setLaneWidth] = React.useState(0);
  React.useEffect(() => {
    const node = laneRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setLaneWidth(node.getBoundingClientRect().width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pitch = laneWidth / (capacity - 1);
  const shift = useMotionValue(0);
  React.useEffect(() => {
    if (!tape.dropped || !motionSafe || pitch <= 0) return;
    // Seeded to the pitch the window just lost, then eased home: the points
    // themselves already moved, so this walks the whole trace back and lets it
    // catch up as one body instead of every vertex jumping.
    shift.set(pitch);
    const controls = animate(shift, 0, springs.glide);
    return () => controls.stop();
  }, [tape.generation, tape.dropped, motionSafe, pitch, shift]);

  const lo = Math.min(...tape.trail);
  const hi = Math.max(...tape.trail);
  const range = hi - lo || 1;
  const at = (index: number) => ({
    x: index * pitch,
    y: LANE_H - 3 - ((tape.trail[index] ?? lo) - lo) * ((LANE_H - 6) / range),
  });

  const drawn = tape.trail.length;
  const head = at(drawn - 1);
  const prior = at(Math.max(0, drawn - 2));
  const body = tape.trail
    .slice(0, -1)
    .map((_, index) => {
      const point = at(index);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const tone = rising ? "text-success" : falling ? "text-danger" : "text-ink-2";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          {motionSafe && live ? (
            <motion.span
              key={tape.generation}
              aria-hidden
              className="absolute inset-0 rounded-full bg-signal"
              initial={{ scale: 0.7, opacity: 0.5 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ) : null}
          <motion.span
            key={`dot-${tape.generation}`}
            aria-hidden
            className={cn(
              "size-2 rounded-full transition-colors",
              live ? "bg-signal" : "bg-ink-3",
            )}
            initial={motionSafe && live ? { scale: 1.4 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </span>

        <span
          id={labelId}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {label}
        </span>

        {venue ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {venue}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-2xl leading-none font-medium tabular-nums">
          <Roll
            text={format(tape.value)}
            previous={format(tape.previous)}
            up={tape.up}
            generation={tape.generation}
            motionSafe={motionSafe}
          />
        </span>
        <span
          aria-hidden
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full px-2 font-mono text-[11px] font-medium tabular-nums",
            rising
              ? "bg-success/12 text-success"
              : falling
                ? "bg-danger/12 text-danger"
                : "bg-surface-2 text-ink-2",
          )}
        >
          {change >= 0 ? "+" : "-"}
          {Math.abs(percent).toFixed(2)}%
        </span>
      </div>

      <div ref={laneRef} aria-hidden className="h-8 w-full">
        {laneWidth > 0 ? (
          <svg
            width={laneWidth}
            height={LANE_H}
            viewBox={`0 0 ${laneWidth} ${LANE_H}`}
            className={cn("block", tone)}
          >
            <line
              x1="0"
              y1={LANE_H - 0.5}
              x2={laneWidth}
              y2={LANE_H - 0.5}
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="1"
            />
            <motion.g style={{ x: shift }}>
              {body ? (
                <polyline
                  points={body}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {drawn > 1 ? (
                <motion.line
                  key={tape.generation}
                  x1={prior.x}
                  y1={prior.y}
                  x2={head.x}
                  y2={head.y}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              ) : null}
              <circle cx={head.x} cy={head.y} r="2" fill="currentColor" />
            </motion.g>
          </svg>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>{beatWord}</span>
        <span className="tabular-nums">
          {tape.trail.length} / {capacity} marks
        </span>
      </div>

      <span role="status" className="sr-only">
        {settled.sentence}
      </span>
    </div>
  );
}
