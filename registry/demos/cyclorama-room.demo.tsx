"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CycloramaRoom,
  defaultCycloramaItems,
} from "@/registry/ui/cyclorama-room";

export const tweaks = defineTweaks({
  curvature: {
    kind: "range",
    label: "Curvature",
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
  },
  fov: {
    kind: "range",
    label: "Field of view",
    default: 75,
    min: 50,
    max: 110,
    step: 5,
    unit: "°",
  },
  rail: { kind: "toggle", label: "Rail", default: true },
});

/**
 * The round room at an invented studio, Fieldline Studios: six painted
 * scenes stitched into one panorama, a day from dawn to night.
 */
export function CycloramaRoomDemo({
  chrome = true,
  // The room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [front, setFront] = React.useState(0);
  const [open, setOpen] = React.useState<number | null>(null);

  const room = (
    <CycloramaRoom
      onFrontChange={setFront}
      onOpen={setOpen}
      label="Fieldline Studios round room"
      className={
        chrome
          ? "h-64 w-full rounded-4 border border-hairline"
          : "h-52 w-full rounded-4"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{room}</div>;

  const shown = defaultCycloramaItems[open ?? front];
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">The round room</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Studios · drag to look round
        </p>
      </div>
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {open !== null ? "up close" : "facing"}
        </span>{" "}
        · {shown?.caption?.toLowerCase()}
        {open === null
          ? ` · ${front + 1} of ${defaultCycloramaItems.length}`
          : ""}
      </p>
    </div>
  );
}
