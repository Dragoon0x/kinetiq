"use client";

import { FlagWave } from "@/registry/ui/flag-wave";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B1", vessel: "Windlass", eta: "05:40", state: "cleared" },
  { berth: "B5", vessel: "Halyard", eta: "06:15", state: "holding" },
  { berth: "B3", vessel: "Foretop", eta: "07:05", state: "inbound" },
] as const;

/** A harbour signal board pinned to its own mast and left to the wind. The
 * ripple never stops rolling through it; hold a hand near the fabric and
 * the fold beside it calms while the rest keeps flying. */
export function FlagWaveDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FlagWave className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · the signal board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three berths, run up the mast.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The morning line, posted where the whole quay can read it. The
              board is pinned at the hoist and left to the wind, the same way a
              signal flag flies over the harbour master&apos;s office.
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
            <PressureButton variant="solid">Run up the board</PressureButton>
            <PressureButton variant="outline">Hold berth 5</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:40 · fresh breeze
            </span>
          </div>
        </div>
      </FlagWave>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        flying
      </p>
    </div>
  );
}
