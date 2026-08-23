"use client";

import * as React from "react";

import { StickyReveal } from "@/registry/ui/sticky-reveal";
import { cn } from "@/registry/lib/utils";

export type PinnedScene = {
  id: string;
  step: string;
  title: string;
  copy: string;
  /** The mono lines shown on the scene's face. */
  lines: string[];
};

export type FeaturesPinnedScrollProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  scenes?: PinnedScene[];
  /** Pinned stage height in px. @default 320 */
  height?: number;
  className?: string;
};

const DEFAULT_SCENES: PinnedScene[] = [
  {
    id: "s1",
    step: "01",
    title: "The night writes itself down",
    copy: "Late barges, crane holds, and short crews land as rows while the yard sleeps.",
    lines: [
      "23:41  barge OKARA  +3h",
      "01:07  crane 2  hold, inspection",
      "04:31  crew B  one short",
    ],
  },
  {
    id: "s2",
    step: "02",
    title: "The board is cut before the gate",
    copy: "Constraints in, plan out, with the reasoning printed at the top of the sheet.",
    lines: [
      "05:55  plan r2  cut",
      "       cause  crane 2 hold",
      "       moved  rig test → 13:00",
    ],
  },
  {
    id: "s3",
    step: "03",
    title: "A change costs one edit",
    copy: "Reshuffles propagate to every board sharing the constraint. Nobody re-keys anything.",
    lines: [
      "11:20  swap  coating → crew B",
      "       plan r3  2 boards updated",
      "       handover  drafted",
    ],
  },
  {
    id: "s4",
    step: "04",
    title: "The day files itself",
    copy: "The shift closes into the ledger as it happened, ready to be quoted rather than remembered.",
    lines: [
      "17:05  shift closed",
      "       ledger row  4,181",
      "       exports  ready",
    ],
  },
];

/**
 * The feature tour that uses the scroll it already has: the stage pins and
 * scenes cross-fade under it as the reader moves, so the sequence is paced by
 * the page rather than by a control. The pinning and the hand-off between
 * scenes belong entirely to the sticky instrument; this section supplies the
 * four beats and the copy that travels beside them.
 */
export function FeaturesPinnedScroll({
  eyebrow = "Waylight · one day, pinned",
  headline = "Scroll it, and the morning happens.",
  copy = "Four beats of a working day. The stage holds while you read; the scenes move when you do.",
  scenes = DEFAULT_SCENES,
  height = 320,
  className,
}: FeaturesPinnedScrollProps) {
  const headingId = React.useId();

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

        <div className="mt-12">
          <StickyReveal
            height={height}
            aria-label="The morning, beat by beat"
            scenes={scenes.map((scene) => ({
              id: scene.id,
              node: (
                // sticky-reveal centres each scene inside a `text-center` box,
                // so a scene that wants the whole stage has to claim the width
                // and restore its own alignment.
                <div className="flex h-full w-full min-w-0 flex-col justify-between gap-6 rounded-4 border border-hairline bg-surface-1 p-6 text-left shadow-raised sm:flex-row sm:items-center sm:p-8">
                  <div className="min-w-0 sm:max-w-xs">
                    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3">
                      {scene.step}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-balance text-ink">
                      {scene.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">
                      {scene.copy}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 rounded-2 border border-hairline bg-surface-0 p-4">
                    {scene.lines.map((line) => (
                      <p
                        key={line}
                        className="truncate font-mono text-[11px] leading-6 text-ink-3"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      </div>
    </section>
  );
}
