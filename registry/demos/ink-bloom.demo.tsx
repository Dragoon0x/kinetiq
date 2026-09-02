"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { InkBloom } from "@/registry/ui/ink-bloom";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "beds",
    label: "Beds",
    kicker: "Fernworks · propagation beds",
    heading: "Propagation beds are running warm and even.",
    body: "Bottom heat holds at the set point across all four beds. The cuttings that went in Tuesday are already showing callus at the base.",
    rows: [
      { label: "Bed 1 moisture", variant: "success" as const, state: "steady" },
      { label: "Bed 3 heat mat", variant: "warn" as const, state: "drifting" },
      { label: "Cutting count", variant: "info" as const, state: "412" },
    ],
    action: "Log the beds reading",
  },
  {
    id: "lots",
    label: "Lots",
    kicker: "Fernworks · growing lots",
    heading: "Growing lots are cleared for the weekly shipment.",
    body: "Root systems on the one-gallon stock filled out ahead of schedule. Whatever ships Friday gets pulled from lot two first.",
    rows: [
      {
        label: "Lot 2 root check",
        variant: "success" as const,
        state: "cleared",
      },
      { label: "Lot 4 root check", variant: "warn" as const, state: "pending" },
      { label: "Pot count", variant: "info" as const, state: "860" },
    ],
    action: "Log the lots reading",
  },
  {
    id: "misting",
    label: "Misting",
    kicker: "Fernworks · misting lines",
    heading: "Misting lines run the old schedule until Thursday.",
    body: "The new controller arrives Thursday morning. Until then the lines hold a fixed interval, which oversaturates the shade end a little each afternoon.",
    rows: [
      { label: "Line pressure", variant: "success" as const, state: "steady" },
      { label: "Shade-end runoff", variant: "warn" as const, state: "high" },
      { label: "Controller swap", variant: "info" as const, state: "thursday" },
    ],
    action: "Log the misting reading",
  },
] as const;

/** Three nursery panels, switched by index — the outgoing view blooms away in dark ink from wherever the switcher was pressed, and the next one sets in behind it. */
export function InkBloomDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a nursery view"
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

      <InkBloom
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
      </InkBloom>

      <p className="font-mono text-xs text-ink-3">
        it spreads from where you pressed
      </p>
    </div>
  );
}
