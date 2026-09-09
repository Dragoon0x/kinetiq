"use client";

import * as React from "react";

import {
  RedactVeil,
  type VeilChange,
  type VeilSegment,
} from "@/registry/ui/redact-veil";

/** Gaugeworks Reasoner in Coldbrook Bank's agent desk, asked where a refund went. */
const SEGMENTS: VeilSegment[] = [
  "The refund of 48.00 went back to the account ending in ",
  { id: "account", text: "40-22-71 18834902", kind: "account" },
  " on the 3rd. The receipt was sent to ",
  { id: "email", text: "mara.q@fernworks.post", kind: "email" },
  " and a text to ",
  { id: "phone", text: "07700 900312", kind: "phone" },
  ".",
];
const TOTAL = SEGMENTS.filter((segment) => typeof segment !== "string").length;

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function RedactVeilDemo() {
  const [revealed, setRevealed] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<VeilChange | null>(null);

  const veiled = TOTAL - revealed.length;
  const status = !last
    ? `${veiled} veiled · hover or press a bar`
    : last.revealed
      ? `Lifted · ${last.id} · ${veiled} veiled`
      : `Re-veiled by ${last.by} · ${last.id} · ${veiled} veiled`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RedactVeil
        label="Gaugeworks Reasoner"
        segments={SEGMENTS}
        revealed={revealed}
        onRevealChange={(ids, change) => {
          setRevealed(ids);
          setLast(change);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={revealed.length === 0}
          onClick={() => {
            setRevealed([]);
            setLast(null);
          }}
          className={button}
        >
          Veil all
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
