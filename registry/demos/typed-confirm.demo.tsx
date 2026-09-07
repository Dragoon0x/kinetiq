"use client";

import * as React from "react";

import { TypedConfirm } from "@/registry/ui/typed-confirm";

const PHRASE = "fernworks-prod";

const FACTS = [
  { label: "Region", value: "eu-west-2" },
  { label: "Volumes", value: "42" },
  { label: "Last deploy", value: "4h ago" },
  { label: "Owner", value: "platform" },
  { label: "Plan", value: "dedicated" },
];

export function TypedConfirmDemo() {
  const [open, setOpen] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);
  const [match, setMatch] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
          <span className="truncate font-mono text-sm font-medium">
            {PHRASE}
          </span>
          <span
            className={`shrink-0 rounded-full border border-hairline-strong px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase ${
              deleted ? "text-ink-3" : "text-success"
            }`}
          >
            {deleted ? "Removed" : "Live"}
          </span>
        </div>

        <dl className="px-3">
          {FACTS.map((fact) => (
            <div
              key={fact.label}
              className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-b-0"
            >
              <dt className="min-w-0 truncate text-xs text-ink-3">
                {fact.label}
              </dt>
              <dd className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-hairline p-3">
          {deleted ? (
            <button
              type="button"
              onClick={() => setDeleted(false)}
              className="flex h-9 w-full items-center justify-center rounded-2 border border-hairline-strong text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Recreate environment
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMatch(0);
                setOpen(true);
              }}
              className="flex h-9 w-full items-center justify-center rounded-2 border border-danger/40 text-sm font-medium text-danger transition-colors outline-none hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Delete environment
            </button>
          )}
        </div>

        <TypedConfirm
          open={open}
          onOpenChange={setOpen}
          phrase={PHRASE}
          title="Delete this environment"
          description="Its 42 volumes go with it. Type the name to confirm."
          confirmLabel="Delete"
          onConfirm={() => setDeleted(true)}
          onMatchChange={setMatch}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {deleted ? (
          <>
            <span className="text-signal">{PHRASE}</span> deleted
          </>
        ) : (
          <>
            Match{" "}
            <span className="text-signal tabular-nums">
              {match}/{PHRASE.length}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
