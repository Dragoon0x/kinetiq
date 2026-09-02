"use client";

import { OceanSwell } from "@/registry/ui/ocean-swell";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const READOUTS = [
  {
    key: "level",
    label: "Reservoir level",
    value: 61.4,
    format: (v: number) => `${v.toFixed(1)} m`,
  },
  {
    key: "outflow",
    label: "Outflow",
    value: 128,
    format: (v: number) => `${v.toFixed(0)} ML/d`,
  },
  {
    key: "freeboard",
    label: "Freeboard",
    value: 2.3,
    format: (v: number) => `${v.toFixed(1)} m`,
  },
] as const;

const GATES = [
  { key: "S1", gate: "Spillway 1", head: "1.8 m", state: "open" },
  { key: "S2", gate: "Spillway 2", head: "0.6 m", state: "holding" },
  { key: "SC", gate: "Scour valve", head: "0.0 m", state: "closed" },
] as const;

/** A reservoir board that rides its own gentle swell. The readings and the gate table are real; only the board under them rolls. */
export function OceanSwellDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <OceanSwell className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Basinworks · gate house 3</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One board, rolling with the reservoir.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The gate house floats on pontoons, so the whole board rises and
              settles with the swell the wind puts across the water. Nothing
              under the numbers moves on its own; only the surface they sit on
              is alive.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {READOUTS.map((r) => (
              <div
                key={r.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="text-label text-ink-3">{r.label}</p>
                <Readout
                  value={r.value}
                  format={r.format}
                  size="sm"
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Head</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((row) => (
                <tr key={row.key} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">{row.gate}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.head}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "open"
                          ? "success"
                          : row.state === "holding"
                            ? "warn"
                            : "info"
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
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">
              Notify the gate crew
            </PressureButton>
          </div>
        </div>
      </OceanSwell>
      <p className="font-mono text-[11px] text-ink-3">gently, on the water</p>
    </div>
  );
}
