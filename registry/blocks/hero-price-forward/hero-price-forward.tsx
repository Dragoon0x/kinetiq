"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HeroPriceForwardProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The number, above the fold, unqualified. */
  price?: number;
  currency?: string;
  period?: string;
  /** What that number actually covers. */
  includes?: string[];
  cta?: string;
  onCta?: () => void;
  /** The line that makes the price believable. */
  footnote?: string;
  className?: string;
};

const DEFAULT_INCLUDES = [
  "Every instrument, no tiers",
  "Unlimited yards and crews",
  "Full history and exports",
  "Support from people who ran yards",
];

/**
 * A hero that leads with the price. Most pages spend the fold establishing
 * that they are worth asking about; this one answers the question the visitor
 * came with and lets the rest of the page earn the number afterwards. It only
 * works with simple pricing and nothing hidden below — a headline price with
 * an asterisk is worse than no price at all.
 */
export function HeroPriceForward({
  eyebrow = "Fieldline",
  headline = "Nineteen a seat. That is the whole page.",
  copy = "One plan, every feature, no call required. The rest of this page is us showing our working — you already know what it costs.",
  price = 19,
  currency = "$",
  period = "per seat / month",
  includes = DEFAULT_INCLUDES,
  cta = "Start now",
  onCta,
  footnote = "Billed monthly, cancel from the settings page, exports work after you leave.",
  className,
}: HeroPriceForwardProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(4);

  const rise = (index: number) => ({
    initial: {
      opacity: motionSafe ? 0 : 1,
      y: motionSafe ? distances.shift : 0,
    },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay: index * step }
      : { duration: 0 },
  });

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative overflow-hidden bg-surface-0", className)}
    >
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="min-w-0">
          <motion.p {...rise(0)} className="text-label text-ink-3">
            {eyebrow}
          </motion.p>
          <motion.h1
            {...rise(1)}
            id={headingId}
            className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            {headline}
          </motion.h1>
          <motion.p
            {...rise(2)}
            className="mt-5 max-w-md text-lg leading-relaxed text-ink-2"
          >
            {copy}
          </motion.p>
          <motion.ul {...rise(3)} className="mt-8 grid gap-2 sm:grid-cols-2">
            {includes.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-ink-2"
              >
                <Check
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-[var(--success,var(--primary))]"
                />
                {item}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* The number, given its own plate so nothing crowds it. */}
        <motion.div
          {...rise(2)}
          className="min-w-0 rounded-4 border border-hairline bg-surface-1 p-8 text-center shadow-raised"
        >
          <p className="flex items-start justify-center gap-1">
            <span className="mt-2 text-2xl text-ink-3">{currency}</span>
            <Readout value={price} size="lg" className="text-5xl" />
          </p>
          <p className="mt-2 text-sm text-ink-3">{period}</p>
          <PressureButton size="lg" onClick={onCta} className="mt-6 w-full">
            {cta}
          </PressureButton>
          {footnote && (
            <p className="mx-auto mt-4 max-w-[15rem] text-xs leading-relaxed text-ink-3">
              {footnote}
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
