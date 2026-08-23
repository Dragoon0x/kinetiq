"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Objection = {
  id: string;
  /** The reason, in the reader's own voice. */
  doubt: string;
  answer: string;
};

export type CtaLastObjectionProps = {
  eyebrow?: string;
  headline?: string;
  objections?: Objection[];
  cta?: string;
  onCta?: () => void;
  altLabel?: string;
  altHref?: string;
  className?: string;
};

const DEFAULT_OBJECTIONS: Objection[] = [
  {
    id: "o1",
    doubt: "The crews will not use it.",
    answer:
      "They use it or they do not — you will know inside a week, and the free yard costs you nothing if the answer is no.",
  },
  {
    id: "o2",
    doubt: "We tried something like this in 2019.",
    answer:
      "Probably an office tool pointed at a yard. This one starts at the gate; if it does not survive gloves and glare, it has failed on its own terms.",
  },
  {
    id: "o3",
    doubt: "We do not have time to roll anything out.",
    answer:
      "One yard, one afternoon, no migration. The whiteboard stays up as long as you want it to.",
  },
  {
    id: "o4",
    doubt: "What if we want out?",
    answer:
      "Export everything whenever you like, keep the files, and stop paying from the settings page. No call, no retention offer.",
  },
];

/**
 * The close that names the reason the reader has not acted, and answers it in
 * their own words. By this point on a page the argument is made and the only
 * thing left is doubt — so the section says the doubts out loud, plainly,
 * including the one about leaving. Answering the exit question honestly is
 * what makes the other three answers believable.
 */
export function CtaLastObjection({
  eyebrow = "Waylight · the part you are stuck on",
  headline = "You are probably thinking one of these.",
  objections = DEFAULT_OBJECTIONS,
  cta = "Start one yard",
  onCta,
  altLabel = "or talk to someone who ran a shift",
  altHref = "#talk",
  className,
}: CtaLastObjectionProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(objections.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>

        <dl className="mt-10 flex flex-col gap-7">
          {objections.map((objection, index) => (
            <motion.div
              key={objection.id}
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
              className="border-l-2 border-hairline pl-5"
            >
              <dt className="text-lg font-medium tracking-tight text-balance text-ink italic">
                “{objection.doubt}”
              </dt>
              <dd className="mt-2 leading-relaxed text-ink-2">
                {objection.answer}
              </dd>
            </motion.div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <PressureButton size="lg" onClick={onCta}>
            {cta}
            <ArrowRight className="size-4" aria-hidden />
          </PressureButton>
          <a
            href={altHref}
            className="text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {altLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
