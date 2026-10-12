"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultRoomWithinLevels, RoomWithin } from "@/registry/ui/room-within";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 5,
    min: 2,
    max: 6,
    step: 1,
  },
  frame: {
    kind: "choice",
    label: "Frame",
    default: "window",
    options: ["window", "gilt", "mat", "none"],
    names: { window: "Window", gilt: "Gilt", mat: "Mat", none: "None" },
  },
  easing: {
    kind: "choice",
    label: "Easing",
    default: "dwell",
    options: ["linear", "dwell", "snap"],
    names: { linear: "Linear", dwell: "Dwell", snap: "Snap" },
  },
});

/**
 * Fernworks Editions, issue 12: a short illustrated story told as one long
 * zoom — five rooms, each seen through the last one's window.
 */
export function RoomWithinDemo({
  chrome = true,
  // The story is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [level, setLevel] = React.useState(0);
  const depth = Math.min(
    defaultRoomWithinLevels.length,
    Math.max(2, Math.round(values.depth ?? tweaks.depth.default)),
  );
  const at = Math.min(level, depth - 1);
  const item = defaultRoomWithinLevels[at];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <RoomWithin
          label="Five rooms, one window"
          value={at}
          onValueChange={setLevel}
          height={540}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Editions · Issue 12
        </p>
        <p className="text-base font-medium text-foreground">
          Five rooms, one window
        </p>
      </div>
      <RoomWithin
        label="Five rooms, one window"
        value={at}
        onValueChange={setLevel}
        className="h-[380px] sm:h-[440px]"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          level {at + 1} of {depth}
        </span>{" "}
        · {item?.caption ?? ""} ·{" "}
        {at < depth - 1 ? "scroll or page down" : "page up to come back out"}
      </p>
    </div>
  );
}
