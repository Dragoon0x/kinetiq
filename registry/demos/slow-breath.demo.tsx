"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { SlowBreath } from "@/registry/ui/slow-breath";
import { StatusSeal } from "@/registry/ui/status-seal";

const BEDS = [
  { id: "FW-03", house: "Propagation bay", state: "venting" },
  { id: "FW-07", house: "Hardening rows", state: "holding" },
  { id: "FW-11", house: "Seed house", state: "sealed" },
] as const;

/** A greenhouse climate panel for Fernworks: the whole card swells and
 * warms on the same slow clock the vents themselves run on, then eases
 * back — nothing here answers the cursor, only the pace of the house. */
export function SlowBreathDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SlowBreath className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · greenhouse climate
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The house breathes with the beds.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              One slow cycle runs the vents open, holds them, and lets them
              settle shut again. Nothing here is waiting on you — the whole
              panel keeps the same pace as the glass above it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Vent cycle</p>
              <Readout size="lg" value={6} format={(v) => `${v}s`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Humidity</p>
              <Readout size="lg" value={78} format={(v) => `${v}%`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Temperature</p>
              <Readout
                size="lg"
                value={21.4}
                format={(v) => `${v.toFixed(1)}°C`}
              />
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {BEDS.map((bed) => (
              <li
                key={bed.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-2">{bed.id}</span>
                <span className="flex-1 font-medium text-ink">{bed.house}</span>
                <StatusSeal
                  variant={
                    bed.state === "venting"
                      ? "success"
                      : bed.state === "holding"
                        ? "warn"
                        : "info"
                  }
                >
                  {bed.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Open the vents</PressureButton>
            <PressureButton variant="outline" holdToConfirm={900}>
              Hold the cycle
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:10 · bay 3
            </span>
          </div>
        </div>
      </SlowBreath>
      <p className="text-center font-mono text-[11px] text-ink-3">
        in, and out
      </p>
    </div>
  );
}
