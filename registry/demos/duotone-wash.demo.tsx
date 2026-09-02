"use client";

import { DuotoneWash } from "@/registry/ui/duotone-wash";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  { gate: "G1", basin: "North basin", level: 68, state: "open" },
  { gate: "G2", basin: "Mill race", level: 41, state: "throttled" },
  { gate: "G3", basin: "Overflow", level: 12, state: "closed" },
] as const;

const percent = (v: number): string => `${v}%`;

/** A reservoir board printed in two colours — the wash stands in for the
 * whole page, its gradient turning as the cursor sweeps past. */
export function DuotoneWashDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <DuotoneWash className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · the reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, one falling head.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Storage is down since the thaw. Sweep the cursor across the board
              — the wash tilts with it, the same two colours reading every level
              underneath without hiding one of them.
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <Readout value={68} format={percent} size="lg" />
            <Readout value={41} format={percent} size="lg" />
            <Readout value={12} format={percent} size="lg" />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Basin</th>
                <th className="py-2 pr-4 text-label text-ink-3">Level</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((row) => (
                <tr key={row.gate} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.gate}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.basin}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.level}%
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "open"
                          ? "success"
                          : row.state === "throttled"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Open gate 1</PressureButton>
            <PressureButton variant="outline">Log the reading</PressureButton>
          </div>
        </div>
      </DuotoneWash>
      <p className="font-mono text-[11px] text-ink-3">two colours, one angle</p>
    </div>
  );
}
