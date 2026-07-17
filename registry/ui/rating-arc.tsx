"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RatingArcProps = {
  /** Controlled rating, 0..max. */
  value?: number;
  /** Initial rating for uncontrolled usage. @default 0 */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Top of the scale. @default 5 */
  max?: number;
  /** Granularity. 0.5 gives half marks. @default 1 */
  step?: number;
  /** Names the control for assistive tech. @default "Rating" */
  label?: string;
  /** Renders `value of max` beneath the arc. @default true */
  readout?: boolean;
  className?: string;
};

/** The arc spans 220°, centred on twelve o'clock, opening at the bottom. */
const SWEEP = 220;
const START = -SWEEP / 2;
const R = 88;
const CX = 110;
const CY = 100;
const RAD = Math.PI / 180;

/** Angle measured from twelve o'clock, clockwise — the dial convention. */
const pointAt = (phi: number): [number, number] => [
  CX + R * Math.sin(phi * RAD),
  CY - R * Math.cos(phi * RAD),
];

const arcPath = (): string => {
  const [x0, y0] = pointAt(START);
  const [x1, y1] = pointAt(START + SWEEP);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

const TRACK = arcPath();

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * A rating that fills along an arc. The score is a fraction of a 220° sweep, so
 * the fill draws itself with `pathLength` and the thumb rides a rotated wrapper
 * — it travels the curve rather than cutting the chord a plain x/y tween would.
 *
 * Sweeping the arc paints a ghost of the score you would commit, driven straight
 * off motion values so a pointer move never costs a React render; clicking or
 * dragging commits it on `snap`, and the ghost lifts when the pointer leaves.
 * `step` of 0.5 gives half marks.
 *
 * It reports as a slider: arrows step, Home and End jump to the ends, and
 * `aria-valuetext` reads the score aloud rather than a bare number. Under
 * reduced motion the fill and thumb land in a single frame — same scale, same
 * commits, same announcements.
 */
export function RatingArc({
  value,
  defaultValue = 0,
  onValueChange,
  max = 5,
  step = 1,
  label = "Rating",
  readout = true,
  className,
}: RatingArcProps) {
  const motionSafe = useMotionSafe();
  const trackRef = React.useRef<SVGSVGElement>(null);
  const draggingRef = React.useRef(false);

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const score = clamp(isControlled ? value : uncontrolled, 0, max);

  /** The drawn fraction. Everything visual derives from it. */
  const fill = useMotionValue(score / max);
  const phi = useTransform(fill, (t) => START + t * SWEEP);
  const ghost = useMotionValue(0);
  const ghostOn = useMotionValue(0);

  // The score is the source of truth; the fill follows it (and any controlled
  // change from the parent) rather than the other way round.
  React.useEffect(() => {
    const target = score / max;
    if (!motionSafe) {
      fill.set(target);
      return;
    }
    const controls = animate(fill, target, springs.snap);
    return () => controls.stop();
  }, [score, max, motionSafe, fill]);

  const commit = (next: number) => {
    const snapped = clamp(Math.round(next / step) * step, 0, max);
    if (snapped === score) return;
    if (!isControlled) setUncontrolled(snapped);
    onValueChange?.(snapped);
  };

  /** Pointer position → a score, by its bearing from the dial's centre. */
  const scoreAt = (clientX: number, clientY: number): number => {
    const svg = trackRef.current;
    if (!svg) return score;
    const rect = svg.getBoundingClientRect();
    // The viewBox is 220 wide; map the client point back into its space.
    const scale = rect.width / 220;
    const x = (clientX - rect.left) / scale - CX;
    const y = (clientY - rect.top) / scale - CY;
    // Bearing from twelve o'clock, clockwise, in (-180, 180].
    const deg = Math.atan2(x, -y) / RAD;
    return clamp((deg - START) / SWEEP, 0, 1) * max;
  };

  const paintGhost = (clientX: number, clientY: number) => {
    const snapped = clamp(Math.round(scoreAt(clientX, clientY) / step) * step, 0, max);
    ghost.set(snapped / max);
    ghostOn.set(1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = score + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = score - step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const ticks = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div className={cn("flex w-full max-w-[260px] flex-col items-center", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={`${score} of ${max}`}
        onKeyDown={handleKeyDown}
        className="rounded-3 outline-none focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="relative w-full">
          <svg
            ref={trackRef}
            viewBox="0 0 220 145"
            className="w-full cursor-pointer touch-none select-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              draggingRef.current = true;
              commit(scoreAt(event.clientX, event.clientY));
              paintGhost(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              paintGhost(event.clientX, event.clientY);
              if (draggingRef.current) commit(scoreAt(event.clientX, event.clientY));
            }}
            onPointerUp={(event) => {
              draggingRef.current = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            onPointerLeave={() => {
              ghostOn.set(0);
            }}
          >
            {/* the unscored track */}
            <path
              d={TRACK}
              fill="none"
              stroke="var(--border)"
              strokeWidth={10}
              strokeLinecap="round"
            />
            {/* the score you would commit */}
            <motion.path
              d={TRACK}
              fill="none"
              stroke="var(--accent-bright)"
              strokeWidth={10}
              strokeLinecap="round"
              opacity={0.28}
              style={{ pathLength: ghost, opacity: ghostOn }}
            />
            {/* the score */}
            <motion.path
              d={TRACK}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={10}
              strokeLinecap="round"
              style={{ pathLength: fill }}
            />
            {ticks.map((tick) => {
              const [x, y] = pointAt(START + (tick / max) * SWEEP);
              return (
                <circle
                  key={tick}
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="var(--muted-foreground)"
                  opacity={0.5}
                />
              );
            })}

            {/* The thumb rides a group rotated about the dial's centre, so it
                travels the curve instead of cutting the chord an x/y tween
                would. `transform-box: view-box` resolves the origin in viewBox
                units, so it stays true at any rendered size. */}
            <motion.g
              style={{
                rotate: phi,
                transformOrigin: `${CX}px ${CY}px`,
                transformBox: "view-box",
              }}
            >
              <circle
                cx={CX}
                cy={CY - R}
                r={7}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth={3}
              />
            </motion.g>
          </svg>
        </div>
      </div>

      {readout && (
        <p className="text-muted-foreground mt-1 font-mono text-[11px] tracking-[0.08em] uppercase">
          <span className="text-[var(--signal,var(--primary))]">{score}</span> of{" "}
          {max}
        </p>
      )}
    </div>
  );
}
