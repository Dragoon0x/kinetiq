"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PercentileSeries = {
  id: string;
  /** Printed on the legend chip and spoken in every sentence. */
  label: string;
  /** One reading per sample, in `samples` order. */
  values: number[];
};

export type BandReading = {
  fromId: string;
  toId: string;
  /** The widest gap between the two lines across the window. */
  spread: number;
};

export type PercentileLinesProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered low to high; the gap between neighbours is what the chart reads. */
  series: PercentileSeries[];
  /** The x labels, one per value — the chart never reads a clock. */
  samples: string[];
  /** Controlled ids of the hidden series. */
  hidden?: string[];
  /** Initial hidden set for uncontrolled usage. @default [] */
  defaultHidden?: string[];
  /** Fires from the press or key that hid or showed a series. */
  onHiddenChange?: (ids: string[]) => void;
  /** The band under pointer or focus; also fires on the first commit. */
  onBandChange?: (band: BandReading | null) => void;
  /** Printed after every figure. @default "ms" */
  unit?: string;
  /** The same unit, spoken in full. @default "milliseconds" */
  unitLong?: string;
  /** Renders every value. @default rounded integer */
  format?: (value: number) => string;
  /** Plot height in px; the width is fluid. @default 128 */
  height?: number;
  /** Names the chart and its hidden table. @default "Percentiles" */
  label?: string;
  className?: string;
};

const VIEW_W = 100;
const PAD_Y = 8;

const round3 = (value: number): number => Number(value.toFixed(3));

const toPath = (points: { x: number; y: number }[]): string =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

const listPhrase = (labels: string[]): string => {
  if (labels.length === 0) return "none";
  if (labels.length === 1) return labels[0] ?? "none";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

type Line = {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  peak: number;
  shown: boolean;
};

type Band = {
  key: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  d: string;
  spread: number;
};

/**
 * Three percentiles over one window, and the gaps between them. Each line draws
 * itself in by `pathLength` on `glide`, offset by `cascade()` so they arrive
 * together without reading as one stroke. Hiding a series fades its line and the
 * band it bounded; every `d` here is set and never animated, because motion
 * cannot interpolate a path whose command count changes and hiding a line
 * re-pairs the bands.
 *
 * The gap is the reading: hovering a band shades it and thickens its two
 * boundary lines on `flick`, and the spread row below names the same gap in
 * words. Those spreads are real buttons with a roving tabindex, so the shading
 * has a keyboard path as well as a pointer one, and pressing one latches the
 * band so it stays shaded once the pointer leaves.
 *
 * The plot is a `role="img"` with a sentence for a name, and every sample of
 * every series lives in a visually hidden table a screen reader can walk — a
 * chart is not a picture. Under reduced motion the lines arrive already drawn
 * and only fade, and the shading is a plain opacity change.
 */
export function PercentileLines({
  ref,
  series,
  samples,
  hidden,
  defaultHidden,
  onHiddenChange,
  onBandChange,
  unit = "ms",
  unitLong = "milliseconds",
  format,
  height = 128,
  label = "Percentiles",
  className,
}: PercentileLinesProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownHidden, setOwnHidden] = React.useState<string[]>(
    defaultHidden ?? [],
  );
  const off = hidden ?? ownHidden;

  const [hoverBand, setHoverBand] = React.useState<string | null>(null);
  const [focusBand, setFocusBand] = React.useState<string | null>(null);
  const [latchBand, setLatchBand] = React.useState<string | null>(null);
  const [bandFocusIndex, setBandFocusIndex] = React.useState(0);

  const print = React.useCallback(
    (value: number) => (format ? format(value) : String(Math.round(value))),
    [format],
  );

  const span = Math.max(1, samples.length - 1);

  const scale = React.useMemo(() => {
    let top = 0;
    for (const entry of series) {
      for (const value of entry.values) {
        if (Number.isFinite(value)) top = Math.max(top, value);
      }
    }
    const hi = top > 0 ? top * 1.08 : 1;
    return {
      hi,
      y: (value: number) =>
        round3(height - PAD_Y - ((value / hi) * (height - PAD_Y * 2) || 0)),
    };
  }, [series, height]);

  const lines = React.useMemo<Line[]>(
    () =>
      series.map((entry) => {
        const points: { x: number; y: number }[] = [];
        let peak = 0;
        samples.forEach((_, index) => {
          const value = entry.values[index];
          if (typeof value !== "number" || !Number.isFinite(value)) return;
          peak = Math.max(peak, value);
          points.push({
            x: round3((index / span) * VIEW_W),
            y: scale.y(value),
          });
        });
        return {
          id: entry.id,
          label: entry.label,
          points,
          peak,
          shown: !off.includes(entry.id),
        };
      }),
    [series, samples, span, scale, off],
  );

  const bands = React.useMemo<Band[]>(() => {
    const shown = lines.filter((line) => line.shown && line.points.length > 1);
    const out: Band[] = [];
    for (let index = 1; index < shown.length; index += 1) {
      const lower = shown[index - 1];
      const upper = shown[index];
      if (!lower || !upper) continue;
      const count = Math.min(lower.points.length, upper.points.length);
      if (count < 2) continue;
      const top = upper.points.slice(0, count);
      const bottom = lower.points.slice(0, count);
      let spread = 0;
      const lowerValues = series.find((entry) => entry.id === lower.id)?.values;
      const upperValues = series.find((entry) => entry.id === upper.id)?.values;
      for (let i = 0; i < count; i += 1) {
        const a = lowerValues?.[i];
        const b = upperValues?.[i];
        if (typeof a === "number" && typeof b === "number") {
          spread = Math.max(spread, b - a);
        }
      }
      out.push({
        key: `${lower.id}-${upper.id}`,
        fromId: lower.id,
        toId: upper.id,
        fromLabel: lower.label,
        toLabel: upper.label,
        d: `${toPath(top)} ${bottom
          .slice()
          .reverse()
          .map((point) => `L ${point.x} ${point.y}`)
          .join(" ")} Z`,
        spread: Math.round(spread),
      });
    }
    return out;
  }, [lines, series]);

  const activeBandKey = hoverBand ?? focusBand ?? latchBand;
  const activeBand = bands.find((band) => band.key === activeBandKey) ?? null;

  const shownLines = lines.filter((line) => line.shown);
  const visiblePeak = shownLines.reduce(
    (high, line) => Math.max(high, line.peak),
    0,
  );

  const reading = activeBand
    ? `${activeBand.fromLabel} → ${activeBand.toLabel} · +${print(activeBand.spread)} ${unit}`
    : shownLines.length === 0
      ? "No series shown."
      : `${shownLines.length} of ${series.length} shown · peak ${print(visiblePeak)} ${unit}`;

  const first = samples[0] ?? "";
  const last = samples[samples.length - 1] ?? "";
  const summary = `${listPhrase(series.map((entry) => entry.label))} across ${samples.length} ${samples.length === 1 ? "sample" : "samples"} from ${first} to ${last}, peaking at ${print(visiblePeak)} ${unitLong}.`;

  // The legend sentence is frozen at the moment the set changes, so a
  // controlled host is never announced ahead of its own answer; setting during
  // render means this pass already reads the NEW freeze.
  const hiddenKey = off.slice().sort().join(",");
  const [spoken, setSpoken] = React.useState({ key: hiddenKey, sentence: "" });
  if (spoken.key !== hiddenKey) {
    const hiddenLabels = lines.filter((l) => !l.shown).map((l) => l.label);
    const shownLabels = lines.filter((l) => l.shown).map((l) => l.label);
    setSpoken({
      key: hiddenKey,
      sentence:
        hiddenLabels.length === 0
          ? `All ${series.length} series shown.`
          : `${listPhrase(hiddenLabels)} hidden, ${listPhrase(shownLabels)} shown.`,
    });
  }

  const bandRef = React.useRef(onBandChange);
  React.useEffect(() => {
    bandRef.current = onBandChange;
  });
  // A band reading is a state, not an event: it reports from the first commit
  // too, so a host mounting beside the chart is never a frame behind it.
  const activeFrom = activeBand ? activeBand.fromId : null;
  const activeTo = activeBand ? activeBand.toId : null;
  const activeSpread = activeBand ? activeBand.spread : null;
  React.useEffect(() => {
    if (activeFrom === null || activeTo === null || activeSpread === null) {
      bandRef.current?.(null);
      return;
    }
    bandRef.current?.({
      fromId: activeFrom,
      toId: activeTo,
      spread: activeSpread,
    });
  }, [activeFrom, activeTo, activeSpread]);

  const setHidden = (next: string[]) => {
    if (hidden === undefined) setOwnHidden(next);
    onHiddenChange?.(next);
  };

  const toggleSeries = (id: string) => {
    setHidden(
      off.includes(id) ? off.filter((one) => one !== id) : [...off, id],
    );
  };

  const bandId = (index: number) => `${baseId}-band-${index}`;

  const focusBandAt = (index: number) => {
    const clamped = Math.min(bands.length - 1, Math.max(0, index));
    if (!bands[clamped]) return;
    setBandFocusIndex(clamped);
    document.getElementById(bandId(clamped))?.focus();
  };

  const onBandKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusBandAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusBandAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusBandAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusBandAt(bands.length - 1);
    }
  };

  const rovingBand = Math.min(
    Math.max(0, bands.length - 1),
    Math.max(0, bandFocusIndex),
  );
  const stagger = cascade(Math.max(series.length, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const draw = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        {/* One cell, two readings, cross-faded: moving between bands on the
            keyboard must never leave the line empty for a frame. */}
        <span aria-hidden className="grid min-w-0 justify-items-end">
          <AnimatePresence initial={false}>
            <motion.span
              key={reading}
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {reading}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        role="img"
        aria-label={summary}
        className="relative w-full overflow-clip rounded-2 border border-hairline bg-surface-2 [contain:paint]"
        style={{ height }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          style={{ height }}
          className="absolute inset-0 w-full"
        >
          <AnimatePresence initial={false}>
            {bands.map((band) => {
              const lit = activeBandKey === band.key;
              return (
                <motion.path
                  key={band.key}
                  d={band.d}
                  className="fill-cobalt-wash"
                  onPointerEnter={() => setHoverBand(band.key)}
                  onPointerLeave={() =>
                    setHoverBand((previous) =>
                      previous === band.key ? null : previous,
                    )
                  }
                  initial={{ opacity: 0 }}
                  animate={{ opacity: lit ? 1 : 0.35 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                />
              );
            })}
          </AnimatePresence>

          {/* Each line is drawn by its own clip sweeping across it rather than
              by `pathLength`: normalised dashes and `non-scaling-stroke` do not
              agree in a box this stretched, and the finished line comes out cut
              into pieces. A clip is measured in the user units the path is. */}
          <defs>
            {lines.map((line, index) => (
              <clipPath key={line.id} id={`${baseId}-sweep-${line.id}`}>
                <motion.rect
                  x="0"
                  y={-10}
                  height={height + 20}
                  initial={{ width: motionSafe ? 0 : VIEW_W }}
                  animate={{ width: VIEW_W }}
                  transition={{ ...draw, delay: index * stagger }}
                />
              </clipPath>
            ))}
          </defs>

          {lines.map((line, index) => {
            if (line.points.length < 2) return null;
            const touching =
              activeBand !== null &&
              (activeBand.fromId === line.id || activeBand.toId === line.id);
            return (
              <g key={line.id} clipPath={`url(#${baseId}-sweep-${line.id})`}>
                <motion.path
                  d={toPath(line.points)}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    "pointer-events-none stroke-current",
                    index === 0
                      ? "text-cobalt-bright"
                      : index === 1
                        ? "text-signal"
                        : "text-warn",
                  )}
                  initial={{ opacity: 0, strokeWidth: 1.75 }}
                  animate={{
                    opacity: line.shown ? 1 : 0.12,
                    strokeWidth: touching ? 2.75 : 1.75,
                  }}
                  transition={{
                    opacity: fade,
                    strokeWidth: motionSafe ? springs.flick : fade,
                  }}
                />
              </g>
            );
          })}
        </svg>

        <span
          aria-hidden
          className="pointer-events-none absolute top-1 left-1.5 font-mono text-[9px] text-ink-3 tabular-nums"
        >
          {print(scale.hi)} {unit}
        </span>
      </div>

      <div
        aria-hidden
        className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>{first}</span>
        <span>{last}</span>
      </div>

      <div role="group" aria-label="Series" className="flex gap-1.5">
        {lines.map((line, index) => (
          <button
            key={line.id}
            type="button"
            aria-pressed={line.shown}
            aria-label={`${line.label}, peaking at ${print(line.peak)} ${unitLong}.`}
            onClick={() => toggleSeries(line.id)}
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2 border px-2 font-mono text-[10px] transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              line.shown
                ? "border-hairline-strong text-ink hover:bg-accent"
                : "border-hairline text-ink-3 hover:bg-accent",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full transition-opacity",
                index === 0
                  ? "bg-cobalt-bright"
                  : index === 1
                    ? "bg-signal"
                    : "bg-warn",
                line.shown ? "opacity-100" : "opacity-30",
              )}
            />
            <span className="min-w-0 truncate">{line.label}</span>
          </button>
        ))}
      </div>

      {bands.length > 0 ? (
        <div role="group" aria-label="Gaps" className="flex gap-1.5">
          {bands.map((band, index) => {
            const lit = activeBandKey === band.key;
            return (
              <button
                key={band.key}
                type="button"
                id={bandId(index)}
                tabIndex={index === rovingBand ? 0 : -1}
                aria-pressed={latchBand === band.key}
                aria-label={`Gap from ${band.fromLabel} to ${band.toLabel}, ${print(band.spread)} ${unitLong} at the widest.`}
                onPointerEnter={() => setHoverBand(band.key)}
                onPointerLeave={() =>
                  setHoverBand((previous) =>
                    previous === band.key ? null : previous,
                  )
                }
                onFocus={() => setFocusBand(band.key)}
                onBlur={() =>
                  setFocusBand((previous) =>
                    previous === band.key ? null : previous,
                  )
                }
                onClick={() =>
                  setLatchBand((previous) =>
                    previous === band.key ? null : band.key,
                  )
                }
                onKeyDown={(event) => onBandKeyDown(event, index)}
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center justify-between gap-1 rounded-2 border px-2 font-mono text-[10px] transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  lit
                    ? "border-transparent bg-cobalt-wash text-ink"
                    : "border-hairline-strong text-ink-2 hover:bg-accent",
                )}
              >
                <span className="shrink-0">
                  {band.fromLabel} → {band.toLabel}
                </span>
                <span className="min-w-0 truncate tabular-nums">
                  +{print(band.spread)} {unit}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Every number behind the picture, for a reader that cannot see it. The
          wrapper carries the hiding, not the table: a table ignores a 1px width
          and lays itself out at its content's size, so `sr-only` on the table
          leaves a 626px box that takes the page sideways with it. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Sample</th>
              {series.map((entry) => (
                <th key={entry.id} scope="col">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {samples.map((sample, index) => (
              <tr key={`${sample}-${index}`}>
                <th scope="row">{sample}</th>
                {series.map((entry) => {
                  const value = entry.values[index];
                  return (
                    <td key={entry.id}>
                      {typeof value === "number"
                        ? `${print(value)} ${unitLong}`
                        : "no reading"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
