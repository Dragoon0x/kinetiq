"use client";

import * as React from "react";

import { BadgeCount } from "@/registry/ui/badge-count";

const APPS = [
  { id: "threads", name: "Coldbrook Threads" },
  { id: "pay", name: "Waylight Pay" },
] as const;

/** A seeded script of arrivals, walked by index — no clock, no randomness. */
const SCRIPT: { id: string; count: number }[] = [
  { id: "threads", count: 1 },
  { id: "pay", count: 2 },
  { id: "threads", count: 7 },
  { id: "pay", count: 1 },
  { id: "threads", count: 94 },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BadgeCountDemo() {
  const [counts, setCounts] = React.useState<Record<string, number>>({
    threads: 3,
    pay: 0,
  });
  const [opened, setOpened] = React.useState("");
  const [step, setStep] = React.useState(0);

  const deliver = () => {
    const next = SCRIPT[step % SCRIPT.length];
    if (!next) return;
    setStep(step + 1);
    setOpened("");
    setCounts({ ...counts, [next.id]: (counts[next.id] ?? 0) + next.count });
  };

  const open = (id: string, name: string) => {
    setOpened(name);
    setCounts({ ...counts, [id]: 0 });
  };

  const unread = Object.values(counts).reduce((sum, one) => sum + one, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        {APPS.map((one) => (
          <BadgeCount
            key={one.id}
            app={one.name}
            count={counts[one.id] ?? 0}
            onOpen={() => open(one.id, one.name)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={deliver} className={chip}>
          They arrive
        </button>
        <button
          type="button"
          onClick={() => {
            setCounts({ threads: 128, pay: 0 });
            setOpened("");
          }}
          className={chip}
        >
          Past the cap
        </button>
        <button
          type="button"
          onClick={() => {
            setCounts({ threads: 0, pay: 0 });
            setOpened("");
            setStep(0);
          }}
          disabled={unread === 0}
          className={chip}
        >
          Read them all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {opened ? `opened ${opened}` : `${unread} unread`}
        </span>
        {` · threads ${counts.threads ?? 0} · pay ${counts.pay ?? 0}`}
      </p>
    </div>
  );
}
