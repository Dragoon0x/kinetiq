"use client";

import * as React from "react";

import {
  AvatarCluster,
  type ClusterPerson,
} from "@/registry/ui/avatar-cluster";

const LEA: ClusterPerson = { id: "lea", name: "Lea Okafor" };

const STANDUP: ClusterPerson[] = [
  { id: "ines", name: "Ines Moreau", note: "yard lead" },
  { id: "rui", name: "Rui Baptista" },
  { id: "marta", name: "Marta Ferreira", note: "on dock three" },
  { id: "tomas", name: "Tomas Lindqvist" },
  { id: "noor", name: "Noor Haddad" },
  LEA,
];

export function AvatarClusterDemo() {
  const [people, setPeople] = React.useState<ClusterPerson[]>(STANDUP);
  const [speakingId, setSpeakingId] = React.useState<string | null>("ines");
  const [picked, setPicked] = React.useState("");

  const leaHere = people.some((person) => person.id === LEA.id);
  const speaker = people.find((person) => person.id === speakingId);

  const passTheFloor = () => {
    const index = people.findIndex((person) => person.id === speakingId);
    const next = people[(index + 1) % people.length];
    setSpeakingId(next ? next.id : null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 px-3 py-3">
        <p className="text-xs text-ink-3">Coldbrook standup · 09:15</p>
        <AvatarCluster
          label="Coldbrook standup"
          people={people}
          max={4}
          speakingId={speakingId}
          onSelect={(id) => {
            const person = people.find((one) => one.id === id);
            setPicked(person ? `opened ${person.name.split(" ")[0]}` : "");
          }}
          onOverflowSelect={() => setPicked("showing the rest")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={passTheFloor}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Pass the floor
        </button>
        <button
          type="button"
          onClick={() => {
            setPeople((prev) =>
              leaHere
                ? prev.filter((one) => one.id !== LEA.id)
                : [...prev, LEA],
            );
            if (leaHere && speakingId === LEA.id) setSpeakingId(null);
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {leaHere ? "Lea drops off" : "Lea joins"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {people.length} in the room ·{" "}
        <span className="text-signal">
          {speaker
            ? `speaking ${speaker.name.split(" ")[0]}`
            : "nobody has the floor"}
        </span>
        {picked ? ` · ${picked}` : ""}
      </p>
    </div>
  );
}
