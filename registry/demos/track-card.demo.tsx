"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TrackCard, defaultUpNext } from "@/registry/ui/track-card";

export const tweaks = defineTweaks({
  bars: {
    kind: "range",
    label: "Bars",
    default: 56,
    min: 24,
    max: 96,
    step: 8,
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 16,
    min: 0,
    max: 40,
    step: 4,
    unit: "rpm",
  },
  peek: {
    kind: "range",
    label: "Peek",
    default: 0.5,
    min: 0.1,
    max: 0.7,
    step: 0.05,
  },
});

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Fieldline Radio's "New this week" shelf: one new single, with two tracks
 * already lined up behind whatever is playing.
 */
export function TrackCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [playing, setPlaying] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [queued, setQueued] = React.useState(false);
  const [at, setAt] = React.useState<number | null>(null);
  const upNext = defaultUpNext.length + (queued ? 1 : 0);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <TrackCard
        playing={playing}
        onPlayingChange={setPlaying}
        liked={liked}
        onLikedChange={setLiked}
        queued={queued}
        onQueuedChange={setQueued}
        onPositionChange={setAt}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{playing ? "playing" : "paused"}</span>
          {` · ${liked ? "liked" : "not liked"} · ${upNext} up next`}
          {at !== null ? ` · at ${clock(at)}` : null}
        </p>
      ) : null}
    </div>
  );
}
