"use client";

import * as React from "react";

import { motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Ticks within this many px of the active jaw lean toward it. */
const LEAN_RADIUS = 24;
const LEAN_MAX_DEG = 14;

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

const roundFloat = (n: number): number => Number(n.toFixed(5));

const sameValues = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export type CaliperSliderValue = number | [number, number];

export type CaliperSliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value?: CaliperSliderValue;
  defaultValue?: CaliperSliderValue;
  onValueChange?: (value: CaliperSliderValue) => void;
  /** Two caliper jaws with a live measured-span dimension line between them. */
  range?: boolean;
  /**
   * Tick positions. `true` draws one per step when the range has ≤ 40 steps,
   * otherwise quarter marks. An array pins ticks to exact values.
   */
  marks?: number[] | boolean;
  /** Formats the readout, dimension label and `aria-valuetext`. */
  format?: (value: number) => string;
  /** Accessible name; range thumbs are named "<label> minimum/maximum". */
  label?: string;
  disabled?: boolean;
  readout?: "float" | "end" | "none";
  className?: string;
};

/**
 * A slider that reads like a vernier caliper. The bar thumb tracks the
 * pointer 1:1 while dragging, then settles onto the nearest step on `snap`
 * at release. Nearby tick marks lean toward the jaw (±14° by proximity) and
 * relax back on `glide`; in `range` mode a dimension line between the jaws
 * measures the span live. Reduced motion keeps 1:1 tracking and drops the
 * lean and settle.
 */
export function CaliperSlider({
  min = 0,
  max = 100,
  step = 1,
  value: controlledValue,
  defaultValue,
  onValueChange,
  range = false,
  marks = true,
  format,
  label,
  disabled = false,
  readout = "end",
  className,
}: CaliperSliderProps) {
  const motionSafe = useMotionSafe();
  const span = Math.max(max - min, Number.EPSILON);
  const stepSafe = step > 0 ? step : 1;
  const fmt = format ?? ((v: number) => String(v));

  const clampToRange = React.useCallback(
    (v: number) => Math.min(max, Math.max(min, v)),
    [min, max],
  );

  const normalize = React.useCallback(
    (v: CaliperSliderValue): number[] => {
      if (range) {
        const a = clampToRange(Array.isArray(v) ? (v[0] ?? min) : min);
        const b = clampToRange(Array.isArray(v) ? (v[1] ?? max) : v);
        return [Math.min(a, b), Math.max(a, b)];
      }
      return [clampToRange(Array.isArray(v) ? (v[0] ?? min) : v)];
    },
    [range, min, max, clampToRange],
  );

  const [uncontrolled, setUncontrolled] = React.useState<number[]>(() =>
    defaultValue !== undefined
      ? normalize(defaultValue)
      : range
        ? [min, max]
        : [min],
  );
  const committed =
    controlledValue !== undefined ? normalize(controlledValue) : uncontrolled;

  /** Raw (unsnapped) values while a jaw is being dragged; null when idle. */
  const [dragValues, setDragValues] = React.useState<number[] | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const rectRef = React.useRef<DOMRect | null>(null);
  const thumbRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const emittedRef = React.useRef<number[] | null>(null);

  const [trackWidth, setTrackWidth] = React.useState(0);
  // Positions render instantly on the first measured frame — the settle
  // spring only engages one paint after the track was measured, so mount
  // never slides.
  const [settleReady, setSettleReady] = React.useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackWidth(el.getBoundingClientRect().width);
    const raf = requestAnimationFrame(() => setSettleReady(true));
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            setTrackWidth(el.getBoundingClientRect().width);
          });
    observer?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  const pxFor = (v: number): number => ((v - min) / span) * trackWidth;

  const snapTo = (v: number): number =>
    roundFloat(clampToRange(min + Math.round((v - min) / stepSafe) * stepSafe));

  /** Clamps a thumb between the range bounds and its neighbor jaw. */
  const clampFor = (index: number, v: number, vals: number[]): number => {
    let lo = min;
    let hi = max;
    if (range) {
      if (index === 0) hi = vals[1] ?? max;
      else lo = vals[0] ?? min;
    }
    return Math.min(hi, Math.max(lo, v));
  };

  const emit = (next: number[]) => {
    if (controlledValue === undefined) setUncontrolled(next);
    const prev = emittedRef.current ?? committed;
    if (!sameValues(next, prev)) {
      onValueChange?.(
        range
          ? ([next[0] ?? min, next[1] ?? max] as [number, number])
          : (next[0] ?? min),
      );
    }
    emittedRef.current = next;
  };

  const valueFromClientX = (clientX: number): number => {
    const rect = rectRef.current;
    if (!rect || rect.width === 0) return min;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + t * span;
  };

  /** Values driving geometry: raw during drag for 1:1 tracking. */
  const displayValues = dragValues ?? committed;
  /** Values driving text and ARIA: always on the step grid. */
  const shownValues = displayValues.map((v, i) =>
    clampFor(i, snapTo(v), displayValues),
  );

  const setThumbRaw = (index: number, raw: number, base: number[]) => {
    const next = [...base];
    next[index] = clampFor(index, raw, base);
    setDragValues(next);
    const snapped = [...next];
    snapped[index] = clampFor(index, snapTo(next[index] ?? min), next);
    emit(snapped);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    rectRef.current = trackRef.current?.getBoundingClientRect() ?? null;
    const raw = valueFromClientX(event.clientX);
    let index = 0;
    if (range) {
      const lo = displayValues[0] ?? min;
      const hi = displayValues[1] ?? max;
      const dLo = Math.abs(raw - lo);
      const dHi = Math.abs(raw - hi);
      // Ties (overlapping jaws) go to whichever jaw can move toward the
      // pointer.
      index = dLo === dHi ? (raw < lo ? 0 : 1) : dLo < dHi ? 0 : 1;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
    setThumbRaw(index, raw, committed);
    thumbRefs.current[index]?.focus();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIndex === null || disabled) return;
    setThumbRaw(dragIndex, valueFromClientX(event.clientX), displayValues);
  };

  const settleDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIndex === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const base = dragValues ?? committed;
    const snapped = [...base];
    snapped[dragIndex] = clampFor(dragIndex, snapTo(base[dragIndex] ?? min), base);
    emit(snapped);
    setDragIndex(null);
    setDragValues(null);
  };

  const handleThumbKeyDown =
    (index: number) => (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (disabled) return;
      const current = shownValues[index] ?? min;
      let next: number | null = null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          next = current + stepSafe;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          next = current - stepSafe;
          break;
        case "PageUp":
          next = current + stepSafe * 10;
          break;
        case "PageDown":
          next = current - stepSafe * 10;
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
      const vals = [...committed];
      vals[index] = clampFor(index, snapTo(next), committed);
      emit(vals);
    };

  // Settle springs engage only after measurement and outside reduced motion.
  const settle: Transition =
    motionSafe && settleReady ? springs.snap : { duration: 0 };
  const thumbTransition = (index: number): Transition =>
    dragIndex === index ? { duration: 0 } : settle;
  const fillTransition: Transition = dragIndex !== null ? { duration: 0 } : settle;

  const markValues = React.useMemo<number[]>(() => {
    if (marks === false) return [];
    if (Array.isArray(marks)) {
      return marks.filter((m) => m >= min && m <= max);
    }
    const steps = Math.round(span / stepSafe);
    if (steps <= 40) {
      return Array.from({ length: steps + 1 }, (_, i) =>
        roundFloat(min + i * stepSafe),
      );
    }
    return [0, 1, 2, 3, 4].map((q) => roundFloat(min + (span * q) / 4));
  }, [marks, min, max, span, stepSafe]);

  const activeIndex = dragIndex ?? hoverIndex;
  const leanEnabled = motionSafe && !disabled && activeIndex !== null;
  const activePx =
    activeIndex !== null ? pxFor(displayValues[activeIndex] ?? min) : 0;

  const lowPx = pxFor(displayValues[0] ?? min);
  const highPx = range ? pxFor(displayValues[1] ?? max) : lowPx;
  const shownSpan = roundFloat(
    (shownValues[1] ?? max) - (shownValues[0] ?? min),
  );

  const thumbAriaLabel = (index: number): string | undefined => {
    if (!range) return label;
    const bound = index === 0 ? "Minimum value" : "Maximum value";
    return label ? `${label} — ${bound.toLowerCase()}` : bound;
  };

  return (
    <div
      className={cn(
        "w-full select-none",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 grow">
          {readout === "float" && (
            <div aria-hidden className="pointer-events-none relative h-5">
              {displayValues.map((v, i) => (
                <motion.span
                  key={i}
                  className="absolute top-0 left-0"
                  initial={false}
                  animate={{ x: pxFor(v) }}
                  transition={thumbTransition(i)}
                >
                  <span className="text-foreground block -translate-x-1/2 font-mono text-[11px] whitespace-nowrap tabular-nums">
                    {fmt(shownValues[i] ?? min)}
                  </span>
                </motion.span>
              ))}
            </div>
          )}

          {range && (
            <div aria-hidden className="pointer-events-none relative mb-1 h-4">
              {/* Dimension line: |—— span ——| measured live between the jaws. */}
              <motion.div
                className="absolute inset-y-0 left-0"
                initial={false}
                animate={{ x: lowPx, width: Math.max(highPx - lowPx, 0) }}
                transition={fillTransition}
              >
                <span className="bg-muted-foreground/60 absolute right-0 bottom-0 left-0 h-px" />
                <span className="bg-muted-foreground/60 absolute bottom-0 left-0 h-1.5 w-px" />
                <span className="bg-muted-foreground/60 absolute right-0 bottom-0 h-1.5 w-px" />
                <span className="text-muted-foreground absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] leading-none whitespace-nowrap tabular-nums">
                  {fmt(shownSpan)}
                </span>
              </motion.div>
            </div>
          )}

          <div
            className={cn(
              "relative flex h-5 touch-none items-center",
              !disabled && "cursor-pointer",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={settleDrag}
            onPointerCancel={settleDrag}
          >
            <div ref={trackRef} className="bg-muted relative h-1 w-full rounded-full">
              <motion.span
                className="bg-primary absolute inset-y-0 left-0 rounded-full"
                initial={false}
                animate={{
                  x: range ? lowPx : 0,
                  width: range ? Math.max(highPx - lowPx, 0) : lowPx,
                }}
                transition={fillTransition}
              />
            </div>
            {displayValues.map((v, i) => (
              <motion.span
                key={i}
                className="absolute top-1/2 left-0"
                initial={false}
                animate={{ x: pxFor(v) }}
                transition={thumbTransition(i)}
              >
                <span
                  ref={(node) => {
                    thumbRefs.current[i] = node;
                  }}
                  role="slider"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={thumbAriaLabel(i)}
                  aria-orientation="horizontal"
                  aria-valuemin={range && i === 1 ? (shownValues[0] ?? min) : min}
                  aria-valuemax={range && i === 0 ? (shownValues[1] ?? max) : max}
                  aria-valuenow={shownValues[i] ?? min}
                  aria-valuetext={fmt(shownValues[i] ?? min)}
                  aria-disabled={disabled || undefined}
                  onKeyDown={handleThumbKeyDown(i)}
                  onPointerEnter={() => setHoverIndex(i)}
                  onPointerLeave={() =>
                    setHoverIndex((current) => (current === i ? null : current))
                  }
                  className={cn(
                    "flex h-6 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-1",
                    !disabled && "cursor-ew-resize",
                  )}
                >
                  {/* The caliper jaw — a machined bar, not a puck. */}
                  <span aria-hidden className="bg-primary h-5 w-1.5 rounded-1" />
                </span>
              </motion.span>
            ))}
          </div>

          {markValues.length > 0 && (
            <div aria-hidden className="relative mt-0.5 h-2.5">
              {markValues.map((mark) => {
                const px = pxFor(mark);
                let rotate = 0;
                let scaleY = 1;
                if (leanEnabled) {
                  const distance = px - activePx;
                  const magnitude = Math.abs(distance);
                  if (magnitude <= LEAN_RADIUS) {
                    const influence = 1 - magnitude / LEAN_RADIUS;
                    rotate = Math.sign(distance) * LEAN_MAX_DEG * influence;
                    scaleY = 1 + 0.25 * influence;
                  }
                }
                return (
                  <motion.span
                    key={mark}
                    className="bg-muted-foreground/40 absolute top-0 h-2 w-px"
                    style={{ left: px, transformOrigin: "50% 0%" }}
                    initial={false}
                    animate={{ rotate, scaleY }}
                    transition={
                      !motionSafe
                        ? { duration: 0 }
                        : leanEnabled
                          ? springs.flick
                          : springs.glide
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {readout === "end" && (
          <span className="text-foreground shrink-0 text-right font-mono text-xs whitespace-nowrap tabular-nums">
            {range
              ? `${fmt(shownValues[0] ?? min)} – ${fmt(shownValues[1] ?? max)}`
              : fmt(shownValues[0] ?? min)}
          </span>
        )}
      </div>
    </div>
  );
}
