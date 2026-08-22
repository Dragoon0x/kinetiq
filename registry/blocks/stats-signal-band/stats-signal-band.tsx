"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BandStat = {
  id: string;
  value: number;
  /** Rendered after the numeral, in the numeral's size. */
  suffix?: string;
  label: string;
};

export type StatsSignalBandProps = {
  kicker?: string;
  stats?: BandStat[];
  /** The closing line under the band. */
  footnote?: string;
  className?: string;
};

const DEFAULT_STATS: BandStat[] = [
  { id: "yards", value: 214, label: "yards on the morning shift" },
  { id: "crews", value: 1180, suffix: "+", label: "crews planned daily" },
  { id: "handoffs", value: 31, suffix: "k", label: "handoffs a week" },
  { id: "recovered", value: 9, suffix: "h", label: "recovered per yard, weekly" },
];

/**
 * A stats band set like a headline, not a dashboard: oversized numerals on a
 * single rule, edge to edge, no cards and no charts. Every numeral is the
 * library's rolling readout at display size, resolving on the cascade as the
 * band enters. The claim is the number; everything else stays out of its
 * way.
 */
export function StatsSignalBand({
  kicker = "THE MORNING, MEASURED",
  stats = DEFAULT_STATS,
  footnote = "Counted across every live yard, updated at shift close.",
  className,
}: StatsSignalBandProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(stats.length);

  return (
    <section
      aria-label="Key numbers"
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-16 sm:py-20">
        <p className="text-label text-ink-3">{kicker}</p>

        <dl className="border-hairline mt-6 grid grid-cols-2 gap-x-8 gap-y-10 border-t pt-10 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.id}
              initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? 12 : 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="min-w-0"
            >
              <dd className="text-ink flex items-baseline font-mono font-semibold">
                <Readout
                  value={stat.value}
                  size="xl"
                  format={(v) => v.toLocaleString("en-US")}
                />
                {stat.suffix && <span className="text-4xl">{stat.suffix}</span>}
              </dd>
              <dt className="text-ink-3 mt-2 text-sm">{stat.label}</dt>
            </motion.div>
          ))}
        </dl>

        {footnote && (
          <p className="text-ink-3 mt-10 font-mono text-[11px] tracking-[0.08em] uppercase">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
