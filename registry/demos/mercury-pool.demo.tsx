"use client";

import { MercuryPool } from "@/registry/ui/mercury-pool";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const GAUGES = [
  { instrument: "Bore gauge", range: "0-50mm", state: "calibrated" },
  { instrument: "Manometer", range: "0-12 bar", state: "drifting" },
  { instrument: "Torque wrench", range: "5-80 Nm", state: "due" },
] as const;

/** An instrument bench under a still pool of mercury. Sweep the cursor across it and a trail of ripples crosses the readouts, bending the reflected shop light with them. */
export function MercuryPoolDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <MercuryPool className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · the calibration bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gauges, one bench kept true.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every instrument on this bench gets checked against the same
              reference before it goes back on the floor. The readings below
              come straight off the gauges, not stand-ins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Bore</span>
              <Readout
                value={24.6}
                format={(v) => `${v.toFixed(1)}mm`}
                size="lg"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Pressure</span>
              <Readout
                value={6.3}
                format={(v) => `${v.toFixed(1)} bar`}
                size="lg"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Torque</span>
              <Readout value={42} format={(v) => `${v} Nm`} size="lg" />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Instrument</th>
                <th className="py-2 pr-4 text-label text-ink-3">Range</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GAUGES.map((row) => (
                <tr key={row.instrument} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.instrument}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.range}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "calibrated"
                          ? "success"
                          : row.state === "drifting"
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
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">
              Flag for recalibration
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 3 · 21C
            </span>
          </div>
        </div>
      </MercuryPool>
      <p className="font-mono text-xs text-ink-3">liquid metal</p>
    </div>
  );
}
