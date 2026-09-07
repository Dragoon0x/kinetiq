"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One sample on the series. */
export type CrosshairPoint = {
  label: string;
  value: number;
};

export type CrosshairChartProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The series, left to right. */
  points: CrosshairPoint[];
  /** Formats every number the chart says out loud, rolling readout included. */
  format?: (value: number) => string;
  /** Plot height in px. The width is fluid and measured. @default 200 */
  height?: number;
  /** Series name — the accessible name and the readout's caption. */
  label?: string;
  /** Trace colour. Any CSS colour; defaults to the signal token. */
  color?: string;
  /** Fires with the index under the crosshair, or null when it clears. */
  onActiveChange?: (index: number | null) => void;
  className?: string;
};

/** Plot insets: room for the trace's cap, the dot, and the crosshair. */
const PAD = { top: 14, right: 8, bottom: 12, left: 8 } as const;
/** Pointer travel before a press becomes a scrub, so taps still register. */
const DRAG_SLOP = 4;
/** Gap between the dot and the readout box. */
const READOUT_GAP = 12;

const defaultFormat = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

/**
 * Pointer capture throws when the id is not an active pointer, which is
 * exactly what a synthetic sweep produces. The gesture works without it.
 */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointers have no capture target; scrubbing continues.
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

/**
 * Border-box size of a node, measured in the observer callback so the first
 * paint is honest without any layout read during render.
 */
function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * A line chart you read with your hand. The trace draws itself on mount —
 * `pathLength` 0→1 on `glide`, the spring for a shape arriving — while the
 * area beneath it fades in a beat later, so the line leads and the fill
 * follows. Moving a pointer across the plot snaps a crosshair to the nearest
 * sample and the dot rides the line on `flick`: at ζ0.99 it lands where you
 * pointed without a wobble, because a crosshair that overshoots lies about
 * where the data is. The readout rolls its digits on the same spring from a
 * motion value, so no re-render and no reflow follows the pointer.
 *
 * The plot is a `slider`: Left and Right step one sample, Home and End jump to
 * the ends, Escape clears the crosshair, and `aria-valuetext` speaks the point
 * under it. Every reading is also listed for assistive technology, so the
 * chart means something with no pointer at all. Under reduced motion the trace
 * is painted whole and the dot jumps between samples — the reading still
 * changes, because the reading is the information.
 */
export function CrosshairChart({
  ref,
  points,
  format = defaultFormat,
  height = 200,
  label,
  color = "var(--signal, var(--primary))",
  onActiveChange,
  className,
}: CrosshairChartProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const fillId = `${uid}-fill`;

  const plateRef = React.useRef<HTMLDivElement>(null);
  const readoutRef = React.useRef<HTMLDivElement>(null);
  const { width } = useBoxSize(plateRef);
  const readoutBox = useBoxSize(readoutRef);

  const count = points.length;

  const extent = React.useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }
    return count === 0 ? { min: 0, max: 0 } : { min, max };
  }, [points, count]);

  /** Sample positions in real px — the viewBox is 1:1, so nothing distorts. */
  const plotted = React.useMemo(() => {
    if (count === 0 || width === 0) return [];
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = Math.max(height - PAD.top - PAD.bottom, 1);
    const span = extent.max - extent.min;
    return points.map((point, index) => {
      const cx =
        count === 1 ? width / 2 : PAD.left + (index / (count - 1)) * innerW;
      // A flat series sits on the midline rather than collapsing to an edge.
      const ratio = span === 0 ? 0.5 : (point.value - extent.min) / span;
      return { cx, cy: PAD.top + (1 - ratio) * innerH };
    });
  }, [points, count, width, height, extent]);

  const linePath = React.useMemo(
    () =>
      plotted
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`,
        )
        .join(" "),
    [plotted],
  );

  const areaPath = React.useMemo(() => {
    const first = plotted[0];
    const last = plotted[plotted.length - 1];
    if (!first || !last || plotted.length < 2) return "";
    const base = height - PAD.bottom;
    return `${linePath} L${last.cx.toFixed(2)} ${base} L${first.cx.toFixed(2)} ${base} Z`;
  }, [plotted, linePath, height]);

  const [active, setActive] = React.useState<number | null>(null);
  /** The point the readout is parked over, kept after the crosshair clears. */
  const [anchor, setAnchor] = React.useState(0);
  /** True while the readout is (re)appearing, so it arrives without sliding. */
  const [reopened, setReopened] = React.useState(true);
  // The parent hears about the change from the handler that caused it —
  // never from inside an updater, which React may run twice or during render.
  const activeRef = React.useRef<number | null>(null);
  const changeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    changeRef.current = onActiveChange;
  }, [onActiveChange]);

  const setActiveIndex = React.useCallback((next: number | null) => {
    const previous = activeRef.current;
    if (previous === next) return;
    activeRef.current = next;
    setActive(next);
    if (next !== null) {
      setAnchor(next);
      setReopened(previous === null);
    }
    changeRef.current?.(next);
  }, []);

  const activePoint = active === null ? undefined : points[active];
  const activePlot = active === null ? undefined : plotted[active];

  /** The readout's digits ride a motion value, so they roll without a render. */
  const valueMv = useMotionValue(points[0]?.value ?? 0);
  const rolled = useTransform(valueMv, (value) => format(value));

  React.useEffect(() => {
    const target = activePoint?.value;
    if (target === undefined) return;
    if (!motionSafe) {
      valueMv.set(target);
      return;
    }
    const controls = animate(valueMv, target, springs.flick);
    return () => controls.stop();
  }, [activePoint, motionSafe, valueMv]);

  const dragRef = React.useRef<{ pointerId: number; startX: number } | null>(
    null,
  );

  const indexFromClientX = (clientX: number): number | null => {
    const node = plateRef.current;
    if (!node || plotted.length === 0) return null;
    const x = clientX - node.getBoundingClientRect().left;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < plotted.length; i += 1) {
      const distance = Math.abs((plotted[i]?.cx ?? 0) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const from = active ?? count - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(count - 1, from + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, from - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        if (active === null) return;
        event.preventDefault();
        setActiveIndex(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setActiveIndex(next);
  };

  const handleFocus = () => {
    if (activeRef.current === null && count > 0) setActiveIndex(count - 1);
  };

  const scrubTo = (clientX: number) => {
    const index = indexFromClientX(clientX);
    if (index !== null) setActiveIndex(index);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || count === 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    scrubTo(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    // Captured only once the press has become a drag; capturing on
    // pointerdown swallows the click that a tap is made of.
    if (
      held &&
      held.pointerId === event.pointerId &&
      Math.abs(event.clientX - held.startX) > DRAG_SLOP
    ) {
      capturePointer(event.currentTarget, event.pointerId);
    }
    scrubTo(event.clientX);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
  };

  const handlePointerLeave = () => {
    // A held drag keeps the crosshair; a bare hover gives it up.
    if (!dragRef.current) setActiveIndex(null);
  };

  const valueText = activePoint
    ? `${activePoint.label}, ${format(activePoint.value)}`
    : undefined;

  const summary =
    count === 0
      ? `${label ?? "Series"}: no data`
      : `${label ?? "Series"}: ${count} points, ${format(extent.min)} to ${format(extent.max)}`;

  // The readout is clamped inside the plot's own box: it slides with the dot
  // horizontally, and flips below when the point sits high, so it never
  // leaves the chart and never pushes a pixel of layout.
  const anchorPlot = plotted[anchor];
  const half = readoutBox.width / 2;
  const readoutX = !anchorPlot
    ? 0
    : width <= readoutBox.width
      ? width / 2
      : Math.min(Math.max(anchorPlot.cx, half + 2), width - half - 2);
  // A point sitting high wears its readout below, so the box stays on-canvas.
  const readoutY = !anchorPlot
    ? 0
    : anchorPlot.cy < height * 0.45
      ? Math.min(anchorPlot.cy + READOUT_GAP, height - readoutBox.height - 2)
      : Math.max(anchorPlot.cy - readoutBox.height - READOUT_GAP, 2);

  const dotTransition = motionSafe ? springs.flick : { duration: 0 };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(count - 1, 0)}
        aria-valuenow={active ?? 0}
        aria-valuetext={valueText ?? summary}
        aria-disabled={count === 0 || undefined}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => setActiveIndex(null)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "relative w-full rounded-3 border border-hairline bg-surface-1 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
        // pan-y keeps the page scrollable through the plot while horizontal
        // travel belongs to the crosshair.
        style={{ height, touchAction: "pan-y" }}
      >
        <div ref={plateRef} className="absolute inset-0">
          {width > 0 && count > 0 ? (
            <svg
              aria-hidden
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              className="block overflow-visible"
            >
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((ratio) => {
                const y = PAD.top + ratio * (height - PAD.top - PAD.bottom);
                return (
                  <line
                    key={ratio}
                    x1={0}
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke="var(--hairline)"
                    strokeWidth={1}
                  />
                );
              })}

              {areaPath ? (
                <motion.path
                  d={areaPath}
                  fill={`url(#${fillId})`}
                  initial={motionSafe ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.slow,
                          ease: easings.enter,
                          delay: durations.fast,
                        }
                      : { duration: 0 }
                  }
                />
              ) : null}

              <motion.path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />

              {activePlot ? (
                <g>
                  <motion.line
                    initial={false}
                    animate={{ x1: activePlot.cx, x2: activePlot.cx }}
                    transition={dotTransition}
                    y1={PAD.top - 6}
                    y2={height - PAD.bottom}
                    stroke={color}
                    strokeWidth={1}
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                  />
                  <motion.circle
                    initial={false}
                    animate={{ cx: activePlot.cx, cy: activePlot.cy }}
                    transition={dotTransition}
                    r={4}
                    fill={color}
                    stroke="var(--color-surface-1, var(--card))"
                    strokeWidth={2}
                  />
                </g>
              ) : null}
            </svg>
          ) : null}

          {/* Absolutely placed inside the plot, so a rolling number can never
              nudge the page. Kept mounted to hold its measured size. */}
          <motion.div
            ref={readoutRef}
            aria-hidden
            initial={false}
            animate={{
              x: readoutX - half,
              y: readoutY,
              opacity: activePlot ? 1 : 0,
            }}
            // Travelling between points rides the dot's own spring; arriving
            // from nowhere jumps, so the box never slides in from the last
            // place the pointer left it.
            transition={
              motionSafe && !reopened
                ? { ...springs.flick, opacity: { duration: durations.fast } }
                : { duration: 0, opacity: { duration: durations.fast } }
            }
            className="pointer-events-none absolute top-0 left-0 rounded-2 border border-hairline bg-popover px-2 py-1 shadow-raised"
          >
            <div className="text-[10px] leading-none tracking-[0.08em] text-ink-3 uppercase">
              {activePoint?.label ?? label ?? ""}
            </div>
            <motion.div className="mt-1 font-mono text-xs leading-none font-medium text-foreground tabular-nums">
              {rolled}
            </motion.div>
          </motion.div>
        </div>

        {count === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            No data
          </div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span className="truncate">{points[0]?.label ?? ""}</span>
        <span className="truncate">{points[count - 1]?.label ?? ""}</span>
      </div>

      {/* Every reading, spelled out — the chart is legible with no pointer. */}
      <ul className="sr-only">
        <li>{summary}</li>
        {points.map((point, index) => (
          <li key={`${index}-${point.label}`}>
            {point.label}: {format(point.value)}
          </li>
        ))}
      </ul>
      <span role="status" aria-live="polite" className="sr-only">
        {valueText ?? ""}
      </span>
    </div>
  );
}
