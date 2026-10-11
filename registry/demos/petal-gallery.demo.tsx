"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultPetalItems, PetalGallery } from "@/registry/ui/petal-gallery";

export const tweaks = defineTweaks({
  petalCount: {
    kind: "range",
    label: "Petals",
    default: 9,
    min: 5,
    max: 12,
    step: 1,
  },
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bloomSpeed: {
    kind: "range",
    label: "Bloom speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
});

/**
 * The Fernworks garden journal for late summer: a dozen photographs from
 * the beds, chosen one at a time.
 */
export function PetalGalleryDemo({
  chrome = true,
  // The bloom is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [chosen, setChosen] = React.useState<number | null>(null);
  const petals = values.petalCount ?? tweaks.petalCount.default;
  const pick = chosen === null ? undefined : defaultPetalItems[chosen];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks journal · late summer
      </p>
      <PetalGallery
        label="Late summer photographs"
        value={chosen}
        onValueChange={setChosen}
        height={chrome ? 440 : 520}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {pick ? (
            <>
              <span className="text-signal">closed on</span> ·{" "}
              {(pick.caption ?? pick.alt).toLowerCase()} · esc opens
            </>
          ) : (
            <>
              <span className="text-signal">bloom open</span> · {petals} petals
              · choose one
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
