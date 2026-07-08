"use client";

import { useState } from "react";

import { motion } from "motion/react";

import { springs, type SpringName } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const CALIBRATIONS: {
  name: SpringName;
  zeta: string;
  settles: string;
  role: string;
}[] = [
  { name: "flick", zeta: "0.99", settles: "120ms", role: "confirms" },
  { name: "snap", zeta: "0.83", settles: "300ms", role: "switches" },
  { name: "glide", zeta: "0.98", settles: "450ms", role: "moves" },
  { name: "drift", zeta: "1.00", settles: "800ms", role: "breathes" },
  { name: "recoil", zeta: "0.53", settles: "700ms", role: "celebrates" },
];

/**
 * The five calibrations as living chips: hover or focus one and a puck runs
 * its spring across the chip's track, so each personality is felt, not read.
 */
export function CalibrationStrip() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CALIBRATIONS.map((calibration) => (
        <li key={calibration.name}>
          <CalibrationChip {...calibration} />
        </li>
      ))}
    </ul>
  );
}

function CalibrationChip({
  name,
  zeta,
  settles,
  role,
}: (typeof CALIBRATIONS)[number]) {
  const [run, setRun] = useState(0);

  return (
    <button
      type="button"
      onPointerEnter={() => setRun((r) => r + 1)}
      onClick={() => setRun((r) => r + 1)}
      className={cn(
        "group border-hairline bg-surface-1 hover:border-hairline-strong block w-full rounded-3 border p-4 text-left transition-colors",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold">{name}</span>
        <span className="text-label text-ink-3">ζ {zeta}</span>
      </div>
      <div className="bg-surface-2 relative mt-3 h-1 overflow-visible rounded-full">
        <motion.span
          key={run}
          aria-hidden
          className="bg-cobalt-bright absolute top-1/2 left-0 size-2.5 -translate-y-1/2 rounded-full"
          initial={{ left: "0%" }}
          animate={{ left: run > 0 ? "calc(100% - 10px)" : "0%" }}
          transition={springs[name]}
        />
      </div>
      <p className="text-ink-3 mt-3 text-xs">
        {role} · settles ~{settles}
      </p>
    </button>
  );
}
