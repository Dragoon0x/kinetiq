"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  RATIO_MORPH_SETS,
  RatioMorph,
  type RatioMorphFocalPoint,
} from "@/registry/ui/ratio-morph";

export const tweaks = defineTweaks({
  ratios: {
    kind: "choice",
    label: "Ratios",
    default: "social",
    options: ["social", "photo", "screen"],
    names: { social: "Social", photo: "Photo", screen: "Screen" },
  },
  brackets: {
    kind: "range",
    label: "Brackets",
    default: 16,
    min: 8,
    max: 32,
    step: 4,
    unit: "px",
  },
  focal: { kind: "toggle", label: "Focal point", default: true },
  grid: { kind: "toggle", label: "Grid", default: false },
});

const shapeOf = (ratio: string) => {
  const [w = 1, h = 1] = ratio.split(":").map(Number);
  return w === h ? "square" : w > h ? "landscape" : "portrait";
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The cover image of a Fieldline post, with its focal point already on the
 * lighthouse: switch shapes and the lighthouse stays in the frame; drag or
 * tap the picture to choose something else to keep.
 */
export function RatioMorphDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const set = RATIO_MORPH_SETS[values.ratios ?? "social"];
  const [ratio, setRatio] = React.useState("4:5");
  const [focus, setFocus] = React.useState<RatioMorphFocalPoint>({
    x: 0.25,
    y: 0.54,
  });
  // A new set may not have the shape that was chosen: the first one stands in.
  const shown = set.includes(ratio) ? ratio : (set[0] ?? "1:1");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RatioMorph
        label="Cover shape"
        value={shown}
        onValueChange={setRatio}
        focalPoint={focus}
        onFocalPointChange={setFocus}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shown} {shapeOf(shown)}
          </span>{" "}
          · focus {pct(focus.x)} across, {pct(focus.y)} down
        </p>
      ) : null}
    </div>
  );
}
