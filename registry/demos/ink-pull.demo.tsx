"use client";

import { InkPull } from "@/registry/ui/ink-pull";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { key: "torque", value: "48 N·m" },
  { key: "range", value: "0–600 psi" },
  { key: "tolerance", value: "±0.2%" },
  { key: "drift", value: "0.01/hr" },
  { key: "warm-up", value: "90 s" },
  { key: "cycle", value: "1.4 s" },
] as const;

/** An instrument bench for the ink to lean on. Sweep the cursor across the
 * panel and the printed labels tug toward it, the darkest strokes brighten
 * as they gather — the manifold underneath never moves, only its ink does. */
export function InkPullDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <InkPull className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · the calibration bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Bench four is holding true.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every needle here reads off the same manifold, checked at the top
              of the hour and logged before the next run starts. Nothing on the
              bench is loose — the ink just leans when the cursor gets close.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SPECS.map((spec) => (
              <div
                key={spec.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                  {spec.key}
                </p>
                <p className="mt-1 font-mono text-lg text-ink">{spec.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-label text-ink-3">Load</p>
              <Readout value={412} format={(v) => `${v} psi`} size="sm" />
            </div>
            <div>
              <p className="text-label text-ink-3">Steady</p>
              <Readout value={98} format={(v) => `${v}%`} size="sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Flag drift</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 4 · run 0231
            </span>
          </div>
        </div>
      </InkPull>
      <p className="font-mono text-[11px] text-ink-3">
        the ink leans toward you
      </p>
    </div>
  );
}
