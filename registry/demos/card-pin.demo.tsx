"use client";

import * as React from "react";

import { CardPin } from "@/registry/ui/card-pin";

export function CardPinDemo() {
  const [revealed, setRevealed] = React.useState(false);
  const [reveals, setReveals] = React.useState(0);
  const [expired, setExpired] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Coldbrook Bank · Waylight card
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <span aria-hidden>•••• </span>
          <span className="sr-only">ending </span>4417
        </span>
      </div>

      <CardPin
        label="Card PIN"
        holdFor={6000}
        onRevealChange={(next) => {
          setRevealed(next);
          if (next) {
            setReveals((previous) => previous + 1);
            setExpired(false);
          }
        }}
        onTimeout={() => setExpired(true)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        PIN{" "}
        <span className="text-cobalt-bright">
          {revealed ? "shown" : "hidden"}
        </span>{" "}
        · <span className="tabular-nums">{reveals}</span> reveals
        {expired && !revealed ? " · window expired" : ""}
      </p>
    </div>
  );
}
