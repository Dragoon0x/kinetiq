"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { ThermalLens } from "@/registry/ui/thermal-lens";

const BAYS = [
  { id: "B1", temp: "-18.4°C", state: "sealed" },
  { id: "B2", temp: "-19.1°C", state: "sealed" },
  { id: "B3", temp: "-6.2°C", state: "opening" },
  { id: "B4", temp: "2.8°C", state: "alarm" },
] as const;

/** A cold-storage board for the lens to read as heat. Move the cursor across
 * the bay grid and the headings and dense mono text glow hottest, since ink
 * is where the interface is densest. */
export function ThermalLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ThermalLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · cold storage</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four bays holding at temperature.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every bay logged at the top of the hour, before the door seals
              reset for the night. Run the lens over the board and watch the
              reading glow where the page is darkest.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-5 sm:grid-cols-4">
            {BAYS.map((bay) => (
              <div key={bay.id} className="flex flex-col gap-1.5">
                <p className="text-label text-ink-3">{bay.id}</p>
                <p className="font-mono text-sm text-ink tabular-nums">
                  {bay.temp}
                </p>
                <StatusSeal
                  variant={
                    bay.state === "sealed"
                      ? "success"
                      : bay.state === "opening"
                        ? "warn"
                        : "danger"
                  }
                >
                  {bay.state}
                </StatusSeal>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Compressor load</p>
              <Readout value={62} format={(v) => `${v}%`} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Doors held open</p>
              <Readout value={1} size="md" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Run defrost cycle</PressureButton>
            <PressureButton variant="outline">Seal bay 3</PressureButton>
          </div>
        </div>
      </ThermalLens>
      <p className="text-center font-mono text-xs text-ink-3">
        warm where it is dense
      </p>
    </div>
  );
}
