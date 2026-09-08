"use client";

import * as React from "react";

import { CardFace } from "@/registry/ui/card-face";

export function CardFaceDemo() {
  const [revealed, setRevealed] = React.useState(false);
  const [frozen, setFrozen] = React.useState(false);

  const freeze = () => {
    setFrozen((previous) => !previous);
    // A freeze closes the details for good: the card should not thaw back into
    // a face that is still showing its number.
    setRevealed(false);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Coldbrook Bank</span>
        <button
          type="button"
          onClick={freeze}
          aria-pressed={frozen}
          className="flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {frozen ? "Thaw card" : "Freeze card"}
        </button>
      </div>

      <CardFace
        label="Waylight virtual card"
        revealed={revealed}
        onRevealedChange={setRevealed}
        frozen={frozen}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight card{" "}
        <span className="text-cobalt-bright">
          {revealed && !frozen ? "back" : "front"}
        </span>{" "}
        · number {revealed && !frozen ? "shown" : "masked"} ·{" "}
        {frozen ? "frozen" : "active"}
      </p>
    </div>
  );
}
