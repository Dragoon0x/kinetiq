"use client";

import * as React from "react";

import { LogTail, type LogLine } from "@/registry/ui/log-tail";

const SCRIPT = [
  {
    level: "info",
    service: "gate-relay",
    text: "handshake accepted from dock-2",
  },
  { level: "debug", service: "gate-relay", text: "lease renewed, ttl 30s" },
  { level: "info", service: "ledger-api", text: "capture 8841 written" },
  {
    level: "warn",
    service: "dock-worker",
    text: "queue depth 212, above the mark",
  },
  {
    level: "debug",
    service: "ledger-api",
    text: "pool 4 of 8 connections busy",
  },
  {
    level: "error",
    service: "gate-relay",
    text: "handshake refused by dock-2",
  },
  { level: "info", service: "dock-worker", text: "batch 77 drained in 412ms" },
  { level: "debug", service: "gate-relay", text: "retry window opens in 2s" },
] as const satisfies readonly Omit<LogLine, "id" | "time">[];

const FALLBACK = {
  level: "info",
  service: "gate-relay",
  text: "heartbeat ok",
} as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** Seeded from the sequence number, so a line is identical on server and client. */
function makeLine(n: number): LogLine {
  const step = SCRIPT[n % SCRIPT.length] ?? FALLBACK;
  const seconds = 15127 + n * 3;
  const time = `${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return { id: `line-${n}`, time, ...step };
}

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function LogTailDemo() {
  const [running, setRunning] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [lines, setLines] = React.useState<LogLine[]>([]);
  const [tailing, setTailing] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const seq = React.useRef(0);

  // A hidden tab throttles timers and paints nothing, so the feed holds rather
  // than dumping a burst of lines the moment it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || hidden) return;
    const timer = window.setInterval(() => {
      const line = makeLine(seq.current);
      seq.current += 1;
      setLines((prev) => [...prev, line].slice(-60));
    }, 900);
    return () => window.clearInterval(timer);
  }, [running, hidden]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LogTail
        label="coldbrook / gate-relay"
        lines={lines}
        tailing={tailing}
        onTailingChange={setTailing}
        onPendingChange={setPending}
        emptyLabel="Waiting for lines. Start the feed."
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning((was) => !was)}
          className={chip}
        >
          {running ? "Pause feed" : "Start feed"}
        </button>
        <button
          type="button"
          onClick={() => {
            setLines([]);
            seq.current = 0;
          }}
          disabled={lines.length === 0}
          className={chip}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{tailing ? "Tailing" : "Held"}</span>
        {` · ${lines.length} lines · ${tailing ? "0 held" : `${pending} new`}`}
      </p>
    </div>
  );
}
