"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { SnowSettle } from "@/registry/ui/snow-settle";
import { StatusSeal } from "@/registry/ui/status-seal";

const BAYS = [
  { bay: "D-1", cargo: "Frozen produce", state: "open" },
  { bay: "D-2", cargo: "Dairy pallets", state: "clearing" },
  { bay: "D-3", cargo: "Dry goods", state: "closed" },
] as const;

/** A cold-storage dock roof under real snowfall. It settles on the heading,
 * the table's header rule, and the button row below — anywhere the painted
 * texture actually breaks — and brushes clear under the cursor. */
export function SnowSettleDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SnowSettle className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · dock roof watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three bays, one settling roof.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The overnight fall builds wherever the roofline actually breaks —
              the header rule, the card edge, the top of every seal below — and
              nowhere else. Sweep the cursor across it to open a path.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Outside</p>
              <Readout
                size="lg"
                value={-3.1}
                format={(v) => `${v.toFixed(1)}°`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Roof load</p>
              <Readout
                size="lg"
                value={4.2}
                format={(v) => `${v.toFixed(1)} cm`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Bays clear</p>
              <Readout size="lg" value={2} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Bay</th>
                <th className="py-2 pr-4 text-label text-ink-3">Cargo</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {BAYS.map((row) => (
                <tr key={row.bay} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.bay}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.cargo}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "open"
                          ? "success"
                          : row.state === "clearing"
                            ? "warn"
                            : "info"
                      }
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Clear bay 2</PressureButton>
            <PressureButton variant="outline">Log the round</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:40 · fall steady
            </span>
          </div>
        </div>
      </SnowSettle>
      <p className="font-mono text-xs text-ink-3">it lands on what is there</p>
    </div>
  );
}
