"use client";

import * as React from "react";

import { Leaf } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TurnoverCard } from "@/registry/ui/turnover-card";

export const tweaks = defineTweaks({
  axis: {
    kind: "choice",
    label: "Axis",
    default: "y",
    options: ["y", "x"],
    names: { y: "Y axis", x: "X axis" },
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 360,
    min: 120,
    max: 900,
    step: 20,
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** A barcode from a fixed list of widths: the same bars on every load. */
const BARS = [
  2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 2, 1, 3,
  1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1,
];

function Barcode() {
  let x = 0;
  let d = "";
  BARS.forEach((w, i) => {
    if (i % 2 === 0) d += `M${x} 0h${w}v28h-${w}Z`;
    x += w;
  });
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${x} 28`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      shapeRendering="crispEdges"
    >
      <path d={d} className="fill-foreground" />
    </svg>
  );
}

/**
 * A Fernworks membership card: the member's name on the front, the barcode
 * the door scans on the back.
 */
export function TurnoverCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [flipped, setFlipped] = React.useState(false);

  const card = (
    <TurnoverCard
      label="Fernworks membership card"
      flipped={flipped}
      onFlippedChange={setFlipped}
      sound={sound}
      className="self-center"
      front={
        <div
          className="flex size-full flex-col justify-between p-4"
          style={{
            background:
              "linear-gradient(140deg, oklch(0.46 0.09 152), oklch(0.31 0.06 162))",
            color: "oklch(0.97 0.02 150)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
              Fernworks
            </span>
            <Leaf aria-hidden className="size-4 shrink-0 opacity-90" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase opacity-75">
              Member
            </p>
            <p className="truncate text-lg leading-tight font-semibold">
              Mara Ellis
            </p>
            <p className="truncate font-mono text-[10px] tracking-[0.08em] uppercase opacity-80">
              Grove tier · since 2021
            </p>
          </div>
        </div>
      }
      back={
        <div className="flex size-full flex-col justify-between gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
              Member no.
            </span>
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Valid 12/27
            </span>
          </div>
          <Barcode />
          <p className="truncate font-mono text-sm tracking-[0.18em] text-foreground tabular-nums">
            FW 4471 2208 93
          </p>
        </div>
      }
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{flipped ? "back" : "front"}</span>
        {flipped
          ? " · member number showing"
          : " · drag, or press space, to flip"}
      </p>
    </div>
  );
}
