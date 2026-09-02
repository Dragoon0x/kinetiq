"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { DitherLens, type DitherPattern } from "@/registry/ui/dither-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const PATTERNS: readonly DitherPattern[] = [
  "bayer",
  "halftone",
  "hatch",
  "dash",
];

const READINGS = [
  { channel: "Torque", value: "184.2 Nm", tolerance: "± 0.5 Nm" },
  { channel: "Bearing temp", value: "41.6 °C", tolerance: "± 2.0 °C" },
  { channel: "Vibration", value: "0.032 g", tolerance: "± 0.01 g" },
] as const;

/** A calibration certificate for the lens to scan. Sweep the cursor across
 * it to watch each reading resolve to ink and paper, click to send a
 * degauss ring through the field, and switch the pattern above the stage. */
export function DitherLensDemo() {
  const [pattern, setPattern] = React.useState<DitherPattern>("bayer");

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {PATTERNS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === pattern}
            onClick={() => setPattern(option)}
            className={cn(
              "rounded-1 border px-2.5 py-1 text-label transition-colors",
              option === pattern
                ? "border-ink-3 bg-surface-2 text-ink"
                : "border-hairline text-ink-3 hover:text-ink-2",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <DitherLens
        pattern={pattern}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · calibration certificate
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Rig 14 cleared to spec.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Sweep the lens across the sheet and every reading resolves to ink
              and paper; click anywhere and the field degausses in one ring.
            </p>
          </div>
          <div className="flex items-baseline gap-3 rounded-2 border border-hairline bg-surface-0 px-4 py-3">
            <span className="text-label text-ink-3">Live reading</span>
            <Readout
              value={184.2}
              format={(v) => `${v.toFixed(1)} Nm`}
              size="lg"
            />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Channel</th>
                <th className="py-2 pr-4 text-label text-ink-3">Value</th>
                <th className="py-2 text-label text-ink-3">Tolerance</th>
              </tr>
            </thead>
            <tbody>
              {READINGS.map((row) => (
                <tr key={row.channel} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.channel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.value}
                  </td>
                  <td className="py-2 font-mono text-xs text-ink-2">
                    {row.tolerance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Stamp certificate</PressureButton>
            <PressureButton variant="outline">Flag for recheck</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              Rig 14 · bay 3
            </span>
          </div>
        </div>
      </DitherLens>
    </div>
  );
}
