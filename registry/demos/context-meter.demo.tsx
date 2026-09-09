"use client";

import * as React from "react";

import { ContextMeter, type ContextMessage } from "@/registry/ui/context-meter";

const LIMIT = 48_000;
const TICK_MS = 700;

/** A Waylight support thread on Fernworks Model 3, turn by turn. */
const SCRIPT: number[] = [
  1800, 4200, 2600, 5100, 3400, 6200, 2900, 5600, 3100, 4800, 2700, 5900,
];

const compact = (tokens: number) =>
  `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

type Folded = { count: number; freed: number } | null;

export function ContextMeterDemo() {
  const [messages, setMessages] = React.useState<ContextMessage[]>([]);
  const [sent, setSent] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [folded, setFolded] = React.useState<Folded>(null);

  const used = messages.reduce((sum, m) => sum + m.tokens, 0);
  const done = sent >= SCRIPT.length;
  const live = running && !done;

  // A hidden tab holds the thread where it is rather than filling unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const send = React.useCallback(() => {
    const tokens = SCRIPT[sent];
    if (tokens === undefined) return;
    setMessages((current) => [
      ...current,
      { id: `m${sent}`, tokens, kind: sent % 2 === 0 ? "user" : "model" },
    ]);
    setSent(sent + 1);
    setFolded(null);
  }, [sent]);

  React.useEffect(() => {
    if (!live || !visible) return;
    const timer = window.setTimeout(send, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [live, visible, send]);

  const summarize = () => {
    if (messages.length < 3) return;
    const older = messages.slice(0, -2);
    const total = older.reduce((sum, m) => sum + m.tokens, 0);
    const summary: ContextMessage = {
      id: `s${sent}`,
      tokens: Math.round(total * 0.15),
      kind: "summary",
    };
    setMessages([summary, ...messages.slice(-2)]);
    setFolded({ count: older.length, freed: total - summary.tokens });
    setRunning(false);
  };

  const reset = () => {
    setMessages([]);
    setSent(0);
    setRunning(false);
    setFolded(null);
  };

  const percent = Math.round((used / LIMIT) * 100);
  const status = folded
    ? `Summarised ${folded.count} messages · ${compact(folded.freed)} freed`
    : used > LIMIT
      ? `Over the window · ${compact(used - LIMIT)} over`
      : used >= LIMIT * 0.8
        ? "Near limit · summarise offered"
        : `${compact(used)} of ${compact(LIMIT)} · ${percent}% · ${messages.length} messages`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ContextMeter
        label="Fernworks Model 3 · 48k window"
        messages={messages}
        limit={LIMIT}
        onSummarize={summarize}
      />

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Send", onClick: send, disabled: done || live },
          {
            label: "Run",
            onClick: () => setRunning(true),
            disabled: done || live,
          },
          { label: "Reset", onClick: reset, disabled: sent === 0 },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            className={buttonClass}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
        {live ? " · running" : ""}
      </p>
    </div>
  );
}
