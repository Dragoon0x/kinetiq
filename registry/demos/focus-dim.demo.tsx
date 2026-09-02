"use client";

import { FocusDim } from "@/registry/ui/focus-dim";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B4", vessel: "Marram", eta: "06:10", state: "cleared" },
  { berth: "B2", vessel: "Kestrel", eta: "06:45", state: "holding" },
  { berth: "B7", vessel: "Saltmarsh", eta: "07:20", state: "inbound" },
] as const;

/** A real harbour board. Rest the cursor on a row or a button and the rest
 * of the board steps back, blurred and dimmed, while that one thing holds
 * still and sharp under the glass. */
export function FocusDimDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FocusDim className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
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
              need it. Hold the pointer on a row and everything else falls quiet
              behind it.
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
          <div className="flex items-center gap-6">
            <div>
              <p className="text-label text-ink-3">Tide</p>
              <Readout
                value={3.4}
                format={(v) => `${v.toFixed(1)} m`}
                size="sm"
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Berths clear</p>
              <Readout value={1} size="sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Post the board</PressureButton>
            <PressureButton variant="outline">Hold berth 2</PressureButton>
          </div>
        </div>
      </FocusDim>
      <p className="font-mono text-[11px] text-ink-3">a step back</p>
    </div>
  );
}
