"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LatencySample = {
  /** The response time this bucket sits at, in milliseconds. */
  ms: number;
  /** How many requests landed in it. */
  count: number;
};

export type ApdexGrade =
  "excellent" | "good" | "fair" | "poor" | "unacceptable";

export type ApdexRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The seeded distribution the ring cuts; it is never sampled from a clock. */
  samples: LatencySample[];
  /** Controlled threshold T: satisfied at or under it, tolerating up to four T. */
  thresholdMs?: number;
  /** Initial threshold for uncontrolled usage. @default the first preset */
  defaultThresholdMs?: number;
  /** Fires from the press or arrow key that chose a preset. */
  onThresholdChange?: (ms: number) => void;
  /** The thresholds the radiogroup offers. @default [250, 500, 1000] */
  presets?: number[];
  /** The score is a reading: it reports from the first commit as well as every re-cut. */
  onScoreChange?: (score: number) => void;
  /** Names the ring for assistive technology. @default "Apdex" */
  label?: string;
  /** Renders every threshold. @default ms under a second, seconds above */
  formatMs?: (ms: number) => string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Grouped by hand: a locale differs between the server and the browser, and a
 *  differing digit is a hydration error rather than a formatting one. */
const groupInt = (value: number): string =>
  String(Math.round(Math.max(0, value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const requestWord = (count: number): string =>
  count === 1 ? "request" : "requests";

const defaultFormatMs = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${Number((ms / 1000).toFixed(2))} s`;

/** Six decimals before a ratio reaches an attribute: the last digits of a
 *  division are not worth a hydration mismatch. */
const ratio6 = (value: number): number => Number(value.toFixed(6));

const gradeFor = (score: number): ApdexGrade =>
  score >= 0.94
    ? "excellent"
    : score >= 0.85
      ? "good"
      : score >= 0.7
        ? "fair"
        : score >= 0.5
          ? "poor"
          : "unacceptable";

/** Digits that roll on `snap`; the ring's own sentence carries the figure, so
 *  this column stays out of the accessibility tree. */
function RollingScore({
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
        // Keyed from the right so the last column keeps its identity when the
        // figure gains one, and only the new column mounts.
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
            className="relative inline-block h-[1.25em] w-[1ch] overflow-clip [contain:paint]"
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
                  className="flex h-[1.25em] items-center justify-center"
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
 * A satisfaction score drawn as one ring cut into three. The component cuts the
 * distribution it is handed by the threshold — satisfied at or under T,
 * tolerating up to four T, frustrated above — and scores it as satisfied plus
 * half of tolerating.
 *
 * The three bands are three stacked arcs of the SAME circle, drawn largest
 * first, so only each arc's length changes and no arc has to slide its start
 * point: `pathLength={1}` with a constant dash pattern and one numeric
 * `strokeDashoffset` easing on `glide`, which serialises identically on the
 * server and needs no string interpolation. The score rolls on `snap` in the
 * middle when the cut changes.
 *
 * Changing the threshold is the instrument, so its control lives inside it: a
 * real radiogroup where Left and Right step and select without wrapping past
 * the ends, Home and End jump, and Space or Enter selects. Under the ring a
 * definition list carries each band in words, so the arcs' colours are never
 * the only reading.
 */
export function ApdexRing({
  ref,
  samples,
  thresholdMs,
  defaultThresholdMs,
  onThresholdChange,
  presets = [250, 500, 1000],
  onScoreChange,
  label = "Apdex",
  formatMs = defaultFormatMs,
  className,
}: ApdexRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const firstPreset = presets[0] ?? 500;
  const [ownThreshold, setOwnThreshold] = React.useState(
    defaultThresholdMs ?? firstPreset,
  );
  const isControlled = thresholdMs !== undefined;
  const threshold = isControlled ? thresholdMs : ownThreshold;

  const cut = React.useMemo(() => {
    let satisfied = 0;
    let tolerating = 0;
    let frustrated = 0;
    for (const sample of samples) {
      const count = Math.max(0, Math.round(sample.count));
      if (sample.ms <= threshold) satisfied += count;
      else if (sample.ms <= threshold * 4) tolerating += count;
      else frustrated += count;
    }
    return { satisfied, tolerating, frustrated };
  }, [samples, threshold]);

  const total = cut.satisfied + cut.tolerating + cut.frustrated;
  // The grade is read from the figure that is printed, never from the raw
  // division: a score that prints 0.850 must not be graded as 0.849.
  const scoreText = (
    total > 0 ? (cut.satisfied + cut.tolerating / 2) / total : 0
  ).toFixed(3);
  const score = Number(scoreText);
  const grade = gradeFor(score);
  // An empty window has nothing to grade; scoring it "unacceptable" would be
  // a reading the distribution never gave.
  const gradeWord = total > 0 ? grade : "no data";

  const bands = [
    {
      id: "satisfied",
      name: "Satisfied",
      count: cut.satisfied,
      stroke: "stroke-cobalt-bright",
      dot: "bg-cobalt-bright",
    },
    {
      id: "tolerating",
      name: "Tolerating",
      count: cut.tolerating,
      stroke: "stroke-warn",
      dot: "bg-warn",
    },
    {
      id: "frustrated",
      name: "Frustrated",
      count: cut.frustrated,
      stroke: "stroke-danger",
      dot: "bg-danger",
    },
  ] as const;

  const shareOf = (count: number) =>
    total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

  // Cumulative lengths, largest first: the arcs stack rather than sit end to
  // end, so a re-cut only ever changes a length and never a start point.
  const cumulative = [
    total > 0 ? 1 : 0,
    total > 0 ? ratio6((cut.satisfied + cut.tolerating) / total) : 0,
    total > 0 ? ratio6(cut.satisfied / total) : 0,
  ];
  const stacked = [bands[2], bands[1], bands[0]] as const;

  const scoreRef = React.useRef(onScoreChange);
  React.useEffect(() => {
    scoreRef.current = onScoreChange;
  });
  // A score is a state, so it reports from the first commit too: a host that
  // mounts with a seeded distribution must not read as zero.
  React.useEffect(() => {
    scoreRef.current?.(score);
  }, [score]);

  const setThreshold = (next: number) => {
    if (!isControlled) setOwnThreshold(next);
    onThresholdChange?.(next);
  };

  const sentence =
    total === 0
      ? `${label} has no requests to score at a ${formatMs(threshold)} threshold.`
      : `${label} ${scoreText}, ${grade}, at a ${formatMs(threshold)} threshold: ${groupInt(cut.satisfied)} satisfied, ${groupInt(cut.tolerating)} tolerating, ${groupInt(cut.frustrated)} frustrated of ${groupInt(total)} ${requestWord(total)}.`;

  // Frozen in the render that commits the new cut, so the region speaks the
  // score it landed on rather than the one it is replacing.
  const speechKey = `${threshold}|${scoreText}`;
  const [spoken, setSpoken] = React.useState({ key: speechKey, sentence: "" });
  if (spoken.key !== speechKey) {
    setSpoken({
      key: speechKey,
      sentence:
        total === 0
          ? `Threshold ${formatMs(threshold)}. No requests to score.`
          : `Threshold ${formatMs(threshold)}. ${label} ${scoreText}, ${grade}.`,
    });
  }

  const moveTo = (index: number) => {
    const next = presets[Math.min(presets.length - 1, Math.max(0, index))];
    if (next === undefined) return;
    setThreshold(next);
    document.getElementById(`${baseId}-preset-${next}`)?.focus();
  };

  const onPresetKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(presets.length - 1);
    }
  };

  const arcTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const gradeTone =
    total === 0
      ? "text-ink-3"
      : score >= 0.85
        ? "text-cobalt-bright"
        : score >= 0.7
          ? "text-warn"
          : "text-danger";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex justify-center">
        <div role="img" aria-label={sentence} className="relative size-32">
          <svg viewBox="0 0 120 120" className="size-full">
            {/* Rotated by a static attribute, not by a transform motion has to
                rewrite: the ring starts at twelve o'clock on both renders. */}
            <g transform="rotate(-90 60 60)">
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                strokeWidth="12"
                className="stroke-hairline"
              />
              {stacked.map((band, index) => (
                <motion.circle
                  key={band.id}
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  strokeWidth="12"
                  pathLength={1}
                  strokeDasharray="1 1"
                  className={band.stroke}
                  initial={false}
                  animate={{
                    strokeDashoffset: Number(
                      (1 - (cumulative[index] ?? 0)).toFixed(6),
                    ),
                  }}
                  transition={arcTransition}
                />
              ))}
            </g>
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="font-mono text-2xl font-medium text-ink">
              <RollingScore value={scoreText} motionSafe={motionSafe} />
            </span>
            <span
              className={cn(
                "font-mono text-[10px] tracking-[0.08em] uppercase",
                gradeTone,
              )}
            >
              {gradeWord}
            </span>
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-1">
        {bands.map((band) => (
          <div key={band.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", band.dot)}
            />
            <dt className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
              {band.name}
            </dt>
            <dd className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
              {groupInt(band.count)}
              <span className="pl-1.5 text-ink-3">
                {shareOf(band.count).toFixed(1)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <div
        role="radiogroup"
        aria-label="Satisfaction threshold"
        className="flex items-stretch gap-1.5"
      >
        {presets.map((preset, index) => {
          const checked = preset === threshold;
          return (
            <button
              key={preset}
              id={`${baseId}-preset-${preset}`}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`Threshold ${formatMs(preset)}.`}
              tabIndex={checked ? 0 : -1}
              onClick={() => setThreshold(preset)}
              onKeyDown={(event) => onPresetKeyDown(event, index)}
              className={cn(
                "relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-2 border px-2 transition-colors",
                checked
                  ? "border-hairline-strong"
                  : "border-hairline hover:bg-accent",
                focusRing,
              )}
            >
              {/* The pill travels behind the words rather than scaling them:
                  a spring on a text-bearing box scales the text with it. */}
              {checked && motionSafe ? (
                <motion.span
                  aria-hidden
                  layoutId={`${baseId}-preset-pill`}
                  className="absolute inset-0 rounded-2 bg-surface-2"
                  transition={springs.snap}
                />
              ) : null}
              {checked && !motionSafe ? (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2 bg-surface-2"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative font-mono text-[11px] tabular-nums",
                  checked ? "font-medium text-ink" : "text-ink-3",
                )}
              >
                {formatMs(preset)}
              </span>
            </button>
          );
        })}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
