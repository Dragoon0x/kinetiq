"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultScrims, TheatreScrims } from "@/registry/ui/theatre-scrims";

export const tweaks = defineTweaks({
  layers: {
    kind: "range",
    label: "Layers",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lighting: {
    kind: "choice",
    label: "Lighting",
    default: "warm",
    options: ["warm", "cool", "dusk"],
    names: { warm: "Warm", cool: "Cool", dusk: "Dusk" },
  },
});

/** The scenes on stage for a layer count: the first gauzes, then the back cloth. */
const scenesFor = (layers: number) => {
  const front = defaultScrims.slice(0, Math.max(1, layers - 1));
  const last = defaultScrims[defaultScrims.length - 1];
  return last ? [...front, last] : front;
};

/**
 * The Fieldline Players' programme for The Long Night: the reader dollies
 * through the painted gauzes of each scene, down to the sunrise back cloth.
 */
export function TheatreScrimsDemo({
  chrome = true,
  // The stage is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const box = chrome ? 480 : 540;
  const scenes = scenesFor(values.layers ?? tweaks.layers.default);

  const programme = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="The Long Night, programme"
      className="w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      style={{ height: box }}
    >
      <div className="flex flex-col gap-1.5 px-5 pt-5 pb-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Players · The Long Night
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          A play in scenes, each painted on gauze. Scroll down to walk through
          them to the morning.
        </p>
      </div>
      <TheatreScrims
        height={box - 2}
        label="The Long Night, stage"
        onLayerChange={setScene}
        onProgressChange={setProgress}
        {...values}
      />
      <div className="flex flex-col gap-2 px-5 pt-5 pb-8 text-sm text-ink-2">
        <p className="max-w-prose">
          Scenery painted by the company over the winter. Performances run
          Thursday to Sunday at the Coldbrook Hall; doors at seven.
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{programme}</div>;

  const caption = scenes[scene]?.caption ?? "";
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {programme}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            scene {Math.min(scene, scenes.length - 1) + 1} of {scenes.length}
          </span>
          {` · ${caption.toLowerCase()} · ${Math.round(progress * 100)}%`}
        </p>
        <button
          type="button"
          onClick={() =>
            boxRef.current?.scrollTo({
              top: 0,
              behavior: motionSafe ? "smooth" : "auto",
            })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
