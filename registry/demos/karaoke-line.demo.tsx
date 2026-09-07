"use client";

import * as React from "react";

import { KaraokeLine, type KaraokeWord } from "@/registry/ui/karaoke-line";

const WORDS: KaraokeWord[] = [
  { text: "Hold", start: 0, end: 0.45 },
  { text: "the", start: 0.45, end: 0.7 },
  { text: "line", start: 0.7, end: 1.15 },
  { text: "steady", start: 1.15, end: 1.75 },
  { text: "while", start: 1.85, end: 2.25 },
  { text: "the", start: 2.25, end: 2.5 },
  { text: "north", start: 2.5, end: 2.95 },
  { text: "bay", start: 2.95, end: 3.4 },
  { text: "finishes", start: 3.5, end: 4.2 },
  { text: "its", start: 4.2, end: 4.45 },
  { text: "slow", start: 4.45, end: 4.95 },
  { text: "turn", start: 4.95, end: 5.6 },
];

const END = WORDS.reduce((last, word) => Math.max(last, word.end), 0);

const CONTROL =
  "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-2 border border-hairline px-3 text-xs font-medium transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function KaraokeLineDemo() {
  const [time, setTime] = React.useState(0);
  const [wanted, setWanted] = React.useState(false);
  // Derived rather than an effect: the clock parks itself at the end, so the
  // button goes back to reading Play without anything having to notice.
  const running = wanted && time < END;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <KaraokeLine
        label="Coldbrook session · take 3"
        words={WORDS}
        time={time}
        playing={running}
        onTimeChange={setTime}
        onSeek={setTime}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!running && time >= END) setTime(0);
            setWanted(!running);
          }}
          className={CONTROL}
        >
          {running ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTime(0);
            setWanted(false);
          }}
          className={CONTROL}
        >
          Restart
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Playhead{" "}
        <span className="text-signal tabular-nums">{time.toFixed(2)}s</span> of{" "}
        <span className="tabular-nums">{END.toFixed(2)}s</span>
      </p>
    </div>
  );
}
