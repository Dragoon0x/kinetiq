"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QuietFeature = {
  id: string;
  title: string;
  copy: string;
};

export type FeaturesQuietGridProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  features?: QuietFeature[];
  /** Columns at the widest breakpoint. @default 3 */
  columns?: 2 | 3;
  className?: string;
};

const DEFAULT_FEATURES: QuietFeature[] = [
  {
    id: "f1",
    title: "One record",
    copy: "Every yard writes to the same lineage, so there is never a second version of the morning.",
  },
  {
    id: "f2",
    title: "Plans that explain themselves",
    copy: "Each board carries the constraints it was cut under, in language a crew reads at a gate.",
  },
  {
    id: "f3",
    title: "Changes that propagate once",
    copy: "A reshuffle updates every board that shares the constraint. Nobody re-keys anything.",
  },
  {
    id: "f4",
    title: "Built for gloves",
    copy: "Large targets, high contrast, and nothing that needs a second tap to confirm.",
  },
  {
    id: "f5",
    title: "Exports that hold up",
    copy: "Audits are answered from files, not screenshots, and the files carry their own provenance.",
  },
  {
    id: "f6",
    title: "Leaving is a workflow",
    copy: "Your history is yours. Export it whole, on your own schedule, without asking us.",
  },
];

/**
 * The restrained one: a plain grid of claims, numbered, with nothing moving
 * but their arrival. Every library needs the section you reach for when the
 * page already has three interactive ones and this part simply has to be read
 * — the bento, the tour, and the gauge row all earn attention, and a page
 * where everything earns attention has none left to give.
 */
export function FeaturesQuietGrid({
  eyebrow = "Waylight · what it does",
  headline = "Six things, stated plainly.",
  copy = "No demos in this section. If any of these matter to you, the rest of the page shows them working.",
  features = DEFAULT_FEATURES,
  columns = 3,
  className,
}: FeaturesQuietGridProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(features.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <ul
          className={cn(
            "mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2",
            columns === 3 && "lg:grid-cols-3",
          )}
        >
          {features.map((feature, index) => (
            <motion.li
              key={feature.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="min-w-0"
            >
              <p
                aria-hidden
                className="border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.08em] text-ink-3"
              >
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-semibold tracking-tight text-ink">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                {feature.copy}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
