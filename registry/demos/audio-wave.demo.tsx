"use client";

import * as React from "react";

import { AudioWave, type AudioClip } from "@/registry/ui/audio-wave";

const CLIPS: AudioClip[] = [
  {
    id: "a1",
    from: "peer",
    title: "Roof deck walkthrough",
    seconds: 161,
    seed: 5209,
    time: "11:02",
  },
  {
    id: "a2",
    from: "me",
    title: "Answer on the parapet",
    seconds: 48,
    seed: 7741,
    time: "11:19",
    delivery: "read",
  },
];

const TICK_MS = 100;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const mmss = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

export function AudioWaveDemo() {
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [positions, setPositions] = React.useState<Record<string, number>>({});
  const [speed, setSpeed] = React.useState(1);
  const [lastId, setLastId] = React.useState(CLIPS[0]?.id ?? "");
  const held = React.useRef<Record<string, number>>({});

  // The transport lives in the demo: the component never reads a clock. The
  // run clears itself and holds while the tab is hidden.
  React.useEffect(() => {
    if (!playingId || !visible) return;
    const clip = CLIPS.find((item) => item.id === playingId);
    if (!clip) return;
    const timer = window.setInterval(() => {
      const at = (held.current[playingId] ?? 0) + (TICK_MS / 1000) * speed;
      const done = at >= clip.seconds;
      held.current = {
        ...held.current,
        [playingId]: done ? clip.seconds : Math.round(at * 10) / 10,
      };
      setPositions(held.current);
      if (done) setPlayingId(null);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playingId, visible, speed]);

  const current = CLIPS.find((item) => item.id === lastId) ?? CLIPS[0];
  const at = current ? (positions[current.id] ?? 0) : 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AudioWave
        label="Basinworks site handover"
        peerName="Marta"
        clips={CLIPS}
        playingId={playingId}
        positions={positions}
        speed={speed}
        onSpeedChange={setSpeed}
        followMs={TICK_MS}
        onPlayRequest={(id, playing) => {
          setLastId(id);
          setPlayingId(playing ? id : null);
        }}
        onSeek={(id, seconds) => {
          held.current = { ...held.current, [id]: seconds };
          setPositions(held.current);
          setLastId(id);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {playingId ? (current?.title ?? "Idle") : "Idle"} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {mmss(at)}
          {playingId ? ` / ${mmss(current?.seconds ?? 0)}` : " held"}
        </span>{" "}
        · {Number.isInteger(speed) ? speed : speed.toFixed(1)}×
      </p>
    </div>
  );
}
