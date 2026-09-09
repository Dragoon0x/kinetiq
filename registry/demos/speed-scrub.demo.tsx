"use client";

import * as React from "react";

import { SpeedScrub } from "@/registry/ui/speed-scrub";

/** Gaugeworks Reasoner's finished answer on Fieldline's crane lease. */
const ANSWER =
  "Renew the crane lease, but for one year rather than three. " +
  "The yard's own crane returns from repair in the spring, and the north site closes in the autumn, " +
  "so the second and third years would pay for a machine that mostly stands idle. " +
  "A single year covers the busy season at the current rate, and the supplier has already agreed to hold it. " +
  "Review again in March once the repair estimate is final.";

const WORDS = Array.from(ANSWER.matchAll(/\S+/g), (match) => ({
  start: match.index,
  end: match.index + match[0].length,
  word: match[0],
}));

export function SpeedScrubDemo() {
  const [position, setPosition] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  const index = WORDS.filter((w) => w.start < position).length;
  const held = WORDS.find((w) => w.start < position && position < w.end);
  const phase = playing
    ? "Playing"
    : position >= ANSWER.length
      ? "End"
      : held
        ? `Held in "${held.word}"`
        : "Paused";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SpeedScrub
        label="Answer from Gaugeworks Reasoner"
        model="Gaugeworks Reasoner"
        text={ANSWER}
        position={position}
        onPositionChange={setPosition}
        playing={playing}
        onPlayingChange={setPlaying}
        speed={speed}
        onSpeedChange={setSpeed}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase} · word {index} of {WORDS.length} · {speed}×
      </p>
    </div>
  );
}
