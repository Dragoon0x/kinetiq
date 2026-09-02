"use client";

import { Letterpress } from "@/registry/ui/letterpress";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "ST-04", site: "Saltwick Ridge", reading: "12.1°C", state: "normal" },
  { id: "ST-11", site: "Cold Hollow", reading: "9.4°C", state: "watch" },
  { id: "ST-19", site: "Marrow Fen", reading: "-1.2°C", state: "alert" },
] as const;

/** A weather station's morning round, set as if the sheet itself were
 * pressed with lead type. Move the cursor across the page and a lamp held
 * above it rakes light across every letterform's own relief. */
export function LetterpressDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Letterpress className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · station log</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The 6 a.m. round, set and pulled.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every reading off the network gets struck into the sheet before it
              leaves the shed — pressure, wind, the night&apos;s rain — the way
              the log has always looked. Nothing on the page moves; only the
              light does.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Pressure</p>
              <Readout size="lg" value={1013.2} format={(v) => `${v} hPa`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Wind</p>
              <Readout size="lg" value={14} format={(v) => `${v} kt`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Rainfall</p>
              <Readout size="lg" value={6.4} format={(v) => `${v} mm`} />
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
                      variant={
                        row.state === "normal"
                          ? "success"
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
            <PressureButton variant="solid">File the round</PressureButton>
            <PressureButton variant="outline">Flag station 19</PressureButton>
          </div>
        </div>
      </Letterpress>
      <p className="font-mono text-[11px] text-ink-3">pressed into the paper</p>
    </div>
  );
}
