"use client";

import * as React from "react";

import { SeedLock } from "@/registry/ui/seed-lock";

/** What Basinworks Scout "produces" for a seed: the seed decides the name. */
const NAMES = ["Tideline", "Harbourlight", "Fernway"] as const;
const nameFor = (seed: string) =>
  NAMES[(Number(seed.slice(-2)) || 0) % NAMES.length] ?? NAMES[0];

export function SeedLockDemo() {
  const [seed, setSeed] = React.useState("48213907");
  const [locked, setLocked] = React.useState(false);
  const [reason, setReason] = React.useState<"typed" | "rolled" | null>(null);

  const state = locked ? "Locked" : reason === "rolled" ? "Rolled" : "Open";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SeedLock
        label="Basinworks Scout · feature name"
        value={seed}
        locked={locked}
        onValueChange={(next, why) => {
          setSeed(next);
          setReason(why);
        }}
        onLockedChange={(next) => {
          setLocked(next);
          if (next) setReason(null);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Seed <span className="tabular-nums">{seed || "none"}</span>
        {" · "}
        <span className="text-signal">{state}</span>
        {seed ? ` · "${nameFor(seed)}"` : ""}
      </p>
    </div>
  );
}
