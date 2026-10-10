"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CompassField,
  type CompassFieldHandle,
} from "@/registry/ui/compass-field";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 4,
    min: 2,
    max: 7,
    step: 0.5,
  },
  length: {
    kind: "range",
    label: "Length",
    default: 0.7,
    min: 0.3,
    max: 0.95,
    step: 0.05,
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.45,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline's orienteering kit: a band of compass needles behind the offer,
 * every one of them turning to find the visitor's hand.
 */
export function CompassFieldDemo({
  chrome = true,
  // The needles are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const field = React.useRef<CompassFieldHandle | null>(null);
  const [held, setHeld] = React.useState(false);
  const [lit, setLit] = React.useState<string | null>(null);

  // A damping change shows itself at once: one gust through the field, so
  // the new wobble is seen without waiting for a hand.
  const damping = values.damping ?? tweaks.damping.default;
  const shownDamping = React.useRef(damping);
  React.useEffect(() => {
    if (shownDamping.current === damping) return;
    shownDamping.current = damping;
    field.current?.swing();
  }, [damping]);

  const scene = (
    <div
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHeld(true);
      }}
      onPointerLeave={() => setHeld(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) {
          setLit(event.target.textContent ?? null);
        }
      }}
      onBlur={() => setLit(null)}
      className="w-full"
    >
      <CompassField
        ref={field}
        className="h-52 w-full rounded-3 border border-hairline bg-card"
        {...values}
      >
        <div className="absolute bottom-3 left-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-2 border border-hairline bg-card p-3 shadow-[0_10px_30px_-18px_color-mix(in_oklab,black_60%,transparent)]">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · orienteering kit
          </p>
          <p className="text-base leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Find your bearing.
          </p>
          <button
            type="button"
            className="inline-flex h-8 w-fit items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Order the kit
          </button>
        </div>
      </CompassField>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lit ? (
          <>
            <span className="text-signal">pointing at</span> · {lit}
          </>
        ) : held ? (
          <>
            <span className="text-signal">turning to you</span> · the wave
            follows your hand
          </>
        ) : (
          <>
            <span className="text-signal">needles at north</span> · move across
            the field, or tab to it
          </>
        )}
      </p>
    </div>
  );
}
