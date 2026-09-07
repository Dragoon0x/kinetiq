"use client";

import * as React from "react";

import { GrabPan } from "@/registry/ui/grab-pan";

const ROOMS = [
  { name: "Intake", x: 40, y: 40, w: 320, h: 220 },
  { name: "Bench 1", x: 400, y: 40, w: 260, h: 100 },
  { name: "Bench 2", x: 400, y: 160, w: 260, h: 100 },
  { name: "Cold store", x: 700, y: 40, w: 300, h: 220 },
  { name: "Sweep bay", x: 40, y: 300, w: 320, h: 220 },
  { name: "Crate line", x: 400, y: 300, w: 380, h: 160 },
  { name: "Dock 3", x: 820, y: 300, w: 300, h: 220 },
  { name: "Office", x: 40, y: 560, w: 240, h: 200 },
  { name: "Yard gate", x: 320, y: 560, w: 300, h: 200 },
  { name: "Plant", x: 660, y: 560, w: 460, h: 200 },
];

const GRID = {
  backgroundImage:
    "linear-gradient(to right, var(--hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
};

export function GrabPanDemo() {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GrabPan
        width={1200}
        height={800}
        viewportHeight={280}
        label="Basinworks depot floor"
        onOffsetChange={setOffset}
      >
        <div className="relative size-full bg-surface-0" style={GRID}>
          {ROOMS.map((room) => (
            <div
              key={room.name}
              className="absolute flex flex-col justify-end rounded-2 border border-hairline-strong bg-surface-1/80 p-2"
              style={{
                left: room.x,
                top: room.y,
                width: room.w,
                height: room.h,
              }}
            >
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
                {room.name}
              </span>
            </div>
          ))}
        </div>
      </GrabPan>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Offset{" "}
        <span className="text-signal tabular-nums">
          {offset.x} / {offset.y}
        </span>
      </p>
    </div>
  );
}
