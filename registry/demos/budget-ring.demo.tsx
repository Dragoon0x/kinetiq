"use client";

import * as React from "react";

import { BudgetRing } from "@/registry/ui/budget-ring";

/** Gaugeworks Reasoner auditing a Coldbrook Bank ledger: two minutes and three credits. */
const TIME_BUDGET = 120;
const COST_BUDGET = 3;
/** Each tick spends one second; tool calls spend credits at these ticks. */
const CALLS: [tick: number, cost: number][] = [
  [3, 0.12],
  [8, 0.22],
  [14, 0.31],
  [20, 0.18],
  [27, 0.29],
  [33, 0.36],
  [40, 0.2],
  [47, 0.33],
  [55, 0.24],
  [63, 0.19],
  [72, 0.16],
  [82, 0.1],
];
const COMPLETE_AT = 95;

const format = (cost: number) => `${cost.toFixed(2)} cr`;
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BudgetRingDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [paused, setPaused] = React.useState(false);

  // A hidden tab holds the run where it is; a budget should not drain unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Spend is a function of the tick count, summed in cents so the total is exact.
  const timeUsed = Math.min(TIME_BUDGET, ticks);
  const costUsed =
    CALLS.filter(([tick]) => ticks >= tick).reduce(
      (sum, [, cost]) => sum + Math.round(cost * 100),
      0,
    ) / 100;
  const timeLeft = TIME_BUDGET - timeUsed;
  const costLeft = Math.round((COST_BUDGET - costUsed) * 100) / 100;
  const spent = timeLeft <= 0 || costLeft <= 0;
  const complete = ticks >= COMPLETE_AT;
  const live = running && !paused && !spent && !complete;

  React.useEffect(() => {
    if (!live || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [live, visible]);

  const reset = () => {
    setRunning(false);
    setPaused(false);
    setTicks(0);
  };

  const remainder = `${formatTime(timeLeft)} left · ${format(Math.max(0, costLeft))} left`;
  const status = !running
    ? "Idle · press run"
    : costLeft <= 0
      ? `Cost spent · stopped at ${formatTime(timeUsed)}`
      : timeLeft <= 0
        ? `Time spent · stopped at ${format(costUsed)}`
        : complete
          ? `Complete · ${remainder}`
          : paused
            ? `Paused · ${remainder}`
            : `${costLeft / COST_BUDGET <= 0.35 ? "Cost low" : timeLeft / TIME_BUDGET <= 0.2 ? "Time low" : "Running"} · ${remainder}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BudgetRing
        label="Ledger audit"
        timeBudget={TIME_BUDGET}
        timeUsed={timeUsed}
        costBudget={COST_BUDGET}
        costUsed={costUsed}
        format={format}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning(true)}
          disabled={running}
          className={button}
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          disabled={!running || spent || complete}
          className={button}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!running}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
