"use client";

import { Copperplate } from "@/registry/ui/copperplate";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { id: "C-04", ward: "Serum bank", temp: "-4.2", state: "holding" },
  { id: "C-11", ward: "Plasma reserve", temp: "-18.6", state: "cleared" },
  { id: "C-19", ward: "Vaccine lot 88", temp: "-22.1", state: "watch" },
  { id: "C-27", ward: "Culture stock", temp: "-6.8", state: "cleared" },
] as const;

/** A cold-storage ledger run off as a copper engraving. Every row is
 * real ink-on-paper hatching, not a filter over a screenshot — rest the
 * cursor anywhere on the plate and a raking sheen springs to meet it. */
export function CopperplateDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Copperplate className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · locker ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four wards, struck in copper.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The round book, engraved rather than printed: every reading
              hatched from its own tone, cross-hatched wherever a locker runs
              coldest. Move the cursor across the plate to catch the light.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Locker</th>
                <th className="py-2 pr-4 text-label text-ink-3">Ward</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {LOCKERS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.ward}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
                          ? "success"
                          : row.state === "watch"
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
            <PressureButton variant="solid">Strike the round</PressureButton>
            <PressureButton variant="outline">Flag locker C-19</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              04:52 · round 3
            </span>
          </div>
        </div>
      </Copperplate>
      <p className="font-mono text-xs text-ink-3">engraved</p>
    </div>
  );
}
