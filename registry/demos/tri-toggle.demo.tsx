"use client";

import * as React from "react";

import { TriToggle } from "@/registry/ui/tri-toggle";

export function TriToggleDemo() {
  const [fan, setFan] = React.useState("auto");

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <TriToggle label="Cooling fan" value={fan} onValueChange={setFan} />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Fan <span className="text-[var(--signal,var(--primary))]">{fan}</span>
      </p>
    </div>
  );
}
