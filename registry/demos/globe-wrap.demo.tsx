"use client";

import { GlobeWrap } from "@/registry/ui/globe-wrap";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "FL-04", site: "Northern ridge", reading: "12.4 mm", state: "logging" },
  { id: "FL-11", site: "Basin floor", reading: "no signal", state: "offline" },
  { id: "FL-19", site: "Coastal shelf", reading: "8.1 mm", state: "logging" },
] as const;

/** A weather board wrapped onto a sphere. Grab it and drag — the globe keeps turning after release, the readings keep reading, and the table underneath never stops being real. */
export function GlobeWrapDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <GlobeWrap className="w-full max-w-md rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · station relay</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every gauge, still reading.
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
              Three field stations report to one relay. Spin the sphere and the
              survey keeps ticking underneath — nothing here pauses for the
              drag.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Pressure</span>
              <Readout value={1013} size="sm" format={(v) => `${v} hPa`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Wind</span>
              <Readout value={14} size="sm" format={(v) => `${v} kt`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Humidity</span>
              <Readout value={68} size="sm" format={(v) => `${v}%`} />
            </div>
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
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.site}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={row.state === "logging" ? "success" : "warn"}
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Sync relay</PressureButton>
            <PressureButton variant="outline">Flag station</PressureButton>
          </div>
        </div>
      </GlobeWrap>
      <p className="font-mono text-[11px] text-ink-3">the page, as a planet</p>
    </div>
  );
}
