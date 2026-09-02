"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RisoPrint } from "@/registry/ui/riso-print";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  {
    code: "F-114",
    plant: "Dryopteris — wood fern",
    flats: 40,
    state: "ready",
  },
  {
    code: "F-119",
    plant: "Athyrium — lady fern",
    flats: 24,
    state: "hardening",
  },
  { code: "F-126", plant: "Osmunda — royal fern", flats: 12, state: "held" },
] as const;

/** Fernworks — a nursery order sheet reproduced as a two-plate risograph
 * poster. Click the card and both plates re-register on a fresh hashed
 * offset, sliding into their new position over a quarter second. */
export function RisoPrintDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <RisoPrint className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · spring lots</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six lots, one clean order sheet.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Everything the propagation house set this week, sorted for the
              Saturday run — ferns first, then the shade perennials, then
              whatever the cold frame gives up.
            </p>
          </div>
          <ul className="flex flex-col text-sm">
            {LOTS.map((lot) => (
              <li
                key={lot.code}
                className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-ink-3">
                    {lot.code}
                  </span>
                  <span className="font-medium text-ink">{lot.plant}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-2">
                    {lot.flats} flats
                  </span>
                  <StatusSeal
                    variant={
                      lot.state === "ready"
                        ? "success"
                        : lot.state === "hardening"
                          ? "warn"
                          : "info"
                    }
                  >
                    {lot.state}
                  </StatusSeal>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">
              Print the order sheet
            </PressureButton>
            <PressureButton variant="outline">Hold lot F-126</PressureButton>
          </div>
        </div>
      </RisoPrint>
      <p className="font-mono text-[11px] text-ink-3">two inks, slightly off</p>
    </div>
  );
}
