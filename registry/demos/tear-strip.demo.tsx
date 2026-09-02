"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TearStrip } from "@/registry/ui/tear-strip";

const PANELS = [
  {
    id: "morning",
    label: "Morning",
    kicker: "Waylight · first light",
    heading: "The morning board clears before the tide turns.",
    body: "Overnight arrivals log in as the light comes up. Whatever clears the morning board holds its berth through midday.",
    rows: [
      {
        label: "Harbour approach",
        variant: "success" as const,
        state: "clear",
      },
      { label: "Fog bank", variant: "warn" as const, state: "lifting" },
      { label: "Pilot boat", variant: "info" as const, state: "standing by" },
    ],
    action: "Post the morning board",
  },
  {
    id: "afternoon",
    label: "Afternoon",
    kicker: "Waylight · slack tide",
    heading: "Slack tide gives the afternoon its window.",
    body: "Traffic doubles once the current drops. Everything logged here moves before the flood picks back up.",
    rows: [
      { label: "Berth turnover", variant: "warn" as const, state: "tight" },
      { label: "Cargo cranes", variant: "success" as const, state: "running" },
      { label: "Channel depth", variant: "info" as const, state: "sounding" },
    ],
    action: "Post the afternoon board",
  },
  {
    id: "night",
    label: "Night",
    kicker: "Waylight · after dark",
    heading: "Night watch runs the harbour on lights alone.",
    body: "Fewer vessels, longer holds. Anything that missed the afternoon window waits here until the morning board opens again.",
    rows: [
      { label: "Anchor lights", variant: "success" as const, state: "lit" },
      { label: "Radio watch", variant: "info" as const, state: "manned" },
      { label: "Swell", variant: "warn" as const, state: "building" },
    ],
    action: "Post the night board",
  },
] as const;

/** Three shift boards for Waylight, switched by index — a strip tears open across the outgoing shift along a perforation, curling back to reveal the next one underneath. */
export function TearStripDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a shift board"
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

      <TearStrip
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
      </TearStrip>

      <p className="font-mono text-xs text-ink-3">torn open</p>
    </div>
  );
}
