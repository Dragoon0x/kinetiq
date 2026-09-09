"use client";

import * as React from "react";

import { HandoffArrow } from "@/registry/ui/handoff-arrow";

/** A Waylight release note on its way through three agents. */
const AGENTS = [
  { id: "scout", name: "Scout", model: "Basinworks Scout" },
  { id: "drafter", name: "Drafter", model: "Fernworks Model 3" },
  { id: "checker", name: "Checker", model: "Gaugeworks Reasoner" },
];

/** Where the note goes on each press of Hand off: draft, check, fix, check again. */
const SCRIPT = ["drafter", "checker", "drafter", "checker"];

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function HandoffArrowDemo() {
  const [holder, setHolder] = React.useState("scout");
  const [step, setStep] = React.useState(0);
  const [handoffs, setHandoffs] = React.useState(0);
  const [from, setFrom] = React.useState<string | null>(null);

  const nameOf = (id: string) => AGENTS.find((agent) => agent.id === id)?.name;
  const next = SCRIPT[step];

  const handOff = (to: string) => {
    if (to === holder) return;
    setFrom(holder);
    setHandoffs((count) => count + 1);
    setHolder(to);
  };

  const reset = () => {
    setHolder("scout");
    setStep(0);
    setHandoffs(0);
    setFrom(null);
  };

  const status = `Held by ${nameOf(holder)} · ${handoffs} ${handoffs === 1 ? "handoff" : "handoffs"}${
    from ? ` · from ${nameOf(from)}` : ""
  }`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HandoffArrow
        label="Release note"
        baton="release-note.md"
        agents={AGENTS}
        value={holder}
        onValueChange={handOff}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!next) return;
            handOff(next);
            setStep((current) => current + 1);
          }}
          disabled={!next}
          className={button}
        >
          Hand off
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={handoffs === 0}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
