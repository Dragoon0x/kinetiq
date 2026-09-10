"use client";

import * as React from "react";

import { SpanDetail, type SpanRecord } from "@/registry/ui/span-detail";

const WINDOW_MS = 480;

/** Coldbrook trace 4f2c9a17 — three spans, seeded, no clock read anywhere. */
const HOLD: SpanRecord = {
  id: "sp-1",
  service: "ledger-api",
  operation: "POST /v2/holds",
  startMs: 12,
  durationMs: 214,
  status: "ok",
  attributes: [
    { key: "trace.id", value: "4f2c9a17" },
    { key: "hold.id", value: "4471" },
    { key: "net.peer", value: "coldbrook-3" },
    { key: "auth.key", value: "cbk_live_8f31d2", secret: true },
  ],
  events: [
    { id: "e1", label: "request received", atMs: 12 },
    { id: "e2", label: "ledger locked", atMs: 96 },
    { id: "e3", label: "hold written", atMs: 204 },
  ],
};

const QUERY: SpanRecord = {
  id: "sp-2",
  service: "ledger-api",
  operation: "db.query holds_insert",
  startMs: 108,
  durationMs: 96,
  status: "ok",
  attributes: [
    { key: "db.rows", value: "1" },
    { key: "db.table", value: "holds" },
    { key: "pool.wait", value: "4 ms" },
  ],
  events: [{ id: "e1", label: "statement prepared", atMs: 118 }],
};

const SETTLE: SpanRecord = {
  id: "sp-3",
  service: "gate-relay",
  operation: "settle /holds/4471",
  startMs: 176,
  durationMs: 302,
  status: "error",
  error: "Upstream refused the hold: ledger closed for the day.",
  attributes: [
    { key: "peer.host", value: "basinworks-gate-2" },
    { key: "http.status", value: "409" },
    { key: "retry.count", value: "2" },
    { key: "relay.token", value: "rly_7c0a41e9", secret: true },
  ],
  events: [
    { id: "e1", label: "connection opened", atMs: 176 },
    { id: "e2", label: "retry scheduled", atMs: 318 },
    { id: "e3", label: "refused by peer", atMs: 470 },
  ],
};

const SPANS: SpanRecord[] = [HOLD, QUERY, SETTLE];

const chip =
  "border-hairline-strong hover:bg-accent focus-visible:outline-ring flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2";

export function SpanDetailDemo() {
  const [index, setIndex] = React.useState(0);
  const [open, setOpen] = React.useState(true);
  const [revealed, setRevealed] = React.useState<string[]>([]);
  const [event, setEvent] = React.useState<string | null>(null);

  const span = SPANS[index] ?? HOLD;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SpanDetail
        span={span}
        windowMs={WINDOW_MS}
        open={open}
        onOpenChange={setOpen}
        onReveal={(key) =>
          setRevealed((keys) => (keys.includes(key) ? keys : [...keys, key]))
        }
        onEventSelect={(id) =>
          setEvent(span.events.find((entry) => entry.id === id)?.label ?? null)
        }
        label={`${span.service} span`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            setIndex((n) => (n + 1) % SPANS.length);
            setRevealed([]);
            setEvent(null);
          }}
        >
          Next span
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Fold record" : "Open record"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Span {index + 1} of {SPANS.length} ·{" "}
        <span className="text-signal">{span.durationMs} ms</span> ·{" "}
        {span.status} · {open ? "open" : "folded"}
        {revealed.length > 0 ? ` · ${revealed.length} revealed` : ""}
        {event ? ` · ${event}` : ""}
      </p>
    </div>
  );
}
