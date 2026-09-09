"use client";

import * as React from "react";

import { LatencyBar, type LatencyState } from "@/registry/ui/latency-bar";

const TICK = 50;
const QUICK = 840;
const HARD = 2650;

export function LatencyBarDemo() {
  const [state, setState] = React.useState<LatencyState>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [target, setTarget] = React.useState(QUICK);

  React.useEffect(() => {
    if (state !== "waiting") return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = elapsed + TICK;
        if (next >= target) {
          setElapsed(target);
          setState("done");
        } else {
          setElapsed(next);
        }
      }, TICK);
    };
    // A hidden tab holds the clock where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state, elapsed, target]);

  const ask = (ms: number) => {
    setTarget(ms);
    setElapsed(0);
    setState("waiting");
  };

  const seconds = (elapsed / 1000).toFixed(2);
  const button =
    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LatencyBar
        label="Fernworks Model 3"
        state={state}
        elapsedMs={elapsed}
        typicalMs={900}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ask(QUICK)}
          disabled={state === "waiting"}
          className={button}
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => ask(HARD)}
          disabled={state === "waiting"}
          className={button}
        >
          Ask a hard one
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "waiting" ? (
          <>
            Waiting ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {seconds} s
            </span>
          </>
        ) : state === "done" ? (
          <>
            First token ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {seconds} s
            </span>
            {elapsed > 2000 ? " · slow" : null}
          </>
        ) : (
          <>Idle · ready</>
        )}
      </p>
    </div>
  );
}
