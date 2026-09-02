"use client";

import { ComicLens } from "@/registry/ui/comic-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

/** A field survey brief for the lens to print. Move the cursor across it — the panel posterises the colours, inks the edges, and drops a halftone screen through the midtones, like a page run off a comic press. */
export function ComicLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ComicLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · site survey</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Transect 9 closed out clean.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every peg driven, every reading logged before the light went. Run
              the lens over the brief and watch it print itself down to flat
              colour, ink lines, and a dot screen.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-label text-ink-3">Transect</dt>
              <dd className="font-mono text-ink">09</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Bearing</dt>
              <dd className="font-mono text-ink">231°</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Elevation</dt>
              <dd className="font-mono text-ink">118 m</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Crew</dt>
              <dd className="font-mono text-ink">Team C, ridge line</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Pegs logged</p>
              <Readout value={146} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Coverage</p>
              <Readout value={88} format={(v) => `${v}%`} size="md" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">File the transect</PressureButton>
            <PressureButton variant="outline">Flag for recheck</PressureButton>
          </div>
        </div>
      </ComicLens>
      <p className="font-mono text-[11px] text-ink-3">inked</p>
    </div>
  );
}
