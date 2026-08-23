"use client";

import * as React from "react";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MorningBeat = { time: string; line: string };

export type UsecaseTwoMorningsProps = {
  eyebrow?: string;
  headline?: string;
  beforeTitle?: string;
  before?: MorningBeat[];
  afterTitle?: string;
  after?: MorningBeat[];
  /** The one-line verdict under the columns. */
  verdict?: string;
  className?: string;
};

const DEFAULT_BEFORE: MorningBeat[] = [
  { time: "06:40", line: "Yesterday's plan, already wrong" },
  { time: "07:10", line: "The crane argument, on the radio" },
  { time: "08:00", line: "Crew B waits; nobody knows for what" },
  { time: "09:30", line: "The plan forks into three notebooks" },
];

const DEFAULT_AFTER: MorningBeat[] = [
  { time: "06:40", line: "The board re-planned around the crane overnight" },
  { time: "07:10", line: "Both crews read the same row" },
  { time: "08:00", line: "Crew B is on the second slot already" },
  { time: "09:30", line: "One record; the notebooks stay in pockets" },
];

/**
 * The same morning, twice: the old one and the new one as parallel
 * timelines, hour marks aligned so the eye can travel across and compare
 * beat for beat. No slider, no wipe — the two columns just sit there,
 * because the argument is strongest when both are visible whole.
 */
export function UsecaseTwoMornings({
  eyebrow = "Waylight · the same morning",
  headline = "06:40, before and after.",
  beforeTitle = "The radio morning",
  before = DEFAULT_BEFORE,
  afterTitle = "The ledger morning",
  after = DEFAULT_AFTER,
  verdict = "Same yard, same weather, same crane. Different morning.",
  className,
}: UsecaseTwoMorningsProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(Math.max(before.length, after.length));

  const column = (
    title: string,
    beats: MorningBeat[],
    good: boolean,
  ) => (
    <div className="border-hairline bg-surface-1 rounded-4 border p-5 sm:p-6">
      <p className="flex items-center gap-2 font-medium">
        {good ? (
          <Check
            className="text-[var(--success,var(--primary))] size-4"
            aria-hidden
          />
        ) : (
          <X className="text-ink-3 size-4" aria-hidden />
        )}
        {title}
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {beats.map((beat, index) => (
          <motion.li
            key={beat.time + beat.line}
            initial={{ opacity: motionSafe ? 0 : 1 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter, delay: index * step }
                : { duration: 0 }
            }
            className="flex gap-3"
          >
            <span className="text-ink-3 shrink-0 font-mono text-[11px] leading-6 tracking-[0.06em]">
              {beat.time}
            </span>
            <span className={cn("text-sm leading-6", good ? "text-ink" : "text-ink-2")}>
              {beat.line}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
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
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {column(beforeTitle, before, false)}
          {column(afterTitle, after, true)}
        </div>

        <p className="text-ink-3 mt-8 text-center font-mono text-[11px] tracking-[0.08em] uppercase">
          {verdict}
        </p>
      </div>
    </section>
  );
}
