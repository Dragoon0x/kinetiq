"use client";

import * as React from "react";

import { GaugeCluster, type Gauge } from "@/registry/ui/gauge-cluster";
import { cn } from "@/registry/lib/utils";

export type GaugeNote = { id: string; title: string; copy: string };

export type FeaturesGaugeRowProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  gauges?: Gauge[];
  notes?: GaugeNote[];
  /** The line naming the bench conditions. */
  attestation?: string;
  className?: string;
};

const DEFAULT_GAUGES: Gauge[] = [
  { id: "ingest", label: "Ingest", value: 63, unit: "%", redline: 85 },
  { id: "latency", label: "Settle", value: 41, max: 120, unit: "ms", redline: 100 },
  { id: "headroom", label: "Fleet", value: 214, max: 400, unit: "svc", redline: 360 },
];

const DEFAULT_NOTES: GaugeNote[] = [
  {
    id: "headroom",
    title: "Built to run at two-thirds",
    copy: "The needles sit where a healthy floor sits — real load, visible headroom, red zones you can actually reach before customers do.",
  },
  {
    id: "honest",
    title: "The same gauges ops watches",
    copy: "These are the product's own instruments at bench conditions, not a marketing rendering of them.",
  },
];

/**
 * Capability as headroom: three needle gauges from the library's own cluster,
 * swept to bench-condition values with their red zones showing — because a
 * needle sitting at two-thirds with a visible redline says more about
 * capacity than any adjective. Two notes below say what the reader is
 * looking at and why the honesty is the feature.
 */
export function FeaturesGaugeRow({
  eyebrow = "Gaugeworks · at bench conditions",
  headline = "Where the needles sit on a good day.",
  copy = "Real instruments, real load. The red zones are drawn because we expect you to look for them.",
  gauges = DEFAULT_GAUGES,
  notes = DEFAULT_NOTES,
  attestation = "Bench conditions: reference fleet, mid-shift load, no smoothing.",
  className,
}: FeaturesGaugeRowProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border p-6 shadow-raised sm:p-8">
          <GaugeCluster gauges={gauges} />
          <p className="text-ink-3 border-hairline mt-6 border-t pt-4 text-center font-mono text-[10px] tracking-[0.1em] uppercase">
            {attestation}
          </p>
        </div>

        <dl className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
          {notes.map((note) => (
            <div key={note.id}>
              <dt className="text-ink font-medium">{note.title}</dt>
              <dd className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                {note.copy}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
