"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { IrisBlades } from "@/registry/ui/iris-blades";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "bench",
    label: "Bench",
    kicker: "Gaugeworks · calibration bench",
    heading: "Bench readings hold inside tolerance.",
    body: "Every dial on the rack has settled since the morning reset. Nothing here needs a second look before it ships to the floor.",
    rows: [
      {
        label: "Zero offset",
        variant: "success" as const,
        state: "within spec",
      },
      { label: "Span check", variant: "success" as const, state: "passed" },
      { label: "Ambient drift", variant: "warn" as const, state: "watch" },
    ],
    action: "Sign off the bench",
  },
  {
    id: "rig",
    label: "Rig",
    kicker: "Gaugeworks · load rig",
    heading: "Rig is mid-cycle on the long run.",
    body: "Two hours left on the endurance pass. The gauges under test are logging clean, and nobody touches the rig until the counter hits zero.",
    rows: [
      {
        label: "Cycle count",
        variant: "info" as const,
        state: "41,200 / 60,000",
      },
      { label: "Load cell", variant: "success" as const, state: "steady" },
      { label: "Housing temp", variant: "warn" as const, state: "elevated" },
    ],
    action: "Log a rig check",
  },
  {
    id: "vault",
    label: "Vault",
    kicker: "Gaugeworks · reference vault",
    heading: "Vault standards are due for recheck.",
    body: "The primary reference set has not left the vault in a year, which is the point — but the certificate on two of them expires this month.",
    rows: [
      {
        label: "Primary standard",
        variant: "success" as const,
        state: "current",
      },
      { label: "Secondary set", variant: "warn" as const, state: "expiring" },
      { label: "Access log", variant: "info" as const, state: "clean" },
    ],
    action: "Request recertification",
  },
] as const;

/** Three instrument stations, switched by index — the outgoing station closes behind an iris of blades as the next one opens into view. */
export function IrisBladesDemo() {
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

      <IrisBlades
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
      </IrisBlades>

      <p className="font-mono text-xs text-ink-3">an aperture</p>
    </div>
  );
}
