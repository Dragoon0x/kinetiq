"use client";

import * as React from "react";

import { ReactBurst, type ReactionTally } from "@/registry/ui/react-burst";

const SEED: ReactionTally[] = [
  { id: "spark", label: "Spark", glyph: "spark", people: ["Marta", "Ines"] },
  { id: "agree", label: "Agree", glyph: "agree", people: ["Rui"] },
  { id: "lift", label: "Lift", glyph: "lift", people: [] },
  { id: "watching", label: "Watching", glyph: "watching", people: ["Marta"] },
];

/** Seeded arrivals, so the row can be watched change without a second desk. */
const LATE = ["Rui", "Ines", "Nuno"];

const control =
  "border-hairline-strong flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

export function ReactBurstDemo() {
  const [reactions, setReactions] = React.useState(SEED);
  const [mine, setMine] = React.useState<string[]>(["lift"]);
  const [arrived, setArrived] = React.useState(0);

  const addLate = () => {
    const name = LATE[arrived];
    if (!name) return;
    setArrived(arrived + 1);
    setReactions((prev) =>
      prev.map((reaction) =>
        reaction.id === "spark" && !reaction.people.includes(name)
          ? { ...reaction, people: [...reaction.people, name] }
          : reaction,
      ),
    );
  };

  const tallies = reactions
    .map((reaction) => ({
      label: reaction.label,
      count: reaction.people.length + (mine.includes(reaction.id) ? 1 : 0),
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.label} ${entry.count}`)
    .join(" · ");

  const yours = reactions
    .filter((reaction) => mine.includes(reaction.id))
    .map((reaction) => reaction.label)
    .join(", ");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
          <span>Marta</span>
          <span className="font-mono tabular-nums">07:12</span>
        </p>
        <p className="max-w-[88%] rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-1.5 text-sm leading-5 text-foreground">
          Gate B is clear from eight. Two pallets for the Basinworks run and one
          loose crate that never got a label.
        </p>
      </div>

      <ReactBurst
        label="Reactions on Marta's message"
        reactions={reactions}
        mine={mine}
        onMineChange={setMine}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={control}
          onClick={addLate}
          aria-disabled={arrived >= LATE.length ? true : undefined}
        >
          Someone reacts
        </button>
        <button
          type="button"
          className={control}
          onClick={() => {
            setReactions(SEED);
            setMine(["lift"]);
            setArrived(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {tallies === "" ? "no reactions" : tallies}
        {" · yours "}
        <span className="text-signal">{yours === "" ? "none" : yours}</span>
      </p>
    </div>
  );
}
