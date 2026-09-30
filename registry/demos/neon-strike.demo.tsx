"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NeonStrike } from "@/registry/ui/neon-strike";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colour: {
    kind: "choice",
    label: "Colour",
    default: "rose",
    options: ["rose", "sky", "amber", "lime"],
    names: { rose: "Rose", sky: "Sky", amber: "Amber", lime: "Lime" },
  },
  faulty: { kind: "toggle", label: "Faulty tube", default: true },
});

const PHRASES = [
  "Waking the gauges",
  "Reading 48 meters",
  "Syncing Gaugeworks",
];

/** A sync run's length, and how often the demo's pretend meters report in. */
const RUN_MS = 6000;
const STEP_MS = 100;

type Mode = "warming" | "syncing" | "done";

/**
 * Gaugeworks bringing a fleet of meters online: the status sign warms up
 * while it waits, and a sync run turns it into a meter of the run's progress.
 */
export function NeonStrikeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mode, setMode] = React.useState<Mode>("warming");
  const [progress, setProgress] = React.useState(0);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (mode !== "syncing") return;
    const started = performance.now();
    let finish = 0;
    const timer = window.setInterval(() => {
      const share = Math.min(1, (performance.now() - started) / RUN_MS);
      setProgress(Math.round(share * 100) / 100);
      if (share >= 1) {
        window.clearInterval(timer);
        finish = window.setTimeout(() => setMode("done"), 900);
      }
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finish);
    };
  }, [mode]);

  const sign = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · meter fleet north
      </p>
      <NeonStrike
        phrases={PHRASES}
        active={mode !== "done"}
        doneText="All meters in"
        progress={mode === "syncing" ? progress : undefined}
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{sign}</div>;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {sign}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {mode === "warming" ? (
            <>
              <span className="text-signal">warming</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · knock the glass
            </>
          ) : mode === "syncing" ? (
            <>
              <span className="text-signal">syncing</span> ·{" "}
              {Math.round(progress * 100)}% · {Math.max(1, index + 1)} of{" "}
              {PHRASES.length}
            </>
          ) : (
            <>
              <span className="text-signal">lit</span> · all meters in
            </>
          )}
        </p>
        <button
          type="button"
          disabled={mode === "syncing"}
          onClick={() => {
            if (mode === "warming") {
              setProgress(0);
              setMode("syncing");
            } else {
              setMode("warming");
            }
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {mode === "warming"
            ? "Run sync"
            : mode === "syncing"
              ? "Syncing"
              : "Warm up again"}
        </button>
      </div>
    </div>
  );
}
