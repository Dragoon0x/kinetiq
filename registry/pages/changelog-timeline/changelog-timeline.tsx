"use client";

import * as React from "react";

import { motion } from "motion/react";

import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChangeKind = "added" | "changed" | "fixed";

export type ChangeLine = { id: string; kind: ChangeKind; text: string };

export type Release = {
  id: string;
  version: string;
  /** Pre-formatted date — the page never touches a clock. */
  date: string;
  headline: string;
  lines: ChangeLine[];
  href?: string;
};

export type ChangelogTimelineProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  releases?: Release[];
  className?: string;
};

const KIND_LABEL: Record<ChangeKind, string> = {
  added: "new",
  changed: "changed",
  fixed: "fix",
};

const DEFAULT_RELEASES: Release[] = [
  {
    id: "r1",
    version: "r2.14",
    date: "6 March",
    headline: "Signing from the gate",
    href: "#r2-14",
    lines: [
      {
        id: "l1",
        kind: "added",
        text: "Boards can be signed from the gate view without opening the plan.",
      },
      {
        id: "l2",
        kind: "changed",
        text: "Reshuffles name the constraint that caused them, not just the time.",
      },
      {
        id: "l3",
        kind: "fixed",
        text: "Exports no longer drop the final row of a shift closing after midnight.",
      },
    ],
  },
  {
    id: "r2",
    version: "r2.13",
    date: "20 February",
    headline: "Slower, on purpose",
    href: "#r2-13",
    lines: [
      {
        id: "l4",
        kind: "changed",
        text: "The scheduler now withholds any board it cannot explain, rather than publishing its best guess.",
      },
      {
        id: "l5",
        kind: "fixed",
        text: "Tide windows were being read an hour early in one timezone. Four yards affected; all were told before we shipped the fix.",
      },
    ],
  },
  {
    id: "r3",
    version: "r2.12",
    date: "4 February",
    headline: "One record, four yards",
    href: "#r2-12",
    lines: [
      {
        id: "l6",
        kind: "added",
        text: "A single board can carry constraints from more than one site.",
      },
      {
        id: "l7",
        kind: "added",
        text: "Shared gear appears on every board that depends on it.",
      },
      {
        id: "l8",
        kind: "fixed",
        text: "Crew rest was counted from shift start rather than shift end.",
      },
    ],
  },
];

/**
 * The changelog as a running record, filterable by what kind of change you
 * came looking for. Most changelogs bury fixes under features; this one lets
 * a reader ask for fixes alone, which is what someone chasing a bug they
 * reported actually wants — and it means the fixes have to be written well
 * enough to stand on their own.
 */
export function ChangelogTimeline({
  eyebrow = "Waylight · changelog",
  headline = "Everything that shipped.",
  copy = "Every release since we started, fixes included. Filter by what you are looking for.",
  releases = DEFAULT_RELEASES,
  className,
}: ChangelogTimelineProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [filter, setFilter] = React.useState<"all" | ChangeKind>("all");

  // Releases with nothing matching drop out entirely, so the page never shows
  // an empty release card.
  const shown = React.useMemo(
    () =>
      releases
        .map((release) => ({
          ...release,
          lines:
            filter === "all"
              ? release.lines
              : release.lines.filter((line) => line.kind === filter),
        }))
        .filter((release) => release.lines.length > 0),
    [releases, filter],
  );

  const step = cascade(Math.max(shown.length, 1));

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

        <div className="-mx-6 mt-8 overflow-x-auto px-6 pb-1">
          <SegmentedControl
            value={filter}
            onValueChange={(value) => setFilter(value as "all" | ChangeKind)}
            aria-label="Filter changes"
            className="w-max"
          >
            <SegmentedControlItem value="all">Everything</SegmentedControlItem>
            <SegmentedControlItem value="added">New</SegmentedControlItem>
            <SegmentedControlItem value="changed">Changed</SegmentedControlItem>
            <SegmentedControlItem value="fixed">Fixes</SegmentedControlItem>
          </SegmentedControl>
        </div>

        <ol className="mt-10 flex flex-col gap-10">
          {shown.map((release, index) => (
            <motion.li
              key={release.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
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
              className="min-w-0 border-t border-hairline pt-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <StatusSeal>{release.version}</StatusSeal>
                <h2 className="min-w-0 text-xl font-semibold tracking-tight text-ink">
                  {release.href ? (
                    <a
                      href={release.href}
                      className="transition-colors hover:text-primary"
                    >
                      {release.headline}
                    </a>
                  ) : (
                    release.headline
                  )}
                </h2>
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
                  {release.date}
                </span>
              </div>

              <ul className="mt-4 flex flex-col gap-2.5">
                {release.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex min-w-0 items-baseline gap-3"
                  >
                    <span
                      className={cn(
                        "w-16 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                        line.kind === "fixed" ? "text-ink-3" : "text-ink-2",
                      )}
                    >
                      {KIND_LABEL[line.kind]}
                    </span>
                    <span className="min-w-0 text-sm leading-relaxed text-ink-2">
                      {line.text}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </ol>

        {shown.length === 0 && (
          <p className="mt-10 border-t border-hairline pt-6 text-sm text-ink-3">
            Nothing of that kind in the releases shown.
          </p>
        )}
      </div>
    </main>
  );
}
