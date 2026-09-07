"use client";

import * as React from "react";

import { WaveScrub } from "@/registry/ui/wave-scrub";

const DURATION = 42;
const TICK_MS = 100;

/** A deterministic voice memo: an envelope, then grain. No random at render. */
const PEAKS = Array.from({ length: 56 }, (_, i) => {
  const t = i / 55;
  const envelope = 0.34 + 0.66 * Math.sin(Math.PI * t) ** 0.7;
  const grain = 0.55 + 0.45 * Math.sin(i * 2.3) * Math.cos(i * 0.61);
  return Math.min(1, Math.max(0.1, envelope * grain));
});

const mmss = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

export function WaveScrubDemo() {
  const [position, setPosition] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  // The clock's own reading, so the tick never has to branch inside a state
  // updater to know whether it has reached the end.
  const clock = React.useRef(0);

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Math.min(DURATION, clock.current + TICK_MS / 1000);
      clock.current = next;
      setPosition(next);
      if (next >= DURATION) setPlaying(false);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const handleSeek = (seconds: number) => {
    clock.current = seconds;
    setPosition(seconds);
  };

  const handlePlayingChange = (next: boolean) => {
    // Play at the end starts the memo again rather than sitting on the tail.
    if (next && clock.current >= DURATION) handleSeek(0);
    setPlaying(next);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            Coldbrook field note
          </p>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Voice memo
          </span>
        </div>

        <WaveScrub
          peaks={PEAKS}
          duration={DURATION}
          position={position}
          onSeek={handleSeek}
          playing={playing}
          onPlayingChange={handlePlayingChange}
          aria-label="Coldbrook field note position"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{mmss(position)}</span> of{" "}
        {mmss(DURATION)} · {playing ? "playing" : "paused"}
      </p>
    </div>
  );
}
