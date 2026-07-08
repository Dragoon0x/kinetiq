"use client";

import * as React from "react";

import { Readout } from "@/registry/ui/readout";

type Delta = { value: string; direction: "up" | "down" };

export function ReadoutDemo() {
  const [latency, setLatency] = React.useState(42.6);
  const [delta, setDelta] = React.useState<Delta | undefined>(undefined);
  const [rps, setRps] = React.useState(12418);

  const simulate = (kind: "improvement" | "regression") => {
    const step = 2 + Math.random() * 5.5;
    const next =
      kind === "improvement"
        ? Math.max(8, Number((latency - step).toFixed(1)))
        : Number((latency + step).toFixed(1));
    const pct = ((next - latency) / latency) * 100;
    setDelta({
      value: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
      direction: kind === "improvement" ? "up" : "down",
    });
    setLatency(next);
  };

  // Streaming metric: ticks up on its own every 2s.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setRps((v) => v + Math.floor(40 + Math.random() * 320));
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="border-border bg-card w-full max-w-sm rounded-3 border p-5">
      <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
        p95 latency · ms
      </p>
      <div className="mt-2">
        <Readout
          size="xl"
          value={latency}
          format={(v) => v.toFixed(1)}
          delta={delta}
          className="font-semibold"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => simulate("improvement")}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1.5 text-xs font-medium"
        >
          Simulate improvement
        </button>
        <button
          type="button"
          onClick={() => simulate("regression")}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1.5 text-xs font-medium"
        >
          Simulate regression
        </button>
      </div>
      <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          requests / sec
        </span>
        <Readout size="sm" value={rps} className="font-medium" />
      </div>
    </div>
  );
}
