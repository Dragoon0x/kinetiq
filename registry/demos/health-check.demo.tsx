"use client";

import * as React from "react";

import {
  HealthCheck,
  type HealthProbe,
  type HealthStatus,
  type HealthSummary,
} from "@/registry/ui/health-check";

const REFUSED = "Upstream refused the hold: the ledger is closed for the day.";

/** Coldbrook's gate-relay on live: six seeded probes, one of which refuses. */
const SCRIPT = [
  ["h1", "GET /healthz", "gate-relay-1", "pass", 24, "200 OK"],
  ["h2", "GET /readyz", "gate-relay-1", "pass", 31, "200 OK"],
  ["h3", "TCP 5432", "ledger-db", "pass", 4, "open"],
  ["h4", "GET /v2/holds", "ledger-api", "fail", 1204, "503", REFUSED],
  ["h5", "GET /queue", "dock-worker", "pass", 88, "200 OK"],
  ["h6", "GET /metrics", "gate-relay-1", "pass", 12, "200 OK"],
] as [
  id: string,
  name: string,
  target: string,
  settled: "pass" | "fail",
  latencyMs: number,
  response: string,
  detail?: string,
][];

const LAST = SCRIPT.length;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function HealthCheckDemo() {
  const [step, setStep] = React.useState(-1);
  const [running, setRunning] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [summary, setSummary] = React.useState<HealthSummary | null>(null);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A hidden tab throttles timers, so the sequence holds where it is rather
  // than settling four probes at once when it comes back.
  React.useEffect(() => {
    if (!running || hidden || step >= LAST) return;
    const timer = window.setTimeout(
      () => setStep((current) => Math.min(LAST, current + 1)),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [running, hidden, step]);

  const checks: HealthProbe[] = SCRIPT.map(
    ([id, name, target, settled, latencyMs, response, detail], index) => {
      const status: HealthStatus =
        step < 0 || index > step
          ? "waiting"
          : index === step
            ? "running"
            : settled;
      const done = status === "pass" || status === "fail";
      return {
        id,
        name,
        target,
        status,
        ...(done ? { latencyMs, response } : {}),
        ...(done && detail ? { detail } : {}),
      };
    },
  );

  const atEnd = step >= LAST;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HealthCheck
        label="gate-relay on live"
        checks={checks}
        onSummaryChange={setSummary}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!running && atEnd) setStep(-1);
            setRunning(!running);
          }}
        >
          {running ? "Pause" : atEnd ? "Run again" : "Run checks"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={atEnd}
          onClick={() => setStep((current) => Math.min(LAST, current + 1))}
        >
          Step
        </button>
        <button
          type="button"
          className={chip}
          disabled={step < 0}
          onClick={() => {
            setRunning(false);
            setStep(-1);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {summary ? `${summary.settled} of ${summary.total} settled` : "none"}
        </span>
        {summary ? ` · ${summary.passed} passed` : ""}
        {summary && summary.failed > 0 ? ` · ${summary.failed} failed` : ""}
      </p>
    </div>
  );
}
