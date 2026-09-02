"use client";

import { MarbleVein } from "@/registry/ui/marble-vein";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { id: "L-03", ward: "Reserve cru 08", temp: "12.4", state: "held" },
  { id: "L-08", ward: "Estate press 21", temp: "9.8", state: "cleared" },
  { id: "L-15", ward: "Late harvest 14", temp: "6.1", state: "watch" },
  { id: "L-22", ward: "Barrel trial 06", temp: "14.2", state: "flagged" },
] as const;

/** A cellar ledger fronted in a single slab of quarried marble. Sweep the
 * cursor across the stone and a broad sheen follows it, catching the grain
 * and a faint reflection of the ledger underneath. */
export function MarbleVeinDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <MarbleVein className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · locker ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four lockers, one slab of stone.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The vault face is a single quarried slab, cut once and never
              matched. Every reading below is set into the same marble the door
              is made of, carried by the same veins.
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
                          : row.state === "held"
                            ? "info"
                            : row.state === "watch"
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
            <PressureButton variant="solid">Seal the round</PressureButton>
            <PressureButton variant="outline">Flag locker L-22</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              12:04 · round 2
            </span>
          </div>
        </div>
      </MarbleVein>
      <p className="text-center font-mono text-[11px] text-ink-3">
        polished, veined
      </p>
    </div>
  );
}
