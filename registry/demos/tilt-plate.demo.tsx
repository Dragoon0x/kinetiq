"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { TiltPlate } from "@/registry/ui/tilt-plate";

const SPECS = [
  { key: "range", value: "0–120 kPa" },
  { key: "accuracy", value: "±0.3%" },
  { key: "response", value: "40 ms" },
  { key: "calibrated", value: "12 Jul" },
] as const;

/** An instrument bench bolted to the page until a hand comes near it. Sweep the cursor across the panel and the whole plate swivels to meet it, real perspective on the dials underneath. */
export function TiltPlateDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <TiltPlate className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · bench 3</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One plate, tuned to your hand.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The panel sits flat on the bench until a hand comes near it, then
              it swivels on its gimbal to meet the reading straight on. Move the
              cursor across the glass and the whole instrument follows, real
              depth and all.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SPECS.map((spec) => (
              <div
                key={spec.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                  {spec.key}
                </p>
                <p className="mt-1 font-mono text-sm text-ink">{spec.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-3 border border-hairline bg-surface-2 px-4 py-3">
            <p className="text-label text-ink-3">Live pressure</p>
            <Readout value={42.6} format={(v) => `${v.toFixed(1)} kPa`} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Lock the reading</PressureButton>
            <PressureButton variant="outline">Reset gimbal</PressureButton>
          </div>
        </div>
      </TiltPlate>
      <p className="font-mono text-[11px] text-ink-3">it leans toward you</p>
    </div>
  );
}
