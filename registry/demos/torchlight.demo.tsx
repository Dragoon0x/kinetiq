"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { Torchlight } from "@/registry/ui/torchlight";

const UNITS = [
  { id: "F-02", ward: "Tissue archive", temp: "-19.6", state: "holding" },
  { id: "F-08", ward: "Reagent shelf", temp: "-4.1", state: "cleared" },
  { id: "F-15", ward: "Vaccine bank", temp: "-21.3", state: "watch" },
  { id: "F-21", ward: "Bone bank", temp: "-18.0", state: "cleared" },
] as const;

/** A gauge room that stays dark between rounds. Carry the torch across the
 * panel and each reading comes up out of the black, one unit at a time. */
export function TorchlightDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Torchlight className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · night rounds</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six units, one beam of light.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The gauge room stays dark between rounds. Carry the light across
              the panel and each reading comes up out of the black, one unit at
              a time.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2 border border-hairline bg-surface-2 px-4 py-3">
            <span className="text-label text-ink-3">Units holding</span>
            <Readout value={11} size="sm" />
            <span className="font-mono text-xs text-ink-3">of 12</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Unit</th>
                <th className="py-2 pr-4 text-label text-ink-3">Ward</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {UNITS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.ward}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
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
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag unit F-15</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              03:10 · round 4
            </span>
          </div>
        </div>
      </Torchlight>
      <p className="text-center font-mono text-xs text-ink-3">
        dark, until you look
      </p>
    </div>
  );
}
