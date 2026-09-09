"use client";

import * as React from "react";

import { ConfidenceBand, type BandClaim } from "@/registry/ui/confidence-band";

/** Fernworks Model 3 asked whether the Coldbrook ferry runs on Sunday. */
const CLAIMS: BandClaim[] = [
  {
    id: "timetable",
    text: "The Coldbrook ferry runs a reduced Sunday timetable of four crossings.",
    confidence: 0.92,
  },
  {
    id: "first",
    text: "The first crossing leaves the north pier at 08:40.",
    confidence: 0.74,
  },
  {
    id: "weather",
    text: "This Sunday's crossings are likely to be cancelled for weather.",
    confidence: 0.38,
  },
  {
    id: "tickets",
    text: "Tickets are sold on board and at the pier kiosk.",
    confidence: 0.86,
  },
];

const LOW_AT = 0.5;
const HIGH_AT = 0.8;

const toneOf = (confidence: number) =>
  confidence < LOW_AT ? "low" : confidence < HIGH_AT ? "unsure" : "confident";

const button =
  "flex h-8 items-center rounded-2 border border-hairline bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ConfidenceBandDemo() {
  const [read, setRead] = React.useState<string | null>(null);
  const [held, setHeld] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const lowCount = CLAIMS.filter((claim) => claim.confidence < LOW_AT).length;
  const claim = read ? CLAIMS.find((c) => c.id === read) : undefined;
  const statusText = claim
    ? `Reading ${CLAIMS.indexOf(claim) + 1} of ${CLAIMS.length} · ${Math.round(claim.confidence * 100)}% · ${toneOf(claim.confidence)}${held === claim.id ? " · held" : ""}`
    : `${CLAIMS.length} claims · ${lowCount} low · hover a claim`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* A new key remounts the paragraph so the cascade and the pulse run again. */}
      <ConfidenceBand
        key={run}
        label="Answer from Fernworks Model 3"
        claims={CLAIMS}
        lowAt={LOW_AT}
        highAt={HIGH_AT}
        onReadChange={setRead}
        onHoldChange={setHeld}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRead(null);
            setHeld(null);
            setRun((n) => n + 1);
          }}
          className={button}
        >
          Replay
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
