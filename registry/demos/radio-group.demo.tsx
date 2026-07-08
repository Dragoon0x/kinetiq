"use client";

import * as React from "react";

import { RadioGroup, RadioGroupItem } from "@/registry/ui/radio-group";

const TIERS = [
  {
    value: "standard",
    label: "Standard",
    price: "$0.12/hr",
    description: "Shared bench, fine for prototypes",
  },
  {
    value: "performance",
    label: "Performance",
    price: "$0.48/hr",
    description: "Dedicated cores, 4× memory",
  },
  {
    value: "dedicated",
    label: "Dedicated",
    price: "$1.90/hr",
    description: "Isolated rig, priority queue",
  },
] as const;

export function RadioGroupDemo() {
  const [tier, setTier] = React.useState<string>("performance");

  return (
    <div className="flex w-full max-w-72 flex-col gap-4">
      <RadioGroup
        label="Compute tier"
        name="compute-tier"
        value={tier}
        onValueChange={setTier}
      >
        {TIERS.map((option) => (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            description={option.description}
            className="w-full"
          >
            <span className="flex items-baseline justify-between gap-4">
              <span>{option.label}</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {option.price}
              </span>
            </span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Tier ·{" "}
        <span className="text-[var(--signal,var(--primary))]">{tier}</span>
      </p>
    </div>
  );
}
