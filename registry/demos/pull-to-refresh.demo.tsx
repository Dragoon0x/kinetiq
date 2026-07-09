"use client";

import * as React from "react";

import { PullToRefresh } from "@/registry/ui/pull-to-refresh";

type FeedRow = {
  id: string;
  serial: string;
  title: string;
  time: string;
};

const INITIAL: FeedRow[] = [
  { id: "r-104", serial: "104", title: "Torque loop re-armed", time: "09:41" },
  { id: "r-103", serial: "103", title: "Bench calibrated to spec", time: "09:38" },
  { id: "r-102", serial: "102", title: "Damping sweep complete", time: "09:33" },
  { id: "r-101", serial: "101", title: "Coolant pressure nominal", time: "09:27" },
  { id: "r-100", serial: "100", title: "Session opened", time: "09:22" },
];

// Fixed pool cycled by a counter — no randomness, no clock reads at runtime.
const POOL: ReadonlyArray<{ title: string; time: string }> = [
  { title: "Vibration node retuned", time: "09:44" },
  { title: "Gyro drift corrected", time: "09:46" },
  { title: "Flux gate re-seated", time: "09:49" },
  { title: "Actuator backlash trimmed", time: "09:52" },
  { title: "Thermal envelope logged", time: "09:55" },
  { title: "Encoder index verified", time: "09:58" },
];

export function PullToRefreshDemo() {
  const [rows, setRows] = React.useState<FeedRow[]>(INITIAL);
  // Deterministic cursors: how many rows have been prepended, and the next
  // serial to mint. Both advance only on refresh.
  const cursorRef = React.useRef(0);
  const nextSerialRef = React.useRef(105);

  const handleRefresh = React.useCallback(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    // Alternate 1 or 2 new rows per refresh, straight from the pool.
    const count = cursorRef.current % 2 === 0 ? 2 : 1;
    const fresh: FeedRow[] = [];
    for (let i = 0; i < count; i++) {
      const entry = POOL[cursorRef.current % POOL.length];
      if (!entry) continue;
      cursorRef.current += 1;
      const serial = String(nextSerialRef.current);
      nextSerialRef.current += 1;
      fresh.push({
        id: `r-${serial}`,
        serial,
        title: entry.title,
        time: entry.time,
      });
    }
    // Newest first; keep the feed bounded so the plate stays tidy.
    setRows((prev) => [...fresh.reverse(), ...prev].slice(0, 7));
  }, []);

  return (
    <div className="border-hairline bg-surface-1 w-full max-w-sm rounded-4 border">
      <div className="border-hairline flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-label text-ink-3">Pull · To Refresh</span>
        <span
          aria-hidden
          className="text-ink-3 font-mono text-[10px] tracking-wider tabular-nums"
        >
          {rows.length} rows
        </span>
      </div>

      <div className="p-3">
        <PullToRefresh
          onRefresh={handleRefresh}
          aria-label="Bench activity feed"
          className="h-64"
        >
          <ul className="divide-hairline divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline gap-3 bg-surface-1 px-3 py-2.5"
              >
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                  {row.serial}
                </span>
                <span className="text-ink flex-1 text-sm">{row.title}</span>
                <span className="text-ink-3 font-mono text-[10px] tabular-nums">
                  {row.time}
                </span>
              </li>
            ))}
          </ul>
        </PullToRefresh>
      </div>

      <div className="border-hairline border-t px-4 py-2">
        <span className="text-ink-3 font-mono text-[11px]">
          Drag down from the top — past the detent to refresh.
        </span>
      </div>
    </div>
  );
}
