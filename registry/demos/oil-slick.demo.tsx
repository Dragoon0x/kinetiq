"use client";

import { OilSlick } from "@/registry/ui/oil-slick";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  { gate: "G1", head: "3.6 m", state: "open" },
  { gate: "G2", head: "2.4 m", state: "holding" },
  { gate: "G3", head: "4.4 m", state: "closed" },
] as const;

/** A reservoir board under an oil slick — the whole page tints with real
 * thin-film colour that turns on its own clock, no pointer involved. Watch
 * the surface for a few seconds and the sheen visibly rolls across the
 * board. */
export function OilSlickDemo() {
  return (
    <div className="flex w-full justify-center">
      <OilSlick className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · the reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              A thin sheen across the whole basin.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing was spilled — the surface just catches the light the way
              still water does after a slow morning. The colour never sits
              still; it keeps folding over itself long after you stop watching.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Elevation</p>
              <Readout
                size="lg"
                value={398.1}
                format={(v) => `${v.toFixed(1)} m`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout size="lg" value={22} format={(v) => `${v} m3/s`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Turbidity</p>
              <Readout
                size="lg"
                value={1.8}
                format={(v) => `${v.toFixed(1)} NTU`}
              />
            </div>
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
                <tr key={row.gate} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.gate}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.head}</td>
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
            <PressureButton variant="solid">Open gate 2</PressureButton>
            <PressureButton variant="outline">Hold the spillway</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              slowly turning
            </span>
          </div>
        </div>
      </OilSlick>
    </div>
  );
}
