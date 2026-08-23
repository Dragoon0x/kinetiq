"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TwoDateQuote = {
  id: string;
  name: string;
  role: string;
  /** What they said early — usually sceptical, and better left unedited. */
  early: { date: string; quote: string };
  /** What they said later. */
  later: { date: string; quote: string };
};

export type TestimonialTwoDatesProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  quotes?: TwoDateQuote[];
  earlyLabel?: string;
  laterLabel?: string;
  className?: string;
};

const DEFAULT_QUOTES: TwoDateQuote[] = [
  {
    id: "q1",
    name: "M. Aldana",
    role: "Yard lead, north basin",
    early: {
      date: "Week 2",
      quote:
        "I do not think the crews will read it. We have had three of these and they all ended up on a shelf.",
    },
    later: {
      date: "Month 14",
      quote:
        "The whiteboard came down in April and nobody has asked for it since. The board is just where the morning is now.",
    },
  },
  {
    id: "q2",
    name: "T. Brekke",
    role: "Operations, Fieldline north",
    early: {
      date: "Week 1",
      quote:
        "The first board it cut was wrong about the crane, and I nearly stopped there.",
    },
    later: {
      date: "Month 9",
      quote:
        "It was wrong because we had never written the crane rule down anywhere. That was the useful part, honestly.",
    },
  },
];

/**
 * The same customer quoted twice, a year apart, with the sceptical early
 * quote left in. A wall of enthusiasm reads as selection; a pair that starts
 * with "I nearly stopped there" and ends somewhere else reads as a record.
 * It is the only testimonial shape that can show a mind changing, which is
 * the thing a doubtful reader is actually looking for.
 */
export function TestimonialTwoDates({
  eyebrow = "Waylight · then and now",
  headline = "What they said at week two, and what they say now.",
  copy = "Both quotes are theirs, published unedited, including the ones that were not compliments at the time.",
  quotes = DEFAULT_QUOTES,
  earlyLabel = "At the start",
  laterLabel = "Since",
  className,
}: TestimonialTwoDatesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(quotes.length);

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
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <ul className="mt-12 flex flex-col gap-10">
          {quotes.map((entry, index) => (
            <motion.li
              key={entry.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="min-w-0 border-t border-hairline pt-6"
            >
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-sm text-ink italic">
                  {entry.name}
                </span>
                <span className="text-sm text-ink-3">{entry.role}</span>
              </p>

              <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-10">
                <div className="min-w-0">
                  <p className="text-label text-ink-3">
                    {earlyLabel} · {entry.early.date}
                  </p>
                  <blockquote className="mt-2 leading-relaxed text-ink-3">
                    “{entry.early.quote}”
                  </blockquote>
                </div>
                <div className="min-w-0">
                  <p className="text-label text-ink-2">
                    {laterLabel} · {entry.later.date}
                  </p>
                  <blockquote className="mt-2 text-lg leading-relaxed text-balance text-ink">
                    “{entry.later.quote}”
                  </blockquote>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
