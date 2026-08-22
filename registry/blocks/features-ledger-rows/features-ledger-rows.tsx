"use client";

import * as React from "react";

import { CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/**
 * One side of a row, carrying its own entrance. The order and alignment
 * classes must sit on the grid item itself, so each side is its own motion
 * element rather than a child of a shared stagger wrapper.
 */
function RowSide({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  const motionSafe = useMotionSafe();
  return (
    <motion.div
      initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? distances.shift : 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={
        motionSafe
          ? { duration: durations.base, ease: easings.enter, delay }
          : { duration: 0 }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

export type LedgerFeature = {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  points: string[];
  /** The row's visual. Defaults to a framed placeholder panel. */
  visual?: React.ReactNode;
};

export type FeaturesLedgerRowsProps = {
  eyebrow?: string;
  headline?: string;
  features?: LedgerFeature[];
  className?: string;
};

function VisualPanel({ lines }: { lines: [string, string, string] }) {
  return (
    <div className="border-hairline bg-surface-1 rounded-4 w-full border p-5 shadow-raised">
      <div className="border-hairline flex items-center gap-1.5 border-b pb-3">
        <i aria-hidden className="bg-hairline-strong block size-2 rounded-full" />
        <i aria-hidden className="bg-hairline-strong block size-2 rounded-full" />
      </div>
      <dl className="mt-4 flex flex-col gap-3">
        {lines.map((line) => {
          const [term, detail] = line.split("::");
          return (
            <div
              key={line}
              className="border-hairline bg-surface-0 rounded-2 flex items-center justify-between gap-3 border px-3 py-2.5"
            >
              <dt className="text-ink text-sm font-medium">{term}</dt>
              <dd className="text-ink-3 font-mono text-[11px] tracking-[0.06em] uppercase">
                {detail}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

const DEFAULT_FEATURES: LedgerFeature[] = [
  {
    id: "collect",
    kicker: "COLLECT",
    title: "Every signal, one intake",
    copy: "Field reports, sensor feeds, and manual notes land in a single intake with the same shape — provenance attached, nothing loose in inboxes.",
    points: ["Structured on arrival", "Source and time attached", "Nothing edits history"],
    visual: (
      <VisualPanel
        lines={[
          "North weir sensor::live",
          "Crew report — G. Ide::09:14",
          "Lab assay #88::attached",
        ]}
      />
    ),
  },
  {
    id: "resolve",
    kicker: "RESOLVE",
    title: "Disagreements surface themselves",
    copy: "When two sources disagree, the ledger shows both readings side by side and holds the row open until someone rules — silently averaging is how bad data becomes policy.",
    points: ["Conflicts held open", "Rulings signed", "Both readings kept"],
    visual: (
      <VisualPanel
        lines={[
          "Flow rate — sensor::4.2 m³/s",
          "Flow rate — crew::3.8 m³/s",
          "Status::awaiting ruling",
        ]}
      />
    ),
  },
  {
    id: "publish",
    kicker: "PUBLISH",
    title: "One record, quotable anywhere",
    copy: "Reports cite ledger rows, not screenshots. When a ruling revises a reading, every citation shows the revision — the paper trail keeps itself.",
    points: ["Rows are citable", "Revisions propagate", "Exports carry lineage"],
    visual: (
      <VisualPanel
        lines={[
          "Q3 basin report::cites 214",
          "Revision r2::propagated",
          "Export::with lineage",
        ]}
      />
    ),
  },
];

/**
 * Feature rows that alternate like a well-set ledger: copy on one side, a
 * framed visual on the other, sides swapping each row so the page reads in a
 * weave rather than a column. Each row's copy stack and visual arrive on the
 * cascade as the row enters the viewport; the visuals are typographic panels
 * in the library's own chrome, so they read as product, not illustration.
 */
export function FeaturesLedgerRows({
  eyebrow = "Basinworks · field data",
  headline = "From loose readings to a record you can rule on.",
  features = DEFAULT_FEATURES,
  className,
}: FeaturesLedgerRowsProps) {
  const headingId = React.useId();

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
        </div>

        <div className="mt-14 flex flex-col gap-16 lg:gap-20">
          {features.map((feature, index) => (
            <div
              key={feature.id}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              <RowSide
                delay={0}
                className={cn(
                  "max-w-lg",
                  index % 2 === 1 && "lg:order-2 lg:justify-self-end",
                )}
              >
                <p className="text-label text-ink-3">{feature.kicker}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-ink-2 mt-3 leading-relaxed">{feature.copy}</p>
                <ul className="mt-5 flex flex-col gap-2">
                  {feature.points.map((point) => (
                    <li key={point} className="text-ink-2 flex items-center gap-2.5 text-sm">
                      <CheckCircle2
                        className="text-[var(--success,var(--primary))] size-4 shrink-0"
                        aria-hidden
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </RowSide>
              <RowSide
                delay={0.08}
                className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}
              >
                {feature.visual}
              </RowSide>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
