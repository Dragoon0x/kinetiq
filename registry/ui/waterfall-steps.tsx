"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WaterfallStep = {
  label: string;
  delta: number;
};

export type WaterfallStepsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered changes between the opening and closing totals. */
  steps: WaterfallStep[];
  /** Opening value the first step builds on. */
  start: number;
  /** Formats every number: the readout, the labels and the aria text. */
  format?: (value: number) => string;
  /** Plot height in px. The width is fluid and measured. @default 200 */
  height?: number;
  /** Chart name; also the caption above the plot. */
  label?: string;
  /** Column name for the opening total. @default "Opening" */
  startLabel?: string;
  /** Column name for the closing total. @default "Closing" */
  totalLabel?: string;
  /** Fires with the column index under the pointer or focus, or null. */
  onActiveChange?: (index: number | null) => void;
  className?: string;
};

/** Headroom for the closing bar's recoil overshoot and the connectors. */
const PAD = { top: 18, bottom: 6 } as const;
/** Share of a column the bar occupies, and its ceiling in px. */
const BAR_RATIO = 0.58;
const BAR_MAX = 36;
/** A zero step still draws a hairline, so it is visible as a step. */
const MIN_BAR = 2;
const READOUT_GAP = 8;

const defaultFormat = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

type BarKind = "total" | "up" | "down";

type Bar = {
  key: string;
  label: string;
  kind: BarKind;
  /** Value the bar grows from — the running total before this step. */
  from: number;
  /** Value the bar grows to. */
  to: number;
  /** Signed change, or the whole value for the opening and closing totals. */
  delta: number;
  running: number;
};

const COLOR: Record<BarKind, string> = {
  total: "var(--accent-bright)",
  up: "var(--success)",
  down: "var(--danger)",
};

/** Border-box size of a node, measured in the observer rather than in render. */
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
 * A cash bridge that builds itself. Every bar starts where the last one ended:
 * each rect grows from the running total in `cascade()` order on `glide`, so
 * the eye follows one continuous accumulation instead of five bars appearing
 * at once. Rises are drawn in success, falls in danger, and a hairline
 * connector draws between them on `flick` to carry the running total across
 * the gap. The closing bar lands on `recoil` — ζ0.53, two visible bounces —
 * because the total is the arrival the whole chart was building toward.
 *
 * The columns are a list of buttons: hover or focus reads a step's delta and
 * running total in a readout pinned inside the plot, Left and Right walk the
 * columns, Home and End jump to the opening and closing totals, and every
 * reading carries an `aria-label`. Under reduced motion the bars appear in
 * place and the connectors are already drawn.
 */
export function WaterfallSteps({
  ref,
  steps,
  start,
  format = defaultFormat,
  height = 200,
  label,
  startLabel = "Opening",
  totalLabel = "Closing",
  onActiveChange,
  className,
}: WaterfallStepsProps) {
  const motionSafe = useMotionSafe();
  const plateRef = React.useRef<HTMLDivElement>(null);
  const readoutRef = React.useRef<HTMLDivElement>(null);
  const { width } = useBoxSize(plateRef);
  const readoutBox = useBoxSize(readoutRef);

  const bars = React.useMemo<Bar[]>(() => {
    const list: Bar[] = [
      {
        key: "start",
        label: startLabel,
        kind: "total",
        from: 0,
        to: start,
        delta: start,
        running: start,
      },
    ];
    let running = start;
    steps.forEach((step, index) => {
      const from = running;
      running += step.delta;
      list.push({
        key: `step-${index}`,
        label: step.label,
        kind: step.delta < 0 ? "down" : "up",
        from,
        to: running,
        delta: step.delta,
        running,
      });
    });
    list.push({
      key: "total",
      label: totalLabel,
      kind: "total",
      from: 0,
      to: running,
      delta: running,
      running,
    });
    return list;
  }, [steps, start, startLabel, totalLabel]);

  const domain = React.useMemo(() => {
    let min = 0;
    let max = 0;
    for (const bar of bars) {
      min = Math.min(min, bar.to);
      max = Math.max(max, bar.to);
    }
    const span = max - min || 1;
    // Headroom above the tallest bar leaves the recoil overshoot somewhere
    // to go without clipping against the plot's edge.
    return { min, max: max + span * 0.08 };
  }, [bars]);

  const count = bars.length;
  const colW = count > 0 ? width / count : 0;
  const barW = Math.min(colW * BAR_RATIO, BAR_MAX);
  const innerH = Math.max(height - PAD.top - PAD.bottom, 1);
  const yFor = (value: number) =>
    PAD.top +
    (1 - (value - domain.min) / (domain.max - domain.min || 1)) * innerH;

  const geometry = bars.map((bar, index) => {
    const top = yFor(Math.max(bar.from, bar.to));
    const bottom = yFor(Math.min(bar.from, bar.to));
    const barHeight = Math.max(bottom - top, MIN_BAR);
    return {
      bar,
      x: index * colW + (colW - barW) / 2,
      y: top,
      barHeight,
      /** Where the growth begins: the edge sitting on the running total. */
      originY: bar.to >= bar.from ? bottom : top,
    };
  });

  const [active, setActive] = React.useState<number | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  /** The column the readout is parked over, kept after the pointer leaves. */
  const [anchor, setAnchor] = React.useState(0);
  /** True while the readout is (re)appearing, so it arrives without sliding. */
  const [reopened, setReopened] = React.useState(true);
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

  const activeBar = active === null ? undefined : bars[active];

  /** Both figures ride motion values, so the readout rolls without a render. */
  const deltaMv = useMotionValue(Math.abs(bars[0]?.delta ?? 0));
  const runningMv = useMotionValue(bars[0]?.running ?? 0);
  const deltaText = useTransform(deltaMv, (value) => format(value));
  const runningText = useTransform(runningMv, (value) => format(value));

  React.useEffect(() => {
    if (!activeBar) return;
    const nextDelta = Math.abs(activeBar.delta);
    const nextRunning = activeBar.running;
    if (!motionSafe) {
      deltaMv.set(nextDelta);
      runningMv.set(nextRunning);
      return;
    }
    const a = animate(deltaMv, nextDelta, springs.flick);
    const b = animate(runningMv, nextRunning, springs.flick);
    return () => {
      a.stop();
      b.stop();
    };
  }, [activeBar, motionSafe, deltaMv, runningMv]);

  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const focusAt = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(count - 1);
        break;
      default:
        break;
    }
  };

  const readingOf = (bar: Bar): string =>
    bar.kind === "total"
      ? `${bar.label}, ${format(bar.to)}`
      : `${bar.label}, ${bar.delta < 0 ? "down" : "up"} ${format(Math.abs(bar.delta))}, running total ${format(bar.running)}`;

  // Pinned inside the plot and clamped to it, so a rolling number can never
  // push the page around or slip past the chart's own edge.
  const anchorGeometry = geometry[anchor];
  const half = readoutBox.width / 2;
  const anchorX = anchorGeometry ? anchorGeometry.x + barW / 2 : 0;
  const readoutX =
    width <= readoutBox.width
      ? width / 2
      : Math.min(Math.max(anchorX, half + 2), width - half - 2);
  const readoutY = anchorGeometry
    ? Math.min(
        Math.max(anchorGeometry.y - readoutBox.height - READOUT_GAP, 2),
        Math.max(height - readoutBox.height - 2, 2),
      )
    : 0;

  const step = cascade(count);
  const sign =
    activeBar && activeBar.kind !== "total"
      ? activeBar.delta < 0
        ? "−"
        : "+"
      : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {label}
          </span>
          <span className="font-mono text-xs font-medium text-foreground tabular-nums">
            {format(bars[count - 1]?.to ?? 0)}
          </span>
        </div>
      ) : null}

      <div
        ref={plateRef}
        className="relative w-full rounded-3 border border-hairline bg-surface-1"
        style={{ height }}
      >
        {width > 0 ? (
          <svg
            aria-hidden
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block overflow-visible"
          >
            <line
              x1={0}
              x2={width}
              y1={yFor(0)}
              y2={yFor(0)}
              stroke="var(--hairline-strong)"
              strokeWidth={1}
            />

            {geometry.map(({ bar, x, y, barHeight, originY }, index) => {
              const isLast = index === count - 1;
              const lit = active === index;
              return (
                <g key={bar.key}>
                  {motionSafe ? (
                    // y and height carry the growth, not scaleY: no
                    // transform-origin rewrite to fight, and the corner radii
                    // never stretch. The lit state keeps its own tween, so
                    // hovering answers at once however late the bar arrives.
                    <motion.rect
                      key="grow"
                      x={x}
                      width={barW}
                      rx={2}
                      fill={COLOR[bar.kind]}
                      initial={{ attrY: originY, height: 0 }}
                      animate={{
                        attrY: y,
                        height: barHeight,
                        fillOpacity: lit ? 1 : 0.82,
                      }}
                      transition={{
                        ...(isLast ? springs.recoil : springs.glide),
                        delay: index * step,
                        fillOpacity: { duration: durations.fast },
                      }}
                    />
                  ) : (
                    <motion.rect
                      key="static"
                      x={x}
                      y={y}
                      width={barW}
                      height={barHeight}
                      rx={2}
                      fill={COLOR[bar.kind]}
                      fillOpacity={lit ? 1 : 0.82}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: durations.fast }}
                    />
                  )}

                  {/* Carries the running total across to the next column. */}
                  {index < count - 1 ? (
                    <motion.line
                      x1={x + barW}
                      x2={(index + 1) * colW + (colW - barW) / 2}
                      y1={yFor(bar.running)}
                      y2={yFor(bar.running)}
                      stroke="var(--hairline-strong)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      initial={motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: index * step + 0.08 }
                          : { duration: 0 }
                      }
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}

        {/* Columns are the list; each is a button, so every hover has a key. */}
        <ul role="list" className="absolute inset-0 flex list-none">
          {bars.map((bar, index) => (
            <li key={bar.key} className="min-w-0 flex-1">
              <button
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-label={readingOf(bar)}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerLeave={() => setActiveIndex(null)}
                onFocus={() => {
                  setFocusIndex(index);
                  setActiveIndex(index);
                }}
                onBlur={() => setActiveIndex(null)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="size-full cursor-default rounded-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              />
            </li>
          ))}
        </ul>

        <motion.div
          ref={readoutRef}
          aria-hidden
          initial={false}
          animate={{
            x: readoutX - half,
            y: readoutY,
            opacity: activeBar ? 1 : 0,
          }}
          // Moving between columns rides `flick`; arriving from nowhere jumps,
          // so the box never slides in from the last column read.
          transition={
            motionSafe && !reopened
              ? { ...springs.flick, opacity: { duration: durations.fast } }
              : { duration: 0, opacity: { duration: durations.fast } }
          }
          className="pointer-events-none absolute top-0 left-0 rounded-2 border border-hairline bg-popover px-2 py-1 shadow-raised"
        >
          <div className="text-[10px] leading-none tracking-[0.08em] text-ink-3 uppercase">
            {activeBar?.label ?? label ?? ""}
          </div>
          <div
            className="mt-1 font-mono text-xs leading-none font-medium tabular-nums"
            style={{ color: COLOR[activeBar?.kind ?? "total"] }}
          >
            {sign}
            <motion.span>{deltaText}</motion.span>
          </div>
          <div className="mt-1 font-mono text-[10px] leading-none text-ink-3 tabular-nums">
            <motion.span>{runningText}</motion.span>
          </div>
        </motion.div>
      </div>

      <div aria-hidden className="flex">
        {bars.map((bar, index) => (
          <span
            key={bar.key}
            className={cn(
              "min-w-0 flex-1 truncate px-0.5 text-center text-[10px] transition-colors",
              active === index ? "text-foreground" : "text-ink-3",
            )}
          >
            {bar.label}
          </span>
        ))}
      </div>

      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.key}>{readingOf(bar)}</li>
        ))}
      </ul>
      <span role="status" aria-live="polite" className="sr-only">
        {activeBar ? readingOf(activeBar) : ""}
      </span>
    </div>
  );
}
