"use client";

import { GlareSweep } from "@/registry/ui/glare-sweep";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const READINGS = [
  {
    probe: "P-01",
    channel: "Torque arm",
    value: "412.6 N·m",
    state: "nominal",
  },
  {
    probe: "P-04",
    channel: "Bearing temp",
    value: "58.2 degC",
    state: "watch",
  },
  { probe: "P-07", channel: "Flow rate", value: "12.04 L/s", state: "nominal" },
  { probe: "P-11", channel: "Vibration", value: "0.031 g", state: "flagged" },
] as const;

/** A calibration sheet under glass. Sweep the cursor across the panel and a
 * glare crosses at a fixed tilt, tracking wherever your hand goes and
 * sliding off the edge the moment you look away. */
export function GlareSweepDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <GlareSweep className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · calibration sheet
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Rig 6 signed off at first light.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Four probes, read against the reference standard before the rig
              goes back online. The glass over this sheet catches the light
              exactly like the bench lamp does — move your hand and the glare
              follows it.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Probe</th>
                <th className="py-2 pr-4 text-label text-ink-3">Channel</th>
                <th className="py-2 pr-4 text-label text-ink-3">Reading</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {READINGS.map((reading) => (
                <tr key={reading.probe} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {reading.probe}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {reading.channel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {reading.value}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        reading.state === "nominal"
                          ? "success"
                          : reading.state === "watch"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {reading.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Sign off rig 6</PressureButton>
            <PressureButton variant="outline">Flag probe 11</PressureButton>
          </div>
        </div>
      </GlareSweep>
      <p className="font-mono text-[11px] text-ink-3">
        a glare, angled by your hand
      </p>
    </div>
  );
}
