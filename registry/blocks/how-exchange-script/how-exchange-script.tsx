"use client";

import * as React from "react";

import { VolleyThread, type VolleyMessage } from "@/registry/ui/volley-thread";
import { PressureButton } from "@/registry/ui/pressure-button";
import { cn } from "@/registry/lib/utils";

export type HowExchangeScriptProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The scripted exchange, advanced by the reader. */
  script?: VolleyMessage[];
  /** Turns visible before the reader advances. */
  openingTurns?: number;
  advanceLabel?: string;
  resetLabel?: string;
  className?: string;
};

const DEFAULT_SCRIPT: VolleyMessage[] = [
  { id: "m1", role: "user", content: "What does my Tuesday look like?" },
  {
    id: "m2",
    role: "agent",
    content: "Nine slots across two yards. The crane hold moved your rig test to 13:00 — everything else stands.",
    note: "read: board r2, crane log",
  },
  { id: "m3", role: "user", content: "Can Crew B take the coating pass instead?" },
  {
    id: "m4",
    role: "agent",
    content: "Yes — they're clear from 10:15. Swapped, both boards updated, and the handover note is drafted for your sign-off.",
    note: "wrote: plan r3 · 1 handover",
  },
  { id: "m5", role: "user", content: "Sign it." },
  {
    id: "m6",
    role: "agent",
    content: "Signed and posted. The gate sees r3 now; yesterday's copy is archived with the change attached.",
    note: "ledger row 4,181",
  },
];

/**
 * How it works, as the conversation it actually is: a scripted exchange on
 * the library's own thread — the reader advances it turn by turn and watches
 * the product answer, act, and file the result. The mechanism explains
 * itself in its own medium, and the notes under each reply say what was
 * read and what was written, which is the part worth trusting.
 */
export function HowExchangeScript({
  eyebrow = "Fernworks · how it goes",
  headline = "A morning, in six turns.",
  copy = "This is a real transcript shape — ask, adjust, sign. Advance it and read the notes: every reply says what it read and what it wrote.",
  script = DEFAULT_SCRIPT,
  openingTurns = 2,
  advanceLabel = "Next turn",
  resetLabel = "Start over",
  className,
}: HowExchangeScriptProps) {
  const headingId = React.useId();
  const [turns, setTurns] = React.useState(openingTurns);
  const done = turns >= script.length;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="mt-10">
          <VolleyThread
            messages={script.slice(0, turns)}
            aria-label="How a morning goes"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <PressureButton
            onClick={() => setTurns((n) => Math.min(n + 1, script.length))}
            disabled={done}
          >
            {advanceLabel}
          </PressureButton>
          <PressureButton
            variant="ghost"
            onClick={() => setTurns(openingTurns)}
          >
            {resetLabel}
          </PressureButton>
        </div>
      </div>
    </section>
  );
}
