"use client";

import { NegativeLens } from "@/registry/ui/negative-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { key: "torque", value: "42.6 n-m" },
  { key: "temp", value: "71.4 c" },
  { key: "pressure", value: "3.20 bar" },
  { key: "flow", value: "18.9 l/m" },
] as const;

/** An instrument bench for the lens to read as a radiograph. Hold the glass
 * over a spec value or the heading and it magnifies; move it anywhere else
 * on the panel and the field just inverts, edges lifting bone-white. */
export function NegativeLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <NegativeLens
        targets="h2, .spec-value"
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · bench three</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every reading, held to the light.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run the glass across the panel and the bench reads back as a plate
              — the calibration underneath never moves, it just shows its bones
              for a moment.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-sm sm:grid-cols-4">
            {SPECS.map((spec) => (
              <div key={spec.key} className="flex flex-col gap-0.5">
                <dt className="text-xs text-ink-3 uppercase">{spec.key}</dt>
                <dd className="spec-value text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Spindle rpm</span>
              <Readout value={4021} size="sm" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Load, kg</span>
              <Readout value={886} size="sm" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Cycles logged</span>
              <Readout value={219304} size="sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Calibrate bench</PressureButton>
            <PressureButton variant="outline">Hold reading</PressureButton>
          </div>
        </div>
      </NegativeLens>
      <p className="font-mono text-[11px] text-ink-3">look through it</p>
    </div>
  );
}
