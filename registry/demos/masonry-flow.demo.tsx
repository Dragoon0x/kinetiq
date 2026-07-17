"use client";

import * as React from "react";

import { MasonryFlow, type MasonryItem } from "@/registry/ui/masonry-flow";

type Note = { id: string; kind: "spec" | "note" | "flag"; title: string; body: string };

const NOTES: Note[] = [
  { id: "n1", kind: "spec", title: "Bore", body: "4.6 mm nominal, held inside a tenth across two passes." },
  { id: "n2", kind: "note", title: "Draft", body: "The rig drifts about a tenth a month; recalibrate on the 14th." },
  { id: "n3", kind: "flag", title: "Jig", body: "Re-seat before the next cut — pass three ran wide." },
  { id: "n4", kind: "spec", title: "Rate", body: "48 kHz capture." },
  { id: "n5", kind: "note", title: "Finish", body: "Cobalt housing, brass collar, oxide seal ring on the flange." },
  { id: "n6", kind: "flag", title: "Pressure", body: "Nine tonnes; the press lost it once mid-cycle." },
  { id: "n7", kind: "spec", title: "Seal", body: "Two-stage." },
];

const KINDS = [
  { value: "all", label: "All" },
  { value: "spec", label: "Spec" },
  { value: "note", label: "Note" },
  { value: "flag", label: "Flag" },
] as const;

const TONE: Record<Note["kind"], string> = {
  spec: "text-ink-3",
  note: "text-[var(--signal,var(--primary))]",
  flag: "text-warn",
};

export function MasonryFlowDemo() {
  const [filter, setFilter] = React.useState<string>("all");

  const items: MasonryItem[] = NOTES.filter(
    (note) => filter === "all" || note.kind === filter,
  ).map((note) => ({
    id: note.id,
    node: (
      <div className="border-hairline bg-surface-1 rounded-3 border p-3">
        <p className={`text-label ${TONE[note.kind]}`}>{note.kind}</p>
        <p className="mt-1.5 text-sm font-semibold">{note.title}</p>
        <p className="text-ink-2 mt-1 text-sm">{note.body}</p>
      </div>
    ),
  }));

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((kind) => (
          <button
            key={kind.value}
            type="button"
            aria-pressed={filter === kind.value}
            onClick={() => setFilter(kind.value)}
            className={`rounded-2 border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors ${
              filter === kind.value
                ? "border-hairline-strong bg-surface-2 text-ink"
                : "border-input text-ink-3 hover:text-ink"
            }`}
          >
            {kind.label}
          </button>
        ))}
      </div>

      <MasonryFlow items={items} minColumnWidth="9rem" />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Showing{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {items.length}
        </span>{" "}
        of {NOTES.length}
      </p>
    </div>
  );
}
