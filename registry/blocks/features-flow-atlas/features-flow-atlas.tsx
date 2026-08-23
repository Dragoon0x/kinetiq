"use client";

import * as React from "react";

import { FlowDiagram, type FlowLink, type FlowNode } from "@/registry/ui/flow-diagram";
import { cn } from "@/registry/lib/utils";

export type AtlasCallout = {
  id: string;
  title: string;
  copy: string;
};

export type FeaturesFlowAtlasProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  nodes?: FlowNode[];
  links?: FlowLink[];
  diagramLabel?: string;
  callouts?: AtlasCallout[];
  className?: string;
};

const DEFAULT_NODES: FlowNode[] = [
  { id: "sensors", label: "Sensors", column: 0 },
  { id: "crews", label: "Crew reports", column: 0 },
  { id: "lab", label: "Lab assays", column: 0 },
  { id: "weir", label: "The weir", column: 1 },
  { id: "ledger", label: "Ledger", column: 2 },
  { id: "rulings", label: "Rulings", column: 2 },
  { id: "reports", label: "Reports", column: 3 },
  { id: "exports", label: "Exports", column: 3 },
];

const DEFAULT_LINKS: FlowLink[] = [
  { source: "sensors", target: "weir", value: 55 },
  { source: "crews", target: "weir", value: 25 },
  { source: "lab", target: "weir", value: 12 },
  { source: "weir", target: "ledger", value: 78 },
  { source: "weir", target: "rulings", value: 14 },
  { source: "rulings", target: "ledger", value: 14 },
  { source: "ledger", target: "reports", value: 58 },
  { source: "ledger", target: "exports", value: 34 },
];

const DEFAULT_CALLOUTS: AtlasCallout[] = [
  {
    id: "weir",
    title: "One weir, every source",
    copy: "Everything crosses the same intake, so duplicates die at the gate and provenance survives it.",
  },
  {
    id: "rulings",
    title: "Conflicts take the side channel",
    copy: "Disagreeing readings divert through rulings — signed, dated, and merged back with both readings kept.",
  },
  {
    id: "exports",
    title: "Nothing leaves without lineage",
    copy: "Reports and exports draw from the ledger alone, so every number can point back to its row.",
  },
];

/**
 * The system as an atlas: the library's own flow instrument draws where the
 * volume actually goes — links weighted, columns honest — and three callouts
 * below explain the junctions worth understanding. One diagram that moves
 * like the product beats four paragraphs that describe it.
 */
export function FeaturesFlowAtlas({
  eyebrow = "Basinworks · the shape of it",
  headline = "Where a reading goes when you stop watching it.",
  copy = "Every source, one intake, one ledger — and the two junctions that keep the record honest.",
  nodes = DEFAULT_NODES,
  links = DEFAULT_LINKS,
  diagramLabel = "Data flow from sources to exports",
  callouts = DEFAULT_CALLOUTS,
  className,
}: FeaturesFlowAtlasProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
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

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border p-4 shadow-raised sm:p-6">
          <FlowDiagram
            nodes={nodes}
            links={links}
            height={300}
            aria-label={diagramLabel}
          />
        </div>

        <dl className="mt-8 grid gap-6 sm:grid-cols-3">
          {callouts.map((callout, index) => (
            <div key={callout.id}>
              <dt className="text-ink flex items-baseline gap-2 font-medium">
                <span aria-hidden className="text-ink-3 font-mono text-[10px]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {callout.title}
              </dt>
              <dd className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                {callout.copy}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
