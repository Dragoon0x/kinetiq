"use client";

import * as React from "react";

import {
  GoldCompare,
  type GoldCompareResult,
} from "@/registry/ui/gold-compare";

/** Three short-answer cases from a Fernworks Model 3 suite, each with its gold. */
const CASES = [
  {
    id: "c1",
    answer:
      "The Basin river reaches the coast at Coldbrook, about forty kilometres south of the old ferry crossing.",
    reference:
      "The Basin river reaches the sea at Coldbrook, roughly forty kilometres south of the ferry crossing.",
  },
  {
    id: "c2",
    answer:
      "Twelve litres is 12,000 millilitres, so the tank holds three times what the label says.",
    reference:
      "Twelve litres is 12,000 millilitres, so the tank holds four times what the label says.",
  },
  {
    id: "c3",
    answer:
      "Refunds are paid within ten working days once the item arrives back at the depot.",
    reference:
      "Refunds are issued within fourteen days of the return arriving at the depot.",
  },
] as const;

export function GoldCompareDemo() {
  const [index, setIndex] = React.useState(0);
  const [diffOnly, setDiffOnly] = React.useState(false);
  // The result is kept with the case it belongs to, so a case switch never
  // shows the previous case's figures for a frame.
  const [result, setResult] = React.useState<{
    id: string;
    value: GoldCompareResult;
  } | null>(null);

  const current = CASES[index] ?? CASES[0];
  const figures = result && result.id === current.id ? result.value : null;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <GoldCompare
        answer={current.answer}
        reference={current.reference}
        diffOnly={diffOnly}
        onDiffOnlyChange={setDiffOnly}
        onCompare={(value) => setResult({ id: current.id, value })}
      />

      <div className="flex items-center gap-2">
        {CASES.map((entry, position) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={position === index}
            onClick={() => setIndex(position)}
            className={
              "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
              (position === index
                ? "border-primary bg-primary text-primary-foreground"
                : "border-hairline-strong hover:bg-accent")
            }
          >
            Case {position + 1}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Case {index + 1} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {figures ? `${figures.similarity}% alike` : "diffing"}
        </span>
        {figures ? ` · ${figures.differing} differ` : ""} ·{" "}
        {diffOnly ? "differences only" : "full text"}
      </p>
    </div>
  );
}
