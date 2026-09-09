"use client";

import * as React from "react";

import {
  EarningsCountdown,
  type EarningsVerdict,
} from "@/registry/ui/earnings-countdown";

/** Two days, fourteen hours, six minutes and twelve seconds. */
const SEED = 2 * 86400 + 14 * 3600 + 6 * 60 + 12;
const LAST_MINUTE = 60;
const ESTIMATE = { eps: 1.2, revenue: 1.84e9 };
const ACTUAL = { eps: 1.24, revenue: 1.91e9 };

const pad = (value: number) => String(value).padStart(2, "0");
const printSeed = (total: number) =>
  `${Math.floor(total / 86400)}d ${pad(Math.floor((total % 86400) / 3600))}h ${pad(
    Math.floor((total % 3600) / 60),
  )}m ${pad(total % 60)}s`;

const VERDICT: Record<EarningsVerdict, string> = {
  beat: "beat",
  miss: "miss",
  inline: "in line",
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function EarningsCountdownDemo() {
  const [generation, setGeneration] = React.useState(0);
  const [seconds, setSeconds] = React.useState(SEED);
  const [running, setRunning] = React.useState(false);
  const [due, setDue] = React.useState(false);
  const [landed, setLanded] = React.useState<EarningsVerdict | null>(null);

  const reset = () => {
    setGeneration((current) => current + 1);
    setSeconds(SEED);
    setRunning(false);
    setDue(false);
    setLanded(null);
  };

  const phase = landed
    ? `landed ${VERDICT[landed]}`
    : due
      ? "due"
      : running
        ? "clock running"
        : "clock paused";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <EarningsCountdown
        key={generation}
        label="Fernworks Q3"
        seconds={seconds}
        running={running}
        estimate={ESTIMATE}
        actual={landed ? ACTUAL : undefined}
        onElapsed={() => setDue(true)}
        onLand={setLanded}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={due || landed !== null}
          onClick={() => setRunning((current) => !current)}
        >
          {running ? "Pause clock" : "Start clock"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={seconds === LAST_MINUTE || due || landed !== null}
          onClick={() => setSeconds(LAST_MINUTE)}
        >
          Skip to last minute
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={landed !== null}
          onClick={() => setLanded("beat")}
        >
          Land results
        </button>
        <button type="button" className={BUTTON} onClick={reset}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-cobalt-bright">Fernworks Q3</span> ·{" "}
        <span className="tabular-nums">{printSeed(seconds)}</span> ·{" "}
        <span className="text-signal">{phase}</span>
      </p>
    </div>
  );
}
