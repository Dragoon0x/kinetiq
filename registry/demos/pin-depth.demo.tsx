"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PinDepth, defaultPinDepthCards } from "@/registry/ui/pin-depth";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 1,
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  shadow: {
    kind: "range",
    label: "Shadow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pinLength: {
    kind: "range",
    label: "Pin length",
    default: 36,
    min: 8,
    max: 64,
    step: 4,
    unit: "px",
  },
});

/**
 * Fieldline Studio's brand refresh, pinned up as a moodboard: six cards on
 * pins of different lengths.
 */
export function PinDepthDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const card = defaultPinDepthCards.find((c) => c.id === open);

  const pinBoard = (
    <PinDepth
      cards={defaultPinDepthCards}
      value={open}
      onValueChange={setOpen}
      label="Fieldline Studio, brand refresh moodboard"
      className="h-full w-full"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 540 }}>
        {pinBoard}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Studio · brand refresh
        </p>
        <p className="text-sm font-medium text-foreground">Moodboard</p>
      </div>
      <div className="w-full" style={{ height: 480 }}>
        {pinBoard}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {card ? (
          <>
            <span className="text-signal">{card.title} close</span> · esc puts
            it back
          </>
        ) : (
          <>
            <span className="text-signal">
              {defaultPinDepthCards.length} cards pinned
            </span>{" "}
            · move to look around, click a card
          </>
        )}
      </p>
    </div>
  );
}
