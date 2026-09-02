"use client";

import { ClockSweep } from "@/registry/ui/clock-sweep";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { id: "FL-06", reading: "Night watch anemometer", state: "reporting" },
  { id: "FL-13", reading: "Marsh tide gauge", state: "checking" },
  { id: "FL-27", reading: "Ridge rain gauge", state: "offline" },
] as const;

const STATE_VARIANT = {
  reporting: "success",
  checking: "warn",
  offline: "danger",
} as const;

/** A weather station board the sweep turns over once a minute, like a
 * second hand with no face. Leave it be — no pointer needed — and watch the
 * line cross the table's rules, brightening each time it does. Click the
 * panel and the next turn sweeps from wherever you clicked. */
export function ClockSweepDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ClockSweep className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · night watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One quiet sweep, every sixty seconds.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              A thin line of light turns once a minute across the whole board,
              the same pace as a clock&apos;s second hand, brightening wherever
              it crosses a real rule or border on the way past. Click anywhere
              on the panel and the sweep recentres there for its next turn.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Temp</span>
              <Readout value={6} format={(v) => `${v}°C`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Wind</span>
              <Readout value={18} format={(v) => `${v} kt`} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Tide</span>
              <Readout value={2.4} format={(v) => `${v} m`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal variant={STATE_VARIANT[row.state]}>
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Acknowledge sweep</PressureButton>
            <PressureButton variant="outline">Flag station 27</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              00:00 · night watch
            </span>
          </div>
        </div>
      </ClockSweep>
      <p className="font-mono text-[11px] text-ink-3">once a minute</p>
    </div>
  );
}
