"use client";

import * as React from "react";

import { ConsentSlab } from "@/registry/ui/consent-slab";

const CATEGORIES = [
  {
    id: "necessary",
    label: "Necessary",
    blurb: "Session and security. Always on.",
    locked: true,
  },
  {
    id: "analytics",
    label: "Analytics",
    blurb: "Which pages get read, counted in aggregate.",
  },
  {
    id: "personalisation",
    label: "Personalisation",
    blurb: "Remembers your units and column layout.",
  },
  {
    id: "marketing",
    label: "Marketing",
    blurb: "Measures campaigns run off site.",
  },
];

const LABELS = new Map(CATEGORIES.map((entry) => [entry.id, entry.label]));

export function ConsentSlabDemo() {
  const [open, setOpen] = React.useState(true);
  const [granted, setGranted] = React.useState<string[] | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="relative h-[280px] w-full overflow-hidden rounded-3 border border-border bg-surface-1">
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <span className="block text-sm font-semibold">Basinworks</span>
            <span className="block text-[11px] text-ink-3">
              Groundwater records, 1974 onward
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setGranted(null);
              setOpen(true);
            }}
            className="h-8 shrink-0 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Reset
          </button>
        </div>

        <ConsentSlab
          categories={CATEGORIES}
          open={open}
          onOpenChange={setOpen}
          onDecision={setGranted}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {granted === null ? (
          "Awaiting a choice"
        ) : (
          <>
            Allowed{" "}
            <span className="text-signal">
              {granted.map((id) => LABELS.get(id) ?? id).join(", ")}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
