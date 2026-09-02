"use client";

import { FoilStamp } from "@/registry/ui/foil-stamp";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { berth: "B4", vessel: "Marram", eta: "06:10", state: "cleared" },
  { berth: "B2", vessel: "Kestrel", eta: "06:45", state: "holding" },
  { berth: "B7", vessel: "Saltmarsh", eta: "07:20", state: "inbound" },
] as const;

/** A harbour manifest stamped in gold. Move the cursor across the board and
 * the light drags across every dark line of ink, catching the seal, the
 * headings, and the printed rows as it goes. */
export function FoilStampDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FoilStamp className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour master</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              This morning&apos;s manifest, stamped.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every berth the night watch signed off, pressed into foil the way
              the old ledgers were. Nothing under the ink moved — only the light
              did.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2 border border-hairline bg-surface-2 px-4 py-3">
            <span className="text-label text-ink-3">Berths cleared</span>
            <Readout value={1} size="sm" />
            <span className="font-mono text-xs text-ink-3">of 3</span>
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
            <PressureButton variant="solid">Stamp the manifest</PressureButton>
            <PressureButton variant="outline">Hold berth 2</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:10 · tide 3.4 m
            </span>
          </div>
        </div>
      </FoilStamp>
      <p className="font-mono text-xs text-ink-3">stamped in foil</p>
    </div>
  );
}
