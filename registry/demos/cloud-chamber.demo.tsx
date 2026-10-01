"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CloudChamber,
  type CloudChamberPole,
} from "@/registry/ui/cloud-chamber";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  field: {
    kind: "range",
    label: "Field",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "mist",
    options: ["mist", "ember", "aqua"],
    names: { mist: "Mist", ember: "Ember", aqua: "Aqua" },
  },
});

/**
 * Gaugeworks Lab's particle week: the lab's own chamber behind the notice,
 * with a magnet in the visitor's hand.
 */
export function CloudChamberDemo({
  chrome = true,
  // The chamber is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pole, setPole] = React.useState<CloudChamberPole>("north");
  const [flipped, setFlipped] = React.useState(false);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <CloudChamber
        pole={pole}
        onPoleChange={(next) => {
          setPole(next);
          setFlipped(true);
        }}
        className={cn("w-full rounded-3", chrome ? "h-64" : "h-52")}
        {...values}
      >
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-[85%] rounded-3 border border-hairline bg-background/85 px-4 py-3 text-center">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Gaugeworks Lab
            </p>
            <p className="mt-1 text-lg leading-tight font-medium text-foreground">
              Particle week
            </p>
            <p className="mt-1 text-xs text-balance text-ink-2">
              Watch the tracks, then bring a magnet
            </p>
          </div>
        </div>
      </CloudChamber>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{pole} pole</span> ·{" "}
          {flipped
            ? "tracks curl the other way now"
            : "hover to bend the tracks, click to flip"}
        </p>
      ) : null}
    </div>
  );
}
