"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AnglePick } from "@/registry/ui/angle-pick";

export const tweaks = defineTweaks({
  snap: {
    kind: "range",
    label: "Snap",
    default: 15,
    min: 5,
    max: 45,
    step: 5,
    unit: "°",
  },
  preview: {
    kind: "choice",
    label: "Preview",
    default: "gradient",
    options: ["gradient", "shadow", "arrow"],
    names: { gradient: "Gradient", shadow: "Shadow", arrow: "Arrow" },
  },
  readout: { kind: "toggle", label: "Readout", default: true },
  range: {
    kind: "choice",
    label: "Range",
    default: "360",
    options: ["360", "180"],
    names: { "360": "Full turn", "180": "Half turn" },
  },
});

const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
const towards = (deg: number) =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/**
 * Fernworks Studio, styling a promo card: the fill's angle, set by turning
 * the dial, typing into the field, or the arrow keys.
 */
export function AnglePickDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(135);
  // What the dial shows for the stored angle under the current range.
  const shown =
    values.range === "180"
      ? Math.max(-90, Math.min(90, angle))
      : ((angle % 360) + 360) % 360;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <AnglePick
        label="Fill angle"
        value={angle}
        onValueChange={setAngle}
        sound={sound}
        className="self-center"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shown < 0 ? `−${-shown}` : shown}°
          </span>{" "}
          · {towards(shown)} · shift snaps to {values.snap ?? 15}°
        </p>
      ) : null}
    </div>
  );
}
