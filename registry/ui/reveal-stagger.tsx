"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";

export type RevealStaggerProps = {
  children: React.ReactNode;
  /** Seconds between each child; auto-tightens under the 600ms budget. */
  step?: number;
  className?: string;
};

/**
 * Wrap a group and its children arrive in sequence as it scrolls into view —
 * each one rising a little and resolving, stepped by a stagger that tightens
 * automatically so a long list never reads as lag. It runs once, when the block
 * enters, then stays put.
 *
 * The children are rendered exactly as given, each in its own layer, so the
 * markup and reading order are unchanged; only the entrance is added. Reduced
 * motion places every child at once with no rise.
 */
export function RevealStagger({ children, step, className }: RevealStaggerProps) {
  const motionSafe = useMotionSafe();
  const items = React.Children.toArray(children);
  const gap = step ?? cascade(items.length);

  return (
    <div className={className}>
      {items.map((child, index) => (
        <motion.div
          key={index}
          initial={{
            opacity: motionSafe ? 0 : 1,
            y: motionSafe ? distances.shift : 0,
          }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={
            motionSafe
              ? {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: index * gap,
                }
              : { duration: 0 }
          }
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
