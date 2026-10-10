"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PulseTiles, type PulseTilesPattern } from "@/registry/ui/pulse-tiles";

export const tweaks = defineTweaks({
  tile: {
    kind: "range",
    label: "Tile",
    default: 28,
    min: 16,
    max: 48,
    step: 4,
    unit: "px",
  },
  tempo: {
    kind: "range",
    label: "Tempo",
    default: 96,
    min: 60,
    max: 150,
    step: 6,
    unit: "bpm",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "dusk", "reef", "ember"],
    names: { cobalt: "Cobalt", dusk: "Dusk", reef: "Reef", ember: "Ember" },
  },
});

const PLAYING: Record<PulseTilesPattern, string> = {
  diagonal: "diagonal waves",
  ripple: "rings",
  checker: "checkerboard",
  spiral: "spiral sweep",
};

/**
 * Waylight Sessions, a listening room: the night's poster sits on a floor of
 * tiles keeping the house tempo.
 */
export function PulseTilesDemo({
  chrome = true,
  // The tiles are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pattern, setPattern] = React.useState<PulseTilesPattern | null>(null);
  const tempo = values.tempo ?? 96;
  const palette = values.palette ?? "cobalt";

  const floor = (
    <PulseTiles
      onPatternChange={setPattern}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Sessions
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Late sets, every Friday
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Doors at 21:00 · {tempo} bpm on the floor
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Get tickets
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PulseTiles>
  );

  if (!chrome) return <div className="flex w-full">{floor}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {floor}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {pattern ? PLAYING[pattern] : "counting in"}
        </span>{" "}
        · {tempo} bpm · {palette}
      </p>
    </div>
  );
}
