"use client";

import { LanternSway } from "@/registry/ui/lantern-sway";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { id: "C-2", contents: "Culture trays", temp: "-24.1", state: "cleared" },
  { id: "C-6", contents: "Serum batch 9", temp: "-18.0", state: "watch" },
  { id: "C-9", contents: "Tissue block", temp: "-79.8", state: "cleared" },
] as const;

/** One lantern on a hook lights the locker room after hours. Watch the
 * table long enough and its own shadow drifts with the swing. */
export function LanternSwayDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LanternSway className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · the locker ledger
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Logged under one hanging lamp.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The locker room runs one lantern on a hook after hours, and it
              never holds still — the draft off the compressors keeps it
              swinging, so every entry in the ledger throws a shadow that slides
              back and forth with it.
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
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.contents}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={row.state === "cleared" ? "success" : "warn"}
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
            <PressureButton variant="outline">Flag locker C-6</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              23:40 · night shift
            </span>
          </div>
        </div>
      </LanternSway>
      <p className="text-center font-mono text-xs text-ink-3">
        the shadows move with the lamp
      </p>
    </div>
  );
}
