"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type PricingSingleLineProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  price?: number;
  per?: string;
  included?: string[];
  cta?: string;
  onCta?: () => void;
  /** The one honest caveat, stated with the price. */
  caveat?: string;
  className?: string;
};

const DEFAULT_INCLUDED = [
  "Every instrument, every bench",
  "Unlimited seats and yards",
  "Full history, forever",
  "Exports with lineage",
  "SSO and audit trail",
  "A person answers support",
  "No usage meters anywhere",
  "Leave with all your data",
];

/**
 * One plan, stated whole: a single price on the rolling readout, everything
 * included in one honest list, and the caveat printed beside the price
 * instead of buried under it. The anti-matrix — for products confident
 * enough to have one answer to "how much".
 */
export function PricingSingleLine({
  eyebrow = "Waylight · pricing",
  headline = "One plan. The whole thing.",
  copy = "No tiers to decode, no features held hostage. Every yard gets everything; the price only follows your size.",
  price = 89,
  per = "per yard / month",
  included = DEFAULT_INCLUDED,
  cta = "Start a yard",
  onCta,
  caveat = "Yards under five people are free until they grow.",
  className,
}: PricingSingleLineProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
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

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border shadow-raised">
          <div className="border-hairline border-b px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
              <p className="flex items-baseline gap-1.5">
                <span className="text-ink-3 text-xl">$</span>
                <Readout value={price} size="xl" />
                <span className="text-ink-3 ml-1 text-sm">{per}</span>
              </p>
              <PressureButton size="lg" onClick={onCta}>
                {cta}
              </PressureButton>
            </div>
            {/* A caveat is a sentence; a seal is a word. Prose wraps here. */}
            <p className="text-ink-3 mt-3 text-sm">{caveat}</p>
          </div>
          <ul className="grid gap-x-8 gap-y-3 px-6 py-6 sm:grid-cols-2 sm:px-8">
            {included.map((item) => (
              <li key={item} className="text-ink-2 flex items-center gap-2.5 text-sm">
                <Check
                  className="text-[var(--success,var(--primary))] size-4 shrink-0"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
