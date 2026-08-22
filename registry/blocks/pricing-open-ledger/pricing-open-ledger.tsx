"use client";

import * as React from "react";

import { Checkbox } from "@/registry/ui/checkbox";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type LedgerLine = {
  id: string;
  label: string;
  detail: string;
  /** Dollars per month. */
  price: number;
  /** Base lines are always on and render without a control. */
  base?: boolean;
  defaultOn?: boolean;
};

export type PricingOpenLedgerProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  lines?: LedgerLine[];
  cta?: string;
  onCta?: (activeLineIds: string[], total: number) => void;
  className?: string;
};

const DEFAULT_LINES: LedgerLine[] = [
  {
    id: "core",
    label: "Basin core",
    detail: "The ledger, intake, and rulings — the whole record.",
    price: 29,
    base: true,
  },
  {
    id: "sensors",
    label: "Sensor feeds",
    detail: "Live instrument intake, deduplicated at the weir.",
    price: 12,
    defaultOn: true,
  },
  {
    id: "lineage",
    label: "Export lineage",
    detail: "Every export carries its citations and revisions.",
    price: 8,
    defaultOn: true,
  },
  {
    id: "retention",
    label: "Decade retention",
    detail: "Ten-year hold on every reading and ruling.",
    price: 6,
  },
  {
    id: "desk",
    label: "Named support desk",
    detail: "A person who knows your basin, four-hour response.",
    price: 15,
  },
];

/**
 * A price you can audit: the bill as an open ledger, one line per thing, each
 * optional line with a real drawn-tick control. Toggle a line and the total
 * carry-rolls to its new sum — arithmetic performed in front of you, which is
 * the entire argument. No bundle names, no "contact us" veil.
 */
export function PricingOpenLedger({
  eyebrow = "Basinworks · pricing",
  headline = "The bill, line by line.",
  copy = "Start from the core and add exactly what your basin needs. Every line has a number; the total is just their sum.",
  lines = DEFAULT_LINES,
  cta = "Open the ledger",
  onCta,
  className,
}: PricingOpenLedgerProps) {
  const headingId = React.useId();
  const [on, setOn] = React.useState<Set<string>>(
    () =>
      new Set(
        lines.filter((l) => l.base || l.defaultOn).map((l) => l.id),
      ),
  );

  const total = lines
    .filter((l) => l.base || on.has(l.id))
    .reduce((sum, l) => sum + l.price, 0);

  const toggle = (id: string, next: boolean) => {
    setOn((prev) => {
      const set = new Set(prev);
      if (next) set.add(id);
      else set.delete(id);
      return set;
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div className="max-w-lg">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>

            <div className="border-hairline bg-surface-1 rounded-3 mt-8 inline-flex items-baseline gap-2 border px-5 py-4">
              <span className="text-ink-3 text-lg">$</span>
              <Readout value={total} size="lg" />
              <span className="text-ink-3 text-sm">/ month</span>
            </div>
            <div className="mt-6">
              <PressureButton
                size="lg"
                onClick={() => onCta?.([...on], total)}
              >
                {cta}
              </PressureButton>
            </div>
          </div>

          <ul className="border-hairline bg-surface-1 rounded-4 divide-hairline flex flex-col divide-y border">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  {line.base ? (
                    <div>
                      <p className="text-ink text-sm font-medium">
                        {line.label}
                        <span className="text-label text-ink-3 ml-2">
                          ALWAYS ON
                        </span>
                      </p>
                      <p className="text-ink-3 mt-0.5 text-sm">{line.detail}</p>
                    </div>
                  ) : (
                    <Checkbox
                      label={line.label}
                      description={line.detail}
                      checked={on.has(line.id)}
                      onCheckedChange={(next) => toggle(line.id, next)}
                    />
                  )}
                </div>
                <span className="text-ink shrink-0 font-mono text-sm">
                  ${line.price}
                  <span className="text-ink-3">/mo</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
