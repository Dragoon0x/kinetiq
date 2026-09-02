"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { SandWind } from "@/registry/ui/sand-wind";

const SPEC = [
  { term: "Site", value: "Corridor 6, west face" },
  { term: "Wind", value: "24-31 kt, gusting" },
  { term: "Visibility", value: "60 m and falling" },
  { term: "Grain load", value: "heavy, fine" },
] as const;

const formatKnots = (v: number) => `${Math.round(v)} kt`;
const formatMetres = (v: number) => `${Math.round(v)} m`;

/** A field-survey log sitting under a live sandstorm: heading, prose, the
 * day's site spec, two readouts. No pointer drives it — the grains drift
 * and the gusts pulse on their own clock, the way the crew reads them off
 * the mast without touching anything. */
export function SandWindDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SandWind className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fieldline · corridor 6 survey
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The survey held through the worst of it.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Crew stayed on the mast through the afternoon blow. Every reading
              below is the one they logged, sand and all — the page is only
              showing you what they were looking at.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {SPEC.map((row) => (
              <div key={row.term}>
                <dt className="text-label text-ink-3">{row.term}</dt>
                <dd className="mt-0.5 font-medium text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-label text-ink-3">Gust</p>
              <Readout value={28} format={formatKnots} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Visibility</p>
              <Readout value={60} format={formatMetres} size="lg" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Call the crew in</PressureButton>
          </div>
        </div>
      </SandWind>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        the grit in it
      </p>
    </div>
  );
}
