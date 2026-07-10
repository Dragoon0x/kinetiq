"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type HorizonSection = {
  id: string;
  node: React.ReactNode;
};

export type HorizonRiseProps = {
  /** Sections that rise as they enter the viewport. */
  sections: HorizonSection[];
  /** Animate each section only on its first entrance. @default true */
  once?: boolean;
  /** Scrollable stage height in px; omit to ride the page scroll. */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Sections that rise from below a ground-plane horizon — each one lies flat
 * beyond the line (tipped back in perspective, sunk and dim) until scroll
 * carries it into view, then stands upright on the glide spring. A horizon
 * graphic with converging grid lines anchors the plane. Works against its own
 * scroll stage (pass height) or the page. Under reduced motion sections
 * simply fade in place.
 */
export function HorizonRise({
  sections,
  once = true,
  height,
  className,
  "aria-label": ariaLabel = "Rising sections",
}: HorizonRiseProps) {
  const motionSafe = useMotionSafe();
  const stageRef = React.useRef<HTMLDivElement>(null);

  const hidden = motionSafe
    ? { opacity: 0, y: 64, rotateX: 34, scale: 0.96 }
    : { opacity: 0 };
  const risen = motionSafe
    ? { opacity: 1, y: 0, rotateX: 0, scale: 1 }
    : { opacity: 1 };

  return (
    <div className={cn("w-full", className)}>
      {/* the horizon — a line with a converging ground grid */}
      <div aria-hidden className="relative mb-4 h-10 overflow-hidden">
        <span className="bg-hairline-strong absolute right-0 bottom-0 left-0 h-px" />
        {[18, 38, 50, 62, 82].map((x) => (
          <span
            key={x}
            className="bg-hairline absolute bottom-0 h-10 w-px origin-bottom"
            style={{ left: `${x}%`, transform: `rotate(${(x - 50) * 0.5}deg)` }}
          />
        ))}
        <span className="text-label text-ink-3 absolute right-0 bottom-1.5">
          HORIZON
        </span>
      </div>

      <div
        ref={stageRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={height ? 0 : undefined}
        style={
          height
            ? { height, perspective: perspectives.far }
            : { perspective: perspectives.far }
        }
        className={cn(
          "space-y-5",
          height &&
            "focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 pr-1 outline-none focus-visible:ring-2",
        )}
      >
        {sections.map((section) => (
          <motion.section
            key={section.id}
            initial={hidden}
            whileInView={risen}
            viewport={{
              once,
              amount: 0.35,
              ...(height ? { root: stageRef } : {}),
            }}
            transition={
              motionSafe ? springs.glide : { duration: durations.base }
            }
            style={motionSafe ? { transformOrigin: "50% 100%" } : undefined}
          >
            {section.node}
          </motion.section>
        ))}
      </div>
    </div>
  );
}
