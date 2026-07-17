"use client";

import * as React from "react";

import { BoopMascot } from "@/registry/ui/boop-mascot";

export function BoopMascotDemo() {
  const [boops, setBoops] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <BoopMascot onBoop={() => setBoops((value) => value + 1)} />

      <p
        role="status"
        className="text-muted-foreground w-full border-border border-t pt-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Boops{" "}
        <span className="text-[var(--signal,var(--primary))]">{boops}</span>
      </p>
    </div>
  );
}
