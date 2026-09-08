"use client";

import * as React from "react";

import {
  SubscriptionList,
  type SubscriptionItem,
} from "@/registry/ui/subscription-list";

const ROSTER: SubscriptionItem[] = [
  {
    id: "fernworks",
    name: "Fernworks Studio",
    plan: "Team · 4 seats",
    amount: 18,
    dueInSeconds: 94445,
  },
  {
    id: "basinworks",
    name: "Basinworks Data",
    plan: "Pro",
    amount: 64,
    dueInSeconds: 442800,
  },
  {
    id: "coldbrook",
    name: "Coldbrook Transit",
    plan: "Commuter",
    amount: 9.5,
    dueInSeconds: 1036800,
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks Atlas",
    plan: "Atlas 240",
    amount: 240,
    cycle: "yearly",
    dueInSeconds: 1814400,
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const face = (total: number) => {
  const seconds = Math.max(0, Math.floor(total));
  const days = Math.floor(seconds / 86400);
  const rest = seconds % 86400;
  const clock = [3600, 60, 1]
    .map((unit, index) => Math.floor(rest / unit) % (index === 0 ? 24 : 60))
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
};

export function SubscriptionListDemo() {
  const [items, setItems] = React.useState(ROSTER);
  const [running, setRunning] = React.useState(true);
  const [left, setLeft] = React.useState<number | null>(null);
  const [cancelled, setCancelled] = React.useState<string | null>(null);

  const monthly = items.reduce(
    (sum, item) =>
      sum + (item.cycle === "yearly" ? item.amount / 12 : item.amount),
    0,
  );
  const wait = left ?? items[0]?.dueInSeconds ?? 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SubscriptionList
        items={items}
        running={running}
        onTick={setLeft}
        onCancel={(id) => {
          setCancelled(ROSTER.find((item) => item.id === id)?.name ?? null);
          setItems((current) => current.filter((item) => item.id !== id));
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setRunning((value) => !value)}
        >
          {running ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={items.length === ROSTER.length}
          onClick={() => {
            setItems(ROSTER);
            setCancelled(null);
          }}
        >
          Restore
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Monthly <span className="text-signal">{money.format(monthly)}</span>
        {items.length > 0 ? ` · next in ${face(wait)}` : " · nothing left"}
        {cancelled ? ` · cancelled ${cancelled}` : null}
      </p>
    </div>
  );
}
