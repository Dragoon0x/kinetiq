"use client";

import * as React from "react";

import { SliceCompare } from "@/registry/ui/slice-compare";

/** A deterministic panel scene — raw vs corrected signal. */
function Scene({ corrected }: { corrected: boolean }) {
  const bars = [34, 58, 42, 71, 49, 63, 38, 55];
  return (
    <div
      className="flex h-full flex-col justify-between p-4"
      style={{
        background: corrected
          ? "linear-gradient(140deg, oklch(0.24 0.03 258), oklch(0.17 0.02 258))"
          : "linear-gradient(140deg, oklch(0.20 0.01 80), oklch(0.14 0.01 80))",
      }}
    >
      <p className="font-mono text-[10px] tracking-wide text-white/60">
        {corrected ? "PASS 2 · CORRECTED" : "PASS 1 · RAW"}
      </p>
      <div className="flex items-end gap-1.5">
        {bars.map((h, i) => (
          <span
            key={`${corrected ? "c" : "r"}-${bars.length - i}`}
            className="w-3 rounded-t-sm"
            style={{
              height: corrected ? h : Math.round(h * 0.6 + (i % 3) * 9),
              background: corrected
                ? "oklch(0.72 0.15 258 / 0.9)"
                : "oklch(0.65 0.05 80 / 0.7)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SliceCompareDemo() {
  const [position, setPosition] = React.useState(50);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">SIGNAL SPLIT · A/B</p>
          <p className="text-label text-ink-3">KQ-067</p>
        </div>

        <SliceCompare
          before={<Scene corrected={false} />}
          after={<Scene corrected />}
          beforeLabel="RAW"
          afterLabel="CORRECTED"
          height={210}
          aria-label="Raw versus corrected split"
          onPositionChange={setPosition}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          BLADE ·{" "}
          <span className="text-cobalt-bright">
            {String(position).padStart(3, "0")}%
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag the blade - it leans into the cut and swings back plumb.
        </p>
      </div>
    </div>
  );
}
