"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ResidencyRow = {
  id: string;
  /** What the data is. */
  kind: string;
  /** Where it lives at rest. */
  where: string;
  /** How long it is kept. */
  kept: string;
  /** Who outside the company can see it, or "Nobody". */
  seenBy: string;
};

export type Subprocessor = {
  id: string;
  name: string;
  purpose: string;
  region: string;
};

export type TrustDataResidencyProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  rows?: ResidencyRow[];
  subprocessors?: Subprocessor[];
  subprocessorTitle?: string;
  /** The commitment about changes to this list. */
  noticeLine?: string;
  className?: string;
};

const DEFAULT_ROWS: ResidencyRow[] = [
  {
    id: "r1",
    kind: "Boards and plans",
    where: "Frankfurt (eu-central)",
    kept: "Indefinitely, yours to delete",
    seenBy: "Nobody",
  },
  {
    id: "r2",
    kind: "Crew names and shifts",
    where: "Frankfurt (eu-central)",
    kept: "24 months after a yard closes",
    seenBy: "Nobody",
  },
  {
    id: "r3",
    kind: "Support attachments",
    where: "Frankfurt (eu-central)",
    kept: "90 days",
    seenBy: "Support, on your ticket",
  },
  {
    id: "r4",
    kind: "Billing records",
    where: "Ireland (eu-west)",
    kept: "7 years, by law",
    seenBy: "Payment processor",
  },
  {
    id: "r5",
    kind: "Error traces",
    where: "Frankfurt (eu-central)",
    kept: "30 days",
    seenBy: "On-call engineer",
  },
];

const DEFAULT_SUBPROCESSORS: Subprocessor[] = [
  {
    id: "s1",
    name: "Managed Postgres",
    purpose: "Primary store",
    region: "EU",
  },
  {
    id: "s2",
    name: "Object storage",
    purpose: "Exports and attachments",
    region: "EU",
  },
  {
    id: "s3",
    name: "Payment processor",
    purpose: "Billing only",
    region: "EU / US",
  },
  {
    id: "s4",
    name: "Email delivery",
    purpose: "Transactional mail",
    region: "EU",
  },
];

/**
 * The question a serious buyer asks third: where does our data actually sit,
 * how long do you keep it, and who outside your company can see it. Answered
 * as a table with a row per kind of data — including the two rows most pages
 * omit, billing and error traces — and the full subprocessor list underneath.
 * Where the vault brief states controls and the incident log states failures,
 * this states location.
 */
export function TrustDataResidency({
  eyebrow = "Waylight · where it sits",
  headline = "Your data, by kind and by country.",
  copy = "One row per thing we hold. If a row says nobody, it means nobody — including us, without a ticket you opened.",
  rows = DEFAULT_ROWS,
  subprocessors = DEFAULT_SUBPROCESSORS,
  subprocessorTitle = "Everyone we hand data to",
  noticeLine = "Thirty days' notice before anything joins this list, by email, whether or not it affects you.",
  className,
}: TrustDataResidencyProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
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
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-10 rounded-4 border border-hairline">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-hairline px-5 py-3 text-label text-ink-3 sm:grid">
            <span>Data</span>
            <span>Where it rests</span>
            <span>Kept for</span>
            <span>Seen by</span>
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
                className="grid gap-x-4 gap-y-2 border-b border-hairline px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <p className="min-w-0 font-medium text-ink">{row.kind}</p>
                <p className="min-w-0 text-sm text-ink-2">
                  <span className="text-ink-3 sm:hidden">Rests in · </span>
                  {row.where}
                </p>
                <p className="min-w-0 text-sm text-ink-2">
                  <span className="text-ink-3 sm:hidden">Kept · </span>
                  {row.kept}
                </p>
                <p className="min-w-0 text-sm">
                  <span className="text-ink-3 sm:hidden">Seen by · </span>
                  <span
                    className={cn(
                      row.seenBy.toLowerCase() === "nobody"
                        ? "text-[var(--success,var(--primary))]"
                        : "text-ink-2",
                    )}
                  >
                    {row.seenBy}
                  </span>
                </p>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {subprocessorTitle}
          </h3>
          <ul className="mt-4 flex flex-wrap gap-2">
            {subprocessors.map((sub) => (
              <li
                key={sub.id}
                className="min-w-0 rounded-2 border border-hairline px-3 py-2"
              >
                <p className="text-sm font-medium text-ink">{sub.name}</p>
                <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  {sub.purpose} · {sub.region}
                </p>
              </li>
            ))}
          </ul>
          {/* Prose, not a seal: seals do not wrap, and this is a sentence. */}
          {noticeLine && (
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-3">
              {noticeLine}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
