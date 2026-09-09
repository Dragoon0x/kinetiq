"use client";

import * as React from "react";

import {
  SourceMap,
  type SourceMapParagraph,
  type SourceMapSource,
} from "@/registry/ui/source-map";

/** Gaugeworks Reasoner, asked why Coldbrook's deposits rose this quarter. */
const SOURCES: SourceMapSource[] = [
  {
    id: "letter",
    label: "Basinworks quarterly letter",
    domain: "basinworks.example",
  },
  { id: "rates", label: "Savings rates", domain: "coldbrook.example" },
  { id: "survey", label: "Branch survey", domain: "fieldline.example" },
];

const PARAGRAPHS: SourceMapParagraph[] = [
  {
    id: "p1",
    text: "Deposits rose 4.2% over the quarter, the strongest gain in two years.",
    sources: ["letter"],
  },
  {
    id: "p2",
    text: "Most of it came from the Easy saver range after the May rate change lifted the headline rate to 3.9%.",
    sources: ["letter", "rates"],
  },
  {
    id: "p3",
    text: "Branch staff report new savers asking for the rate by name, which the survey had not seen before.",
    sources: ["survey"],
  },
];

const indexOf = (id: string | null) =>
  PARAGRAPHS.findIndex((paragraph) => paragraph.id === id);

export function SourceMapDemo() {
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);

  const shown = active ?? pinned;
  const index = indexOf(shown);
  const paragraph = index >= 0 ? PARAGRAPHS[index] : undefined;
  const count = paragraph?.sources.length ?? 0;
  const noun = count === 1 ? "source" : "sources";

  const status =
    paragraph === undefined
      ? "Hover or press a paragraph"
      : pinned === shown
        ? `Pinned paragraph ${index + 1} · ${count} ${noun}`
        : `Paragraph ${index + 1} · ${count} ${noun}`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <SourceMap
        label="Why deposits rose"
        paragraphs={PARAGRAPHS}
        sources={SOURCES}
        value={pinned}
        onValueChange={setPinned}
        onActiveChange={setActive}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
