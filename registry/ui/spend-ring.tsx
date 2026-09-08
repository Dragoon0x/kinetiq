"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpendRingReadout = "spent" | "left";

export type SpendRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Money spent this month. May exceed `budget`; the overage is drawn. */
  spent: number;
  /** The month's budget. */
  budget: number;
  /** Day of the month, 1-based; places the pace mark. */
  day: number;
  /** Length of the month. @default 30 */
  daysInMonth?: number;
  /** Names the ring; printed above it and used for assistive technology. */
  label: string;
  /** Formats every money figure. */
  format?: (value: number) => string;
  /** Controlled centre figure. */
  readout?: SpendRingReadout;
  /** Initial centre figure for uncontrolled usage. @default "spent" */
  defaultReadout?: SpendRingReadout;
  /** Fires from the click or key that changed the centre figure. */
  onReadoutChange?: (readout: SpendRingReadout) => void;
  /** Ring diameter in px. The ring never grows past its container. @default 168 */
  size?: number;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, which is a
 * hydration mismatch on the figure in the middle of the ring.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const STOPS: { value: SpendRingReadout; label: string }[] = [
  { value: "spent", label: "Spent" },
  { value: "left", label: "Left" },
];

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The month, as a ring. The arc grows clockwise from twelve with the share of
 * the budget already spent — `strokeDashoffset` on a `pathLength={1}` circle, so
 * the stroke travels along the ring itself rather than a box scaling — settling
 * on `glide`, because a total is a quantity arriving, not a switch flipping.
 *
 * A one-notch dash walks the same circle at the month's own progress. The gap
 * between the fill and that mark is the whole reading: fill behind it is on
 * pace and `cobalt`, fill past it is `warn`, and spend past the budget wraps a
 * second `danger` arc back over the ring's head on `snap` — one crisp overshoot,
 * the only sharp move the instrument makes — while the remainder goes negative.
 * The centre figure counts to its new value through a motion value, so it
 * re-reads without a render per frame, and a two-stop control swaps it between
 * what has been spent and what is left, its knob travelling on a shared
 * `layoutId` so one knob moves rather than two blinking.
 *
 * The ring is a `role="meter"` whose `aria-valuetext` reads the month as a
 * sentence; the stops are a radio group with a roving tabindex. Under reduced
 * motion nothing springs, but the arc still fills and the mark still walks,
 * because where the month stands is the information.
 */
export function SpendRing({
  ref,
  spent,
  budget,
  day,
  daysInMonth = 30,
  label,
  format = (value) => money.format(value),
  readout,
  defaultReadout = "spent",
  onReadoutChange,
  size = 168,
  className,
}: SpendRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolled, setUncontrolled] =
    React.useState<SpendRingReadout>(defaultReadout);
  const isControlled = readout !== undefined;
  const current = isControlled ? readout : uncontrolled;

  const span = budget > 0 ? budget : 1;
  const fraction = Math.max(0, spent) / span;
  const filled = Math.min(1, fraction);
  const over = Math.max(0, spent - budget);
  const isOver = over > 0;
  const overFilled = Math.min(1, over / span);
  const remaining = budget - spent;

  const dayFraction = clamp(day / Math.max(1, daysInMonth), 0, 1);
  const ahead = !isOver && fraction > dayFraction;
  const percent = Math.min(999, Math.round(fraction * 100));

  const centreValue = current === "spent" ? spent : remaining;

  // The figure counts between readings instead of jumping. Holding it in a
  // motion value keeps the animation off the render path entirely.
  const counter = useMotionValue(centreValue);
  const centreText = useTransform(counter, (value) =>
    format(Math.round(value)),
  );

  React.useEffect(() => {
    if (!motionSafe) {
      counter.set(centreValue);
      return;
    }
    const controls = animate(counter, centreValue, springs.snap);
    return () => controls.stop();
  }, [centreValue, counter, motionSafe]);

  const select = (next: SpendRingReadout) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onReadoutChange?.(next);
  };

  const focusAt = (index: number) => {
    const stop = STOPS[clamp(index, 0, STOPS.length - 1)];
    if (!stop) return;
    document.getElementById(`${baseId}-stop-${stop.value}`)?.focus();
    select(stop.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(STOPS.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(STOPS[index]?.value ?? "spent");
        break;
      default:
        break;
    }
  };

  const tone = isOver
    ? "text-danger"
    : ahead
      ? "text-warn"
      : "text-cobalt-bright";
  const state = isOver ? "Over budget" : ahead ? "Ahead of pace" : "On pace";
  const valueText = isOver
    ? `${format(spent)} of ${format(budget)} spent, day ${day} of ${daysInMonth}, ${format(over)} over budget`
    : `${format(spent)} of ${format(budget)} spent, ${percent} percent, day ${day} of ${daysInMonth}, ${
        ahead ? "ahead of pace" : "on pace"
      }`;

  const arcTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col items-center gap-3", className)}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] font-medium tabular-nums",
            isOver ? "text-danger" : ahead ? "text-warn" : "text-ink-3",
          )}
        >
          {state}
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={clamp(spent, 0, budget)}
        aria-valuetext={valueText}
        // Fluid width with a ceiling: the ring can shrink into a narrow column
        // but never draws past the box it was given.
        style={{ maxWidth: size }}
        className="relative aspect-square w-full"
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
        >
          {/* Rotated by a plain attribute on a plain group: motion rewrites the
              transform of any element it animates, and the ring's start must
              stay at twelve o'clock whatever the arcs are doing. */}
          <g transform="rotate(-90 50 50)">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              className="stroke-current text-hairline-strong"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              className={cn(
                "stroke-current transition-colors",
                isOver ? "text-cobalt-bright/45" : tone,
              )}
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 1 - filled }}
              transition={arcTransition}
            />
            {/* The overage wraps back over the head of the ring, so a month
                that has gone past its budget reads as exactly that. */}
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              className="stroke-current text-danger"
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 1 - (isOver ? overFilled : 0) }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.base, ease: easings.enter }
              }
            />
            {/* The pace mark: one notch of dash walking the same circle, so it
                rides the ring's geometry instead of trigonometry that a server
                and a browser can round differently. */}
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="14"
              pathLength={1}
              strokeDasharray="0.006 0.994"
              className="stroke-current text-ink"
              initial={false}
              animate={{ strokeDashoffset: -dayFraction }}
              transition={arcTransition}
            />
          </g>
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-0.5 px-6 text-center">
            <motion.span
              className={cn(
                "font-mono text-xl leading-none font-semibold tabular-nums transition-colors",
                current === "left" && remaining < 0
                  ? "text-danger"
                  : "text-ink",
              )}
            >
              {centreText}
            </motion.span>
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {current === "spent" ? `of ${format(budget)}` : "remaining"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          Day {day} of {daysInMonth}
        </span>

        <div
          role="radiogroup"
          aria-label="Centre figure"
          className="inline-flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {STOPS.map((stop, index) => {
            const checked = stop.value === current;
            return (
              <button
                key={stop.value}
                id={`${baseId}-stop-${stop.value}`}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => select(stop.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative flex min-w-14 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked ? "text-foreground" : "text-ink-3 hover:text-ink",
                )}
              >
                {checked &&
                  (motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ))}
                <span className="relative">{stop.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
