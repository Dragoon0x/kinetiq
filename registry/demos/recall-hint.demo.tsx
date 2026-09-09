"use client";

import * as React from "react";

import { RecallHint, type RecallMemory } from "@/registry/ui/recall-hint";

/** What Fernworks Model 3 remembers about the Basinworks yard, by the word that recalls it. */
const MEMORIES: { key: string; memory: RecallMemory }[] = [
  { key: "invoice", memory: { id: "pdf", fact: "Prefers PDF invoices" } },
  {
    key: "yard",
    memory: { id: "yard", fact: "Ships from the Basinworks yard" },
  },
  {
    key: "pay",
    memory: { id: "terms", fact: "Pays through Waylight Pay, net 30" },
  },
];

const SAMPLES = [
  {
    label: "Ask about the invoice",
    draft: "Can you resend the March invoice?",
  },
  {
    label: "Ask about the yard",
    draft: "When can the yard take the next delivery?",
  },
];

/** The memory whose word appears earliest in the draft. */
function recall(draft: string): RecallMemory | null {
  const lower = draft.toLowerCase();
  let best: { at: number; memory: RecallMemory } | null = null;
  for (const { key, memory } of MEMORIES) {
    const at = lower.indexOf(key);
    if (at >= 0 && (best === null || at < best.at)) best = { at, memory };
  }
  return best?.memory ?? null;
}

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RecallHintDemo() {
  const [draft, setDraft] = React.useState("");
  const [context, setContext] = React.useState<RecallMemory[]>([]);
  const [sent, setSent] = React.useState<number | null>(null);

  const memory = recall(draft);
  const last = context[context.length - 1];

  const status =
    sent !== null
      ? `Sent · ${sent} ${sent === 1 ? "memory" : "memories"} attached`
      : last
        ? `Context ${context.length} · ${last.fact}`
        : memory
          ? `Hint · ${memory.fact}`
          : "No memory applies · type invoice, yard or pay";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RecallHint
        label="Reply to the Basinworks yard"
        memory={memory}
        value={draft}
        onValueChange={(next) => {
          setDraft(next);
          setSent(null);
        }}
        context={context}
        onContextChange={setContext}
        onSend={(_value, attached) => {
          setSent(attached.length);
          setDraft("");
          setContext([]);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            onClick={() => {
              setDraft(sample.draft);
              setSent(null);
            }}
            className={buttonClass}
          >
            {sample.label}
          </button>
        ))}
        <button
          type="button"
          disabled={draft === "" && context.length === 0 && sent === null}
          onClick={() => {
            setDraft("");
            setContext([]);
            setSent(null);
          }}
          className={buttonClass}
        >
          Clear
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
