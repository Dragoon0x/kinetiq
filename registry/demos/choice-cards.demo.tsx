"use client";

import * as React from "react";

import {
  ChoiceCards,
  type ChoiceCardOption,
  type ChoiceCardsBilling,
} from "@/registry/ui/choice-cards";

const PLANS: ChoiceCardOption[] = [
  {
    value: "solo",
    title: "Solo",
    price: { monthly: 9, yearly: 90 },
    blurb: "One seat, three active boards.",
  },
  {
    value: "studio",
    title: "Studio",
    price: { monthly: 29, yearly: 290 },
    blurb: "Ten seats, shared asset library.",
    badge: "Popular",
  },
  {
    value: "fleet",
    title: "Fleet",
    price: { monthly: 120, yearly: 1150 },
    blurb: "Unlimited seats, audit log, SSO.",
  },
];

export function ChoiceCardsDemo() {
  const [plan, setPlan] = React.useState("studio");
  const [billing, setBilling] = React.useState<ChoiceCardsBilling>("monthly");

  const chosen = PLANS.find((entry) => entry.value === plan);

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <ChoiceCards
        label="Waylight plan"
        options={PLANS}
        value={plan}
        onValueChange={setPlan}
        billing={billing}
        onBillingChange={setBilling}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {chosen?.title ?? "None"} · {billing} · ${chosen?.price[billing] ?? 0}
      </p>
    </div>
  );
}
