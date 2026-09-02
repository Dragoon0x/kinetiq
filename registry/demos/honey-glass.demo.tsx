"use client";

import { HoneyGlass } from "@/registry/ui/honey-glass";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BEDS = [
  { name: "Fern bed 3", crop: "Maidenhair", state: "thriving" },
  { name: "Fern bed 7", crop: "Staghorn", state: "watch" },
  {
    name: "Propagation tray A",
    crop: "Boston fern cuttings",
    state: "rooting",
  },
] as const;

/** A nursery bench for the honey to pool over. Rest the cursor anywhere on
 * the card and the bulge swells slowly underneath it; move on and it just
 * as slowly settles flat again. */
export function HoneyGlassDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <HoneyGlass className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · propagation bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Week six, and the cuttings are taking.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Three beds under glass, misted on the hour. Rest the cursor
              anywhere on the bench and the light pools there like it would over
              a jar of honey, slow to rise and slower still to settle.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {BEDS.map((bed) => (
              <li
                key={bed.name}
                className="flex items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{bed.name}</p>
                  <p className="font-mono text-[11px] text-ink-3">{bed.crop}</p>
                </div>
                <StatusSeal
                  variant={
                    bed.state === "thriving"
                      ? "success"
                      : bed.state === "watch"
                        ? "warn"
                        : "info"
                  }
                >
                  {bed.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-6">
            <Readout value={68} format={(v) => `${v}°F`} size="sm" />
            <Readout value={81} format={(v) => `${v}% humid`} size="sm" />
            <Readout value={412} format={(v) => `${v} flats`} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Mist the bench</PressureButton>
            <PressureButton variant="outline">Log a loss</PressureButton>
          </div>
        </div>
      </HoneyGlass>
      <p className="font-mono text-[11px] text-ink-3">slow to follow</p>
    </div>
  );
}
