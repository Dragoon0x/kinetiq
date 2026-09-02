"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PixelDissolve } from "@/registry/ui/pixel-dissolve";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "ridge",
    label: "Ridge",
    kicker: "Fieldline · north face",
    heading: "Ridge camp holds through the window.",
    body: "Wind has eased since the six a.m. check. The crew above the treeline can push for the saddle before the next front rolls in.",
    rows: [
      { label: "Access trail", variant: "success" as const, state: "cleared" },
      { label: "Weather window", variant: "warn" as const, state: "closing" },
      { label: "Equipment cache", variant: "info" as const, state: "staged" },
    ],
    action: "Log the ridge reading",
  },
  {
    id: "basin",
    label: "Basin",
    kicker: "Fieldline · the flats",
    heading: "Basin readings sit flat and steady.",
    body: "No drift since sunrise. The flats give the cleanest baseline of the three sites, which is exactly why the instruments live here.",
    rows: [
      {
        label: "Ground moisture",
        variant: "success" as const,
        state: "steady",
      },
      { label: "Sensor drift", variant: "success" as const, state: "none" },
      { label: "Relay signal", variant: "warn" as const, state: "weak" },
    ],
    action: "Log the basin reading",
  },
  {
    id: "shore",
    label: "Shore",
    kicker: "Fieldline · tideline",
    heading: "Shore camp waits on the tide.",
    body: "Low water in forty minutes. Whatever the tideline gauge shows then is the number that goes in the morning report.",
    rows: [
      { label: "Tide gauge", variant: "info" as const, state: "pending" },
      { label: "Salt intrusion", variant: "success" as const, state: "clear" },
      { label: "Camera mount", variant: "warn" as const, state: "loose" },
    ],
    action: "Log the shore reading",
  },
] as const;

/** Three survey panels, switched by index — the outgoing camp breaks into blocks that flip to the next one as they reach their own moment. */
export function PixelDissolveDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a survey site"
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

      <PixelDissolve
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
      </PixelDissolve>

      <p className="font-mono text-xs text-ink-3">block by block</p>
    </div>
  );
}
