"use client";

import * as React from "react";

import {
  ContextChips,
  formatSize,
  type ContextItem,
  type ContextKind,
} from "@/registry/ui/context-chips";

/** What a Fieldline brief usually pulls in, in the order it arrives. */
const SAMPLES: Omit<ContextItem, "id">[] = (
  [
    [
      "file",
      "sync-plan.md",
      2148,
      "# Sync fix rollout\n\nQueued badge while a report waits for signal.\nRetry on a backoff of 2, 8 and 30 seconds.",
    ],
    [
      "page",
      "Release notes 4.2",
      6410,
      "Fieldline 4.2\nThe sync fix ships. Crews see a queued badge while a report waits for signal; the desk app shows a last-synced time.",
    ],
    [
      "selection",
      "retry.ts · 12–18",
      412,
      "const BACKOFF = [2, 8, 30];\nexport const nextDelay = (attempt: number) =>\n  BACKOFF[Math.min(attempt, BACKOFF.length - 1)];",
    ],
    [
      "file",
      "costs.csv",
      1920,
      "site,crew,hours,cost\nBasin North,4,38,2960\nColdbrook,3,21,1680",
    ],
    [
      "page",
      "Rollout plan",
      3072,
      "Week 1: Basin North crews.\nWeek 2: every field crew.\nWeek 3: the desk app.",
    ],
    [
      "selection",
      "README · 40–44",
      640,
      "Reports sync when a crew has signal.\nA dead spot no longer drains the battery.",
    ],
  ] satisfies [ContextKind, string, number, string][]
).map(([kind, name, size, preview]) => ({ kind, name, size, preview }));

/** What Fernworks Model 3 can take, in bytes. */
const BUDGET = 32768;

const KINDS: ContextKind[] = ["file", "page", "selection"];

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-40";

export function ContextChipsDemo() {
  const [items, setItems] = React.useState<ContextItem[]>([]);
  const [previewing, setPreviewing] = React.useState<string | null>(null);

  // Ids are the sample's index, so a cleared and re-added item is the same
  // item, and each button takes the next sample of its kind not yet in.
  const has = (at: number) => items.some((item) => item.id === `s-${at}`);
  const add = (kind: ContextKind) => {
    const at = SAMPLES.findIndex((s, i) => s.kind === kind && !has(i));
    const sample = SAMPLES[at];
    if (sample) setItems((prev) => [...prev, { ...sample, id: `s-${at}` }]);
  };

  const total = items.reduce((sum, item) => sum + item.size, 0);
  const count = `${items.length} item${items.length === 1 ? "" : "s"}`;
  const shown = items.find((item) => item.id === previewing);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* The turn the context is for; the preview rises over it. */}
      <div className="flex flex-col gap-2">
        <p className="max-w-[85%] self-end rounded-3 rounded-br-1 bg-primary px-3 py-2 text-sm leading-5 text-primary-foreground">
          Pull the sync fix notes together for the crews.
        </p>
        <div className="rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-2">
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Model 3
          </p>
          <p className="text-sm leading-5 text-ink-2">
            Add the plan, the release notes and the retry code, and I will write
            the crew note from those.
          </p>
        </div>
      </div>

      <ContextChips
        label="Context for Fernworks Model 3"
        items={items}
        budget={BUDGET}
        onRemove={(id) =>
          setItems((prev) => prev.filter((item) => item.id !== id))
        }
        onPreview={setPreviewing}
      />

      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-disabled={
              SAMPLES.every((s, i) => s.kind !== kind || has(i)) || undefined
            }
            className={buttonClass}
            onClick={() => add(kind)}
          >
            Add {kind}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          onClick={() => setItems([])}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {items.length === 0
          ? "Empty · add context"
          : shown
            ? `Preview ${shown.name} · ${count}`
            : `${count} · ${formatSize(total)} of ${formatSize(BUDGET)}`}
      </p>
    </div>
  );
}
