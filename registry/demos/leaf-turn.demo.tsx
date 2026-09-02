"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { LeafTurn } from "@/registry/ui/leaf-turn";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const PANELS = [
  {
    id: "vault-one",
    label: "Leaf 1",
    kicker: "Coldbrook · vault one",
    heading: "Vault one holds flat at minus eighteen.",
    body: "No drift since the last defrost cycle. Of the three vaults, this is the one the morning report leans on first.",
    rows: [
      {
        label: "Core temperature",
        variant: "success" as const,
        state: "steady",
      },
      { label: "Door seal", variant: "success" as const, state: "sealed" },
      { label: "Backup power", variant: "warn" as const, state: "on reserve" },
    ],
    action: "Log the vault one reading",
  },
  {
    id: "vault-two",
    label: "Leaf 2",
    kicker: "Coldbrook · vault two",
    heading: "Vault two is mid-defrost.",
    body: "Humidity climbs for the next twenty minutes while the coils clear. Nothing moves in or out until the cycle ends.",
    rows: [
      { label: "Defrost cycle", variant: "info" as const, state: "running" },
      { label: "Humidity", variant: "warn" as const, state: "rising" },
      { label: "Pallet count", variant: "success" as const, state: "full" },
    ],
    action: "Log the vault two reading",
  },
  {
    id: "vault-three",
    label: "Leaf 3",
    kicker: "Coldbrook · vault three",
    heading: "Vault three watches the loading dock.",
    body: "The dock door has been open twice this hour. Warmer than the other two, and worth a look before the night shift signs off.",
    rows: [
      {
        label: "Dock temperature",
        variant: "warn" as const,
        state: "climbing",
      },
      { label: "Night watch", variant: "success" as const, state: "on site" },
      { label: "Manifest", variant: "info" as const, state: "pending" },
    ],
    action: "Log the vault three reading",
  },
] as const;

/** Three cold-storage vault panels, turned like pages — drag the right edge or use the switchers above. */
export function LeafTurnDemo() {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Choose a vault leaf"
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

      <LeafTurn
        index={index}
        onTurn={setIndex}
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
      </LeafTurn>

      <p className="font-mono text-xs text-ink-3">turn the leaf</p>
    </div>
  );
}
