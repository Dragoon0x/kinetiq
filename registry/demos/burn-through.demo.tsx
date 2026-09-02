"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { BurnThrough } from "@/registry/ui/burn-through";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "reel-12",
    label: "Reel 12",
    kicker: "Coldbrook · vault two",
    heading: "Reel 12 holds at set point.",
    body: "Core temperature has not drifted since the last defrost. The reel came off the truck under an hour ago and already reads level with the rest of the bay.",
    rows: [
      {
        label: "Core temperature",
        variant: "success" as const,
        state: "−18°C steady",
      },
      { label: "Door seal", variant: "success" as const, state: "sealed" },
      { label: "Humidity", variant: "warn" as const, state: "climbing" },
    ],
    action: "Log the reel 12 check",
  },
  {
    id: "reel-13",
    label: "Reel 13",
    kicker: "Coldbrook · vault two",
    heading: "Reel 13 is still settling in.",
    body: "Twenty minutes since the door closed behind it. Give the sensor another cycle before trusting the number on the label.",
    rows: [
      {
        label: "Core temperature",
        variant: "warn" as const,
        state: "settling",
      },
      { label: "Door seal", variant: "success" as const, state: "sealed" },
      { label: "Load cell", variant: "info" as const, state: "calibrating" },
    ],
    action: "Log the reel 13 check",
  },
  {
    id: "reel-14",
    label: "Reel 14",
    kicker: "Coldbrook · vault two",
    heading: "Reel 14 waits on the defrost cycle.",
    body: "Frost has built up past the safe line on the coil behind it. Nothing moves out of this bay until the cycle finishes.",
    rows: [
      {
        label: "Core temperature",
        variant: "danger" as const,
        state: "over threshold",
      },
      { label: "Door seal", variant: "warn" as const, state: "cycling" },
      {
        label: "Defrost timer",
        variant: "info" as const,
        state: "6 min left",
      },
    ],
    action: "Log the reel 14 check",
  },
] as const;

/** Three cold-storage panels, switched by index — the outgoing reel burns away from wherever the pointer last landed as the next one sets in behind it. */
export function BurnThroughDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a storage reel"
        className="flex gap-1.5 rounded-2 border border-hairline bg-surface-1 p-1"
      >
        {PANELS.map((panel, i) => (
          <button
            key={panel.id}
            type="button"
            aria-pressed={index === i}
            onClick={() => setIndex(i)}
            className={cn(
              "rounded-1 px-3 py-1.5 text-sm font-medium transition-colors",
              index === i
                ? "bg-primary text-primary-foreground"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {panel.label}
          </button>
        ))}
      </div>

      <BurnThrough
        index={index}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        {PANELS.map((panel) => (
          <div key={panel.id} className="flex flex-col gap-5 p-6 sm:p-8">
            <div>
              <p className="text-label text-ink-3">{panel.kicker}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {panel.heading}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
                {panel.body}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {panel.rows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between border-b border-hairline py-2 text-sm"
                >
                  <span className="text-ink-2">{row.label}</span>
                  <StatusSeal variant={row.variant}>{row.state}</StatusSeal>
                </li>
              ))}
            </ul>
            <div>
              <PressureButton variant="solid">{panel.action}</PressureButton>
            </div>
          </div>
        ))}
      </BurnThrough>

      <p className="font-mono text-xs text-ink-3">it burns away</p>
    </div>
  );
}
