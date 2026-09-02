"use client";

import { MarkerDrag } from "@/registry/ui/marker-drag";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  {
    id: "WS-04",
    site: "Long Acre ridge",
    reading: "14.2 mm",
    state: "reporting",
  },
  { id: "WS-11", site: "Cold Hollow", reading: "—", state: "offline" },
  { id: "WS-02", site: "Harbour mouth", reading: "9.6 mm", state: "reporting" },
] as const;

/** A weather-station board — a longer paragraph of prose plus a station
 * table — for the highlighter to mark up. Drag across a line of text and it
 * lights up under the pointer, locked to that line; drag over the table or
 * a button and the mark just follows the cursor at the fixed stroke width. */
export function MarkerDragDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <MarkerDrag className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fieldline · weather stations
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Rain gauges, read back overnight.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every station on the ridge reported before six except Cold Hollow,
              which has been quiet since the relay mast lost power on Tuesday.
              The harbour gauge caught the heaviest fall of the night, just
              under a centimetre between the two a.m. and four a.m. readings,
              and the ridge station a short walk above it logged almost exactly
              half that — the usual split whenever the wind sits in the
              south-west. Nothing here needs an engineer yet, but Cold Hollow is
              worth a call if it stays dark past noon.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Site</th>
                <th className="py-2 pr-4 text-label text-ink-3">Rainfall</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.site}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2 tabular-nums">
                    {row.reading}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={row.state === "reporting" ? "success" : "warn"}
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Call Cold Hollow</PressureButton>
            <PressureButton variant="outline">
              Export overnight log
            </PressureButton>
          </div>
        </div>
      </MarkerDrag>
      <p className="text-center font-mono text-[11px] text-ink-3">
        highlight it
      </p>
    </div>
  );
}
