"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VignetteSearchSweepProps = {
  label?: string;
  className?: string;
};

type SweepLine = { width: number; top: number };

const LINES: SweepLine[] = [
  { width: 168, top: 12 },
  { width: 124, top: 44 },
  { width: 188, top: 76 },
  { width: 100, top: 108 },
  { width: 144, top: 140 },
];

const LOOP_SECONDS = 7;
const RUN = {
  duration: LOOP_SECONDS,
  repeat: Infinity,
  ease: "easeInOut" as const,
};

// Nine checkpoints on the shared clock: a hold at row 0, an arrival at each
// of the five rows, a dim-and-pop hold, a settle, then the reset.
const TIMES: number[] = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1];
const LOOP_TRANSITION = { ...RUN, times: TIMES };

const LENS_SIZE = 24;
// Top-left coordinates so the lens box (24px) is centered on each row.
const LENS_X: number[] = [22, 22, 176, 22, 176, 99, 99, 99, 22];
const LENS_Y: number[] = [4, 4, 36, 68, 100, 132, 132, 132, 4];
// Visible for the whole sweep; the last checkpoint fades it out while it
// drifts back to the start, so the reset cut lands while it is unseen.
const LENS_OPACITY: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 0];
const LENS_REST = { x: 99, y: 132 };

const LINE_DIM_OPACITY = 0.82;
const LINE_OPACITY: number[] = [
  1,
  1,
  1,
  1,
  1,
  1,
  LINE_DIM_OPACITY,
  LINE_DIM_OPACITY,
  1,
];

// "0" → 1.15 → 1, held past the settle so it reads before the reset cut.
const PIP_SCALE: number[] = [0, 0, 0, 0, 0, 0, 0, 1.15, 1];
const PIP_OPACITY: number[] = [0, 0, 0, 0, 0, 0, 0, 1, 1];

/**
 * Parts the neighbors of a line as the lens arrives at their shared row: the
 * line above lifts a few px, the line below drops, then both settle back.
 * Arrivals at rows 0–4 land on checkpoints 1–5 of TIMES; a plain function
 * of the index, not a hook, so it is safe to call once per line in a map.
 */
function linePartY(index: number): number[] {
  const frames: number[] = new Array(TIMES.length).fill(0);
  const belowArrival = index;
  const aboveArrival = index + 2;
  if (belowArrival >= 1 && belowArrival <= 5)
    frames[belowArrival] = distances.nudge;
  if (aboveArrival >= 1 && aboveArrival <= 5)
    frames[aboveArrival] = -distances.nudge;
  return frames;
}

/**
 * A no-results illustration: a lens roams a short stack of result lines,
 * and each line parts around it as it passes — the gap opening is the
 * picture of nothing being there. It settles at the last line, a small
 * "0" pip pops in, the lines dim, then the scene cuts back to the start.
 * Lens, lines, and pip are all authored keyframes sharing one clock and
 * one transition object, so the sweep can never drift out of sync with
 * itself. Presentational, marked as a single image to assistive tech.
 *
 * Reduced motion: the lens rests at its final row, the line above it
 * stays parted, both dim as at the end of a pass, and the "0" pip sits
 * in place — nothing moves.
 */
export function VignetteSearchSweep({
  label = "A search with no matches: a lens sweeps the list and each line parts to show nothing there",
  className,
}: VignetteSearchSweepProps) {
  const motionSafe = useMotionSafe();
  const [playing, setPlaying] = React.useState(true);
  const inViewRef = React.useRef(true);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const update = () => {
      setPlaying(inViewRef.current && document.visibilityState === "visible");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        inViewRef.current = entry ? entry.isIntersecting : true;
        update();
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const active = motionSafe && playing;
  // Off-screen/backgrounded freezes with a quick ease; reduced motion never
  // animates at all, so its transition duration must stay at zero.
  const staticTransition = motionSafe
    ? { duration: durations.fast, ease: easings.enter }
    : { duration: 0 };

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("w-full max-w-xs", className)}
    >
      <div
        ref={containerRef}
        aria-hidden
        className="relative mx-auto h-40 w-60 overflow-hidden rounded-4 border border-hairline bg-surface-1"
      >
        {LINES.map((line, index) => (
          <motion.div
            key={line.top}
            className="absolute rounded-full border border-hairline bg-surface-2"
            style={{ left: 12, top: line.top, width: line.width, height: 8 }}
            animate={
              active
                ? { y: linePartY(index), opacity: LINE_OPACITY }
                : {
                    y: index === 3 ? -distances.nudge : 0,
                    opacity: index === 3 || index === 4 ? LINE_DIM_OPACITY : 1,
                  }
            }
            transition={active ? LOOP_TRANSITION : staticTransition}
          />
        ))}

        <motion.div
          className="absolute top-0 left-0 grid place-items-center rounded-full border border-hairline bg-surface-0 text-ink-2 shadow-raised"
          style={{ width: LENS_SIZE, height: LENS_SIZE }}
          animate={
            active
              ? { x: LENS_X, y: LENS_Y, opacity: LENS_OPACITY }
              : { x: LENS_REST.x, y: LENS_REST.y, opacity: 1 }
          }
          transition={active ? LOOP_TRANSITION : staticTransition}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3.5 fill-none stroke-current"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="6.5" cy="6.5" r="4.2" />
            <path d="M12.5 12.5l-2.6-2.6" />
          </svg>
        </motion.div>

        <motion.div
          className="absolute grid place-items-center rounded-full border border-hairline bg-surface-0 font-mono text-[10px] text-ink-2"
          style={{ left: 148, top: 134, width: 20, height: 20 }}
          animate={
            active
              ? { scale: PIP_SCALE, opacity: PIP_OPACITY }
              : { scale: 1, opacity: 1 }
          }
          transition={active ? LOOP_TRANSITION : staticTransition}
        >
          0
        </motion.div>
      </div>
    </div>
  );
}
