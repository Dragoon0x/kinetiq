"use client";

import { NightscopeLens } from "@/registry/ui/nightscope-lens";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const WATCH = [
  { time: "23:40", post: "Bow lookout", state: "posted" },
  { time: "00:20", post: "Beacon relief", state: "standby" },
  { time: "01:00", post: "Harbor round", state: "posted" },
] as const;

/** A dim duty table for the lens to intensify — the mono clock and watch
 * times barely show until the tube comes over them, then resolve green,
 * grain and all. */
export function NightscopeLensDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <NightscopeLens className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-label text-ink-3">
                Waylight · the night watch
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Four hours, three posts, one relief.
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
                The board barely shows in the dark. Bring the tube over it and
                the watch resolves in green.
              </p>
            </div>
            <p className="shrink-0 font-mono text-lg text-ink tabular-nums">
              23:40
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Time</th>
                <th className="py-2 pr-4 text-label text-ink-3">Post</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {WATCH.map((row) => (
                <tr key={row.time} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.time}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.post}</td>
                  <td className="py-2">
                    <StatusSeal
                      variant={row.state === "posted" ? "success" : "warn"}
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the watch</PressureButton>
            <PressureButton variant="outline">Ring the relief</PressureButton>
          </div>
        </div>
      </NightscopeLens>
      <p className="text-center font-mono text-xs text-ink-3">
        the night watch
      </p>
    </div>
  );
}
