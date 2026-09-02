"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RainLedge } from "@/registry/ui/rain-ledge";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B4", vessel: "Marram", state: "cleared" },
  { berth: "B2", vessel: "Kestrel", state: "holding" },
  { berth: "B7", vessel: "Saltmarsh", state: "inbound" },
] as const;

/** The Waylight harbour board under a squall. Rain falls the full height of
 * the panel wherever it's open air, and lands on the heading, the table
 * header, and the buttons wherever it isn't — the board itself is real and
 * never redrawn, only rained on. */
export function RainLedgeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <RainLedge className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              A squall over three berths.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing on the board moves for the weather — the rain does the
              moving, landing flat on the heading and the table rail and running
              past everywhere there is nothing to catch it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Rainfall</p>
              <Readout
                size="lg"
                value={6.2}
                format={(v) => `${v.toFixed(1)}mm`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Wind</p>
              <Readout size="lg" value={19} format={(v) => `${v}kt`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Berths clear</p>
              <Readout size="lg" value={1} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Berth</th>
                <th className="py-2 pr-4 text-label text-ink-3">Vessel</th>
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
              06:10 · squall passing
            </span>
          </div>
        </div>
      </RainLedge>
      <p className="text-center font-mono text-[11px] text-ink-3">
        it hits what is there
      </p>
    </div>
  );
}
