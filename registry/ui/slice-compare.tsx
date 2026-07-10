"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type SliceCompareProps = {
  /** The scene left of the blade. */
  before: React.ReactNode;
  /** The scene right of the blade. */
  after: React.ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  /** Starting blade position, 0–100. @default 50 */
  defaultPosition?: number;
  onPositionChange?: (position: number) => void;
  /** Stage height in px. @default 220 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/**
 * A comparison divider struck as a blade — it parts two scenes in depth
 * rather than wiping a flat line. Dragging leans the blade into the travel
 * and it swings back plumb on release; the division is a clip on the upper
 * scene, and the blade casts a soft edge shadow both ways. The handle is a
 * real slider: arrows nudge by two, Page keys by ten. Under reduced motion
 * the blade stays plumb and moves 1:1.
 */
export function SliceCompare({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  defaultPosition = 50,
  onPositionChange,
  height = 220,
  className,
  "aria-label": ariaLabel = "Comparison blade",
}: SliceCompareProps) {
  const motionSafe = useMotionSafe();
  const stageRef = React.useRef<HTMLDivElement>(null);
  const target = useMotionValue(clamp(defaultPosition, 0, 100));
  const position = useSpring(target, GLIDE);
  const live = motionSafe ? position : target;
  const lean = useMotionValue(0);
  const leanControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const lastX = React.useRef<number | null>(null);
  const [announced, setAnnounced] = React.useState(() =>
    Math.round(clamp(defaultPosition, 0, 100)),
  );

  React.useEffect(
    () => () => {
      leanControls.current?.stop();
    },
    [],
  );

  const commit = (next: number) => {
    const v = clamp(next, 0, 100);
    target.set(v);
    const rounded = Math.round(v);
    setAnnounced(rounded);
    onPositionChange?.(rounded);
  };

  const settleLean = () => {
    leanControls.current?.stop();
    leanControls.current = animate(lean, 0, springs.snap);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastX.current = event.clientX;
    moveTo(event.clientX);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (motionSafe && lastX.current !== null) {
      const dx = event.clientX - lastX.current;
      leanControls.current?.stop();
      lean.set(clamp(dx * 0.6, -9, 9));
    }
    lastX.current = event.clientX;
    moveTo(event.clientX);
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    lastX.current = null;
    if (motionSafe) settleLean();
  };

  const moveTo = (clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    commit(((clientX - rect.left) / rect.width) * 100);
  };

  const clip = useTransform(live, (p) => `inset(0 ${100 - p}% 0 0)`);
  const bladeLeft = useTransform(live, (p) => `${p}%`);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ height }}
        className="border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none"
      >
        {/* after (base) */}
        <div aria-hidden className="absolute inset-0">
          {after}
        </div>
        {/* before (clipped to the left of the blade) */}
        <motion.div aria-hidden style={{ clipPath: clip }} className="absolute inset-0">
          {before}
        </motion.div>

        {/* the blade */}
        <motion.div
          style={{ left: bladeLeft, rotateZ: motionSafe ? lean : 0 }}
          className="absolute top-0 bottom-0 z-10 w-0 origin-center"
        >
          {/* cast shadows, both ways */}
          <span
            aria-hidden
            className="absolute top-0 bottom-0 -left-4 w-4 bg-gradient-to-l from-black/25 to-transparent"
          />
          <span
            aria-hidden
            className="absolute top-0 bottom-0 left-0 w-4 bg-gradient-to-r from-black/25 to-transparent"
          />
          {/* blade body + handle */}
          <span
            aria-hidden
            className="bg-cobalt-bright absolute top-0 bottom-0 -left-px w-0.5"
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={announced}
            aria-valuetext={`${announced}% ${beforeLabel}`}
            onKeyDown={(event) => {
              const step =
                event.key === "PageUp" || event.key === "PageDown" ? 10 : 2;
              if (event.key === "ArrowLeft" || event.key === "PageDown") {
                event.preventDefault();
                commit(target.get() - step);
              } else if (event.key === "ArrowRight" || event.key === "PageUp") {
                event.preventDefault();
                commit(target.get() + step);
              } else if (event.key === "Home") {
                event.preventDefault();
                commit(0);
              } else if (event.key === "End") {
                event.preventDefault();
                commit(100);
              }
            }}
            className="border-hairline-strong bg-surface-2 text-ink-2 focus-visible:ring-cobalt-bright/50 absolute top-1/2 left-1/2 flex h-9 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-2 border font-mono text-[9px] outline-none focus-visible:ring-2"
          >
            <span aria-hidden>||</span>
          </div>
        </motion.div>

        {/* corner labels */}
        <span className="text-label text-ink-2 bg-surface-0/70 absolute top-2 left-2 rounded-1 px-1.5 py-0.5 backdrop-blur-sm">
          {beforeLabel}
        </span>
        <span className="text-label text-ink-2 bg-surface-0/70 absolute top-2 right-2 rounded-1 px-1.5 py-0.5 backdrop-blur-sm">
          {afterLabel}
        </span>
      </div>
    </div>
  );
}
