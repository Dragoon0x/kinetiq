"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { CaliperSlider } from "@/registry/ui/caliper-slider";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type UsageBand = {
  /** Upper bound of the band, in the metered unit. */
  upTo: number;
  /** Price per unit inside this band, in cents. */
  centsPerUnit: number;
};

export type PricingUsageDialProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The metered unit, plural. */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultUsage?: number;
  /** Progressive bands, ascending by `upTo`; the last band caps the meter. */
  bands?: UsageBand[];
  included?: string[];
  cta?: string;
  onCta?: (usage: number) => void;
  className?: string;
};

const DEFAULT_BANDS: UsageBand[] = [
  { upTo: 10_000, centsPerUnit: 0.4 },
  { upTo: 50_000, centsPerUnit: 0.25 },
  { upTo: 200_000, centsPerUnit: 0.12 },
];

/** Progressive total in whole dollars — each band prices only its own span. */
function totalFor(usage: number, bands: UsageBand[]): number {
  let remaining = usage;
  let floor = 0;
  let cents = 0;
  for (const band of bands) {
    const span = Math.max(0, Math.min(usage, band.upTo) - floor);
    cents += span * band.centsPerUnit;
    remaining -= span;
    floor = band.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(cents / 100);
}

/**
 * Usage pricing you can measure: one caliper, one bill. Drag the jaws to the
 * volume you expect and the monthly total carry-rolls to meet it, priced
 * through progressive bands so the per-unit rate falls as the span grows —
 * and the bands are printed right there, because a price you can check beats
 * a price you must trust. The caliper is the library's own instrument; the
 * total is a readout.
 */
export function PricingUsageDial({
  eyebrow = "Relay · pricing",
  headline = "Measure your bill before it exists.",
  copy = "Set the caliper to the runs you expect this month. The bands are progressive — each span is priced at its own rate, so the average cost per run falls as volume grows.",
  unit = "runs",
  min = 1_000,
  max = 200_000,
  step = 1_000,
  defaultUsage = 40_000,
  bands = DEFAULT_BANDS,
  included = [
    "Every pipeline feature",
    "Unlimited seats",
    "30-day run history",
    "No charge for retries",
  ],
  cta = "Start metering",
  onCta,
  className,
}: PricingUsageDialProps) {
  const headingId = React.useId();
  const [usage, setUsage] = React.useState(defaultUsage);
  const total = totalFor(usage, bands);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
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

        <div className="border-hairline bg-surface-1 rounded-4 mx-auto mt-12 max-w-3xl border p-6 shadow-raised sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-label text-ink-3">Expected volume</p>
              <p className="mt-2 flex items-baseline gap-2">
                <Readout
                  value={usage}
                  size="md"
                  format={(v) => v.toLocaleString("en-US")}
                />
                <span className="text-ink-3 text-sm">{unit} / month</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-label text-ink-3">Monthly total</p>
              <p className="mt-2 flex items-baseline justify-end gap-1">
                <span className="text-ink-3 text-lg">$</span>
                <Readout
                  value={total}
                  size="lg"
                  format={(v) => v.toLocaleString("en-US")}
                />
              </p>
            </div>
          </div>

          <div className="mt-8">
            <CaliperSlider
              label={`Expected ${unit} per month`}
              min={min}
              max={max}
              step={step}
              value={usage}
              onValueChange={(v) => setUsage(Array.isArray(v) ? (v[0] ?? min) : v)}
              format={(v) => `${(v / 1000).toFixed(0)}k`}
              readout="none"
              marks={bands.map((band) => band.upTo).filter((v) => v < max)}
            />
          </div>

          {/* The bands, in the open. */}
          <dl className="border-hairline mt-8 grid gap-3 border-t pt-6 sm:grid-cols-3">
            {bands.map((band, index) => {
              const floor = index === 0 ? 0 : (bands[index - 1]?.upTo ?? 0);
              const active = usage > floor;
              return (
                <div
                  key={band.upTo}
                  className={cn(
                    "border-hairline rounded-2 border px-3 py-2.5",
                    active ? "bg-surface-0" : "opacity-50",
                  )}
                >
                  <dt className="text-label text-ink-3">
                    {(floor / 1000).toFixed(0)}k – {(band.upTo / 1000).toFixed(0)}k
                  </dt>
                  <dd className="text-ink mt-1 font-mono text-sm">
                    {band.centsPerUnit}¢ <span className="text-ink-3">/ {unit.replace(/s$/, "")}</span>
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <ul className="flex flex-col gap-1.5">
              {included.map((item) => (
                <li key={item} className="text-ink-2 flex items-center gap-2 text-sm">
                  <Check
                    className="text-[var(--success,var(--primary))] size-4 shrink-0"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-end gap-2">
              <StatusSeal variant="success">No minimum</StatusSeal>
              <PressureButton size="lg" onClick={() => onCta?.(usage)}>
                {cta}
              </PressureButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
