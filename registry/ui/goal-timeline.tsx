"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GoalTimelineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Already in the goal. */
  saved: number;
  /** The target amount. */
  goal: number;
  /** Controlled monthly contribution. */
  monthly?: number;
  /** Initial contribution for uncontrolled usage. @default min */
  defaultMonthly?: number;
  /** Fires from the pointer or key that moved the slider. */
  onMonthlyChange?: (monthly: number) => void;
  /** Slider floor. @default 50 */
  min?: number;
  /** Slider ceiling. @default 1000 */
  max?: number;
  /** Slider step. @default 25 */
  step?: number;
  /** The timeline's first month (month 1–12). Seeded, never read from a clock. */
  start: { year: number; month: number };
  /** How far the track looks ahead. @default 36 */
  horizonMonths?: number;
  /** Formats the amounts and the slider's value text. */
  format?: (value: number) => string;
  /** Names the goal; heads the instrument and labels the slider. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure under the slider.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Pointer travel before a press becomes a drag, so a tap still just jumps. */
const DRAG_SLOP = 4;

/** Capture throws on a synthetic pointer id; the scrub works without it. */
const setCapture = (node: Element, pointerId: number, on: boolean) => {
  try {
    if (on) node.setPointerCapture(pointerId);
    else if (node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
  } catch {
    // A sweep from the test suite has no capture target; the drag continues.
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Months until the goal at this contribution — 0 when met, Infinity when nothing is going in. */
export const projectGoalMonths = (
  saved: number,
  goal: number,
  monthly: number,
): number => {
  const left = goal - saved;
  if (left <= 0) return 0;
  if (monthly <= 0) return Infinity;
  return Math.ceil(left / monthly);
};

/** The calendar month `offset` months after `start`. */
const monthAt = (
  start: { year: number; month: number },
  offset: number,
): { name: string; year: number } => {
  const index = start.month - 1 + offset;
  return {
    name: MONTHS[((index % 12) + 12) % 12] ?? "",
    year: start.year + Math.floor(index / 12),
  };
};

/**
 * When you will get there. A timeline from `start` to `horizonMonths`, ticked
 * by month and labelled by year, with a marker planted where the goal is met:
 * `ceil((goal − saved) / monthly)` months out. Beneath it, a slider for the
 * monthly contribution. Moving it slides the marker earlier or later on
 * `glide` — a date moving is a layout shift, and settles without bounce — with
 * the run of filled track stretching behind it on the same spring. The flag
 * names the month and cross-fades when it changes; the months figure rolls in
 * on `snap`. Past the horizon the marker parks at the end and reads "after";
 * a goal already met parks it at the start and reads "Reached". The flag
 * glides between centre and end alignment near the edges so it never overhangs.
 *
 * The thumb is a real `role="slider"`: Arrow keys step, PageUp and PageDown
 * take ten steps, Home and End jump. Pressing the track jumps to that value and
 * dragging scrubs it, capturing the pointer only after 4px so a tap stays a
 * tap. The projection is announced when the slider settles, never per step.
 * Under reduced motion the marker and fill swap to their positions on a tween.
 */
export function GoalTimeline({
  ref,
  saved,
  goal,
  monthly,
  defaultMonthly,
  onMonthlyChange,
  min = 50,
  max = 1000,
  step = 25,
  start,
  horizonMonths = 36,
  format = defaultFormat,
  label,
  className,
}: GoalTimelineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultMonthly ?? min);
  const isControlled = monthly !== undefined;
  const current = clamp(isControlled ? monthly : uncontrolled, min, max);

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const horizon = Math.max(1, horizonMonths);
  const months = projectGoalMonths(saved, goal, current);
  const reached = months === 0;
  const beyond = months > horizon;
  const parked = clamp(months, 0, horizon);
  const share = parked / horizon;
  const when = monthAt(start, Math.min(months, horizon));
  const dateText = `${when.name} ${when.year}`;
  const flag = reached ? "Reached" : beyond ? `after ${dateText}` : dateText;
  const monthsText = reached
    ? "Reached"
    : beyond
      ? `Beyond ${horizon} months`
      : `${months} month${months === 1 ? "" : "s"}`;
  const sentence = reached
    ? "Goal already reached"
    : beyond
      ? `Not within ${horizon} months at this rate`
      : `Goal reached in ${months} month${months === 1 ? "" : "s"}, ${dateText}`;

  const commit = (next: number) => {
    const snapped = clamp(
      min + Math.round((next - min) / step) * step,
      min,
      max,
    );
    if (snapped === current) return;
    if (!isControlled) setUncontrolled(snapped);
    onMonthlyChange?.(snapped);
  };

  const commitFromX = (clientX: number) => {
    const node = trackRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.width <= 0) return;
    const ratio = clamp((clientX - box.left) / box.width, 0, 1);
    commit(min + ratio * (max - min));
  };

  const settle = () => {
    setAnnouncement(`${format(current)} a month. ${sentence}.`);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
    };
    setDragging(true);
    commitFromX(event.clientX);
    thumbRef.current?.focus({ preventScroll: true });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.startX) <= DRAG_SLOP) return;
      drag.moved = true;
      // Captured only once the press has become a scrub; capturing on
      // pointerdown would swallow the click a tap is made of.
      setCapture(event.currentTarget, event.pointerId, true);
    }
    commitFromX(event.clientX);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCapture(event.currentTarget, event.pointerId, false);
    dragRef.current = null;
    setDragging(false);
    settle();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowUp") commit(current + step);
    else if (key === "ArrowLeft" || key === "ArrowDown") commit(current - step);
    else if (key === "PageUp") commit(current + step * 10);
    else if (key === "PageDown") commit(current - step * 10);
    else if (key === "Home") commit(min);
    else if (key === "End") commit(max);
    else return;
    event.preventDefault();
  };

  // The flag hugs its side of the track near the ends so it never overhangs.
  const flagAlign = share < 0.2 ? "0%" : share > 0.8 ? "-100%" : "-50%";
  const left = `${(share * 100).toFixed(2)}%`;
  const sliderShare = (current - min) / Math.max(1, max - min);
  const sliderLeft = `${(sliderShare * 100).toFixed(2)}%`;

  const slide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const thumbMove = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.snap
      : { duration: 0 };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  // Year labels sit on each January inside the horizon; "now" marks the start.
  const januaries = Array.from({ length: horizon + 1 }, (_, offset) => offset)
    .filter((offset) => offset > 0 && monthAt(start, offset).name === "Jan")
    .map((offset) => ({ offset, year: monthAt(start, offset).year }));

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {format(saved)} of {format(goal)}
        </span>
      </div>

      {/* The timeline. The flag lane above the rail is part of the drawing,
          not reserved space: a flag always stands somewhere on it. */}
      <div role="img" aria-label={sentence} className="relative pt-9 pb-5">
        <div className="relative h-px bg-hairline-strong">
          {Array.from({ length: horizon + 1 }, (_, offset) => (
            <span
              key={offset}
              aria-hidden
              style={{ left: `${((offset / horizon) * 100).toFixed(2)}%` }}
              className={cn(
                "absolute top-1/2 w-px -translate-y-1/2 bg-hairline-strong",
                offset % 12 === 0 ? "h-2.5" : "h-1.5",
              )}
            />
          ))}

          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-cobalt-bright"
            initial={false}
            animate={{ width: left }}
            transition={slide}
          />

          <motion.span
            aria-hidden
            className="absolute top-1/2 -mt-1.5 -ml-1.5 size-3 rounded-full border-2 border-cobalt-bright bg-surface-1"
            initial={false}
            animate={{ left }}
            transition={slide}
          />

          <motion.span
            aria-hidden
            className="absolute bottom-full mb-1.5 flex flex-col items-center"
            initial={false}
            animate={{ left, x: flagAlign }}
            transition={slide}
          >
            <span
              className={cn(
                "flex h-6 items-center rounded-full border px-2 font-mono text-[11px] font-medium whitespace-nowrap tabular-nums",
                reached
                  ? "border-success/40 bg-success/10 text-success"
                  : beyond
                    ? "border-hairline-strong bg-surface-2 text-ink-3"
                    : "border-cobalt-bright bg-cobalt-wash text-cobalt-bright",
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={flag}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  {flag}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.span>

          <span
            aria-hidden
            className="absolute top-full left-0 mt-2 font-mono text-[10px] text-ink-3"
          >
            now
          </span>
          {januaries.map((mark) => (
            <span
              key={mark.offset}
              aria-hidden
              style={{ left: `${((mark.offset / horizon) * 100).toFixed(2)}%` }}
              className="absolute top-full mt-2 -translate-x-1/2 font-mono text-[10px] text-ink-3 tabular-nums"
            >
              {mark.year}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-3">
          <span className="font-mono font-medium text-ink tabular-nums">
            {format(current)}
          </span>{" "}
          a month
        </span>
        <span className="flex h-5 items-center overflow-hidden text-[11px] font-medium">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={monthsText}
              className={cn(
                "block whitespace-nowrap",
                reached ? "text-success" : beyond ? "text-ink-3" : "text-ink",
              )}
              initial={motionSafe ? { y: 12, opacity: 0 } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{
                y: motionSafe ? -12 : 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
            >
              {monthsText}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {/* The slider. The track is the pointer surface, the thumb the focus and
          keyboard surface; both drive one value. */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex h-9 cursor-pointer touch-none items-center select-none"
      >
        <span
          aria-hidden
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{ width: sliderLeft }}
            transition={thumbMove}
          />
        </span>
        <motion.div
          ref={thumbRef}
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-orientation="horizontal"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
          aria-valuetext={`${format(current)} a month, ${monthsText.toLowerCase()}`}
          onKeyDown={onKeyDown}
          onKeyUp={settle}
          className={cn(
            "absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-sm outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            dragging && "scale-110",
          )}
          initial={false}
          animate={{ left: sliderLeft }}
          transition={thumbMove}
        />
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
