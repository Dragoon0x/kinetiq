"use client";

import { CrystalLens } from "@/registry/ui/crystal-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { berth: "B4", vessel: "Marram", eta: "06:10", state: "cleared" },
  { berth: "B2", vessel: "Kestrel", eta: "06:45", state: "holding" },
  { berth: "B7", vessel: "Saltmarsh", eta: "07:20", state: "inbound" },
] as const;

/** A real board — headings, prose, a table, controls — for the lens to read. Move the cursor across it; hover a heading or a button and the lens zooms on it. */
export function CrystalLensDemo() {
  return (
    <div className="flex w-full justify-center">
      <CrystalLens
        targets="h2, button, th"
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Waylight · the morning board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three berths, one clean handover.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Everything the night crew settled, in the order the day crew will
              need it. Run the lens over the table — the rows are real, and the
              glass bends them without moving a single one.
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
              {ROWS.map((row) => (
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
            <PressureButton variant="outline">Hold berth 2</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:10 · tide 3.4 m
            </span>
          </div>
        </div>
      </CrystalLens>
    </div>
  );
}
