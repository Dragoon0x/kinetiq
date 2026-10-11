"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPaternosterCards,
  PaternosterCards,
} from "@/registry/ui/paternoster-cards";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 16,
    min: 8,
    max: 40,
    step: 4,
    unit: "px",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.6,
    min: 0,
    max: 1.6,
    step: 0.2,
  },
  cabinTone: {
    kind: "choice",
    label: "Cabin",
    default: "brass",
    options: ["brass", "oak", "steel", "enamel"],
    names: { brass: "Brass", oak: "Oak", steel: "Steel", enamel: "Enamel" },
  },
});

/**
 * The Fieldline Archive keeps its collections on eight floors and an old
 * endless lift between them: each cabin carries one collection's card.
 */
export function PaternosterCardsDemo({
  chrome = true,
  // The lift is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [landed, setLanded] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const card = defaultPaternosterCards[landed];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Archive · reading floors
      </p>
      <PaternosterCards
        label="Fieldline Archive lift"
        defaultValue={0}
        onValueChange={setLanded}
        held={held}
        onHeldChange={setHeld}
        height={chrome ? 476 : 532}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{held ? "held" : "landing"}</span> ·
          floor {landed + 1} of {defaultPaternosterCards.length} ·{" "}
          {card?.title.toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
