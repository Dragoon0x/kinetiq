"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CelluloidCoil,
  defaultCelluloidFrames,
} from "@/registry/ui/celluloid-coil";

export const tweaks = defineTweaks({
  twist: {
    kind: "range",
    label: "Twist",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  frameGap: {
    kind: "range",
    label: "Frame gap",
    default: 14,
    min: 0,
    max: 40,
    step: 2,
    unit: "px",
  },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Pictures' location reel: the stills from a week of scouting,
 * printed on one strip and left to curl on the light table.
 */
export function CelluloidCoilDemo({
  chrome = true,
  // The reel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [frame, setFrame] = React.useState(3);
  const still = defaultCelluloidFrames[frame];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Pictures · location reel
      </p>
      <CelluloidCoil
        label="Waylight location reel"
        defaultValue={3}
        onValueChange={setFrame}
        height={chrome ? 440 : 520}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            frame {String(frame + 1).padStart(2, "0")}
          </span>{" "}
          of {defaultCelluloidFrames.length} ·{" "}
          {(still?.caption ?? still?.alt ?? "").toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
