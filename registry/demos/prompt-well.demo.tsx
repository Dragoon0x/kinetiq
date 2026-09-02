"use client";

import * as React from "react";

import {
  PromptWell,
  type WellAttachment,
  type WellOption,
} from "@/registry/ui/prompt-well";

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

const INITIAL_ATTACHMENTS: WellAttachment[] = [
  { id: "a1", name: "flavour-photo.jpg", kind: "image", size: "2.1 MB" },
  { id: "a2", name: "supplier-ledger.csv", kind: "file", size: "48 KB" },
];

const EXTRA_ATTACHMENT: WellAttachment = {
  id: "a3",
  name: "cold-chain-sop.pdf",
  kind: "file",
  size: "180 KB",
};

const QUEUED = [
  "Chart the pour rates for the west line",
  "Draft a reorder list for cold storage",
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

  const [attachments, setAttachments] = React.useState(INITIAL_ATTACHMENTS);
  const [loadedBusy, setLoadedBusy] = React.useState(true);

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((a) => a.id !== id));
  };

  const addAttachment = () => {
    setAttachments((current) =>
      current.some((a) => a.id === EXTRA_ATTACHMENT.id)
        ? current
        : [...current, EXTRA_ATTACHMENT],
    );
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
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {busy ? "Working" : "Last sent"}{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {sent ? `“${sent}”` : "nothing yet"}
        </span>
      </p>

      <p className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        Loaded composer — attachments, queue, credits
      </p>

      <PromptWell
        sources={SOURCES}
        commands={COMMANDS}
        busy={loadedBusy}
        onStop={() => setLoadedBusy(false)}
        queued={QUEUED}
        attachments={attachments}
        onAttach={addAttachment}
        onRemoveAttachment={removeAttachment}
        credits={{ used: 41, limit: 60 }}
        placeholder="Ask, or type @ for a source and / for a command…"
        aria-label="Ask the loaded bench"
      />
    </div>
  );
}
