"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CostSlice = {
  id: string;
  label: string;
  /** Share of the price, 0–100. The bar and the printed percentage derive from it. */
  share: number;
  detail: string;
};

export type PricingWhereItGoesProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The price being accounted for. */
  price?: number;
  currency?: string;
  period?: string;
  slices?: CostSlice[];
  footnote?: string;
  className?: string;
};

const DEFAULT_SLICES: CostSlice[] = [
  {
    id: "c1",
    label: "People who answer",
    share: 41,
    detail:
      "Support and field staff who have run a yard, on shift from five in the morning.",
  },
  {
    id: "c2",
    label: "Building it",
    share: 29,
    detail:
      "Six engineers and a designer. No growth team, because there is nothing to grow yet.",
  },
  {
    id: "c3",
    label: "Running it",
    share: 18,
    detail:
      "Servers, backups, and the second region that exists purely so an outage is boring.",
  },
  {
    id: "c4",
    label: "Keeping the lights on",
    share: 12,
    detail: "Accounting, insurance, and the audits our customers make us pass.",
  },
];

/**
 * Not a plan chooser — a justification: where the price actually goes, one
 * bar per line, adding to the whole. A page that only ever states a number
 * invites the reader to guess what it pays for, and buyers who feel overcharged
 * usually just mean uninformed. Shares are declared once and everything —
 * bar width and printed percentage — derives from them, so the section cannot
 * silently disagree with itself.
 */
export function PricingWhereItGoes({
  eyebrow = "Fieldline · the arithmetic",
  headline = "Where your nineteen dollars goes.",
  copy = "We would rather show the split than defend the number. These are rounded, and they move by a point or two each quarter.",
  price = 19,
  currency = "$",
  period = "per seat / month",
  slices = DEFAULT_SLICES,
  footnote = "Rounded to whole points, so the column may read a point off the price. Updated each quarter from the same ledger our accountants use.",
  className,
}: PricingWhereItGoesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(slices.length);

  const total = slices.reduce((sum, slice) => sum + slice.share, 0) || 1;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
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

        <p className="mt-10 flex items-baseline gap-2 border-b border-hairline pb-5">
          <span className="text-xl text-ink-3">{currency}</span>
          <Readout value={price} size="lg" />
          <span className="text-sm text-ink-3">{period}</span>
        </p>

        <ul className="mt-8 flex flex-col gap-6">
          {slices.map((slice, index) => {
            const pct = Math.round((slice.share / total) * 100);
            return (
              <li key={slice.id} className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium text-ink">{slice.label}</p>
                  <p className="font-mono text-sm text-ink-2">{pct}%</p>
                </div>
                {/* One declared share drives both the bar and the numeral. */}
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-1 bg-surface-2"
                  role="presentation"
                >
                  <motion.div
                    className="h-full rounded-1 bg-primary"
                    initial={{ width: motionSafe ? 0 : `${pct}%` }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={
                      motionSafe
                        ? {
                            duration: durations.slow,
                            ease: easings.enter,
                            delay: index * step,
                          }
                        : { duration: 0 }
                    }
                  />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">
                  {slice.detail}
                </p>
              </li>
            );
          })}
        </ul>

        {footnote && (
          <p className="mt-8 border-t border-hairline pt-5 text-xs leading-relaxed text-ink-3">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
