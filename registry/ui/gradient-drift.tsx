"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Blob = {
  color: string;
  size: string;
  top: string;
  left: string;
  x: number[];
  y: number[];
  scale: number[];
  duration: number;
};

const BLOBS: Blob[] = [
  {
    color: "oklch(0.66 0.2 262 / 0.5)",
    size: "62%",
    top: "-18%",
    left: "-12%",
    x: [0, 18, -8, 0],
    y: [0, 12, 22, 0],
    scale: [1, 1.14, 0.96, 1],
    duration: 17,
  },
  {
    color: "oklch(0.74 0.16 196 / 0.42)",
    size: "56%",
    top: "8%",
    left: "44%",
    x: [0, -16, 10, 0],
    y: [0, 16, -10, 0],
    scale: [1, 0.92, 1.12, 1],
    duration: 21,
  },
  {
    color: "oklch(0.72 0.19 344 / 0.4)",
    size: "50%",
    top: "40%",
    left: "12%",
    x: [0, 14, -12, 0],
    y: [0, -14, 8, 0],
    scale: [1, 1.1, 0.94, 1],
    duration: 19,
  },
];

export type GradientDriftProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** px stage height when standalone. @default 300 */
  height?: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * An ambient backdrop of soft gradient blobs that drift and breathe past each
 * other — pure CSS and transforms, no canvas or WebGL. Each blob follows its own
 * slow mirrored loop at a different tempo, so the field never visibly repeats.
 * Heavy blur melts them into a single wash behind your content. Under reduced
 * motion the blobs hold a fixed, composed arrangement.
 */
export function GradientDrift({
  ref,
  height = 300,
  className,
  children,
}: GradientDriftProps) {
  const motionSafe = useMotionSafe();

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      style={{ height }}
    >
      <div aria-hidden className="absolute inset-0 blur-3xl">
        {BLOBS.map((blob, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: blob.size,
              paddingBottom: blob.size,
              top: blob.top,
              left: blob.left,
              background: `radial-gradient(circle at 50% 50%, ${blob.color}, transparent 70%)`,
            }}
            animate={
              motionSafe
                ? {
                    x: blob.x,
                    y: blob.y,
                    scale: blob.scale,
                    transition: {
                      duration: blob.duration,
                      ease: easings.move,
                      repeat: Infinity,
                      repeatType: "loop",
                    },
                  }
                : undefined
            }
          />
        ))}
      </div>
      {children != null && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}
