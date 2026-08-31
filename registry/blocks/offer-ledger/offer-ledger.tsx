"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OfferRow = {
  id: string;
  /** What we do. */
  service: string;
  /** What you actually get, concretely. */
  outcome: string;
  /** What it costs to start, plainly. */
  toStart: string;
};

export type OfferLedgerProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  rows?: OfferRow[];
  className?: string;
};

const DEFAULT_ROWS: OfferRow[] = [
  {
    id: "r1",
    service: "Morning planning",
    outcome: "A cut board before the gate, every day, reasoning printed",
    toStart: "Free, one yard",
  },
  {
    id: "r2",
    service: "Change propagation",
    outcome: "One edit reaching every board that shares the constraint",
    toStart: "Included",
  },
  {
    id: "r3",
    service: "The record",
    outcome: "Append-only history with exports that carry provenance",
    toStart: "Included",
  },
  {
    id: "r4",
    service: "Rollout with our team",
    outcome: "Constraints wired in by people who have run yards",
    toStart: "Two to three days",
  },
];

/**
 * The offer as a ledger: one row per service, and every row forced to
 * complete three honest columns — what we do, what you concretely get, and
 * what it costs to start. The discipline is the section: an offer that
 * cannot fill its own outcome column is a feature looking for a buyer,
 * and this layout makes that visible before a customer does.
 */
export function OfferLedger({
  eyebrow = "Fieldline · what we offer",
  headline = "Four services, three honest columns.",
  copy = "If a row cannot say what you get and what it costs to begin, it does not ship. That rule built this table.",
  rows = DEFAULT_ROWS,
  className,
}: OfferLedgerProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

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

        <div className="border-hairline mt-10 overflow-hidden rounded-4 border">
          <div className="border-hairline text-label text-ink-3 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] gap-4 border-b px-5 py-3 sm:grid">
            <span>What we do</span>
            <span>What you get</span>
            <span>To start</span>
          </div>
          <ul>
            {rows.map((row, index) => (
              <motion.li
                key={row.id}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                whileInView={{ opacity: 1 }}
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
                className="border-hairline grid gap-x-4 gap-y-1.5 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)]"
              >
                <p className="text-ink min-w-0 font-medium">{row.service}</p>
                <p className="text-ink-2 min-w-0 text-sm leading-relaxed">
                  <span className="text-ink-3 sm:hidden">You get · </span>
                  {row.outcome}
                </p>
                <p className="text-ink-2 min-w-0 font-mono text-xs">
                  <span className="text-ink-3 sm:hidden">To start · </span>
                  {row.toStart}
                </p>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
