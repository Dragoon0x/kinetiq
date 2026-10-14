"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CreditRefill,
  defaultCreditAutoRefill,
  defaultCreditBalance,
  type CreditAutoRefill,
  type CreditStatus,
} from "@/registry/ui/credit-refill";

export const tweaks = defineTweaks({
  gauge: {
    kind: "choice",
    label: "Gauge",
    default: "tank",
    options: ["tank", "bar", "ring"],
    names: { tank: "Tank", bar: "Bar", ring: "Ring" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Moss" },
  },
});

const LOAD_MS = 900;
const BURN = 85;

/**
 * A Coldbrook AI workspace a fortnight from empty: pick a refill and watch it
 * pour in, or let auto-refill keep the tank above a line.
 */
export function CreditRefillDemo({
  chrome = true,
  // The tank is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [balance, setBalance] = React.useState(defaultCreditBalance);
  const [auto, setAuto] = React.useState<CreditAutoRefill>(
    defaultCreditAutoRefill,
  );
  const [status, setStatus] = React.useState<CreditStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [refills, setRefills] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setBalance(defaultCreditBalance);
    setAuto(defaultCreditAutoRefill);
    setStatus("ready");
    setFailNext(false);
    setRefills(0);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <CreditRefill
          height={540}
          balance={balance}
          burnPerDay={BURN}
          onRefill={({ credits }) => setBalance((b) => b + credits)}
          {...values}
        />
      </div>
    );
  }

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <CreditRefill
        height={560}
        balance={balance}
        burnPerDay={BURN}
        autoRefill={auto}
        onAutoRefillChange={setAuto}
        onRefill={({ credits }) => {
          setBalance((b) => b + credits);
          setRefills((n) => n + 1);
        }}
        status={status}
        onRetry={load}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {balance.toLocaleString("en-US")} credits · auto-refill{" "}
            {auto.enabled ? "on" : "off"}
          </span>{" "}
          · {refills} {refills === 1 ? "refill" : "refills"}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBalance((b) => Math.max(0, b - 600))}
            className={button}
          >
            Burn 600
          </button>
          <button type="button" onClick={load} className={button}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next load
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
