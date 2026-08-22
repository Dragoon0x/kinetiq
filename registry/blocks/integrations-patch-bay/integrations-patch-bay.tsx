"use client";

import * as React from "react";

import { MasonryFlow } from "@/registry/ui/masonry-flow";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type PatchTool = {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  state: "connected" | "available";
};

export type IntegrationsPatchBayProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  tools?: PatchTool[];
  className?: string;
};

const DEFAULT_TOOLS: PatchTool[] = [
  { id: "ledgerpost", name: "Ledgerpost", kind: "Accounting", blurb: "Run costs land as journal lines, tagged by bench.", state: "connected" },
  { id: "signalhut", name: "Signalhut", kind: "Messaging", blurb: "Rulings and gate changes post to the crew channel.", state: "connected" },
  { id: "cratefall", name: "Cratefall", kind: "Storage", blurb: "Exports archive with lineage, retrievable by row.", state: "available" },
  { id: "planeview", name: "Planeview", kind: "Calendar", blurb: "Slots mirror into the yard calendar both ways.", state: "connected" },
  { id: "wireledger", name: "Wireledger", kind: "Payments", blurb: "Supplier invoices reconcile against received rows.", state: "available" },
  { id: "northdesk", name: "Northdesk", kind: "Support", blurb: "Tickets cite bench rows instead of screenshots.", state: "available" },
  { id: "gaugeworks", name: "Gaugeworks", kind: "Sensors", blurb: "Instrument feeds arrive deduplicated at the weir.", state: "connected" },
  { id: "papertrail", name: "Papertrail", kind: "Compliance", blurb: "Audit pulls read the ledger directly, read-only.", state: "available" },
];

/**
 * Integrations as a patch bay: every tool is a jack, filtered by kind with
 * plain chips, and the wall reflows on the masonry instrument — surviving
 * tiles glide to their new sockets rather than reprinting. Connected jacks
 * carry a live seal; available ones state plainly what plugging them in
 * would mean.
 */
export function IntegrationsPatchBay({
  eyebrow = "Fieldline · integrations",
  headline = "Patch it into the tools already running.",
  copy = "Every integration is a jack with one clear job. Filter by kind; the wall re-racks itself.",
  tools = DEFAULT_TOOLS,
  className,
}: IntegrationsPatchBayProps) {
  const headingId = React.useId();
  const kinds = ["All", ...Array.from(new Set(tools.map((t) => t.kind)))];
  const [kind, setKind] = React.useState("All");

  const visible = kind === "All" ? tools : tools.filter((t) => t.kind === kind);

  const items = visible.map((tool) => ({
    id: tool.id,
    node: (
      <div className="border-hairline bg-surface-1 rounded-4 border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-ink font-medium">{tool.name}</p>
            <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
              {tool.kind}
            </p>
          </div>
          <StatusSeal
            variant={tool.state === "connected" ? "success" : "info"}
            live={tool.state === "connected"}
            className="shrink-0 text-[10px]"
          >
            {tool.state}
          </StatusSeal>
        </div>
        <p className="text-ink-2 mt-3 text-sm leading-relaxed">{tool.blurb}</p>
      </div>
    ),
  }));

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

        <div
          role="group"
          aria-label="Filter by kind"
          className="mt-8 flex flex-wrap gap-2"
        >
          {kinds.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={option === kind}
              className={cn(
                "rounded-2 border px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors",
                option === kind
                  ? "border-hairline-strong bg-surface-1 text-ink"
                  : "border-hairline text-ink-3 hover:text-ink-2",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <MasonryFlow items={items} minColumnWidth="240px" />
        </div>

        <p role="status" className="text-label text-ink-3 mt-6">
          {visible.length} OF {tools.length} JACKS
        </p>
      </div>
    </section>
  );
}
