"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShadowBox } from "@/registry/ui/shadow-box";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 56,
    min: 16,
    max: 120,
    step: 4,
    unit: "px",
  },
  layers: {
    kind: "range",
    label: "Layers",
    default: 5,
    min: 2,
    max: 7,
    step: 1,
  },
  light: {
    kind: "choice",
    label: "Light",
    default: "top",
    options: ["top", "left", "right"],
    names: { top: "Top", left: "Left", right: "Right" },
  },
  palette: {
    kind: "choice",
    label: "Paper",
    default: "dusk",
    options: ["dusk", "fern", "snow", "ember"],
    names: { dusk: "Dusk", fern: "Fern", snow: "Snow", ember: "Ember" },
  },
});

const WORDS = ["Two", "Three", "Four", "Five", "Six", "Seven"];

/**
 * Waylight Paper Co.'s shop: a cut-paper shadow box on its product card,
 * deep enough to look into.
 */
export function ShadowBoxDemo({
  chrome = true,
  // The box is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focused, setFocused] = React.useState(false);

  if (!chrome) {
    return (
      <div className="flex w-full justify-center">
        <ShadowBox
          title="Night fern trail"
          className="aspect-[5/4] w-[250px] max-w-full"
          {...values}
        />
      </div>
    );
  }

  const layers = values.layers ?? tweaks.layers.default;
  const depth = values.depth ?? tweaks.depth.default;
  const light = values.light ?? tweaks.light.default;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div
        className="flex flex-col items-center gap-3 rounded-3 border border-hairline bg-card p-4"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <ShadowBox
          title="Night fern trail"
          className="aspect-[5/4] w-full max-w-[260px]"
          {...values}
        />
        <div className="flex w-full flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Waylight Paper Co.
            </p>
            <p className="text-sm font-medium text-foreground">
              Night fern trail
            </p>
            <p className="text-xs text-ink-2">
              {WORDS[layers - 2] ?? layers} hand-cut layers · {depth} mm deep
            </p>
          </div>
          <p className="font-mono text-sm text-foreground tabular-nums">€84</p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">light from the {light}</span> ·{" "}
        {focused ? "arrows tilt, home levels" : "tilt to look inside"}
      </p>
    </div>
  );
}
