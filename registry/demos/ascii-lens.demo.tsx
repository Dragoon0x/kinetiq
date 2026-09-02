"use client";

import { AsciiLens } from "@/registry/ui/ascii-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

/** A field survey brief for the lens to read back as type. Move the cursor across it — the glyphs it sets come from the shapes underneath, not from a filter laid on top. */
export function AsciiLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <AsciiLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · survey brief</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Grid 14 comes back clean.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every transect logged, every reading cross-checked against the
              base station before the crew broke for the day. Run the lens over
              the brief and watch it reset as monospace.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-label text-ink-3">Bearing</dt>
              <dd className="font-mono text-ink">014°</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Depth</dt>
              <dd className="font-mono text-ink">2.4 m</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Soil</dt>
              <dd className="font-mono text-ink">Loam over shale</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Crew</dt>
              <dd className="font-mono text-ink">Team B, north face</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Samples logged</p>
              <Readout value={214} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Coverage</p>
              <Readout value={92} format={(v) => `${v}%`} size="md" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">File the survey</PressureButton>
            <PressureButton variant="outline">Flag for recheck</PressureButton>
          </div>
        </div>
      </AsciiLens>
      <p className="font-mono text-[11px] text-ink-3">move across it</p>
    </div>
  );
}
