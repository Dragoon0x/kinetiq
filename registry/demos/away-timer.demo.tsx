"use client";

import * as React from "react";

import { AwayTimer } from "@/registry/ui/away-timer";

const PERIODS = [20, 8];

const clock = (value: number) => {
  const whole = Math.max(0, Math.ceil(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function AwayTimerDemo() {
  const [period, setPeriod] = React.useState(20);
  const [away, setAway] = React.useState(false);
  const [left, setLeft] = React.useState(20);
  const [back, setBack] = React.useState<"expiry" | "hand" | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AwayTimer
        name="Marta Vieira"
        note="Back in ten"
        seconds={period}
        warnSeconds={6}
        away={away}
        onAwayChange={(next) => {
          setAway(next);
          setBack(next ? null : "hand");
          if (next) setLeft(period);
        }}
        onRemainingChange={setLeft}
        onExpire={() => setBack("expiry")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPeriod(value);
              setLeft(value);
            }}
            disabled={away || period === value}
            className={chip}
          >
            {value} seconds
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {away ? (
          <>
            Away · {clock(left)} left ·{" "}
            <span className={left <= 6 ? "text-warn" : "text-signal"}>
              {left <= 6 ? "warn" : "back in ten"}
            </span>
          </>
        ) : (
          <>
            Online ·{" "}
            <span className="text-signal">
              {back === "expiry"
                ? "returned at zero"
                : back === "hand"
                  ? "back early"
                  : "here"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
