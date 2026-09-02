"use client";

import { CarbonGhost } from "@/registry/ui/carbon-ghost";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { label: "Bore", value: "100 mm" },
  { label: "Range", value: "0-16 bar" },
  { label: "Class", value: "1.0" },
] as const;

/** An instrument bench for the carbon leaf to double. Sweep the cursor
 * across the panel and the impression underneath drags a little further
 * from centre before it settles back. */
export function CarbonGhostDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CarbonGhost className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · calibration bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every dial writes twice.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The needle marks the glass, and a carbon leaf clipped beneath
              takes the same stroke a few millimetres out — close enough to
              check today against yesterday without pulling the log. Wave a hand
              across the bench and the leaf slides a little further before it
              settles back flat.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            {SPECS.map((spec) => (
              <div key={spec.label}>
                <p className="text-label text-ink-3">{spec.label}</p>
                <p className="font-mono text-sm text-ink">{spec.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-label text-ink-3">Live pressure</p>
              <Readout size="lg" value={8.4} format={(v) => `${v} bar`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Cycles logged</p>
              <Readout size="lg" value={1042} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Recalibrate</PressureButton>
          </div>
        </div>
      </CarbonGhost>
      <p className="font-mono text-[11px] text-ink-3">the copy underneath</p>
    </div>
  );
}
