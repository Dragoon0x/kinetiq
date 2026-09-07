"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QuotaMeterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Current usage in `unit`. May exceed `limit` — the overage is drawn. */
  used: number;
  /** The quota in `unit`. */
  limit: number;
  /** Fraction of the limit at which the meter turns warn. @default 0.8 */
  warnAt?: number;
  /** Unit label printed after both numbers. @default "GB" */
  unit?: string;
  /** What is being measured; names the meter for assistive technology. */
  label: string;
  /** Bars in the track. @default 16 */
  segments?: number;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A number whose digits roll to their new value on `snap` — one crisp
 * overshoot, the same physics as any other indicator changing position.
 *
 * The column is ten digits tall, so a `y` percentage of its own height moves
 * exactly one digit. It is hidden from assistive technology because the meter
 * already carries the value in `aria-valuetext`; a screen reader should not
 * have to wade through ten digits per column.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Key from the right so the units column keeps its identity when the
        // number gains or loses a digit, and only the new column mounts.
        const key = value.length - index;
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
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
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
 * A segmented quota meter that tells the truth about being over.
 *
 * Segments fill left to right in a `cascade()` on `glide` — a quota is a
 * quantity settling, not a switch flipping, so each bar eases into place with
 * no overshoot. Crossing `warnAt` tints the whole track warn and flashes the
 * leading segment once, and usage past the limit opens a danger lane that
 * extends beyond the track's end while the track glides aside to make room.
 * The readout rolls its digits on `snap`.
 *
 * It is a `role="meter"`: `aria-valuenow` stays inside the quota (a meter may
 * not report past its maximum) while `aria-valuetext` names the overage in
 * words. Under reduced motion the fills still fill — a quota is information —
 * but without the stagger, and the digits swap in place.
 */
export function QuotaMeter({
  ref,
  used,
  limit,
  warnAt = 0.8,
  unit = "GB",
  label,
  segments = 16,
  className,
}: QuotaMeterProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const span = limit > 0 ? limit : 1;
  const fraction = Math.max(0, used) / span;
  const filled = Math.min(1, fraction);
  const over = Math.max(0, used - limit);
  const isOver = over > 0;
  const nearLimit = fraction >= warnAt;

  // Whole numbers read as quota figures; small quotas keep one decimal so a
  // step is still visible.
  const decimals = limit >= 50 ? 0 : 1;
  const fmt = (value: number) => Math.max(0, value).toFixed(decimals);

  const stagger = cascade(segments);
  const leadIndex = Math.max(0, Math.ceil(filled * segments) - 1);
  // The cascade starts at the first segment that changes, not at the head of
  // the track: adding a little near the top should move at once rather than
  // wait for a run of already-full bars to "settle" first. The anchor lives in
  // state so the committed render knows where the previous fill stood.
  const [anchor, setAnchor] = React.useState({ filled, from: 0 });
  if (anchor.filled !== filled) {
    setAnchor({ filled, from: Math.min(anchor.filled, filled) });
  }
  const fromIndex = Math.floor(anchor.from * segments);
  const percent = Math.min(999, Math.round(fraction * 100));

  // The overage lane is a share of the row, floored so a sliver still reads and
  // capped so a runaway number cannot squeeze the track out of the layout.
  const overShare = Math.min(0.34, Math.max(0.08, over / span));

  const tone = isOver || nearLimit ? "bg-warn" : "bg-cobalt-bright";
  const state = isOver
    ? `Over by ${fmt(over)} ${unit}`
    : nearLimit
      ? "Near limit"
      : "Within quota";
  const valueText = isOver
    ? `${fmt(used)} of ${fmt(limit)} ${unit} used, ${fmt(over)} ${unit} over the quota`
    : `${fmt(used)} of ${fmt(limit)} ${unit} used, ${percent} percent`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="flex shrink-0 items-center font-mono text-xs">
          <span
            className={cn(
              "font-medium transition-colors",
              isOver ? "text-danger" : nearLimit ? "text-warn" : "text-ink",
            )}
          >
            <RollingNumber value={fmt(used)} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3">
            {" / "}
            {fmt(limit)} {unit}
          </span>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuenow={Math.min(Math.max(0, used), limit)}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuetext={valueText}
        className="flex items-center gap-1"
      >
        <div className="relative min-w-0 flex-1">
          <div
            className="grid h-2 gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: segments }, (_, index) => {
              // Each segment owns one slice of the quota and fills by the part
              // of that slice the usage reaches, so a partial bar is honest.
              const amount = Math.min(
                1,
                Math.max(0, filled * segments - index),
              );
              return (
                <span
                  key={index}
                  aria-hidden
                  style={{ gridColumnStart: index + 1, gridRowStart: 1 }}
                  className="relative overflow-hidden rounded-1 bg-hairline-strong"
                >
                  <motion.span
                    className={cn(
                      "absolute inset-0 origin-left rounded-1 transition-colors",
                      tone,
                    )}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: amount }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            delay: Math.max(0, index - fromIndex) * stagger,
                          }
                        : { duration: durations.base, ease: easings.enter }
                    }
                  />
                </span>
              );
            })}

            {/* The flash lives on the track rather than inside a segment so
                that a later change of leading segment cannot re-trigger it.
                `initial={false}` keeps a meter that mounts already over the
                threshold from flashing at a viewer who crossed nothing. */}
            <AnimatePresence initial={false}>
              {nearLimit ? (
                <motion.span
                  key="threshold-flash"
                  aria-hidden
                  style={{ gridColumnStart: leadIndex + 1, gridRowStart: 1 }}
                  className="pointer-events-none rounded-1 bg-ink"
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ) : null}
            </AnimatePresence>
          </div>

          <span
            aria-hidden
            style={{ left: `${Math.min(100, Math.max(0, warnAt * 100))}%` }}
            className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-ink-3"
          />
        </div>

        <AnimatePresence initial={false}>
          {isOver ? (
            <motion.span
              key="overage"
              aria-hidden
              className="h-2 shrink-0 rounded-1 bg-danger"
              initial={{ width: "0%", opacity: 0 }}
              animate={{ width: `${overShare * 100}%`, opacity: 1 }}
              exit={{ width: "0%", opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* The meter's aria-valuetext already carries the percentage, so the
            readout stays out of the accessibility tree rather than repeating
            it a second time in a different voice. */}
        <span
          aria-hidden
          className="flex items-center font-mono text-[11px] text-ink-3"
        >
          <RollingNumber value={String(percent)} motionSafe={motionSafe} />%
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state}
            className={cn(
              "text-[11px] font-medium",
              isOver ? "text-danger" : nearLimit ? "text-warn" : "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {state}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
