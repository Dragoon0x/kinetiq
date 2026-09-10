"use client";

import * as React from "react";

import { MicRing } from "@/registry/ui/mic-ring";

/** A seeded sentence of levels — two rises, one shout, one fade to nothing. */
const SCRIPT = [
  0.06, 0.14, 0.38, 0.62, 0.71, 0.55, 0.34, 0.19, 0.09, 0.05, 0.22, 0.48, 0.77,
  0.86, 0.68, 0.41, 0.25, 0.12, 0.07, 0.31, 0.59, 0.73, 0.52, 0.28, 0.15, 0.08,
  0.04, 0.11,
];

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function MicRingDemo() {
  const [playing, setPlaying] = React.useState(true);
  const [step, setStep] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [peak, setPeak] = React.useState(0);

  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );

  React.useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setInterval(() => setStep((n) => n + 1), 140);
    return () => window.clearInterval(id);
  }, [playing, visible]);

  const level = SCRIPT[step % SCRIPT.length] ?? 0;
  const shown = muted ? 0 : Math.round(level * 100);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MicRing
        name="Ines"
        level={level}
        muted={muted}
        onMutedChange={setMuted}
        onPeakChange={setPeak}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((on) => !on)}
          className={chip}
        >
          {playing ? "Pause the level" : "Play the level"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{muted ? "Muted" : "Mic on"}</span> ·
        level {shown} · peak {peak}
      </p>
    </div>
  );
}
