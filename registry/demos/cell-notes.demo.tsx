"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CellNotes,
  defaultCellNotes,
  type CellNote,
} from "@/registry/ui/cell-notes";

export const tweaks = defineTweaks({
  cornerStyle: {
    kind: "choice",
    label: "Corner",
    default: "fold",
    options: ["fold", "flag", "dot"],
    names: { fold: "Fold", flag: "Flag", dot: "Dot" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/**
 * Finance review of the Fernworks FY27 operating budget: four notes, one
 * resolved, one with a two-reply thread. Click a folded corner, or move with
 * the arrows and press Shift+F2.
 */
export function CellNotesDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [notes, setNotes] = React.useState<CellNote[]>(defaultCellNotes);
  const [active, setActive] = React.useState("B2");
  const [open, setOpen] = React.useState<string | null>(null);
  const [event, setEvent] = React.useState<string | null>(null);

  const reset = () => {
    setNotes(defaultCellNotes);
    setActive("B2");
    setOpen(null);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <CellNotes
      key={round}
      notes={notes}
      onNotesChange={setNotes}
      active={active}
      onActiveChange={(cell) => {
        setActive(cell);
        setEvent(null);
      }}
      open={open}
      onOpenChange={setOpen}
      onAdd={(note) => setEvent(`note added · ${note.cell}`)}
      onReply={(id) => {
        const n = notes.find((x) => x.id === id);
        setEvent(`reply · ${n?.cell ?? ""}`);
      }}
      onResolve={(id, resolved) => {
        const n = notes.find((x) => x.id === id);
        setEvent(`${n?.cell ?? ""} · ${resolved ? "resolved" : "reopened"}`);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const openNote = notes.find((n) => n.id === open);
  const here = notes.find((n) => n.cell === active);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (openNote
              ? `${openNote.cell} · note open · ${openNote.replies.length} ${openNote.replies.length === 1 ? "reply" : "replies"}`
              : `${active} · ${here ? "has a note" : "no note"}`)}
        </span>{" "}
        · {notes.filter((n) => !n.resolved).length} open
      </p>
    </div>
  );
}
