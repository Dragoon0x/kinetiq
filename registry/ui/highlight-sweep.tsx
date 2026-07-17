"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HighlightSweepProps = {
  children: React.ReactNode;
  /** The marker tone. @default "accent" */
  tone?: "accent" | "success" | "warn";
  className?: string;
};

const WASH: Record<NonNullable<HighlightSweepProps["tone"]>, string> = {
  accent: "var(--accent-wash)",
  success: "color-mix(in oklab, var(--success) 22%, transparent)",
  warn: "color-mix(in oklab, var(--warn) 24%, transparent)",
};

/**
 * A highlighter that draws itself across a phrase the moment it scrolls into
 * view. The marker is a wash behind the text scaled from a left origin, so it
 * fills the way a pen would rather than fading in; it runs once, when the phrase
 * arrives, and then holds.
 *
 * The text is the content and the wash is decoration, so nothing here changes
 * what a screen reader reads — the emphasis is purely visual. Reduced motion
 * places the wash without the sweep.
 */
export function HighlightSweep({
  children,
  tone = "accent",
  className,
}: HighlightSweepProps) {
  const motionSafe = useMotionSafe();

  return (
    <span className={cn("relative inline-block", className)}>
      <motion.span
        aria-hidden
        className="absolute inset-x-[-0.15em] inset-y-[0.05em] -z-0 origin-left rounded-[0.15em]"
        style={{ background: WASH[tone] }}
        initial={{ scaleX: motionSafe ? 0 : 1 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={
          motionSafe
            ? { duration: durations.slow, ease: easings.enter }
            : { duration: 0 }
        }
      />
      <span className="relative">{children}</span>
    </span>
  );
}
