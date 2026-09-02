"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { ReededGlass } from "@/registry/ui/reeded-glass";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { locker: "R-02", contents: "Whole cuts", temp: "-18.4", state: "sealed" },
  { locker: "R-08", contents: "Dairy stock", temp: "-3.9", state: "thawing" },
  { locker: "R-15", contents: "Vaccine trays", temp: "-21.6", state: "sealed" },
  { locker: "R-21", contents: "Produce crates", temp: "1.2", state: "breach" },
] as const;

/** A cold-storage locker ledger behind a run of fluted glass. Sweep the cursor across it and the ribs' phase slides sideways to follow. */
export function ReededGlassDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ReededGlass className="w-full max-w-2xl overflow-hidden rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · locker ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four lockers, one overnight read.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The night watch logs every locker before the day shift opens the
              floor. The numbers behind the glass are real; the ribs only bend
              how you see them, and settle the moment you stop moving.
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
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "sealed"
                          ? "success"
                          : row.state === "thawing"
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
            <PressureButton variant="outline">Flag locker 21</PressureButton>
          </div>
        </div>
      </ReededGlass>
      <p className="font-mono text-[11px] text-ink-3">fluted</p>
    </div>
  );
}
