"use client";

import * as React from "react";

import { InvoiceBuild, type InvoiceLine } from "@/registry/ui/invoice-build";

const OPENING: InvoiceLine[] = [
  { id: "rig", description: "Rig hire", qty: 3, unitPrice: 120 },
  { id: "survey", description: "Site survey", qty: 1, unitPrice: 480 },
  { id: "spool", description: "Cable spool", qty: 12, unitPrice: 18.5 },
];

/** A seeded script, so the demo adds the same lines in the same order every run. */
const SCRIPT: InvoiceLine[] = [
  { id: "mast", description: "Mast section", qty: 2, unitPrice: 264 },
  { id: "haul", description: "Haulage, depot to site", qty: 1, unitPrice: 315 },
  { id: "crew", description: "Crew day rate", qty: 4, unitPrice: 210 },
  { id: "permit", description: "Road permit", qty: 1, unitPrice: 96.4 },
  { id: "spare", description: "Spare clamp set", qty: 6, unitPrice: 27.75 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function InvoiceBuildDemo() {
  const [lines, setLines] = React.useState(OPENING);
  const [added, setAdded] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);

  const addLine = () => {
    const next = SCRIPT[added];
    if (!next) return;
    setLines((current) => [...current, next]);
    setAdded((count) => count + 1);
    setLast(`added ${next.description}`);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <InvoiceBuild
        label="Invoice FW-2214"
        lines={lines}
        note="Fernworks Fabrication · net 14 days"
        onTotalChange={setTotal}
        onRemove={(id) => {
          setLast(
            `removed ${lines.find((line) => line.id === id)?.description ?? id}`,
          );
          setLines((current) => current.filter((line) => line.id !== id));
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={added >= SCRIPT.length}
          onClick={addLine}
        >
          Add line
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={added === 0 && lines.length === OPENING.length}
          onClick={() => {
            setLines(OPENING);
            setAdded(0);
            setLast(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Lines {lines.length} · total{" "}
        <span className="text-signal">{money.format(total)}</span>
        {last ? ` · ${last}` : null}
      </p>
    </div>
  );
}
