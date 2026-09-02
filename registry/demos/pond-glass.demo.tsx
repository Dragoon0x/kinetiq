"use client";

import { PondGlass } from "@/registry/ui/pond-glass";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const formatLevel = (v: number) => `${v.toFixed(2)} m`;
const formatFlow = (v: number) => `${Math.round(v)} m3/s`;

const GATES = [
  { id: "G1", name: "Intake gate", head: "3.2 m", state: "open" },
  { id: "G2", name: "Spill gate", head: "1.1 m", state: "closed" },
  { id: "G3", name: "Bypass gate", head: "0.4 m", state: "holding" },
] as const;

/** A reservoir board — headings, prose, live readouts, a gate table — sitting
 * under still water. Click anywhere on the board and a ring spreads across
 * every element on its way out. */
export function PondGlassDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PondGlass className="w-full max-w-2xl overflow-hidden rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · reservoir gauge board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, one basin, holding steady.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Everything below reads true under the glass. Drop a stone anywhere
              on the board and the ripple crosses every readout and seal on its
              way out, bending the numbers without moving one of them.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-label text-ink-3">Level</p>
              <Readout value={41.86} format={formatLevel} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout value={128} format={formatFlow} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Outflow</p>
              <Readout value={94} format={formatFlow} size="lg" />
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
                            : "info"
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
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Flag gate 2</PressureButton>
          </div>
        </div>
      </PondGlass>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        click the water
      </p>
    </div>
  );
}
