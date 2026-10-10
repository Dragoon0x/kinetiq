"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StubTear } from "@/registry/ui/stub-tear";

export const tweaks = defineTweaks({
  resistance: {
    kind: "range",
    label: "Resistance",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stub: {
    kind: "range",
    label: "Stub",
    default: 0.28,
    min: 0.2,
    max: 0.4,
    step: 0.02,
  },
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * A Waylight Sessions ticket: tearing off the stub confirms you are coming,
 * the way a door attendant would.
 */
export function StubTearDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [torn, setTorn] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const ticket = (
    <StubTear
      torn={torn}
      onTornChange={setTorn}
      onProgressChange={setProgress}
      sound={sound}
      className="self-center"
      stubContent={
        <span className="flex flex-col items-center gap-1">
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase opacity-80">
            Admit one
          </span>
          <span className="text-sm leading-tight font-semibold">F · 12</span>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase opacity-80">
            Row · Seat
          </span>
        </span>
      }
      {...values}
    >
      <div className="flex h-full min-w-0 flex-col justify-between">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Sessions
          </p>
          <p className="mt-1 truncate text-base leading-snug font-semibold text-foreground">
            Night Signals
          </p>
          <p className="truncate text-xs text-ink-2">Hall B · doors 19:00</p>
        </div>
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          Thu 18 Sep · 19:30
        </p>
      </div>
    </StubTear>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{ticket}</div>;
  }

  const [lead, rest] = torn
    ? ["torn", " · attendance confirmed"]
    : progress > 0
      ? [`tearing ${Math.round(progress * 100)}%`, " · keep going"]
      : ["stub attached", " · tear it to confirm"];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {ticket}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{lead}</span>
          {rest}
        </p>
        {/* Always present, so pressing it never drops focus to the page. */}
        <button
          type="button"
          aria-disabled={!torn}
          onClick={() => {
            if (!torn) return;
            setTorn(false);
            setProgress(0);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Reset
        </button>
      </div>
    </div>
  );
}
