"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BookSpines, defaultBookSpinesItems } from "@/registry/ui/book-spines";

export const tweaks = defineTweaks({
  spineWidth: {
    kind: "range",
    label: "Spine",
    default: 22,
    min: 14,
    max: 36,
    step: 1,
    unit: "px",
  },
  lean: {
    kind: "range",
    label: "Lean",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shelf: {
    kind: "choice",
    label: "Shelf",
    default: "oak",
    options: ["oak", "walnut", "slate", "glass"],
    names: { oak: "Oak", walnut: "Walnut", slate: "Slate", glass: "Glass" },
  },
});

/**
 * Waylight Press, the autumn list: twelve photo books on one shelf, each
 * jacket wrapped round its spine.
 */
export function BookSpinesDemo({
  chrome = true,
  // The shelf is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // One book starts out held open, so the shelf shows its turn and the
  // lean of its neighbours before anyone reaches for it.
  const [held, setHeld] = React.useState<number | null>(4);
  const items = defaultBookSpinesItems;

  const shelf = (
    <BookSpines
      items={items}
      value={held}
      onValueChange={setHeld}
      label="Waylight Press, autumn list"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {shelf}
      </div>
    );
  }

  const book = held === null ? null : items[held];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Press · autumn list
        </p>
        <p className="text-sm font-medium text-foreground">
          Twenty photo books
        </p>
      </div>
      <div className="w-full" style={{ height: 224 }}>
        {shelf}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {book && held !== null ? (
          <>
            <span className="text-signal">held open</span> · {held + 1} of{" "}
            {items.length} · {book.caption ?? book.alt}
          </>
        ) : (
          <>
            <span className="text-signal">shelf</span> · {items.length} books,
            rest on a spine to open
          </>
        )}
      </p>
    </div>
  );
}
