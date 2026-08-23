"use client";

import * as React from "react";

import { motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ClockMark = {
  time: string;
  title: string;
  copy: string;
  /** What the product produced at this mark. */
  artifact?: string;
};

export type HowDayClockProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  marks?: ClockMark[];
  className?: string;
};

const DEFAULT_MARKS: ClockMark[] = [
  {
    time: "05:55",
    title: "The board re-plans itself",
    copy: "Overnight changes — a late barge, a crane hold — are already folded into the morning before anyone arrives.",
    artifact: "plan r2, posted",
  },
  {
    time: "06:40",
    title: "Gates open on the same page",
    copy: "Every crew reads the same rows at the gate. The briefing is a glance, not a meeting.",
    artifact: "0 conflicting copies",
  },
  {
    time: "11:20",
    title: "A wobble propagates once",
    copy: "One reshuffle updates both yards that share the crane. Nobody re-keys anything anywhere.",
    artifact: "1 change, 2 boards",
  },
  {
    time: "17:05",
    title: "The day files itself",
    copy: "The shift closes into the ledger as it happened — the review will quote rows, not memory.",
    artifact: "day 214, on the record",
  },
];

/**
 * How it works, told as a working day: four clock marks down a rail, each
 * with what the product did at that hour and the artifact it left behind —
 * sealed, because a claim with an artifact is a fact. The rail is plain and
 * the entrance is a cascade; the day itself is the mechanism on display.
 */
export function HowDayClock({
  eyebrow = "Waylight · one day, worked",
  headline = "What a Tuesday does by itself.",
  copy = "No demo flow, no numbered steps — just the four moments where the product earns the day.",
  marks = DEFAULT_MARKS,
  className,
}: HowDayClockProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(marks.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
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

        <ol className="relative mt-12 flex flex-col gap-8">
          <span
            aria-hidden
            className="bg-hairline-strong absolute top-3 bottom-3 left-[46px] hidden w-px sm:block"
          />
          {marks.map((mark, index) => (
            <motion.li
              key={mark.time}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="grid gap-2 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-6"
            >
              <span className="text-ink relative z-10 font-mono text-sm font-semibold tracking-[0.06em]">
                <span className="bg-surface-0 pr-2">{mark.time}</span>
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-ink font-semibold">{mark.title}</h3>
                  {mark.artifact && (
                    <StatusSeal variant="info" className="text-[10px]">
                      {mark.artifact}
                    </StatusSeal>
                  )}
                </div>
                <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">{mark.copy}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
