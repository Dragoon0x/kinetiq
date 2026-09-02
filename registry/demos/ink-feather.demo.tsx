"use client";

import { InkFeather } from "@/registry/ui/ink-feather";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { post: "N4", instrument: "Rain gauge", reading: "6.2 mm", state: "logging" },
  {
    post: "N7",
    instrument: "Anemometer",
    reading: "14 km/h",
    state: "drifting",
  },
  {
    post: "S2",
    instrument: "Barograph",
    reading: "1013 hPa",
    state: "logging",
  },
  {
    post: "S5",
    instrument: "Soil probe",
    reading: "iced over",
    state: "offline",
  },
] as const;

/** A field station's morning round, written up the moment the last gauge
 * was read — the page is real, only the ink is still finding its way into
 * the fibres. Leave it alone and the feathering recedes back to a crisp
 * line on its own clock; nothing here needs the pointer. */
export function InkFeatherDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <InkFeather className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · station 4</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The 6:00 round, just written up.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Four posts, read in order and logged before the walk back to the
              hut. The numbers are settled; the page they are written on is not,
              not yet.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Air temp</span>
              <Readout
                size="md"
                value={8.4}
                format={(v) => `${v.toFixed(1)}°`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Wind</span>
              <Readout size="md" value={14} format={(v) => `${v} km/h`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Pressure</span>
              <Readout size="md" value={1013} format={(v) => `${v} hPa`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Post</th>
                <th className="py-2 pr-4 text-label text-ink-3">Instrument</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.post} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.post}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.instrument}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "logging"
                          ? "success"
                          : row.state === "drifting"
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
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag the drift</PressureButton>
          </div>
        </div>
      </InkFeather>
      <p className="font-mono text-[11px] text-ink-3">still spreading</p>
    </div>
  );
}
