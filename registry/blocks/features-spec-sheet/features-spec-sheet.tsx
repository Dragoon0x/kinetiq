"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpecRow = {
  id: string;
  term: string;
  value: string;
  /** One plain line under the mono value. */
  note?: string;
};

export type SpecGroup = { heading: string; rows: SpecRow[] };

export type FeaturesSpecSheetProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  groups?: SpecGroup[];
  /** The plate footer — model line and revision. */
  plateLine?: string;
  className?: string;
};

const DEFAULT_GROUPS: SpecGroup[] = [
  {
    heading: "INGEST",
    rows: [
      { id: "i1", term: "Feed formats", value: "12 native · any CSV", note: "Instrument feeds land without adapters." },
      { id: "i2", term: "Dedup window", value: "30s at the weir", note: "Duplicates die at the gate, not in reports." },
      { id: "i3", term: "Provenance", value: "attached, always", note: "Source and time travel with every reading." },
    ],
  },
  {
    heading: "RECORD",
    rows: [
      { id: "r1", term: "History", value: "append-only", note: "Corrections are new rows pointing at old ones." },
      { id: "r2", term: "Rulings", value: "signed · dated", note: "Conflicts wait for a person; both readings kept." },
      { id: "r3", term: "Retention", value: "your call, to 10y", note: "The record outlives the subscription." },
    ],
  },
  {
    heading: "LEAVE",
    rows: [
      { id: "l1", term: "Exports", value: "plain files + lineage", note: "Every number can point back to its row." },
      { id: "l2", term: "Lock-in", value: "none by design", note: "Leaving is a supported workflow." },
    ],
  },
];

/**
 * The product as a spec sheet: capabilities set like a chassis plate —
 * grouped terms, mono values, one plain note each — rows resolving on the
 * cascade as the plate enters. For readers who trust a specification more
 * than an adjective, which is most of the readers worth having.
 */
export function FeaturesSpecSheet({
  eyebrow = "Basinworks · the plate",
  headline = "Read the spec, not the pitch.",
  copy = "Everything below is checkable. If a line stops being true, it comes off the plate.",
  groups = DEFAULT_GROUPS,
  plateLine = "BASINWORKS FIELD SYSTEM · SPEC REV 7 · STAMPED 2026",
  className,
}: FeaturesSpecSheetProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const step = cascade(Math.min(total, 8));
  // Flat index per group start, derived — never reassigned during render.
  const groupOffsets = groups.reduce<number[]>((acc, group, i) => {
    acc.push(i === 0 ? 0 : (acc[i - 1] ?? 0) + (groups[i - 1]?.rows.length ?? 0));
    return acc;
  }, []);

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

        <div className="border-hairline-strong bg-surface-1 rounded-4 mt-10 border-2 shadow-raised">
          {groups.map((group, groupIndex) => (
            <div key={group.heading} className="border-hairline border-b px-6 py-5 last:border-b-0 sm:px-8">
              <p className="text-label text-ink-3">{group.heading}</p>
              <dl className="mt-3 flex flex-col">
                {group.rows.map((row, rowIndex) => {
                  const delay = ((groupOffsets[groupIndex] ?? 0) + rowIndex) * step;
                  return (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: motionSafe ? 0 : 1 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={
                        motionSafe
                          ? { duration: durations.base, ease: easings.enter, delay }
                          : { duration: 0 }
                      }
                      className="border-hairline grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] sm:gap-6"
                    >
                      <dt className="text-ink text-sm font-medium">{row.term}</dt>
                      <dd className="min-w-0">
                        <span className="text-ink font-mono text-sm">{row.value}</span>
                        {row.note && (
                          <span className="text-ink-3 mt-0.5 block text-xs">
                            {row.note}
                          </span>
                        )}
                      </dd>
                    </motion.div>
                  );
                })}
              </dl>
            </div>
          ))}
          <p className="text-ink-3 px-6 py-3 text-center font-mono text-[10px] tracking-[0.14em] uppercase sm:px-8">
            {plateLine}
          </p>
        </div>
      </div>
    </section>
  );
}
