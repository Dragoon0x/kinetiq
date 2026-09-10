"use client";

import * as React from "react";

import { ContextLines, type ContextMatch } from "@/registry/ui/context-lines";

const rows = (block: string) => block.split(" | ");

/** A search for hold_id across Coldbrook's ledger-api log — seeded, invented. */
const MATCHES: ContextMatch[] = [
  {
    id: "m1",
    line: 118,
    text: "hold_id=4471 state=claimed by=dock-worker",
    before: rows(
      "batch=118 opened holds=12 | lease worker=dock-worker slot=3 | ledger=coldbrook locked seq=99120 | claim start amount=48.20 CBK",
    ),
    after: rows(
      "write ok seq=99121 dur=8ms | gate-relay ack latency=812ms | batch=118 progress 2 of 12 | lease renewed slot=3",
    ),
  },
  {
    id: "m2",
    line: 204,
    text: "hold_id=4474 state=rejected reason=ledger_closed",
    before: rows(
      "gate-relay answered after 6.4s | settle start seq=99180 | ledger=coldbrook window closed | reject queued for retry",
    ),
    after: rows(
      "retry in 30s attempt=1 | metric holds.rejected +1 | batch=118 progress 9 of 12 | worker=dock-worker idle 40ms",
    ),
  },
  {
    id: "m3",
    line: 377,
    text: "hold_id=4474 state=settled attempt=2",
    before: rows(
      "sweep opened stragglers=3 | ledger=coldbrook window open | retry attempt=2 seq=99244 | write ok seq=99245 dur=11ms",
    ),
    after: rows(
      "gate-relay ack latency=210ms | batch=118 closed holds=12 | worker=dock-worker released slot=3 | settle-runner idle",
    ),
  },
];

const chip =
  "border-hairline-strong hover:bg-accent focus-visible:outline-ring flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export function ContextLinesDemo() {
  const [open, setOpen] = React.useState<string[]>(["m2"]);
  const [context, setContext] = React.useState(2);

  const shown = MATCHES.reduce(
    (total, match) =>
      total +
      1 +
      (open.includes(match.id)
        ? Math.min(context, match.before.length) +
          Math.min(context, match.after.length)
        : 0),
    0,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ContextLines
        label="ledger-api · hold_id"
        query="hold_id"
        matches={MATCHES}
        openIds={open}
        onOpenChange={setOpen}
        context={context}
        onContextChange={setContext}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={open.length === MATCHES.length}
          onClick={() => setOpen(MATCHES.map((match) => match.id))}
        >
          Open all
        </button>
        <button
          type="button"
          className={chip}
          disabled={open.length === 0}
          onClick={() => setOpen([])}
        >
          Fold all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {MATCHES.length} matches · {open.length} open ·{" "}
        <span className="text-signal">context ±{context}</span> · {shown} lines
      </p>
    </div>
  );
}
