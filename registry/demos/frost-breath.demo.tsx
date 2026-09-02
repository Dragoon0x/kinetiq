"use client";

import { FrostBreath } from "@/registry/ui/frost-breath";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BAYS = [
  { id: "B-03", ward: "Cured stock", temp: "-18.4", state: "steady" },
  { id: "B-08", ward: "Dairy reserve", temp: "-6.2", state: "watch" },
  { id: "B-15", ward: "Seed bank", temp: "-24.8", state: "steady" },
  { id: "B-21", ward: "Vaccine lot 12", temp: "-22.1", state: "breach" },
] as const;

/** A cold-storage board under a sheet of glass. Rest the cursor over it and
 * a patch of breath blooms right where it lingers, clearing again over a
 * few seconds once you move on or sweep past too quickly to leave a mark. */
export function FrostBreathDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FrostBreath className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · the cold-storage board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four bays, and the glass keeps fogging.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing here is staged. Hold the cursor still over a bay and a
              cloud of breath spreads across the glass above it; sweep past too
              fast and the glass never has time to catch it.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Bay</th>
                <th className="py-2 pr-4 text-label text-ink-3">Ward</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {BAYS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.ward}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "steady"
                          ? "success"
                          : row.state === "watch"
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
          <div className="flex flex-wrap items-center gap-6">
            <Readout value={-18} format={(v) => `${v}° average`} size="sm" />
            <Readout value={97} format={(v) => `${v}% sealed`} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Seal the round</PressureButton>
            <PressureButton variant="outline">Flag bay B-21</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:40 · round 2
            </span>
          </div>
        </div>
      </FrostBreath>
      <p className="text-center font-mono text-[11px] text-ink-3">
        cold enough to see your breath
      </p>
    </div>
  );
}
