"use client";

import * as React from "react";

import { CiteMark, type CiteSource } from "@/registry/ui/cite-mark";

/** Gaugeworks Reasoner on Coldbrook Bank's research desk, asked about the dip. */
const SOURCES: CiteSource[] = [
  {
    id: "letter",
    title: "Basinworks quarterly letter",
    site: "basinworks.example",
    excerpt:
      "Two of the three north basin cranes were down for the same fortnight in May, which the yard had not planned for.",
    date: "Jul 2026",
  },
  {
    id: "notes",
    title: "Coldbrook yard notes",
    site: "coldbrook.example",
    excerpt:
      "Crane 2 returned to service on 3 June; crane 3 waited a further nine days for a gearbox from the mainland.",
    date: "Jun 2026",
  },
  {
    id: "rota",
    title: "Fieldline rota export",
    site: "fieldline.example",
    excerpt:
      "Back shifts in May carried 31 overrun hours forward, against 6 in April.",
    date: "Jun 2026",
  },
];

const TEXT =
  "North basin's output dipped in the second quarter because two cranes were out at once[1], and the second took nine more days to return than the first[2]. The crews absorbed the gap as overrun rather than lost shifts[3].";

export function CiteMarkDemo() {
  const [pinned, setPinned] = React.useState<string[]>([]);
  const [hover, setHover] = React.useState<string | null>(null);

  const numberOf = (id: string) => SOURCES.findIndex((s) => s.id === id) + 1;
  const pins = pinned.map(numberOf).join(", ");
  const head = hover ? `Hover ${numberOf(hover)}` : "Idle";
  const tail =
    pinned.length === 0
      ? hover
        ? "none pinned"
        : `${SOURCES.length} sources · none pinned`
      : `Pinned ${pins}`;
  const statusText = `${head} · ${tail}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CiteMark
        label="Answer from Gaugeworks Reasoner"
        text={TEXT}
        sources={SOURCES}
        pinned={pinned}
        onPinnedChange={setPinned}
        onHoverChange={setHover}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
