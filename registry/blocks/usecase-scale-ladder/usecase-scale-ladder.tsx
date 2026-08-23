"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LadderRung = {
  id: string;
  scale: string;
  title: string;
  copy: string;
  /** What it costs at this rung, plainly. */
  costLine: string;
};

export type UsecaseScaleLadderProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  rungs?: LadderRung[];
  className?: string;
};

const DEFAULT_RUNGS: LadderRung[] = [
  {
    id: "solo",
    scale: "ONE BENCH",
    title: "A notebook that computes",
    copy: "One person, one project. The ledger keeps itself and the journal writes the week — the tool disappears into the work.",
    costLine: "Free, indefinitely",
  },
  {
    id: "crew",
    scale: "ONE CREW",
    title: "The shared surface",
    copy: "Handoffs become rows, the morning becomes a board, and the first person to say 'check the bench' wins the argument.",
    costLine: "Per seat, with breaks",
  },
  {
    id: "floor",
    scale: "THE FLOOR",
    title: "An operations record",
    copy: "Every yard on one lineage: audits answered from exports, reviews assembled from rows, and history nobody can quietly edit.",
    costLine: "A conversation, honestly",
  },
];

/**
 * The product at three scales, set as a ladder: each rung names the size, the
 * shape the product takes there, and — the line most pages hide — what it
 * costs at that rung. Rungs climb in on the cascade with a rail connecting
 * them, because the pitch is not any single rung; it is that the ladder
 * holds all the way up.
 */
export function UsecaseScaleLadder({
  eyebrow = "Fieldline · at your size",
  headline = "The ladder holds all the way up.",
  copy = "Start where you are. Every rung uses the same record, so climbing never means migrating.",
  rungs = DEFAULT_RUNGS,
  className,
}: UsecaseScaleLadderProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(rungs.length);

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

        <ol className="relative mt-12 flex flex-col gap-6">
          {/* The rail. */}
          <span
            aria-hidden
            className="bg-hairline-strong absolute top-2 bottom-2 left-[7px] w-px"
          />
          {rungs.map((rung, index) => (
            <motion.li
              key={rung.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.shift : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="relative pl-10"
            >
              <span
                aria-hidden
                className="border-hairline-strong bg-surface-0 absolute top-1.5 left-0 flex size-4 items-center justify-center rounded-full border-2"
              >
                <span className="bg-primary block size-1.5 rounded-full" />
              </span>
              <div className="border-hairline bg-surface-1 rounded-4 border p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-label text-ink-3">{rung.scale}</p>
                  <p className="text-ink-3 font-mono text-[11px] tracking-[0.06em] uppercase">
                    {rung.costLine}
                  </p>
                </div>
                <h3 className="text-ink mt-2 text-xl font-semibold tracking-tight">
                  {rung.title}
                </h3>
                <p className="text-ink-2 mt-2 text-sm leading-relaxed">{rung.copy}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
