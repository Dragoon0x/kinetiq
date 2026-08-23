"use client";

import * as React from "react";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RollupRow = {
  id: string;
  label: string;
  detail: string;
  hours: number;
  cost: number;
};

export type RollupGroup = {
  id: string;
  name: string;
  rows: RollupRow[];
};

export type DatatableGroupedRollupProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  groups?: RollupGroup[];
  currency?: string;
  /** Groups open by default; the rest start folded. */
  defaultOpen?: string[];
  className?: string;
};

const DEFAULT_GROUPS: RollupGroup[] = [
  {
    id: "g1",
    name: "North basin",
    rows: [
      {
        id: "r1",
        label: "Crew A",
        detail: "Bulk, day shift",
        hours: 312,
        cost: 9360,
      },
      {
        id: "r2",
        label: "Crew B",
        detail: "Bulk, back shift",
        hours: 288,
        cost: 9216,
      },
      {
        id: "r3",
        label: "Crane relief",
        detail: "Shared with kettle point",
        hours: 96,
        cost: 3840,
      },
    ],
  },
  {
    id: "g2",
    name: "Kettle point",
    rows: [
      {
        id: "r4",
        label: "Crew C",
        detail: "Tide-bound, day shift",
        hours: 240,
        cost: 7200,
      },
      {
        id: "r5",
        label: "Crane relief",
        detail: "Shared with north basin",
        hours: 96,
        cost: 3840,
      },
    ],
  },
  {
    id: "g3",
    name: "Dry dock 2",
    rows: [
      {
        id: "r6",
        label: "Project crew",
        detail: "By exception only",
        hours: 104,
        cost: 4160,
      },
    ],
  },
];

/**
 * A grid that adds up: rows grouped by site, every group carrying its own
 * subtotal, and a grand total that is the sum of what is shown rather than a
 * number typed in beside it. Folding a group keeps its subtotal visible,
 * because the reason to fold is to compare groups — hiding the number you
 * folded down to would defeat the fold.
 */
export function DatatableGroupedRollup({
  eyebrow = "Waylight · signed hours, March",
  headline = "Every crew, every yard, adding up.",
  copy = "Fold a yard to compare it against the others. Subtotals stay visible when folded, and the grand total is the sum of the rows — not a figure entered beside them.",
  groups = DEFAULT_GROUPS,
  currency = "$",
  defaultOpen,
  className,
}: DatatableGroupedRollupProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [open, setOpen] = React.useState<string[]>(
    defaultOpen ?? groups.map((group) => group.id),
  );

  const subtotal = (group: RollupGroup) =>
    group.rows.reduce(
      (acc, row) => ({
        hours: acc.hours + row.hours,
        cost: acc.cost + row.cost,
      }),
      { hours: 0, cost: 0 },
    );

  const grand = groups.reduce(
    (acc, group) => {
      const sub = subtotal(group);
      return { hours: acc.hours + sub.hours, cost: acc.cost + sub.cost };
    },
    { hours: 0, cost: 0 },
  );

  const toggle = (id: string) =>
    setOpen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

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

        <div className="mt-10 rounded-4 border border-hairline">
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem] gap-4 border-b border-hairline px-5 py-3 text-label text-ink-3 sm:grid">
            <span>Crew</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Cost</span>
          </div>

          {groups.map((group) => {
            const sub = subtotal(group);
            const isOpen = open.includes(group.id);
            return (
              <div
                key={group.id}
                className="border-b border-hairline last:border-b-0"
              >
                <h3>
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[minmax(0,1fr)_5rem_7rem] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-1"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 text-ink-3 transition-transform",
                          isOpen && "rotate-90",
                        )}
                        style={{ transitionDuration: `${durations.fast}s` }}
                      />
                      <span className="truncate font-medium text-ink">
                        {group.name}
                      </span>
                    </span>
                    {/* Subtotals survive the fold — folding is for comparing. */}
                    <span className="text-right font-mono text-sm text-ink-2">
                      {sub.hours}
                    </span>
                    <span className="text-right font-mono text-sm text-ink-2">
                      {currency}
                      {sub.cost.toLocaleString("en-US")}
                    </span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: motionSafe ? 0 : "auto", opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{
                        height: motionSafe ? 0 : "auto",
                        opacity: 0,
                        transition: exitFor(
                          motionSafe ? durations.base : durations.fast,
                        ),
                      }}
                      transition={
                        motionSafe
                          ? { duration: durations.base, ease: easings.enter }
                          : { duration: 0 }
                      }
                      className="overflow-hidden"
                    >
                      <ul className="pb-1">
                        {group.rows.map((row) => (
                          <li
                            key={row.id}
                            className="grid grid-cols-[minmax(0,1fr)_5rem_7rem] items-baseline gap-4 px-5 py-2.5 pl-11"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-ink">
                                {row.label}
                              </span>
                              <span className="block truncate text-xs text-ink-3">
                                {row.detail}
                              </span>
                            </span>
                            <span className="text-right font-mono text-sm text-ink-3">
                              {row.hours}
                            </span>
                            <span className="text-right font-mono text-sm text-ink-3">
                              {currency}
                              {row.cost.toLocaleString("en-US")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_5rem_7rem] items-baseline gap-4 border-t border-hairline pt-5">
          <span className="min-w-0 font-medium text-ink">All yards</span>
          <span className="flex justify-end">
            <Readout value={grand.hours} />
          </span>
          <span className="flex items-baseline justify-end gap-0.5">
            <span className="text-ink-3">{currency}</span>
            <Readout value={grand.cost} />
          </span>
        </div>
      </div>
    </section>
  );
}
