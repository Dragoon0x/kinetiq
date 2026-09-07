"use client";

import * as React from "react";

import { LetterIndex } from "@/registry/ui/letter-index";

const GROUPS = [
  { letter: "A", items: ["Ada Kelver", "Arno Bight"] },
  { letter: "B", items: ["Bel Marrowe", "Brix Tannen"] },
  { letter: "C", items: ["Cora Fenwick", "Cyd Almer"] },
  { letter: "D", items: ["Dara Holt", "Dov Sarkin"] },
  { letter: "E", items: ["Elin Rask"] },
  { letter: "F", items: ["Fen Oduya", "Freya Salt"] },
  { letter: "H", items: ["Halden Cray", "Hesper Vane"] },
  { letter: "K", items: ["Kit Amberly", "Kova Lind"] },
  { letter: "L", items: ["Lune Farrow", "Lys Tabard"] },
  { letter: "M", items: ["Mara Quill", "Mirek Sand"] },
  { letter: "N", items: ["Nell Arbor"] },
  { letter: "P", items: ["Pell Runcie", "Piet Harrow"] },
  { letter: "R", items: ["Rey Calloway", "Rilke Vost"] },
  { letter: "S", items: ["Sable Nix", "Soren Petch"] },
  { letter: "T", items: ["Tam Wrenfield"] },
];

export function LetterIndexDemo() {
  const list = React.useRef<HTMLDivElement>(null);
  const [letter, setLetter] = React.useState("A");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-border bg-card">
        <div ref={list} className="h-[280px] overflow-y-auto pr-7">
          {GROUPS.map((group) => (
            <section key={group.letter}>
              <h3
                data-letter={group.letter}
                className="sticky top-0 z-[1] border-b border-hairline bg-card px-3 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {group.letter}
              </h3>
              <ul>
                {group.items.map((name) => (
                  <li
                    key={name}
                    className="flex h-10 items-center gap-3 border-b border-hairline px-3 text-sm last:border-0"
                  >
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-[10px] font-semibold text-cobalt-bright"
                    >
                      {name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 truncate">{name}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <LetterIndex
          groups={GROUPS}
          container={list}
          onSelect={setLetter}
          label="Jump to contacts letter"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Letter{" "}
        <span className="text-[var(--signal,var(--primary))]">{letter}</span>
      </p>
    </div>
  );
}
