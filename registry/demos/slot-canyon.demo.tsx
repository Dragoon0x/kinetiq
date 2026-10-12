"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlotCanyon } from "@/registry/ui/slot-canyon";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  width: {
    kind: "range",
    label: "Width",
    default: 1,
    min: 0.6,
    max: 1.4,
    step: 0.05,
  },
  shafts: {
    kind: "range",
    label: "Light shafts",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pointer-events-none flex size-full flex-col justify-end gap-1 p-4 sm:p-6">
      <p className="font-mono text-[10px] tracking-[0.08em] text-[oklch(0.95_0.03_80)] uppercase [text-shadow:0_1px_8px_oklch(0.2_0.04_40/0.6)]">
        Coldbrook Outfitters · Spring routes
      </p>
      <p
        className={
          compact
            ? "text-2xl leading-tight font-semibold text-[oklch(0.99_0.01_80)] [text-shadow:0_2px_16px_oklch(0.2_0.05_40/0.55)]"
            : "text-3xl leading-tight font-semibold text-[oklch(0.99_0.01_80)] [text-shadow:0_2px_16px_oklch(0.2_0.05_40/0.55)] sm:text-4xl"
        }
      >
        Go narrow.
      </p>
    </div>
  );
}

/**
 * Coldbrook Outfitters: the spring routes hero, a flight down a slot canyon
 * behind the headline.
 */
export function SlotCanyonDemo({
  chrome = true,
  // The flight is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [paused, setPaused] = React.useState(false);
  const speed = values.speed ?? tweaks.speed.default;
  const shafts = values.shafts ?? tweaks.shafts.default;

  if (!chrome) {
    return (
      <div className="relative flex h-[232px] w-full">
        <SlotCanyon label="Coldbrook spring routes" {...values}>
          <Hero compact />
        </SlotCanyon>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="h-[220px] w-full overflow-clip rounded-4 sm:h-[300px]">
        <SlotCanyon
          label="Coldbrook spring routes"
          paused={paused}
          onPausedChange={setPaused}
          {...values}
        >
          <Hero />
        </SlotCanyon>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {!motionSafe
            ? "a still frame"
            : paused || speed === 0
              ? "holding still"
              : "flying"}
        </span>{" "}
        · speed {speed.toFixed(2)} · shafts {shafts.toFixed(2)} · space to{" "}
        {paused ? "fly on" : "pause"}
      </p>
    </div>
  );
}
