"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RainGlass } from "@/registry/ui/rain-glass";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "FL-03", place: "Coombe Ridge", state: "reporting" },
  { id: "FL-11", place: "Marsh Gate", state: "delayed" },
  { id: "FL-19", place: "High Weir", state: "offline" },
] as const;

/** A weather station board behind a rained-on window. Droplets bead and run
 * down the pane while the readings keep ticking underneath; wipe a hand
 * across the glass and the board clears for a moment before it fogs back
 * over. */
export function RainGlassDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <RainGlass className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · station 03</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Rain on the pane, readings behind it.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The window between the desk and the mast. The glass beads and runs
              on its own clock while the station keeps recording underneath —
              wipe the pane to read the numbers plainly for a moment.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Rainfall</p>
              <Readout
                size="lg"
                value={18.4}
                format={(v) => `${v.toFixed(1)}mm`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Wind</p>
              <Readout size="lg" value={22} format={(v) => `${v}kt`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Pressure</p>
              <Readout size="lg" value={998} format={(v) => `${v}hPa`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Site</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.place}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "reporting"
                          ? "success"
                          : row.state === "delayed"
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
            <PressureButton variant="solid">Sync the mast</PressureButton>
            <PressureButton variant="outline">Hold station 11</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:52 · squall inbound
            </span>
          </div>
        </div>
      </RainGlass>
      <p className="text-center font-mono text-[11px] text-ink-3">
        wipe the pane
      </p>
    </div>
  );
}
