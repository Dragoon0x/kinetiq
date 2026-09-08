"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BalancePoint = {
  /** Period name — a month, a quarter, a week. */
  label: string;
  amount: number;
};

export type BalanceCompareProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The earlier period, drawn on the left. */
  from: BalancePoint;
  /** The later period, drawn on the right. */
  to: BalancePoint;
  /** What is being compared; names the control. */
  label: string;
  /** Renders both figures; money never bypasses it. */
  format?: (amount: number) => string;
  /** Controlled: keeps the line and the chip drawn. */
  pinned?: boolean;
  /** Initial pinned state for uncontrolled usage. */
  defaultPinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  /** Fires when the line becomes visible or hides, whatever caused it. */
  onRevealChange?: (revealed: boolean) => void;
  className?: string;
};

/** Pinned so the server and the client format identically. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (amount: number) => currency.format(amount);

/** A column this short still reads as a column rather than a hairline. */
const MIN_RATIO = 0.08;

/**
 * Two periods, one honest line. Each figure stands on a column scaled against
 * the larger of the two, so the pair reads as a comparison before anything
 * moves. Pointing at the instrument — or tabbing to it — draws a line between
 * the column tops with `pathLength` on `flick`: the line is the assertion, so
 * it lands at once rather than easing in. It colours by direction and carries a
 * caret, so up and down never rest on colour alone, and a percent chip arrives
 * at its midpoint on `snap` from a `nudge` below.
 *
 * Pressing pins the line open so touch readers get what hover gives; pressing
 * again or Escape releases it. New figures re-slope the line and glide the
 * columns to their heights on `glide`. Under reduced motion the line appears at
 * full length on an opacity tween and the chip fades in place — the direction,
 * the colour and the percentage are unchanged, because they are the point.
 */
export function BalanceCompare({
  ref,
  from,
  to,
  label,
  format = defaultFormat,
  pinned,
  defaultPinned = false,
  onPinnedChange,
  onRevealChange,
  className,
}: BalanceCompareProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolledPinned, setUncontrolledPinned] =
    React.useState(defaultPinned);
  const isControlled = pinned !== undefined;
  const isPinned = isControlled ? pinned : uncontrolledPinned;

  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const revealed = isPinned || hovered || focused;

  // Reported from the event that caused the change, never from an effect, so
  // the host hears about a reveal on the same tick the reader caused it.
  const revealedRef = React.useRef(revealed);
  const report = (next: boolean) => {
    if (revealedRef.current === next) return;
    revealedRef.current = next;
    onRevealChange?.(next);
  };

  const peak = Math.max(Math.abs(from.amount), Math.abs(to.amount), 1);
  const ratioOf = (amount: number) =>
    Math.min(1, Math.max(MIN_RATIO, Math.abs(amount) / peak));
  const fromRatio = ratioOf(from.amount);
  const toRatio = ratioOf(to.amount);

  const delta = to.amount - from.amount;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "level";
  // A period that started at nothing has no percentage to give, so the chip
  // shows the money instead of dividing by zero.
  const percent =
    from.amount === 0 ? null : (delta / Math.abs(from.amount)) * 100;
  const deltaText =
    percent === null
      ? format(Math.abs(delta))
      : `${Math.abs(percent).toFixed(1)}%`;
  const chipText = direction === "level" ? "level" : deltaText;

  const tone =
    direction === "up"
      ? "text-success"
      : direction === "down"
        ? "text-danger"
        : "text-ink-3";

  // Percentages of the plot: a column of `ratio` height has its top this far
  // down from the plot's ceiling.
  const fromY = (1 - fromRatio) * 100;
  const toY = (1 - toRatio) * 100;
  const midY = (fromY + toY) / 2;

  const columnTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const setPinned = (next: boolean) => {
    if (!isControlled) setUncontrolledPinned(next);
    onPinnedChange?.(next);
    report(next || hovered || focused);
  };

  const summary = `${from.label} ${format(from.amount)}, ${to.label} ${format(
    to.amount,
  )}, ${direction === "level" ? "level" : `${direction} ${deltaText}`}`;

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <button
        type="button"
        aria-pressed={isPinned}
        aria-label={`${label}. ${summary}.`}
        onClick={() => setPinned(!isPinned)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isPinned) {
            event.preventDefault();
            setPinned(false);
          }
        }}
        onPointerEnter={() => {
          setHovered(true);
          report(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          report(isPinned || focused);
        }}
        onFocus={() => {
          setFocused(true);
          report(true);
        }}
        onBlur={() => {
          setFocused(false);
          report(isPinned || hovered);
        }}
        className={cn(
          "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3 text-left transition-colors outline-none",
          "hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium">{label}</span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {isPinned ? "Pinned" : "Compare"}
          </span>
        </span>

        {/* The plot keeps a band of headroom above the tallest column so the
            chip has somewhere to sit without escaping the card. */}
        <span className="relative block h-28 w-full">
          <span className="absolute inset-x-0 top-6 bottom-0 block">
            <span aria-hidden className="flex h-full items-end">
              <span className="flex flex-1 justify-center">
                <motion.span
                  className="block w-14 rounded-t-2 bg-hairline-strong"
                  initial={false}
                  animate={{ height: `${fromRatio * 100}%` }}
                  transition={columnTransition}
                />
              </span>
              <span className="flex flex-1 justify-center">
                <motion.span
                  className="block w-14 rounded-t-2 bg-cobalt-bright"
                  initial={false}
                  animate={{ height: `${toRatio * 100}%` }}
                  transition={columnTransition}
                />
              </span>
            </span>

            {/* The face is stretched to the plot so the endpoints are plain
                numbers the spring can interpolate, and a non-scaling stroke
                keeps the line 1.5px and its caps round at any width. */}
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={cn(
                "pointer-events-none absolute inset-0 size-full overflow-visible",
                tone,
              )}
            >
              <motion.line
                x1={25}
                x2={75}
                vectorEffect="non-scaling-stroke"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                pathLength={1}
                initial={false}
                animate={{
                  y1: fromY,
                  y2: toY,
                  pathLength: motionSafe ? (revealed ? 1 : 0) : 1,
                  opacity: revealed ? 1 : 0,
                }}
                transition={{
                  y1: columnTransition,
                  y2: columnTransition,
                  pathLength: motionSafe
                    ? revealed
                      ? springs.flick
                      : { duration: durations.fast, ease: easings.exit }
                    : { duration: 0 },
                  opacity: fade,
                }}
              />
            </svg>

            {/* The outer layer owns the centring transform through motion's own
                style keys, so animating the inner offset cannot clobber it. */}
            <motion.span
              aria-hidden
              className="absolute left-1/2 block"
              style={{ x: "-50%", y: "-50%" }}
              initial={false}
              animate={{ top: `${midY}%` }}
              transition={columnTransition}
            >
              <motion.span
                className={cn(
                  "flex items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
                  tone,
                )}
                initial={false}
                animate={{
                  opacity: revealed ? 1 : 0,
                  y: motionSafe && !revealed ? distances.nudge : 0,
                }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: fade }
                    : { duration: durations.fast }
                }
              >
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {direction === "up" ? (
                    <path d="M6 9.5V2.5M3 5.5 6 2.5l3 3" />
                  ) : direction === "down" ? (
                    <path d="M6 2.5v7M3 6.5 6 9.5l3-3" />
                  ) : (
                    <path d="M3 6h6" />
                  )}
                </svg>
                {chipText}
              </motion.span>
            </motion.span>
          </span>
        </span>

        <span className="flex items-end justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {from.label}
            </span>
            <span className="truncate font-mono text-sm text-ink-2 tabular-nums">
              {format(from.amount)}
            </span>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 text-right">
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {to.label}
            </span>
            <span className="truncate font-mono text-sm font-medium text-foreground tabular-nums">
              {format(to.amount)}
            </span>
          </span>
        </span>
      </button>

      <span role="status" className="sr-only">
        {label}: {summary}
      </span>
    </div>
  );
}
