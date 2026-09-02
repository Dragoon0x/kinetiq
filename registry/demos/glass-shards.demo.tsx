"use client";

import { GlassShards } from "@/registry/ui/glass-shards";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const INCIDENTS = [
  {
    id: "INC-104",
    zone: "Loading dock, west",
    time: "02:14",
    state: "resolved",
  },
  {
    id: "INC-107",
    zone: "Stairwell C, level 2",
    time: "03:41",
    state: "reviewing",
  },
  { id: "INC-109", zone: "Server room access", time: "04:02", state: "open" },
] as const;

/** A broken-window incident card behind a seeded fracture. Move the cursor across the pane — the shards nearest it tilt, lift, and part, and the ground shows through the gaps. */
export function GlassShardsDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <GlassShards className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · overnight watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three panes, one broken window.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Security flagged a cracked ground-floor pane at 02:14. Everything
              logged since then sits below it — the glass over the card is real,
              seeded the same way on every visit.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Case</th>
                <th className="py-2 pr-4 text-label text-ink-3">Zone</th>
                <th className="py-2 pr-4 text-label text-ink-3">Time</th>
                <th className="py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {INCIDENTS.map((row) => (
                <tr key={row.id} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.id}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.zone}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.time}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "resolved"
                          ? "success"
                          : row.state === "reviewing"
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
            <PressureButton variant="solid">Dispatch patrol</PressureButton>
            <PressureButton variant="outline">
              Escalate to site lead
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              04:02 · 3 open
            </span>
          </div>
        </div>
      </GlassShards>
      <p className="font-mono text-xs text-ink-3">broken, and beautiful</p>
    </div>
  );
}
