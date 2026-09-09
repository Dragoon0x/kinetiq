"use client";

import * as React from "react";

import { ToolCall } from "@/registry/ui/tool-call";

/** Fernworks Model 3 in Coldbrook Bank's back office, searching a ledger. */
const ARGS = [
  { key: "account", value: "CBK-2291" },
  { key: "since", value: "2026-07-01" },
  { key: "limit", value: "5" },
];

const LINES = [
  "2026-07-03  CBK-2291    -240.00  Fieldline rota licence",
  "2026-07-11  CBK-2291  +1,180.00  Waylight Pay settlement",
  "2026-07-19  CBK-2291     -62.40  Basinworks Exchange fee",
  "2026-08-02  CBK-2291    -240.00  Fieldline rota licence",
  "2026-08-15  CBK-2291    +905.50  Gaugeworks invoice 1187",
];

/** Tenths of a second at which each line lands; the call completes with the last. */
const ARRIVALS = [4, 7, 9, 12, 14];
const DONE_AT = 14;

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ToolCallDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // A hidden tab pauses the script; the call should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = playing && ticks < DONE_AT;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const lines = LINES.slice(0, ARRIVALS.filter((at) => at <= ticks).length);
  const elapsed = Math.min(ticks, DONE_AT) * 100;
  const status = !playing ? "queued" : running ? "running" : "done";

  const statusText = !playing
    ? "Idle · press play"
    : `${running ? "Running" : "Done"} · ${(elapsed / 1000).toFixed(1)}s · ${lines.length} ${lines.length === 1 ? "line" : "lines"}${running ? "" : open ? " · open" : " · closed"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ToolCall
        name="search_ledger"
        args={ARGS}
        status={status}
        result={lines.join("\n")}
        elapsed={playing ? elapsed : undefined}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setPlaying(true);
            setOpen(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
