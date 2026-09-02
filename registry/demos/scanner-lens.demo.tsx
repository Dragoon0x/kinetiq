"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { ScannerLens } from "@/registry/ui/scanner-lens";

const SPECS = [
  { key: "unit", value: "GW-4" },
  { key: "output", value: "18.6 kN" },
  { key: "temp", value: "312 K" },
  { key: "tol", value: "±0.02 mm" },
  { key: "cycle", value: "4.8 s" },
  { key: "batch", value: "0091" },
] as const;

/** An instrument bench — headings, a spec grid, three controls — for the
 * scanner to read. Move the reticle across it and click to throw a ripple
 * across the panel. */
export function ScannerLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ScannerLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · instrument bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every reading, one sweep away.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run the scanner over the panel — the readout names whatever sits
              under the reticle, straight off the bench, not the picture of it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-hairline pt-5 sm:grid-cols-6">
            {SPECS.map((spec) => (
              <div key={spec.key}>
                <p className="font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
                  {spec.key}
                </p>
                <p className="font-mono text-sm text-ink tabular-nums">
                  {spec.value}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Calibrate</PressureButton>
            <PressureButton variant="outline">Hold reading</PressureButton>
            <PressureButton variant="outline">Export log</PressureButton>
          </div>
        </div>
      </ScannerLens>
      <p className="text-center font-mono text-xs text-ink-3">click to ping</p>
    </div>
  );
}
