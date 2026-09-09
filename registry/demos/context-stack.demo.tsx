"use client";

import * as React from "react";

import { ContextStack, type ContextLayer } from "@/registry/ui/context-stack";

/** Fernworks Model 3 holding a Waylight Pay support thread. */
const BUDGET = 8192;
const SEED = { messages: 1840, memory: 620, turns: 12, facts: 4, step: 0 };

/** Seeded sizes for each new turn and each recalled memory. */
const TURNS = [420, 380, 460, 410, 440, 390];
const RECALLS = [180, 160, 210, 190, 170];

const format = (tokens: number) =>
  new Intl.NumberFormat("en-US").format(tokens);

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ContextStackDemo() {
  const [state, setState] = React.useState(SEED);
  const [lifted, setLifted] = React.useState<string | null>(null);

  const layers: ContextLayer[] = [
    {
      id: "messages",
      label: "Messages",
      tokens: state.messages,
      note: `${state.turns} turns`,
    },
    {
      id: "memory",
      label: "Memory",
      tokens: state.memory,
      note: `${state.facts} facts`,
    },
    { id: "system", label: "System", tokens: 1120, note: "1 prompt" },
  ];
  const total = layers.reduce((sum, layer) => sum + layer.tokens, 0);
  const liftedLabel = layers.find((layer) => layer.id === lifted)?.label;

  const addTurn = () =>
    setState((s) => ({
      ...s,
      messages: s.messages + (TURNS[s.step % TURNS.length] ?? 0),
      turns: s.turns + 1,
      step: s.step + 1,
    }));
  const recall = () =>
    setState((s) => ({
      ...s,
      memory: s.memory + (RECALLS[s.step % RECALLS.length] ?? 0),
      facts: s.facts + 1,
      step: s.step + 1,
    }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ContextStack
        label="Context · Fernworks Model 3"
        layers={layers}
        budget={BUDGET}
        format={format}
        onLift={setLifted}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addTurn} className={button}>
          Add a turn
        </button>
        <button type="button" onClick={recall} className={button}>
          Recall memory
        </button>
        <button type="button" onClick={() => setState(SEED)} className={button}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {format(total)} of {format(BUDGET)} tokens ·{" "}
        {liftedLabel ?? "hover a layer"}
      </p>
    </div>
  );
}
