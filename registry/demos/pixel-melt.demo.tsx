"use client";

import { PixelMelt } from "@/registry/ui/pixel-melt";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { locker: "L-11", item: "Whey block, 40kg", temp: "-18.2", state: "stable" },
  { locker: "L-24", item: "Cultured cream", temp: "-6.4", state: "holding" },
  { locker: "L-06", item: "Starter batch 7", temp: "2.1", state: "critical" },
] as const;

/** A cold-storage ledger for the melt to read. Rest the cursor anywhere on the board and the pixels under it pour downward in ink-dark drips, refreezing shut once you move on. */
export function PixelMeltDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PixelMelt className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · the locker ledger
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The board holds until you rest on it.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The floor crew checks this before a batch leaves the vault. Every
              reading is the same one the sensor posts, and the seal is the same
              one the locker shows on its own door.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Locker</th>
                <th className="py-2 pr-4 text-label text-ink-3">Contents</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.locker} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.locker}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.item}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "stable"
                          ? "success"
                          : row.state === "holding"
                            ? "warn"
                            : "danger"
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
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag locker 06</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              04:40 · vault open
            </span>
          </div>
        </div>
      </PixelMelt>
      <p className="text-center font-mono text-[11px] text-ink-3">
        it drips where you rest
      </p>
    </div>
  );
}
