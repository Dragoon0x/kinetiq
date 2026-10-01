"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PunchCard } from "@/registry/ui/punch-card";

export const tweaks = defineTweaks({
  holes: {
    kind: "range",
    label: "Holes",
    default: 9,
    min: 6,
    max: 12,
    step: 1,
  },
  shape: {
    kind: "choice",
    label: "Shape",
    default: "round",
    options: ["round", "star", "heart"],
    names: { round: "Round", star: "Star", heart: "Heart" },
  },
  chad: { kind: "toggle", label: "Chad", default: true },
});

/**
 * A Coldbrook Coffee loyalty card, two coffees short of a free one: punch
 * it, redeem it, start again.
 */
export function PunchCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const total = values.holes ?? 9;
  const [punched, setPunched] = React.useState(Math.max(0, total - 3));
  const [redeemed, setRedeemed] = React.useState(0);
  const count = Math.min(punched, total);
  const left = total - count;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <PunchCard
        brand="Coldbrook Coffee"
        member="Ari Lund"
        number="0417"
        reward="One free drink"
        value={count}
        onValueChange={setPunched}
        onRedeem={() => setRedeemed((n) => n + 1)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {left === 0 ? (
            <>
              <span className="text-signal">card full</span> · one free drink
            </>
          ) : count === 0 && redeemed > 0 ? (
            <>
              <span className="text-signal">redeemed</span> · fresh card
            </>
          ) : (
            <>
              <span className="text-signal">
                {count} of {total} punched
              </span>{" "}
              · {left} to the free one
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
