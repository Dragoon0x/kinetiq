"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KeyRing, type KeyRingWorkspace } from "@/registry/ui/key-ring";

export const tweaks = defineTweaks({
  keys: {
    kind: "range",
    label: "Keys",
    default: 5,
    min: 3,
    max: 7,
    step: 1,
  },
  ring: {
    kind: "choice",
    label: "Ring",
    default: "steel",
    options: ["steel", "brass", "black"],
    names: { steel: "Steel", brass: "Brass", black: "Black" },
  },
  jingle: {
    kind: "range",
    label: "Jingle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const FIRST: KeyRingWorkspace[] = [
  { id: "basinworks", name: "Basinworks", detail: "Studio · 12 members" },
  { id: "coldbrook", name: "Coldbrook Bank", detail: "Treasury · 18 members" },
  { id: "fieldline", name: "Fieldline", detail: "Research · 6 members" },
  { id: "gaugeworks", name: "Gaugeworks", detail: "Plant ops · 24 members" },
  { id: "waylight", name: "Waylight Pay", detail: "Payments · 9 members" },
  { id: "fernworks", name: "Fernworks", detail: "Nursery · 4 members" },
  { id: "driftline", name: "Driftline", detail: "Freight · 15 members" },
];

const MORE: KeyRingWorkspace[] = [
  { id: "kestrel", name: "Kestrel Press", detail: "Publishing · 3 members" },
  { id: "moorgate", name: "Moorgate Studio", detail: "Design · 7 members" },
  { id: "tidewell", name: "Tidewell", detail: "Utilities · 11 members" },
];

/**
 * The workspace switcher in Basinworks' sidebar: every team the visitor
 * belongs to is a key on the ring, and a new workspace goes on at the split.
 */
export function KeyRingDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState(FIRST);
  const [id, setId] = React.useState("coldbrook");
  const current = list.find((w) => w.id === id);
  const next = MORE[list.length - FIRST.length];

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <KeyRing
        label="Workspaces"
        workspaces={list}
        value={id}
        onValueChange={setId}
        onAdd={
          next
            ? () => {
                setList((l) => [...l, next]);
                setId(next.id);
              }
            : undefined
        }
        sound={sound}
        {...values}
      />
      {chrome && current ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{current.name}</span> · {list.length}{" "}
          workspaces · drag to turn
        </p>
      ) : null}
    </div>
  );
}
