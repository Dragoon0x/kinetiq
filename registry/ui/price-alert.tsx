"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CrossDirection = "above" | "below";

export type PriceAlertProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Prices oldest first; the last one is the live print. */
  points: number[];
  /** Controlled threshold. */
  value?: number;
  /** Initial threshold for uncontrolled usage. Defaults to the middle of the range. */
  defaultValue?: number;
  /** Fires from the drag, click or key that moved the line. */
  onValueChange?: (value: number) => void;
  /** Bottom of the chart and the threshold's floor. Defaults to the data's low, padded. */
  min?: number;
  /** Top of the chart and the threshold's ceiling. Defaults to the data's high, padded. */
  max?: number;
  /** Threshold granularity; arrow keys move one step, Page keys ten. @default 0.01 */
  step?: number;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** Plot height in px. The width is fluid and measured. @default 160 */
  height?: number;
  /** Names the slider and prints in the header. @default "Price alert" */
  label?: string;
  /** Fires from the effect that observed the last price crossing the line. */
  onCross?: (direction: CrossDirection, price: number) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same price, which is a
 * hydration mismatch on the one figure the badge exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** Plot insets: room for the line's cap and the dot. */
const PAD_X = 8;
const PAD_Y = 10;
/** The trace stops short of the right edge so the badge never covers the live print. */
const GUTTER = 80;
/** Pointer travel before a press becomes a drag, so plain clicks still land. */
const DRAG_SLOP = 4;

/**
 * Node and the browser can disagree in the last digits of a float, and a
 * mismatched attribute is a hydration error — every coordinate is rounded
 * before it reaches the markup.
 */
const round3 = (value: number) => Number(value.toFixed(3));

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Border-box width of a node, measured in the observer callback so the first
 * paint is honest without any layout read during render.
 */
function useBoxWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.clientWidth;
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** One committed crossing — a fresh object each time, so an effect can key on it. */
type Crossing = {
  generation: number;
  direction: CrossDirection;
  price: number;
};

type Committed = {
  last: number;
  value: number;
  side: CrossDirection;
  crossed: boolean;
  crossing: Crossing | null;
};

/**
 * Tell me when it crosses. A horizontal threshold line rides over a price
 * chart and sits directly under the hand: a press anywhere on the plot records
 * the pointer, and once it has travelled `DRAG_SLOP` the plot captures it and
 * the line tracks the pointer's y, snapped to `step`; a plain click moves the
 * line to that price and keys move it by steps, gliding on `snap`. The alert
 * badge rides the line at the right edge through a `useSpring` on `glide`, so
 * it trails the hand by a beat and settles without overshoot — the line is the
 * tool, the badge is the label catching up. It names the threshold and the
 * armed direction: up when the alert waits for a rise past it, down for a fall.
 *
 * A crossing is decided during render by comparing the committed side with
 * the incoming one, and only when the last price moved — dragging the line
 * across the price re-arms it and never counts. When the price crosses, the
 * badge lands from 1.25× on `recoil`, a ring expands and fades on the enter
 * ease, the tone flips to signal, and `onCross` fires from the effect that
 * observed the committed crossing. The badge is a vertical slider: Up and Down
 * move one step, PageUp and PageDown ten, Home and End jump to the bounds.
 * Under reduced motion the line and the badge move together with no lag, the
 * crossing still flips the tone and the words, and the badge blinks instead of
 * bouncing.
 */
export function PriceAlert({
  ref,
  points,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  step = 0.01,
  format = defaultFormat,
  height = 160,
  label = "Price alert",
  onCross,
  className,
}: PriceAlertProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const width = useBoxWidth(plotRef);
  const crossRef = useLatest(onCross);

  const count = points.length;
  const last = points[count - 1] ?? 0;
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    if (point < low) low = point;
    if (point > high) high = point;
  }
  if (count === 0) {
    low = 0;
    high = 1;
  }
  const pad = high === low ? Math.abs(high) * 0.01 || 1 : (high - low) * 0.08;
  const rangeMin = min ?? low - pad;
  const rangeMax = max ?? high + pad;
  const range = rangeMax - rangeMin || 1;

  const safeStep = step > 0 ? step : 0.01;
  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(safeStep))));
  const quantize = (raw: number) =>
    Number(
      (
        Math.round(Math.min(rangeMax, Math.max(rangeMin, raw)) / safeStep) *
        safeStep
      ).toFixed(decimals),
    );

  const [uncontrolled, setUncontrolled] = React.useState(
    () => defaultValue ?? quantize((rangeMin + rangeMax) / 2),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const commit = (next: number) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const innerH = Math.max(0, height - PAD_Y * 2);
  const yOf = (price: number) =>
    round3(
      PAD_Y + Math.min(1, Math.max(0, 1 - (price - rangeMin) / range)) * innerH,
    );
  const priceAt = (y: number) =>
    rangeMax - ((y - PAD_Y) / Math.max(1, innerH)) * range;

  // The committed side of the line, adjusted during render: a crossing is a
  // change of side caused by the price, and only the render that receives the
  // new price knows both the side it left and the side it landed on. A
  // threshold move re-arms without a pulse.
  const side: CrossDirection = last >= current ? "above" : "below";
  const [committed, setCommitted] = React.useState<Committed>(() => ({
    last,
    value: current,
    side,
    crossed: false,
    crossing: null,
  }));
  if (committed.value !== current) {
    setCommitted({ ...committed, last, value: current, side, crossed: false });
  } else if (committed.last !== last) {
    const crossed = side !== committed.side;
    setCommitted({
      ...committed,
      last,
      side,
      crossed: crossed || committed.crossed,
      crossing: crossed
        ? {
            generation: (committed.crossing?.generation ?? 0) + 1,
            direction: side,
            price: last,
          }
        : committed.crossing,
    });
  }

  // Keyed on the crossing object, not its fields: later prints that stay on
  // the same side change `last` without making a new crossing, and must not
  // fire the alert again.
  const { crossing } = committed;
  const generation = crossing?.generation ?? 0;
  React.useEffect(() => {
    if (crossing) crossRef.current?.(crossing.direction, crossing.price);
  }, [crossing, crossRef]);

  // The line is a motion value so a drag writes straight to it with no render
  // in between; keyed moves animate it, and the badge follows through a spring.
  const lineY = useMotionValue(yOf(current));
  const badgeY = useSpring(lineY, springs.glide);
  const dragRef = React.useRef<{
    pointerId: number;
    startY: number;
    held: boolean;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const targetY = yOf(current);
  React.useEffect(() => {
    if (dragRef.current?.held) {
      lineY.set(targetY);
      return;
    }
    const controls = animate(
      lineY,
      targetY,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => controls.stop();
  }, [targetY, lineY, motionSafe]);

  const commitFromClientY = (clientY: number) => {
    const node = plotRef.current;
    if (!node) return;
    const y = clientY - node.getBoundingClientRect().top;
    const next = quantize(priceAt(y));
    // Written directly as well as committed, so the line never waits a frame.
    if (dragRef.current?.held) lineY.set(yOf(next));
    commit(next);
  };

  const endDrag = (node: Element, pointerId: number) => {
    try {
      if (node.hasPointerCapture(pointerId))
        node.releasePointerCapture(pointerId);
    } catch {
      // Never captured, or a synthetic pointer with nothing to release.
    }
    dragRef.current = null;
    setDragging(false);
  };

  const moveBy = (steps: number) =>
    commit(quantize(current + steps * safeStep));

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        moveBy(1);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        moveBy(-1);
        break;
      case "PageUp":
        event.preventDefault();
        moveBy(10);
        break;
      case "PageDown":
        event.preventDefault();
        moveBy(-10);
        break;
      case "Home":
        event.preventDefault();
        commit(quantize(rangeMin));
        break;
      case "End":
        event.preventDefault();
        commit(quantize(rangeMax));
        break;
      default:
        break;
    }
  };

  const plotW = Math.max(0, width - PAD_X - GUTTER);
  const xAt = (index: number) =>
    round3(PAD_X + (count > 1 ? (index / (count - 1)) * plotW : 0));
  const trace = points
    .map(
      (point, index) => `${index === 0 ? "M" : "L"}${xAt(index)} ${yOf(point)}`,
    )
    .join(" ");
  const floor = round3(height - PAD_Y);
  const area = trace
    ? `${trace} L${xAt(count - 1)} ${floor} L${PAD_X} ${floor} Z`
    : "";

  const waitingFor = side === "below" ? "rise" : "fall";
  const words = committed.crossed
    ? `Crossed ${format(current)}, price now ${side}`
    : `Waiting for a ${waitingFor} past ${format(current)}`;
  const valueText = committed.crossed
    ? `${format(current)}, crossed, now ${side}`
    : `${format(current)}, waiting for a ${waitingFor}`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-xs text-ink-3 tabular-nums"
        >
          Last <span className="text-ink">{format(last)}</span>
        </span>
      </div>

      <div
        ref={plotRef}
        style={{ height }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            held: false,
          };
        }}
        onPointerMove={(event) => {
          const grab = dragRef.current;
          if (!grab || grab.pointerId !== event.pointerId) return;
          if (!grab.held) {
            if (Math.abs(event.clientY - grab.startY) < DRAG_SLOP) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // A synthetic sweep has no live pointer to capture; the line
              // still tracks, so this must never throw.
            }
            grab.held = true;
            setDragging(true);
          }
          commitFromClientY(event.clientY);
        }}
        onPointerUp={(event) => {
          const grab = dragRef.current;
          if (!grab || grab.pointerId !== event.pointerId) return;
          // A press that never travelled is a click: the line goes there.
          if (!grab.held) commitFromClientY(event.clientY);
          endDrag(event.currentTarget, event.pointerId);
        }}
        onPointerCancel={(event) =>
          endDrag(event.currentTarget, event.pointerId)
        }
        className={cn(
          "relative w-full touch-none rounded-2 text-cobalt-bright select-none",
          dragging ? "cursor-grabbing" : "cursor-ns-resize",
        )}
      >
        {width > 0 && count > 0 ? (
          <svg
            aria-hidden
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 block"
          >
            <path d={area} fill="currentColor" fillOpacity={0.08} />
            <path
              d={trace}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={xAt(count - 1)}
              cy={yOf(last)}
              r={3}
              fill="currentColor"
            />
          </svg>
        ) : count === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">
            No prints yet.
          </span>
        ) : null}

        <motion.div
          aria-hidden
          style={{ y: lineY }}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-0 border-t border-dashed transition-colors",
            committed.crossed ? "border-signal" : "border-ink-3",
          )}
        />

        <motion.div
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-orientation="vertical"
          aria-valuemin={quantize(rangeMin)}
          aria-valuemax={quantize(rangeMax)}
          aria-valuenow={current}
          aria-valuetext={valueText}
          onKeyDown={handleKeyDown}
          style={{ y: motionSafe ? badgeY : lineY }}
          className={cn(
            "absolute top-0 right-1 -translate-y-1/2 rounded-full outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {/* Keyed by the crossing so each one mounts its own landing and
              ring; the slider itself stays put so focus survives the pulse. */}
          <motion.span
            key={generation}
            initial={
              generation === 0
                ? false
                : motionSafe
                  ? { scale: 1.25 }
                  : { opacity: 0.4 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.blink } }
                : { duration: durations.fast }
            }
            className={cn(
              "relative flex h-7 items-center gap-1 rounded-full border px-2.5 font-mono text-[11px] font-medium tabular-nums shadow-sm transition-colors",
              committed.crossed
                ? "border-signal bg-signal/15 text-signal"
                : "border-hairline-strong bg-popover text-popover-foreground",
            )}
          >
            {generation > 0 && motionSafe ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border border-signal"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.enter }}
              />
            ) : null}
            {/* Rotated on a span, not the svg: motion rewrites transform-origin
                on SVG nodes, and an HTML wrapper turns about its centre. */}
            <motion.span
              aria-hidden
              className="flex size-3 shrink-0 items-center justify-center"
              initial={false}
              animate={{ rotate: side === "above" ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <svg viewBox="0 0 12 12" className="size-2.5">
                <path d="M6 2.5 10 9H2Z" fill="currentColor" />
              </svg>
            </motion.span>
            <span>{format(current)}</span>
          </motion.span>
        </motion.div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <motion.span
          key={words}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.fast, ease: easings.enter }}
          className={cn(
            "min-w-0 truncate text-[11px]",
            committed.crossed ? "font-medium text-signal" : "text-ink-3",
          )}
        >
          {words}
        </motion.span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {format(rangeMin)} – {format(rangeMax)}
        </span>
      </div>

      <span aria-live="polite" className="sr-only">
        {committed.crossed
          ? `Crossed ${format(current)}, price now ${side}`
          : ""}
      </span>
    </div>
  );
}
