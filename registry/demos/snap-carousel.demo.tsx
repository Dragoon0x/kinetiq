"use client";

import * as React from "react";

import { SnapCarousel } from "@/registry/ui/snap-carousel";

const FEATURES = [
  {
    id: "sweep",
    title: "Twin sweep",
    body: "Cold pass, then working temperature. The drift between them is the record.",
    bars: [3, 6, 4, 8, 5, 7],
  },
  {
    id: "clamps",
    title: "Paired clamps",
    body: "Torque goes on in pairs so the plate never loads on one side alone.",
    bars: [7, 4, 6, 3, 8, 5],
  },
  {
    id: "sheet",
    title: "Travelling sheet",
    body: "Every rail carries its own figures from the bench to the depot door.",
    bars: [4, 8, 3, 7, 6, 4],
  },
  {
    id: "handover",
    title: "Depot handover",
    body: "The run leaves as one crate and is signed for on its numbers.",
    bars: [6, 3, 8, 5, 4, 7],
  },
];

export function SnapCarouselDemo() {
  const [index, setIndex] = React.useState(0);

  const slides = FEATURES.map((feature) => ({
    id: feature.id,
    content: (
      <article className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <div
          aria-hidden
          className="flex h-20 items-end gap-1.5 rounded-2 bg-cobalt-wash px-3 pb-3"
        >
          {feature.bars.map((bar, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-cobalt-bright"
              style={{ height: `${bar * 10}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">
            {feature.title}
          </h4>
          <p className="text-xs leading-5 text-muted-foreground">
            {feature.body}
          </p>
        </div>
      </article>
    ),
  }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SnapCarousel
        slides={slides}
        autoplay={4000}
        label="Fernworks season kit"
        onIndexChange={setIndex}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Slide{" "}
        <span className="text-signal tabular-nums">
          {index + 1} / {FEATURES.length}
        </span>
      </p>
    </div>
  );
}
