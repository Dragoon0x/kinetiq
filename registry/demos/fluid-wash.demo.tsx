"use client";

import { FluidWash } from "@/registry/ui/fluid-wash";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const formatFlow = (v: number) => `${Math.round(v)} m3/s`;
const formatHead = (v: number) => `${v.toFixed(1)} m`;
const formatTurbidity = (v: number) => `${Math.round(v)} NTU`;

const CHANNELS = [
  { id: "C1", name: "Main spillway", flow: "212 m3/s", state: "running" },
  { id: "C2", name: "Auxiliary chute", flow: "38 m3/s", state: "trickling" },
  { id: "C3", name: "Emergency channel", flow: "0 m3/s", state: "dry" },
] as const;

/** A spillway report sitting under a sheet of fluid: headings, prose, live
 * readouts, a channel table. Stir the surface and a real velocity field
 * carries the disturbance through every element on its way past, tinting
 * where the dye pools, before the page settles back to paper. */
export function FluidWashDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FluidWash className="w-full max-w-2xl overflow-hidden rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · spillway flow report
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The water is up, and downstream wants a number.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run a hand across the report and it answers like still water: a
              real velocity field carries the disturbance through every readout
              and seal below, pooling a trace of colour behind it, before the
              whole page settles back to paper.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-label text-ink-3">Flow</p>
              <Readout value={212} format={formatFlow} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Head</p>
              <Readout value={5.8} format={formatHead} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Turbidity</p>
              <Readout value={14} format={formatTurbidity} size="lg" />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Channel</th>
                <th className="py-2 pr-4 text-label text-ink-3">Flow</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((channel) => (
                <tr key={channel.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {channel.name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {channel.flow}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        channel.state === "running"
                          ? "success"
                          : channel.state === "trickling"
                            ? "warn"
                            : "info"
                      }
                    >
                      {channel.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">File the reading</PressureButton>
            <PressureButton variant="outline">Flag the chute</PressureButton>
          </div>
        </div>
      </FluidWash>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        stir it
      </p>
    </div>
  );
}
