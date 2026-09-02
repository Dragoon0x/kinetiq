"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { PrivacyVeil } from "@/registry/ui/privacy-veil";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOCKERS = [
  { locker: "C12", ward: "Vaccine reserve", temp: "-18.4°C", state: "holding" },
  { locker: "C07", ward: "Plasma stock", temp: "-24.1°C", state: "cleared" },
  { locker: "C19", ward: "Tissue archive", temp: "-79.6°C", state: "inbound" },
] as const;

/** A locker ledger on a frosted card. Move the cursor across it — a clear
 * circle opens wherever it rests, and everything outside it stays behind a
 * blurred, whitened veil. Lift the cursor and the circle closes over
 * whatever it was last reading. */
export function PrivacyVeilDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PrivacyVeil className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Coldbrook · the locker ledger
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Nineteen lockers, one reading at a time.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The ledger stays frosted end to end. Rest the cursor on a row and
              only that row clears — the temperatures either side stay covered,
              the way a shared screen should behave.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Locker</th>
                <th className="py-2 pr-4 text-label text-ink-3">Ward</th>
                <th className="py-2 pr-4 text-label text-ink-3">Temp</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {LOCKERS.map((row) => (
                <tr key={row.locker} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.locker}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.ward}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.temp}
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
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Flag locker C19</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              rounds at 06:00 · 12:00 · 18:00
            </span>
          </div>
        </div>
      </PrivacyVeil>
      <p className="text-center font-mono text-[11px] text-ink-3">
        only what you are reading
      </p>
    </div>
  );
}
