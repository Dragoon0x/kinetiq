"use client";

import * as React from "react";

import { Pause } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SpeedBanner } from "@/registry/ui/speed-banner";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1.2,
    min: 0.2,
    max: 3,
    step: 0.2,
    unit: "em/s",
  },
  skew: {
    kind: "range",
    label: "Skew",
    default: 10,
    min: 0,
    max: 20,
    step: 1,
    unit: "°",
  },
  rows: {
    kind: "range",
    label: "Rows",
    default: 2,
    min: 2,
    max: 4,
    step: 1,
  },
  outline: {
    kind: "choice",
    label: "Outline",
    default: "alternate",
    options: ["none", "alternate", "all"],
    names: { none: "Solid", alternate: "Mixed", all: "Outline" },
  },
});

const ITEMS = ["New season", "Free returns", "Ships Friday", "Made to last"];

/**
 * The strip across a Basinworks spring-drop page: it cruises while the page
 * is still and surges, leans and stretches as the visitor scrolls past.
 */
export function SpeedBannerDemo({
  chrome = true,
  // The banner is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [paused, setPaused] = React.useState(false);
  const [direction, setDirection] = React.useState<1 | -1>(1);
  // More rows, smaller type: the strip keeps roughly one height.
  const rows = values.rows ?? 2;
  const scale = rows >= 4 ? 0.72 : rows === 3 ? 0.85 : 1;

  return (
    <div className="@container flex w-full max-w-3xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks · Spring drop
      </p>
      <div
        className="[--banner-size:1.5rem] @md:[--banner-size:2rem] @xl:[--banner-size:2.5rem]"
        style={{ fontSize: `calc(var(--banner-size) * ${scale})` }}
      >
        <SpeedBanner
          text={ITEMS}
          label="Basinworks spring drop"
          paused={paused}
          onPausedChange={setPaused}
          onDirectionChange={setDirection}
          className="font-semibold tracking-[-0.01em] text-foreground uppercase"
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {paused
              ? "paused · rows at rest"
              : !motionSafe
                ? "still · reduced motion"
                : direction === 1
                  ? "cruising · scroll to push it"
                  : "reversed · you scrolled up"}
          </p>
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-cobalt-wash aria-pressed:text-cobalt-bright"
          >
            <Pause aria-hidden className="size-3.5 shrink-0" />
            Pause
          </button>
        </div>
      ) : null}
    </div>
  );
}
