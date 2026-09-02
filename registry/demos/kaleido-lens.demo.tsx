"use client";

import { KaleidoLens } from "@/registry/ui/kaleido-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "F-114", species: "Fernleaf maidenhair", pots: 48, state: "ready" },
  { id: "F-108", species: "Boston fern", pots: 36, state: "growing" },
  { id: "F-121", species: "Staghorn fern", pots: 24, state: "holding" },
  { id: "F-096", species: "Birds-nest fern", pots: 60, state: "ready" },
  { id: "F-133", species: "Rabbit-foot fern", pots: 18, state: "growing" },
  { id: "F-102", species: "Silver lace fern", pots: 30, state: "holding" },
] as const;

/** A nursery lot record for the lens to fold. Hold the cursor over the board — the wedges spin while it stays put and settle the instant it lifts. */
export function KaleidoLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <KaleidoLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · propagation lot</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six lots, ready for the yard.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Everything the greenhouse potted this quarter, in the order the
              yard crew will move it. Hold the glass over the list — the wedges
              keep turning while the cursor sits still, and stop the moment it
              lifts.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {LOTS.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="w-14 shrink-0 font-mono text-xs text-ink-2">
                  {lot.id}
                </span>
                <span className="flex-1 font-medium text-ink">
                  {lot.species}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-2">
                  {lot.pots} pots
                </span>
                <StatusSeal
                  variant={
                    lot.state === "ready"
                      ? "success"
                      : lot.state === "holding"
                        ? "warn"
                        : "info"
                  }
                >
                  {lot.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Release to yard</PressureButton>
            <PressureButton variant="outline">Hold for grading</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              lot 41 · week 34
            </span>
          </div>
        </div>
      </KaleidoLens>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        six of everything
      </p>
    </div>
  );
}
