"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type JobStory = {
  id: string;
  /** The situation — "When …". */
  when: string;
  /** The motivation — "I want to …". */
  want: string;
  /** The outcome — "so I can …". */
  soThat: string;
  /** The one thing in the product that serves this job. */
  served: string;
};

export type UsecaseJobStoriesProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  stories?: JobStory[];
  servedLabel?: string;
  className?: string;
};

const DEFAULT_STORIES: JobStory[] = [
  {
    id: "j1",
    when: "a barge lands three hours late overnight",
    want: "the morning re-planned before anyone arrives",
    soThat:
      "the first conversation at the gate is about work, not about what happened",
    served: "Boards re-cut at 05:55 with the cause printed on the sheet",
  },
  {
    id: "j2",
    when: "two crews need the same crane at ten",
    want: "one of them moved without a negotiation over the radio",
    soThat: "neither crew stands still waiting to find out who won",
    served:
      "One reshuffle propagating to every board that shares the constraint",
  },
  {
    id: "j3",
    when: "a supervisor overrides the plan",
    want: "the reason attached to the change itself",
    soThat: "the next shift inherits the decision instead of re-litigating it",
    served: "Overrides that require a line, stored beside the row they changed",
  },
  {
    id: "j4",
    when: "an auditor asks what happened on a Tuesday in March",
    want: "to answer from the record rather than from memory",
    soThat: "the review takes an hour instead of a fortnight",
    served:
      "Shifts closing into an append-only ledger with exports that carry provenance",
  },
];

/**
 * Use cases written as job stories rather than personas: the situation, the
 * motivation, the outcome — and then, unusually, the single thing in the
 * product that serves it. A job story without that last line is a nice
 * sentence about a customer; with it, the section becomes a map from
 * circumstance to feature that a reader can check themselves. Situations, not
 * job titles, because the same person has different jobs at different hours.
 */
export function UsecaseJobStories({
  eyebrow = "Waylight · the jobs",
  headline = "Four situations, and what meets them.",
  copy = "Written as jobs rather than roles — the same yard lead wants different things at six in the morning and at five in the afternoon.",
  stories = DEFAULT_STORIES,
  servedLabel = "What meets it",
  className,
}: UsecaseJobStoriesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(stories.length);

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

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {stories.map((story, index) => (
            <motion.li
              key={story.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.shift : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="flex min-w-0 flex-col rounded-4 border border-hairline bg-surface-1 p-6"
            >
              <p className="text-lg leading-relaxed text-balance text-ink">
                <span className="text-ink-3">When </span>
                {story.when}
                <span className="text-ink-3">, I want </span>
                {story.want}
                <span className="text-ink-3">, so I can </span>
                {story.soThat}
                <span className="text-ink-3">.</span>
              </p>
              <div className="mt-5 border-t border-hairline pt-4">
                <p className="text-label text-ink-3">{servedLabel}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  {story.served}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
