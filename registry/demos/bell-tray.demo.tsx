"use client";

import * as React from "react";

import { BellTray, type BellTrayItem } from "@/registry/ui/bell-tray";

const SEED: BellTrayItem[] = [
  { id: "n1", title: "Bench 4 back online", time: "2m", unread: true },
  { id: "n2", title: "Fieldline sync finished", time: "18m", unread: true },
  { id: "n3", title: "Invoice 4471 settled", time: "1h", unread: false },
];

/** Seeded arrivals, cycled in order — no randomness, no clock. */
const INCOMING = [
  "Sensor 12 drifting",
  "Coldbrook backup complete",
  "Waylight mast recalibrated",
];

const TODAY = [
  { id: "t1", label: "Calibration sweep", at: "09:00" },
  { id: "t2", label: "Bench 4 handover", at: "11:30" },
  { id: "t3", label: "Vendor call · Basinworks", at: "14:00" },
  { id: "t4", label: "Weekly digest cut", at: "17:15" },
];

export function BellTrayDemo() {
  const [items, setItems] = React.useState(SEED);
  const [arrivals, setArrivals] = React.useState(0);

  const unread = items.filter((item) => item.unread).length;

  const arrive = () => {
    const title = INCOMING[arrivals % INCOMING.length] ?? INCOMING[0] ?? "";
    setItems((previous) => [
      { id: `a${arrivals}`, title, time: "now", unread: true },
      ...previous,
    ]);
    setArrivals(arrivals + 1);
  };

  const read = (ids: string[]) =>
    setItems((previous) =>
      previous.map((item) =>
        ids.includes(item.id) ? { ...item, unread: false } : item,
      ),
    );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
          <span className="truncate text-sm font-semibold">Fernworks</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={arrive}
              className="flex h-9 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Simulate arrival
            </button>
            <BellTray
              items={items}
              onRead={read}
              onDismiss={(id) =>
                setItems((previous) =>
                  previous.filter((item) => item.id !== id),
                )
              }
            />
          </div>
        </div>

        <ul className="p-3">
          {TODAY.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-b-0"
            >
              <span className="min-w-0 truncate text-[13px] text-ink-2">
                {entry.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {entry.at}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{unread}</span> unread of{" "}
        <span className="tabular-nums">{items.length}</span>
      </p>
    </div>
  );
}
