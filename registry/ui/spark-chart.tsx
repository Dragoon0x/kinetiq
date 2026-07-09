"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** A single sample. Bare-number series get an index for their x label. */
export type SparkPoint = { x: number | string; y: number };

export type SparkChartProps = {
  /** The series. Bare numbers are plotted evenly with index x-labels. */
  data: number[] | SparkPoint[];
  variant?: "line" | "area";
  /** Plotted height in px. The width is fluid; the viewBox is fixed. */
  height?: number;
  /** Formats the y value in the tooltip and the live readout. */
  format?: (y: number) => string;
  /** Accessible name and the subject of the sr-only summary sentence. */
  label?: string;
  className?: string;
};

/** Fixed viewBox width — the SVG scales to its container via `w-full`. */
const VIEW_W = 320;
/** Breathing room above/below the trace so peaks and the dot never clip. */
const PAD_Y = 8;
/** Inset so the first/last points and the edge crosshair stay on-canvas. */
const PAD_X = 4;
/** Pointer travel (px) before a press counts as a scrub — protects taps. */
const DRAG_THRESHOLD = 3;

type Normalized = { x: number | string; y: number };

/** Coordinates in viewBox space, carried alongside the source sample. */
type PlotPoint = { cx: number; cy: number; point: Normalized };

const isPointArray = (data: number[] | SparkPoint[]): data is SparkPoint[] =>
  typeof data[0] === "object";

/**
 * A compact self-drawing line/area chart with a scrubbable crosshair. The
 * trace draws itself on mount — the path animates `pathLength` 0→1 over
 * `durations.page` with `easings.enter`, and the area variant fades its
 * gradient fill in alongside it. Hovering, dragging, or arrow-keying moves a
 * crosshair that snaps to the nearest sample by x and pins a tooltip that
 * flips sides near the edges so it never clips.
 *
 * Reduced motion: the trace renders fully drawn on first paint (no self-draw)
 * while the crosshair stays fully interactive — direct manipulation is never
 * animated away. An always-present sr-only summary makes the chart meaningful
 * without any interaction, and ArrowLeft/Right/Home/End drive an
 * `aria-valuetext` readout for keyboard and screen-reader users.
 */
export function SparkChart({
  data,
  variant = "line",
  height = 120,
  format = String,
  label,
  className,
}: SparkChartProps) {
  const motionSafe = useMotionSafe();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const uid = React.useId();
  const gradientId = `${uid}-fill`;

  // Normalize to a stable {x, y}[]; bare numbers take their index as x.
  const points = React.useMemo<Normalized[]>(() => {
    if (data.length === 0) return [];
    return isPointArray(data)
      ? data.map((p) => ({ x: p.x, y: p.y }))
      : data.map((y, i) => ({ x: i, y }));
  }, [data]);

  const count = points.length;

  // y-extent drives the vertical scale; a flat series renders mid-canvas.
  const { min, max } = React.useMemo(() => {
    if (count === 0) return { min: 0, max: 0 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    return { min: lo, max: hi };
  }, [points, count]);

  // Map every sample into viewBox coordinates once per data change.
  const plotted = React.useMemo<PlotPoint[]>(() => {
    if (count === 0) return [];
    const innerW = VIEW_W - PAD_X * 2;
    const innerH = height - PAD_Y * 2;
    const span = max - min;
    return points.map((point, i) => {
      const cx = count === 1 ? VIEW_W / 2 : PAD_X + (i / (count - 1)) * innerW;
      // Flat series (span 0) sit on the vertical midline.
      const ratio = span === 0 ? 0.5 : (point.y - min) / span;
      const cy = height - PAD_Y - ratio * innerH;
      return { cx, cy, point };
    });
  }, [points, count, min, max, height]);

  const linePath = React.useMemo(() => {
    if (plotted.length === 0) return "";
    return plotted
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`)
      .join(" ");
  }, [plotted]);

  // Close the fill down to the baseline and back for the area variant.
  const areaPath = React.useMemo(() => {
    if (plotted.length < 2) return "";
    const first = plotted[0];
    const last = plotted[plotted.length - 1];
    if (!first || !last) return "";
    const base = height - PAD_Y;
    return `${linePath} L${last.cx.toFixed(2)} ${base.toFixed(2)} L${first.cx.toFixed(2)} ${base.toFixed(2)} Z`;
  }, [plotted, linePath, height]);

  // Active sample under the crosshair; null means hidden.
  const [active, setActive] = React.useState<number | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    engaged: boolean;
  } | null>(null);

  // Map a clientX to the nearest sample index using the SVG's own box.
  const indexFromClientX = React.useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg || count === 0) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null;
      // clientX → viewBox x, then find the nearest plotted cx.
      const vbX = ((clientX - rect.left) / rect.width) * VIEW_W;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < plotted.length; i++) {
        const p = plotted[i];
        if (!p) continue;
        const dist = Math.abs(p.cx - vbX);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    },
    [plotted, count],
  );

  const activePoint = active !== null ? plotted[active] : undefined;

  const xLabelOf = (p: Normalized): string => String(p.x);

  const valueText =
    activePoint !== undefined
      ? `${xLabelOf(activePoint.point)}: ${format(activePoint.point.y)}`
      : undefined;

  const summary =
    count === 0
      ? `${label ?? "Chart"}: no data`
      : `${label ?? "Chart"}: ${count} point${count === 1 ? "" : "s"}, from ${format(min)} to ${format(max)}`;

  if (count === 0) {
    return (
      <div
        className={cn(
          "bg-surface-1 border-hairline text-muted-foreground grid place-items-center rounded-2 border text-xs",
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={summary}
      >
        <span className="sr-only">{summary}</span>
      </div>
    );
  }

  const drawTransition = { duration: durations.page, ease: easings.enter };

  // Tooltip flips to the left of the point once it passes the midline, so it
  // never runs off the right edge; anchor via a right-aligned transform.
  const tooltipFlipped = activePoint ? activePoint.cx > VIEW_W * 0.62 : false;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={active ?? 0}
        aria-valuetext={valueText}
        aria-orientation="horizontal"
        onKeyDown={(event) => {
          let next: number | null = null;
          switch (event.key) {
            case "ArrowRight":
            case "ArrowUp":
              next = Math.min(count - 1, (active ?? -1) + 1);
              break;
            case "ArrowLeft":
            case "ArrowDown":
              next = Math.max(0, (active ?? count) - 1);
              break;
            case "Home":
              next = 0;
              break;
            case "End":
              next = count - 1;
              break;
            case "Escape":
              if (active !== null) {
                event.preventDefault();
                setActive(null);
              }
              return;
            default:
              return;
          }
          event.preventDefault();
          setActive(next);
        }}
        onBlur={() => setActive(null)}
        className="relative w-full rounded-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          // Fixed pixel height, fluid width: with preserveAspectRatio="none"
          // the trace stretches to fill. An explicit height avoids the
          // viewBox aspect ratio collapsing the width in an auto-sized flow.
          style={{ height }}
          className="block w-full touch-none overflow-visible select-none"
          aria-hidden
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              engaged: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            const i = indexFromClientX(event.clientX);
            if (i !== null) setActive(i);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (drag && event.pointerId === drag.pointerId && !drag.engaged) {
              if (Math.abs(event.clientX - drag.startX) >= DRAG_THRESHOLD) {
                drag.engaged = true;
              }
            }
            const i = indexFromClientX(event.clientX);
            if (i !== null) setActive(i);
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            if (drag && event.pointerId === drag.pointerId) dragRef.current = null;
          }}
          onPointerCancel={(event) => {
            const drag = dragRef.current;
            if (drag && event.pointerId === drag.pointerId) dragRef.current = null;
            setActive(null);
          }}
          onPointerLeave={() => {
            // A captured drag keeps the crosshair; a bare hover releases it.
            if (!dragRef.current) setActive(null);
          }}
        >
          {variant === "area" && areaPath && (
            <>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--signal, var(--primary))"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--signal, var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <motion.path
                d={areaPath}
                fill={`url(#${gradientId})`}
                stroke="none"
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={
                  motionSafe
                    ? { duration: durations.slow, ease: easings.enter, delay: durations.page * 0.35 }
                    : { duration: 0 }
                }
              />
            </>
          )}

          {/* The self-drawing trace. pathLength drives the reveal so stroke
              width and joins are untouched; reduced motion paints it whole. */}
          <motion.path
            d={linePath}
            fill="none"
            stroke="var(--signal, var(--primary))"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? drawTransition : { duration: 0 }}
          />

          {/* Crosshair + highlighted sample. Snapping is instant — direct
              manipulation should track the pointer without lag. */}
          {activePoint && (
            <g aria-hidden>
              <line
                x1={activePoint.cx}
                y1={0}
                x2={activePoint.cx}
                y2={height}
                stroke="var(--signal, var(--primary))"
                strokeWidth={1}
                strokeOpacity={0.5}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={activePoint.cx}
                cy={activePoint.cy}
                r={3.5}
                fill="var(--signal, var(--primary))"
                stroke="var(--surface-1, var(--card))"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {/* Tooltip lives in the DOM (not the SVG) so text never stretches with
            preserveAspectRatio="none". It is positioned in percentages of the
            plate and flips side past the midline to stay on-canvas. */}
        {activePoint && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 -translate-y-full"
            style={{
              left: `${(activePoint.cx / VIEW_W) * 100}%`,
              top: `${(activePoint.cy / height) * 100}%`,
              transform: `translate(${tooltipFlipped ? "calc(-100% - 8px)" : "8px"}, calc(-100% - 6px))`,
            }}
          >
            <div className="bg-surface-1 border-hairline rounded-1 border px-2 py-1 shadow-raised">
              <div className="text-label text-ink-3 leading-none">
                {xLabelOf(activePoint.point)}
              </div>
              <div className="text-foreground mt-0.5 font-mono text-xs leading-none tabular-nums">
                {format(activePoint.point.y)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Always meaningful without interaction; the live value rides here too. */}
      <span role="status" aria-live="polite" className="sr-only">
        {valueText ?? summary}
      </span>
    </div>
  );
}
