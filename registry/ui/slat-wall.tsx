"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type SlatWallProps = {
  /** The wall's two faces — full-size content, sliced across the slats. */
  a: React.ReactNode;
  b: React.ReactNode;
  /** Controlled facing side. */
  side?: "a" | "b";
  defaultSide?: "a" | "b";
  onSideChange?: (side: "a" | "b") => void;
  /** Louver count. @default 7 */
  slats?: number;
  /** Wall height in px. @default 220 */
  height?: number;
  className?: string;
  /** Names the switch, e.g. "Roster and readings". */
  "aria-label": string;
};

/**
 * A louver wall — the content is sliced across horizontal slats, and toggling
 * rotates every slat on its own axis in a cascading wave from the top, the
 * whole sweep held inside the choreography budget. Each slat is a window onto
 * the full face, so any content survives the slicing. The wall is one real
 * switch button. Under reduced motion the faces crossfade whole.
 */
export function SlatWall({
  a,
  b,
  side: sideProp,
  defaultSide = "a",
  onSideChange,
  slats = 7,
  height = 220,
  className,
  "aria-label": ariaLabel,
}: SlatWallProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState<"a" | "b">(
    defaultSide,
  );
  const side = sideProp ?? uncontrolled;
  const showingB = side === "b";

  const count = Math.min(Math.max(slats, 3), 10);
  const slatHeight = height / count;
  const step = cascade(count);

  const toggle = () => {
    const next = showingB ? "a" : "b";
    if (sideProp === undefined) setUncontrolled(next);
    onSideChange?.(next);
  };

  /** A slat-sized window onto a full face, offset to its slice. */
  const faceWindow = (node: React.ReactNode, index: number) => (
    <span
      aria-hidden
      className="absolute inset-x-0 top-0"
      style={{ height, transform: `translateY(${-index * slatHeight}px)` }}
    >
      {node}
    </span>
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={showingB}
      aria-label={ariaLabel}
      onClick={toggle}
      style={{ perspective: perspectives.base }}
      className={cn(
        "border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/50 relative block w-full overflow-hidden rounded-3 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      <span aria-hidden className="block" style={{ height }}>
        {motionSafe ? (
          Array.from({ length: count }, (_, i) => (
            <motion.span
              // Slat order is fixed; index keys are stable here.
              key={i}
              initial={false}
              animate={{ rotateX: showingB ? 180 : 0 }}
              transition={{ ...springs.snap, delay: i * step }}
              className="absolute inset-x-0 block"
              style={{
                top: i * slatHeight,
                height: slatHeight,
                transformStyle: "preserve-3d",
              }}
            >
              {/* face A */}
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ backfaceVisibility: "hidden" }}
              >
                {faceWindow(a, i)}
              </span>
              {/* face B — pre-flipped so it lands readable */}
              <span
                className="absolute inset-0 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateX(180deg)",
                }}
              >
                {faceWindow(b, i)}
              </span>
            </motion.span>
          ))
        ) : (
          <motion.span
            key={side}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast }}
            className="absolute inset-0 block"
          >
            {showingB ? b : a}
          </motion.span>
        )}
      </span>
      <span className="sr-only" aria-live="polite">
        {showingB ? "Second face" : "First face"}
      </span>
    </button>
  );
}
