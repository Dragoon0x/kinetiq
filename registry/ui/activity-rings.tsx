"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ActivityRing = {
  /** Fraction 0..1. Values ≥ 1 fill fully and earn the completion bump. */
  value: number;
  label: string;
  /** Value-arc color. Defaults to the signal token (cobalt). */
  color?: string;
};

export type ActivityRingsProps = {
  /** Rendered outer → inner: the first entry is the outermost ring. */
  rings: ActivityRing[];
  /** Px diameter. Default 200. */
  size?: number;
  /** Per-ring stroke width in px. Default derived from `size`. */
  strokeWidth?: number;
  /** Px gap between concentric rings. Default derived from `strokeWidth`. */
  gap?: number;
  /** Optional center content, e.g. a total. */
  center?: React.ReactNode;
  className?: string;
  /** Group label announced to assistive tech. */
  "aria-label"?: string;
  /** Change it to re-trigger the sweep. */
  replayKey?: number | string;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A completed ring pulses to this scale, then settles back on `recoil`. */
const BUMP_SCALE = 1.05;

/**
 * One concentric arc. Owns its own motion value so the hook order stays fixed
 * regardless of how the parent slices the list — the arc is driven by
 * `strokeDashoffset` derived from a 0→value motion value, and a completed ring
 * gets a brief `recoil` scale bump once its sweep lands.
 */
function Ring({
  ring,
  radius,
  strokeWidth,
  size,
  trackColor,
  delay,
  motionSafe,
  replayKey,
}: {
  ring: ActivityRing;
  radius: number;
  strokeWidth: number;
  size: number;
  trackColor: string;
  delay: number;
  motionSafe: boolean;
  replayKey: number | string;
}) {
  const target = clamp01(ring.value);
  const circumference = 2 * Math.PI * radius;
  const complete = target >= 1;
  const color = ring.color ?? "var(--signal)";

  // The fraction the visible arc represents; offset shrinks as it grows.
  const fraction = useMotionValue(motionSafe ? 0 : target);
  const dashOffset = useTransform(
    fraction,
    (f) => circumference * (1 - f),
  );
  // Completion bump lives on its own value so it never fights the sweep.
  const scale = useMotionValue(1);

  React.useEffect(() => {
    // Reduced motion: land on the final arc with no sweep or bump.
    if (!motionSafe) {
      fraction.set(target);
      scale.set(1);
      return;
    }

    fraction.set(0);
    scale.set(1);
    const sweep = animate(fraction, target, {
      ...springs.glide,
      delay,
    });

    let bump: ReturnType<typeof animate> | undefined;
    if (complete) {
      // Celebrate only after the arc has visibly filled.
      sweep.then(() => {
        bump = animate(scale, [1, BUMP_SCALE, 1], springs.recoil);
      });
    }

    return () => {
      sweep.stop();
      bump?.stop();
    };
    // replayKey re-runs the whole sweep; fraction/scale are stable refs.
  }, [fraction, scale, target, complete, delay, motionSafe, replayKey]);

  const percent = Math.round(target * 100);

  return (
    <motion.g
      style={{ scale, originX: "50%", originY: "50%" }}
      role="progressbar"
      aria-label={ring.label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${ring.label}: ${percent}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: dashOffset }}
      />
    </motion.g>
  );
}

/**
 * Concentric arc rings that sweep from empty to their value on mount, each a
 * rounded-cap stroke starting at 12 o'clock. Starts stagger on `cascade` so
 * the sweep reads as one calibrated gesture; a ring that reaches 100% earns a
 * brief `recoil` bump to celebrate. The center slot holds an optional summary,
 * and a legend keeps every value readable without relying on color. Reduced
 * motion lands each arc at its final value instantly with only an opacity fade.
 */
export function ActivityRings({
  rings,
  size = 200,
  strokeWidth,
  gap,
  center,
  className,
  "aria-label": ariaLabel = "Activity rings",
  replayKey = 0,
}: ActivityRingsProps) {
  const motionSafe = useMotionSafe();

  const stroke = strokeWidth ?? Math.max(6, Math.round(size * 0.085));
  const ringGap = gap ?? Math.round(stroke * 0.55);
  const trackColor = "var(--hairline-strong)";
  const stagger = cascade(rings.length);

  // Outer ring hugs the edge; each inner ring steps in by one stroke + gap.
  const outerRadius = size / 2 - stroke / 2;
  const step = stroke + ringGap;

  return (
    <motion.div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5",
        className,
      )}
      initial={motionSafe ? undefined : { opacity: 0 }}
      animate={motionSafe ? undefined : { opacity: 1 }}
      transition={
        motionSafe ? undefined : { duration: durations.base, ease: easings.enter }
      }
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          fill="none"
          aria-hidden
          // Rotate so every arc starts at 12 o'clock and sweeps clockwise.
          className="-rotate-90"
        >
          {rings.map((ring, index) => {
            const radius = outerRadius - index * step;
            return (
              <Ring
                key={index}
                ring={ring}
                radius={Math.max(radius, stroke / 2)}
                strokeWidth={stroke}
                size={size}
                trackColor={trackColor}
                delay={index * stagger}
                motionSafe={motionSafe}
                replayKey={replayKey}
              />
            );
          })}
        </svg>
        {center != null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            {center}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {rings.map((ring, index) => {
          const percent = Math.round(clamp01(ring.value) * 100);
          return (
            <li
              key={index}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ring.color ?? "var(--signal)" }}
              />
              <span className="text-ink-2">{ring.label}</span>
              <span className="text-label ml-auto text-ink-3 tabular-nums">
                {percent}%
              </span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
