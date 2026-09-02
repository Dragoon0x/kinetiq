"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { LiquidWipe } from "@/registry/ui/liquid-wipe";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "intake",
    label: "Intake",
    kicker: "Basinworks · headworks",
    heading: "Intake gate holds at ninety percent.",
    body: "Screen debris is running light this morning, and the trash rack cleared itself twice before dawn. Nothing here needs a hand yet.",
    rows: [
      { label: "Screen debris", variant: "success" as const, state: "light" },
      { label: "Gate position", variant: "info" as const, state: "90%" },
      { label: "Trash rack", variant: "success" as const, state: "clear" },
    ],
    action: "Log the intake reading",
  },
  {
    id: "spillway",
    label: "Spillway",
    kicker: "Basinworks · crest gates",
    heading: "Spillway sits below the trigger line.",
    body: "Storage is three feet under the spill elevation, with the forecast calling for a dry week. The crest gates stay closed unless that changes.",
    rows: [
      {
        label: "Reservoir level",
        variant: "success" as const,
        state: "-3.2 ft",
      },
      { label: "Crest gates", variant: "info" as const, state: "closed" },
      { label: "Inflow forecast", variant: "warn" as const, state: "watch" },
    ],
    action: "Log the spillway reading",
  },
  {
    id: "outflow",
    label: "Outflow",
    kicker: "Basinworks · discharge works",
    heading: "Outflow matches the release order.",
    body: "The valve is holding the scheduled release for the downstream users, and the gauge below the works confirms it within a tenth of a foot.",
    rows: [
      {
        label: "Release valve",
        variant: "success" as const,
        state: "on order",
      },
      {
        label: "Downstream gauge",
        variant: "success" as const,
        state: "matched",
      },
      { label: "Turbidity", variant: "warn" as const, state: "rising" },
    ],
    action: "Log the outflow reading",
  },
] as const;

/** Three reservoir panels, switched by index — the outgoing works dries out below the waterline as the liquid front pours the next one in from the top. */
export function LiquidWipeDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a works"
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

      <LiquidWipe
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
      </LiquidWipe>

      <p className="font-mono text-xs text-ink-3">poured over</p>
    </div>
  );
}
