"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LedgerStrength = 0 | 1 | 2 | 3;

export type ContactRecord = {
  id: string;
  name: string;
  /** Where they are, shown after the name. */
  place?: string;
  tags: string[];
  /** Pre-formatted relative date — the grid never reads a clock. */
  lastTouch: string;
  /** 0 none · 1 weak · 2 fair · 3 strong. */
  strength: LedgerStrength;
  link?: string;
};

export type ContactLedgerProps = {
  records?: ContactRecord[];
  /** Tags shown per row before the overflow count. @default 2 */
  maxTags?: number;
  className?: string;
};

const STRENGTH_LABEL: Record<LedgerStrength, string> = {
  0: "No contact",
  1: "Weak",
  2: "Fair",
  3: "Strong",
};

const DEFAULT_RECORDS: ContactRecord[] = [
  {
    id: "c1",
    name: "Alder Quay",
    place: "Rotterdam",
    tags: ["Wholesale", "Gear"],
    lastTouch: "4 days ago",
    strength: 3,
    link: "alder-quay.example.com",
  },
  {
    id: "c2",
    name: "Amber Point",
    place: "Prague",
    tags: ["Catering"],
    lastTouch: "over a year ago",
    strength: 0,
  },
  {
    id: "c3",
    name: "Basin Works",
    place: "Tallinn",
    tags: ["Rigging", "Seasonal", "Local"],
    lastTouch: "5 weeks ago",
    strength: 1,
    link: "basin-works.example.com",
  },
  {
    id: "c4",
    name: "Boreal Supply",
    place: "Yellowknife",
    tags: ["Gear", "Local"],
    lastTouch: "8 days ago",
    strength: 3,
    link: "boreal-supply.example.com",
  },
  {
    id: "c5",
    name: "Cape Fitting Co.",
    place: "Cape Town",
    tags: ["Imports"],
    lastTouch: "11 months ago",
    strength: 1,
    link: "cape-fitting.example.com",
  },
  {
    id: "c6",
    name: "Cedar Slip",
    place: "Beirut",
    tags: ["Local", "Seasonal"],
    lastTouch: "6 days ago",
    strength: 3,
    link: "cedar-slip.example.com",
  },
  {
    id: "c7",
    name: "Delta Yard Services",
    place: "New Orleans",
    tags: ["Wholesale", "Rigging"],
    lastTouch: "2 days ago",
    strength: 3,
    link: "delta-yard.example.com",
  },
  {
    id: "c8",
    name: "Dune Chandlery",
    place: "Muscat",
    tags: ["Imports", "Catering"],
    lastTouch: "8 months ago",
    strength: 1,
  },
];

function StrengthMeter({ strength }: { strength: LedgerStrength }) {
  return (
    <span
      role="img"
      aria-label={`Connection: ${STRENGTH_LABEL[strength]}`}
      className="inline-flex items-center gap-1.5"
    >
      <span aria-hidden className="flex items-end gap-px">
        {[1, 2, 3].map((level) => (
          <span
            key={level}
            className={cn(
              "w-1 rounded-[1px]",
              level === 1 ? "h-1.5" : level === 2 ? "h-2.5" : "h-3.5",
              level <= strength
                ? strength === 3
                  ? "bg-[var(--success,var(--primary))]"
                  : "bg-ink-2"
                : "bg-surface-2",
            )}
          />
        ))}
      </span>
      <span className="text-[11px] text-ink-3">{STRENGTH_LABEL[strength]}</span>
    </span>
  );
}

/**
 * A relationship grid that reads like a book: records grouped under
 * alphabetical rails, each row carrying its tags, a pre-formatted last-touch
 * date, and a three-bar strength meter labelled in words. The footer
 * aggregates — the count, the average strength, the linked share — are
 * derived from the rows on render, so the summary cannot quietly disagree
 * with the book it sums. For working ten thousand rows, the ledger is the
 * instrument; this one is for reading a hundred relationships honestly.
 *
 * Reduced motion: groups print in place.
 */
export function ContactLedger({
  records = DEFAULT_RECORDS,
  maxTags = 2,
  className,
}: ContactLedgerProps) {
  const motionSafe = useMotionSafe();

  const groups = React.useMemo(() => {
    const map = new Map<string, ContactRecord[]>();
    for (const record of [...records].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const letter = record.name.slice(0, 1).toUpperCase();
      const bucket = map.get(letter);
      if (bucket) bucket.push(record);
      else map.set(letter, [record]);
    }
    return [...map.entries()];
  }, [records]);

  const step = cascade(groups.length);

  // Footer truths, derived — never authored beside the rows.
  const linked = records.filter((r) => r.link).length;
  const avgStrength =
    records.length === 0
      ? 0
      : Math.round(
          (records.reduce((sum, r) => sum + r.strength, 0) /
            (records.length * 3)) *
            100,
        );

  return (
    <div className={cn("w-full max-w-md", className)}>
      <div className="overflow-hidden rounded-3 border border-hairline">
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-hairline px-3 py-2 text-label text-ink-3">
          <span>Company</span>
          <span>Last touch</span>
          <span>Connection</span>
        </div>

        {groups.map(([letter, members], groupIndex) => (
          <motion.section
            key={letter}
            aria-label={`Companies starting with ${letter}`}
            initial={{ opacity: motionSafe ? 0 : 1 }}
            animate={{ opacity: 1 }}
            transition={
              motionSafe
                ? {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: groupIndex * step,
                  }
                : { duration: 0 }
            }
          >
            <p
              aria-hidden
              className="border-b border-hairline bg-surface-1 px-3 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-3"
            >
              {letter}
            </p>
            <ul>
              {members.map((record) => {
                const tags = record.tags.slice(0, maxTags);
                const overflow = record.tags.length - tags.length;
                return (
                  <li
                    key={record.id}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-hairline px-3 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 pr-2">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">
                          {record.name}
                        </span>
                        {record.place && (
                          <span className="shrink-0 text-[11px] text-ink-3">
                            {record.place}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-hairline px-1.5 py-px text-[10px] text-ink-3"
                          >
                            {tag}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="text-[10px] text-ink-3">
                            +{overflow}
                          </span>
                        )}
                        {record.link && (
                          <span className="truncate font-mono text-[10px] text-ink-3">
                            {record.link}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="min-w-0 truncate pr-2 text-xs text-ink-2">
                      {record.lastTouch}
                    </span>
                    <StrengthMeter strength={record.strength} />
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))}

        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] bg-surface-1 px-3 py-2 font-mono text-[11px] text-ink-3">
          <span className="flex items-baseline gap-1">
            <Readout value={records.length} size="sm" />
            <span>records</span>
          </span>
          <span className="flex items-baseline gap-1">
            <Readout value={linked} size="sm" />
            <span>linked</span>
          </span>
          <span className="flex items-baseline gap-1">
            <Readout value={avgStrength} size="sm" />
            <span>% avg strength</span>
          </span>
        </div>
      </div>
    </div>
  );
}
