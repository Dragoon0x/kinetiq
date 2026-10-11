"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LanternRise } from "@/registry/ui/lantern-rise";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 18,
    min: 6,
    max: 40,
    step: 2,
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const WISHES = [
  "Safe roads home",
  "A garden by June",
  "More long lunches",
  "Rain for the orchard",
  "Mum's knee heals",
  "Pass the exam",
  "A dog named Biscuit",
  "One more summer here",
];

/**
 * Waylight's night market page: the lantern evening at the river steps, with
 * wishes from the guest book carried up into the dark.
 */
export function LanternRiseDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [wish, setWish] = React.useState<string | null | undefined>(undefined);
  const count = values.count ?? 18;

  const sky = (
    <LanternRise
      wishes={WISHES}
      onRelease={setWish}
      className={cn("w-full rounded-3", chrome ? "h-56" : "h-52")}
      {...values}
    >
      <div className="flex h-full flex-col justify-between p-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-white/60 uppercase">
            Waylight · Night market
          </p>
          <p className="text-xl leading-tight font-semibold tracking-tight text-white">
            Lantern night
          </p>
          <p className="text-xs text-white/70">Saturday at the river steps</p>
        </div>
      </div>
    </LanternRise>
  );

  if (!chrome) return <div className="flex w-full">{sky}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {wish === undefined ? (
          <>
            <span className="text-signal">{count} aloft</span> · click the sky
            to release one
          </>
        ) : (
          <>
            <span className="text-signal">released</span>
            {wish ? ` · “${wish}”` : " · a plain lantern"}
          </>
        )}
      </p>
    </div>
  );
}
