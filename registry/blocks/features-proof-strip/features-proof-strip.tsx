"use client";

import * as React from "react";

import { motion } from "motion/react";

import { BreakerSwitch } from "@/registry/ui/breaker-switch";
import { Readout } from "@/registry/ui/readout";
import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FeaturesProofStripProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  className?: string;
};

/**
 * Three claims, each proven by a working control instead of an icon: flip
 * the breaker and the guard state actually flips, watch the count roll as
 * the queue drains, see the presence pip breathe because it is genuinely
 * live. A feature strip where every cell answers the reader's click is worth
 * a page of adjectives — the section's job is only to arrange the proof.
 */
export function FeaturesProofStrip({
  eyebrow = "Keeper · felt, not claimed",
  headline = "Try the claims.",
  copy = "Each of these cells is the real control, wired the way it ships. If a claim moves when you touch it, it is true.",
  className,
}: FeaturesProofStripProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(3);

  const [armed, setArmed] = React.useState(true);
  const [drained, setDrained] = React.useState(184);

  const cells: { id: string; title: string; copy: string; proof: React.ReactNode }[] = [
    {
      id: "enforce",
      title: "Enforcement you can throw",
      copy: "Policies arm and disarm like a breaker — deliberate travel, a real detent, and the state you left it in.",
      proof: (
        <div className="flex items-center gap-3">
          <BreakerSwitch
            checked={armed}
            onCheckedChange={setArmed}
            label="Enforcement"
            size="lg"
          />
          <span className="text-label text-ink-3">
            {armed ? "ENFORCING" : "REHEARSAL"}
          </span>
        </div>
      ),
    },
    {
      id: "queue",
      title: "A queue that visibly drains",
      copy: "Every check the fleet clears rolls off the counter — the number is the progress bar.",
      proof: (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrained((n) => Math.max(0, n - 7))}
            className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Clear a batch
          </button>
          <span className="flex items-baseline gap-1.5">
            <Readout value={drained} size="md" />
            <span className="text-label text-ink-3">PENDING</span>
          </span>
        </div>
      ),
    },
    {
      id: "presence",
      title: "Hosts that admit being alive",
      copy: "Presence is measured, not assumed — the pip breathes only while the heartbeat does.",
      proof: <StatusPip status="online" label="fleet-plane · heartbeat 4s" />,
    },
  ];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
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

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {cells.map((cell, index) => (
            <motion.div
              key={cell.id}
              initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? distances.shift : 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="border-hairline bg-surface-1 rounded-4 flex flex-col border p-6"
            >
              <h3 className="text-ink font-semibold">{cell.title}</h3>
              <p className="text-ink-2 mt-2 flex-1 text-sm leading-relaxed">
                {cell.copy}
              </p>
              <div className="border-hairline mt-5 border-t pt-4">{cell.proof}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
