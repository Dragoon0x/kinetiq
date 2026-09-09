"use client";

import * as React from "react";

import { CitationCount } from "@/registry/ui/citation-count";

/** Gaugeworks Reasoner's answer on Coldbrook's quarter makes five claims. */
const CLAIMS = [
  { id: "c1", text: "Deposits rose 4.2% over the quarter." },
  { id: "c2", text: "Most of the growth came from the Easy saver range." },
  { id: "c3", text: "Card spend recovered through the last six weeks." },
  { id: "c4", text: "Refunds ran higher than the same period last year." },
  { id: "c5", text: "Branch costs rose for a third quarter." },
];

/** Where the answer starts: three marks covering two claims. */
const START = { citations: 3, covered: ["c1", "c2"] };

/** The order in which added citations cover the remaining claims. */
const ORDER = ["c4", "c3", "c5"];

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CitationCountDemo() {
  const [citations, setCitations] = React.useState(START.citations);
  const [covered, setCovered] = React.useState<string[]>(START.covered);
  const [open, setOpen] = React.useState(false);

  const addCitation = () => {
    const next = ORDER.find((id) => !covered.includes(id));
    setCitations(citations + 1);
    // A citation on an already-covered claim still counts; it just does not
    // move the ring.
    if (next) setCovered([...covered, next]);
  };

  const reset = () => {
    setCitations(START.citations);
    setCovered(START.covered);
  };

  const claims = CLAIMS.map((claim) => ({
    ...claim,
    covered: covered.includes(claim.id),
  }));

  const status = `${citations} citations · ${covered.length} of ${CLAIMS.length} claims covered`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CitationCount
        citations={citations}
        claims={claims}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addCitation}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          Add citation
        </button>
        <button
          type="button"
          onClick={reset}
          className={`${button} border-hairline-strong bg-surface-0 text-foreground hover:bg-accent`}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
