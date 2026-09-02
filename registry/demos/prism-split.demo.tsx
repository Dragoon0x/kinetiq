"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { PrismSplit } from "@/registry/ui/prism-split";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "FL-04", reading: "Ridge anemometer", state: "reporting" },
  { id: "FL-11", reading: "Basin thermistor", state: "checking" },
  { id: "FL-19", reading: "Coastal barometer", state: "offline" },
] as const;

const STATE_VARIANT = {
  reporting: "success",
  checking: "warn",
  offline: "danger",
} as const;

/** A weather station board for the prism to fracture. Sweep the cursor
 * across it — the bands separate into colour everywhere except a small
 * sharp disc that follows the pointer. */
export function PrismSplitDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PrismSplit className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · station relay</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Nineteen stations, one shared feed.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every sensor on the ridge and the basin lands here before the hour
              rolls over. Move the cursor across the board and watch the
              readings fracture into colour, clearing only where you are
              actually looking.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Temp</span>
              <Readout value={14} format={(v) => `${v}°C`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Wind</span>
              <Readout value={22} format={(v) => `${v} kt`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Pressure</span>
              <Readout value={1008} format={(v) => `${v} hPa`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal variant={STATE_VARIANT[row.state]}>
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Refresh feed</PressureButton>
            <PressureButton variant="outline">Flag basin</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:10 · 3 stations
            </span>
          </div>
        </div>
      </PrismSplit>
      <p className="font-mono text-[11px] text-ink-3">through a prism</p>
    </div>
  );
}
