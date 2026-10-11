"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PegMigration,
  defaultPegPictures,
  type PegPicture,
} from "@/registry/ui/peg-migration";

export const tweaks = defineTweaks({
  pitch: {
    kind: "range",
    label: "Pitch",
    default: 13,
    min: 9,
    max: 21,
    step: 1,
    unit: "px",
  },
  hopSpeed: {
    kind: "range",
    label: "Hop speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PICTURES: PegPicture[] = [
  { alt: "OPEN in amber pegs", text: "OPEN", color: 1 },
  ...defaultPegPictures.slice(1),
];

const NAMES = ["open", "koi", "moon", "tulip"];

/**
 * The stall sign at the Coldbrook Night Market: a backlit pegboard that says
 * OPEN, then turns itself into a koi, the moon and a tulip.
 */
export function PegMigrationDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);

  const board = (
    <PegMigration
      label="Coldbrook Night Market sign"
      images={PICTURES}
      value={index}
      onValueChange={setIndex}
      sound={sound}
      className="aspect-auto h-[200px]"
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{board}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          picture {index + 1} of {PICTURES.length}
        </span>
        {" · "}
        {NAMES[index]} · click the board or press → for the next
      </p>
    </div>
  );
}
