"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RiskMeterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The action's risk, 0 to 1. */
  risk: number;
  /** What the model proposes to do, printed above the meter. */
  action: string;
  /** Where the moderate and high bands begin; the high band arms the confirm. @default [0.35, 0.7] */
  thresholds?: [number, number];
  /** The band words. @default ["Low", "Moderate", "High"] */
  bands?: [string, string, string];
  /** Copy on the action control. @default "Run" */
  runLabel?: string;
  /** Copy on the armed control. @default "Confirm" */
  confirmLabel?: string;
  /** Fires when the action runs: one press below the high band, the second press in it. */
  onRun?: () => void;
  /** Fires from the press or key that armed or disarmed the confirm. */
  onArmChange?: (armed: boolean) => void;
  /** Names the meter and its group for assistive technology. */
  label: string;
  className?: string;
};

type Band = 0 | 1 | 2;

const DEFAULT_THRESHOLDS: [number, number] = [0.35, 0.7];
const DEFAULT_BANDS: [string, string, string] = ["Low", "Moderate", "High"];

const round3 = (value: number): number => Number(value.toFixed(3));
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const FILL_TONE: Record<Band, string> = {
  0: "bg-cobalt-bright",
  1: "bg-warn",
  2: "bg-danger",
};
const CHIP_TONE: Record<Band, string> = {
  0: "border-cobalt-bright/60 text-cobalt-bright",
  1: "border-warn/60 text-warn",
  2: "border-danger/60 text-danger",
};

/**
 * Words stacked in one cell so the swap never changes the width; the active
 * one rises in from `distances.step` below on `snap` while the last lifts
 * away above on the exit ease. A rising risk rolls the word up, a falling
 * one rolls it down. Under reduced motion they cross-fade in place.
 */
function WordRoll({
  words,
  active,
  motionSafe,
  className,
}: {
  words: readonly string[];
  active: number;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span className={cn("grid", className)}>
      {words.map((word, index) => {
        const on = index === active;
        const y = !motionSafe
          ? 0
          : on
            ? 0
            : index < active
              ? -distances.step
              : distances.step;
        // The list is fixed for the life of the control, so an index is a
        // stable identity; a word would not be, since two labels may match.
        return (
          <motion.span
            key={index}
            aria-hidden={!on}
            className="col-start-1 row-start-1 text-center"
            initial={false}
            animate={{ opacity: on ? 1 : 0, y }}
            transition={
              on
                ? motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast, ease: easings.enter }
                : exitFor(durations.fast)
            }
          >
            {word}
          </motion.span>
        );
      })}
    </span>
  );
}

/**
 * A meter beneath a proposed action that fills toward its risk. The fill is a
 * `scaleX` on `glide` — a quantity settling, no overshoot — toned cobalt,
 * warn or danger by band, with two threshold ticks on the track. A band
 * label rides above the track with its centre on the fill's leading edge,
 * its `x` a rounded pixel from a ResizeObserver on the track, clamped so it
 * never leaves the row, travelling on the same `glide`; inside it the band
 * word rolls.
 *
 * In the high band the action control arms a confirm: the first press turns
 * Run into Confirm on the destructive tone (the word rolls the same way), a
 * second press runs, and Escape or a change of risk disarms. Below the high
 * band one press runs. It is a `role="meter"` with the band and percentage in
 * `aria-valuetext`. Under reduced motion the fill still fills on a tween, the
 * label does not travel, and the words cross-fade.
 */
export function RiskMeter({
  ref,
  risk,
  action,
  thresholds = DEFAULT_THRESHOLDS,
  bands = DEFAULT_BANDS,
  runLabel = "Run",
  confirmLabel = "Confirm",
  onRun,
  onArmChange,
  label,
  className,
}: RiskMeterProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const actionId = `${baseId}-action`;
  const hintId = `${baseId}-hint`;

  const value = clamp01(risk);
  const [moderateAt, highAt] = thresholds;
  const band: Band = value < moderateAt ? 0 : value < highAt ? 1 : 2;
  const highBand = band === 2;
  const bandWord = bands[band];
  const percent = Math.round(value * 100);

  const [armed, setArmed] = React.useState(false);
  const [ran, setRan] = React.useState(false);
  // A confirm belongs to the risk it was armed on: a new figure disarms it
  // and clears the last run, in the same commit as the change.
  const [seenRisk, setSeenRisk] = React.useState(risk);
  if (seenRisk !== risk) {
    setSeenRisk(risk);
    setArmed(false);
    setRan(false);
  }

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const chipRef = React.useRef<HTMLSpanElement | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [chipWidth, setChipWidth] = React.useState(0);
  React.useEffect(() => {
    const track = trackRef.current;
    const chip = chipRef.current;
    if (!track || !chip) return;
    const observer = new ResizeObserver(() => {
      setTrackWidth(track.offsetWidth);
      setChipWidth(chip.offsetWidth);
    });
    observer.observe(track);
    observer.observe(chip);
    return () => observer.disconnect();
  }, []);

  // The chip's centre sits on the fill's edge, held inside the row at both
  // ends so a 0 or a 1 never pushes it past the track.
  const half = chipWidth / 2;
  const edge = value * trackWidth;
  const chipX =
    trackWidth > 0 && chipWidth > 0
      ? Math.round(Math.min(Math.max(edge, half), trackWidth - half) - half)
      : 0;

  const press = () => {
    if (highBand && !armed) {
      setArmed(true);
      onArmChange?.(true);
      return;
    }
    if (armed) {
      setArmed(false);
      onArmChange?.(false);
    }
    setRan(true);
    onRun?.();
  };

  const announcement = ran
    ? `Ran ${action}`
    : armed
      ? "Confirm armed"
      : `${bandWord} risk`;

  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          id={actionId}
          title={action}
          className="min-w-0 truncate text-sm font-medium"
        >
          {action}
        </span>
        <button
          type="button"
          onClick={press}
          onKeyDown={(event) => {
            if (event.key === "Escape" && armed) {
              event.preventDefault();
              setArmed(false);
              onArmChange?.(false);
            }
          }}
          aria-describedby={armed ? hintId : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors duration-300 outline-none",
            armed
              ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <WordRoll
            words={[runLabel, confirmLabel]}
            active={armed ? 1 : 0}
            motionSafe={motionSafe}
          />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* The row is exactly the chip's height; the chip is absolute only so
            its x can follow the fill without reflowing the track. */}
        <div className="relative h-5" aria-hidden>
          <motion.span
            ref={chipRef}
            className={cn(
              "absolute top-0 left-0 inline-flex h-5 items-center rounded-full border bg-surface-1 px-2 text-[11px] font-medium transition-colors duration-300",
              CHIP_TONE[band],
            )}
            initial={false}
            animate={{ x: chipX }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <WordRoll words={bands} active={band} motionSafe={motionSafe} />
          </motion.span>
        </div>

        <div
          ref={trackRef}
          role="meter"
          aria-labelledby={actionId}
          aria-valuenow={Number(value.toFixed(2))}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuetext={`${bandWord} risk, ${percent} percent`}
          className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-0 origin-left rounded-full transition-colors duration-300",
              FILL_TONE[band],
            )}
            initial={false}
            animate={{ scaleX: round3(value) }}
            transition={fillTransition}
          />
          {thresholds.map((threshold, index) => (
            <span
              key={index === 0 ? "moderate" : "high"}
              aria-hidden
              style={{ left: `${round3(clamp01(threshold) * 100)}%` }}
              className="absolute top-0 h-full w-px -translate-x-1/2 bg-ink-3/60"
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-ink-3">
          <span>Risk</span>
          <span className="font-mono tabular-nums">{percent}%</span>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        Press again to confirm.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
