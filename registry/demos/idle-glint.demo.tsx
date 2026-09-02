"use client";

import { IdleGlint } from "@/registry/ui/idle-glint";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { label: "Bore", value: "38 mm" },
  { label: "Stroke", value: "112 mm" },
  { label: "Tolerance", value: "±0.02 mm" },
  { label: "Duty cycle", value: "continuous" },
] as const;

/** A quiet instrument bench. Leave the pointer alone for half a second and
 * a glint starts making its rounds — the spec tiles, then the buttons —
 * one control at a time, without touching a single real reading. */
export function IdleGlintDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <IdleGlint className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · the bench</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Calibrated, and waiting.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every dial here reads true. Step back from the pointer for a
              moment and a glint starts checking in on the bench, one tile and
              one control at a time, then settles until it is needed again.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SPECS.map((spec) => (
              <div
                key={spec.label}
                data-glint
                className="rounded-2 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="text-label text-ink-3">{spec.label}</p>
                <p className="mt-1 font-mono text-sm text-ink">{spec.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6 rounded-2 border border-hairline bg-surface-2 px-4 py-3">
            <div>
              <p className="text-label text-ink-3">Cycles</p>
              <Readout value={40812} size="sm" />
            </div>
            <div>
              <p className="text-label text-ink-3">Pressure</p>
              <Readout value={214} format={(v) => `${v} kPa`} size="sm" />
            </div>
            <div>
              <p className="text-label text-ink-3">Temp</p>
              <Readout value={62} format={(v) => `${v}°`} size="sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Run calibration</PressureButton>
            <PressureButton variant="outline">Log reading</PressureButton>
          </div>
        </div>
      </IdleGlint>
      <p className="text-center font-mono text-[11px] text-ink-3">
        when nothing has happened
      </p>
    </div>
  );
}
