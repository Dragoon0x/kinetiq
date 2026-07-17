"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const R = 14;
const STRING = 92;
const TOP = 12;
const AMP = 30;

export type NewtonCradleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Number of balls. @default 5 — clamped to [3, 7]. */
  count?: number;
  /** Seconds per full left-right cycle. @default 2.2 */
  period?: number;
  className?: string;
};

/**
 * A Newton's cradle. The end ball falls, the line holds still, and the momentum
 * pops out the far ball — a perpetual, deterministic transfer. The swing eases
 * in on the fall and out on the rise so it reads as gravity, and the inner balls
 * never move. Under reduced motion it holds one ball drawn aside, mid-transfer.
 */
export function NewtonCradle({
  ref,
  count = 5,
  period = 2.2,
  className,
}: NewtonCradleProps) {
  const motionSafe = useMotionSafe();
  const n = Math.max(3, Math.min(7, Math.round(count)));
  const width = n * 2 * R + 24;
  const height = TOP + STRING + R + 16;
  const cx0 = width / 2 - ((n - 1) / 2) * 2 * R;

  // Per-segment easing: fall accelerates (exit), rise decelerates (enter).
  const leftEase = [easings.exit, easings.linear, easings.linear, easings.enter];
  const rightEase = [
    easings.linear,
    easings.enter,
    easings.exit,
    easings.linear,
  ];
  const times = [0, 0.25, 0.5, 0.75, 1];

  const swing = (side: "left" | "right") => {
    if (!motionSafe) {
      return { rotate: side === "left" ? -AMP : 0 };
    }
    const values =
      side === "left" ? [-AMP, 0, 0, 0, -AMP] : [0, 0, AMP, 0, 0];
    return {
      rotate: values,
      transition: {
        duration: period,
        ease: side === "left" ? leftEase : rightEase,
        times,
        repeat: Infinity,
        repeatType: "loop" as const,
      },
    };
  };

  return (
    <div
      ref={ref}
      className={cn("flex justify-center", className)}
      role="img"
      aria-label="Newton's cradle transferring momentum end to end"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-[240px]"
      >
        <defs>
          <radialGradient id="cradle-ball" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0%" stopColor="oklch(0.78 0.07 262)" />
            <stop offset="55%" stopColor="oklch(0.6 0.13 262)" />
            <stop offset="100%" stopColor="oklch(0.42 0.12 262)" />
          </radialGradient>
        </defs>

        <rect
          x={cx0 - R}
          y={TOP - 5}
          width={(n - 1) * 2 * R + 2 * R}
          height="5"
          rx="2"
          fill="var(--hairline-strong)"
        />

        {Array.from({ length: n }, (_, i) => {
          const pivotX = cx0 + i * 2 * R;
          const isLeft = i === 0;
          const isRight = i === n - 1;
          const animate = isLeft
            ? swing("left")
            : isRight
              ? swing("right")
              : { rotate: 0 };
          return (
            <motion.g
              key={i}
              initial={false}
              animate={animate}
              style={{
                transformBox: "view-box",
                transformOrigin: `${pivotX}px ${TOP}px`,
              }}
            >
              <line
                x1={pivotX}
                y1={TOP}
                x2={pivotX}
                y2={TOP + STRING}
                stroke="var(--ink-3)"
                strokeWidth="1"
              />
              <circle
                cx={pivotX}
                cy={TOP + STRING}
                r={R}
                fill="url(#cradle-ball)"
                stroke="oklch(0.38 0.1 262)"
                strokeWidth="0.75"
              />
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
