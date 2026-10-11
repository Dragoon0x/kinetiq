"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BeadworkLoom, type BeadworkMotif } from "@/registry/ui/beadwork-loom";

export const tweaks = defineTweaks({
  beadSize: {
    kind: "range",
    label: "Bead size",
    default: 10,
    min: 6,
    max: 16,
    step: 1,
    unit: "px",
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 2,
    min: 0.5,
    max: 5,
    step: 0.5,
    unit: "px",
  },
});

const MOTIFS: { id: BeadworkMotif; name: string }[] = [
  { id: "tide", name: "Tide" },
  { id: "wave", name: "Wave" },
  { id: "bloom", name: "Bloom" },
];

/**
 * Fernworks Loom Studio: "Low tide at Coldbrook", a loomed panel that plays
 * like a little screen — tug the warp and the picture ripples with it.
 */
export function BeadworkLoomDemo({
  chrome = true,
  // The loom is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [motif, setMotif] = React.useState<BeadworkMotif>("tide");
  const [playing, setPlaying] = React.useState(true);
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const loom = (
    <BeadworkLoom
      motif={motif}
      playing={playing}
      onPlayingChange={setPlaying}
      label="Low tide at Coldbrook, a beadwork panel"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {loom}
      </div>
    );
  }

  const pick = (index: number) => {
    const next = MOTIFS[(index + MOTIFS.length) % MOTIFS.length];
    if (!next) return;
    setMotif(next.id);
    refs.current[next.id]?.focus();
  };
  const current = MOTIFS.findIndex((m) => m.id === motif);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Loom Studio
          </p>
          <p className="text-sm font-medium text-foreground">
            Low tide at Coldbrook
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Picture"
          className="flex h-8 items-center gap-0.5 rounded-2 border border-hairline bg-surface-2 p-0.5"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              pick(current + 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              pick(current - 1);
            }
          }}
        >
          {MOTIFS.map((m) => (
            <button
              key={m.id}
              ref={(node) => {
                refs.current[m.id] = node;
              }}
              type="button"
              role="radio"
              aria-checked={motif === m.id}
              tabIndex={motif === m.id ? 0 : -1}
              onClick={() => setMotif(m.id)}
              className={cn(
                "flex h-full items-center rounded-1 px-2.5 text-xs transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                motif === m.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-ink-3 hover:text-foreground",
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full" style={{ height: 216 }}>
        {loom}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{playing ? "playing" : "paused"}</span> ·{" "}
        {motif} ·{" "}
        {playing
          ? "drag to tug the warp, tap to pause"
          : "tap or press space to play"}
      </p>
    </div>
  );
}
