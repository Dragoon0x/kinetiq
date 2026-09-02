"use client";

import { HalftoneLens } from "@/registry/ui/halftone-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BEDS = [
  { bed: "A3", stock: "Fernleaf hosta", state: "thriving" },
  { bed: "B1", stock: "Trailing ivy", state: "watch" },
  { bed: "C6", stock: "Maidenhair fern", state: "dormant" },
] as const;

/** A propagation card for the loupe to screen. Sweep the lens across the
 * beds and the card underneath resolves into four rotated ink grids — cyan,
 * magenta, yellow, black — the way the catalogue photo will print. */
export function HalftoneLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <HalftoneLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · propagation card
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three beds, one morning round.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Move the loupe over the card and the page beneath screens into
              cyan, magenta, yellow, and black — four grids of dots, each on its
              own angle, printed the way the catalogue photo will be.
            </p>
          </div>
          <div className="flex items-baseline gap-3 rounded-2 border border-hairline bg-surface-0 px-4 py-3">
            <span className="text-label text-ink-3">Soil moisture</span>
            <Readout
              value={62.4}
              format={(v) => `${v.toFixed(1)}%`}
              size="lg"
            />
          </div>
          <ul className="flex flex-col gap-2">
            {BEDS.map((row) => (
              <li
                key={row.bed}
                className="flex items-center justify-between border-b border-hairline py-2 last:border-b-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-2">
                    {row.bed}
                  </span>
                  <span className="font-medium text-ink">{row.stock}</span>
                </div>
                <StatusSeal
                  variant={
                    row.state === "thriving"
                      ? "success"
                      : row.state === "watch"
                        ? "warn"
                        : "info"
                  }
                >
                  {row.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the round</PressureButton>
            <PressureButton variant="outline">Flag bed C6</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              greenhouse 2 · bay 4
            </span>
          </div>
        </div>
      </HalftoneLens>
      <p className="text-center font-mono text-xs text-ink-3">
        under the loupe
      </p>
    </div>
  );
}
