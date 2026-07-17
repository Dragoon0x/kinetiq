"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RangeDualProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Current [low, high] pair. */
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible names for the two thumbs. @default ["Minimum", "Maximum"] */
  labels?: [string, string];
  /** Formats the bubble and aria-valuetext. */
  format?: (value: number) => string;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * A dual-thumb range where the thumbs collide and shove. Drag one into the other
 * and it carries the second along instead of stopping, so the span never
 * inverts; the filled bar tracks between them and a value bubble lifts over
 * whichever thumb is live. Both thumbs are real sliders — arrows, Home/End, and
 * PageUp/Down all push the same way. Under reduced motion the bubbles and thumbs
 * settle without spring.
 */
export function RangeDual({
  ref,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  labels = ["Minimum", "Maximum"],
  format = (v) => String(v),
  className,
}: RangeDualProps) {
  const motionSafe = useMotionSafe();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const rectRef = React.useRef<DOMRect | null>(null);
  const [active, setActive] = React.useState<number | null>(null);

  const [low, high] = value;
  const span = max - min || 1;
  const pct = (v: number) => ((clamp(v, min, max) - min) / span) * 100;

  const snap = (raw: number) => {
    const stepped = Math.round((raw - min) / step) * step + min;
    return clamp(Number(stepped.toFixed(6)), min, max);
  };

  // Set one thumb; if it crosses the other, push the other along.
  const setThumb = (index: number, raw: number) => {
    const v = snap(raw);
    let nextLow = low;
    let nextHigh = high;
    if (index === 0) {
      nextLow = v;
      if (v > nextHigh) nextHigh = v;
    } else {
      nextHigh = v;
      if (v < nextLow) nextLow = v;
    }
    if (nextLow !== low || nextHigh !== high) onValueChange([nextLow, nextHigh]);
  };

  const valueFromClientX = (clientX: number): number => {
    const rect = rectRef.current ?? trackRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    return min + t * span;
  };

  const startDrag = (index: number) => (event: React.PointerEvent) => {
    rectRef.current = trackRef.current?.getBoundingClientRect() ?? null;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(index);
    setThumb(index, valueFromClientX(event.clientX));
  };

  const onThumbMove = (index: number) => (event: React.PointerEvent) => {
    if (active !== index) return;
    setThumb(index, valueFromClientX(event.clientX));
  };

  const endDrag = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setActive(null);
  };

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const raw = valueFromClientX(event.clientX);
    const index = Math.abs(raw - low) <= Math.abs(raw - high) ? 0 : 1;
    rectRef.current = trackRef.current?.getBoundingClientRect() ?? null;
    setActive(index);
    setThumb(index, raw);
  };

  const onThumbKeyDown = (index: number) => (event: React.KeyboardEvent) => {
    const current = index === 0 ? low : high;
    let next = current;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = current + step;
        break;
      case "PageDown":
        next = current - step * 10;
        break;
      case "PageUp":
        next = current + step * 10;
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

  return (
    <div ref={ref} className={cn("w-full px-3 pt-9 pb-2", className)}>
      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className="bg-surface-2 relative h-2 w-full rounded-full"
      >
        <div
          className="bg-cobalt absolute top-0 h-full rounded-full"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />

        {[low, high].map((v, i) => (
          <span
            key={i}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pct(v)}%` }}
          >
            <motion.button
              type="button"
              role="slider"
              aria-label={labels[i]}
              aria-valuemin={i === 0 ? min : low}
              aria-valuemax={i === 0 ? high : max}
              aria-valuenow={v}
              aria-valuetext={format(v)}
              onPointerDown={startDrag(i)}
              onPointerMove={onThumbMove(i)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onThumbKeyDown(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((cur) => (cur === i ? null : cur))}
              animate={{ scale: active === i ? 1.12 : 1 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              className="border-cobalt bg-surface-0 focus-visible:ring-cobalt-bright/50 relative block size-5 touch-none rounded-full border-2 shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <AnimatePresence>
                {active === i && (
                  <motion.span
                    aria-hidden
                    style={{ x: "-50%" }}
                    initial={
                      motionSafe ? { opacity: 0, y: 4, scale: 0.9 } : { opacity: 0 }
                    }
                    animate={
                      motionSafe
                        ? {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }
                        : { opacity: 1 }
                    }
                    exit={{ opacity: 0, transition: { duration: durations.fast } }}
                    className="bg-cobalt absolute -top-8 left-1/2 rounded-1 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white shadow-sm"
                  >
                    {format(v)}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </span>
        ))}
      </div>
    </div>
  );
}
