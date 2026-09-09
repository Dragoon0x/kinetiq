"use client";

import * as React from "react";

import { ThumbsMorph, type ThumbsValue } from "@/registry/ui/thumbs-morph";

const REASONS = [
  { id: "wrong", label: "Wrong" },
  { id: "unclear", label: "Unclear" },
  { id: "long", label: "Too long" },
  { id: "off-topic", label: "Off topic" },
  { id: "unsafe", label: "Unsafe" },
];

const ANSWER =
  "Route 14 is running forty minutes behind because the depot held it for a late trailer. The next two stops will be reached in order; no parcels need re-routing unless the delay passes ninety minutes.";

export function ThumbsMorphDemo() {
  const [verdict, setVerdict] = React.useState<ThumbsValue | null>(null);
  const [chosen, setChosen] = React.useState<string[]>([]);

  const reasonWords = REASONS.filter((reason) => chosen.includes(reason.id))
    .map((reason) => reason.label)
    .join(", ");

  const line =
    verdict === "up"
      ? ["Good answer", ""]
      : verdict === "down"
        ? ["Poor answer ·", reasonWords || "pick a reason"]
        : ["No verdict", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Scout
        </span>
        <p className="text-xs leading-relaxed text-foreground">{ANSWER}</p>
        <ThumbsMorph
          subject="answer"
          reasons={REASONS}
          value={verdict}
          onValueChange={(next) => {
            setVerdict(next);
            if (next !== "down") setChosen([]);
          }}
          chosen={chosen}
          onChosenChange={setChosen}
          className="border-t border-hairline pt-1"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>
      </p>
    </div>
  );
}
