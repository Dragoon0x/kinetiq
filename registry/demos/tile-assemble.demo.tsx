"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TileAssemble } from "@/registry/ui/tile-assemble";

const PANELS = [
  {
    id: "bench",
    label: "Bench",
    kicker: "Gaugeworks · calibration bench",
    heading: "Bench three clears its reference check.",
    body: "Every dial against the master gauge came back inside tolerance this morning. Bench three is free to take the next batch off the rig.",
    rows: [
      {
        label: "Reference gauge",
        variant: "success" as const,
        state: "matched",
      },
      { label: "Ambient drift", variant: "success" as const, state: "none" },
      { label: "Batch queue", variant: "info" as const, state: "loaded" },
    ],
    action: "Release the batch",
  },
  {
    id: "rig",
    label: "Rig",
    kicker: "Gaugeworks · the test rig",
    heading: "The rig is mid-cycle on load three.",
    body: "Torque and pressure are both tracking the curve we set last week. Nothing to sign off yet, but nothing to worry about either.",
    rows: [
      { label: "Load cycle", variant: "warn" as const, state: "running" },
      { label: "Torque trace", variant: "success" as const, state: "on curve" },
      { label: "Pressure seal", variant: "success" as const, state: "holding" },
    ],
    action: "Watch the live trace",
  },
  {
    id: "vault",
    label: "Vault",
    kicker: "Gaugeworks · the vault",
    heading: "The vault holds every gauge we have retired.",
    body: "Nothing in here ships again, but a retired gauge still tells you something about the ones still on the line. Nothing has moved since the last audit.",
    rows: [
      { label: "Audit seal", variant: "success" as const, state: "intact" },
      {
        label: "Climate control",
        variant: "success" as const,
        state: "steady",
      },
      { label: "Access log", variant: "info" as const, state: "quiet" },
    ],
    action: "Open the audit log",
  },
] as const;

/** Three instrument stations, switched by index — the outgoing station comes apart into flying tiles while the next one assembles behind it. */
export function TileAssembleDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a station"
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

      <TileAssemble
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
      </TileAssemble>

      <p className="font-mono text-xs text-ink-3">it arrives in pieces</p>
    </div>
  );
}
