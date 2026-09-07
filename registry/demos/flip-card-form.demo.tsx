"use client";

import * as React from "react";

import { FlipCardForm, type CardFormValue } from "@/registry/ui/flip-card-form";

export function FlipCardFormDemo() {
  const [side, setSide] = React.useState<"front" | "back">("front");
  const [saved, setSaved] = React.useState<CardFormValue | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">
          Waylight · payment
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          Step 2 of 3
        </span>
      </div>

      <FlipCardForm
        defaultValue={{
          number: "4915",
          name: "R. Ellery",
          expiry: "0428",
          cvc: "",
        }}
        onSideChange={setSide}
        onSubmit={setSaved}
        submitLabel="Save card"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {saved ? (
          <>
            Saved · showing the <span className="text-signal">{side}</span>
          </>
        ) : (
          <>
            Showing the <span className="text-signal">{side}</span> of the card
          </>
        )}
      </p>
    </div>
  );
}
