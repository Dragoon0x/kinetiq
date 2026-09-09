"use client";

import * as React from "react";

import { GraceTimer } from "@/registry/ui/grace-timer";

const AMOUNT = 412.6;
const DAYS = 21;
const USED = 6;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function GraceTimerDemo() {
  const [run, setRun] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [daysLeft, setDaysLeft] = React.useState(DAYS - USED);
  const [paid, setPaid] = React.useState(false);
  const [expired, setExpired] = React.useState(false);

  const reset = () => {
    setRun((count) => count + 1);
    setRunning(false);
    setDaysLeft(DAYS - USED);
    setPaid(false);
    setExpired(false);
  };

  const done = paid || expired;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <GraceTimer
        key={run}
        label="Fernworks card"
        amount={AMOUNT}
        days={DAYS}
        daysUsed={USED}
        running={running}
        secondsPerDay={0.7}
        paid={paid}
        onPaidChange={(next) => {
          setPaid(next);
          setRunning(false);
        }}
        onDaysChange={setDaysLeft}
        onExpire={() => {
          setExpired(true);
          setRunning(false);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={done}
          aria-pressed={running}
          onClick={() => setRunning((value) => !value)}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button type="button" className={BUTTON} onClick={reset}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {paid ? (
          <>
            <span className="text-signal">Paid</span> · stopped at{" "}
            <span className="tabular-nums">{daysLeft}</span> days
          </>
        ) : expired ? (
          <>
            <span className="text-signal">Expired</span> · interest applies
          </>
        ) : (
          <>
            Grace <span className="text-signal tabular-nums">{daysLeft}</span>{" "}
            days left · {money.format(AMOUNT)}
          </>
        )}
      </p>
    </div>
  );
}
