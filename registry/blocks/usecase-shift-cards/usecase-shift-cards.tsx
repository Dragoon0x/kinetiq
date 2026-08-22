"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShiftCase = {
  id: string;
  role: string;
  /** The moment in an ordinary day where the product shows up. */
  moment: string;
  /** Three beats of that moment, before → during → after. */
  beats: [string, string, string];
  outcome: string;
};

export type UsecaseShiftCardsProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  cases?: ShiftCase[];
  className?: string;
};

const DEFAULT_CASES: ShiftCase[] = [
  {
    id: "chief",
    role: "Crew chief",
    moment: "06:40 — before the gate opens",
    beats: [
      "Yesterday's plan is already stale",
      "The day re-plans around the missing crane",
      "Crews walk in to slots, not questions",
    ],
    outcome: "The morning argument, retired",
  },
  {
    id: "ops",
    role: "Operations",
    moment: "11:20 — mid-shift wobble",
    beats: [
      "Two yards call about the same delay",
      "One reshuffle propagates to both",
      "Nobody re-keys anything anywhere",
    ],
    outcome: "One change, everywhere it matters",
  },
  {
    id: "director",
    role: "Regional director",
    moment: "17:05 — the day closes",
    beats: [
      "The shift ends as a pile of radio calls",
      "The ledger already wrote the summary",
      "Friday's review quotes rows, not memory",
    ],
    outcome: "The record keeps itself",
  },
];

/**
 * Use cases told as moments in a shift, not personas on a slide: each card
 * names a role, the minute of the day the product shows up, and three beats —
 * before, during, after — ending in the outcome that earns its keep. Cards
 * arrive on the cascade; the beats read as a strip of consecutive frames.
 */
export function UsecaseShiftCards({
  eyebrow = "Waylight · a day with it",
  headline = "Find your minute of the day.",
  copy = "Nobody adopts software in the abstract. These are the minutes where it starts mattering.",
  cases = DEFAULT_CASES,
  className,
}: UsecaseShiftCardsProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(cases.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {cases.map((useCase, index) => (
            <motion.article
              key={useCase.id}
              initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? distances.shift : 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="border-hairline bg-surface-1 rounded-4 flex flex-col border p-5"
            >
              <p className="text-ink font-semibold">{useCase.role}</p>
              <p className="text-ink-3 mt-1 font-mono text-[11px] tracking-[0.06em] uppercase">
                {useCase.moment}
              </p>

              <ol className="border-hairline mt-4 flex flex-1 flex-col gap-2.5 border-t pt-4">
                {useCase.beats.map((beat, beatIndex) => (
                  <li key={beat} className="text-ink-2 flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden
                      className="text-ink-3 font-mono text-[10px] leading-5"
                    >
                      {String(beatIndex + 1).padStart(2, "0")}
                    </span>
                    {beat}
                  </li>
                ))}
              </ol>

              <p className="border-hairline text-ink mt-4 border-t pt-3 text-sm font-medium">
                {useCase.outcome}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
