"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CycloneJar, type CycloneJarState } from "@/registry/ui/cyclone-jar";

export const tweaks = defineTweaks({
  swirl: {
    kind: "range",
    label: "Swirl",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  particles: {
    kind: "range",
    label: "Glitter",
    default: 700,
    min: 100,
    max: 1500,
    step: 100,
  },
  glass: {
    kind: "choice",
    label: "Glass",
    default: "clear",
    options: ["clear", "sea", "amber", "smoke"],
    names: { clear: "Clear", sea: "Sea", amber: "Amber", smoke: "Smoke" },
  },
});

const SAY: Record<CycloneJarState, [string, string]> = {
  still: ["still", "drag in circles to swirl"],
  swirling: ["swirling", "a funnel forming down the middle"],
  settling: ["settling", "glitter drifting down"],
};

/**
 * Fieldline Science Kit, No. 7: the vortex jar. Circle a hand over it and
 * watch a funnel pull the glitter down; let go and watch it settle.
 */
export function CycloneJarDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<CycloneJarState>("settling");

  const jar = (
    <CycloneJar
      label="Vortex jar"
      onStateChange={setState}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 556 }}>
        {jar}
      </div>
    );
  }

  const [word, rest] = SAY[state];

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Science Kit · No. 7
        </p>
        <p className="text-sm font-medium text-foreground">The vortex jar</p>
      </div>
      <div className="w-full" style={{ height: 380 }}>
        {jar}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{word}</span> · {rest}
      </p>
    </div>
  );
}
