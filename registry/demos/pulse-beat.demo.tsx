"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { PulseBeat } from "@/registry/ui/pulse-beat";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { key: "Cadence", value: "60 bpm" },
  { key: "Interval", value: "1.00 s" },
  { key: "Reach", value: "420 px" },
  { key: "Origin", value: "centred" },
] as const;

/** Gaugeworks' instrument bench, kept to a steady beat. A ring leaves the
 * centre of the panel once a second, a fainter double a hair behind it, and
 * the whole bench warms for an instant at the same moment. Rest the cursor
 * on the panel and the beat starts from there instead. */
export function PulseBeatDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PulseBeat className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · instrument bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Sixty beats, one steady bench.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every dial on the bench ticks to the same cadence. Hold the cursor
              anywhere on the panel and the beat leaves from there instead of
              the centre.
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
              <p className="text-label text-ink-3">Beats logged</p>
              <Readout value={1440} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Drift</p>
              <Readout
                value={0.1}
                format={(v) => `${v.toFixed(1)}%`}
                size="md"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the beat</PressureButton>
            <PressureButton variant="outline">Hold the cadence</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 4 · shift 2
            </span>
          </div>
        </div>
      </PulseBeat>
      <p className="font-mono text-[11px] text-ink-3">sixty a minute</p>
    </div>
  );
}
