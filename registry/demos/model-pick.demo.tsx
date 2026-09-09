"use client";

import * as React from "react";

import { ModelPick, type PickModel } from "@/registry/ui/model-pick";

/** The four minds a Waylight composer can hand a draft to. */
const MODELS: PickModel[] = [
  {
    id: "fw3",
    name: "Fernworks Model 3",
    note: "Everyday drafts",
    speed: 4,
    quality: 4,
  },
  {
    id: "fw3-mini",
    name: "Fernworks Model 3 Mini",
    note: "Quick replies",
    speed: 5,
    quality: 2,
  },
  {
    id: "gw-reasoner",
    name: "Gaugeworks Reasoner",
    note: "Long reasoning",
    speed: 2,
    quality: 5,
  },
  {
    id: "bw-scout",
    name: "Basinworks Scout",
    note: "Search and fetch",
    speed: 5,
    quality: 3,
  },
];

export function ModelPickDemo() {
  const [model, setModel] = React.useState("fw3");
  const chosen = MODELS.find((candidate) => candidate.id === model);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ModelPick
        label="Waylight composer · model"
        models={MODELS}
        value={model}
        onValueChange={setModel}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {chosen
          ? `Model ${chosen.name} · speed ${chosen.speed}/5 · quality ${chosen.quality}/5`
          : "No model"}
      </p>
    </div>
  );
}
