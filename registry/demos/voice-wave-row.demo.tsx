"use client";

import * as React from "react";

import {
  VoiceWaveRow,
  type VoiceParticipant,
} from "@/registry/ui/voice-wave-row";

/** A seeded conversation: Ines opens, Marta answers, Rui closes. */
const FRAMES: number[][] = [
  [0.62, 0.03, 0.02],
  [0.81, 0.04, 0.02],
  [0.55, 0.02, 0.03],
  [0.74, 0.05, 0.02],
  [0.68, 0.03, 0.04],
  [0.34, 0.02, 0.02],
  [0.12, 0.18, 0.03],
  [0.05, 0.58, 0.02],
  [0.03, 0.77, 0.03],
  [0.04, 0.63, 0.05],
  [0.02, 0.85, 0.02],
  [0.03, 0.49, 0.04],
  [0.02, 0.24, 0.09],
  [0.04, 0.06, 0.41],
  [0.02, 0.03, 0.72],
  [0.03, 0.04, 0.58],
  [0.02, 0.02, 0.66],
  [0.05, 0.03, 0.31],
  [0.02, 0.02, 0.08],
  [0.02, 0.02, 0.03],
];

const control =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function VoiceWaveRowDemo() {
  const [frame, setFrame] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [ruiMuted, setRuiMuted] = React.useState(false);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [line, setLine] = React.useState("nobody speaking");

  const frameRef = React.useRef(frame);
  React.useEffect(() => {
    frameRef.current = frame;
  });

  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      // A hidden tab hears nothing; the script waits rather than running on.
      if (document.hidden) return;
      setFrame((frameRef.current + 1) % FRAMES.length);
    }, 160);
    return () => window.clearInterval(id);
  }, [playing]);

  const people: VoiceParticipant[] = [
    { id: "ines", name: "Ines Moreau" },
    { id: "marta", name: "Marta Ferreira" },
    { id: "rui", name: "Rui Baptista", muted: ruiMuted },
  ];

  const row = FRAMES[frame] ?? [];
  const levels = playing
    ? { ines: row[0] ?? 0, marta: row[1] ?? 0, rui: row[2] ?? 0 }
    : { ines: 0, marta: 0, rui: 0 };

  const pinnedName =
    people.find((person) => person.id === pinned)?.name ?? "nothing";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <VoiceWaveRow
        label="Coldbrook dispatch"
        participants={people}
        levels={levels}
        pinnedId={pinned}
        onPinnedChange={setPinned}
        onSpeakerChange={(sentence) => setLine(sentence.toLowerCase())}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((was) => !was)}
          className={control}
        >
          {playing ? "Pause" : "Play the call"}
        </button>
        <button
          type="button"
          onClick={() => setRuiMuted((was) => !was)}
          className={control}
        >
          {ruiMuted ? "Unmute Rui" : "Mute Rui"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span> · pinned {pinnedName}
      </p>
    </div>
  );
}
