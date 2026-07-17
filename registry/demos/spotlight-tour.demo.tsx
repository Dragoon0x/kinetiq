"use client";

import * as React from "react";

import { SpotlightTour, type TourStep } from "@/registry/ui/spotlight-tour";

export function SpotlightTourDemo() {
  const [open, setOpen] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const searchRef = React.useRef<HTMLDivElement>(null);
  const composeRef = React.useRef<HTMLButtonElement>(null);
  const bellRef = React.useRef<HTMLButtonElement>(null);

  const steps: TourStep[] = React.useMemo(
    () => [
      {
        id: "search",
        target: searchRef,
        title: "Find anything",
        body: "Search across every record from here — names, tags, or serials.",
      },
      {
        id: "compose",
        target: composeRef,
        title: "Start a draft",
        body: "Compose opens a fresh entry with the current context attached.",
      },
      {
        id: "alerts",
        target: bellRef,
        title: "Stay notified",
        body: "Alerts collect here; a dot marks anything unread.",
      },
    ],
    [],
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 flex items-center gap-2 rounded-3 border p-2">
        <div
          ref={searchRef}
          className="border-hairline bg-surface-0 text-ink-3 flex-1 rounded-2 border px-3 py-2 text-xs"
        >
          Search…
        </div>
        <button
          ref={composeRef}
          type="button"
          className="bg-primary text-primary-foreground rounded-2 px-3 py-2 text-xs font-semibold"
        >
          Compose
        </button>
        <button
          ref={bellRef}
          type="button"
          aria-label="Alerts"
          className="border-hairline bg-surface-0 text-ink-2 relative grid size-9 place-items-center rounded-2 border"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M8 2a3.2 3.2 0 0 0-3.2 3.2c0 3-1.3 3.9-1.3 3.9h9c0 0-1.3-.9-1.3-3.9A3.2 3.2 0 0 0 8 2Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path
              d="M6.8 11.4a1.3 1.3 0 0 0 2.4 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span className="bg-signal absolute top-1.5 right-1.5 size-1.5 rounded-full" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
        className="border-hairline bg-surface-1 hover:bg-surface-2 text-ink self-start rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        {done ? "Replay tour" : "Start tour"}
      </button>

      <SpotlightTour
        steps={steps}
        open={open}
        onOpenChange={setOpen}
        onFinish={() => setDone(true)}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Tour{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {open ? "running" : done ? "finished" : "idle"}
        </span>
      </p>
    </div>
  );
}
