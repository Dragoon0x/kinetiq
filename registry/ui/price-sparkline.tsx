"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One print: the clock time it landed and the price. */
export type SparkPricePoint = { time: string; price: number };

export type PriceSparklineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The day's prints, oldest first. Appending one extends the line. */
  points: SparkPricePoint[];
  /** Points across the full width; more than this slides the window. @default 48 */
  capacity?: number;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** Plot height in px. The width is fluid and measured. @default 96 */
  height?: number;
  /** The instrument; prints in the header and names the slider. @default "Price" */
  label?: string;
  /** Fires when the reading moves to a point, or returns to the latest (`null`). */
  onReadChange?: (point: SparkPricePoint | null, index: number | null) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same price, which is a
 * hydration mismatch on the one figure the readout exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** Plot insets: room for the dot, its halo and the arrival ring. */
const PAD_X = 8;
const PAD_Y = 12;
const DOT_R = 3;
const HALO_R = 7;
const RING_R = 14;

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
 * paint is honest without any layout read during render. The server renders
 * an empty plot; the observer fires once on observe and fills it in.
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

/**
 * A day in one line. The frame holds `capacity` points and the line grows
 * across it as prints arrive: each new point draws only the newest segment,
 * from the previous point to itself, with `pathLength` on `glide` — the points
 * before it hold still, so the line visibly extends rather than redrawing.
 * Once the day overfills the frame the window slides to the last `capacity`
 * points and the past swaps without ceremony. The last point is a dot that
 * travels to each new position on `glide`; a halo breathes behind it on a slow
 * reversing tween while the line waits, and each arrival mounts a ring, keyed
 * by the print count, that expands and fades on the enter ease.
 *
 * Hovering or dragging across the plot snaps a hairline to the nearest point
 * and the header reads that point's time and price; leaving returns the
 * reading to the latest print. The plot is a horizontal slider: Left and Right
 * walk one point, Home and End jump to the ends, Escape returns to the latest.
 * Under reduced motion the newest segment appears fully drawn, the dot swaps
 * position, and no halo or ring plays — the reading still follows the pointer
 * and the keys, because the reading is information.
 */
export function PriceSparkline({
  ref,
  points,
  capacity = 48,
  format = defaultFormat,
  height = 96,
  label = "Price",
  onReadChange,
  className,
}: PriceSparklineProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const width = useBoxWidth(plotRef);
  const readRef = useLatest(onReadChange);

  const slots = Math.max(2, Math.floor(capacity));
  const start = Math.max(0, points.length - slots);
  const shown = points.slice(start);
  const count = shown.length;
  const latest = shown[count - 1] ?? null;

  // The reading is a window index; a window that has since shrunk (a reset)
  // simply drops it rather than pointing past the end.
  const [read, setRead] = React.useState<number | null>(null);
  const readIndex = read !== null && read < count ? read : null;
  const reading = readIndex === null ? latest : (shown[readIndex] ?? latest);

  const moveRead = (next: number | null) => {
    const clamped =
      next === null ? null : Math.min(count - 1, Math.max(0, next));
    if (clamped === readIndex) return;
    setRead(clamped);
    readRef.current?.(
      clamped === null ? null : (shown[clamped] ?? null),
      clamped === null ? null : start + clamped,
    );
  };

  const innerW = Math.max(0, width - PAD_X * 2);
  const innerH = Math.max(0, height - PAD_Y * 2);
  const step = innerW / (slots - 1);
  let low = Infinity;
  let high = -Infinity;
  for (const point of shown) {
    if (point.price < low) low = point.price;
    if (point.price > high) high = point.price;
  }
  const span = high - low;
  const xAt = (index: number) => round3(PAD_X + index * step);
  const yAt = (price: number) =>
    round3(
      span === 0
        ? PAD_Y + innerH / 2
        : PAD_Y + (1 - (price - low) / span) * innerH,
    );

  const trail = shown
    .slice(0, Math.max(0, count - 1))
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xAt(index)} ${yAt(point.price)}`,
    )
    .join(" ");
  const previous = shown[count - 2];
  const lead =
    latest && previous
      ? `M${xAt(count - 2)} ${yAt(previous.price)} L${xAt(count - 1)} ${yAt(latest.price)}`
      : "";
  const area =
    trail && latest
      ? `${trail} L${xAt(count - 1)} ${yAt(latest.price)} L${xAt(count - 1)} ${round3(height - PAD_Y)} L${PAD_X} ${round3(height - PAD_Y)} Z`
      : "";
  const dotX = latest ? xAt(count - 1) : PAD_X;
  const dotY = latest ? yAt(latest.price) : round3(height / 2);
  const readX = readIndex === null ? null : xAt(readIndex);
  const readY = readIndex === null || !reading ? null : yAt(reading.price);

  const indexFromClientX = (clientX: number): number | null => {
    const node = plotRef.current;
    if (!node || count === 0 || innerW <= 0) return null;
    const x = clientX - node.getBoundingClientRect().left - PAD_X;
    return Math.round(x / step);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (count === 0) return;
    const from = readIndex ?? count - 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        moveRead(from - 1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        moveRead(from + 1);
        break;
      case "Home":
        event.preventDefault();
        moveRead(0);
        break;
      case "End":
        event.preventDefault();
        moveRead(count - 1);
        break;
      case "Escape":
        event.preventDefault();
        moveRead(null);
        break;
      default:
        break;
    }
  };

  // Announced from a timer, not the render: a fast tape would otherwise
  // interrupt a screen reader on every print.
  const sentence = latest
    ? `${label} ${format(latest.price)} at ${latest.time}`
    : `${label}, no prints yet`;
  const [announced, setAnnounced] = React.useState(sentence);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(sentence), 400);
    return () => window.clearTimeout(timer);
  }, [sentence]);

  const valueText = reading
    ? `${reading.time}, ${format(reading.price)}`
    : "No prints yet";
  const isReading = readIndex !== null;

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
        {/* The slider already speaks the value; the readout stays out of the
            accessibility tree rather than repeating it in a second voice. */}
        <span
          aria-hidden
          className="flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums"
        >
          <motion.span
            key={`${isReading ? "read" : "last"}-${reading?.time ?? ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className={cn(
              "text-[11px] transition-colors",
              isReading ? "text-cobalt-bright" : "text-ink-3",
            )}
          >
            {reading?.time ?? "--:--"}
          </motion.span>
          <span className="font-medium text-ink">
            {reading ? format(reading.price) : "—"}
          </span>
        </span>
      </div>

      <div
        ref={plotRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={readIndex ?? Math.max(0, count - 1)}
        aria-valuetext={valueText}
        aria-disabled={count === 0 || undefined}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => moveRead(indexFromClientX(event.clientX))}
        onPointerMove={(event) => moveRead(indexFromClientX(event.clientX))}
        onPointerLeave={() => moveRead(null)}
        onPointerCancel={() => moveRead(null)}
        style={{ height }}
        className={cn(
          "relative w-full cursor-crosshair touch-none rounded-2 text-cobalt-bright outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {width > 0 && count > 0 ? (
          <svg
            aria-hidden
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 block overflow-visible"
          >
            {area ? (
              <path d={area} fill="currentColor" fillOpacity={0.08} />
            ) : null}
            {trail ? (
              <path
                d={trail}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {/* Keyed by the print count so each arrival mounts a fresh segment
                and draws it; the points before it never redraw. */}
            {lead ? (
              <motion.path
                key={`lead-${points.length}`}
                d={lead}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                pathLength={1}
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            ) : null}

            {readX !== null && readY !== null ? (
              <g>
                <line
                  x1={readX}
                  x2={readX}
                  y1={0}
                  y2={height}
                  className="stroke-hairline-strong"
                  strokeWidth={1}
                />
                <circle
                  cx={readX}
                  cy={readY}
                  r={DOT_R}
                  className="fill-surface-1"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              </g>
            ) : null}

            {/* The halo mounts once at the dot and breathes from there: the
                reversing tween is the pulse, and the position glides
                separately so a new print never restarts the breath. */}
            {motionSafe ? (
              <motion.circle
                r={HALO_R}
                fill="currentColor"
                initial={{ cx: dotX, cy: dotY, opacity: 0.1 }}
                animate={{ cx: dotX, cy: dotY, opacity: 0.35 }}
                transition={{
                  cx: springs.glide,
                  cy: springs.glide,
                  opacity: {
                    duration: 1.2,
                    ease: easings.move,
                    repeat: Infinity,
                    repeatType: "reverse",
                  },
                }}
              />
            ) : null}
            {motionSafe ? (
              <motion.circle
                key={`ring-${points.length}`}
                cx={dotX}
                cy={dotY}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                initial={{ r: DOT_R, opacity: 0.7 }}
                animate={{ r: RING_R, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.enter }}
              />
            ) : null}
            <motion.circle
              r={DOT_R}
              fill="currentColor"
              initial={false}
              animate={{ cx: dotX, cy: dotY }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </svg>
        ) : count === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">
            No prints yet.
          </span>
        ) : null}
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>{shown[0]?.time ?? ""}</span>
        <span>
          {count} / {slots}
        </span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
