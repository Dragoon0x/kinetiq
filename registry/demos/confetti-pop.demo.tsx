"use client";

import * as React from "react";

import { ConfettiPop } from "@/registry/ui/confetti-pop";

export function ConfettiPopDemo() {
  const [pops, setPops] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ConfettiPop height={220} onPop={() => setPops((value) => value + 1)}>
        Celebrate
      </ConfettiPop>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Pops{" "}
        <span className="text-[var(--signal,var(--primary))]">{pops}</span>
      </p>
    </div>
  );
}
