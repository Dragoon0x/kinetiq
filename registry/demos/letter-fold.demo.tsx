"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { LetterFold } from "@/registry/ui/letter-fold";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "one",
    label: "Letter one",
    kicker: "Fieldline · dispatch one",
    heading: "The first letter home from the ridge.",
    body: "Six days out and the instruments are finally reading clean. Everything below goes into the evening post before the relay window closes.",
    rows: [
      {
        label: "Transect count",
        variant: "success" as const,
        state: "on schedule",
      },
      { label: "Battery reserve", variant: "warn" as const, state: "watch" },
      { label: "Relay window", variant: "info" as const, state: "22:40" },
    ],
    action: "Send the first letter",
  },
  {
    id: "two",
    label: "Letter two",
    kicker: "Fieldline · dispatch two",
    heading: "The second letter, five days further in.",
    body: "The weather held. Camp moved twice since the last post, and the basin readings finally agree with what the ridge crew has been reporting.",
    rows: [
      { label: "Camp moves", variant: "info" as const, state: "2 logged" },
      { label: "Sensor drift", variant: "success" as const, state: "none" },
      { label: "Supply cache", variant: "warn" as const, state: "low" },
    ],
    action: "Send the second letter",
  },
  {
    id: "three",
    label: "Letter three",
    kicker: "Fieldline · dispatch three",
    heading: "The third letter, closing out the season.",
    body: "Last transect finished at first light. Whatever this letter says when it is opened, the numbers for the season are already locked in below.",
    rows: [
      {
        label: "Season total",
        variant: "success" as const,
        state: "complete",
      },
      {
        label: "Equipment return",
        variant: "info" as const,
        state: "pending",
      },
      {
        label: "Final relay",
        variant: "success" as const,
        state: "confirmed",
      },
    ],
    action: "Send the third letter",
  },
] as const;

/** Three field dispatches, switched by index — the outgoing letter folds into thirds, turns over, and unfolds as the next one. */
export function LetterFoldDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a dispatch"
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

      <LetterFold
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
      </LetterFold>

      <p className="font-mono text-xs text-ink-3">folded, turned, unfolded</p>
    </div>
  );
}
