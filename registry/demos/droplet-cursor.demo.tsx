"use client";

import { DropletCursor } from "@/registry/ui/droplet-cursor";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ZONES = [
  { zone: "Propagation bench", time: "06:00", state: "active" },
  { zone: "Terrarium wall", time: "12:30", state: "queued" },
  { zone: "Fern alcove", time: "18:45", state: "holding" },
] as const;

/** Fernworks' misting schedule, glassed by a chain of drops. Drag the cursor across the card — the drops trail, merge into one liquid surface, and bend the schedule beneath them. */
export function DropletCursorDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <DropletCursor className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · misting schedule
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three zones, one wet season.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The nozzles fire on their own clock; this card is just where the
              greenhouse crew checks it. Drag the cursor across the list — the
              glass trails in a chain and bends the times beneath it.
            </p>
          </div>
          <ul className="flex flex-col">
            {ZONES.map((row) => (
              <li
                key={row.zone}
                className="flex items-center justify-between gap-4 border-b border-hairline py-3"
              >
                <span className="font-medium text-ink">{row.zone}</span>
                <span className="font-mono text-xs text-ink-2">{row.time}</span>
                <StatusSeal
                  variant={
                    row.state === "active"
                      ? "success"
                      : row.state === "queued"
                        ? "info"
                        : "warn"
                  }
                >
                  {row.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Mist now</PressureButton>
            <PressureButton variant="outline">Pause zone</PressureButton>
          </div>
        </div>
      </DropletCursor>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        drag it across
      </p>
    </div>
  );
}
