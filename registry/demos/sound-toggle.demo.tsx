"use client";

import * as React from "react";

import { SoundToggle } from "@/registry/ui/sound-toggle";

export function SoundToggleDemo() {
  const [on, setOn] = React.useState(true);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="border-hairline bg-surface-1 flex items-center gap-3 rounded-3 border p-4">
        <SoundToggle on={on} onChange={setOn} />
        <span className="text-ink-2 text-sm">Preview audio</span>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Sound{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {on ? "on" : "muted"}
        </span>
      </p>
    </div>
  );
}
