"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { StencilSpray } from "@/registry/ui/stencil-spray";

const GATES = [
  { id: "G1", head: "4.8 m", flow: "12.4 m³/s", state: "open" },
  { id: "G2", head: "5.1 m", flow: "0.0 m³/s", state: "holding" },
  { id: "G3", head: "4.6 m", flow: "9.8 m³/s", state: "open" },
] as const;

/** Basinworks' reservoir board, read straight off the concrete. Click
 * anywhere on the card and a coat of colour lands on the surface — the
 * gauges and gate names stay clean, holding out the paint like a stencil. */
export function StencilSprayDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <StencilSpray className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, one clean reading.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The crew marks the wall the way they always have — a coat where
              the shift needs a flag. The numbers and the gate names never take
              the colour; only the bare concrete around them does.
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <Readout value={182.4} format={(v) => `${v.toFixed(1)} m`} />
            <Readout value={22.2} format={(v) => `${v.toFixed(1)} m³/s`} />
            <Readout value={78} format={(v) => `${Math.round(v)}%`} />
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Head</th>
                <th className="py-2 pr-4 text-label text-ink-3">Flow</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((gate) => (
                <tr key={gate.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {gate.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {gate.head}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {gate.flow}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={gate.state === "open" ? "success" : "warn"}
                    >
                      {gate.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Hold gate 2</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:00 round
            </span>
          </div>
        </div>
      </StencilSpray>
      <p className="font-mono text-xs text-ink-3">sprayed through the page</p>
    </div>
  );
}
