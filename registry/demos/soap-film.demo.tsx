"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { SoapFilm } from "@/registry/ui/soap-film";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  { gate: "G1", head: "3.2 m", state: "open" },
  { gate: "G2", head: "2.8 m", state: "holding" },
  { gate: "G3", head: "4.1 m", state: "closed" },
] as const;

/** A reservoir board under a soap film — the whole page tints with real
 * thin-film colour, and the cursor thins the film locally as it crosses.
 * Move the pointer over the board to see the local dip; leave it still and
 * the field keeps flowing on its own. */
export function SoapFilmDemo() {
  return (
    <div className="flex w-full justify-center">
      <SoapFilm className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · the reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, one steady head.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The morning read on the basin, under a film thin enough to shimmer
              with whatever light finds it. Move the cursor across the board and
              watch the film thin out ahead of it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Elevation</p>
              <Readout
                size="lg"
                value={402.6}
                format={(v) => `${v.toFixed(1)} m`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout size="lg" value={18} format={(v) => `${v} m3/s`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Storage</p>
              <Readout
                size="lg"
                value={88.2}
                format={(v) => `${v.toFixed(1)}%`}
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
            <PressureButton variant="solid">Open gate 3</PressureButton>
            <PressureButton variant="outline">Hold the spillway</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              thin as a film
            </span>
          </div>
        </div>
      </SoapFilm>
    </div>
  );
}
