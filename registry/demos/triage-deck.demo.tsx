"use client";

import * as React from "react";

import { TriageDeck, type TriageCard } from "@/registry/ui/triage-deck";

type Specimen = {
  id: string;
  serial: string;
  title: string;
  spec: string;
  /** Fixed accent per specimen — deterministic, no runtime randomness. */
  accent: string;
};

const SPECIMENS: Specimen[] = [
  {
    id: "sp-01",
    serial: "SPC-4471",
    title: "Cobalt filament",
    spec: "0.4mm · 1200°C anneal",
    accent: "oklch(0.6 0.2 262)",
  },
  {
    id: "sp-02",
    serial: "SPC-4472",
    title: "Phosphor wafer",
    spec: "76mm · grade A",
    accent: "oklch(0.84 0.16 162)",
  },
  {
    id: "sp-03",
    serial: "SPC-4473",
    title: "Resin coupon",
    spec: "18g · batch 07",
    accent: "oklch(0.79 0.14 80)",
  },
  {
    id: "sp-04",
    serial: "SPC-4474",
    title: "Quartz lens",
    spec: "f/1.8 · AR-coated",
    accent: "oklch(0.7 0.16 320)",
  },
  {
    id: "sp-05",
    serial: "SPC-4475",
    title: "Alloy pin",
    spec: "M2 · 4N purity",
    accent: "oklch(0.64 0.2 25)",
  },
];

function SpecimenCard({ specimen }: { specimen: Specimen }) {
  return (
    <div className="flex h-full w-full flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-label text-ink-3">{specimen.serial}</span>
        <span
          aria-hidden
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: specimen.accent }}
        />
      </div>
      <div>
        <p className="text-foreground text-lg leading-tight font-semibold">
          {specimen.title}
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {specimen.spec}
        </p>
      </div>
      <p className="text-label text-ink-3">Incoming specimen</p>
    </div>
  );
}

const buildCards = (): TriageCard[] =>
  SPECIMENS.map((specimen) => ({
    id: specimen.id,
    content: (
      <div className="h-72 w-64">
        <SpecimenCard specimen={specimen} />
      </div>
    ),
  }));

export function TriageDeckDemo() {
  const [cards, setCards] = React.useState<TriageCard[]>(buildCards);
  const [accepted, setAccepted] = React.useState(0);
  const [rejected, setRejected] = React.useState(0);
  /** Bumped only on reset — remounts the deck without disturbing a live run. */
  const [runId, setRunId] = React.useState(0);

  const handleDecide = React.useCallback(
    (_id: string, decision: "accept" | "reject") => {
      if (decision === "accept") setAccepted((current) => current + 1);
      else setRejected((current) => current + 1);
    },
    [],
  );

  const reset = React.useCallback(() => {
    setAccepted(0);
    setRejected(0);
    setCards(buildCards());
    setRunId((current) => current + 1);
  }, []);

  const cleared = accepted + rejected >= SPECIMENS.length;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <TriageDeck
        key={runId}
        cards={cards}
        onDecide={handleDecide}
        aria-label="Incoming specimens"
      />

      <p
        role="status"
        className="text-label text-muted-foreground border-hairline border-t pt-3 tabular-nums"
      >
        ACCEPTED{" "}
        <span className="text-[var(--signal,var(--primary))]">{accepted}</span>{" "}
        · REJECTED{" "}
        <span className="text-[var(--signal,var(--primary))]">{rejected}</span>
      </p>

      {cleared && (
        <button
          type="button"
          onClick={reset}
          className="border-input hover:bg-accent h-8 rounded-2 border bg-transparent px-3 font-mono text-xs font-medium"
        >
          Reset
        </button>
      )}
    </div>
  );
}
