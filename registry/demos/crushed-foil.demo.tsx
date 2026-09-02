"use client";

import { CrushedFoil } from "@/registry/ui/crushed-foil";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { key: "Rig", value: "Bench 4" },
  { key: "Torque", value: "18.2 Nm" },
  { key: "Tolerance", value: "±0.05 mm" },
  { key: "Calibrated", value: "06:02" },
] as const;

/** Gaugeworks' instrument bench, printed onto foil that only ever catches
 * light — the panel never distorts. Move the cursor across it and the
 * sheen sweeps with it, brightest where the facets face the pointer and
 * dark along every seam between them. */
export function CrushedFoilDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CrushedFoil className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · instrument bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four readings, one bench sheet.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every dial on the bench, stamped onto foil before it went up on
              the wall. Sweep the cursor across it and watch the sheen catch
              each facet in turn.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {SPECS.map((spec) => (
              <div key={spec.key}>
                <dt className="text-label text-ink-3">{spec.key}</dt>
                <dd className="font-mono text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Cycles logged</p>
              <Readout value={3482} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Drift</p>
              <Readout
                value={0.4}
                format={(v) => `${v.toFixed(1)}%`}
                size="md"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the run</PressureButton>
            <PressureButton variant="outline">Flag drift</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 4 · shift 2
            </span>
          </div>
        </div>
      </CrushedFoil>
      <p className="font-mono text-[11px] text-ink-3">creased</p>
    </div>
  );
}
