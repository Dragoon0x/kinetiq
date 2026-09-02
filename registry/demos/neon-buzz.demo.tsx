"use client";

import { NeonBuzz } from "@/registry/ui/neon-buzz";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B3", vessel: "Wayfarer", eta: "21:15", state: "cleared" },
  { berth: "B8", vessel: "Herring Gull", eta: "21:50", state: "holding" },
  { berth: "B5", vessel: "Night Tide", eta: "22:30", state: "inbound" },
] as const;

/** A harbour board on a dark bench, pinned to the same dark colour in
 * either theme so the type reads as ink worth lighting. Every dark letter
 * and rule on this board becomes a lit tube, on its own clock — nothing
 * here is a decorative overlay, and nothing waits on the cursor. */
export function NeonBuzzDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <NeonBuzz className="w-full max-w-2xl rounded-4 border border-white/10 bg-[#0f172a]">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-[#e5e7eb]/60">
              Waylight · the night board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#e5e7eb] sm:text-3xl">
              Three berths, lit for the night shift.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#e5e7eb]/80">
              Every dark line on this board is real ink, traced out as a lit
              tube — the letters, the rules, the seals. A stretch of the sign
              goes dark and buzzes back on its own, the way a real tube would.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">
                  Berth
                </th>
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">
                  Vessel
                </th>
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">ETA</th>
                <th className="py-2 text-label text-[#e5e7eb]/60">State</th>
              </tr>
            </thead>
            <tbody>
              {BERTHS.map((row) => (
                <tr key={row.berth} className="border-b border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs text-[#e5e7eb]/80">
                    {row.berth}
                  </td>
                  <td className="py-2 pr-4 font-medium text-[#e5e7eb]">
                    {row.vessel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#e5e7eb]/80">
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
            <PressureButton variant="solid">Light berth 3</PressureButton>
            <PressureButton
              variant="outline"
              className="border-white/20 text-[#e5e7eb] hover:bg-white/10"
            >
              Hold berth 8
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-[#e5e7eb]/60">
              21:15 · rising tide
            </span>
          </div>
        </div>
      </NeonBuzz>
      <p className="text-center font-mono text-[11px] text-ink-3">as tubes</p>
    </div>
  );
}
