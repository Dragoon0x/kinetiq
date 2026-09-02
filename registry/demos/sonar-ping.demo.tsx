"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { SonarPing } from "@/registry/ui/sonar-ping";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B4", vessel: "Marram", eta: "06:10", state: "cleared" },
  { berth: "B2", vessel: "Kestrel", eta: "06:45", state: "holding" },
  { berth: "B7", vessel: "Saltmarsh", eta: "07:20", state: "inbound" },
] as const;

/** Waylight's harbour board, sunk in the dark. Click anywhere on the card and a ring of sonar goes out from the impact point, reading the berths back in green before the dark closes over them again. */
export function SonarPingDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SonarPing className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · harbour watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The board goes dark between soundings.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nobody reads a still board at 4am. Click the card and a pulse goes
              out from where you touched it — every berth it crosses reports
              back in a flash of green, then the dark takes it again.
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
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Sound the board</PressureButton>
            <PressureButton variant="outline">Log the watch</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:10 · tide 3.4 m
            </span>
          </div>
        </div>
      </SonarPing>
      <p className="font-mono text-[11px] text-ink-3">ping</p>
    </div>
  );
}
