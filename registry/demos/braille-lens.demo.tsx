"use client";

import { BrailleLens } from "@/registry/ui/braille-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { locker: "L-04", temp: "-18.4 °C", state: "steady" },
  { locker: "L-09", temp: "-9.8 °C", state: "drifting" },
  { locker: "L-15", temp: "2.6 °C", state: "breach" },
] as const;

/** A locker ledger for the lens to read. Move the cursor across the sheet and the numbers rise in braille, cell by cell, wherever there is ink underneath. */
export function BrailleLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <BrailleLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · locker ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Twelve lockers, one cold room.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The night readings, in the order the morning walk needs them. Run
              the lens across the table and every character embosses in place —
              nothing under the glass moves.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Locker</th>
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
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "steady"
                          ? "success"
                          : row.state === "drifting"
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
            <PressureButton variant="outline">Flag locker 15</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              KQ-400 · bay C
            </span>
          </div>
        </div>
      </BrailleLens>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        raised, cell by cell
      </p>
    </div>
  );
}
