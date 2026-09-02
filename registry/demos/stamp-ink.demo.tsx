"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StampInk } from "@/registry/ui/stamp-ink";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B3", vessel: "Windrose", eta: "05:55", state: "cleared" },
  { berth: "B6", vessel: "Cormorant", eta: "06:30", state: "holding" },
  { berth: "B1", vessel: "Northlight", eta: "07:10", state: "inbound" },
] as const;

/** Waylight — a harbour board pressed onto the page with a rubber stamp.
 * Click the board and it lands again: a fresh tilt, a fresh smudge, never
 * quite the same as the click before it. */
export function StampInkDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <StampInk className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every berth, pressed onto the plank.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The dockmaster keeps one stamp for the whole season. Click the
              board and it comes down again — never quite square, never quite
              the same pressure twice.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Berth</th>
                <th className="py-2 pr-4 text-label text-ink-3">Vessel</th>
                <th className="py-2 pr-4 text-label text-ink-3">ETA</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {BERTHS.map((row) => (
                <tr key={row.berth} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.berth}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.vessel}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.eta}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
                          ? "success"
                          : row.state === "holding"
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
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Berths pressed</p>
              <Readout value={17} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Draft</p>
              <Readout
                value={3.4}
                format={(v) => `${v.toFixed(1)} m`}
                size="md"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Stamp the board</PressureButton>
            <PressureButton variant="outline">Hold berth 6</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              05:55 · dockmaster&apos;s copy
            </span>
          </div>
        </div>
      </StampInk>
      <p className="font-mono text-[11px] text-ink-3">stamped, unevenly</p>
    </div>
  );
}
