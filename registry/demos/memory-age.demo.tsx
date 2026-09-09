"use client";

import * as React from "react";

import {
  MemoryAge,
  memoryAgeState,
  type MemoryAgeItem,
} from "@/registry/ui/memory-age";

/** Gaugeworks Reasoner's memories about Coldbrook Bank and the Basinworks yard. */
const SEED: MemoryAgeItem[] = [
  { id: "csv", text: "Coldbrook Bank statements arrive as CSV", age: 1 },
  { id: "gate", text: "The Basinworks yard gate opens at 06:30", age: 5 },
  { id: "units", text: "Crew lead Ines wants quantities in metric", age: 12 },
  { id: "friday", text: "Yard reports go out Friday before noon", age: 19 },
  { id: "fees", text: "Coldbrook waives transfer fees over 5,000", age: 27 },
];

const HORIZON = 30;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function MemoryAgeDemo() {
  const [items, setItems] = React.useState(SEED);
  const [last, setLast] = React.useState<string | null>(null);
  const [seed, setSeed] = React.useState(0);

  const ageWeek = () => {
    setItems((list) => list.map((item) => ({ ...item, age: item.age + 7 })));
    setLast(null);
  };
  const refresh = (id: string) => {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, age: 0 } : item)),
    );
    setLast(SEED.find((item) => item.id === id)?.text ?? null);
  };
  // Remounting on reset: a wholesale drop in every age is a reseed, not a
  // refresh, so no row should sweep.
  const reset = () => {
    setItems(SEED);
    setLast(null);
    setSeed((n) => n + 1);
  };

  const fresh = items.filter(
    (item) => memoryAgeState(item.age, HORIZON) === "fresh",
  ).length;
  const oldest = Math.max(...items.map((item) => item.age));
  const status = last
    ? `Refreshed: ${last}`
    : `${fresh} fresh · ${items.length - fresh} fading · oldest ${oldest}d`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MemoryAge
        key={seed}
        label="Gaugeworks Reasoner remembers"
        items={items}
        horizon={HORIZON}
        onRefresh={refresh}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={ageWeek} className={button}>
          Age a week
        </button>
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
