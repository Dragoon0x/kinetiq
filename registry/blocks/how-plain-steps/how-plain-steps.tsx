"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PlainStep = {
  id: string;
  title: string;
  copy: string;
};

export type HowPlainStepsProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  steps?: PlainStep[];
  /** The honest line under the steps. */
  footnote?: string;
  className?: string;
};

const DEFAULT_STEPS: PlainStep[] = [
  {
    id: "p1",
    title: "Tell it about one yard",
    copy: "Its name, its crews, and what the morning usually argues about. Three questions, no integration.",
  },
  {
    id: "p2",
    title: "Correct the first board",
    copy: "It will be roughly right and visibly incomplete. What you fix becomes a constraint it keeps.",
  },
  {
    id: "p3",
    title: "Let it cut tomorrow's",
    copy: "The board arrives before the gate opens, with the reasoning printed at the top.",
  },
];

/**
 * Three steps, numbered, and nothing else. The clock, the script, the station
 * line and the lanes all do something with the sequence; sometimes a page has
 * already spent its interaction budget and how-it-works simply has to be read
 * in eight seconds. This is that section, and its restraint is the feature —
 * reach for it when the page is already busy above.
 */
export function HowPlainSteps({
  eyebrow = "Waylight · how it works",
  headline = "Three steps. That is genuinely all of it.",
  copy,
  steps = DEFAULT_STEPS,
  footnote = "No migration, no data export, no call. The whiteboard stays up as long as you want it to.",
  className,
}: HowPlainStepsProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(steps.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          {copy && <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>}
        </div>

        <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {steps.map((item, index) => (
            <motion.li
              key={item.id}
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
              className="min-w-0 border-t border-hairline pt-4"
            >
              <p aria-hidden className="font-mono text-[11px] text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                {item.copy}
              </p>
            </motion.li>
          ))}
        </ol>

        {footnote && (
          <p className="mt-10 max-w-xl text-sm leading-relaxed text-ink-3">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
