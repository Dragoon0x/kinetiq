"use client";

import * as React from "react";

import { ChipCloud, type Chip } from "@/registry/ui/chip-cloud";

const TAGS: Chip[] = [
  { id: "spring", label: "Spring" },
  { id: "damping", label: "Damping" },
  { id: "inertia", label: "Inertia" },
  { id: "friction", label: "Friction" },
  { id: "mass", label: "Mass" },
  { id: "stiffness", label: "Stiffness" },
  { id: "rebound", label: "Rebound" },
  { id: "settle", label: "Settle" },
];

export function ChipCloudDemo() {
  const [picks, setPicks] = React.useState<string[]>(["damping"]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <ChipCloud
        label="Calibration tags"
        chips={TAGS}
        value={picks}
        onValueChange={setPicks}
        placeholder="Pick a tag from the cloud below."
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Picked{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {picks.length}
        </span>{" "}
        of {TAGS.length}
      </p>
    </div>
  );
}
