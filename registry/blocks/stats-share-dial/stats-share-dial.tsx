"use client";

import * as React from "react";

import { DonutBreakdown, type DonutSegment } from "@/registry/ui/donut-breakdown";
import { cn } from "@/registry/lib/utils";

export type ShareNote = { id: string; title: string; copy: string };

export type StatsShareDialProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  segments?: DonutSegment[];
  totalLabel?: string;
  format?: (value: number) => string;
  notes?: ShareNote[];
  className?: string;
};

/** Raw counts — the dial computes the shares itself and prints both. */
const DEFAULT_SEGMENTS: DonutSegment[] = [
  { id: "routed", label: "Auto-routed", value: 8940 },
  { id: "assisted", label: "Assisted", value: 2260 },
  { id: "manual", label: "Hand-sorted", value: 1010 },
  { id: "escalated", label: "Escalated", value: 380 },
];

const DEFAULT_NOTES: ShareNote[] = [
  {
    id: "auto",
    title: "Seven in ten never wait",
    copy: "Auto-routed requests land with the right desk before anyone reads them — the share this whole product exists to grow.",
  },
  {
    id: "manual",
    title: "The hand-sorted rump is shrinking",
    copy: "Eight percent still needs a person to place it, down from a third at launch. Each month's classifier update takes another bite.",
  },
];

/**
 * A share-of-everything stats section: the dial is the library's own donut —
 * slices that pop out under the pointer, a centre readout that follows the
 * active slice — beside two notes that say what the shares mean. Proportions
 * carry this story better than counts, and the dial is built for exactly
 * that reading. Segments carry raw counts; the dial derives every share,
 * so the legend's number and its percentage never disagree.
 */
export function StatsShareDial({
  eyebrow = "Switchyard · where requests go",
  headline = "Most of the queue never touches a person.",
  copy = "One month of routing, as shares of the whole. Point at a slice; the centre follows.",
  segments = DEFAULT_SEGMENTS,
  totalLabel = "requests / month",
  format = (v) => v.toLocaleString("en-US"),
  notes = DEFAULT_NOTES,
  className,
}: StatsShareDialProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-16">
          <div className="max-w-lg">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>

            <dl className="mt-8 flex flex-col gap-5">
              {notes.map((note) => (
                <div key={note.id}>
                  <dt className="text-ink font-medium">{note.title}</dt>
                  <dd className="text-ink-2 mt-1 text-sm leading-relaxed">
                    {note.copy}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border-hairline bg-surface-1 rounded-4 border p-6 shadow-raised sm:p-8">
            <DonutBreakdown
              segments={segments}
              totalLabel={totalLabel}
              format={format}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
