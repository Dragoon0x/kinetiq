"use client";

import { AttentionTrail } from "@/registry/ui/attention-trail";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "F-04", site: "North Ridge", reading: "18 kt", state: "reporting" },
  { id: "F-11", site: "Salt Flat", reading: "6 kt", state: "quiet" },
  { id: "F-22", site: "Windward Bluff", reading: "31 kt", state: "gusting" },
] as const;

/** AttentionTrail mounted over a weather station's dawn board. Sweep the cursor across the readings and the table below — the warmth that follows is a real, decaying record of where you rested, not a highlight on any one row. */
export function AttentionTrailDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <AttentionTrail className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · dawn watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every station the crew swept this morning.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Move the cursor over the readings — the surface remembers where it
              rested and lets that warmth cool on its own, the way a hand leaves
              a page slightly warm after you have set it down.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Readout value={18} format={(v) => `${v} kt`} size="sm" />
            <Readout
              value={6.2}
              format={(v) => `${v.toFixed(1)} deg C`}
              size="sm"
            />
            <Readout value={1013} format={(v) => `${v} hPa`} size="sm" />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Site</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((station) => (
                <tr key={station.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {station.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {station.site}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {station.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        station.state === "reporting"
                          ? "success"
                          : station.state === "gusting"
                            ? "warn"
                            : "info"
                      }
                    >
                      {station.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag a station</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:52 · dawn watch
            </span>
          </div>
        </div>
      </AttentionTrail>

      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        where you have looked
      </p>
    </div>
  );
}
