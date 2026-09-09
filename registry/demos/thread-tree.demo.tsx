"use client";

import * as React from "react";

import { ThreadTree, type ThreadNode } from "@/registry/ui/thread-tree";

/** Gaugeworks Reasoner planning the Basinworks yard's week: two forks, three endings. */
const NODES: ThreadNode[] = [
  {
    id: "t1",
    parentId: null,
    role: "user",
    text: "Draft next week's shift plan for the Basinworks yard.",
  },
  {
    id: "t2",
    parentId: "t1",
    role: "assistant",
    text: "Three eight-hour shifts, six crew each, Monday to Saturday. Ines leads days.",
  },
  { id: "t3", parentId: "t2", role: "user", text: "Make it two shifts." },
  {
    id: "t4",
    parentId: "t3",
    role: "assistant",
    text: "Two ten-hour shifts, nine crew each. Sunday stays closed and overtime falls to zero.",
  },
  { id: "t5", parentId: "t2", role: "user", text: "Keep three, but shorter." },
  {
    id: "t6",
    parentId: "t5",
    role: "assistant",
    text: "Three six-hour shifts, six crew each, with no overlap at the handovers.",
  },
  { id: "t7", parentId: "t6", role: "user", text: "Add a night crew." },
  {
    id: "t8",
    parentId: "t7",
    role: "assistant",
    text: "A night crew of four from ten to four; the day shifts shorten to five hours to pay for it.",
  },
  {
    id: "t9",
    parentId: "t6",
    role: "user",
    text: "Start the first shift at six.",
  },
  {
    id: "t10",
    parentId: "t9",
    role: "assistant",
    text: "First shift six to noon, then noon to six, then six to midnight. The gate opens half an hour earlier.",
  },
];

/** The three endings, named for the status line and the jump buttons. */
const ENDINGS = [
  { id: "t4", label: "Two shifts" },
  { id: "t8", label: "Night crew" },
  { id: "t10", label: "Six start" },
];

function pathOf(id: string): string[] {
  const path: string[] = [];
  let node = NODES.find((n) => n.id === id);
  while (node) {
    path.unshift(node.id);
    const parentId = node.parentId;
    node = parentId === null ? undefined : NODES.find((n) => n.id === parentId);
  }
  return path;
}

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ThreadTreeDemo() {
  const [selected, setSelected] = React.useState("t4");

  const path = pathOf(selected);
  const ending = ENDINGS.find((end) => pathOf(end.id).includes(selected));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ThreadTree
        label="Shift plan · Gaugeworks Reasoner"
        nodes={NODES}
        value={selected}
        onValueChange={setSelected}
      />

      <div className="flex flex-wrap items-center gap-2">
        {ENDINGS.map((end) => (
          <button
            key={end.id}
            type="button"
            onClick={() => setSelected(end.id)}
            className={button}
          >
            {end.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Branch {ending?.label ?? "shared"} · {path.length} turns
      </p>
    </div>
  );
}
