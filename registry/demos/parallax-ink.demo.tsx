"use client";

import { ParallaxInk } from "@/registry/ui/parallax-ink";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const formatDepth = (v: number) => `${v.toFixed(2)} m`;
const formatFlow = (v: number) => `${Math.round(v)} m3/s`;
const formatReserve = (v: number) => `${v}%`;

const GATES = [
  { id: "G1", name: "Crest gate", head: "4.6 m", state: "open" },
  { id: "G2", name: "Draw gate", head: "2.3 m", state: "holding" },
  { id: "G3", name: "Relief gate", head: "0.0 m", state: "shut" },
] as const;

/** A reservoir board where the heading, the readouts, and the gate seals
 * sit nearer the surface than the prose around them. Move the cursor
 * across the board and the near marks drift a little more than the far
 * ones — nothing underneath moves, it is the same real table read at a
 * shifted point per depth band. */
export function ParallaxInkDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ParallaxInk className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Basinworks · spillway board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, and the basin holds its depth.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing on this board is a separate image. The ink is one real
              texture, split by how solid each mark reads — a heading stays
              together and drifts near the glass, a line of prose scatters thin
              under the blur and stays with the page.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-label text-ink-3">Depth</p>
              <Readout value={38.42} format={formatDepth} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Discharge</p>
              <Readout value={112} format={formatFlow} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Reserve</p>
              <Readout value={76} format={formatReserve} size="lg" />
            </div>
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
              {GATES.map((gate) => (
                <tr key={gate.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {gate.name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {gate.head}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        gate.state === "open"
                          ? "success"
                          : gate.state === "holding"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {gate.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Open the crest gate</PressureButton>
            <PressureButton variant="outline">
              Hold the draw gate
            </PressureButton>
          </div>
        </div>
      </ParallaxInk>
      <p className="text-center font-mono text-[11px] text-ink-3">
        nearer things move more
      </p>
    </div>
  );
}
