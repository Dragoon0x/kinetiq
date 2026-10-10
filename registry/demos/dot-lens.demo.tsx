"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DotLens } from "@/registry/ui/dot-lens";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 96,
    min: 48,
    max: 160,
    step: 8,
    unit: "px",
  },
  power: {
    kind: "range",
    label: "Power",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dot: {
    kind: "range",
    label: "Dot",
    default: 2,
    min: 1,
    max: 4,
    step: 0.25,
    unit: "px",
  },
});

/**
 * Gaugeworks' field lens: a loupe over a plate of fine grain, the way the
 * instrument maker shows off its glass.
 */
export function DotLensDemo({
  chrome = true,
  // The lens is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leading, setLeading] = React.useState(false);
  const [rings, setRings] = React.useState(0);
  const power = values.power ?? tweaks.power.default;
  // The fisheye's magnification at the centre: m + 1, where m = 3.5 × power.
  const zoom = (1 + 3.5 * power).toFixed(1);

  const field = (
    <DotLens
      label="Gaugeworks field lens"
      onLeadChange={setLeading}
      onPulse={() => setRings((n) => n + 1)}
      className={
        chrome
          ? "aspect-auto h-60 rounded-3 border border-hairline bg-card sm:h-72"
          : "aspect-auto h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="pointer-events-none flex h-full items-end justify-between gap-3 p-3">
        <p className="rounded-1 bg-card/85 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · field lens 3
        </p>
        <p className="rounded-1 bg-card/85 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 tabular-nums">
          ×{zoom}
        </p>
      </div>
    </DotLens>
  );

  if (!chrome) return <div className="w-full max-w-2xl">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {leading ? (
          <>
            <span className="text-signal">lens on the field</span> · ×{zoom}
            {rings > 0
              ? ` · ${rings} ${rings === 1 ? "ring" : "rings"} sent`
              : " · click to send a ring"}
          </>
        ) : (
          <>
            <span className="text-signal">parked</span> · move over the field or
            tab in
          </>
        )}
      </p>
    </div>
  );
}
