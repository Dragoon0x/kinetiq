"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { FloatField } from "@/registry/ui/float-field";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 220,
    min: 40,
    max: 600,
    step: 20,
  },
  rise: {
    kind: "range",
    label: "Rise",
    default: 24,
    min: 0,
    max: 80,
    step: 4,
    unit: "px/s",
  },
  repel: {
    kind: "range",
    label: "Repel",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Sparkling: a spring water that comes up already fizzing, sold on
 * a hero where the bubbles rise behind the words and part around your hand.
 */
export function FloatFieldDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bursts, setBursts] = React.useState(0);
  const [near, setNear] = React.useState(false);
  const count = values.count ?? 220;
  const rise = values.rise ?? 24;

  const field = (
    <FloatField
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onBurst={() => setBursts((n) => n + 1)}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-end gap-3 p-5 sm:p-6"
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
      >
        <div className="max-w-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Sparkling
          </p>
          <p className="mt-1 text-xl leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
            Bottled where the spring rises.
          </p>
          {chrome ? (
            <p className="mt-1 text-sm text-ink-2">
              Drawn cold from three hundred metres down, fizzing on its own.
            </p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Find a stockist
          </button>
        </div>
      </div>
    </FloatField>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {bursts > 0 ? (
          <>
            <span className="text-signal">
              {bursts} {bursts === 1 ? "burst" : "bursts"} released
            </span>{" "}
            · press again to send more up
          </>
        ) : near ? (
          <>
            <span className="text-signal">bubble open</span> · the field makes
            way
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {count} motes rising{" "}
            {rise} px/s
          </>
        )}
      </p>
    </div>
  );
}
