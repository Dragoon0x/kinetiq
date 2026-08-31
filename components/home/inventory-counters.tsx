"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";

export type InventoryStat = {
  label: string;
  value: number;
};

/**
 * One stat whose numerals roll up when the band scrolls into view. The
 * server renders the true value — no-JS readers and crawlers see the real
 * count — and on first sight the odometer drops to zero instantly
 * (rollOn="increase" swaps decreases in) and rolls up to the same truth.
 * Reduced motion never re-rolls: the number just stands.
 */
function CountUpStat({ label, value }: InventoryStat) {
  const motionSafe = useMotionSafe();
  const [shown, setShown] = React.useState(value);

  const perform = () => {
    if (!motionSafe) return;
    setShown(0);
    window.setTimeout(() => setShown(value), 60);
  };

  return (
    <motion.div
      onViewportEnter={perform}
      viewport={{ once: true, amount: 0.6 }}
    >
      <dd>
        <Readout value={shown} size="xl" rollOn="increase" />
      </dd>
      <dt className="text-label text-ink-3 mt-2">{label}</dt>
    </motion.div>
  );
}

/** The inventory band: every number fed from the real catalog at build time. */
export function InventoryCounters({ stats }: { stats: InventoryStat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
      {stats.map((stat) => (
        <CountUpStat key={stat.label} {...stat} />
      ))}
    </dl>
  );
}
