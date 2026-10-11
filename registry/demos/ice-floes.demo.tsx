"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultIceItems, IceFloes } from "@/registry/ui/ice-floes";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "range",
    label: "Tint",
    default: 215,
    min: 150,
    max: 280,
    step: 5,
    unit: "°",
  },
});

/**
 * The Fieldline Archive's postcards from the ice, 1921–1934, set adrift:
 * glide over the water and lift a floe to read its card.
 */
export function IceFloesDemo({
  chrome = true,
  // The sea is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState<number | null>(null);
  const item = index !== null ? defaultIceItems[index] : undefined;

  const field = (
    <IceFloes
      value={index}
      onValueChange={setIndex}
      label="Postcards from the ice"
      className={
        chrome
          ? "h-[420px] w-full rounded-4 border border-hairline"
          : "h-[540px] w-full rounded-4 border border-hairline"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Postcards from the ice
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Archive · 1921–1934
        </p>
      </div>
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {item ? (
          <>
            <span className="text-signal">lifted</span> ·{" "}
            {(item.caption ?? item.alt).toLowerCase()}
          </>
        ) : (
          <>
            <span className="text-signal">drifting</span> · drag to glide, click
            a floe to read it
          </>
        )}
      </p>
    </div>
  );
}
