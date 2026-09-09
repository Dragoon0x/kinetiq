"use client";

import * as React from "react";

import { PagePin, type PagePinCitation } from "@/registry/ui/page-pin";

/** Three claims from Gaugeworks Reasoner, each pinned to the letter's page. */
const CITATIONS: PagePinCitation[] = [
  { id: "deposits", label: "Deposits up 4.2%", page: 14, lines: [3, 6] },
  { id: "lending", label: "Lending flat", page: 3, lines: [7, 9] },
  { id: "branches", label: "Branch costs rose", page: 21, lines: [1, 4] },
];

const PAGES = 24;

export function PagePinDemo() {
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  const citation = CITATIONS.find((entry) => entry.id === chosen);
  const status = `Page ${page} of ${PAGES} · ${citation ? citation.label : "nothing pinned"}`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <PagePin
        label="Preview of the Basinworks quarterly letter"
        title="Basinworks quarterly letter"
        pageCount={PAGES}
        citations={CITATIONS}
        value={chosen}
        onValueChange={setChosen}
        onPageChange={setPage}
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
