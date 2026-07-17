"use client";

import * as React from "react";

import { RevealStagger } from "@/registry/ui/reveal-stagger";

const ROWS = [
  { label: "Bore", value: "4.6 mm" },
  { label: "Rate", value: "48 kHz" },
  { label: "Pass", value: "2 of 2" },
  { label: "Tolerance", value: "held" },
];

export function RevealStaggerDemo() {
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RevealStagger key={run} className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="border-hairline bg-surface-1 flex items-center justify-between rounded-2 border px-3 py-2 text-sm"
          >
            <span className="text-ink-2">{row.label}</span>
            <span className="font-mono font-medium">{row.value}</span>
          </div>
        ))}
      </RevealStagger>

      <button
        type="button"
        onClick={() => setRun((value) => value + 1)}
        className="border-input hover:bg-accent self-start rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        Replay
      </button>
    </div>
  );
}
