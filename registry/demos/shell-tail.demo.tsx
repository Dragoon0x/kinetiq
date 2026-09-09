"use client";

import * as React from "react";

import {
  ShellTail,
  type ShellLine,
  type ShellState,
} from "@/registry/ui/shell-tail";

type Run = { command: string; exitCode: number; lines: ShellLine[] };

/** Fernworks Model 3 keeping a Basinworks ledger in step. */
const RUNS: Record<"ok" | "fail", Run> = {
  ok: {
    command: "basin sync --ledger ledger.csv",
    exitCode: 0,
    lines: [
      "reading ledger.csv (1,204 rows)",
      "resolving 3 accounts against basinworks.example",
      "  everyday        ok",
      "  rainy-day       ok",
      "  fieldline-ops   ok",
      "posting 42 entries · 0 conflicts",
      "writing ledger.csv",
      "index rebuilt in 118 ms",
      "done",
    ],
  },
  fail: {
    command: "basin check ledger.csv",
    exitCode: 2,
    lines: [
      "reading ledger.csv (1,204 rows)",
      "checking balances",
      { text: "row 811: amount is not a number: 'twelve'", stream: "stderr" },
      "1 row rejected",
      "aborted",
    ],
  },
};

/** A seeded jitter so the lines read as a process, not a metronome. */
const DELAYS = [140, 260, 90, 340, 180, 120, 420, 110];
/** The beat between the last line and the exit stamp. */
const SETTLE_MS = 360;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ShellTailDemo() {
  const [run, setRun] = React.useState<"ok" | "fail">("ok");
  const [count, setCount] = React.useState(0);
  const [state, setState] = React.useState<ShellState>("idle");

  // A hidden tab holds the run where it is; the output should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const script = RUNS[run];
  const finished = count >= script.lines.length;

  React.useEffect(() => {
    if (state !== "running" || !visible) return;
    const timer = window.setTimeout(
      () => {
        if (finished) setState("done");
        else setCount((current) => current + 1);
      },
      finished ? SETTLE_MS : DELAYS[count % DELAYS.length],
    );
    return () => window.clearTimeout(timer);
  }, [state, visible, finished, count]);

  const start = (which: "ok" | "fail") => {
    setRun(which);
    setCount(0);
    setState("running");
  };

  const status =
    state === "running"
      ? `Running · ${count} ${count === 1 ? "line" : "lines"}`
      : state === "done"
        ? `Exit ${script.exitCode} · ${count} lines`
        : "Idle · ready";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ShellTail
        label="Fernworks Model 3 shell"
        cwd="~/basinworks"
        command={script.command}
        lines={script.lines.slice(0, count)}
        state={state}
        exitCode={script.exitCode}
        maxHeight={140}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => start("ok")}
          disabled={state === "running"}
          className={button}
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => start("fail")}
          disabled={state === "running"}
          className={button}
        >
          Run a failing one
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
