"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlassTrio, type GlassTrioState } from "@/registry/ui/glass-trio";

export const tweaks = defineTweaks({
  tint: {
    kind: "choice",
    label: "Tint",
    default: "accent",
    options: ["accent", "signal", "warn", "clear"],
    names: { accent: "Cobalt", signal: "Mint", warn: "Amber", clear: "Clear" },
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "range",
    label: "Size",
    default: 16,
    min: 10,
    max: 20,
    step: 1,
    unit: "px",
  },
});

const SCRIPT: {
  state: GlassTrioState;
  ms: number;
  title: string;
  line: string;
}[] = [
  {
    state: "idle",
    ms: 2600,
    title: "Ask Waylight",
    line: "Tap the glass and speak",
  },
  {
    state: "listening",
    ms: 3400,
    title: "Listening",
    line: "“When is high water today?”",
  },
  {
    state: "thinking",
    ms: 2800,
    title: "Thinking",
    line: "Reading the harbour tables",
  },
  {
    state: "speaking",
    ms: 4400,
    title: "Speaking",
    line: "High water at 16:12, 1.5 m",
  },
];

const MODES = ["auto", "idle", "listening", "thinking", "speaking"] as const;
type Mode = (typeof MODES)[number];
const MODE_NAMES: Record<Mode, string> = {
  auto: "Auto",
  idle: "Idle",
  listening: "Listen",
  thinking: "Think",
  speaking: "Speak",
};

/** A seeded voice: syllables at about four a second, words, and pauses. */
function voice(t: number, seed: number): number {
  const syllable = Math.max(0, Math.sin(t * 2 * Math.PI * 3.7 + seed));
  const word = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.62 + seed * 1.7);
  const pause = Math.sin(t * 2 * Math.PI * 0.23 + seed) > -0.55 ? 1 : 0.08;
  return Math.min(1, syllable * syllable * (0.3 + 0.8 * word) * pause + 0.03);
}

/**
 * Waylight's voice assistant in a small card: the demo plays a seeded
 * exchange — a question heard, a moment's thought, an answer spoken — and
 * feeds the beads a level read every frame.
 */
export function GlassTrioDemo({
  chrome = true,
  // The beads are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [step, setStep] = React.useState(0);
  const [mode, setMode] = React.useState<Mode>("auto");
  const auto = mode === "auto";
  const beat = SCRIPT[step] ?? SCRIPT[0];
  const state: GlassTrioState = auto ? (beat?.state ?? "idle") : mode;
  const shown = SCRIPT.find((s) => s.state === state) ?? SCRIPT[0];

  React.useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(
      () => setStep((s) => (s + 1) % SCRIPT.length),
      beat?.ms ?? 3000,
    );
    return () => window.clearTimeout(id);
  }, [auto, step, beat]);

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });
  const level = React.useCallback(() => {
    const now = performance.now() / 1000;
    if (stateRef.current === "listening") return 0.85 * voice(now, 1.3);
    if (stateRef.current === "speaking") return voice(now * 1.08, 4.1);
    return 0;
  }, []);

  const trio = (
    <GlassTrio
      state={state}
      level={level}
      label="Waylight"
      onPress={() => {
        setMode("auto");
        setStep(1);
      }}
      {...values}
    />
  );

  const card = (
    <div className="flex w-full max-w-72 flex-col items-center gap-3 self-center rounded-4 border border-hairline bg-card px-5 py-5">
      {trio}
      <div className="w-full text-center">
        <p className="text-sm font-medium text-foreground">{shown?.title}</p>
        <p className="text-xs text-ink-3">{shown?.line}</p>
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div
        role="group"
        aria-label="Assistant state"
        className="flex flex-wrap gap-1"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              if (m === "auto") setStep(0);
            }}
            className={
              "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid " +
              (mode === m
                ? "border-hairline-strong bg-surface-2 text-foreground"
                : "border-transparent text-ink-3 hover:text-ink-2")
            }
          >
            {MODE_NAMES[m]}
          </button>
        ))}
      </div>
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{state}</span> ·{" "}
        {auto ? "playing the exchange" : "held"}
      </p>
    </div>
  );
}
