"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const COBALT = "oklch(0.62 0.2 262)";
const A0 = 135;
const SWEEP = 270;
const CX = 50;
const CY = 50;
const R = 38;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Arc path across a fraction range of the 270° sweep. */
function arcPath(r: number, f0: number, f1: number): string {
  const a0 = A0 + f0 * SWEEP;
  const a1 = A0 + f1 * SWEEP;
  const [x0, y0] = polar(CX, CY, r, a0);
  const [x1, y1] = polar(CX, CY, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export type Gauge = {
  id: string;
  label: string;
  value: number;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  unit?: string;
  /** Values at or above this sit in the red zone. */
  redline?: number;
};

export type GaugeClusterProps = {
  ref?: React.Ref<HTMLDivElement>;
  gauges: Gauge[];
  className?: string;
};

function GaugeDial({ gauge, motionSafe }: { gauge: Gauge; motionSafe: boolean }) {
  const min = gauge.min ?? 0;
  const max = gauge.max ?? 100;
  const span = max - min;
  const clamped = Math.max(min, Math.min(max, gauge.value));
  const f = span > 0 ? (clamped - min) / span : 0;
  const rf =
    gauge.redline != null && span > 0
      ? Math.max(0, Math.min(1, (gauge.redline - min) / span))
      : null;
  const inRed = gauge.redline != null && gauge.value >= gauge.redline;

  const progress = useMotionValue(motionSafe ? 0 : f);
  React.useEffect(() => {
    const controls = animate(
      progress,
      f,
      motionSafe ? { ...springs.glide } : { duration: 0 },
    );
    return () => controls.stop();
  }, [f, motionSafe, progress]);

  const rotate = useTransform(progress, (p) => A0 + p * SWEEP + 90);
  const valueColor = inRed ? "var(--danger)" : COBALT;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div
      role="meter"
      aria-label={gauge.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={`${gauge.value}${gauge.unit ?? ""}`}
      className="flex w-[104px] shrink-0 flex-col items-center"
    >
      <svg viewBox="0 0 100 82" className="w-full">
        <path
          d={arcPath(R, 0, 1)}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {rf != null && (
          <path
            d={arcPath(R, rf, 1)}
            fill="none"
            stroke="var(--danger)"
            strokeOpacity={0.28}
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}
        {ticks.map((t) => {
          const [x1, y1] = polar(CX, CY, R - 6, A0 + t * SWEEP);
          const [x2, y2] = polar(CX, CY, R + 6, A0 + t * SWEEP);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
          );
        })}
        <motion.path
          d={arcPath(R, 0, 1)}
          fill="none"
          stroke={valueColor}
          strokeWidth="7"
          strokeLinecap="round"
          style={{ pathLength: progress }}
        />
        <motion.line
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - R + 5}
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            rotate,
            transformBox: "view-box",
            transformOrigin: `${CX}px ${CY}px`,
          }}
        />
        <circle cx={CX} cy={CY} r="4" fill="var(--ink)" />
        <circle cx={CX} cy={CY} r="1.6" fill="var(--card)" />
      </svg>
      <div className="-mt-3 flex flex-col items-center">
        <span
          className="text-ink text-lg font-semibold tabular-nums"
          style={inRed ? { color: "var(--danger)" } : undefined}
        >
          {gauge.value}
          {gauge.unit && (
            <span className="text-ink-3 ml-0.5 text-xs font-normal">
              {gauge.unit}
            </span>
          )}
        </span>
        <span className="text-ink-3 text-[11px]">{gauge.label}</span>
      </div>
    </div>
  );
}

/**
 * A row of needle gauges. On mount each needle sweeps up from rest to its value
 * on `glide` while the arc fills in behind it, and any reading in the red zone
 * turns its arc and readout to the danger colour. Reads as a `meter` per dial.
 * Under reduced motion the needles and arcs land at their value with no sweep.
 */
export function GaugeCluster({ ref, gauges, className }: GaugeClusterProps) {
  const motionSafe = useMotionSafe();
  return (
    <div
      ref={ref}
      className={cn("flex flex-wrap items-start justify-center gap-2", className)}
    >
      {gauges.map((gauge) => (
        <GaugeDial key={gauge.id} gauge={gauge} motionSafe={motionSafe} />
      ))}
    </div>
  );
}
