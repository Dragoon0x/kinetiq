"use client";

import { FlowDiagram, type FlowLink, type FlowNode } from "@/registry/ui/flow-diagram";

// A request-traffic Sankey: clients enter through two edges, fan across the
// API and cache gateways, hit the auth / catalog / orders services, and settle
// into the primary DB, the read replica, or the object store. Round values,
// fully deterministic — column sums balance so nothing overflows the stage.
const NODES: FlowNode[] = [
  { id: "web", label: "Web", column: 0 },
  { id: "mobile", label: "Mobile", column: 0 },

  { id: "edge", label: "Edge API", column: 1 },
  { id: "cache", label: "Cache", column: 1 },

  { id: "auth", label: "Auth", column: 2 },
  { id: "catalog", label: "Catalog", column: 2 },
  { id: "orders", label: "Orders", column: 2 },

  { id: "primary", label: "Primary DB", column: 3 },
  { id: "replica", label: "Replica", column: 3 },
  { id: "blob", label: "Object Store", column: 3 },
];

const LINKS: FlowLink[] = [
  // clients → gateways
  { source: "web", target: "edge", value: 60 },
  { source: "web", target: "cache", value: 30 },
  { source: "mobile", target: "edge", value: 40 },
  { source: "mobile", target: "cache", value: 20 },

  // gateways → services
  { source: "edge", target: "auth", value: 40 },
  { source: "edge", target: "catalog", value: 35 },
  { source: "edge", target: "orders", value: 25 },
  { source: "cache", target: "catalog", value: 50 },

  // services → sinks
  { source: "auth", target: "primary", value: 40 },
  { source: "catalog", target: "replica", value: 60 },
  { source: "catalog", target: "blob", value: 25 },
  { source: "orders", target: "primary", value: 25 },
];

export function FlowDiagramDemo() {
  return (
    <figure className="flex w-full max-w-xl flex-col gap-3">
      <figcaption className="text-label text-ink-3">
        FLOW · THROUGHPUT
      </figcaption>
      <div className="bg-surface-1 border-hairline rounded-3 border p-4">
        <FlowDiagram
          nodes={NODES}
          links={LINKS}
          height={300}
          aria-label="Request traffic from clients through gateways and services to storage"
        />
      </div>
      <p className="text-ink-3 text-xs">Hover a node to trace its path.</p>
    </figure>
  );
}
