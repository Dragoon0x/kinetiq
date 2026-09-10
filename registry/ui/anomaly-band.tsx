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

export type BandPoint = {
  id: string;
  /** The printed clock for this reading — the chart never reads one. */
  at: string;
  value: number;
};

export type AnomalyBandProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The window, oldest first. */
  series: BandPoint[];
  /** Half-width of the normal band, in standard deviations. @default 2 */
  sigma?: number;
  /** Printed after every value. @default "ms" */
  unit?: string;
  /** Controlled selected reading. */
  selectedId?: string | null;
  /** Initial selected reading for uncontrolled usage. @default null */
  defaultSelectedId?: string | null;
  /** Fires from the press or key that selected or cleared a reading. */
  onSelectedChange?: (id: string | null) => void;
  /** The count is a reading: it reports from the first commit as well as every window. */
  onOutliersChange?: (count: number) => void;
  /** Renders every value. @default one decimal, trailing zero trimmed */
  format?: (value: number) => string;
  /** Names the chart and the list for assistive technology. @default "Readings" */
  label?: string;
  className?: string;
};

const X_PAD = 4;
const Y_PAD = 10;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Three decimals before a coordinate or a percentage reaches an attribute:
 *  the server and the browser can disagree in the last digits, and that is a
 *  hydration error rather than a rounding one. */
const round3 = (value: number): number => Number(value.toFixed(3));

const defaultFormat = (value: number): string =>
  String(Number(value.toFixed(1)));

const readingWord = (count: number): string =>
  count === 1 ? "reading" : "readings";

const sigmaWords = (z: number): string =>
  `${Math.abs(z).toFixed(1)} standard ${Math.abs(z).toFixed(1) === "1.0" ? "deviation" : "deviations"} ${z >= 0 ? "above" : "below"} the mean`;

/**
 * A metric line with normal drawn behind it. The band is the mean plus and
 * minus `sigma` standard deviations of the readings handed in, and it glides to
 * new bounds when the window or the width changes, so opening normal from two
 * sigma to three reads as normal opening up rather than as a redraw. The line
 * draws left to right on `glide` — `pathLength={1}`, a constant dash pattern
 * and one numeric `strokeDashoffset` — and draws again for every new window,
 * because it is keyed by its own readings.
 *
 * A reading outside the band pops on `snap`, one crisp overshoot and no bounce,
 * because an outlier is a fact and not a celebration, and a ring expands out of
 * it on a tween — staggered by `cascade()` on arrival, replayed when that
 * reading is selected. A selected outlier draws its whisker from the band's
 * edge to the point: the deviation made visible rather than merely stated.
 *
 * Every reading is also a row in a scroller that scrolls inside its own box, on
 * a roving tabindex where the arrows step, Home and End jump, Enter or Space
 * selects and Escape clears. Chart and list share one selection.
 */
export function AnomalyBand({
  ref,
  series,
  sigma = 2,
  unit = "ms",
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  onOutliersChange,
  format = defaultFormat,
  label = "Readings",
  className,
}: AnomalyBandProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const chartRef = React.useRef<HTMLDivElement | null>(null);

  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelectedId,
  );
  const isControlled = selectedId !== undefined;
  const selected = isControlled ? selectedId : ownSelected;

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [pulse, setPulse] = React.useState({ id: "", n: 0 });

  const shape = React.useMemo(() => {
    const values = series.map((point) => point.value);
    const count = values.length || 1;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    // sqrt is correctly rounded by IEEE, but every bound below reaches an
    // attribute, so every one of them is rounded before it does.
    const sd = round3(
      Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count,
      ),
    );
    const centre = round3(mean);
    const upper = round3(centre + sigma * sd);
    const lower = round3(centre - sigma * sd);
    const low = Math.min(lower, ...values);
    const high = Math.max(upper, ...values);
    const pad = (high - low || 1) * 0.06;
    return {
      mean: centre,
      sd,
      upper,
      lower,
      low: round3(low - pad),
      high: round3(high + pad),
    };
  }, [series, sigma]);

  const span = shape.high - shape.low || 1;
  const xFor = (index: number): number =>
    round3(
      X_PAD +
        (series.length > 1
          ? (index / (series.length - 1)) * (100 - X_PAD * 2)
          : (100 - X_PAD * 2) / 2),
    );
  const yFor = (value: number): number =>
    round3(Y_PAD + (1 - (value - shape.low) / span) * (100 - Y_PAD * 2));

  const zOf = (value: number): number =>
    shape.sd > 0 ? round3((value - shape.mean) / shape.sd) : 0;

  const rows = series.map((point, index) => {
    const z = zOf(point.value);
    return {
      point,
      index,
      z,
      outside: shape.sd > 0 && Math.abs(z) > sigma,
      x: xFor(index),
      y: yFor(point.value),
    };
  });

  const outliers = rows.filter((row) => row.outside).length;
  const signature = series.map((point) => point.value).join(",");
  const draw = rows.map((r) => `${r.index === 0 ? "M" : "L"}${r.x} ${r.y}`);
  const path = series.length > 1 ? draw.join(" ") : "";

  const outlierRef = React.useRef(onOutliersChange);
  React.useEffect(() => {
    outlierRef.current = onOutliersChange;
  });
  // A count is a state, so it reports from the first commit too: a host that
  // mounts with a seeded window must not read as zero outliers.
  React.useEffect(() => {
    outlierRef.current?.(outliers);
  }, [outliers]);

  const activeId = hoverId ?? selected;
  const activeRow = rows.find((row) => row.point.id === activeId) ?? null;

  const select = (id: string | null) => {
    if (!isControlled) setOwnSelected(id);
    if (id) setPulse((previous) => ({ id, n: previous.n + 1 }));
    onSelectedChange?.(id);
  };

  const sentenceFor = (row: (typeof rows)[number]): string =>
    `${row.point.at}, ${format(row.point.value)} ${unit}, ${sigmaWords(row.z)}${row.outside ? ", outside the band" : ""}.`;

  // Frozen in the setter's render, so the region speaks the reading that was
  // just landed on rather than the one it replaced.
  const speechKey = selected ?? "none";
  const [spoken, setSpoken] = React.useState({ key: speechKey, sentence: "" });
  if (spoken.key !== speechKey) {
    const row = rows.find((one) => one.point.id === selected);
    setSpoken({
      key: speechKey,
      sentence: row ? sentenceFor(row) : "Selection cleared.",
    });
  }

  const ends = `${series[0]?.at ?? ""} to ${series[series.length - 1]?.at ?? ""}`;
  const chartText =
    series.length === 0
      ? `${label}: no readings in this window.`
      : `${series.length} ${readingWord(series.length)} from ${ends}, mean ${format(shape.mean)} ${unit}, normal band ${format(shape.lower)} to ${format(shape.upper)} ${unit}, ${outliers} ${readingWord(outliers)} outside it.`;

  const reading = activeRow
    ? `${activeRow.point.at} · ${format(activeRow.point.value)} ${unit} · ${activeRow.z >= 0 ? "+" : "−"}${Math.abs(activeRow.z).toFixed(1)}σ`
    : `${format(shape.lower)}–${format(shape.upper)} ${unit} · ${outliers} outside`;

  const moveTo = (index: number) => {
    const clamped = Math.min(rows.length - 1, Math.max(0, index));
    if (clamped < 0) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-row-${clamped}`)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(rows.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      select(null);
    }
  };

  const onChartPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rows.length === 0) return;
    const share = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const row = rows[Math.round(share * (rows.length - 1))];
    if (row) setHoverId(row.point.id);
  };

  const stagger = cascade(Math.max(outliers, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const bandTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const roving = Math.min(focusIndex, Math.max(0, rows.length - 1));
  // The line is drawn by a clip that sweeps across it rather than by a dash
  // pattern: `pathLength` normalisation and `vector-effect: non-scaling-stroke`
  // do not agree in a box this stretched, and the dashes end up cutting the
  // finished line into pieces. A clip is measured in the same user units the
  // path is.
  const sweepId = `${baseId}-sweep`;
  const whisker =
    activeRow && activeRow.outside
      ? {
          x: activeRow.x,
          from: yFor(activeRow.z >= 0 ? shape.upper : shape.lower),
          to: activeRow.y,
        }
      : null;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {/* Both readings share one cell and cross-fade: stepping the list on
            the arrow keys must never blank the header. */}
        <div aria-hidden className="grid h-4 min-w-0 flex-1 items-center">
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
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          ±{sigma}σ
        </span>
      </div>

      <div
        ref={chartRef}
        role="img"
        aria-label={chartText}
        onPointerMove={onChartPointerMove}
        onPointerLeave={() => setHoverId(null)}
        className="relative h-24 w-full overflow-clip rounded-2 border border-hairline bg-surface-1 [contain:paint]"
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <motion.rect
            x="0"
            width="100"
            className="fill-cobalt-wash"
            initial={false}
            animate={{
              y: yFor(shape.upper),
              height: round3(
                Math.max(0, yFor(shape.lower) - yFor(shape.upper)),
              ),
            }}
            transition={bandTransition}
          />
          <defs>
            <clipPath id={sweepId}>
              <motion.rect
                x="0"
                y="-20"
                height="140"
                initial={{ width: motionSafe ? 0 : 100 }}
                animate={{ width: 100 }}
                transition={bandTransition}
              />
            </clipPath>
          </defs>
          {whisker ? (
            <motion.line
              key={`whisker-${activeId ?? ""}`}
              x1={whisker.x}
              x2={whisker.x}
              y1={whisker.from}
              className="stroke-danger"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              initial={{ y2: whisker.from, opacity: motionSafe ? 1 : 0 }}
              animate={{ y2: whisker.to, opacity: 1 }}
              transition={motionSafe ? springs.snap : fade}
            />
          ) : null}
          <g clipPath={`url(#${sweepId})`}>
            <motion.path
              key={signature}
              d={path}
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-cobalt-bright"
              initial={{ opacity: motionSafe ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={bandTransition}
            />
          </g>
        </svg>

        {rows
          .filter((row) => row.outside || row.point.id === activeId)
          .map((row, order) => {
            const live = row.point.id === activeId;
            return (
              <span
                key={row.point.id}
                aria-hidden
                style={{ left: `${row.x}%`, top: `${row.y}%` }}
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2"
              >
                {row.outside && motionSafe ? (
                  <motion.span
                    key={`${signature}-${pulse.id === row.point.id ? pulse.n : 0}`}
                    className="absolute inset-0 rounded-full border border-danger"
                    initial={{ scale: 1, opacity: 0.55 }}
                    animate={{ scale: 3.2, opacity: 0 }}
                    transition={{
                      duration: durations.page,
                      ease: easings.exit,
                      delay: order * stagger,
                    }}
                  />
                ) : null}
                <motion.span
                  className={cn(
                    "absolute inset-0 rounded-full",
                    row.outside ? "bg-danger" : "bg-ink",
                    live && "ring-2 ring-ring",
                  )}
                  initial={
                    motionSafe && row.outside
                      ? { scale: 0 }
                      : { scale: 1, opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    motionSafe && row.outside
                      ? { ...springs.snap, delay: order * stagger }
                      : fade
                  }
                />
              </span>
            );
          })}
      </div>

      <ol
        role="list"
        aria-label={label}
        className="flex max-h-32 flex-col gap-0.5 overflow-x-clip overflow-y-auto rounded-2 border border-hairline bg-surface-1 p-1 [contain:paint]"
      >
        {rows.map((row, index) => {
          const chosen = row.point.id === selected;
          return (
            <li key={row.point.id}>
              <button
                id={`${baseId}-row-${index}`}
                type="button"
                aria-pressed={chosen}
                aria-label={sentenceFor(row)}
                tabIndex={index === roving ? 0 : -1}
                onFocus={() => {
                  setFocusIndex(index);
                  setHoverId(row.point.id);
                }}
                onBlur={() =>
                  setHoverId((previous) =>
                    previous === row.point.id ? null : previous,
                  )
                }
                onPointerEnter={() => setHoverId(row.point.id)}
                onClick={() => select(chosen ? null : row.point.id)}
                onKeyDown={(event) => onRowKeyDown(event, index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-1 px-1.5 py-0.5 text-left transition-colors",
                  chosen ? "bg-surface-2" : "hover:bg-accent",
                  focusRing,
                )}
              >
                <span
                  aria-hidden
                  className="w-10 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums"
                >
                  {row.point.at}
                </span>
                <span
                  aria-hidden
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink tabular-nums"
                >
                  {format(row.point.value)} {unit}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums",
                    row.outside ? "font-medium text-danger" : "text-ink-3",
                  )}
                >
                  {`${row.z >= 0 ? "+" : "−"}${Math.abs(row.z).toFixed(1)}σ${row.outside ? " outside" : ""}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
