"use client";

import * as React from "react";

import { RadialBars, type RadialBar } from "@/registry/ui/radial-bars";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type RingNote = {
  id: string;
  label: string;
  /** The plain-language reading beside the wedge. */
  reading: string;
};

export type StatsRingSetProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The wedges. Values share one scale, so `max` matters. */
  data?: RadialBar[];
  /** Value that reaches the outer radius. */
  max?: number;
  /** Formats the hub readout and the wedge values. */
  suffix?: string;
  notes?: RingNote[];
  /** The measurement window, stamped. */
  window?: string;
  className?: string;
};

const DEFAULT_DATA: RadialBar[] = [
  { label: "Boards read at the gate", value: 94 },
  { label: "Shifts closed the same day", value: 71 },
  { label: "Reshuffles taken without a call", value: 52 },
  { label: "Whiteboards actually taken down", value: 29 },
];

const DEFAULT_NOTES: RingNote[] = [
  {
    id: "n1",
    label: "Boards read at the gate",
    reading: "Of boards cut, the share a crew opened before the shift started.",
  },
  {
    id: "n2",
    label: "Shifts closed the same day",
    reading: "Days filed into the ledger before midnight, unedited afterwards.",
  },
  {
    id: "n3",
    label: "Reshuffles taken without a call",
    reading:
      "Changes that propagated and were acted on with no radio traffic. Half the time the radio still wins.",
  },
  {
    id: "n4",
    label: "Whiteboards actually taken down",
    reading:
      "Our worst number, and the only one that means the habit changed rather than the tooling.",
  },
];

/**
 * Four proportions on one scale, read as wedges rather than numerals: the
 * radial set makes shares comparable at a glance in a way four separate
 * percentages never are, and every wedge carries a plain sentence saying what
 * it counts. Give it values with real spread: four numbers inside a twenty
 * point band are indistinguishable as wedges, and a set all above ninety is a
 * set nobody believes anyway.
 */
export function StatsRingSet({
  eyebrow = "Waylight · measured, not claimed",
  headline = "Four numbers, one scale.",
  copy = "All four are shares of the same population, so the wedge lengths are directly comparable — which is the point, because they are not close. The definitions are printed, since a percentage without one is decoration.",
  data = DEFAULT_DATA,
  max = 100,
  suffix = "%",
  notes = DEFAULT_NOTES,
  window = "rolling 90 days · 214 yards",
  className,
}: StatsRingSetProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
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
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16">
          <div className="mx-auto min-w-0">
            <RadialBars
              data={data}
              max={max}
              size={260}
              format={(value) => `${value}${suffix}`}
              aria-label="Four shares on one scale"
            />
          </div>

          <div className="min-w-0">
            <dl className="flex flex-col gap-5">
              {notes.map((note, index) => (
                <div
                  key={note.id}
                  className="min-w-0 border-t border-hairline pt-3"
                >
                  <dt className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium text-ink">{note.label}</span>
                    <span className="font-mono text-sm text-ink-2">
                      {data[index]?.value ?? "—"}
                      {suffix}
                    </span>
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink-3">
                    {note.reading}
                  </dd>
                </div>
              ))}
            </dl>
            {window && (
              <p className="mt-6">
                <StatusSeal>{window}</StatusSeal>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
