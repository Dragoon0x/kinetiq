"use client";

import { CinderTrail } from "@/registry/ui/cinder-trail";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  {
    time: "23:40",
    post: "North jetty",
    note: "Lanterns lit, wind light",
    state: "clear",
  },
  {
    time: "01:15",
    post: "Breakwater",
    note: "Swell rising, watch doubled",
    state: "flagged",
  },
  {
    time: "03:50",
    post: "Lighthouse",
    note: "Relief walked the beam",
    state: "logged",
  },
] as const;

/** A night-watch log for the embers to trail across. Sweep the cursor over the board and sparks rise from wherever it has been, cooling out before they reach the header. */
export function CinderTrailDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CinderTrail className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · the night watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The brazier stays lit until the tide turns.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Four hours logged, three more to go. Every post below reported in
              on schedule — run the cursor across the log and see what it leaves
              behind.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Time</th>
                <th className="py-2 pr-4 text-label text-ink-3">Post</th>
                <th className="py-2 pr-4 text-label text-ink-3">Note</th>
                <th className="py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.time} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.time}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.post}</td>
                  <td className="py-2 pr-4 text-xs text-ink-2">{row.note}</td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "clear"
                          ? "success"
                          : row.state === "flagged"
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
            <PressureButton variant="solid">Log the hour</PressureButton>
            <PressureButton variant="outline">Ring the relief</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              02:05 · wind 9 kt
            </span>
          </div>
        </div>
      </CinderTrail>
      <p className="font-mono text-[11px] text-ink-3">
        sparks from where you have been
      </p>
    </div>
  );
}
