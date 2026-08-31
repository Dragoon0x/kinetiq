"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IsoLayer = { id: string; label: string };

export type VignetteIsoStackProps = {
  /** Bottom-up. */
  layers?: IsoLayer[];
  className?: string;
};

const DEFAULT_LAYERS: IsoLayer[] = [
  { id: "l1", label: "The record" },
  { id: "l2", label: "Constraints" },
  { id: "l3", label: "The cut" },
  { id: "l4", label: "Boards" },
];

/**
 * An isometric stack rising into place, each layer labelled on its edge —
 * the architecture scene, for heroes that want "layers of a system" without
 * a diagramming tool. Plates are CSS-transformed divs (rotate + skew), so
 * they theme like everything else and cost nothing to load. One image to
 * assistive tech, labelled bottom-up.
 *
 * Reduced motion: the stack stands assembled.
 */
export function VignetteIsoStack({
  layers = DEFAULT_LAYERS,
  className,
}: VignetteIsoStackProps) {
  const motionSafe = useMotionSafe();

  return (
    <div
      role="img"
      aria-label={`Layers, bottom up: ${layers.map((l) => l.label).join(", ")}`}
      className={cn("w-full max-w-xs", className)}
    >
      <div aria-hidden className="relative mx-auto h-56 w-56">
        {layers.map((layer, index) => (
          <motion.div
            key={layer.id}
            className="absolute left-1/2 w-40"
            style={{ bottom: 24 + index * 34, zIndex: index }}
            initial={{
              opacity: motionSafe ? 0 : 1,
              y: motionSafe ? -18 : 0,
            }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? {
                    duration: durations.slow,
                    ease: easings.enter,
                    delay: index * 0.16,
                  }
                : { duration: 0 }
            }
          >
            <div
              className={cn(
                "h-20 w-40 -translate-x-1/2 rounded-2 border border-hairline-strong",
                index === layers.length - 1
                  ? "border-primary/40 bg-primary/15"
                  : "bg-surface-1",
              )}
              style={{
                transform: "translateX(-50%) rotateX(55deg) rotateZ(-45deg)",
                transformStyle: "preserve-3d",
                boxShadow: "var(--shadow-raised, 0 1px 2px rgb(0 0 0 / 0.08))",
              }}
            />
            <span className="absolute top-1/2 left-full ml-1 -translate-y-1/2 font-mono text-[10px] tracking-[0.06em] whitespace-nowrap text-ink-3">
              {layer.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
