"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type CloseCount = { value: number; suffix?: string; label: string };

export type CtaLedgerCloseProps = {
  headline?: [string, string];
  copy?: string;
  counts?: CloseCount[];
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  className?: string;
};

const DEFAULT_COUNTS: CloseCount[] = [
  { value: 214, label: "yards this morning" },
  { value: 1180, suffix: "+", label: "crews planned daily" },
  { value: 9, suffix: "h", label: "recovered per yard, weekly" },
];

/**
 * A closing move that argues from the ledger: the day's counts roll in on
 * the left — the same numbers the stats band carries, now doing sales duty —
 * and the ask stands on the right with both doors open. The section reads
 * as a receipt with a signature line: here is what happened today; join it.
 */
export function CtaLedgerClose({
  headline = ["The morning is already", "running without the argument."],
  copy = "Every count on this line happened today. Tomorrow's line has room on it.",
  counts = DEFAULT_COUNTS,
  primaryCta = "Start your yard",
  secondaryCta = "Talk to the field team",
  onPrimary,
  onSecondary,
  className,
}: CtaLedgerCloseProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="border-hairline rounded-4 grid items-center gap-10 border p-8 sm:p-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div>
            <h2
              id={headingId}
              className="text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline[0]}
              <br />
              {headline[1]}
            </h2>
            <p className="text-ink-2 mt-4 max-w-md leading-relaxed">{copy}</p>

            <dl className="border-hairline mt-8 flex flex-wrap items-center gap-x-10 gap-y-4 border-t pt-6">
              {counts.map((count) => (
                <div key={count.label}>
                  <dd className="text-ink flex items-baseline font-mono text-2xl font-semibold">
                    <Readout
                      value={count.value}
                      size="lg"
                      format={(v) => v.toLocaleString("en-US")}
                    />
                    {count.suffix && <span>{count.suffix}</span>}
                  </dd>
                  <dt className="text-ink-3 mt-1 text-xs">{count.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col items-stretch gap-3 lg:items-end">
            <PressureButton size="lg" onClick={onPrimary} className="lg:w-64">
              {primaryCta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton
              size="lg"
              variant="outline"
              onClick={onSecondary}
              className="lg:w-64"
            >
              {secondaryCta}
            </PressureButton>
          </div>
        </div>
      </div>
    </section>
  );
}
