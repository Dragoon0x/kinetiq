"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { VortexPull } from "@/registry/ui/vortex-pull";

const GATES = [
  { gate: "Gate 1", head: "4.2 m", state: "open" },
  { gate: "Gate 2", head: "3.8 m", state: "throttled" },
  { gate: "Gate 3", head: "0.0 m", state: "closed" },
] as const;

/** A reservoir board for the vortex to seize. Press and hold anywhere on
 * the panel — the board winds up around the pointer the longer it's held,
 * then rings back loose the moment it's released. */
export function VortexPullDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <VortexPull className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Basinworks · reservoir four</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, and the head is holding.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Inflow is ahead of outflow again this week, so gate two stays
              throttled rather than open. Press and hold anywhere on the board —
              the longer the grip, the harder the panel spirals toward it, and
              it only lets go once you do.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Readout value={82} format={(v) => `${v}% full`} size="sm" />
            <Readout value={64} format={(v) => `${v} m³/s in`} size="sm" />
            <Readout value={58} format={(v) => `${v} m³/s out`} size="sm" />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Head</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((row) => (
                <tr key={row.gate} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">{row.gate}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.head}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "open"
                          ? "success"
                          : row.state === "throttled"
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
            <PressureButton variant="solid">Open gate 2</PressureButton>
            <PressureButton variant="outline">Log the reading</PressureButton>
          </div>
        </div>
      </VortexPull>
      <p className="font-mono text-[11px] text-ink-3">hold, and it turns</p>
    </div>
  );
}
