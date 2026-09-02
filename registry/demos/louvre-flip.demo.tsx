"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { LouvreFlip } from "@/registry/ui/louvre-flip";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "gates",
    label: "Gates",
    kicker: "Basinworks · spillway control",
    heading: "Gate three closes on schedule tonight.",
    body: "The reservoir sits half a metre under crest. Closing gate three now keeps the outflow inside the rated capacity of the downstream channel through the overnight rain.",
    rows: [
      { label: "Spillway gate 3", variant: "warn" as const, state: "closing" },
      { label: "Winch tension", variant: "success" as const, state: "nominal" },
      {
        label: "Downstream channel",
        variant: "info" as const,
        state: "within capacity",
      },
    ],
    action: "Log the gate closure",
  },
  {
    id: "flow",
    label: "Flow",
    kicker: "Basinworks · intake flow",
    heading: "Intake flow holds steady through the draw-down.",
    body: "Turbine demand has not moved the needle. The intake screens are drawing evenly across all four bays, which is the number the operations desk actually watches.",
    rows: [
      {
        label: "Intake bays 1-4",
        variant: "success" as const,
        state: "even draw",
      },
      {
        label: "Screen differential",
        variant: "success" as const,
        state: "clear",
      },
      { label: "Turbine demand", variant: "warn" as const, state: "rising" },
    ],
    action: "Log the flow reading",
  },
  {
    id: "silt",
    label: "Silt",
    kicker: "Basinworks · sediment survey",
    heading: "Silt at the delta creeps past the marker set last year.",
    body: "The sonar sweep from Tuesday puts the delta half a metre higher than the spring survey. Nothing urgent yet, but the reading is worth flagging before the next dredge gets scheduled.",
    rows: [
      { label: "Delta depth", variant: "warn" as const, state: "rising" },
      { label: "Turbidity", variant: "success" as const, state: "clear" },
      {
        label: "Dredge window",
        variant: "info" as const,
        state: "not yet due",
      },
    ],
    action: "Log the sediment survey",
  },
] as const;

/** Three reservoir readings, switched by index — the outgoing view flips away in a shallow cascade of slats as the next one turns in behind it. */
export function LouvreFlipDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a Basinworks reading"
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

      <LouvreFlip
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
      </LouvreFlip>

      <p className="font-mono text-xs text-ink-3">slats turn</p>
    </div>
  );
}
