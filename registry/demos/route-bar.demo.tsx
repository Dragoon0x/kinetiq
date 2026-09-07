"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { RouteBar } from "@/registry/ui/route-bar";

const VIEWS = [
  {
    id: "overview",
    label: "Overview",
    ms: 600,
    rows: [
      ["Open orders", "34"],
      ["In transit", "12"],
      ["Held at depot", "3"],
    ],
  },
  {
    id: "signals",
    label: "Signals",
    ms: 1600,
    rows: [
      ["Rail pressure", "2.4 bar"],
      ["Line drift", "0.8 mm"],
      ["Last sweep", "07:42"],
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    ms: 900,
    rows: [
      ["Posted", "1 204.00"],
      ["Pending", "318.50"],
      ["Cleared", "12 Mar"],
    ],
  },
] as const;

export function RouteBarDemo() {
  const [view, setView] = React.useState<string>("overview");
  const [pending, setPending] = React.useState<{
    id: string;
    ms: number;
  } | null>(null);

  React.useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setView(pending.id);
      setPending(null);
    }, pending.ms);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const shown = VIEWS.find((entry) => entry.id === view) ?? VIEWS[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={entry.id === view ? "page" : undefined}
            onClick={() => setPending({ id: entry.id, ms: entry.ms })}
            className={cn(
              "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              entry.id === view
                ? "border-cobalt-bright text-foreground"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-3 border border-border bg-card">
        <RouteBar active={pending !== null} label="Waylight view loading" />
        <div className="flex flex-col gap-3 p-4">
          <span className="text-sm font-semibold">
            Waylight · {shown.label}
          </span>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            {shown.rows.map(([term, description]) => (
              <React.Fragment key={term}>
                <dt className="min-w-0 truncate text-muted-foreground">
                  {term}
                </dt>
                <dd className="font-mono text-xs tabular-nums">
                  {description}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pending ? "Loading " : "View "}
        <span className="text-[var(--signal,var(--primary))]">
          {pending ? pending.id : view}
        </span>
      </p>
    </div>
  );
}
