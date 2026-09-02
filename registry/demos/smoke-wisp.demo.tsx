"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { SmokeWisp } from "@/registry/ui/smoke-wisp";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  {
    id: "L-04",
    contents: "Stone fruit, pallet 12",
    temp: "-18.2°C",
    state: "stable",
  },
  {
    id: "L-11",
    contents: "Dairy, overflow run",
    temp: "-14.6°C",
    state: "drifting",
  },
  {
    id: "L-19",
    contents: "Vaccine reserve",
    temp: "-21.0°C",
    state: "stable",
  },
] as const;

/** A locker ledger for the wisp to trail across. Sweep the cursor over the rows and a thread of smoke rises and curls behind it, dissolving once the pointer moves on. */
export function SmokeWispDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SmokeWisp className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · locker ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three lockers, still holding their line.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every reading here comes straight off the floor sensors. Run the
              cursor across the ledger and a thread of smoke rises behind it,
              curling the way cold air actually escapes an open hatch.
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
              {LOCKERS.map((locker) => (
                <tr key={locker.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {locker.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {locker.contents}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {locker.temp}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={locker.state === "stable" ? "success" : "warn"}
                    >
                      {locker.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag locker 11</PressureButton>
          </div>
        </div>
      </SmokeWisp>
      <p className="font-mono text-[11px] text-ink-3">a thread of smoke</p>
    </div>
  );
}
