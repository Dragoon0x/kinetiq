"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultWillowFinale,
  WillowShell,
  type WillowShellType,
} from "@/registry/ui/willow-shell";

export const tweaks = defineTweaks({
  shell: {
    kind: "choice",
    label: "Shell",
    default: "willow",
    options: ["willow", "peony", "crossette", "mixed"],
    names: {
      willow: "Willow",
      peony: "Peony",
      crossette: "Crossette",
      mixed: "Mixed",
    },
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

function Headline() {
  return (
    <div className="px-4 pt-4">
      <p className="font-mono text-[10px] tracking-[0.08em] text-(--willow-faint) uppercase">
        Waylight Riverside · Sat 21:30
      </p>
      <p className="mt-1 text-base leading-snug font-medium text-(--willow-ink)">
        Fireworks over the water
      </p>
    </div>
  );
}

/**
 * Waylight Riverside's Saturday display: the sky over the far bank is
 * yours to fire into, and the finale is scripted.
 */
export function WillowShellDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [playing, setPlaying] = React.useState(false);
  const [bursts, setBursts] = React.useState(0);
  const [lastShell, setLastShell] = React.useState<string | null>(null);
  const [cue, setCue] = React.useState(0);
  const shell: WillowShellType = values.shell ?? "willow";

  if (!chrome) {
    return (
      <div className="flex w-full">
        <WillowShell
          trigger="inView"
          className="h-[34rem] w-full"
          sound={sound}
          {...values}
        >
          <Headline />
        </WillowShell>
      </div>
    );
  }

  const total = defaultWillowFinale.length;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <WillowShell
        trigger="inView"
        playing={playing}
        onPlayingChange={(next) => {
          setPlaying(next);
          if (!next) setCue(0);
        }}
        onBurst={(kind) => {
          setBursts((n) => n + 1);
          setLastShell(kind);
          if (playing) setCue((n) => Math.min(total, n + 1));
        }}
        className="h-[28rem] w-full"
        sound={sound}
        {...values}
      >
        <Headline />
      </WillowShell>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs text-ink-3">
          Click the sky, or aim with the arrow keys.
        </p>
        <button
          type="button"
          aria-disabled={playing}
          onClick={() => {
            if (playing) return;
            setCue(0);
            setPlaying(true);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:opacity-60"
        >
          {playing ? "Finale playing" : "Play finale"}
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {playing ? (
          <>
            <span className="text-signal">finale</span> · shell {cue} of {total}
          </>
        ) : (
          <>
            <span className="text-signal">{lastShell ?? shell}</span> ·{" "}
            {bursts === 1 ? "1 shell" : `${bursts} shells`} burst over the river
          </>
        )}
      </p>
    </div>
  );
}
