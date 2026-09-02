"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LogoSegment = {
  id: string;
  /** The trade or industry these customers share. */
  name: string;
  /** How many customers in this segment, in total. */
  count: number;
  /** The named ones, as wordmarks. */
  marks: string[];
};

export type LogoSegmentShelfProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  segments?: LogoSegment[];
  /** The unit each segment counts. @default "yards" */
  unitLabel?: string;
  className?: string;
};

const DEFAULT_SEGMENTS: LogoSegment[] = [
  {
    id: "s1",
    name: "Deep-water terminals",
    count: 61,
    marks: ["NORTH BASIN", "KETTLE POINT", "ALDER QUAY", "GRAVEL HEAD"],
  },
  {
    id: "s2",
    name: "Inland and river ports",
    count: 88,
    marks: ["MILLRACE", "TWO BRIDGES", "LOWER FORD", "STONE LOCK"],
  },
  {
    id: "s3",
    name: "Shipyards and dry dock",
    count: 34,
    marks: ["DRY DOCK 2", "HALYARD WORKS", "CANTRELL"],
  },
  {
    id: "s4",
    name: "Cold chain",
    count: 31,
    marks: ["COLD STORE CO", "NORTHWIND", "PALE HARBOUR"],
  },
];

/**
 * The logo wall organised by trade, with the count each mark stands in for.
 * A grid of names answers "who", but a buyer is really asking "anyone like
 * me" — so this one groups by segment and prints how many are behind each
 * shelf, which turns a dozen wordmarks into two hundred customers without
 * claiming a single one it cannot name.
 */
export function LogoSegmentShelf({
  eyebrow = "Waylight · who runs on it",
  headline = "Two hundred and fourteen yards, by trade.",
  copy = "The named ones agreed to be named. The counts are everyone, including the ones who would rather not appear on a marketing page.",
  segments = DEFAULT_SEGMENTS,
  unitLabel = "yards",
  className,
}: LogoSegmentShelfProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(segments.length);

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

        <ul className="mt-12 flex flex-col gap-8">
          {segments.map((segment, index) => (
            <motion.li
              key={segment.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
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
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="font-medium text-ink">{segment.name}</h3>
                <p className="flex items-baseline gap-1.5 text-sm text-ink-3">
                  <Readout value={segment.count} />
                  <span>{unitLabel}</span>
                </p>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {segment.marks.map((mark) => (
                  <li
                    key={mark}
                    className="font-mono text-xs tracking-[0.14em] text-ink-2"
                  >
                    {mark}
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
