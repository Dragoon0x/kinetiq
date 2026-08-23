"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ArchiveEntry = {
  id: string;
  title: string;
  /** Pre-formatted; the page never touches a clock. */
  date: string;
  year: string;
  topic: string;
  readMinutes: number;
  href: string;
};

export type BlogArchiveProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  entries?: ArchiveEntry[];
  className?: string;
};

const DEFAULT_ENTRIES: ArchiveEntry[] = [
  {
    id: "a1",
    title: "What a crane hold actually costs, measured across nine yards",
    date: "4 Mar",
    year: "2026",
    topic: "Measurement",
    readMinutes: 6,
    href: "#a1",
  },
  {
    id: "a2",
    title: "We got tide modelling wrong for four months",
    date: "18 Feb",
    year: "2026",
    topic: "Post-mortem",
    readMinutes: 9,
    href: "#a2",
  },
  {
    id: "a3",
    title: "Why we stopped shipping a mobile app",
    date: "4 Feb",
    year: "2026",
    topic: "Product",
    readMinutes: 5,
    href: "#a3",
  },
  {
    id: "a4",
    title: "Reading a shift plan in the rain",
    date: "21 Jan",
    year: "2026",
    topic: "Field note",
    readMinutes: 4,
    href: "#a4",
  },
  {
    id: "a5",
    title: "The morning we published a plan we could not explain",
    date: "12 Nov",
    year: "2025",
    topic: "Post-mortem",
    readMinutes: 11,
    href: "#a5",
  },
  {
    id: "a6",
    title: "Counting handoffs for a year",
    date: "3 Sep",
    year: "2025",
    topic: "Measurement",
    readMinutes: 7,
    href: "#a6",
  },
  {
    id: "a7",
    title: "Gloves, glare, and the death of the confirm dialog",
    date: "14 Jun",
    year: "2025",
    topic: "Field note",
    readMinutes: 5,
    href: "#a7",
  },
  {
    id: "a8",
    title: "Why the scheduler refuses",
    date: "2 Apr",
    year: "2025",
    topic: "Product",
    readMinutes: 8,
    href: "#a8",
  },
];

/**
 * The whole archive, filterable by topic and grouped by year — the page for
 * someone who has decided this is worth reading properly and wants to find
 * the post they half-remember. Deliberately dense and deliberately still: an
 * archive is a finding tool, and every animation between a reader and a list
 * of titles is a tax on that.
 */
export function BlogArchive({
  eyebrow = "Waylight · archive",
  headline = "Everything, oldest kept.",
  copy = "Nothing is unpublished and nothing is gated. Corrections stay attached to the post they correct.",
  entries = DEFAULT_ENTRIES,
  className,
}: BlogArchiveProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [topic, setTopic] = React.useState("all");

  const topics = React.useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.topic))).sort(),
    [entries],
  );

  const shown = React.useMemo(
    () =>
      topic === "all"
        ? entries
        : entries.filter((entry) => entry.topic === topic),
    [entries, topic],
  );

  // Years are derived from what is shown, so filtering never leaves an empty
  // year heading behind.
  const years = React.useMemo(
    () =>
      Array.from(new Set(shown.map((entry) => entry.year)))
        .sort()
        .reverse(),
    [shown],
  );

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h1
          id={headingId}
          className="mt-3 text-4xl font-semibold tracking-tight text-balance"
        >
          {headline}
        </h1>
        <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
          <div className="-mx-1 max-w-full min-w-0 overflow-x-auto px-1 pb-1">
            <SegmentedControl
              value={topic}
              onValueChange={setTopic}
              aria-label="Filter by topic"
              className="w-max"
            >
              <SegmentedControlItem value="all">All</SegmentedControlItem>
              {topics.map((name) => (
                <SegmentedControlItem key={name} value={name}>
                  {name}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          <p className="flex shrink-0 items-baseline gap-1.5">
            <Readout value={shown.length} />
            <span className="text-sm text-ink-3">
              {shown.length === 1 ? "post" : "posts"}
            </span>
          </p>
        </div>

        {years.map((year) => (
          <section key={year} className="mt-10">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-ink-3">
              {year}
            </h2>
            <ul className="mt-3 flex flex-col">
              {shown
                .filter((entry) => entry.year === year)
                .map((entry) => (
                  <motion.li
                    key={entry.id}
                    layout={motionSafe}
                    transition={
                      motionSafe
                        ? { duration: durations.base, ease: easings.enter }
                        : { duration: 0 }
                    }
                    className="border-t border-hairline"
                  >
                    <a
                      href={entry.href}
                      className="group flex min-w-0 items-baseline gap-4 py-3"
                    >
                      <span className="w-14 shrink-0 font-mono text-[11px] text-ink-3">
                        {entry.date}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug text-ink transition-colors group-hover:text-primary">
                        {entry.title}
                      </span>
                      <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase sm:inline">
                        {entry.topic} · {entry.readMinutes} min
                      </span>
                    </a>
                  </motion.li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
