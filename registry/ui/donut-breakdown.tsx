"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const PALETTE = [
  "oklch(0.62 0.2 262)",
  "oklch(0.72 0.15 162)",
  "oklch(0.74 0.19 350)",
  "oklch(0.78 0.15 52)",
  "oklch(0.8 0.14 190)",
  "oklch(0.68 0.18 300)",
  "oklch(0.8 0.15 86)",
  "oklch(0.7 0.17 25)",
];

const CX = 60;
const CY = 60;
const R = 44;
const EXPLODE = 5;

export type DonutSegment = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

export type DonutBreakdownProps = {
  ref?: React.Ref<HTMLDivElement>;
  segments: DonutSegment[];
  /** Formats the centre and legend readouts. */
  format?: (value: number) => string;
  /** Heading for the default centre readout. @default "Total" */
  totalLabel?: string;
  className?: string;
};

/**
 * A donut whose segments draw themselves in around the ring in turn. Hovering a
 * slice — or focusing its legend entry — pops it outward and swaps the centre
 * readout to that slice's share; the legend carries the data for assistive tech.
 * Under reduced motion the ring lands whole with no draw or pop.
 */
export function DonutBreakdown({
  ref,
  segments,
  format = (value) => value.toLocaleString(),
  totalLabel = "Total",
  className,
}: DonutBreakdownProps) {
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState<number | null>(null);

  const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
  const arcs = segments.map((seg, index) => {
    const frac = seg.value / total;
    const startFrac =
      segments.slice(0, index).reduce((sum, prior) => sum + prior.value, 0) /
      total;
    const midDeg = -90 + (startFrac + frac / 2) * 360;
    const midRad = (midDeg * Math.PI) / 180;
    return {
      ...seg,
      frac,
      startDeg: -90 + startFrac * 360,
      dx: Math.cos(midRad) * EXPLODE,
      dy: Math.sin(midRad) * EXPLODE,
      color: seg.color ?? PALETTE[index % PALETTE.length] ?? PALETTE[0],
      pct: Math.round(frac * 100),
    };
  });

  const activeArc = active !== null ? arcs[active] : null;
  const summary = arcs
    .map((arc) => `${arc.label} ${arc.pct}%`)
    .join(", ");

  return (
    <div
      ref={ref}
      className={cn("flex flex-wrap items-center gap-5", className)}
    >
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg
          viewBox="0 0 120 120"
          className="h-[140px] w-[140px] -rotate-0"
          role="img"
          aria-label={`Breakdown: ${summary}`}
        >
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth="14"
          />
          {arcs.map((arc, index) => (
            <motion.g
              key={arc.id}
              animate={{
                x: active === index ? arc.dx : 0,
                y: active === index ? arc.dy : 0,
              }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              style={{ cursor: "pointer" }}
            >
              <motion.circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={active === index ? 16 : 14}
                strokeLinecap="butt"
                style={{
                  rotate: arc.startDeg,
                  transformBox: "view-box",
                  transformOrigin: `${CX}px ${CY}px`,
                }}
                initial={motionSafe ? { pathLength: 0 } : { pathLength: arc.frac }}
                animate={{ pathLength: arc.frac }}
                transition={
                  motionSafe
                    ? {
                        pathLength: {
                          delay: index * cascade(arcs.length),
                          duration: durations.slow,
                          ease: easings.enter,
                        },
                        strokeWidth: springs.snap,
                      }
                    : { duration: 0 }
                }
              />
            </motion.g>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-ink text-2xl leading-none font-semibold tabular-nums">
              {activeArc ? `${activeArc.pct}%` : format(total)}
            </p>
            <p className="text-ink-3 mt-1 max-w-[90px] truncate text-xs">
              {activeArc ? activeArc.label : totalLabel}
            </p>
          </div>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {arcs.map((arc, index) => (
          <li key={arc.id}>
            <button
              type="button"
              aria-pressed={active === index}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className={cn(
                "focus-visible:ring-cobalt-bright/50 flex w-full items-center gap-2.5 rounded-2 px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                active === index ? "bg-surface-2" : "hover:bg-surface-1",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: arc.color }}
              />
              <span className="text-ink flex-1 truncate text-sm">
                {arc.label}
              </span>
              <span className="text-ink-2 shrink-0 font-mono text-xs tabular-nums">
                {format(arc.value)}
              </span>
              <span className="text-ink-3 w-9 shrink-0 text-right font-mono text-xs tabular-nums">
                {arc.pct}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
