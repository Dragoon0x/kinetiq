"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultHeadwindCards,
  HeadwindCards,
} from "@/registry/ui/headwind-cards";

export const tweaks = defineTweaks({
  skew: {
    kind: "range",
    label: "Skew",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 380,
    min: 120,
    max: 900,
    step: 20,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 16,
    min: 4,
    max: 40,
    step: 2,
    unit: "px",
  },
});

/**
 * Fieldline Walks: eight routes for the weekend in a row you can push
 * along. The cards lean into the push and stand back up when it stops.
 */
export function HeadwindCardsDemo({
  chrome = true,
  // The row is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [route, setRoute] = React.useState(0);
  const card = defaultHeadwindCards[route];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <HeadwindCards
          label="Routes for this weekend"
          value={route}
          onValueChange={setRoute}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Walks
        </p>
        <p className="text-base font-medium text-foreground">
          Routes for this weekend
        </p>
      </div>
      <div className="rounded-4 border border-hairline bg-surface-1 py-3">
        <HeadwindCards
          label="Routes for this weekend"
          value={route}
          onValueChange={setRoute}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{card?.caption}</span> · {route + 1} of{" "}
        {defaultHeadwindCards.length} · {card?.detail} · drag the row
      </p>
    </div>
  );
}
