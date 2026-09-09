"use client";

import * as React from "react";

import { VoicePrompt, type VoiceWord } from "@/registry/ui/voice-prompt";

/** What the reader says, one word per tick. */
const SCRIPT = [
  "Book",
  "the",
  "Basinworks",
  "room",
  "for",
  "Thursday",
  "at",
  "ten",
];
/** A seeded level table in percent, so the ring has a voice without a microphone. */
const LEVELS = [32, 58, 71, 46, 83, 64, 39, 77, 55, 90, 48, 62];
const TICK_MS = 170;

type Phase =
  { kind: "idle" } | { kind: "sent"; count: number } | { kind: "cancelled" };

export function VoicePromptDemo() {
  const [holding, setHolding] = React.useState(false);
  const [words, setWords] = React.useState<VoiceWord[]>([]);
  const [level, setLevel] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });

  // While the hold lasts, a timer pushes the next scripted word as interim,
  // firms everything but the last two, and steps the level table. It stops
  // while the tab is hidden and never reads a clock.
  React.useEffect(() => {
    if (!holding) return;
    let timer = 0;
    let tick = 0;
    const step = () => {
      tick += 1;
      setLevel((LEVELS[tick % LEVELS.length] ?? 50) / 100);
      setWords((prev) => {
        const firmed = prev.map((word, index) =>
          index < prev.length - 2 ? { ...word, final: true } : word,
        );
        const next = SCRIPT[prev.length];
        return next
          ? [...firmed, { id: `w-${prev.length}`, text: next, final: false }]
          : firmed;
      });
      timer = window.setTimeout(step, TICK_MS);
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(step, TICK_MS);
    };
    timer = window.setTimeout(step, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [holding]);

  const rest = () => {
    setHolding(false);
    setWords([]);
    setLevel(0);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <VoicePrompt
        label="Hold to talk to Fernworks Model 3"
        holding={holding}
        level={level}
        words={words}
        onHoldStart={() => {
          setHolding(true);
          setPhase({ kind: "idle" });
        }}
        onSend={(text) => {
          rest();
          setPhase({ kind: "sent", count: text.split(" ").length });
        }}
        onCancel={() => {
          rest();
          setPhase({ kind: "cancelled" });
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {holding
          ? `Listening · level ${Math.round(level * 100)}% · ${words.length} words`
          : phase.kind === "sent"
            ? `Sent · ${phase.count} words`
            : phase.kind === "cancelled"
              ? "Cancelled"
              : "Hold to talk"}
      </p>
    </div>
  );
}
