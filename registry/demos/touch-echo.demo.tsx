"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TouchEcho } from "@/registry/ui/touch-echo";

const GATES = [
  { gate: "G1", head: "12.4 m", flow: "38 cumecs", state: "open" },
  { gate: "G2", head: "12.1 m", flow: "0 cumecs", state: "closed" },
  { gate: "G3", head: "12.4 m", flow: "22 cumecs", state: "watch" },
] as const;

/** A reservoir board for the echo to answer. Click a gate row, a button, or the bare rail between them — each press sends its own shape back out as a ring. */
export function TouchEchoDemo() {
  return (
    <div className="flex w-full justify-center">
      <TouchEcho className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · the reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three gates, one basin.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Press a row, a button, or the bare rail between them — the board
              takes the shape of whatever you pressed and sends it back out as a
              ring. Nothing underneath moves; the board still gets the click.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Basin level</p>
              <Readout
                size="lg"
                value={12.4}
                format={(v) => `${v.toFixed(1)} m`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Outflow</p>
              <Readout
                size="lg"
                value={60}
                format={(v) => `${v.toFixed(0)} cumecs`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Gates open</p>
              <Readout size="lg" value={2} />
            </div>
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
              {GATES.map((row) => (
                <tr key={row.gate} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.gate}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.head}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.flow}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "open"
                          ? "success"
                          : row.state === "watch"
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
            <PressureButton variant="solid">Raise gate 2</PressureButton>
            <PressureButton variant="outline">Log the reading</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              it heard you
            </span>
          </div>
        </div>
      </TouchEcho>
    </div>
  );
}
