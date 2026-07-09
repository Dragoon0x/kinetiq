"use client";

import * as React from "react";

import { animate, useMotionValue, useMotionValueEvent } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RadialBar = {
  label: string;
  value: number;
  /** Wedge color; defaults to a slot from the built-in palette. */
  color?: string;
};

export type RadialBarsProps = {
  data: RadialBar[];
  /** Value that reaches the outer radius. Defaults to the data max. */
  max?: number;
  /** Diameter in px. @default 260 */
  size?: number;
  /** Formats the value for the hub readout. @default String */
  format?: (value: number) => string;
  className?: string;
  "aria-label"?: string;
};

/** Deterministic, theme-independent chart palette — reads on dark and light. */
const PALETTE = [
  "oklch(0.62 0.2 262)", // cobalt
  "oklch(0.72 0.15 162)", // signal green
  "oklch(0.74 0.19 350)", // magenta
  "oklch(0.78 0.15 52)", // amber
  "oklch(0.8 0.14 190)", // teal
  "oklch(0.68 0.18 300)", // violet
  "oklch(0.8 0.15 86)", // gold
  "oklch(0.7 0.17 25)", // coral
];

const TAU = Math.PI * 2;

/** Annular-sector path: the arc from inner→outer at [a0,a1], closed. */
function wedgePath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  const point = (r: number, a: number) =>
    `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${point(r1, a0)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${point(r1, a1)}`,
    `L ${point(r0, a1)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${point(r0, a0)}`,
    "Z",
  ].join(" ");
}

/**
 * A polar bar chart. Each datum is a wedge that radiates from a central hub,
 * its radial length proportional to its value; on arrival the wedges grow
 * outward on `glide`, staggered under one cascade budget. Hovering or focusing
 * a wedge brightens it, dims the rest, and prints its label and value in the
 * hub. Every wedge is a focusable, labelled data point, so the chart is fully
 * operable by keyboard, and an sr-only list carries the same numbers.
 *
 * Reduced motion: the wedges render at full length immediately with no grow;
 * the highlight is color only.
 */
export function RadialBars({
  data,
  max,
  size = 260,
  format = String,
  className,
  "aria-label": ariaLabel = "Radial bar chart",
}: RadialBarsProps) {
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState<number | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * 0.17;
  const outerR = size * 0.46;
  const count = data.length;
  const ceiling =
    (max ?? data.reduce((m, d) => Math.max(m, d.value), 0)) || 1;
  const stagger = cascade(Math.max(count, 1));
  const slice = count > 0 ? TAU / count : TAU;
  const gap = slice * 0.22;

  const activeBar = active !== null ? data[active] : undefined;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex flex-col items-center gap-4", className)}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
        >
          {/* Hub ring — the datum baseline. */}
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={1}
          />
          {data.map((bar, index) => {
            const a0 = -TAU / 4 + index * slice + gap / 2;
            const a1 = -TAU / 4 + (index + 1) * slice - gap / 2;
            const color = bar.color ?? PALETTE[index % PALETTE.length] ?? PALETTE[0]!;
            const value01 = Math.max(0, Math.min(1, bar.value / ceiling));
            const dimmed = active !== null && active !== index;
            return (
              <Wedge
                key={`${bar.label}-${index}`}
                readout={`${bar.label}: ${format(bar.value)}`}
                color={color}
                cx={cx}
                cy={cy}
                innerR={innerR}
                outerR={outerR}
                a0={a0}
                a1={a1}
                value01={value01}
                delay={index * stagger}
                dimmed={dimmed}
                active={active === index}
                motionSafe={motionSafe}
                onEnter={() => setActive(index)}
                onLeave={() =>
                  setActive((current) => (current === index ? null : current))
                }
              />
            );
          })}
        </svg>

        {/* Hub readout — the active datum, or a resting prompt. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {activeBar ? (
            <>
              <span className="text-label text-ink-3">{activeBar.label}</span>
              <span className="text-foreground mt-0.5 font-mono text-lg font-semibold tabular-nums">
                {format(activeBar.value)}
              </span>
            </>
          ) : (
            <span className="text-label text-ink-3">
              {String(count).padStart(2, "0")} · SERIES
            </span>
          )}
        </div>
      </div>

      {/* Legibility without color or interaction. */}
      <ul className="sr-only">
        {data.map((bar, index) => (
          <li key={`${bar.label}-${index}`}>
            {bar.label}: {format(bar.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

type WedgeProps = {
  readout: string;
  color: string;
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  a0: number;
  a1: number;
  value01: number;
  delay: number;
  dimmed: boolean;
  active: boolean;
  motionSafe: boolean;
  onEnter: () => void;
  onLeave: () => void;
};

/**
 * One wedge. Owns a `grow` value (0→1) so hooks stay fixed regardless of how
 * many bars the parent slices; the path is rewritten imperatively as it grows,
 * so a 60fps entrance costs no React renders.
 */
function Wedge({
  readout,
  color,
  cx,
  cy,
  innerR,
  outerR,
  a0,
  a1,
  value01,
  delay,
  dimmed,
  active,
  motionSafe,
  onEnter,
  onLeave,
}: WedgeProps) {
  const grow = useMotionValue(motionSafe ? 0 : 1);
  const pathRef = React.useRef<SVGPathElement | null>(null);

  const draw = React.useCallback(
    (g: number) => {
      const r1 = innerR + (outerR - innerR) * value01 * g;
      // Keep a sliver so a zero-value wedge is still a hit target.
      pathRef.current?.setAttribute(
        "d",
        wedgePath(cx, cy, innerR, Math.max(innerR + 0.5, r1), a0, a1),
      );
    },
    [cx, cy, innerR, outerR, value01, a0, a1],
  );

  useMotionValueEvent(grow, "change", draw);

  React.useEffect(() => {
    draw(motionSafe ? grow.get() : 1);
    if (!motionSafe) {
      grow.set(1);
      return;
    }
    grow.set(0);
    const controls = animate(grow, 1, { ...springs.glide, delay });
    return () => controls.stop();
  }, [draw, grow, motionSafe, delay]);

  return (
    <path
      ref={pathRef}
      role="img"
      tabIndex={0}
      aria-label={readout}
      fill={color}
      stroke={active ? "var(--signal)" : "transparent"}
      strokeWidth={active ? 1.5 : 0}
      opacity={dimmed ? 0.3 : active ? 1 : 0.9}
      style={{
        cursor: "pointer",
        outline: "none",
        transition: "opacity 180ms ease, stroke 180ms ease",
      }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    />
  );
}
