"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AgateSlice } from "@/registry/ui/agate-slice";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "carnelian",
    options: ["lace", "carnelian", "moss", "botswana"],
    names: {
      lace: "Lace",
      carnelian: "Carnelian",
      moss: "Moss",
      botswana: "Botswana",
    },
  },
  translucency: {
    kind: "range",
    label: "Translucency",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const STONE: Record<string, string> = {
  lace: "Blue lace agate",
  carnelian: "Carnelian agate",
  moss: "Moss agate",
  botswana: "Banded agate",
};

/**
 * Fieldline Minerals, specimen 112: a thin slice on the light table. Move the
 * lamp behind it, turn it, watch a new band form at the core.
 */
export function AgateSliceDemo({
  chrome = true,
  // The stone is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(0);
  const palette = values.palette ?? tweaks.palette.default;
  const pace = values.pace ?? tweaks.pace.default;

  const slice = (
    <AgateSlice
      angle={angle}
      onAngleChange={setAngle}
      label={`${STONE[palette] ?? "Agate"}, specimen 112`}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {slice}
      </div>
    );
  }

  const every = Math.round((9 + (1.6 - 9) * pace) * 10) / 10;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Minerals · Specimen 112
        </p>
        <p className="text-sm font-medium text-foreground">
          {STONE[palette] ?? "Agate"}, 6 mm slice
        </p>
      </div>
      <div className="w-full self-center" style={{ height: 248 }}>
        {slice}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">turned {angle}°</span> ·{" "}
        {pace === 0 ? "bands held still" : `a new band every ${every} s`}
      </p>
    </div>
  );
}
