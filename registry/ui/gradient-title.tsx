"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GradientTitleProps = {
  children: React.ReactNode;
  /** Semantic wrapper. @default "h2" */
  as?: "span" | "p" | "h1" | "h2" | "h3";
  className?: string;
};

/**
 * A heading painted with a sheen that follows the pointer. The gradient is
 * clipped to the glyphs and oversized, so moving the pointer only slides its
 * position — one motion value, no re-render — while the weight leans a little
 * heavier under your hand and eases back when you leave. The gradient runs
 * light-to-accent-to-light, so it reads as ink with a highlight rather than a
 * rainbow.
 *
 * The heading is real text inside a real heading element, so structure and
 * search are untouched; the sheen is decoration. Reduced motion (or no fine
 * pointer) holds the sheen centred and the weight steady.
 */
export function GradientTitle({
  children,
  as = "h2",
  className,
}: GradientTitleProps) {
  const motionSafe = useMotionSafe();
  const sheen = useMotionValue(0.5);
  const weight = useMotionValue(640);
  const backgroundPositionX = useTransform(sheen, (x) => `${x * 100}%`);
  const restRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const Tag = as;

  const track = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!motionSafe || event.pointerType !== "mouse") return;
    restRef.current?.stop();
    const rect = event.currentTarget.getBoundingClientRect();
    sheen.set((event.clientX - rect.left) / rect.width);
  };

  const enter = () => {
    if (!motionSafe) return;
    animate(weight, 720, springs.glide);
  };

  const leave = () => {
    if (!motionSafe) return;
    restRef.current = animate(sheen, 0.5, springs.glide);
    animate(weight, 640, springs.glide);
  };

  return (
    <Tag className={cn("m-0", className)}>
      <motion.span
        onPointerMove={track}
        onPointerEnter={enter}
        onPointerLeave={leave}
        style={{
          backgroundPositionX,
          fontWeight: weight,
          backgroundImage:
            "linear-gradient(100deg, var(--ink) 20%, var(--accent-bright) 50%, var(--ink) 80%)",
          backgroundSize: "260% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
        className="inline bg-clip-text tracking-tight text-transparent"
      >
        {children}
      </motion.span>
    </Tag>
  );
}
