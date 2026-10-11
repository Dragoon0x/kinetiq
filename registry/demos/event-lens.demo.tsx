"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { EventLens } from "@/registry/ui/event-lens";

export const tweaks = defineTweaks({
  mass: {
    kind: "range",
    label: "Mass",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  disk: {
    kind: "range",
    label: "Disc",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Story = "rest" | "held" | "drift";

/**
 * Waylight Attention's hero: the headline sits on the house grid and a dark
 * mass rests at its end, bending the last words into a ring.
 */
export function EventLensDemo({
  chrome = true,
  // The mass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>("rest");

  const hero = (
    <div className="relative w-full">
      <EventLens
        headline="Everything bends toward what matters."
        subline={
          chrome
            ? "Waylight weighs every signal, so the heavy ones pull focus."
            : undefined
        }
        onHoldChange={(held) => setStory(held ? "held" : "drift")}
        onRest={() => setStory("rest")}
        label="Waylight's mass: drag it over the headline"
        className={cn("w-full rounded-3", chrome ? "h-64" : "h-52")}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 z-40 rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Waylight · Attention
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story === "held" ? (
          <>
            <span className="text-signal">held</span> · drag it across the words
          </>
        ) : story === "drift" ? (
          <>
            <span className="text-signal">drifting home</span> · let it settle
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · drag the mass
          </>
        )}
      </p>
    </div>
  );
}
