"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeltaTileProps = {
  ref?: React.Ref<HTMLButtonElement>;
  /** Metric name. */
  label: string;
  /** Current value. */
  value: number;
  /** Prior period value; the delta is derived from it. */
  previous: number;
  /** Sparkline points, oldest first. */
  series: number[];
  /** Formats the value, the previous reading, and the range. */
  format: (value: number) => string;
  /** Set when a fall is the good outcome — churn, latency, cost. */
  lowerIsBetter?: boolean;
  className?: string;
};

/** Sparkline viewBox. The SVG scales to its container, so this is shape only. */
const VIEW_W = 240;
const VIEW_H = 44;
/** Room above and below the trace so peaks never clip the box. */
const PAD_Y = 5;

/**
 * Colour is the one property here without physical meaning, so it tweens
 * rather than springs — danger to success over `durations.base`.
 */
const COLOR_TWEEN: React.CSSProperties = {
  transitionProperty: "color, background-color, border-color",
  transitionDuration: `${durations.base}s`,
  transitionTimingFunction: `cubic-bezier(${easings.enter.join(", ")})`,
};

const formatDelta = (value: number): string =>
  `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}%`;

function buildPaths(series: number[]): { line: string; area: string } {
  if (series.length === 0) return { line: "", area: "" };
  let min = Infinity;
  let max = -Infinity;
  for (const point of series) {
    if (point < min) min = point;
    if (point > max) max = point;
  }
  const span = max - min;
  const stepX = series.length === 1 ? 0 : VIEW_W / (series.length - 1);
  const inner = VIEW_H - PAD_Y * 2;
  const line = series
    .map((point, index) => {
      const x = index * stepX;
      // A flat series sits on the midline rather than collapsing to an edge.
      const ratio = span === 0 ? 0.5 : (point - min) / span;
      const y = VIEW_H - PAD_Y - ratio * inner;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return { line, area: `${line} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z` };
}

type RolledNumberProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A number that rolls to its target on `glide`. The formatted text is a motion
 * value handed to the span as its child, so the roll runs outside React and
 * re-renders nothing; `tabular-nums` pins the cell width so moving digits can
 * never nudge the layout around them.
 */
function RolledNumber({
  value,
  format,
  motionSafe,
  className,
}: RolledNumberProps) {
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
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * A KPI tile that answers three questions in one movement. The value rolls its
 * digits to the new number on `glide`; the delta arrow turns to meet it on
 * `snap` — one crisp overshoot, the physics of a switch throwing — while the
 * colour tweens danger to success, because colour has no momentum to spend.
 * The sparkline redraws itself, `pathLength` 0→1 on `glide`, whenever the
 * series changes, so a new period reads as a line being drawn rather than
 * swapped.
 *
 * The tile is a button: hover or focus reads the previous period, Enter or
 * Space pins that reading so it can be studied, and the reading is positioned
 * inside the chart's own box so nothing on the page shifts. Its accessible name
 * is the whole sentence — value, direction, prior period, and the range the
 * sparkline covers. Reduced motion swaps the digits, flips the arrow, and draws
 * the line at once.
 */
export function DeltaTile({
  ref,
  label,
  value,
  previous,
  series,
  format,
  lowerIsBetter = false,
  className,
}: DeltaTileProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const readingId = `${baseId}-previous`;

  const [pinned, setPinned] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const open = pinned || hovered || focused;

  const delta = value - previous;
  const percent = previous === 0 ? 0 : (delta / previous) * 100;
  const rising = delta >= 0;
  const good = lowerIsBetter ? !rising : rising;

  const seriesKey = series.join(",");
  const paths = React.useMemo(() => buildPaths(series), [series]);
  const low = series.length ? Math.min(...series) : value;
  const high = series.length ? Math.max(...series) : value;

  const sentence = `${label}, ${format(value)}, ${
    rising ? "up" : "down"
  } ${Math.abs(percent).toFixed(1)} percent from ${format(
    previous,
  )} last period. Trend over ${series.length} points, low ${format(
    low,
  )}, high ${format(high)}.`;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={sentence}
      aria-expanded={pinned}
      aria-describedby={open ? readingId : undefined}
      onClick={() => setPinned((held) => !held)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-3 text-left outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </span>

      <span className="flex items-center justify-between gap-2">
        <RolledNumber
          value={value}
          format={format}
          motionSafe={motionSafe}
          className="text-lg leading-none font-medium text-foreground"
        />

        <span
          aria-hidden
          style={COLOR_TWEEN}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1",
            good
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {/* Rotating a plain span keeps the transform origin at its centre —
              motion rewrites transform-origin for SVG roots. */}
          <motion.span
            className="flex size-3 shrink-0 items-center justify-center"
            animate={{ rotate: rising ? 0 : 180 }}
            initial={false}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg
              viewBox="0 0 12 12"
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 10 L6 2 M2.5 5.5 L6 2 L9.5 5.5" />
            </svg>
          </motion.span>
          <RolledNumber
            value={percent}
            format={formatDelta}
            motionSafe={motionSafe}
            className="text-[11px] leading-none font-medium"
          />
        </span>
      </span>

      <span className="relative mt-0.5 block">
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={COLOR_TWEEN}
          className={cn(
            "block h-11 w-full",
            good ? "text-success" : "text-danger",
          )}
        >
          <motion.path
            key={`area-${seriesKey}`}
            d={paths.area}
            fill="currentColor"
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 0.12 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
          <motion.path
            key={`line-${seriesKey}`}
            d={paths.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        </svg>

        <motion.span
          id={readingId}
          className="pointer-events-none absolute top-0 left-0 max-w-full truncate rounded-2 border border-hairline bg-popover px-2 py-0.5 font-mono text-[10px] text-popover-foreground tabular-nums shadow-sm"
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{
            duration: durations.fast,
            ease: open ? easings.enter : easings.exit,
          }}
        >
          Prev {format(previous)}
        </motion.span>
      </span>
    </button>
  );
}
