"use client";

import * as React from "react";

import { StickerPeel } from "@/registry/ui/sticker-peel";

export function StickerPeelDemo() {
  const [state, setState] = React.useState("stuck");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StickerPeel
        label="badge"
        onPeel={() => setState("peeled")}
        onRestore={() => setState("stuck")}
      >
        <div>
          <p className="text-label text-ink-3">LIMITED</p>
          <p className="mt-1 text-xl font-semibold">Founding Member</p>
          <p className="text-ink-3 mt-1 text-xs">Drag a corner to lift it</p>
        </div>
      </StickerPeel>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Sticker{" "}
        <span className="text-[var(--signal,var(--primary))]">{state}</span>
      </p>
    </div>
  );
}
