"use client";

import * as React from "react";

import { CalendarX2, RefreshCw, RotateCcw, Unplug } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRotaOverrides,
  defaultRotaPeople,
  defaultRotaShifts,
  PagerRota,
  rotaHours,
  type RotaOverride,
  type RotaShift,
  type RotaStatus,
} from "@/registry/ui/pager-rota";

export const tweaks = defineTweaks({
  days: {
    kind: "range",
    label: "Cycle",
    default: 7,
    min: 7,
    max: 14,
    step: 7,
    unit: "days",
  },
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "solid",
    options: ["solid", "outline", "striped"],
    names: { solid: "Solid", outline: "Outline", striped: "Striped" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success", "warn"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      success: "Green",
      warn: "Amber",
    },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fieldline platform's on-call week: two layers of shifts to swap along,
 * covers to paint for the afternoons people are out, and a bar per person
 * to keep the hours fair.
 */
export function PagerRotaDemo({
  chrome = true,
  // The rota is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<RotaStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [shifts, setShifts] = React.useState<RotaShift[]>(defaultRotaShifts);
  const [overrides, setOverrides] =
    React.useState<RotaOverride[]>(defaultRotaOverrides);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const fail = failNext;
    setFailNext(false);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <PagerRota height={540} {...values} />
      </div>
    );
  }

  const days = values.days ?? 7;
  const hours = Object.values(
    rotaHours(defaultRotaPeople, shifts, overrides, days),
  );
  const spread = hours.length > 0 ? Math.max(...hours) - Math.min(...hours) : 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PagerRota
        shifts={shifts}
        onShiftsChange={setShifts}
        overrides={overrides}
        onChange={setOverrides}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shifts.length} shifts · {overrides.length}{" "}
            {overrides.length === 1 ? "override" : "overrides"}
          </span>{" "}
          · {spread}h between the most and least on call
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={BUTTON}>
            <RefreshCw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={BUTTON}
          >
            <Unplug aria-hidden className="size-3.5" />
            {failNext ? "Next load fails" : "Fail next load"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShifts([]);
              setOverrides([]);
            }}
            className={BUTTON}
          >
            <CalendarX2 aria-hidden className="size-3.5" />
            Clear schedule
          </button>
          <button
            type="button"
            onClick={() => {
              setShifts(defaultRotaShifts);
              setOverrides(defaultRotaOverrides);
            }}
            className={BUTTON}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
