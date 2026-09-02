"use client";

import { LiftShadow } from "@/registry/ui/lift-shadow";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B2", vessel: "Wayfarer", eta: "05:55", state: "cleared" },
  { berth: "B4", vessel: "Long Reach", eta: "06:30", state: "holding" },
  { berth: "B6", vessel: "Solent Star", eta: "07:05", state: "inbound" },
] as const;

/** A harbour board — a heading, prose, a berth table, a readout row, two
 * controls — where whatever sits under the cursor rises off the board, a
 * shadow gathering beneath it, while the rest of the page stays flat. */
export function LiftShadowDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LiftShadow className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every berth answers to a touch.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Rest the cursor on a row, a reading, or a button and it lifts
              clear of the board, a soft shadow gathering underneath, while
              everything else stays flat on the page.
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
          <div
            data-lift
            className="flex items-center gap-6 rounded-3 border border-hairline bg-surface-2 px-4 py-3"
          >
            <div>
              <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                Berths held
              </p>
              <Readout value={2} size="sm" className="mt-1" />
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                Avg wait
              </p>
              <Readout
                value={14}
                format={(v) => `${v}m`}
                size="sm"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Post the board</PressureButton>
            <PressureButton variant="outline">Hold berth 4</PressureButton>
          </div>
        </div>
      </LiftShadow>
      <p className="font-mono text-[11px] text-ink-3">it rises to meet you</p>
    </div>
  );
}
