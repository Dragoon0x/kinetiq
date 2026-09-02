"use client";

import { LightningStrike } from "@/registry/ui/lightning-strike";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  { name: "Gate A", detail: "Intake screen, north wall", state: "clear" },
  { name: "Gate B", detail: "Auxiliary release", state: "throttled" },
  { name: "Gate C", detail: "Emergency spillway", state: "sealed" },
] as const;

/** Basinworks' gauge board under an open sky. Click anywhere on the card
 * and a bolt forks down to meet the point — a flash, a scorch mark, and
 * the readings underneath keep reporting straight through it. */
export function LightningStrikeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LightningStrike className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Lightning finds the low ground first.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The board keeps reading true no matter what the sky is doing.
              Click anywhere on the card — a bolt cracks down to meet it, the
              board flashes white for an instant, and a scorch mark settles
              where it landed.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Level</p>
              <Readout
                size="lg"
                value={94.2}
                format={(v) => `${v.toFixed(1)} m`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout size="lg" value={48} format={(v) => `${v} m3/s`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Spillway</p>
              <Readout size="lg" value={22} format={(v) => `${v}%`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Detail</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((gate) => (
                <tr key={gate.name} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {gate.name}
                  </td>
                  <td className="py-2 pr-4 text-xs text-ink-2">
                    {gate.detail}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        gate.state === "clear"
                          ? "success"
                          : gate.state === "throttled"
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
            <PressureButton variant="solid">Release gate A</PressureButton>
            <PressureButton variant="outline">Hold the board</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              94.2 m · steady
            </span>
          </div>
        </div>
      </LightningStrike>
      <p className="font-mono text-[11px] text-ink-3">
        click, and it comes down
      </p>
    </div>
  );
}
