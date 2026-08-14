"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const R = 14;
const STRING = 92;
const TOP = 12;
const AMP = 30;
const RAD = Math.PI / 180;
/** How far a ball reaches sideways at full swing — the viewBox must seat it. */
const SWING = STRING * Math.sin(AMP * RAD);
/** Breathing room outside the swung balls. */
const PAD = 8;

const TIMES = [0, 0.25, 0.5, 0.75, 1];
/** Out, fall, wait through the far ball's turn, rise back out. */
const LEFT_KEYFRAMES = [-AMP, 0, 0, 0, -AMP];
/** Wait for the impact, pop out, fall back, wait. */
const RIGHT_KEYFRAMES = [0, 0, AMP, 0, 0];
// Falls accelerate (exit), rises decelerate (enter), so it reads as gravity.
const LEFT_EASE = [easings.exit, easings.linear, easings.linear, easings.enter];
const RIGHT_EASE = [easings.linear, easings.enter, easings.exit, easings.linear];

export type NewtonCradleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Number of balls. @default 5 — clamped to [3, 7]. */
  count?: number;
  /** Seconds per full left-right cycle. @default 2.2 */
  period?: number;
  className?: string;
};

type Side = "left" | "right" | null;

/**
 * One ball on its string. The swing is drawn from the angle rather than rotated
 * with a CSS transform: motion owns `transform-origin` on SVG elements and
 * replaces whatever the style prop asks for with `50% 50%`, which pivots every
 * ball around the middle of the drawing instead of its own hook on the bar.
 * Deriving the endpoint keeps the ball exactly `STRING` from its pivot.
 */
function Pendulum({
  pivotX,
  side,
  period,
  motionSafe,
}: {
  pivotX: number;
  side: Side;
  period: number;
  motionSafe: boolean;
}) {
  // Negative swings left. Reduced motion holds the left ball drawn aside,
  // mid-transfer — which is also where its animation starts.
  const angle = useMotionValue(side === "left" ? -AMP : 0);

  React.useEffect(() => {
    if (!motionSafe || side === null) {
      angle.set(side === "left" ? -AMP : 0);
      return;
    }
    const controls = animate(
      angle,
      side === "left" ? LEFT_KEYFRAMES : RIGHT_KEYFRAMES,
      {
        duration: period,
        ease: side === "left" ? LEFT_EASE : RIGHT_EASE,
        times: TIMES,
        repeat: Infinity,
        repeatType: "loop",
      },
    );
    return () => controls.stop();
  }, [angle, motionSafe, period, side]);

  const ballX = useTransform(angle, (a) => pivotX + STRING * Math.sin(a * RAD));
  const ballY = useTransform(angle, (a) => TOP + STRING * Math.cos(a * RAD));

  return (
    <>
      <motion.line
        x1={pivotX}
        y1={TOP}
        x2={ballX}
        y2={ballY}
        stroke="var(--ink-3)"
        strokeWidth="1"
      />
      <motion.circle
        cx={ballX}
        cy={ballY}
        r={R}
        fill="url(#cradle-ball)"
        stroke="oklch(0.38 0.1 262)"
        strokeWidth="0.75"
      />
    </>
  );
}

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
  const span = (n - 1) * 2 * R;
  // The end balls swing clear of the stack, so the box is the stack plus a
  // full swing either side — without it they render outside the viewBox.
  const width = span + 2 * R + 2 * (SWING + PAD);
  const height = TOP + STRING + R + 16;
  const cx0 = SWING + PAD + R;

  return (
    <div
      ref={ref}
      className={cn("flex justify-center", className)}
      role="img"
      aria-label="Newton's cradle transferring momentum end to end"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-[340px]"
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
          width={span + 2 * R}
          height="5"
          rx="2"
          fill="var(--hairline-strong)"
        />

        {Array.from({ length: n }, (_, i) => (
          <Pendulum
            key={i}
            pivotX={cx0 + i * 2 * R}
            side={i === 0 ? "left" : i === n - 1 ? "right" : null}
            period={period}
            motionSafe={motionSafe}
          />
        ))}
      </svg>
    </div>
  );
}
