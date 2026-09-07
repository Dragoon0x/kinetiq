"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HistogramBin = {
  from: number;
  to: number;
  count: number;
};

export type RangeHistogramProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered bins, left to right; their ends set the slider's bounds. */
  bins: HistogramBin[];
  /** Controlled range. */
  value?: [number, number];
  /** Initial range for uncontrolled usage. Defaults to the full span. */
  defaultValue?: [number, number];
  /** Fires on every drag frame and every keyboard step. */
  onValueChange?: (range: [number, number]) => void;
  /** Formats the two ends and the sliders' aria-valuetext. */
  format?: (value: number) => string;
  /** Arrow-key step. Defaults to a quarter of the narrowest bin. */
  step?: number;
  /** Histogram height in px; the width is fluid and measured. @default 88 */
  height?: number;
  /** Names the filter for assistive technology and captions the readout. */
  label?: string;
  className?: string;
};

/** Gap between bars, in px. */
const BAR_GAP = 2;
/** A zero-count bin still draws a hairline, so the gap in the data is visible. */
const MIN_BAR = 1;
/** Travel before a press becomes a drag, so a click on the track still lands. */
const DRAG_SLOP = 4;
/** Shift multiplies the step by ten. */
const COARSE = 10;

const defaultFormat = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointers have no capture target; the drag continues.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

/** Border-box width of a node, measured in the observer rather than in render. */
function useBoxWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetWidth;
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * A price filter you can see through. A histogram of the whole population sits
 * directly above a dual-thumb range, and dragging a thumb fades every bin
 * outside the selection on a plain opacity tween — no travel, because the bars
 * are not moving, only their relevance is. The match count above rolls to its
 * new figure from a motion value on `glide`, so the number arrives with weight
 * instead of flickering, and the selected span stays lit under the bars.
 *
 * The two thumbs are real sliders carrying `aria-valuetext`: Left and Right
 * step, Shift steps ten at a time, Home and End run to the ends, and a thumb
 * pushes its partner rather than crossing it. A press captures the pointer
 * only after 4px of travel, so a plain click on the track still moves the
 * nearest thumb. Under reduced motion the bins swap state with no fade — the
 * selection still shows, because the selection is the information.
 */
export function RangeHistogram({
  ref,
  bins,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  step,
  height = 88,
  label,
  className,
}: RangeHistogramProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const plateRef = React.useRef<HTMLDivElement>(null);
  const thumbRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const width = useBoxWidth(plateRef);

  const min = bins[0]?.from ?? 0;
  const max = bins[bins.length - 1]?.to ?? 1;
  const span = max - min || 1;

  const stepSafe = React.useMemo(() => {
    if (step && step > 0) return step;
    let narrowest = Infinity;
    for (const bin of bins) narrowest = Math.min(narrowest, bin.to - bin.from);
    if (!Number.isFinite(narrowest) || narrowest <= 0) return 1;
    return Math.max(Math.round(narrowest / 4), 1);
  }, [bins, step]);

  const snap = React.useCallback(
    (raw: number) =>
      Math.min(
        max,
        Math.max(min, min + Math.round((raw - min) / stepSafe) * stepSafe),
      ),
    [min, max, stepSafe],
  );

  const order = React.useCallback(
    (pair: [number, number]): [number, number] => {
      const a = snap(pair[0]);
      const b = snap(pair[1]);
      return a <= b ? [a, b] : [b, a];
    },
    [snap],
  );

  const [uncontrolled, setUncontrolled] = React.useState<[number, number]>(() =>
    order(defaultValue ?? [min, max]),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? order(value) : uncontrolled;
  const [lo, hi] = current;

  const emit = (next: [number, number]) => {
    if (next[0] === lo && next[1] === hi) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  /** A thumb pushes its partner along rather than passing through it. */
  const setThumb = (index: number, raw: number) => {
    const at = snap(raw);
    emit(index === 0 ? [at, Math.max(hi, at)] : [Math.min(lo, at), at]);
  };

  // Midpoint membership makes the fade and the count agree exactly: a bin is
  // counted when it is lit, never one without the other.
  const isInside = React.useCallback(
    (bin: HistogramBin) => {
      const mid = (bin.from + bin.to) / 2;
      return mid >= lo && mid <= hi;
    },
    [lo, hi],
  );

  const matches = React.useMemo(
    () => bins.reduce((sum, bin) => (isInside(bin) ? sum + bin.count : sum), 0),
    [bins, isInside],
  );

  const countMv = useMotionValue(matches);
  const countText = useTransform(countMv, (v) =>
    Math.round(v).toLocaleString("en-US"),
  );
  React.useEffect(() => {
    if (!motionSafe) {
      countMv.set(matches);
      return;
    }
    const controls = animate(countMv, matches, springs.glide);
    return () => controls.stop();
  }, [matches, motionSafe, countMv]);

  const maxCount =
    bins.reduce((peak, bin) => Math.max(peak, bin.count), 0) || 1;
  const colW = bins.length > 0 ? width / bins.length : 0;
  const barW = Math.max(colW - BAR_GAP, 1);

  const pct = (v: number) => ((v - min) / span) * 100;

  const dragRef = React.useRef<{
    index: number;
    pointerId: number;
    startX: number;
    rect: DOMRect;
    engaged: boolean;
  } | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const valueFromX = (clientX: number, rect: DOMRect) => {
    if (rect.width === 0) return min;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + t * span;
  };

  const pickThumb = (raw: number) => {
    const dLo = Math.abs(raw - lo);
    const dHi = Math.abs(raw - hi);
    // A tie goes to whichever thumb can actually move toward the pointer.
    if (dLo === dHi) return raw < lo ? 0 : 1;
    return dLo < dHi ? 0 : 1;
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const amount = stepSafe * (event.shiftKey ? COARSE : 1);
    const from = index === 0 ? lo : hi;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = from + amount;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = from - amount;
        break;
      case "PageUp":
        next = from + stepSafe * COARSE;
        break;
      case "PageDown":
        next = from - stepSafe * COARSE;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    setThumb(index, next);
  };

  const binTransition = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };

  const thumbLabel = (index: number) =>
    index === 0 ? `${label ?? "Range"} minimum` : `${label ?? "Range"} maximum`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        <span className="shrink-0 font-mono text-xs font-medium text-foreground tabular-nums">
          <motion.span>{countText}</motion.span>
          <span className="ml-1 font-sans text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            matches
          </span>
        </span>
      </div>

      <div className="rounded-3 border border-hairline bg-surface-1 px-2.5 pt-3 pb-1">
        <div
          ref={plateRef}
          className="relative w-full"
          style={{ height }}
          aria-hidden
        >
          {/* The selected span, lit under the bars and tracking the thumbs 1:1. */}
          <div
            className="absolute inset-y-0 rounded-1 bg-cobalt-wash"
            style={{
              left: `${pct(lo)}%`,
              width: `${Math.max(pct(hi) - pct(lo), 0)}%`,
            }}
          />
          {width > 0 ? (
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              className="absolute inset-0 block"
            >
              {bins.map((bin, index) => {
                const barH = Math.max((bin.count / maxCount) * height, MIN_BAR);
                return (
                  <motion.rect
                    key={`${bin.from}-${bin.to}`}
                    x={index * colW + BAR_GAP / 2}
                    y={height - barH}
                    width={barW}
                    height={barH}
                    rx={1}
                    fill="var(--accent-bright)"
                    initial={false}
                    animate={{ opacity: isInside(bin) ? 1 : 0.18 }}
                    transition={binTransition}
                  />
                );
              })}
            </svg>
          ) : null}
        </div>

        <div
          className="relative flex h-9 touch-pan-y items-center"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const raw = valueFromX(event.clientX, rect);
            const index = pickThumb(raw);
            dragRef.current = {
              index,
              pointerId: event.pointerId,
              startX: event.clientX,
              rect,
              engaged: false,
            };
            setDragIndex(index);
            setThumb(index, raw);
            thumbRefs.current[index]?.focus();
          }}
          onPointerMove={(event) => {
            const held = dragRef.current;
            if (!held || held.pointerId !== event.pointerId) return;
            if (!held.engaged) {
              if (Math.abs(event.clientX - held.startX) <= DRAG_SLOP) return;
              held.engaged = true;
              // Captured only now, so a plain click is never swallowed.
              capturePointer(event.currentTarget, event.pointerId);
            }
            setThumb(held.index, valueFromX(event.clientX, held.rect));
          }}
          onPointerUp={(event) => {
            releasePointer(event.currentTarget, event.pointerId);
            dragRef.current = null;
            setDragIndex(null);
          }}
          onPointerCancel={(event) => {
            releasePointer(event.currentTarget, event.pointerId);
            dragRef.current = null;
            setDragIndex(null);
          }}
        >
          <div className="h-1.5 w-full rounded-full border border-hairline bg-surface-2" />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{
              left: `${pct(lo)}%`,
              width: `${Math.max(pct(hi) - pct(lo), 0)}%`,
            }}
          />

          {([0, 1] as const).map((index) => {
            const at = index === 0 ? lo : hi;
            return (
              <span
                key={index}
                ref={(node) => {
                  thumbRefs.current[index] = node;
                }}
                role="slider"
                tabIndex={0}
                aria-label={thumbLabel(index)}
                aria-orientation="horizontal"
                aria-valuemin={index === 0 ? min : lo}
                aria-valuemax={index === 0 ? hi : max}
                aria-valuenow={at}
                aria-valuetext={format(at)}
                aria-describedby={`${uid}-matches`}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-primary bg-surface-0 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  dragIndex === index && "cursor-grabbing shadow-raised",
                )}
                style={{ left: `${pct(at)}%` }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-foreground tabular-nums">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>

      <ul className="sr-only">
        {bins.map((bin) => (
          <li key={`${bin.from}-${bin.to}`}>
            {format(bin.from)} to {format(bin.to)}: {bin.count}
          </li>
        ))}
      </ul>
      {/* Described, not announced: the thumbs already speak through
          aria-valuetext, and a live region would double every drag frame. */}
      <span id={`${uid}-matches`} className="sr-only">
        {matches} of {bins.reduce((sum, bin) => sum + bin.count, 0)} between{" "}
        {format(lo)} and {format(hi)}
      </span>
    </div>
  );
}
