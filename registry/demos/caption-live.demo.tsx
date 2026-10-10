"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CaptionLive, type CaptionSegment } from "@/registry/ui/caption-live";

export const tweaks = defineTweaks({
  pace: {
    kind: "range",
    label: "Pace",
    default: 165,
    min: 100,
    max: 240,
    step: 10,
    unit: "wpm",
  },
  confidence: {
    kind: "range",
    label: "Confidence",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  revise: { kind: "toggle", label: "Revise", default: true },
});

const SCRIPT: CaptionSegment[] = [
  {
    speaker: "Pilot",
    text: "The tide turns at nine forty, so the first ferry leaves early.",
    corrections: [
      { word: 4, heard: "night" },
      { word: 9, heard: "fairy" },
    ],
  },
  {
    speaker: "Pilot",
    text: "Keep the east channel clear until the dredger has passed.",
    corrections: [{ word: 7, heard: "dredge her" }],
  },
  {
    speaker: "Ferry desk",
    text: "Thanks. Waylight sailings run to time from the Basin's north quay.",
    corrections: [
      { word: 8, heard: "basins" },
      { word: 10, heard: "key." },
    ],
  },
];

/**
 * Basinworks' morning harbour briefing, captioned live: the pilot and the
 * ferry desk, with the recogniser correcting itself as it goes.
 */
export function CaptionLiveDemo({
  chrome = true,
  // Captions are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [paused, setPaused] = React.useState(false);
  const [said, setSaid] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const pace = values.pace ?? tweaks.pace.default;

  const panel = (
    <div className="@container flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-card px-4 py-3">
      <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-danger"
        />
        <span className="truncate">Live · Basinworks harbour briefing</span>
        <span className="ml-auto shrink-0 rounded-1 border border-hairline-strong px-1 text-ink-2">
          CC
        </span>
      </p>
      <CaptionLive
        script={SCRIPT}
        paused={paused}
        onSegment={(i) => {
          setSaid(i + 1);
          setDone(false);
        }}
        onComplete={() => setDone(true)}
        className="text-[clamp(1rem,3.6cqi,1.25rem)] font-medium tracking-[-0.005em]"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{panel}</div>;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {paused ? "held" : done ? "settled" : "captioning"}
          </span>{" "}
          · {said} of {SCRIPT.length} sentences · {pace} wpm
        </p>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
