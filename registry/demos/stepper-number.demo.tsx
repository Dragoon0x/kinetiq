"use client";

import * as React from "react";

import { StepperNumber } from "@/registry/ui/stepper-number";

export function StepperNumberDemo() {
  const [qty, setQty] = React.useState(12);

  return (
    <div className="flex w-full max-w-sm flex-col items-start gap-4">
      <StepperNumber
        value={qty}
        onValueChange={setQty}
        min={0}
        max={99}
        step={1}
        label="Quantity"
      />

      <p
        role="status"
        className="text-muted-foreground w-full border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Quantity{" "}
        <span className="text-[var(--signal,var(--primary))]">{qty}</span>
      </p>
    </div>
  );
}
