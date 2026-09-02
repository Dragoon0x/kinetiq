"use client";

import { LensFlare } from "@/registry/ui/lens-flare";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B6", vessel: "Cormorant", eta: "22:40", state: "cleared" },
  { berth: "B1", vessel: "Salt Fen", eta: "23:05", state: "holding" },
  { berth: "B9", vessel: "Nightjar", eta: "23:50", state: "inbound" },
] as const;

/** A harbour board on a dark bench, pinned to the same dark colour in
 * either theme so the type stays bright enough to flare. Sweep the cursor
 * across it and the board's own bright type throws an anamorphic streak
 * and a chain of ghosts back toward the pointer — nothing under the glow
 * moves or repaints, it is the same real table and the same real buttons. */
export function LensFlareDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LensFlare className="w-full max-w-2xl rounded-4 border border-white/10 bg-[#0f172a]">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-[#e5e7eb]/60">
              Waylight · the night board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#e5e7eb] sm:text-3xl">
              Three berths, running after dark.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#e5e7eb]/80">
              The lamps on this board are real pixels, not a texture painted on
              top — move the cursor near the type and the brightest of it throws
              its own flare back toward the glass.
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
            <PressureButton variant="solid">Light berth 6</PressureButton>
            <PressureButton
              variant="outline"
              className="border-white/20 text-[#e5e7eb] hover:bg-white/10"
            >
              Hold berth 1
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-[#e5e7eb]/60">
              22:40 · low tide
            </span>
          </div>
        </div>
      </LensFlare>
      <p className="text-center font-mono text-[11px] text-ink-3">
        light leaks
      </p>
    </div>
  );
}
