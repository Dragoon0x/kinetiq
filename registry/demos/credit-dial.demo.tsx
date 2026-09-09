"use client";

import * as React from "react";

import {
  CreditDial,
  DEFAULT_CREDIT_BANDS,
  type CreditBand,
} from "@/registry/ui/credit-dial";

/** Seeded readings, oldest first. */
const READINGS = [612, 668, 655, 712, 743, 698];
const BANDS: CreditBand[] = DEFAULT_CREDIT_BANDS;

const bandOf = (score: number) =>
  BANDS.reduce<CreditBand>(
    (found, band) => (score >= band.from ? band : found),
    BANDS[0]!,
  );

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function CreditDialDemo() {
  const [index, setIndex] = React.useState(0);
  const [settled, setSettled] = React.useState<number | null>(null);

  const score = READINGS[index] ?? READINGS[0]!;
  const previous = index > 0 ? READINGS[index - 1] : undefined;
  const delta = previous === undefined ? 0 : score - previous;
  const move =
    delta === 0 ? "" : ` | ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`;
  const status =
    settled === score
      ? `${score} · ${bandOf(score).label}${move}`
      : `sweeping to ${score}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <CreditDial
        label="Basin score"
        score={score}
        previous={previous}
        bands={BANDS}
        onSettle={setSettled}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={index >= READINGS.length - 1}
          onClick={() => setIndex((value) => value + 1)}
        >
          Next reading
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={index === 0}
          onClick={() => setIndex(0)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basin score{" "}
        <span className="text-cobalt-bright tabular-nums">{status}</span>
      </p>
    </div>
  );
}
