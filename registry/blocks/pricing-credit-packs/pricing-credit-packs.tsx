"use client";

import * as React from "react";

import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  price: number;
  /** Marked on exactly one pack, if any. */
  note?: string;
};

export type PricingCreditPacksProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  packs?: CreditPack[];
  currency?: string;
  /** What one credit actually buys, in plain terms. */
  unitLine?: string;
  /** The terms that make prepaid credits fair. */
  terms?: string[];
  cta?: string;
  onCta?: (pack: CreditPack) => void;
  className?: string;
};

const DEFAULT_PACKS: CreditPack[] = [
  { id: "p1", name: "Starter", credits: 500, price: 40 },
  { id: "p2", name: "Working", credits: 2000, price: 140, note: "most yards" },
  { id: "p3", name: "Floor", credits: 10000, price: 600 },
];

const DEFAULT_TERMS = [
  "Credits never expire",
  "Unused credits refund on request",
  "No monthly minimum",
];

/**
 * Prepaid credits, with the per-credit rate computed rather than claimed:
 * every pack prints what it actually works out to, so the discount is
 * checkable instead of asserted. The seat counter prices people and the usage
 * dial prices continuous volume — this is for products metered in discrete
 * work, where buyers want to spend a fixed amount and know what it buys.
 */
export function PricingCreditPacks({
  eyebrow = "Fernworks · credits",
  headline = "Buy the work, not the month.",
  copy = "Credits are spent when a board is cut. Nothing runs down while you are not using it, and the rate per credit is printed on every pack.",
  packs = DEFAULT_PACKS,
  currency = "$",
  unitLine = "One credit cuts one board, including every reshuffle that day.",
  terms = DEFAULT_TERMS,
  cta = "Buy this pack",
  onCta,
  className,
}: PricingCreditPacksProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(packs.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
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
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {packs.map((pack, index) => {
            // Printed, not claimed: the rate is derived from the pack itself.
            const perCredit = pack.credits > 0 ? pack.price / pack.credits : 0;
            return (
              <motion.li
                key={pack.id}
                initial={{
                  opacity: motionSafe ? 0 : 1,
                  y: motionSafe ? distances.shift : 0,
                }}
                whileInView={{ opacity: 1, y: 0 }}
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
                className={cn(
                  "flex min-w-0 flex-col rounded-4 border border-hairline bg-surface-1 p-6",
                  pack.note && "border-hairline-strong shadow-raised",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{pack.name}</p>
                  {pack.note && <StatusSeal>{pack.note}</StatusSeal>}
                </div>

                <p className="mt-4 flex items-baseline gap-1">
                  <Readout value={pack.credits} size="lg" />
                  <span className="text-sm text-ink-3">credits</span>
                </p>

                <p className="mt-3 flex items-baseline gap-1 text-sm text-ink-2">
                  <span className="text-ink-3">{currency}</span>
                  <Readout value={pack.price} />
                  <span className="text-ink-3">once</span>
                </p>

                <p className="mt-4 border-t border-hairline pt-3 font-mono text-[11px] text-ink-3">
                  {currency}
                  {perCredit.toFixed(3)} per credit
                </p>

                <PressureButton
                  onClick={() => onCta?.(pack)}
                  className="mt-5 w-full"
                >
                  {cta}
                </PressureButton>
              </motion.li>
            );
          })}
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-hairline pt-6">
          <p className="min-w-0 text-sm text-ink-2">{unitLine}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {terms.map((term) => (
              <li
                key={term}
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {term}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
