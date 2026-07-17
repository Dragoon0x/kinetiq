"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BalanceQuoteProps = {
  /** The quotation, as a plain string. */
  children: string;
  /** Attribution shown beneath. */
  cite?: string;
  className?: string;
};

/**
 * A pull-quote that sets itself well and arrives in order. The lines are
 * balanced so no widow is left hanging, and on the way in the words rise and
 * resolve one after another in a tight cascade — the eye is walked through the
 * sentence rather than shown all of it at once. It runs when the quote scrolls
 * into view, then rests.
 *
 * The whole quotation is one block of real text, so it reads as a sentence to
 * assistive tech; only the per-word rise is decorative. Reduced motion sets the
 * quote in place with no cascade.
 */
export function BalanceQuote({ children, cite, className }: BalanceQuoteProps) {
  const motionSafe = useMotionSafe();
  const words = children.trim().split(/\s+/);
  const step = cascade(words.length);

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <blockquote className="text-pretty text-2xl leading-snug font-semibold text-balance">
        {words.map((word, index) => (
          <React.Fragment key={`${index}-${word}`}>
            <motion.span
              className="inline-block"
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.step : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
            >
              {word}
            </motion.span>
            {index < words.length - 1 ? " " : ""}
          </React.Fragment>
        ))}
      </blockquote>
      {cite && (
        <figcaption className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
          {cite}
        </figcaption>
      )}
    </figure>
  );
}
