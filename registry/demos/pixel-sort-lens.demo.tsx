"use client";

import { PixelSortLens } from "@/registry/ui/pixel-sort-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const READINGS = [
  {
    gauge: "G-01",
    channel: "Manifold pressure",
    value: "42.6 kPa",
    state: "nominal",
  },
  {
    gauge: "G-04",
    channel: "Coolant flow",
    value: "8.9 L/min",
    state: "watch",
  },
  {
    gauge: "G-07",
    channel: "Bearing temp",
    value: "61.2 C",
    state: "over",
  },
] as const;

/** A calibration sheet for the lens to read. Sweep the cursor across a row — the flat fields streak into light while the numbers stay legible. */
export function PixelSortLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PixelSortLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · calibration sheet
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Seven gauges, one pass before shift.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every reading here is real. Run the lens across the sheet and the
              flat fields streak into light while the numbers stay put.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gauge</th>
                <th className="py-2 pr-4 text-label text-ink-3">Channel</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {READINGS.map((row) => (
                <tr key={row.gauge} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.gauge}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.channel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.value}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "nominal"
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
            <PressureButton variant="solid">Log the pass</PressureButton>
            <PressureButton variant="outline">Flag G-07</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:40 · shift 2
            </span>
          </div>
        </div>
      </PixelSortLens>
      <p className="font-mono text-[11px] text-ink-3">sorted by light</p>
    </div>
  );
}
