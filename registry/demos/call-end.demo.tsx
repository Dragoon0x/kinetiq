"use client";

import * as React from "react";

import { CallEnd } from "@/registry/ui/call-end";

const mmss = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function CallEndDemo() {
  const [seconds, setSeconds] = React.useState(42);
  const [ended, setEnded] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const [line, setLine] = React.useState("hold to end");

  React.useEffect(() => {
    if (ended) return;
    const id = window.setInterval(() => {
      // A hidden tab is not watching the clock, so the call waits with it.
      if (document.hidden) return;
      setSeconds((was) => was + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [ended]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CallEnd
        callName="Coldbrook dispatch"
        people={3}
        seconds={seconds}
        ended={ended}
        onEndedChange={setEnded}
        onHoldChange={setHolding}
        onEnd={(at) => setLine(`ended at ${mmss(at)}`)}
        onCancel={() => setLine("released early")}
        onRejoin={() => {
          setSeconds(0);
          setLine("back on the call");
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ended ? "ended" : `live ${mmss(seconds)}`} · 3 on the call ·{" "}
        <span className="text-signal">{holding ? "holding" : line}</span>
      </p>
    </div>
  );
}
