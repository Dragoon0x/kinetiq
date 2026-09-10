"use client";

import * as React from "react";

import { LogGroup, type LogLine } from "@/registry/ui/log-group";

const RETRY = "gate-relay unreachable, retry scheduled";
const SLOW = "gate-relay slow to answer, 812 ms";

/** Basinworks dock-worker, batch 118 — a seeded script, replayed by the buttons. */
const SCRIPT: LogLine[] = [
  {
    id: "l1",
    level: "info",
    at: "09:41:02",
    message: "batch 118 opened, 12 holds",
  },
  {
    id: "l2",
    level: "info",
    at: "09:41:02",
    message: "gate-relay handshake ok",
  },
  { id: "l3", level: "warn", at: "09:41:03", message: SLOW },
  { id: "l4", level: "warn", at: "09:41:03", message: SLOW },
  { id: "l5", level: "warn", at: "09:41:04", message: SLOW },
  { id: "l6", level: "info", at: "09:41:05", message: "hold 4471 written" },
  { id: "l7", level: "error", at: "09:41:06", message: RETRY },
  { id: "l8", level: "error", at: "09:41:06", message: RETRY },
  { id: "l9", level: "error", at: "09:41:07", message: RETRY },
  { id: "l10", level: "error", at: "09:41:07", message: RETRY },
  { id: "l11", level: "error", at: "09:41:08", message: RETRY },
  { id: "l12", level: "error", at: "09:41:09", message: RETRY },
  {
    id: "l13",
    level: "info",
    at: "09:41:10",
    message: "gate-relay back, batch resumed",
  },
  {
    id: "l14",
    level: "info",
    at: "09:41:11",
    message: "batch 118 closed, 12 holds",
  },
];

const START = 7;

const chip =
  "border-hairline-strong hover:bg-accent focus-visible:outline-ring flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export function LogGroupDemo() {
  const [shown, setShown] = React.useState(START);
  const [open, setOpen] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<{
    open: boolean;
    count: number;
  } | null>(null);

  const lines = SCRIPT.slice(0, shown);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LogGroup
        label="dock-worker, batch 118"
        lines={lines}
        openIds={open}
        onOpenChange={setOpen}
        onGroupToggle={(_id, isOpen, count) => setLast({ open: isOpen, count })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={shown >= SCRIPT.length}
          onClick={() => setShown((n) => Math.min(SCRIPT.length, n + 1))}
        >
          Emit line
        </button>
        <button
          type="button"
          className={chip}
          disabled={shown === START && open.length === 0}
          onClick={() => {
            setShown(START);
            setOpen([]);
            setLast(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lines.length} {lines.length === 1 ? "line" : "lines"} ·{" "}
        <span className="text-signal">
          {open.length} {open.length === 1 ? "run open" : "runs open"}
        </span>
        {last
          ? ` · ${last.open ? "unfolded" : "folded"} ${last.count} lines`
          : " · nothing unfolded yet"}
      </p>
    </div>
  );
}
