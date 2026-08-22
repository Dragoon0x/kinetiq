"use client";

import * as React from "react";

import { motion } from "motion/react";

import { BalanceQuote } from "@/registry/ui/balance-quote";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Dispatch = {
  id: string;
  quote: string;
  name: string;
  role: string;
};

export type TestimonialDispatchWallProps = {
  eyebrow?: string;
  /** The lead quotation, set large on the balance instrument. */
  lead?: { quote: string; cite: string };
  dispatches?: Dispatch[];
  className?: string;
};

const DEFAULT_LEAD = {
  quote: "The first tool the yard actually reads before the shift instead of after something goes wrong.",
  cite: "M. Aldana — Yard lead, north basin",
};

const DEFAULT_DISPATCHES: Dispatch[] = [
  {
    id: "d1",
    quote: "Handoffs used to be a radio argument. Now they are a row both crews can point at.",
    name: "T. Brekke",
    role: "Crew chief",
  },
  {
    id: "d2",
    quote: "I stopped keeping my own spreadsheet in week two. That has never happened.",
    name: "S. Okonkwo",
    role: "Operations",
  },
  {
    id: "d3",
    quote: "The morning plan survives contact with the morning. That is the whole review.",
    name: "L. Ferro",
    role: "Site manager",
  },
  {
    id: "d4",
    quote: "We onboarded a new yard on a Tuesday. By Thursday its numbers were boring.",
    name: "A. Reyes",
    role: "Regional director",
  },
];

/**
 * A dispatch wall: one quotation set large on the balance instrument — its
 * words rising and resolving in reading order — over a wall of shorter
 * dispatches that arrive on the cascade. The lead quote carries the argument;
 * the wall carries the pattern. All type, no headshots: what was said, who
 * said it, nothing performing sincerity.
 */
export function TestimonialDispatchWall({
  eyebrow = "Waylight · from the yards",
  lead = DEFAULT_LEAD,
  dispatches = DEFAULT_DISPATCHES,
  className,
}: TestimonialDispatchWallProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(dispatches.length);

  return (
    <section
      aria-label="What customers say"
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3 text-center">{eyebrow}</p>

        <div className="mx-auto mt-8 max-w-3xl text-center">
          <BalanceQuote cite={lead.cite}>{lead.quote}</BalanceQuote>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dispatches.map((dispatch, index) => (
            <motion.figure
              key={dispatch.id}
              initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? distances.shift : 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="border-hairline bg-surface-1 rounded-4 flex flex-col justify-between gap-5 border p-5"
            >
              <blockquote className="text-ink text-sm leading-relaxed">
                “{dispatch.quote}”
              </blockquote>
              <figcaption className="border-hairline border-t pt-3">
                <p className="text-ink text-sm font-medium">{dispatch.name}</p>
                <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                  {dispatch.role}
                </p>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
