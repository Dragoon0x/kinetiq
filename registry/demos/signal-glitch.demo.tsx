"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { SignalGlitch } from "@/registry/ui/signal-glitch";
import { StatusSeal } from "@/registry/ui/status-seal";

const RELAYS = [
  { id: "R-04", name: "Cairn", freq: "441.20", state: "locked" },
  { id: "R-11", name: "Needle", freq: "441.55", state: "drift" },
  { id: "R-07", name: "Anchor", freq: "440.85", state: "lost" },
] as const;

/** Fieldline — a relay telemetry card whose whole surface is the signal it is reporting on. Leave it alone and the feed tears on its own schedule; click the card to force a burst. */
export function SignalGlitchDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SignalGlitch className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · relay telemetry</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three relays, one thin channel.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The uplink holds most of the time. When it does not, the whole
              board tears for a fraction of a second and comes back clean — same
              picture, same numbers, just interrupted.
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-label text-ink-3">Signal</p>
              <Readout value={-62} format={(v) => `${v} dBm`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Packet loss</p>
              <Readout value={2.4} format={(v) => `${v.toFixed(1)}%`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Uptime</p>
              <Readout value={99.82} format={(v) => `${v.toFixed(2)}%`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Relay</th>
                <th className="py-2 pr-4 text-label text-ink-3">Name</th>
                <th className="py-2 pr-4 text-label text-ink-3">Freq</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {RELAYS.map((relay) => (
                <tr key={relay.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {relay.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {relay.name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {relay.freq}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        relay.state === "locked"
                          ? "success"
                          : relay.state === "drift"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {relay.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Re-sync now</PressureButton>
            <PressureButton variant="outline">Hold channel</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              441.20 MHz · relay watch
            </span>
          </div>
        </div>
      </SignalGlitch>
      <p className="font-mono text-[11px] text-ink-3">
        it drops on its own · click to force a tear
      </p>
    </div>
  );
}
