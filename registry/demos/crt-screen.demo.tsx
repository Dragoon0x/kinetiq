"use client";

import { CrtScreen } from "@/registry/ui/crt-screen";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { label: "Tube", value: "14 in shadow-mask" },
  { label: "Scan rate", value: "15.75 kHz" },
  { label: "Phosphor", value: "P22 triad" },
  { label: "Convergence", value: "0.28 mm" },
] as const;

/** An instrument bench read off the tube itself — the picture bows, strobes, and rolls the way a real CRT does. Click the panel to cycle its power. */
export function CrtScreenDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CrtScreen className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · the instrument bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every dial, read off the tube.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The bench mirrors its panel meters onto one monitor at the
              operator desk. Click anywhere on the glass to cycle the set off
              and back on again — everything underneath is the real board.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-hairline pt-4 text-sm sm:grid-cols-4">
            {SPECS.map((spec) => (
              <div key={spec.label}>
                <dt className="text-label text-ink-3">{spec.label}</dt>
                <dd className="mt-0.5 font-mono text-xs text-ink">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-8 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Chamber pressure</p>
              <Readout
                value={412}
                format={(v) => `${v.toLocaleString("en-US")} kPa`}
                size="lg"
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Cycle count</p>
              <Readout value={8807} size="lg" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log reading</PressureButton>
            <PressureButton variant="outline">Flag drift</PressureButton>
          </div>
        </div>
      </CrtScreen>
      <p className="font-mono text-[11px] text-ink-3">warm phosphor</p>
    </div>
  );
}
