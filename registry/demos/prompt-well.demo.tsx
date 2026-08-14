"use client";

import * as React from "react";

import { PromptWell, type WellOption } from "@/registry/ui/prompt-well";

const SOURCES: WellOption[] = [
  { id: "s1", label: "scoop-data", hint: "metrics" },
  { id: "s2", label: "flavour-records", hint: "26 makers" },
  { id: "s3", label: "supplier-ledger", hint: "csv" },
  { id: "s4", label: "cold-chain-sop", hint: "pdf" },
];

const COMMANDS: WellOption[] = [
  { id: "c1", label: "summarise", hint: "⌘1" },
  { id: "c2", label: "compare", hint: "⌘2" },
  { id: "c3", label: "reorder", hint: "⌘3" },
];

export function PromptWellDemo() {
  const [sent, setSent] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const submit = (value: string) => {
    setSent(value);
    setBusy(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBusy(false), 1600);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <PromptWell
        sources={SOURCES}
        commands={COMMANDS}
        onSubmit={submit}
        busy={busy}
        onStop={() => setBusy(false)}
        placeholder="Ask, or type @ for a source and / for a command…"
        aria-label="Ask the bench"
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        {busy ? "Working" : "Last sent"}{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {sent ? `“${sent}”` : "nothing yet"}
        </span>
      </p>
    </div>
  );
}
