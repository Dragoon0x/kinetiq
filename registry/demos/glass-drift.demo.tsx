"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlassDrift } from "@/registry/ui/glass-drift";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Shards",
    default: 14,
    min: 4,
    max: 28,
    step: 2,
  },
  refraction: {
    kind: "range",
    label: "Refraction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "lagoon",
    options: ["lagoon", "dawn", "orchid", "mono"],
    names: { lagoon: "Lagoon", dawn: "Dawn", orchid: "Orchid", mono: "Mono" },
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Glass opening its studio: the hero sits over the studio's own
 * offcuts, drifting through coloured light.
 */
export function GlassDriftDemo({
  chrome = true,
  // The glass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [parting, setParting] = React.useState(false);
  const count = values.count ?? 14;
  const palette = values.palette ?? "lagoon";

  const glass = (
    <GlassDrift
      onActiveChange={setParting}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Glass
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, cut into pieces
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Open studio, Thursdays from noon
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Visit the studio
              </button>
            </>
          ) : null}
        </div>
      </div>
    </GlassDrift>
  );

  if (!chrome) return <div className="flex w-full">{glass}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {glass}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {parting ? (
          <>
            <span className="text-signal">parting</span> · the glass makes room
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {count} shards,{" "}
            {palette}
          </>
        )}
      </p>
    </div>
  );
}
