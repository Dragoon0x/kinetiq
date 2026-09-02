"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TideLine } from "@/registry/ui/tide-line";

const BERTHS = [
  { berth: "B1", vessel: "Halyard", draught: "4.2 m", state: "clear" },
  { berth: "B3", vessel: "Kittiwake", draught: "5.6 m", state: "aground" },
  { berth: "B5", vessel: "Fetch", draught: "3.8 m", state: "waiting" },
] as const;

/** A harbour board the tide itself keeps honest. Watch the waterline climb
 * and settle behind the table -- it is not decoration, it is the same
 * measurement the berth states below are reporting on. */
export function TideLineDemo() {
  return (
    <div className="flex w-full justify-center">
      <TideLine className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Waylight · the harbour board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Five berths, one waterline.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Nothing on this board is fixed. Every draught line answers to the
              tide outside the window, and the water keeps its own record
              underneath -- how high it climbed, and how long the sand stays
              dark after it pulls back.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Berth</th>
                <th className="py-2 pr-4 text-label text-ink-3">Vessel</th>
                <th className="py-2 pr-4 text-label text-ink-3">Draught</th>
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
                    {row.draught}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "clear"
                          ? "success"
                          : row.state === "aground"
                            ? "danger"
                            : "warn"
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
            <PressureButton variant="solid">Post the board</PressureButton>
            <PressureButton variant="outline">Flag berth 3</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              the water comes, and goes
            </span>
          </div>
        </div>
      </TideLine>
    </div>
  );
}
