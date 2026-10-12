"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultGhostBaselines,
  defaultGhostToday,
  defaultGhostValue,
  findGhostAnomalies,
  GhostBaseline,
  type GhostStatus,
} from "@/registry/ui/ghost-baseline";

export const tweaks = defineTweaks({
  ghostStyle: {
    kind: "choice",
    label: "Ghosts",
    default: "line",
    options: ["line", "area", "dots"],
    names: { line: "Line", area: "Area", dots: "Dots" },
  },
  curve: {
    kind: "choice",
    label: "Curve",
    default: "smooth",
    options: ["smooth", "step"],
    names: { smooth: "Smooth", step: "Step" },
  },
  accent: {
    kind: "choice",
    label: "Today",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

const LOAD_MS = 900;

/**
 * Basinworks checkout, up to 17:00: completed checkouts per hour against the
 * same day last week, last month and the forecast, with a payment timeout at
 * 09:00 and a promo email at 14:00 straying from every baseline.
 */
export function GhostBaselineDemo({
  chrome = true,
  // The chart is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [enabled, setEnabled] = React.useState<string[]>(defaultGhostValue);
  const [tolerance, setTolerance] = React.useState(12);
  const [status, setStatus] = React.useState<GhostStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setFailNext(false);
    }, LOAD_MS);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <GhostBaseline height={540} {...values} />
      </div>
    );
  }

  const anomalies = findGhostAnomalies(
    defaultGhostToday,
    defaultGhostBaselines,
    enabled,
    tolerance,
  ).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <GhostBaseline
        key={round}
        height={540}
        value={enabled}
        onChange={setEnabled}
        tolerance={tolerance}
        onToleranceChange={setTolerance}
        status={status}
        onRetry={() => load(failNext)}
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => load(failNext)} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setEnabled(defaultGhostValue);
            setTolerance(12);
            setStatus("ready");
            setFailNext(false);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">loading</span>
        ) : status === "error" ? (
          <span className="text-signal">load failed</span>
        ) : (
          <>
            <span className="text-signal">
              {enabled.length} of {Object.keys(defaultGhostBaselines).length}{" "}
              ghosts · tolerance {tolerance}%
            </span>{" "}
            · {anomalies} {anomalies === 1 ? "anomaly" : "anomalies"}
          </>
        )}
      </p>
    </div>
  );
}
