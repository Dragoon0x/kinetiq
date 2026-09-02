"use client";

import { HeatBrand } from "@/registry/ui/heat-brand";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { locker: "L04", contents: "Cod fillets", temp: "-18.2°C", state: "stable" },
  { locker: "L07", contents: "Herb butter", temp: "-6.4°C", state: "drifting" },
  { locker: "L11", contents: "Bone stock", temp: "-19.6°C", state: "stable" },
  {
    locker: "L02",
    contents: "Ice cream base",
    temp: "-9.7°C",
    state: "breached",
  },
] as const;

/** A real ledger — headings, prose, a table, controls — under the brand. Press and hold anywhere on the card and the paper scorches under the pointer. */
export function HeatBrandDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <HeatBrand className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · overnight rounds
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The lockers that carried the night.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Rounds still get walked and logged by hand before the day shift
              takes over. Press anywhere on the ledger and hold — the paper
              knows exactly where you rested your thumb.
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
              {LOCKERS.map((row) => (
                <tr key={row.locker} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.locker}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.contents}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "stable"
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
            <PressureButton variant="outline">Flag locker 07</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              04:40 · row 2 of 3
            </span>
          </div>
        </div>
      </HeatBrand>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        hold, and it scorches
      </p>
    </div>
  );
}
