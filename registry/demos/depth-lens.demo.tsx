"use client";

import * as React from "react";

import { DepthLens } from "@/registry/ui/depth-lens";

/** Deterministic chip positions shared by both layers so they register. */
const CHIPS = [
  { left: "12%", top: "24%", w: 64 },
  { left: "46%", top: "18%", w: 88 },
  { left: "70%", top: "52%", w: 56 },
  { left: "22%", top: "62%", w: 76 },
  { left: "54%", top: "70%", w: 64 },
];

function Enclosure() {
  return (
    <div className="bg-surface-1 relative h-full w-full">
      {CHIPS.map((c) => (
        <div
          key={c.left + c.top}
          className="border-hairline bg-surface-2 absolute rounded-1 border"
          style={{ left: c.left, top: c.top, width: c.w, height: 26 }}
        />
      ))}
      <p className="text-ink-3 absolute right-3 bottom-2 font-mono text-[9px]">
        PANEL SEALED
      </p>
    </div>
  );
}

function Circuitry() {
  return (
    <div
      className="relative h-full w-full"
      style={{ background: "oklch(0.16 0.03 258)" }}
    >
      {CHIPS.map((c, i) => (
        <div
          key={c.left + c.top}
          className="absolute rounded-1"
          style={{
            left: c.left,
            top: c.top,
            width: c.w,
            height: 26,
            background: `oklch(0.42 0.12 ${(i * 137.5 + 220) % 360} / 0.65)`,
            boxShadow: "inset 0 0 0 1px oklch(0.7 0.12 258 / 0.5)",
          }}
        />
      ))}
      {/* traces */}
      <div className="absolute inset-x-6 top-1/2 h-px bg-[oklch(0.62_0.14_258/0.6)]" />
      <div className="absolute inset-y-4 left-1/3 w-px bg-[oklch(0.62_0.14_258/0.4)]" />
      <p className="absolute right-3 bottom-2 font-mono text-[9px] text-[oklch(0.72_0.14_258)]">
        TRACE LAYER
      </p>
    </div>
  );
}

export function DepthLensDemo() {
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
          <p className="text-label text-ink-3">INSPECTION LENS · X-RAY</p>
          <p className="text-label text-ink-3">KQ-068</p>
        </div>

        <DepthLens
          surface={<Enclosure />}
          beneath={<Circuitry />}
          radius={60}
          height={220}
          surfaceLabel="ENCLOSURE"
          beneathLabel="TRACES"
          aria-label="Inspection lens over the enclosure"
        />

        <p className="text-ink-3 mt-3 text-center text-xs">
          Sweep the lens - arrows steer it from the keyboard.
        </p>
      </div>
    </div>
  );
}
