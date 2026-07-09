"use client";

import { RadialBars, type RadialBar } from "@/registry/ui/radial-bars";

/** Fixed telemetry — throughput per node, in requests/second. No randomness. */
const NODES: RadialBar[] = [
  { label: "edge-01", value: 1240 },
  { label: "api-gw", value: 1520 },
  { label: "auth", value: 720 },
  { label: "cache", value: 1880 },
  { label: "queue", value: 540 },
  { label: "search", value: 1060 },
  { label: "ledger", value: 1330 },
  { label: "media", value: 890 },
];

const format = (value: number) => `${value.toLocaleString("en-US")} rps`;

export function RadialBarsDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <span className="text-label text-ink-2">Throughput · req/s</span>

      <RadialBars
        data={NODES}
        size={240}
        format={format}
        aria-label="Throughput by node, requests per second"
      />

      <p className="text-ink-3 text-center font-mono text-xs">
        Hover or focus a wedge — the hub reads its node.
      </p>
    </div>
  );
}
