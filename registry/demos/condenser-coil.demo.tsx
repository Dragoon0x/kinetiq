"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CondenserCoil } from "@/registry/ui/condenser-coil";

export const tweaks = defineTweaks({
  flow: {
    kind: "range",
    label: "Flow",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bubbles: {
    kind: "range",
    label: "Bubbles",
    default: 14,
    min: 0,
    max: 40,
    step: 2,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 205,
    min: 0,
    max: 360,
    step: 5,
    unit: "°",
  },
});

/**
 * Coldbrook's cold-drip tower: coffee light runs through the glass coil, and
 * a click on the glass sends one bright slug the whole way down.
 */
export function CondenserCoilDemo({
  chrome = true,
  // The coil is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [running, setRunning] = React.useState(0);
  const [through, setThrough] = React.useState(0);

  const coil = (
    <CondenserCoil
      onSend={() => setRunning((n) => n + 1)}
      onArrive={(count) => {
        setThrough(count);
        setRunning((n) => Math.max(0, n - 1));
      }}
      className={
        chrome
          ? "h-56 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3">
        <p className="rounded-2 border border-hairline bg-background/80 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
          Coldbrook · cold drip
        </p>
      </div>
    </CondenserCoil>
  );

  if (!chrome) return <div className="flex w-full">{coil}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Twelve hours through glass
        </p>
        <p className="text-xs text-ink-3">Click the coil to send a slug.</p>
      </div>
      {coil}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {running > 0 ? "slug in the coil" : "coil running"}
        </span>{" "}
        · {through === 1 ? "1 slug through" : `${through} slugs through`}
      </p>
    </div>
  );
}
