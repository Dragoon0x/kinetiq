"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlumbCursor, type PlumbState } from "@/registry/ui/plumb-cursor";

export const tweaks = defineTweaks({
  length: {
    kind: "range",
    label: "Length",
    default: 84,
    min: 40,
    max: 140,
    step: 4,
    unit: "px",
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
  },
  weight: {
    kind: "range",
    label: "Weight",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
});

/**
 * Gaugeworks' Line 4 plumb set on a product card: the bob itself hangs over
 * the page, from the cursor, a finger, or the control in focus.
 */
export function PlumbCursorDemo({
  chrome = true,
  // The bob is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<PlumbState>("resting");
  const [ordered, setOrdered] = React.useState(false);
  const length = values.length ?? tweaks.length.default;

  const card = (
    <PlumbCursor
      onStateChange={setState}
      className="w-full overflow-clip rounded-3 border border-hairline bg-card"
      {...values}
    >
      <div
        className="flex flex-col justify-between gap-4 p-5"
        style={{ height: chrome ? 236 : 208 }}
      >
        <div className="flex max-w-[64%] flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks · tools
          </p>
          <p className="text-base leading-snug font-medium text-foreground">
            Line 4 plumb set
          </p>
          <p className="text-xs leading-relaxed text-ink-2">
            Turned brass, a braided line, and a reel that pays out true.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOrdered(true)}
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {ordered ? "In your basket" : "Order · 48"}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Spec sheet
          </button>
        </div>
      </div>
    </PlumbCursor>
  );

  if (!chrome) return <div className="flex w-full">{card}</div>;

  const drop = Math.round(length * 1.6);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "dropped" ? (
          <>
            <span className="text-signal">dropped</span> · to {drop} px of line
          </>
        ) : state === "orbiting" ? (
          <>
            <span className="text-signal">orbiting</span> · round the cursor
          </>
        ) : state === "swinging" ? (
          <>
            <span className="text-signal">swinging</span> · settling to true
          </>
        ) : state === "true" ? (
          <>
            <span className="text-signal">dead vertical</span> · 0.0°
          </>
        ) : (
          <>
            <span className="text-signal">on its nail</span> · hold it over the
            card
          </>
        )}
      </p>
    </div>
  );
}
