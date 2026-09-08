"use client";

import * as React from "react";

import {
  ExplorerSearch,
  type ExplorerHit,
  type ExplorerKind,
} from "@/registry/ui/explorer-search";

const TX = "0x7b3c91ae204f68d5c1a7e93b0d4628fa5c07be1394d2af86015c73e9b248dfa0";
const ACCOUNT = "0x9f42c07be1394d2af86015c73e9b248dfa05c1a7";
const HEIGHT = "4812907";

/** Seeded specimens — a fake chain's records, fixed so every render agrees. */
const RECORDS: Record<string, ExplorerHit> = {
  [TX]: {
    kind: "hash",
    id: TX,
    title: "Transfer to Fernworks Supply",
    rows: [
      { label: "Status", value: "Confirmed", tone: "success" },
      { label: "Block", value: "4,812,907" },
      { label: "Value", amount: 1240 },
      { label: "Fee", amount: 0.42 },
    ],
  },
  [ACCOUNT]: {
    kind: "address",
    id: ACCOUNT,
    title: "Coldbrook treasury",
    rows: [
      { label: "Balance", amount: 84210.5 },
      { label: "Transactions", value: "2,318" },
      { label: "First seen", value: "Block 3,004,112" },
    ],
  },
  [HEIGHT]: {
    kind: "block",
    id: HEIGHT,
    title: "Block 4,812,907",
    rows: [
      { label: "Transactions", value: "184" },
      { label: "Sealed", value: "2.1s ago" },
      { label: "Fees", amount: 31.08 },
    ],
  },
};

const SPECIMENS = [
  { label: "Hash", query: TX },
  { label: "Address", query: ACCOUNT },
  { label: "Block", query: HEIGHT },
  // A well-formed address the chain has never seen, so the not-found card is
  // one press away; a malformed string would only ever earn the hint.
  { label: "Unknown", query: "0x91ae204f68d5c1a7e93b4c07d2e5f8a1b6c3d9e0" },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ExplorerSearchDemo() {
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<ExplorerKind>("unknown");
  const [outcome, setOutcome] = React.useState("typing");

  const state =
    outcome === "typing" && kind !== "unknown" ? "resolving" : outcome;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SPECIMENS.map((specimen) => (
          <button
            key={specimen.label}
            type="button"
            className={BUTTON}
            onClick={() => {
              setQuery(specimen.query);
              setOutcome("typing");
            }}
          >
            {specimen.label}
          </button>
        ))}
      </div>

      <ExplorerSearch
        label="Basinworks explorer"
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setOutcome("typing");
        }}
        resolve={(text) => RECORDS[text] ?? null}
        onKindChange={setKind}
        onResolved={(hit) => setOutcome(hit ? "resolved" : "no match")}
        onOpen={() => setOutcome("opened")}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Explorer {kind} <span className="text-cobalt-bright">{state}</span>
      </p>
    </div>
  );
}
