"use client";

import * as React from "react";

import { VoiceBubble, type VoiceNote } from "@/registry/ui/voice-bubble";

/** Marta's note: a hand-set 32-bar profile, so nothing is computed at load. */
const MARTA_WAVE = [
  0.22, 0.38, 0.61, 0.74, 0.52, 0.33, 0.47, 0.82, 0.91, 0.66, 0.41, 0.28, 0.36,
  0.58, 0.77, 0.69, 0.45, 0.3, 0.52, 0.86, 0.72, 0.49, 0.35, 0.44, 0.63, 0.79,
  0.57, 0.38, 0.26, 0.41, 0.33, 0.2,
];

const OPENING: VoiceNote[] = [
  { id: "v1", from: "peer", seconds: 6, wave: MARTA_WAVE, time: "9:41" },
];

const clock = (n: number) => `9:${String(42 + n).padStart(2, "0")}`;

export function VoiceBubbleDemo() {
  const [notes, setNotes] = React.useState<VoiceNote[]>(OPENING);
  const [sent, setSent] = React.useState(0);
  const [holding, setHolding] = React.useState<number | null>(null);
  const [playing, setPlaying] = React.useState<string | null>(null);

  const send = (note: { seconds: number; wave: number[] }) => {
    const n = sent + 1;
    setSent(n);
    // Keep the thread short: the last three notes are enough to show.
    setNotes((prev) =>
      [
        ...prev,
        { id: `v${n + 1}`, from: "me" as const, ...note, time: clock(n) },
      ].slice(-3),
    );
  };

  const playingNote = notes.find((note) => note.id === playing);
  const last = notes[notes.length - 1];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <VoiceBubble
        label="Depot chat with Marta"
        peerName="Marta"
        notes={notes}
        onSend={send}
        onRecording={setHolding}
        onPlayChange={setPlaying}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {holding !== null ? (
          <>
            Holding ·{" "}
            <span className="text-signal">
              0:{String(holding).padStart(2, "0")}
            </span>
          </>
        ) : playingNote ? (
          <>
            Playing ·{" "}
            <span className="text-signal">
              {playingNote.from === "me" ? "Ines" : "Marta"}
            </span>
          </>
        ) : sent > 0 && last ? (
          <>
            Sent <span className="text-signal">{last.seconds} s</span> ·{" "}
            {notes.length} notes
          </>
        ) : (
          <>
            Idle · {notes.length} {notes.length === 1 ? "note" : "notes"}
          </>
        )}
      </p>
    </div>
  );
}
