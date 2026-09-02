"use client";

import { PolarVeil } from "@/registry/ui/polar-veil";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "F-01", site: "Cairn Ridge", kp: 6, state: "active" },
  { id: "F-04", site: "Hollow Vale", kp: 4, state: "watch" },
  { id: "F-09", site: "Tern Point", kp: 2, state: "quiet" },
] as const;

/** A weather-station board on a dark bench, pinned to the same dark colour
 * in either theme so the curtain reads against it. The aurora hung across
 * its top edge drifts on its own clock — nothing under it moves or
 * repaints, it is the same real table and the same real buttons. */
export function PolarVeilDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PolarVeil className="w-full max-w-2xl overflow-hidden rounded-4 border border-white/10 bg-[#0b1020]">
        <div className="flex flex-col gap-5 p-6 pt-14 sm:p-8 sm:pt-16">
          <div>
            <p className="text-label text-[#e5e7eb]/60">
              Fieldline · aurora watch
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#e5e7eb] sm:text-3xl">
              Kp climbing over three stations.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#e5e7eb]/80">
              Cairn Ridge caught the first curtain a little after dusk; Hollow
              Vale followed within the hour. The light overhead is the same
              field every station below is reading off its own magnetometer.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 border-y border-white/10 py-4">
            <div>
              <p className="text-label text-[#e5e7eb]/60">Kp index</p>
              <Readout size="lg" value={6} />
            </div>
            <div>
              <p className="text-label text-[#e5e7eb]/60">Bz, nT</p>
              <Readout size="lg" value={-8} />
            </div>
            <div>
              <p className="text-label text-[#e5e7eb]/60">Stations live</p>
              <Readout size="lg" value={3} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">
                  Station
                </th>
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">Site</th>
                <th className="py-2 pr-4 text-label text-[#e5e7eb]/60">Kp</th>
                <th className="py-2 text-label text-[#e5e7eb]/60">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs text-[#e5e7eb]/80">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-[#e5e7eb]">
                    {row.site}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#e5e7eb]/80">
                    {row.kp}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "active"
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
            <PressureButton variant="solid">Log the sighting</PressureButton>
            <PressureButton
              variant="outline"
              className="border-white/20 text-[#e5e7eb] hover:bg-white/10"
            >
              Notify the watch
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-[#e5e7eb]/60">
              03:10 · clear sky
            </span>
          </div>
        </div>
      </PolarVeil>
      <p className="text-center font-mono text-[11px] text-ink-3">
        curtains of light
      </p>
    </div>
  );
}
