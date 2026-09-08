"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type YieldPoint = {
  /** Lock length in days. */
  days: number;
  /** Annual rate at that length, in percent. */
  apr: number;
};

export type YieldCurveProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The curve, ascending by days. Two points or more. */
  points: YieldPoint[];
  /** Controlled term, in days. */
  value?: number;
  /** Initial term for uncontrolled usage. @default the middle term */
  defaultValue?: number;
  /** Fires from the pointer or key that moved the marker. */
  onValueChange?: (days: number) => void;
  /** Principal; given it, the callout prints what the chosen term earns. */
  amount?: number;
  /** Formats the earnings figure. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => currency.format(value);

const VIEW_W = 300;
const VIEW_H = 140;
const PAD = { left: 10, right: 10, top: 16, bottom: 16 } as const;
/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;
/** How far the chosen node lifts off its own curve, in viewBox units. */
const LIFT = 3.5;

/**
 * Node and the browser can disagree in the last digits of a square root, and a
 * mismatched SVG attribute is a hydration error. Every coordinate is rounded
 * before it reaches the DOM.
 */
const r3 = (value: number) => Number(value.toFixed(3));

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

type Plotted = YieldPoint & { x: number; y: number };

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap`, on the same beat as
 * the marker travelling. Hidden from assistive technology because the slider
 * already speaks the term, the rate and the earnings in one sentence.
 */
function RollingFigure({
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
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.2em] items-center justify-center"
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
 * Catmull-Rom through every point, converted to cubics: the curve passes
 * through the real rates rather than easing past them, which a smoothing
 * spline that misses its own data would do.
 */
function curveThrough(points: Plotted[]): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(index - 1, 0)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(index + 2, points.length - 1)]!;
    path += ` C ${r3(p1.x + (p2.x - p0.x) / 6)} ${r3(p1.y + (p2.y - p0.y) / 6)} ${r3(p2.x - (p3.x - p1.x) / 6)} ${r3(p2.y - (p3.y - p1.y) / 6)} ${p2.x} ${p2.y}`;
  }
  return path;
}

/**
 * Rates plotted against lock length, with a marker you drag along them. The
 * curve is one Catmull-Rom path through the real terms that draws itself from
 * nothing with `pathLength` on `glide` — once, on mount, and never again, so
 * that afterwards the only thing moving is the marker. The term axis is
 * compressed by a square root because a ladder's short end is where the rates
 * change fastest; the labelled ends carry the real days.
 *
 * Dragging picks the nearest term and the marker travels to it on `snap` — one
 * crisp overshoot into the detent — with a hairline guide dropping to the axis
 * at the same beat. The chosen point lifts off its own curve and takes a halo,
 * and the callout above rolls its rate and glides horizontally to stay over its
 * node, clamped against measured widths so it can never leave the plot.
 *
 * The plot is a real `role="slider"`: arrows step a term, Page keys move two,
 * Home and End reach the shortest and longest. Pointer capture waits for 4px of
 * travel and is taken and released inside `try`/`catch`, so a plain press sets
 * the nearest term and a synthetic sweep cannot throw. Under reduced motion the
 * curve is already drawn, the marker jumps without travel or lift, and the rate
 * swaps in place — which term you are on is the information.
 */
export function YieldCurve({
  ref,
  points,
  value,
  defaultValue,
  onValueChange,
  amount,
  format = defaultFormat,
  label,
  className,
  "aria-label": ariaLabel,
}: YieldCurveProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const fillId = `${baseId}-fill`;

  const seed = defaultValue ?? points[Math.floor(points.length / 2)]?.days ?? 0;
  const [uncontrolled, setUncontrolled] = React.useState(seed);
  const isControlled = value !== undefined;
  const days = isControlled ? value : uncontrolled;

  const plotted = React.useMemo<Plotted[]>(() => {
    const ladder = points.length >= 2 ? points : [];
    if (ladder.length === 0) return [];
    const spanX = VIEW_W - PAD.left - PAD.right;
    const spanY = VIEW_H - PAD.top - PAD.bottom;
    const roots = ladder.map((point) => Math.sqrt(Math.max(0, point.days)));
    const lowX = roots[0]!;
    const highX = roots[roots.length - 1]!;
    const rates = ladder.map((point) => point.apr);
    const lowRate = Math.min(...rates);
    const highRate = Math.max(...rates);
    // A little headroom above and below keeps the curve off the frame's edge
    // without pretending the axis starts at zero.
    const pad = Math.max(0.2, (highRate - lowRate) * 0.18);
    const lo = lowRate - pad;
    const hi = highRate + pad;
    return ladder.map((point, index) => ({
      ...point,
      x: r3(
        PAD.left +
          (highX > lowX ? (roots[index]! - lowX) / (highX - lowX) : 0) * spanX,
      ),
      y: r3(VIEW_H - PAD.bottom - ((point.apr - lo) / (hi - lo || 1)) * spanY),
    }));
  }, [points]);

  const index = Math.max(
    0,
    plotted.findIndex((point) => point.days === days),
  );
  const last = plotted.length - 1;
  const chosen = plotted[index];

  const [dragging, setDragging] = React.useState(false);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);

  // Both widths are measured rather than assumed, so the callout is clamped to
  // the plot it belongs to instead of a hard-coded offset that a narrow card
  // would push past the edge.
  const plotRef = React.useRef<HTMLDivElement>(null);
  const calloutRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ plot: 0, callout: 0 });

  React.useEffect(() => {
    const plot = plotRef.current;
    const callout = calloutRef.current;
    if (!plot || !callout) return;
    const observer = new ResizeObserver(() => {
      setBox({
        plot: plot.getBoundingClientRect().width,
        callout: callout.getBoundingClientRect().width,
      });
    });
    observer.observe(plot);
    observer.observe(callout);
    return () => observer.disconnect();
  }, []);

  const commit = (nextIndex: number) => {
    const clamped = clamp(nextIndex, 0, last);
    const next = plotted[clamped];
    if (!next || next.days === days) return;
    if (!isControlled) setUncontrolled(next.days);
    onValueChange?.(next.days);
  };

  const nearestFromClientX = (clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return index;
    const units = ((clientX - rect.left) / rect.width) * VIEW_W;
    let best = 0;
    let bestGap = Infinity;
    plotted.forEach((point, position) => {
      const gap = Math.abs(point.x - units);
      if (gap < bestGap) {
        bestGap = gap;
        best = position;
      }
    });
    return best;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    event.currentTarget.focus();
    commit(nearestFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(nearestFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 2,
      PageDown: -2,
    };
    const move = moves[event.key];
    const next =
      move !== undefined
        ? index + move
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const earns =
    amount === undefined || !chosen
      ? null
      : (amount * chosen.apr * chosen.days) / (100 * 365);
  const rateText = chosen ? chosen.apr.toFixed(2) : "0.00";
  const spoken = chosen
    ? `${chosen.days} days, ${rateText} percent${earns === null ? "" : `, earns ${format(earns)}`}`
    : "";

  // A live region that changed on every frame of a drag would babble, so the
  // announcement holds at the last settled term and catches up on release.
  const [announced, setAnnounced] = React.useState(spoken);
  if (!dragging && announced !== spoken) setAnnounced(spoken);

  const move = motionSafe ? springs.snap : { duration: 0 };
  const baseline = VIEW_H - PAD.bottom;
  const linePath = curveThrough(plotted);
  const areaPath = linePath
    ? `${linePath} L ${plotted[last]!.x} ${baseline} L ${plotted[0]!.x} ${baseline} Z`
    : "";
  const markerX = chosen?.x ?? PAD.left;
  const markerY = chosen ? chosen.y - (motionSafe ? LIFT : 0) : baseline;
  const calloutX = clamp(
    (markerX / VIEW_W) * box.plot - box.callout / 2,
    0,
    Math.max(0, box.plot - box.callout),
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Rate by lock length
        </span>
      </div>

      <div ref={plotRef} className="relative w-full">
        <div className="flex">
          <motion.div
            ref={calloutRef}
            className="flex shrink-0 items-baseline gap-1.5 rounded-2 border border-hairline-strong bg-popover px-2 py-1 shadow-raised"
            initial={false}
            animate={{ x: calloutX }}
            // Before the first measurement the callout has nowhere true to be,
            // so its first placement lands rather than slides in from the edge.
            transition={box.plot === 0 ? { duration: 0 } : move}
          >
            <span className="font-mono text-[11px] font-medium text-foreground">
              <RollingFigure value={rateText} motionSafe={motionSafe} />%
            </span>
            <span className="font-mono text-[10px] text-ink-3">
              <RollingFigure
                value={String(chosen?.days ?? 0)}
                motionSafe={motionSafe}
              />
              d
            </span>
            {earns === null ? null : (
              <span className="font-mono text-[10px] text-cobalt-bright">
                <RollingFigure value={format(earns)} motionSafe={motionSafe} />
              </span>
            )}
          </motion.div>
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : (ariaLabel ?? "Lock length")}
          aria-valuemin={plotted[0]?.days ?? 0}
          aria-valuemax={plotted[last]?.days ?? 0}
          aria-valuenow={chosen?.days ?? 0}
          aria-valuetext={spoken}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onPointerLeave={(event) => {
            // A press that wanders off before it becomes a drag would otherwise
            // never see its own pointerup.
            if (gesture.current?.dragging === false) endGesture(event);
          }}
          onKeyDown={handleKeyDown}
          className="mt-1 w-full cursor-pointer touch-none rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            aria-hidden
            className="block w-full"
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>

            <line
              x1={PAD.left}
              y1={baseline}
              x2={VIEW_W - PAD.right}
              y2={baseline}
              stroke="currentColor"
              strokeWidth="1"
              className="text-hairline-strong"
            />

            <motion.path
              d={areaPath}
              fill={`url(#${fillId})`}
              className="text-cobalt-bright"
              initial={motionSafe ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.slow, ease: easings.enter }}
            />

            {/* The draw belongs to the mount only: after it, the curve is a
                fixed reading and the marker is the thing that moves. */}
            <motion.path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-cobalt-bright"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={springs.glide}
            />

            {/* The guide is moved by its own endpoints rather than a transform,
                so it stays a hairline at every width instead of being scaled
                with the viewBox. */}
            <motion.line
              y1={PAD.top}
              y2={baseline}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 3"
              className="text-ink-3"
              initial={false}
              animate={{ x1: markerX, x2: markerX }}
              transition={move}
            />

            {plotted.map((point, position) => (
              <circle
                key={point.days}
                cx={point.x}
                cy={point.y}
                r={2}
                fill="currentColor"
                className={cn(
                  "transition-opacity",
                  position === index ? "opacity-0" : "text-ink-3 opacity-100",
                )}
              />
            ))}

            <motion.circle
              r={9}
              fill="currentColor"
              className="text-cobalt-bright opacity-15"
              initial={false}
              animate={{ cx: markerX, cy: markerY }}
              transition={move}
            />
            <motion.circle
              r={4.5}
              stroke="currentColor"
              strokeWidth="2.5"
              className="fill-surface-0 text-cobalt-bright"
              initial={false}
              animate={{ cx: markerX, cy: markerY }}
              transition={move}
            />
          </svg>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums">
        <span>{plotted[0]?.days ?? 0} days</span>
        <span>{plotted[last]?.days ?? 0} days</span>
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
