"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AmbientSpill,
  defaultAmbientSpillItems,
} from "@/registry/ui/ambient-spill";

export const tweaks = defineTweaks({
  spill: {
    kind: "range",
    label: "Spill",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  roomTone: {
    kind: "choice",
    label: "Room",
    default: "night",
    options: ["night", "ash", "plum", "paper"],
    names: { night: "Night", ash: "Ash", plum: "Plum", paper: "Paper" },
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 1,
    min: 0.7,
    max: 1.4,
    step: 0.05,
  },
});

/**
 * Waylight, tonight in the lounge: six ambient programmes, and the one at the
 * front lights the room in its own colour.
 */
export function AmbientSpillDemo({
  chrome = true,
  // The room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [front, setFront] = React.useState(1);
  const [opened, setOpened] = React.useState<number | null>(null);
  const items = defaultAmbientSpillItems;

  const room = (
    <AmbientSpill
      value={front}
      onValueChange={(i) => {
        setFront(i);
        setOpened(null);
      }}
      onOpen={setOpened}
      label="Waylight, tonight in the lounge"
      className="h-full"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 548 }}>
        {room}
      </div>
    );
  }

  const it = items[front];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight · the lounge
        </p>
        <p className="text-sm font-medium text-foreground">
          Tonight, six programmes
        </p>
      </div>
      <div className="w-full" style={{ height: 400 }}>
        {room}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {opened === front ? "playing" : `${front + 1} of ${items.length}`}
        </span>{" "}
        · {(it?.caption ?? "").toLowerCase()} ·{" "}
        {(it?.meta ?? "").split("· ")[1] ?? ""}
      </p>
    </div>
  );
}
