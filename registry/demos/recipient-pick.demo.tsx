"use client";

import * as React from "react";

import { RecipientPick, type Recipient } from "@/registry/ui/recipient-pick";

const PEOPLE: Recipient[] = [
  {
    id: "mara",
    name: "Mara Vance",
    handle: "@mara.v",
    tint: "var(--accent-bright)",
  },
  { id: "iyad", name: "Iyad Sorel", handle: "@sorel", tint: "var(--success)" },
  { id: "tomas", name: "Tomas Renn", handle: "@t.renn", tint: "var(--warn)" },
  {
    id: "priya",
    name: "Priya Okonkwo",
    handle: "@p.oko",
    tint: "var(--signal)",
  },
  {
    id: "devi",
    name: "Devi Halloran",
    handle: "@d.hall",
    tint: "var(--accent)",
  },
  { id: "ansel", name: "Ansel Boye", handle: "@boye", tint: "var(--danger)" },
];

export function RecipientPickDemo() {
  const [payee, setPayee] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const chosen = PEOPLE.find((person) => person.id === payee);
  const shown = PEOPLE.filter((person) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      person.name.toLowerCase().includes(needle) ||
      person.handle.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 p-3">
        <RecipientPick
          label="Send to"
          people={PEOPLE}
          value={payee}
          onValueChange={setPayee}
          query={query}
          onQueryChange={setQuery}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {chosen ? (
          <>
            To <span className="text-signal">{chosen.name}</span> ·{" "}
            <span className="text-signal">{chosen.handle}</span>
          </>
        ) : (
          <>
            No payee · <span className="text-signal">{shown.length} shown</span>
          </>
        )}
      </p>
    </div>
  );
}
