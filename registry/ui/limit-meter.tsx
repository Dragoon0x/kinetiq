"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LimitEntry = {
  id: string;
  /** What this send took out of today's room. */
  amount: number;
  /** Who it went to; becomes the block's tooltip. */
  label?: string;
};

export type LimitMeterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Sends already counted against today, oldest first. Each is one block. */
  entries: LimitEntry[];
  /** The daily ceiling. */
  limit: number;
  /** The amount about to be sent, drawn as the hatched preview. @default 0 */
  pending?: number;
  /** Formats every amount the meter prints. */
  format?: (value: number) => string;
  /** Names the meter for assistive technology. @default "Daily send limit" */
  label?: string;
  /** Small note under the rail — the window's own words. @default "Resets 00:00" */
  resetNote?: string;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/**
 * The hatch repeats every 11.3137px along a 135° gradient line, which is exactly
 * 16px of horizontal travel (11.3137 ÷ sin 135°) — so a sheet that slides 16px
 * lands on the identical pattern and the march has no seam. `currentColor` keeps
 * the ink on a token class, so danger is one class swap away.
 */
const HATCH_TRAVEL = 16;
const HATCH_IMAGE =
  "repeating-linear-gradient(135deg, currentColor 0 5.6568px, transparent 5.6568px 11.3137px)";

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * The remaining figure rolls to its new value on `glide` as a formatted motion
 * value, so the roll runs outside React and re-renders nothing. It is hidden
 * from assistive technology because the meter's `aria-valuetext` already says
 * what is left, in words, once.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

/**
 * How much room today has left. The fill is made of the actual sends rather than
 * anonymous ticks: each transfer is its own block, its width its share of the
 * limit, growing from zero on `glide` — a quantity settling, so no overshoot —
 * and shrinking away on the exit ease when it is cancelled, the blocks after it
 * closing the gap. Ahead of the fill the staged amount previews as a hatched
 * segment that arrives on `snap`, because a preview takes a position rather than
 * accumulating, and its hatch marches one seamless period while it stands.
 * Crossing the limit turns the preview and the rail danger, and the overage is
 * printed in money beside it, never carried by the colour alone.
 *
 * It is a `role="meter"` whose `aria-valuenow` stays inside the limit — a meter
 * may not report past its maximum — while `aria-valuetext` names the total, the
 * staged amount and any overage. Under reduced motion the widths are set without
 * springs and the hatch stands still: the fill still fills, because how much room
 * is left is information rather than flourish.
 */
export function LimitMeter({
  ref,
  entries,
  limit,
  pending = 0,
  format = defaultFormat,
  label = "Daily send limit",
  resetNote = "Resets 00:00",
  className,
}: LimitMeterProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  // Nothing marches to an empty room: the hatch stops while the tab is hidden.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const span = limit > 0 ? limit : 1;

  // Each block's start is the sum of everything before it, computed rather than
  // accumulated: a running total reassigned during render is a render that
  // cannot be repeated safely.
  const total = (list: LimitEntry[]) =>
    list.reduce((sum, item) => sum + Math.max(0, item.amount), 0);

  const blocks = entries.map((entry, index) => {
    const before = total(entries.slice(0, index));
    const start = Math.min(1, before / span);
    return {
      entry,
      start,
      width: Math.min(1, (before + Math.max(0, entry.amount)) / span) - start,
    };
  });

  const used = total(entries);
  const staged = Math.max(0, pending);
  const previewStart = Math.min(1, used / span);
  const previewWidth = Math.min(1, (used + staged) / span) - previewStart;
  const over = Math.max(0, used + staged - limit);
  const isOver = over > 0;
  const left = Math.max(0, limit - used - staged);

  const valueText = [
    `${format(used)} of ${format(limit)} used`,
    staged > 0 ? `${format(staged)} staged` : null,
    isOver ? `over by ${format(over)}` : `${format(left)} left today`,
  ]
    .filter(Boolean)
    .join(", ");

  const sizing = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <RolledMoney
            value={left}
            format={format}
            motionSafe={motionSafe}
            className={cn(
              "text-sm font-medium transition-colors",
              isOver ? "text-danger" : "text-ink",
            )}
          />
          <span className="text-[11px] text-ink-3">left</span>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(Math.max(0, used), limit)}
        aria-valuetext={valueText}
        className={cn(
          "relative h-2.5 w-full overflow-hidden rounded-full bg-hairline-strong ring-1 transition-colors",
          isOver ? "ring-danger/50" : "ring-transparent",
        )}
      >
        <AnimatePresence initial={false}>
          {blocks.map(({ entry, start, width }) => (
            <motion.span
              key={entry.id}
              aria-hidden
              title={
                entry.label
                  ? `${entry.label} · ${format(entry.amount)}`
                  : format(entry.amount)
              }
              className="absolute inset-y-0 pr-px"
              style={{ left: `${start * 100}%` }}
              initial={{ width: "0%" }}
              animate={{ width: `${Math.max(0, width) * 100}%` }}
              exit={{ width: "0%", transition: exitFor() }}
              transition={sizing}
            >
              {/* The gutter is padding on a percentage-wide box, so the blocks
                  read as separate sends without any of them losing a pixel of
                  the share it actually represents. */}
              <span className="block h-full w-full rounded-full bg-cobalt-bright" />
            </motion.span>
          ))}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {previewWidth > 0 ? (
            <motion.span
              key="preview"
              aria-hidden
              className={cn(
                "absolute inset-y-0 overflow-hidden rounded-full",
                isOver ? "bg-danger/15" : "bg-cobalt-wash",
              )}
              style={{ left: `${previewStart * 100}%` }}
              initial={{ width: "0%", opacity: 0 }}
              animate={{ width: `${previewWidth * 100}%`, opacity: 1 }}
              exit={{ width: "0%", opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <motion.span
                aria-hidden
                className={cn(
                  "absolute -inset-x-4 inset-y-0",
                  isOver ? "text-danger" : "text-cobalt-bright",
                )}
                style={{ backgroundImage: HATCH_IMAGE }}
                initial={{ x: 0 }}
                animate={{ x: motionSafe && visible ? HATCH_TRAVEL : 0 }}
                transition={
                  motionSafe && visible
                    ? {
                        duration: 1.2,
                        ease: easings.linear,
                        repeat: Infinity,
                      }
                    : { duration: 0 }
                }
              />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {resetNote}
        </span>
        <span
          className={cn(
            "text-[11px] font-medium transition-colors",
            isOver ? "text-danger" : staged > 0 ? "text-ink-2" : "text-ink-3",
          )}
        >
          {isOver
            ? `Over by ${format(over)}`
            : staged > 0
              ? `Staging ${format(staged)}`
              : `${format(used)} of ${format(limit)} sent`}
        </span>
      </div>
    </div>
  );
}
