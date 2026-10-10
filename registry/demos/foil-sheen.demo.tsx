"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FoilSheen } from "@/registry/ui/foil-sheen";

export const tweaks = defineTweaks({
  tint: {
    kind: "choice",
    label: "Tint",
    default: "gold",
    options: ["gold", "silver", "rose", "bronze"],
    names: { gold: "Gold", silver: "Silver", rose: "Rose", bronze: "Bronze" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2.5,
    step: 0.25,
    unit: "×",
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: 18,
    min: -45,
    max: 45,
    step: 5,
    unit: "°",
  },
});

/**
 * Fernworks Press announcing a limited edition: the title is stamped in
 * foil, and the light runs across it as the page is tilted under a lamp.
 */
export function FoilSheenDemo({
  chrome = true,
  // Foil is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [flash, setFlash] = React.useState(0);
  const tint = values.tint ?? tweaks.tint.default;
  const angle = values.angle ?? tweaks.angle.default;

  const title = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Press · Edition of 200
      </p>
      <FoilSheen
        as="h2"
        sweepKey={flash}
        className="text-[clamp(1.75rem,7cqi,3.25rem)] leading-[1.08] font-semibold tracking-[-0.02em]"
        {...values}
      >
        Pressed in gold leaf.
      </FoilSheen>
      <p className="text-sm text-ink-2">
        Hand-set, foil-stamped, numbered by the press.
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{title}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {title}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{tint} foil</span> · light at {angle}° ·
          move to tilt it
        </p>
        <button
          type="button"
          onClick={() => setFlash((n) => n + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Catch the light
        </button>
      </div>
    </div>
  );
}
