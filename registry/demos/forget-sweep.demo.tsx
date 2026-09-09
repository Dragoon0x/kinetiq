"use client";

import * as React from "react";

import { ForgetSweep, type ForgetItem } from "@/registry/ui/forget-sweep";

/** What Fernworks Model 3 remembers about the Basinworks yard. */
const SEED: ForgetItem[] = [
  {
    id: "gate",
    text: "The yard gate opens at 06:30 on weekdays",
    source: "Turn 4",
  },
  {
    id: "units",
    text: "Crew lead Ines wants quantities in metric",
    source: "Turn 9",
  },
  {
    id: "cadence",
    text: "Yard reports go out every Friday before noon",
    source: "Turn 12",
  },
  {
    id: "statement",
    text: "Coldbrook Bank statements arrive as CSV, one per account",
    source: "Turn 15",
  },
];

const textOf = (id: string) => SEED.find((item) => item.id === id)?.text ?? "";

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ForgetSweepDemo() {
  const [items, setItems] = React.useState(SEED);
  const [pending, setPending] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<string | null>(null);
  const [seed, setSeed] = React.useState(0);

  const reset = () => {
    setItems(SEED);
    setPending([]);
    setLast(null);
    // Remounting clears any undo window still open inside the list.
    setSeed((n) => n + 1);
  };

  const remembered = items.length - pending.length;
  const status =
    last ??
    `${remembered} remembered · ${pending.length > 0 ? "undo open" : "idle"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ForgetSweep
        key={seed}
        label="Fernworks Model 3 remembers"
        items={items}
        onForgetStart={(id) => {
          setPending((open) => [...open, id]);
          setLast(null);
        }}
        onUndo={(id) => {
          setPending((open) => open.filter((open) => open !== id));
          setLast(`Restored: ${textOf(id)}`);
        }}
        onForget={(id) => {
          setItems((list) => list.filter((item) => item.id !== id));
          setPending((open) => open.filter((open) => open !== id));
          setLast(`Forgot: ${textOf(id)}`);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
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
