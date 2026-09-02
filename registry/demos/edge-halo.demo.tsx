"use client";

import { EdgeHalo } from "@/registry/ui/edge-halo";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B1", vessel: "Halcyon", eta: "05:40", state: "cleared" },
  { berth: "B3", vessel: "Tern Light", eta: "06:15", state: "inbound" },
  { berth: "B5", vessel: "Grey Petrel", eta: "06:50", state: "holding" },
] as const;

/** A harbour board — a heading, prose, a berth table, two controls — for the
 * halo to trace. Move the cursor across a row, the heading, or a button and
 * its edges catch a soft, breathing light. */
export function EdgeHaloDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <EdgeHalo className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Whatever the watch is reading, lit at the edges.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing under the glass moves — the halo only finds the thing
              under the cursor and traces it, off the same texture the rest of
              the board is painted from.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Berth</th>
                <th className="py-2 pr-4 text-label text-ink-3">Vessel</th>
                <th className="py-2 pr-4 text-label text-ink-3">ETA</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {BERTHS.map((row) => (
                <tr key={row.berth} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.berth}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.vessel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.eta}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
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
            <PressureButton variant="solid">Post the board</PressureButton>
            <PressureButton variant="outline">Ring the watch</PressureButton>
          </div>
        </div>
      </EdgeHalo>
      <p className="text-center font-mono text-xs text-ink-3">
        outlined in light
      </p>
    </div>
  );
}
