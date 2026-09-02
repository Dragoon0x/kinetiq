"use client";

import { ChalkDust } from "@/registry/ui/chalk-dust";
import { PressureButton } from "@/registry/ui/pressure-button";

const SPEC = [
  { label: "Transect", value: "4 — north hedge" },
  { label: "Soil", value: "Loam, moist" },
  { label: "Chalk grade", value: "Soft, 5px" },
  { label: "Counted plots", value: "12 of 18" },
] as const;

/** A field-survey board on a dark chalkboard card, pinned to the same
 * green-black in either theme so the chalk itself supplies the contrast.
 * Drag across it to write — the line is a real stamped canvas, not an
 * animation — and double-click to smear, then clear. */
export function ChalkDustDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ChalkDust className="w-full max-w-2xl rounded-4 border border-white/10 bg-[#1b2a22]">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-[#e5e7eb]/60">
              Fieldline · the survey board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#e5e7eb] sm:text-3xl">
              Notes from the north hedge.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#e5e7eb]/80">
              Nothing here is rendered — drag across the board and the line is
              stamped chalk, grain and all. Double-click smears it, double-click
              again wipes it bare.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {SPEC.map((row) => (
              <div key={row.label}>
                <dt className="text-label text-[#e5e7eb]/60">{row.label}</dt>
                <dd className="mt-0.5 font-mono text-sm text-[#e5e7eb]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the plot</PressureButton>
            <PressureButton
              variant="outline"
              className="border-white/20 text-[#e5e7eb] hover:bg-white/10"
            >
              Flag for recount
            </PressureButton>
          </div>
        </div>
      </ChalkDust>
      <p className="text-center font-mono text-[11px] text-ink-3">
        write on it
      </p>
    </div>
  );
}
