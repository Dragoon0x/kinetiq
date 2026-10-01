"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WishTag } from "@/registry/ui/wish-tag";

export const tweaks = defineTweaks({
  swing: {
    kind: "range",
    label: "Swing",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  price: {
    kind: "range",
    label: "Price",
    default: 129,
    min: 9,
    max: 1209,
    step: 10,
  },
  count: {
    kind: "range",
    label: "Already saved",
    default: 12,
    min: 0,
    max: 96,
    step: 1,
  },
});

/**
 * A Fernworks product row: save the boot to a wish list and the tag hangs
 * the price you will watch.
 */
export function WishTagDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [saved, setSaved] = React.useState(false);
  const price = values.price ?? 129;
  const count = values.count ?? 12;
  const total = count + (saved ? 1 : 0);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-xs flex-col items-start gap-2 self-center rounded-3 border border-hairline bg-card p-4">
        <div className="w-full min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Ridgeline trail boot
          </p>
          <p className="truncate text-xs text-ink-3">Fernworks · Moss · UK 9</p>
        </div>
        <WishTag
          pressed={saved}
          onPressedChange={setSaved}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {saved ? (
            <>
              <span className="text-signal">on your list</span> · {total} saved
              · £{price} tracked
            </>
          ) : (
            <>
              <span className="text-signal">not on your list</span> · {total}{" "}
              saved
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
