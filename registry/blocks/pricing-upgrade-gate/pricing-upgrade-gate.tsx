"use client";

import * as React from "react";

import { ArrowRight, Check, Plus } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type UpgradeGateProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  currentName?: string;
  currentKeeps?: string[];
  nextName?: string;
  nextPrice?: string;
  /** What the upgrade ADDS — rendered as plus-rows, a diff, not a matrix. */
  gains?: string[];
  cta?: string;
  onCta?: () => void;
  fineprint?: string;
  className?: string;
};

const DEFAULT_KEEPS = ["Your benches and history", "Every current integration", "The same URLs and exports"];

const DEFAULT_GAINS = [
  "Unlimited benches — the ten-bench cap lifts",
  "Full history, forever, backfilled from day one",
  "Priority queue on every run",
  "A named support desk with a four-hour reply",
];

/**
 * The upgrade stated as a diff, not a matrix: what you keep on one side —
 * everything, in plain words — and what the next tier adds as plus-rows on
 * the other, the way an honest changelog reads. Nothing about the current
 * plan is dimmed or shamed; the gate sells the difference, not the doubt.
 */
export function PricingUpgradeGate({
  eyebrow = "Fieldline · upgrade",
  headline = "Crew, as a diff.",
  copy = "Everything you have stays exactly as it is. This is only what changes.",
  currentName = "Field (current)",
  currentKeeps = DEFAULT_KEEPS,
  nextName = "Crew",
  nextPrice = "$19 / seat / month, billed annually",
  gains = DEFAULT_GAINS,
  cta = "Upgrade to Crew",
  onCta,
  fineprint = "Prorated from today. Downgrading later keeps your history.",
  className,
}: UpgradeGateProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
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
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 grid overflow-hidden border shadow-raised md:grid-cols-2">
          <div className="border-hairline border-b p-6 md:border-r md:border-b-0 sm:p-8">
            <p className="text-label text-ink-3">{currentName}</p>
            <p className="text-ink mt-2 font-medium">You keep</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {currentKeeps.map((keep) => (
                <li key={keep} className="text-ink-2 flex items-center gap-2.5 text-sm">
                  <Check
                    className="text-[var(--success,var(--primary))] size-4 shrink-0"
                    aria-hidden
                  />
                  {keep}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-surface-0 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-label text-ink-3">{nextName}</p>
              <StatusSeal variant="info">{nextPrice}</StatusSeal>
            </div>
            <p className="text-ink mt-2 font-medium">You gain</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {gains.map((gain) => (
                <li key={gain} className="text-ink-2 flex items-start gap-2.5 text-sm">
                  <Plus
                    className="text-[var(--accent-bright,var(--primary))] mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  {gain}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <PressureButton onClick={onCta}>
                {cta}
                <ArrowRight className="size-4" aria-hidden />
              </PressureButton>
            </div>
          </div>
        </div>

        <p className="text-ink-3 mt-4 font-mono text-[11px] tracking-[0.06em] uppercase">
          {fineprint}
        </p>
      </div>
    </section>
  );
}
