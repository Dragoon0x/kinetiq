"use client";

import * as React from "react";

import { PresenceDot, type PresenceStatus } from "@/registry/ui/presence-dot";

const STATES: {
  value: PresenceStatus;
  control: string;
  detail?: string;
}[] = [
  { value: "online", control: "Here" },
  { value: "away", control: "Away", detail: "back at 15:30" },
  { value: "busy", control: "Busy", detail: "on the yard call" },
  { value: "offline", control: "Gone", detail: "left at 14:52" },
];

export function PresenceDotDemo() {
  const [status, setStatus] = React.useState<PresenceStatus>("online");
  const [changes, setChanges] = React.useState(0);

  const current = STATES.find((state) => state.value === status);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 px-3 py-3">
        <PresenceDot
          status={status}
          name="Ines Moreau"
          label="Ines Moreau"
          detail={current?.detail}
          size="lg"
          onAnnounce={() => setChanges((count) => count + 1)}
        />
        <p className="mt-1 text-xs text-ink-3">
          Coldbrook dispatch · yard team
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((state) => (
          <button
            key={state.value}
            type="button"
            aria-pressed={state.value === status}
            onClick={() => setStatus(state.value)}
            className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-cobalt-wash aria-pressed:text-cobalt-bright"
          >
            {state.control}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Ines Moreau — <span className="text-signal">{status}</span> ·{" "}
        {changes === 1 ? "1 change" : `${changes} changes`}
      </p>
    </div>
  );
}
