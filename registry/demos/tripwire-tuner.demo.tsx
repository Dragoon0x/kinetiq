"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTripwireIncidents,
  defaultTripwireSeries,
  defaultTripwireValue,
  TripwireTuner,
  tuneTripwire,
  type TripwireStatus,
  type TripwireValue,
} from "@/registry/ui/tripwire-tuner";

export const tweaks = defineTweaks({
  curve: {
    kind: "choice",
    label: "Curve",
    default: "area",
    options: ["area", "line", "bars"],
    names: { area: "Area", line: "Line", bars: "Bars" },
  },
  accent: {
    kind: "choice",
    label: "Metric",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
  markerStyle: {
    kind: "choice",
    label: "Marker",
    default: "pin",
    options: ["pin", "flag", "dot"],
    names: { pin: "Pin", flag: "Flag", dot: "Dot" },
  },
});

const LOAD_MS = 900;

/**
 * Gaugeworks' on-call team tunes the checkout latency page: a fortnight of
 * p95s with three real incidents in it, and a line to drag until the pager
 * catches them without crying wolf.
 */
export function TripwireTunerDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<TripwireValue>(defaultTripwireValue);
  const [status, setStatus] = React.useState<TripwireStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <TripwireTuner height={560} {...values} />
      </div>
    );
  }

  const report = tuneTripwire(
    defaultTripwireSeries,
    defaultTripwireIncidents,
    value,
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <TripwireTuner
        height={520}
        value={value}
        onChange={setValue}
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
            {value.threshold} ms · {value.minMinutes || "any"} min ·{" "}
            {value.cooldownMinutes ? `${value.cooldownMinutes} min` : "no"}{" "}
            cooldown
          </span>{" "}
          · fires {report.counted} · real {report.real} · noise {report.noise}
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid ${
              failNext
                ? "border-danger text-danger"
                : "border-hairline text-ink-2"
            }`}
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => setValue(defaultTripwireValue)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
