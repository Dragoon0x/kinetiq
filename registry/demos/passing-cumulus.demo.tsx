"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PassingCumulus,
  type PassingCumulusState,
} from "@/registry/ui/passing-cumulus";

export const tweaks = defineTweaks({
  cloud: {
    kind: "range",
    label: "Cloud",
    default: 1,
    min: 0.4,
    max: 1.6,
    step: 0.1,
  },
  dotSize: {
    kind: "range",
    label: "Dot size",
    default: 7,
    min: 3,
    max: 12,
    step: 1,
    unit: "px",
  },
  state: {
    kind: "choice",
    label: "State",
    default: "busy",
    options: ["idle", "busy", "done"],
    names: { idle: "Idle", busy: "Busy", done: "Done" },
  },
});

const WORDS: Record<PassingCumulusState, string> = {
  idle: "ready",
  busy: "thinking",
  done: "done",
};

/**
 * A Gaugeworks Reasoner run: three route plans for Saturday being weighed,
 * a cloud drifting over the field while it thinks.
 */
export function PassingCumulusDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const wanted: PassingCumulusState = values.state ?? "busy";
  const [run, setRun] = React.useState({ state: wanted, n: 0 });
  const [seen, setSeen] = React.useState(wanted);
  const [elapsed, setElapsed] = React.useState(0);
  // The State tweak sets the run; Run again starts a fresh one.
  if (seen !== wanted) {
    setSeen(wanted);
    setRun((r) => ({ state: wanted, n: r.n + 1 }));
    setElapsed(0);
  }

  // On the docs plate a run finishes after a few seconds, as a real one would;
  // the gallery card keeps thinking.
  React.useEffect(() => {
    if (!chrome || run.state !== "busy") return;
    const t0 = performance.now();
    const tick = window.setInterval(
      () => setElapsed(Math.round((performance.now() - t0) / 100) / 10),
      100,
    );
    const finish = window.setTimeout(() => {
      window.clearInterval(tick);
      setElapsed(5.2);
      setRun((r) => ({ ...r, state: "done" }));
    }, 5200);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
  }, [chrome, run.state, run.n]);

  const panel = (
    <div className="w-full rounded-3 border border-hairline bg-card p-4 shadow-[var(--shadow-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Gaugeworks Reasoner
        </p>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {WORDS[run.state]}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        Comparing three route plans for Saturday
      </p>
      <PassingCumulus
        label="Comparing route plans"
        className="mt-3 h-24"
        {...values}
        state={run.state}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{panel}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      {panel}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase tabular-nums"
        >
          <span className="text-signal">{WORDS[run.state]}</span>
          {run.state === "idle" ? (
            " · nothing running"
          ) : (
            // The clock ticks ten times a second: shown, not spoken.
            <span aria-hidden> · {elapsed.toFixed(1)} s</span>
          )}
        </p>
        {run.state !== "busy" ? (
          <button
            type="button"
            onClick={() => {
              setElapsed(0);
              setRun((r) => ({ state: "busy", n: r.n + 1 }));
            }}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Run again
          </button>
        ) : null}
      </div>
    </div>
  );
}
