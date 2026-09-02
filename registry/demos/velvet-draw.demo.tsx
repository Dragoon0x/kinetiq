"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { VelvetDraw } from "@/registry/ui/velvet-draw";

const PANELS = [
  {
    id: "act-one",
    label: "Act one",
    kicker: "Waylight · the harbour, before six",
    heading: "The tide turns before the crew does.",
    body: "Berth assignments are still provisional. The lead hand walks the wharf once more before the first boat noses in.",
    rows: [
      { label: "Berth 2", variant: "info" as const, state: "provisional" },
      { label: "Fuel dock", variant: "success" as const, state: "open" },
      {
        label: "Harbourmaster log",
        variant: "warn" as const,
        state: "unsigned",
      },
    ],
    action: "Confirm the morning plan",
  },
  {
    id: "act-two",
    label: "Act two",
    kicker: "Waylight · midday, full wharf",
    heading: "Every berth is working at once.",
    body: "Three boats in, two more holding off the point. The board reshuffles twice before lunch and holds after that.",
    rows: [
      { label: "Berth 2", variant: "success" as const, state: "loaded" },
      { label: "Berth 4", variant: "warn" as const, state: "delayed" },
      {
        label: "Holding queue",
        variant: "info" as const,
        state: "2 vessels",
      },
    ],
    action: "Reassign berth four",
  },
  {
    id: "act-three",
    label: "Act three",
    kicker: "Waylight · the wharf, after dark",
    heading: "The boards close for the day.",
    body: "Last lines are made fast. Whatever did not get logged tonight waits for the crew that opens tomorrow's first act.",
    rows: [
      { label: "Fuel dock", variant: "success" as const, state: "closed" },
      {
        label: "Harbourmaster log",
        variant: "success" as const,
        state: "signed",
      },
      {
        label: "Tomorrow's berths",
        variant: "info" as const,
        state: "drafted",
      },
    ],
    action: "Post the closing note",
  },
] as const;

/** Three acts of a harbour's working day, switched by index — the outgoing act is drawn shut behind velvet curtains that hold, swap the set, and open on the next. */
export function VelvetDrawDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose an act"
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

      <VelvetDraw
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
      </VelvetDraw>

      <p className="font-mono text-xs text-ink-3">the next act</p>
    </div>
  );
}
