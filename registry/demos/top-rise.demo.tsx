"use client";

import * as React from "react";

import { TopRise } from "@/registry/ui/top-rise";

const PARAGRAPHS = [
  "The third season of the Fernworks footbridge opened a week late. The delay was the anchor blocks, not the deck.",
  "Both banks were re-poured in February. The east block took the cold badly and had to be broken out and set again, which cost nine days.",
  "Deck boards are the same larch as the first season, cut from the same lot, and they have moved about a millimetre less than the survey allowed for.",
  "The handrail tension is read every fortnight. Readings sit between 4.2 and 4.6 kilonewtons and have not drifted since the second week.",
  "Foot traffic runs about 300 crossings a day in summer, half that once the light goes. Nothing in the counts suggests the deck is loading unevenly.",
  "Winter work is limited to the drainage channel under the east approach, which silts up faster than the west and is cleared by hand.",
  "The next full inspection is booked for the spring, before the path reopens to the campsite.",
];

export function TopRiseDemo() {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [depth, setDepth] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* The control lives outside the scroller in a relative wrapper: an
          absolute child of a scroll container would scroll away with the text. */}
      <div className="relative">
        <div
          ref={frameRef}
          className="h-[280px] w-full overflow-y-auto rounded-3 border border-hairline bg-surface-1 p-4"
        >
          <p className="text-label text-ink-3">Fernworks</p>
          <h4 className="mt-1 text-sm font-semibold text-foreground">
            Footbridge, third season
          </h4>
          {PARAGRAPHS.map((line) => (
            <p key={line} className="mt-3 text-xs leading-5 text-ink-2">
              {line}
            </p>
          ))}
        </div>

        <TopRise
          container={frameRef}
          threshold={120}
          onDepthChange={setDepth}
          className="absolute right-3 bottom-3"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Depth <span className="text-signal tabular-nums">{depth}%</span>
      </p>
    </div>
  );
}
