"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TapeWear } from "@/registry/ui/tape-wear";

const ENTRIES = [
  {
    take: "T04",
    logged: "1994.02.11",
    event: "Vault sweep, morning",
    state: "kept",
  },
  {
    take: "T07",
    logged: "1994.02.14",
    event: "Guard hold propagated",
    state: "logged",
  },
  {
    take: "T09",
    logged: "1994.02.19",
    event: "Night deposit run",
    state: "faded",
  },
  {
    take: "T12",
    logged: "1994.02.23",
    event: "Branch closing count",
    state: "damaged",
  },
] as const;

/** An archive reel card, read back off the vault's own security deck: the
 * entries stay perfectly legible while the tape around them bleeds colour,
 * jitters, and tears under a climbing tracking band. */
export function TapeWearDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <TapeWear className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · archive</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Reel 14 · winter ledger
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Pulled off the vault deck as found, not restored. The tape wears
              the way years on a shelf wear it — bleeding colour, a band
              climbing the frame, a dropout every so often — and the same reel
              plays back the same wear on every pass.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Take</th>
                <th className="py-2 pr-4 text-label text-ink-3">Logged</th>
                <th className="py-2 pr-4 text-label text-ink-3">Event</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {ENTRIES.map((row) => (
                <tr key={row.take} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.take}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.logged}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.event}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "kept"
                          ? "success"
                          : row.state === "logged"
                            ? "info"
                            : row.state === "faded"
                              ? "warn"
                              : "danger"
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
            <PressureButton variant="solid">Log the reel</PressureButton>
            <PressureButton variant="outline">Flag for review</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              TRK 0:42:17
            </span>
          </div>
        </div>
      </TapeWear>
      <p className="text-center font-mono text-[11px] text-ink-3">
        played back, worn
      </p>
    </div>
  );
}
