"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScoreVersion = {
  id: string;
  /** The version as printed: "v1.3". */
  label: string;
  /** The suite score, 0–100. */
  score: number;
  /** Cases passed at this version. */
  passed: number;
  /** Cases in the suite at this version. */
  total: number;
};

export type ScoreHistoryProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Oldest first. Appending one extends the line. */
  versions: ScoreVersion[];
  /** Names the plot; prints in the header. @default "Score" */
  label?: string;
  /** Plot height in px. The width is fluid and measured. @default 128 */
  height?: number;
  /** Fires when the reading moves to a version, or returns to the latest (`null`). */
  onReadChange?: (version: ScoreVersion | null) => void;
  className?: string;
};

/** Plot insets: room for the lifted point and the pulse ring. */
const PAD_X = 14;
const PAD_Y = 14;
const DOT_R = 3;
const LIFT_R = 5;
const RING_R = 13;
/** An appended segment waits this long so the re-fitted points settle under it first. */
const REFIT_LEAD_S = 0.3;

/** Node and the browser can differ in a float's last digits; round before an attribute. */
const round3 = (value: number) => Number(value.toFixed(3));

/** Where each key sends the reading, from the current index and the last one. */
const KEYS: Record<string, (from: number, last: number) => number | null> = {
  ArrowLeft: (from) => from - 1,
  ArrowDown: (from) => from - 1,
  ArrowRight: (from) => from + 1,
  ArrowUp: (from) => from + 1,
  Home: () => 0,
  End: (_, last) => last,
  Escape: () => null,
};

/** Border-box width from the observer callback, so no layout read happens during render. */
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
 * A line of suite scores, one point per version. On mount the line draws end
 * to end — each segment draws with `pathLength` on `glide`, one `cascade`
 * step after the last — and the points land behind it. Appending a version
 * draws only the new segment the same way while the plot re-fits its domain,
 * the older segments and points gliding to their new heights together. The
 * latest point pulses: a ring expands from it and fades on a repeating
 * enter-ease tween, so the eye finds now. Hovering or dragging reads the
 * nearest version: a hairline snaps to it, the point lifts its radius on
 * `snap`, and the header reads version, score, cases and the delta against
 * the version before.
 *
 * The plot is a horizontal slider over the versions: Left and Right step,
 * Home and End jump, Escape returns the reading to the latest. Under reduced
 * motion the line appears drawn, nothing pulses — the latest point wears a
 * still outer ring instead — and the reading still follows pointer and keys.
 */
export function ScoreHistory({
  ref,
  versions,
  label = "Score",
  height = 128,
  onReadChange,
  className,
}: ScoreHistoryProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const width = useBoxWidth(plotRef);

  const count = versions.length;
  const latest = versions[count - 1] ?? null;
  // Versions present at mount cascade in behind the drawing line; one
  // appended later waits only for the re-fit, because a queue would read as lag.
  const [mountCount] = React.useState(count);

  const [read, setRead] = React.useState<number | null>(null);
  const readIndex = read !== null && read < count ? read : null;
  const readingIndex = readIndex ?? count - 1;
  const reading = versions[readingIndex] ?? null;
  const before = versions[readingIndex - 1] ?? null;
  const delta = reading && before ? reading.score - before.score : null;

  const moveRead = (next: number | null) => {
    const clamped =
      next === null ? null : Math.min(count - 1, Math.max(0, next));
    if (clamped === readIndex) return;
    setRead(clamped);
    onReadChange?.(clamped === null ? null : (versions[clamped] ?? null));
  };

  const innerW = Math.max(0, width - PAD_X * 2);
  const innerH = Math.max(0, height - PAD_Y * 2);
  const step = count > 1 ? innerW / (count - 1) : 0;
  let low = 100;
  let high = 0;
  for (const version of versions) {
    if (version.score < low) low = version.score;
    if (version.score > high) high = version.score;
  }
  // The domain sits on tens so the gridlines read as figures, and never
  // collapses to a single value.
  let floor = Math.max(0, Math.floor(low / 10) * 10);
  let ceil = Math.min(100, Math.ceil(high / 10) * 10);
  if (ceil <= floor) ceil = Math.min(100, floor + 10);
  if (ceil <= floor) floor = Math.max(0, ceil - 10);
  const xAt = (index: number) =>
    round3(count > 1 ? PAD_X + index * step : PAD_X + innerW / 2);
  const yAt = (score: number) =>
    round3(PAD_Y + (1 - (score - floor) / (ceil - floor)) * innerH);
  const gridValues = [floor, (floor + ceil) / 2, ceil];

  const indexFromClientX = (clientX: number): number | null => {
    const node = plotRef.current;
    if (!node || count === 0) return null;
    if (count === 1 || step <= 0) return 0;
    const x = clientX - node.getBoundingClientRect().left - PAD_X;
    return Math.round(x / step);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const move = KEYS[event.key];
    if (!move || count === 0) return;
    event.preventDefault();
    moveRead(move(readIndex ?? count - 1, count - 1));
  };

  // Announced from a timer, not the render, so a burst of releases speaks once.
  const sentence = latest
    ? `${label} at ${latest.label}: ${latest.score}, ${latest.passed} of ${latest.total} cases`
    : `${label}, no versions yet`;
  const [announced, setAnnounced] = React.useState(sentence);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(sentence), 400);
    return () => window.clearTimeout(timer);
  }, [sentence]);

  const deltaWord =
    delta === null
      ? ""
      : delta > 0
        ? `, up ${delta}`
        : delta < 0
          ? `, down ${-delta}`
          : ", unchanged";
  const valueText = reading
    ? `${reading.label}, score ${reading.score}, ${reading.passed} of ${reading.total} cases${deltaWord}`
    : "No versions yet";
  const isReading = readIndex !== null;
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const snap = motionSafe ? springs.snap : { duration: 0 };
  const stagger = cascade(Math.max(1, mountCount));
  // When each point may land: behind its segment on mount, after the re-fit
  // when appended.
  const landAt = (index: number) =>
    index < mountCount
      ? index * stagger + durations.base
      : REFIT_LEAD_S + durations.fast;
  const pulse = {
    duration: 1.4,
    ease: easings.enter,
    repeat: Infinity,
    repeatDelay: 0.5,
    delay: landAt(count - 1),
  } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        {/* The slider speaks the value; the readout stays out of the tree. */}
        <span
          aria-hidden
          className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums"
        >
          <motion.span
            key={`${isReading ? "read" : "last"}-${reading?.id ?? ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "text-[11px] transition-colors",
                isReading ? "text-cobalt-bright" : "text-ink-3",
              )}
            >
              {reading?.label ?? "—"}
            </span>
            <span className="font-medium text-ink">
              {reading?.score ?? "—"}
            </span>
            <span className="text-ink-3">
              {reading ? `${reading.passed}/${reading.total}` : ""}
            </span>
            {delta !== null ? (
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium",
                  delta > 0
                    ? "bg-success/15 text-success"
                    : delta < 0
                      ? "bg-danger/15 text-danger"
                      : "bg-surface-2 text-ink-3",
                )}
              >
                {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0"}
              </span>
            ) : null}
          </motion.span>
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
        aria-valuenow={readingIndex < 0 ? 0 : readingIndex}
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
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            {gridValues.map((value) => (
              <g key={value}>
                <line
                  x1={PAD_X}
                  x2={round3(width - PAD_X)}
                  y1={yAt(value)}
                  y2={yAt(value)}
                  className="stroke-hairline"
                  strokeWidth={1}
                />
                <text
                  x={PAD_X}
                  y={round3(yAt(value) - 3)}
                  className="fill-ink-3 font-mono text-[9px] tabular-nums"
                >
                  {value}
                </text>
              </g>
            ))}

            {/* One line per segment, keyed by the version it reaches, so an
                appended release draws its own segment while the rest glide. */}
            {versions.map((version, index) => {
              const from = versions[index - 1];
              if (!from) return null;
              const ends = {
                x1: xAt(index - 1),
                y1: yAt(from.score),
                x2: xAt(index),
                y2: yAt(version.score),
              };
              const drawDelay =
                index < mountCount ? (index - 1) * stagger : REFIT_LEAD_S;
              return (
                <motion.line
                  key={`segment-${version.id}`}
                  className="stroke-current"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  pathLength={1}
                  initial={motionSafe ? { ...ends, pathLength: 0 } : false}
                  animate={{ ...ends, pathLength: 1 }}
                  transition={{
                    x1: glide,
                    y1: glide,
                    x2: glide,
                    y2: glide,
                    pathLength: motionSafe
                      ? { ...springs.glide, delay: drawDelay }
                      : { duration: 0 },
                  }}
                />
              );
            })}

            {readIndex !== null && reading ? (
              <motion.line
                className="stroke-hairline-strong"
                strokeWidth={1}
                y1={PAD_Y}
                y2={round3(height - PAD_Y)}
                initial={false}
                animate={{ x1: xAt(readIndex), x2: xAt(readIndex) }}
                transition={snap}
              />
            ) : null}

            {latest ? (
              motionSafe ? (
                <motion.circle
                  key={`pulse-${latest.id}`}
                  className="fill-none stroke-current"
                  strokeWidth={1.5}
                  initial={{
                    cx: xAt(count - 1),
                    cy: yAt(latest.score),
                    r: DOT_R,
                    opacity: 0.7,
                  }}
                  animate={{
                    cx: xAt(count - 1),
                    cy: yAt(latest.score),
                    r: RING_R,
                    opacity: 0,
                  }}
                  transition={{
                    cx: glide,
                    cy: glide,
                    r: pulse,
                    opacity: pulse,
                  }}
                />
              ) : (
                <circle
                  cx={xAt(count - 1)}
                  cy={yAt(latest.score)}
                  r={LIFT_R + 3}
                  className="fill-none stroke-current"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                />
              )
            ) : null}

            {versions.map((version, index) => (
              <motion.circle
                key={`point-${version.id}`}
                className={cn(
                  "stroke-current",
                  index === readIndex ? "fill-surface-1" : "fill-current",
                )}
                strokeWidth={1.5}
                initial={
                  motionSafe
                    ? {
                        cx: xAt(index),
                        cy: yAt(version.score),
                        r: DOT_R,
                        opacity: 0,
                      }
                    : false
                }
                animate={{
                  cx: xAt(index),
                  cy: yAt(version.score),
                  r: index === readIndex ? LIFT_R : DOT_R,
                  opacity: 1,
                }}
                transition={{
                  cx: glide,
                  cy: glide,
                  r: snap,
                  opacity: {
                    duration: durations.fast,
                    ease: easings.enter,
                    delay: motionSafe ? landAt(index) : 0,
                  },
                }}
              />
            ))}
          </svg>
        ) : count === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">
            No versions yet.
          </span>
        ) : null}
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>{versions[0]?.label ?? ""}</span>
        <span>
          {count} {count === 1 ? "version" : "versions"}
        </span>
        <span>{count > 1 ? (latest?.label ?? "") : ""}</span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
