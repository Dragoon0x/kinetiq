"use client";

import * as React from "react";

import { MuteAll, type MuteParticipant } from "@/registry/ui/mute-all";

const CALL: MuteParticipant[] = [
  { id: "ines", name: "Ines Moreau", role: "host" },
  { id: "marta", name: "Marta Ferreira" },
  { id: "rui", name: "Rui Baptista" },
  { id: "noor", name: "Noor Haddad" },
  { id: "tomas", name: "Tomas Lindqvist" },
];

/** Rui closed his own microphone before the sweep, so undo has something to prove. */
const START = ["rui"];

export function MuteAllDemo() {
  const [muted, setMuted] = React.useState<string[]>(START);
  const [line, setLine] = React.useState("rui baptista muted");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MuteAll
        label="Coldbrook dispatch"
        participants={CALL}
        mutedIds={muted}
        onMutedIdsChange={setMuted}
        onAnnounce={(sentence) => setLine(sentence.toLowerCase())}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMuted(START);
            setLine("back to the start");
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reset the call
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {CALL.length} on the call · {muted.length} muted ·{" "}
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
