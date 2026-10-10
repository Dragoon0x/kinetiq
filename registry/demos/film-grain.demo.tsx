"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FilmGrain } from "@/registry/ui/film-grain";

export const tweaks = defineTweaks({
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "range",
    label: "Size",
    default: 1,
    min: 0.5,
    max: 3,
    step: 0.25,
  },
  fps: {
    kind: "range",
    label: "Frame rate",
    default: 18,
    min: 4,
    max: 30,
    step: 2,
    unit: "fps",
  },
});

/** A printed poster is pigment: these hold the same in both themes. */
const INK = {
  skyHigh: "oklch(from var(--accent-bright) 0.3 0.08 h)",
  skyLow: "oklch(from var(--accent-bright) 0.52 0.09 h)",
  glow: "oklch(from var(--warn) 0.8 0.12 h)",
  sun: "oklch(from var(--warn) 0.92 0.1 h)",
  sunLow: "oklch(from var(--danger) 0.7 0.16 h)",
  ridgeFar: "oklch(from var(--accent-bright) 0.3 0.06 h)",
  ridgeNear: "oklch(from var(--accent-bright) 0.17 0.04 h)",
  paper: "oklch(from var(--warn) 0.97 0.02 h)",
};

/**
 * Coldbrook's Night Roast, announced on a poster: a dusk over two ridges,
 * printed with grain so the screen reads like paper.
 */
export function FilmGrainDemo({
  chrome = true,
  // The grain is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const fps = values.fps ?? tweaks.fps.default;

  const poster = (
    <FilmGrain
      className="h-52 w-full overflow-clip rounded-3 border border-hairline"
      {...values}
    >
      <div
        className="@container relative h-full w-full"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${INK.skyHigh}, ${INK.skyLow} 58%, ${INK.glow} 78%)`,
        }}
      >
        <span
          aria-hidden
          className="absolute top-[38%] right-[14%] size-20 rounded-full @[32rem]:size-24"
          style={{
            backgroundImage: `linear-gradient(to bottom, ${INK.sun}, ${INK.sunLow})`,
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-[42%] w-full"
        >
          <path
            d="M0 52 L48 30 L92 46 L150 18 L206 44 L262 26 L318 48 L360 34 L400 44 L400 100 L0 100 Z"
            style={{ fill: INK.ridgeFar }}
          />
          <path
            d="M0 74 L70 56 L128 70 L196 50 L270 72 L330 60 L400 70 L400 100 L0 100 Z"
            style={{ fill: INK.ridgeNear }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-between p-4 @[32rem]:p-5">
          <p
            className="font-mono text-[10px] tracking-[0.12em] uppercase"
            style={{ color: INK.paper }}
          >
            Coldbrook · small batch No. 14
          </p>
          <div className="flex flex-col items-start gap-3">
            <p
              className="text-3xl leading-none font-semibold tracking-[-0.03em] @[32rem]:text-4xl"
              style={{ color: INK.paper }}
            >
              Night Roast
            </p>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              style={{ backgroundColor: INK.paper, color: INK.ridgeNear }}
            >
              Order a bag
            </button>
          </div>
        </div>
      </div>
    </FilmGrain>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{poster}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {poster}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {motionSafe ? (
          <>
            <span className="text-signal">projecting · {fps} fps</span> · move
            across to clear the grain
          </>
        ) : (
          <>
            <span className="text-signal">still frame</span> · move across to
            clear the grain
          </>
        )}
      </p>
    </div>
  );
}
