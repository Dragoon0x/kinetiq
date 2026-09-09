"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CompareSeries = {
  id: string;
  label: string;
  /** Closes, oldest first. */
  points: number[];
};

export type CompareLinesProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Both series share the same sample count. */
  series: [CompareSeries, CompareSeries];
  /** Already-formatted x labels, one per sample, for the readout. */
  labels: string[];
  /** Controlled set of hidden series ids. */
  hidden?: string[];
  /** Initial hidden set for uncontrolled usage. @default [] */
  defaultHidden?: string[];
  /** Fires from the toggle that changed it. */
  onHiddenChange?: (hidden: string[]) => void;
  /** Fires from the pointer or key that moved the cursor. */
  onCursorChange?: (index: number | null) => void;
  /** Prints a raw close in the readout. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  /** Plate height in px; the width is fluid. @default 140 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's strings and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (value: number) => currency.format(value);

const NO_IDS: string[] = [];
/** The plate's width before the observer has measured it — the same on both sides of hydration. */
const FALLBACK_WIDTH = 320;
const PAD_Y = 8;
/** How far the readout sits from the hairline. */
const CHIP_GAP = 10;

/** Neither tone reads as up or down: cobalt for the first series, warn for the second. */
const TONES = [
  { stroke: "text-cobalt-bright", dot: "bg-cobalt-bright" },
  { stroke: "text-warn", dot: "bg-warn" },
] as const;

const round2 = (value: number) => Number(value.toFixed(2));
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const signed = (percent: number) =>
  `${percent > 0 ? "+" : percent < 0 ? "-" : ""}${Math.abs(percent).toFixed(2)}`;

const words = (percent: number) =>
  percent === 0
    ? "flat"
    : `${percent > 0 ? "up" : "down"} ${Math.abs(percent).toFixed(2)} percent`;

const signTone = (value: number) =>
  value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-ink-2";

/**
 * Two assets, one chart. Each series is normalised to its own first point so
 * the lines share a scale of percent-since-start and a dashed baseline at
 * zero. On mount both traces draw in together — `pathLength` on one
 * `durations.page` tween with the enter ease — so they finish on the same
 * frame and the eye reads the divergence as it happens. The legend is two
 * toggles: hiding a series fades its line and area on the exit ease with no
 * redraw, because nothing about the data changed, and the vertical domain is
 * fixed across both series so a toggle never re-scales the plate.
 *
 * Pointing at the plate sets a cursor at the nearest sample: a hairline drops
 * there, a dot marks each visible series, a bar connects the two, and a chip
 * prints both values and the gap in percentage points, positive when the
 * first series leads. The chip moves on `snap` and keeps inside the plate,
 * whose width is measured in a ResizeObserver. The plate is a focusable group:
 * Left and Right step the cursor, Home and End jump to the ends, Escape clears.
 * Under reduced motion the traces are simply there and the cursor swaps
 * position without a spring; toggling still fades.
 */
export function CompareLines({
  ref,
  series,
  labels,
  hidden,
  defaultHidden = NO_IDS,
  onHiddenChange,
  onCursorChange,
  format = defaultFormat,
  label,
  height = 140,
  className,
  "aria-label": ariaLabel,
}: CompareLinesProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const descriptionId = `${baseId}-description`;

  const [uncontrolledHidden, setUncontrolledHidden] =
    React.useState<string[]>(defaultHidden);
  const isControlled = hidden !== undefined;
  const hiddenIds = isControlled ? hidden : uncontrolledHidden;
  const hiddenSet = React.useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const [cursor, setCursor] = React.useState<number | null>(null);

  // The plate's width is the one measurement: it maps a pointer to a sample
  // and sizes the SVG's viewBox so nothing is ever drawn past the right edge.
  const plateRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(FALLBACK_WIDTH);
  React.useEffect(() => {
    const node = plateRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const chipRef = React.useRef<HTMLDivElement | null>(null);
  const [chipWidth, setChipWidth] = React.useState(0);
  const hasCursor = cursor !== null;
  React.useEffect(() => {
    const node = chipRef.current;
    if (!node || !hasCursor) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setChipWidth(entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasCursor]);

  const count = Math.min(series[0].points.length, series[1].points.length);
  const percents = React.useMemo(
    () =>
      series.map((entry) => {
        const first = entry.points[0] || 1;
        return entry.points.slice(0, count).map((p) => (p / first - 1) * 100);
      }),
    [series, count],
  );
  // The domain covers both series whether or not one is hidden, so a toggle
  // fades a line without moving the other.
  const all = percents.flat();
  const low = Math.min(0, ...all);
  const high = Math.max(0, ...all);
  const pad = (high - low || 1) * 0.08;
  const floor = low - pad;
  const ceiling = high + pad;

  const xAt = (index: number) =>
    round2(count > 1 ? (index / (count - 1)) * width : width / 2);
  const yAt = (value: number) =>
    round2(
      PAD_Y + (1 - (value - floor) / (ceiling - floor)) * (height - 2 * PAD_Y),
    );
  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)} ${yAt(v)}`).join("");
  const areaPath = (values: number[]) =>
    `${linePath(values)}L${xAt(count - 1)} ${yAt(0)}L${xAt(0)} ${yAt(0)}Z`;

  const moveCursor = (next: number | null) => {
    if (next === cursor) return;
    setCursor(next);
    onCursorChange?.(next);
  };

  const toggle = (id: string) => {
    const next = hiddenSet.has(id)
      ? hiddenIds.filter((entry) => entry !== id)
      : [...hiddenIds, id];
    if (!isControlled) setUncontrolledHidden(next);
    onHiddenChange?.(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const at = cursor ?? count - 1;
    const targets: Record<string, number | null> = {
      ArrowLeft: clamp(at - 1, 0, count - 1),
      ArrowRight: cursor === null ? count - 1 : clamp(at + 1, 0, count - 1),
      Home: 0,
      End: count - 1,
      Escape: null,
    };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    moveCursor(targets[event.key] ?? null);
  };

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    moveCursor(clamp(Math.round(fraction * (count - 1)), 0, count - 1));
  };

  const visible = series.map((entry) => !hiddenSet.has(entry.id));
  const finals = percents.map((values) => values[count - 1] ?? 0);
  const description = `${series[0].label} ${words(finals[0] ?? 0)} and ${
    series[1].label
  } ${words(finals[1] ?? 0)} over ${count} sessions.`;

  const at = cursor;
  const readings =
    at !== null
      ? series.map((entry, index) => ({
          ...entry,
          tone: TONES[index] ?? TONES[0],
          shown: visible[index] ?? true,
          raw: entry.points[at] ?? 0,
          percent: percents[index]?.[at] ?? 0,
        }))
      : [];
  const bothShown = readings.length === 2 && readings.every((r) => r.shown);
  const gap =
    bothShown && readings[0] && readings[1]
      ? readings[0].percent - readings[1].percent
      : null;

  const cursorX = at !== null ? xAt(at) : 0;
  const chipLeft =
    chipWidth > 0 && cursorX + CHIP_GAP + chipWidth > width
      ? Math.max(0, cursorX - CHIP_GAP - chipWidth)
      : Math.min(cursorX + CHIP_GAP, Math.max(0, width - chipWidth));

  const cursorTransition = motionSafe ? springs.snap : { duration: 0 };
  const readout =
    at !== null
      ? `${labels[at] ?? `Sample ${at + 1}`}: ${readings
          .filter((r) => r.shown)
          .map((r) => `${r.label} ${words(r.percent)}`)
          .join(", ")}${gap !== null ? `, gap ${signed(gap)} points` : ""}.`
      : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {series.map((entry, index) => {
          const off = hiddenSet.has(entry.id);
          const tone = TONES[index] ?? TONES[0];
          const final = finals[index] ?? 0;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={!off}
              aria-label={`${off ? "Show" : "Hide"} ${entry.label}`}
              onClick={() => toggle(entry.id)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                off
                  ? "border-hairline bg-transparent text-ink-3 hover:bg-accent"
                  : "border-hairline-strong bg-surface-1 text-foreground hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  tone.dot,
                  off && "opacity-40",
                )}
              />
              <span>{entry.label}</span>
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  off ? "text-ink-3" : signTone(final),
                )}
              >
                {signed(final)}%
              </span>
            </button>
          );
        })}
      </div>

      <p id={descriptionId} className="sr-only">
        {description}
      </p>

      <div
        ref={plateRef}
        role="group"
        tabIndex={0}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={descriptionId}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => moveCursor(null)}
        onKeyDown={handleKeyDown}
        onBlur={() => moveCursor(null)}
        className="relative w-full cursor-crosshair touch-pan-y rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ height }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block size-full overflow-visible"
        >
          <line
            x1={0}
            x2={width}
            y1={yAt(0)}
            y2={yAt(0)}
            stroke="var(--hairline-strong)"
            strokeDasharray="3 3"
          />
          {series.map((entry, index) => {
            const values = percents[index] ?? [];
            const tone = TONES[index] ?? TONES[0];
            const off = hiddenSet.has(entry.id);
            return (
              <motion.g
                key={entry.id}
                className={tone.stroke}
                initial={false}
                animate={{ opacity: off ? 0 : 1 }}
                transition={{
                  duration: durations.base,
                  ease: off ? easings.exit : easings.enter,
                }}
              >
                <motion.path
                  d={areaPath(values)}
                  fill="currentColor"
                  initial={motionSafe ? { opacity: 0 } : false}
                  animate={{ opacity: 0.1 }}
                  // The area waits for the trace to finish drawing.
                  transition={{
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? durations.page : 0,
                  }}
                />
                <motion.path
                  d={linePath(values)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: durations.page, ease: easings.enter }}
                />
              </motion.g>
            );
          })}

          {at !== null ? (
            <motion.g
              initial={false}
              animate={{ x: cursorX }}
              transition={cursorTransition}
            >
              <line
                x1={0}
                x2={0}
                y1={0}
                y2={height}
                stroke="var(--ink-3)"
                strokeWidth={1}
              />
              {gap !== null && readings[0] && readings[1] ? (
                <motion.line
                  x1={0}
                  x2={0}
                  stroke="var(--ink-2)"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  initial={false}
                  animate={{
                    y1: yAt(readings[0].percent),
                    y2: yAt(readings[1].percent),
                  }}
                  transition={cursorTransition}
                />
              ) : null}
              {readings
                .filter((r) => r.shown)
                .map((r) => (
                  <motion.circle
                    key={r.id}
                    cx={0}
                    r={3.5}
                    fill="var(--bg-1)"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={r.tone.stroke}
                    initial={false}
                    animate={{ cy: yAt(r.percent) }}
                    transition={cursorTransition}
                  />
                ))}
            </motion.g>
          ) : null}
        </svg>

        {at !== null ? (
          <motion.div
            ref={chipRef}
            aria-hidden
            className="pointer-events-none absolute top-2 left-0"
            initial={false}
            animate={{ x: chipLeft }}
            transition={cursorTransition}
          >
            <div className="flex flex-col gap-0.5 rounded-2 border border-hairline bg-popover px-2 py-1.5 font-mono text-[10px] whitespace-nowrap text-popover-foreground tabular-nums shadow-raised">
              <span className="text-ink-3">
                {labels[at] ?? `Sample ${at + 1}`}
              </span>
              {readings
                .filter((r) => r.shown)
                .map((r) => (
                  <span key={r.id} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        r.tone.dot,
                      )}
                    />
                    <span>{r.label}</span>
                    <span className="text-ink-2">{format(r.raw)}</span>
                    <span className={signTone(r.percent)}>
                      {signed(r.percent)}%
                    </span>
                  </span>
                ))}
              {gap !== null ? (
                <span className="flex items-center gap-1.5 border-t border-hairline pt-0.5">
                  <span className="text-ink-3">gap</span>
                  <span className={signTone(gap)}>{signed(gap)} pts</span>
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {readout}
      </span>
    </div>
  );
}
