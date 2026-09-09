"use client";

import * as React from "react";

import { ParallelFan, type FanAttempt } from "@/registry/ui/parallel-fan";

/** Four attempts at one Waylight support ticket, each on its own clock. */
// prettier-ignore
const SCRIPT = [
  { id: "a", label: "Reasoner A", model: "Gaugeworks Reasoner", doneAt: 22, score: 0.84 },
  { id: "b", label: "Model 3", model: "Fernworks Model 3", doneAt: 30, score: 0.78 },
  { id: "c", label: "Scout", model: "Basinworks Scout", failAt: 14 },
  { id: "d", label: "Reasoner B", model: "Gaugeworks Reasoner", doneAt: 26, score: 0.91 },
];

/** Tenths of a second: the last attempt settles at 30, the best gathers at 36. */
const GATHER_AT = 36;

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ParallelFanDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);

  // A hidden tab pauses the script; the fan should not gather unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const attempts: FanAttempt[] = SCRIPT.map((entry) => {
    if (entry.failAt !== undefined) {
      const failed = ticks >= entry.failAt;
      return {
        id: entry.id,
        label: entry.label,
        model: entry.model,
        progress: Math.min(ticks, entry.failAt) / (entry.failAt + 12),
        status: failed ? "failed" : "running",
      };
    }
    const done = ticks >= entry.doneAt;
    return {
      id: entry.id,
      label: entry.label,
      model: entry.model,
      progress: Math.min(1, ticks / entry.doneAt),
      status: done ? "done" : "running",
      score: done ? entry.score : undefined,
    };
  });

  const best = attempts
    .filter((a) => a.status === "done")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const winner = picked ?? (ticks >= GATHER_AT ? best?.id : undefined);
  const running = playing && winner === undefined;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const settled = attempts.filter((a) => a.status !== "running").length;
  const chosen = attempts.find((a) => a.id === winner);
  const line = !playing
    ? "Idle · press play"
    : chosen
      ? `Gathered · ${chosen.label}${
          chosen.score !== undefined
            ? ` · ${Math.round(chosen.score * 100)}`
            : ""
        }`
      : settled === 0
        ? `Fanned · ${attempts.length} attempts running`
        : `Fanned · ${settled} of ${attempts.length} done`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <ParallelFan
        label="Answer ticket 4821"
        task="Why was my Waylight refund short by 12.00?"
        attempts={attempts}
        spread={playing}
        winner={winner}
        onSelect={(id) => setPicked(id)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setPicked(null);
            setPlaying(true);
          }}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {playing ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          disabled={!playing}
          onClick={() => {
            setPlaying(false);
            setPicked(null);
            setTicks(0);
          }}
          className={`${button} border-hairline-strong text-foreground hover:bg-accent`}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
