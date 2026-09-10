"use client";

import * as React from "react";

import { SpeakerGrid } from "@/registry/ui/speaker-grid";

const PEOPLE = [
  { id: "marta", name: "Marta Reis" },
  { id: "rui", name: "Rui Alvez" },
  { id: "ines", name: "Ines Corda" },
];

const DANA = { id: "dana", name: "Dana Ferro" };

/** A seeded turn-taking script: one voice at a time, then a lull. */
const SCRIPT = [
  [0.64, 0.03, 0.02, 0.02],
  [0.71, 0.05, 0.03, 0.02],
  [0.28, 0.02, 0.04, 0.03],
  [0.04, 0.55, 0.03, 0.02],
  [0.03, 0.68, 0.05, 0.04],
  [0.03, 0.04, 0.59, 0.02],
  [0.05, 0.03, 0.74, 0.03],
  [0.03, 0.04, 0.03, 0.61],
  [0.04, 0.03, 0.02, 0.72],
  [0.02, 0.03, 0.04, 0.05],
];

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SpeakerGridDemo() {
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [joined, setJoined] = React.useState(false);
  const [inesMuted, setInesMuted] = React.useState(false);
  const [speaker, setSpeaker] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);

  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );

  React.useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setInterval(() => setStep((n) => n + 1), 900);
    return () => window.clearInterval(id);
  }, [playing, visible]);

  const row = SCRIPT[step % SCRIPT.length] ?? [];
  const roster = joined ? [...PEOPLE, DANA] : PEOPLE;
  const participants = roster.map((person, index) => ({
    ...person,
    level: row[index] ?? 0,
    muted: person.id === "ines" && inesMuted,
  }));

  const nameOf = (id: string | null) =>
    roster.find((person) => person.id === id)?.name ?? null;

  const speaking = nameOf(speaker);
  const held = nameOf(pinned);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SpeakerGrid
        label="People on the Coldbrook dispatch call"
        participants={participants}
        pinnedId={pinned}
        onPinnedChange={setPinned}
        onSpeakerChange={setSpeaker}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((on) => !on)}
          className={chip}
        >
          {playing ? "Pause the room" : "Play the room"}
        </button>
        <button
          type="button"
          onClick={() => setJoined((on) => !on)}
          className={chip}
        >
          {joined ? "Dana leaves" : "Dana joins"}
        </button>
        <button
          type="button"
          onClick={() => setInesMuted((on) => !on)}
          className={chip}
        >
          {inesMuted ? "Unmute Ines" : "Mute Ines"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {held ? `Pinned ${held} · ` : ""}
        <span className="text-signal">
          {speaking ? `${speaking} speaking` : "No one speaking"}
        </span>{" "}
        · {roster.length} on the call
      </p>
    </div>
  );
}
