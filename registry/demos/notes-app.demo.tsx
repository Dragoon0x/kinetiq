"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultNotes, NotesApp } from "@/registry/ui/notes-app";

export const tweaks = defineTweaks({
  pin: {
    kind: "choice",
    label: "Pin",
    default: "section",
    options: ["section", "float", "off"],
    names: { section: "Section", float: "Float", off: "Off" },
  },
  search: {
    kind: "choice",
    label: "Search",
    default: "field",
    options: ["field", "expand", "off"],
    names: { field: "Field", expand: "Expand", off: "Off" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const short = (title: string) => {
  const t = (title || "untitled").toLowerCase();
  return t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t;
};

/**
 * Noor Halvorsen's Fieldline notes on Friday morning: the North basin
 * survey and the bank checklist pinned, a vendor call, a calibration log,
 * and a few of her own.
 */
export function NotesAppDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [notes, setNotes] = React.useState(defaultNotes);
  const [tag, setTag] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [told, setTold] = React.useState<string | null>(null);

  const reset = () => {
    setNotes(defaultNotes);
    setTag(null);
    setQuery("");
    setTold(null);
    setRun((r) => r + 1);
  };

  const app = (
    <NotesApp
      key={run}
      sound={sound}
      {...values}
      notes={notes}
      onNotesChange={setNotes}
      tag={tag}
      onTagChange={(t) => {
        setTag(t);
        setTold(null);
      }}
      query={query}
      onQueryChange={(q) => {
        setQuery(q);
        setTold(null);
      }}
      onPinChange={(id, pinned) => {
        const n = notes.find((x) => x.id === id);
        setTold(`${pinned ? "pinned" : "unpinned"} “${short(n?.title ?? "")}”`);
      }}
      onCreate={() => setTold("new note")}
      onDelete={(n) => setTold(`deleted “${short(n.title)}”`)}
    />
  );

  if (!chrome) return <div className="w-full">{app}</div>;

  const words = query.trim().toLowerCase();
  const inTag = notes.filter((n) => !tag || n.tags.includes(tag));
  const matching = words
    ? inTag.filter((n) =>
        `${n.title} ${n.blocks.map((b) => b.text).join(" ")} ${n.tags.join(" ")}`
          .toLowerCase()
          .includes(words),
      ).length
    : inTag.length;
  const pinned = notes.filter((n) => n.pinned).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {app}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {told ? (
            <>
              <span className="text-signal">{told}</span> · {notes.length} notes
            </>
          ) : words ? (
            <>
              <span className="text-signal">
                {matching} {matching === 1 ? "note matches" : "notes match"}
              </span>{" "}
              · “{words}”
            </>
          ) : (
            <>
              <span className="text-signal">
                {tag ? `#${tag}` : "all notes"}
              </span>{" "}
              · {matching} {matching === 1 ? "note" : "notes"} · {pinned} pinned
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
