"use client";

import * as React from "react";

import { BarRace } from "@/registry/ui/bar-race";

const NAMES = [
  { id: "atlas", label: "Atlas" },
  { id: "vela", label: "Vela" },
  { id: "orion", label: "Orion" },
  { id: "lyra", label: "Lyra" },
  { id: "corvus", label: "Corvus" },
];

const FRAMES: Record<string, number>[] = [
  { atlas: 120, vela: 90, orion: 150, lyra: 60, corvus: 40 },
  { atlas: 210, vela: 180, orion: 200, lyra: 145, corvus: 120 },
  { atlas: 260, vela: 320, orion: 240, lyra: 300, corvus: 210 },
  { atlas: 300, vela: 470, orion: 280, lyra: 460, corvus: 390 },
];

const YEARS = ["Q1", "Q2", "Q3", "Q4"];

export function BarRaceDemo() {
  const [frame, setFrame] = React.useState(0);
  const current = FRAMES[frame] ?? FRAMES[0]!;

  const items = NAMES.map((name) => ({
    id: name.id,
    label: name.label,
    value: current[name.id] ?? 0,
  }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BarRace items={items} max={500} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFrame((value) => (value + 1) % FRAMES.length)}
          className="border-hairline bg-surface-1 hover:bg-surface-2 text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Advance
        </button>
        <span className="text-ink-3 font-mono text-xs">{YEARS[frame]}</span>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Frame{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {frame + 1} of {FRAMES.length}
        </span>
      </p>
    </div>
  );
}
