"use client";

import * as React from "react";

import { HeatCalendar, type HeatDay } from "@/registry/ui/heat-calendar";

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function HeatCalendarDemo() {
  const days = React.useMemo<HeatDay[]>(() => {
    const rand = mulberry32(20240418);
    const out: HeatDay[] = [];
    // Start on a Sunday so the weekday rows line up.
    for (let i = 0; i < 126; i += 1) {
      const r = rand();
      const count = r < 0.35 ? 0 : Math.round(r * r * 14);
      const date = new Date(2023, 11, 31 + i);
      out.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count,
      });
    }
    return out;
  }, []);

  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HeatCalendar days={days} />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Total{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {total.toLocaleString()}
        </span>
      </p>
    </div>
  );
}
