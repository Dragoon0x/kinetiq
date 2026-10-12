"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ZelligeWall } from "@/registry/ui/zellige-wall";

export const tweaks = defineTweaks({
  tile: {
    kind: "range",
    label: "Tile",
    default: 14,
    min: 8,
    max: 28,
    step: 2,
    unit: "px",
  },
  glaze: {
    kind: "range",
    label: "Glaze",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 18,
    min: 0,
    max: 35,
    step: 1,
    unit: "°",
  },
});

const side = (x: number) => (x < 0.36 ? "left" : x > 0.64 ? "right" : "centre");

/**
 * Basinworks Tile Co.: the Courtyard panel, a picture set by hand in glazed
 * tiles. Pass a hand over it to see the glaze; click to send a ripple.
 */
export function ZelligeWallDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [last, setLast] = React.useState<string | null>(null);
  const tile = values.tile ?? tweaks.tile.default;
  const glaze = values.glaze ?? tweaks.glaze.default;

  if (!chrome) {
    return (
      <div className="relative flex h-[232px] w-full">
        <ZelligeWall label="Courtyard panel in glazed tile" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Tile Co.
          </p>
          <p className="text-base font-medium text-foreground">
            Courtyard, hand-cut
          </p>
        </div>
        <p className="text-xs text-ink-3">Set by hand, one tile at a time.</p>
      </div>
      <div className="h-[200px] w-full sm:h-[260px]">
        <ZelligeWall
          label="Courtyard panel in glazed tile"
          onRipple={(o) => setLast(side(o.x))}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {last ? `ripple sent · ${last}` : "hover to tilt · click to ripple"}
        </span>{" "}
        · tile {tile} px · glaze {glaze.toFixed(2)}
      </p>
    </div>
  );
}
