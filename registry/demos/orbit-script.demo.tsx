"use client";

import * as React from "react";

import { Coffee } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { OrbitScript } from "@/registry/ui/orbit-script";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 3,
    min: 0,
    max: 12,
    step: 0.5,
    unit: "rpm",
  },
  radius: {
    kind: "range",
    label: "Radius",
    default: 4.5,
    min: 3.5,
    max: 6,
    step: 0.25,
    unit: "em",
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 0.22,
    min: 0,
    max: 0.3,
    step: 0.02,
    unit: "em",
  },
});

const LEGEND = "COLDBROOK ROASTERS · SMALL BATCH · ";

/**
 * Coldbrook Roasters' cup-sleeve badge: the legend turns slowly round the
 * cup, stops when you reach for it, and spins when you give it a push.
 */
export function OrbitScriptDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [paused, setPaused] = React.useState(false);
  const [near, setNear] = React.useState(false);
  const [top, setTop] = React.useState<number | null>(null);
  const motionSafe = useMotionSafe();
  const rpm = values.speed ?? tweaks.speed.default;

  const badge = (
    <OrbitScript
      text={LEGEND}
      paused={paused}
      onStep={setTop}
      sound={sound}
      className="text-[13px] font-semibold text-foreground"
      center={
        <span className="flex size-[4.25em] items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-cobalt-bright">
          <Coffee aria-hidden className="size-[1.7em]" strokeWidth={1.6} />
        </span>
      }
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{badge}</div>;
  }

  const letter = top === null ? null : LEGEND[top];
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div
        className="flex justify-center self-center"
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
      >
        {badge}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {paused
              ? "paused"
              : near
                ? "braked"
                : motionSafe && rpm > 0
                  ? `${rpm} rpm`
                  : "still"}
          </span>
          {letter ? ` · “${letter}” at the top` : " · drag to spin"}
        </p>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {paused ? "Turn" : "Pause"}
        </button>
      </div>
    </div>
  );
}
