"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TypeRain } from "@/registry/ui/type-rain";

const ZONES = [
  { zone: "Z1", bed: "North rows", litres: "1,240 L", state: "flowing" },
  { zone: "Z2", bed: "Terrace beds", litres: "410 L", state: "metering" },
  { zone: "Z3", bed: "Nursery frames", litres: "0 L", state: "closed" },
  { zone: "Z4", bed: "East hedge", litres: "0 L", state: "leak" },
] as const;

/** The Fernworks irrigation log, held dim under falling glyph streams. Move
 * the cursor across it and the rain parts, letting the real log show
 * through wherever it passes. */
export function TypeRainDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <TypeRain className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · irrigation log</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four zones, one head end.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every valve the head end opened before sunrise, logged zone by
              zone against the schedule. Run the rain across the log and the
              numbers light as it falls.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Zone</th>
                <th className="py-2 pr-4 text-label text-ink-3">Bed</th>
                <th className="py-2 pr-4 text-label text-ink-3">Litres</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map((row) => (
                <tr key={row.zone} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.zone}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.bed}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.litres}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "flowing"
                          ? "success"
                          : row.state === "metering"
                            ? "warn"
                            : row.state === "leak"
                              ? "danger"
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
            <PressureButton variant="solid">Open the valves</PressureButton>
            <PressureButton variant="outline">Hold zone 4</PressureButton>
          </div>
        </div>
      </TypeRain>
      <p className="font-mono text-[11px] text-ink-3">lit by the rain</p>
    </div>
  );
}
