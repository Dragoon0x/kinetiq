"use client";

import * as React from "react";

import { SwatchLock, type Swatch } from "@/registry/ui/swatch-lock";

const FINISHES: Swatch[] = [
  { id: "cobalt", label: "Cobalt", color: "oklch(0.55 0.19 258)" },
  { id: "graphite", label: "Graphite", color: "oklch(0.42 0.01 260)" },
  { id: "brass", label: "Brass", color: "oklch(0.74 0.12 85)" },
  { id: "oxide", label: "Oxide", color: "oklch(0.56 0.16 35)" },
  { id: "moss", label: "Moss", color: "oklch(0.55 0.11 150)" },
  { id: "bone", label: "Bone", color: "oklch(0.89 0.02 85)" },
  { id: "plum", label: "Plum", color: "oklch(0.48 0.14 320)" },
  { id: "slate", label: "Slate", color: "oklch(0.58 0.04 240)" },
  { id: "amber", label: "Amber", color: "oklch(0.72 0.16 65)" },
  { id: "ink", label: "Ink", color: "oklch(0.28 0.02 260)" },
];

export function SwatchLockDemo() {
  const [finish, setFinish] = React.useState("cobalt");
  const picked = FINISHES.find((swatch) => swatch.id === finish);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <SwatchLock
        label="Housing finish"
        swatches={FINISHES}
        value={finish}
        onValueChange={setFinish}
        columns={5}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Locked{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {picked?.label ?? "nothing"}
        </span>
      </p>
    </div>
  );
}
