"use client";

import { BloomHalo } from "@/registry/ui/bloom-halo";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B5", vessel: "Lanternfish", eta: "21:15", state: "cleared" },
  { berth: "B3", vessel: "Wick & Tallow", eta: "21:50", state: "holding" },
  { berth: "B8", vessel: "Riding Light", eta: "22:30", state: "inbound" },
] as const;

/** A harbour board on a dark card. Move the cursor across it and the
 * board's own brightest tones — the heading, the seals, the solid button —
 * gather a soft bloom that swells wherever the pointer rests; nothing under
 * the glow moves, it is the same real table and the same real controls. */
export function BloomHaloDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <BloomHalo className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-2">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · the lamp board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Five berths, and the lamps are catching.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing on this board is retouched — the brightest type and the
              clearest seals just carry a little more light than the rest, and
              more still wherever the cursor happens to be resting.
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
          <div className="flex flex-wrap items-center gap-6">
            <Readout value={5} format={(v) => `${v} lit`} size="sm" />
            <Readout value={94} format={(v) => `${v}% clear`} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Light berth 5</PressureButton>
            <PressureButton variant="outline">Hold berth 3</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              21:15 · calm water
            </span>
          </div>
        </div>
      </BloomHalo>
      <p className="text-center font-mono text-[11px] text-ink-3">
        lit from within
      </p>
    </div>
  );
}
