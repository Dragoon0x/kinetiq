"use client";

import * as React from "react";

import { InterestDrip } from "@/registry/ui/interest-drip";

/** Coldbrook Bank's "Easy saver" and its two published rates. */
const PRINCIPAL = 12480.37;
const RATES = [
  { value: 0.0305, label: "3.05%" },
  { value: 0.041, label: "4.10%" },
];

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function InterestDripDemo() {
  const [playing, setPlaying] = React.useState(false);
  const [rate, setRate] = React.useState(0.0305);
  const [tick, setTick] = React.useState({ balance: PRINCIPAL, days: 0 });

  const earned = tick.balance - PRINCIPAL;
  const apy = `${(rate * 100).toFixed(2)}% APY`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <InterestDrip
        label="Easy saver"
        principal={PRINCIPAL}
        rate={rate}
        playing={playing}
        onTick={(balance, days) => setTick({ balance, days })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={playing}
          onClick={() => setPlaying((prev) => !prev)}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div
          role="group"
          aria-label="Rate"
          className="flex h-8 items-stretch rounded-2 border border-hairline-strong bg-surface-2 p-0.5"
        >
          {RATES.map((option) => {
            const active = option.value === rate;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => setRate(option.value)}
                className={`flex items-center rounded-1 px-2.5 font-mono text-[11px] font-medium tabular-nums transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? "bg-surface-0 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Day {tick.days.toFixed(2)} · earned {earned.toFixed(4)} · {apy}
        {playing ? "" : " · paused"}
      </p>
    </div>
  );
}
