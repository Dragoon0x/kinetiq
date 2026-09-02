"use client";

import { BlueprintLens } from "@/registry/ui/blueprint-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { berth: "B1", vessel: "Fathom", eta: "05:40", state: "cleared" },
  { berth: "B5", vessel: "Gannet", eta: "06:15", state: "inbound" },
  { berth: "B3", vessel: "Wherry", eta: "06:50", state: "holding" },
] as const;

/** A real board — heading, prose, a table, controls — traced by the lens. Move the cursor across it and the glass turns the surface into a cyanotype of itself. */
export function BlueprintLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <BlueprintLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · berth plan</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three berths, drafted for the day crew.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run the loupe over the plan and the surface reads back as a
              blueprint — every heading and rule traced in paper on blue, the
              table underneath still the real one.
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
            <PressureButton variant="solid">Post the plan</PressureButton>
            <PressureButton variant="outline">Hold berth 3</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:40 · tide 3.1 m
            </span>
          </div>
        </div>
      </BlueprintLens>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        drafted, not printed
      </p>
    </div>
  );
}
