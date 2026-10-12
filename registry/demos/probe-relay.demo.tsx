"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultProbeRegions,
  defaultProbeResults,
  ProbeRelay,
  type ProbeRegion,
  type ProbeResults,
  type ProbeStatus,
} from "@/registry/ui/probe-relay";

export const tweaks = defineTweaks({
  layout: {
    kind: "choice",
    label: "Layout",
    default: "arc",
    options: ["arc", "ring", "list"],
    names: { arc: "Arc", ring: "Ring", list: "List" },
  },
  pulse: {
    kind: "choice",
    label: "Pulse",
    default: "dot",
    options: ["dot", "comet", "dash"],
    names: { dot: "Dot", comet: "Comet", dash: "Dash" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Amber", success: "Green" },
  },
});

/**
 * Fieldline's API health, probed from six cities: run the relay, watch the
 * far regions land last, and pick one to see where its round trip went.
 */
export function ProbeRelayDemo({
  chrome = true,
  // The relay is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<ProbeStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [regions, setRegions] =
    React.useState<ProbeRegion[]>(defaultProbeRegions);
  const [results, setResults] =
    React.useState<ProbeResults>(defaultProbeResults);
  const [landed, setLanded] = React.useState(0);
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
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ProbeRelay height={540} {...values} />
      </div>
    );
  }

  const latest = regions
    .map((r) => {
      const list = results[r.id] ?? [];
      return list[list.length - 1];
    })
    .filter((r) => r !== undefined);
  const ok = latest.filter((r) => r.ok).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ProbeRelay
        height={540}
        regions={regions}
        results={results}
        onResultsChange={(next) => {
          setResults(next);
          setLanded((n) => n + 1);
        }}
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
            {ok} of {regions.length} ok
          </span>{" "}
          · {landed} landed this session
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext(true)}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() =>
              setRegions((list) =>
                list.length === 0 ? defaultProbeRegions : [],
              )
            }
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {regions.length === 0 ? "Restore regions" : "Clear regions"}
          </button>
          <button
            type="button"
            onClick={() => {
              setResults(defaultProbeResults);
              setRegions(defaultProbeRegions);
              setLanded(0);
            }}
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
