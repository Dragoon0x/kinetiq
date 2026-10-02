"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultContext,
  defaultModels,
  PromptDock,
  type DockItem,
} from "@/registry/ui/prompt-dock";

export const tweaks = defineTweaks({
  tray: {
    kind: "choice",
    label: "Tray",
    default: "open",
    options: ["open", "count", "auto"],
    names: { open: "Open", count: "Count", auto: "Auto" },
  },
  limit: {
    kind: "range",
    label: "Limit",
    default: 8000,
    min: 4000,
    max: 16000,
    step: 2000,
    unit: "tokens",
  },
  model: {
    kind: "choice",
    label: "Model",
    default: "model-3",
    options: ["model-3", "reasoner", "swift"],
    names: { "model-3": "Model 3", reasoner: "Reasoner", swift: "Swift" },
  },
});

const k = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`;
const nameOf = (id: string) =>
  (defaultModels.find((m) => m.id === id)?.short ?? id).toLowerCase();

/**
 * Waylight Pay's ops assistant: the March payouts sheet, the payout policy
 * and the cut-off rule are already in context. A send writes a reply for
 * 2.4 s unless it is stopped.
 */
export function PromptDockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const limit = values.limit ?? 8000;
  const [generating, setGenerating] = React.useState(false);
  const [context, setContext] = React.useState<DockItem[]>(defaultContext);
  const [typed, setTyped] = React.useState(0);
  const [model, setModel] = React.useState<string>(values.model ?? "model-3");
  const [note, setNote] = React.useState<[string, string] | null>(null);

  // The tweak picks the model too; the dock slides to it.
  const [seen, setSeen] = React.useState(values.model);
  if (seen !== values.model) {
    setSeen(values.model);
    if (values.model) setModel(values.model);
  }

  React.useEffect(() => {
    if (!generating) return;
    const id = window.setTimeout(() => {
      setGenerating(false);
      setNote(["reply written", nameOf(model)]);
    }, 2400);
    return () => window.clearTimeout(id);
  }, [generating, model]);

  const tokens =
    context.reduce((sum, i) => sum + i.tokens, 0) + Math.ceil(typed / 4);
  const line: [string, string] = generating
    ? ["generating", `${nameOf(model)} · esc to stop`]
    : tokens > limit
      ? ["over the limit", `by ${k(tokens - limit)} tokens`]
      : (note ?? [
          "ready",
          `${context.length} in context · ${k(tokens)} of ${k(limit)}`,
        ]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PromptDock
        maxRows={chrome ? 4 : 2}
        generating={generating}
        onGeneratingChange={setGenerating}
        onValueChange={(text) => {
          setTyped(text.length);
          setNote(null);
        }}
        onContextChange={(items) => {
          setContext(items);
          setNote(null);
        }}
        onSend={(message) =>
          setNote([
            "sent",
            `${message.context.length} items · ${nameOf(message.model)}`,
          ])
        }
        onStop={() => setNote(["stopped", "reply cut short"])}
        onModelChange={(id) => {
          setModel(id);
          setNote(["model", nameOf(id)]);
        }}
        sound={sound}
        {...values}
        model={model}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {line[1] ? ` · ${line[1]}` : null}
        </p>
      ) : null}
    </div>
  );
}
