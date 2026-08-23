"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoundMention = {
  id: string;
  /** Where it was said — a forum, a list, a group chat. */
  where: string;
  /** Pre-formatted date; the section never touches a clock. */
  when: string;
  /** The handle or role, never a full name we did not ask for. */
  who: string;
  quote: string;
  /** Marked when it is not a compliment. */
  critical?: boolean;
};

export type ProofUnpromptedProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  mentions?: FoundMention[];
  /** The line about how these were gathered. */
  provenance?: string;
  className?: string;
};

const DEFAULT_MENTIONS: FoundMention[] = [
  {
    id: "m1",
    where: "Port operations mailing list",
    when: "12 Jan",
    who: "a terminal supervisor",
    quote:
      "We are two months in. The thing I did not expect is that the arguments moved from the radio to the constraint list, where they are at least written down.",
  },
  {
    id: "m2",
    where: "Marine engineering forum",
    when: "3 Feb",
    who: "a shift planner",
    quote:
      "Setup was longer than they say if your TOS is old. Worth it, but budget a week not an afternoon.",
    critical: true,
  },
  {
    id: "m3",
    where: "Crew WhatsApp, forwarded to us",
    when: "20 Feb",
    who: "a crane operator",
    quote: "board's up already lads, crane 2 is ours till two",
  },
  {
    id: "m4",
    where: "Logistics subreddit",
    when: "28 Feb",
    who: "an operations manager",
    quote:
      "Their incident write-ups are the most honest I have read from a vendor this size. That is most of why we signed.",
  },
];

/**
 * Proof nobody asked for: things said about the product where the product was
 * not listening — a mailing list, a forum, a crew group chat — reproduced with
 * where and when, including the one that is not a compliment. A testimonial is
 * given; a mention is found, and the difference is the whole argument. Keeping
 * the critical one is what stops the section reading as a curated wall.
 */
export function ProofUnprompted({
  eyebrow = "Waylight · said elsewhere",
  headline = "Things people said when we were not in the room.",
  copy = "None of these were requested, edited, or paid for. We have kept the unflattering one because removing it would make the other three worthless.",
  mentions = DEFAULT_MENTIONS,
  provenance = "Collected from public posts and, in one case, a screenshot a customer forwarded to us. Handles and names are withheld deliberately — we did not ask permission to quote, only to reproduce.",
  className,
}: ProofUnpromptedProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(mentions.length);

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
          {mentions.map((mention, index) => (
            <motion.li
              key={mention.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
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
              className={cn(
                "flex min-w-0 flex-col rounded-4 border border-hairline p-5",
                mention.critical ? "bg-surface-0" : "bg-surface-1",
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  {mention.where}
                </span>
                <span className="font-mono text-[10px] text-ink-3">
                  · {mention.when}
                </span>
              </p>
              <blockquote
                className={cn(
                  "mt-3 flex-1 leading-relaxed",
                  mention.critical ? "text-ink-2" : "text-ink",
                )}
              >
                “{mention.quote}”
              </blockquote>
              <p className="mt-3 text-xs text-ink-3">{mention.who}</p>
            </motion.li>
          ))}
        </ul>

        {provenance && (
          <p className="mt-8 max-w-2xl border-t border-hairline pt-5 text-xs leading-relaxed text-ink-3">
            {provenance}
          </p>
        )}
      </div>
    </section>
  );
}
