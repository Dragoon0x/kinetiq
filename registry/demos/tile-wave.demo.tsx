"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { TileWave } from "@/registry/ui/tile-wave";

const GAUGES = [
  { key: "core temp", value: 68, format: (v: number) => `${v}°C` },
  { key: "load", value: 74, format: (v: number) => `${v}%` },
  { key: "pressure", value: 412, format: (v: number) => `${v} kPa` },
  { key: "flow rate", value: 1280, format: (v: number) => `${v} L/min` },
  {
    key: "rpm",
    value: 3150,
    format: (v: number) => v.toLocaleString("en-US"),
  },
  {
    key: "uptime",
    value: 998,
    format: (v: number) => `${(v / 10).toFixed(1)}h`,
  },
] as const;

/** A wall of live gauges for the tiles to carry. Sweep the cursor across the panel and the tiles nearest the path lift and tilt toward it, a wave rolling out and settling on springs; click anywhere and a ring runs out to the edges. */
export function TileWaveDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <TileWave className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · the gauge wall</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every reading, one panel, no surprises.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The wall behind these numbers is a real grid of tiles, cut apart
              and set on springs. Run the cursor across it and the tiles nearest
              the path rise to meet it; click, and a ring runs out to the edges.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GAUGES.map((gauge) => (
              <div
                key={gauge.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                  {gauge.key}
                </p>
                <Readout
                  value={gauge.value}
                  format={gauge.format}
                  size="sm"
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Calibrate wall</PressureButton>
            <PressureButton variant="outline">Silence alarms</PressureButton>
          </div>
        </div>
      </TileWave>
      <p className="font-mono text-[11px] text-ink-3">tiles, on springs</p>
    </div>
  );
}
