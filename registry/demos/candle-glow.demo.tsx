"use client";

import { CandleGlow } from "@/registry/ui/candle-glow";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const UNITS = [
  { id: "V-03", ward: "Serum vault", temp: "-18.4", state: "holding" },
  { id: "V-11", ward: "Plasma shelf", temp: "-24.0", state: "cleared" },
  { id: "V-16", ward: "Culture bank", temp: "-80.2", state: "watch" },
  { id: "V-22", ward: "Tissue drawer", temp: "-19.6", state: "cleared" },
] as const;

/** The grid dropped at 2 AM. Until it's back, one candle is the only light
 * in the room — click anywhere to carry it to where the round needs it. */
export function CandleGlowDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CandleGlow className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · the backup watch
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Power&apos;s out. One candle holds the round.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The grid dropped at 2 AM. Until it comes back, this is the only
              light in the room — enough to read four gauges and log what they
              say. Click anywhere on the board to carry it there.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2 border border-hairline bg-surface-2 px-4 py-3">
            <span className="text-label text-ink-3">Units holding</span>
            <Readout value={3} size="sm" />
            <span className="font-mono text-xs text-ink-3">of 4</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Unit</th>
                <th className="py-2 pr-4 text-label text-ink-3">Ward</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {UNITS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.ward}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}&deg;
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
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
            <PressureButton variant="solid">Confirm the round</PressureButton>
            <PressureButton variant="outline">Flag unit V-16</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              02:14 · grid down
            </span>
          </div>
        </div>
      </CandleGlow>
      <p className="text-center font-mono text-xs text-ink-3">
        lit by one small flame
      </p>
    </div>
  );
}
