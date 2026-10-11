"use client";

import * as React from "react";

import { Pause, Play } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TidalPair, type TidalPairPhase } from "@/registry/ui/tidal-pair";

export const tweaks = defineTweaks({
  massRatio: {
    kind: "range",
    label: "Mass ratio",
    default: 0.5,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  inclination: {
    kind: "range",
    label: "Tilt",
    default: 25,
    min: 0,
    max: 90,
    step: 5,
    unit: "°",
  },
  starCount: {
    kind: "range",
    label: "Stars",
    default: 1600,
    min: 400,
    max: 2800,
    step: 200,
  },
});

const PHASES: Record<TidalPairPhase, string> = {
  approach: "approaching",
  closest: "closest approach",
  bridge: "bridge forming",
  tails: "tails unwinding",
};

/**
 * Gaugeworks Observatory's public night: a lecture card where the audience
 * scrubs two galaxies through their close pass.
 */
export function TidalPairDemo({
  chrome = true,
  // The encounter is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [playing, setPlaying] = React.useState(true);
  const [phase, setPhase] = React.useState<TidalPairPhase>("bridge");
  const moving = playing && motionSafe;

  const panel = (
    <div
      className="relative w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 256 : 208 }}
    >
      <TidalPair
        playing={playing}
        onPlayingChange={setPlaying}
        onPhaseChange={setPhase}
        {...values}
      />
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-0.5 rounded-2 bg-background/70 px-2.5 py-1.5 backdrop-blur-sm">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · public night
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">
          Two galaxies, one close pass
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{panel}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {panel}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <Play aria-hidden className="size-3.5 shrink-0" />
          )}
          {playing ? "Pause" : "Play"}
        </button>
        <p className="text-xs text-ink-3">Drag across the sky to scrub</p>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{moving ? "playing" : "paused"}</span> ·{" "}
        {PHASES[phase]}
      </p>
    </div>
  );
}
