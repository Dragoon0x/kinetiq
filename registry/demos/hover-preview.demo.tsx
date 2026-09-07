"use client";

import * as React from "react";

import { HoverPreview } from "@/registry/ui/hover-preview";

const FRAMES = 8;

/** A carriage running the length of a rail. */
const rig = (index: number) => (
  <div className="relative size-full">
    <span className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-hairline-strong" />
    <span
      className="absolute top-1/2 size-3 -translate-y-1/2 rounded-1 bg-cobalt-bright"
      style={{ left: `${10 + (index / (FRAMES - 1)) * 70}%` }}
    />
  </div>
);

/** A needle sweeping a dial, one turn per pass. */
const dial = (index: number) => (
  <div className="relative size-full">
    <span className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong" />
    <span
      className="absolute top-1/2 left-1/2 h-4 w-0.5 rounded-full bg-signal"
      style={{
        transform: `translate(-50%, -100%) rotate(${(index / FRAMES) * 360}deg)`,
        transformOrigin: "50% 100%",
      }}
    />
  </div>
);

/** A bay filling to its mark. */
const bay = (index: number) => (
  <div className="relative size-full">
    <span className="absolute inset-x-4 top-3 bottom-3 rounded-1 border border-hairline-strong" />
    <span
      className="absolute inset-x-4 bottom-3 rounded-1 bg-cobalt-bright/70"
      style={{ height: `${10 + (index / (FRAMES - 1)) * 55}%` }}
    />
  </div>
);

const CARDS = [
  { id: "rig", title: "Fernworks rig", render: rig },
  { id: "line", title: "Coldbrook line", render: dial },
  { id: "bay", title: "Basinworks bay", render: bay },
];

export function HoverPreviewDemo() {
  // Every card that is playing, not just the last one to change: a pinned
  // card keeps playing after the pointer wanders over its neighbours.
  const [playing, setPlaying] = React.useState<string[]>([]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {CARDS.map((card) => (
          <HoverPreview
            key={card.id}
            title={card.title}
            frames={FRAMES}
            duration={2400}
            renderFrame={card.render}
            onPlayingChange={(on) =>
              setPlaying((prev) => {
                const rest = prev.filter((title) => title !== card.title);
                return on ? [...rest, card.title] : rest;
              })
            }
          />
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Playing{" "}
        <span className="text-signal">
          {playing.length ? playing.join(", ") : "nothing"}
        </span>
      </p>
    </div>
  );
}
