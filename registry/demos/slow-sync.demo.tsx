"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlowSync } from "@/registry/ui/slow-sync";

export const tweaks = defineTweaks({
  coupling: {
    kind: "range",
    label: "Coupling",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  count: {
    kind: "range",
    label: "Dots",
    default: 220,
    min: 60,
    max: 400,
    step: 20,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const phase = (sync: number) =>
  sync < 0.35
    ? "scattered"
    : sync < 0.75
      ? "waves forming"
      : sync < 0.95
        ? "almost in step"
        : "one pulse";

/**
 * Fieldline Sync's landing hero: every device on an account blinking its
 * own heartbeat, slowly agreeing on one.
 */
export function SlowSyncDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sync, setSync] = React.useState(0);
  const [scattered, setScattered] = React.useState(false);

  const field = (
    <SlowSync
      label="Fieldline devices"
      className="h-52 w-full rounded-3 border border-hairline bg-card"
      onSyncChange={(r) => {
        setSync(r);
        if (r > 0.9) setScattered(false);
      }}
      onScatter={() => setScattered(true)}
      {...values}
    >
      <div className="pointer-events-none flex h-full flex-col justify-end gap-1 bg-[linear-gradient(to_top,var(--card)_12%,transparent_62%)] p-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Sync
        </p>
        <p className="max-w-[16rem] text-lg leading-tight font-semibold tracking-tight text-foreground">
          Every device, one beat.
        </p>
      </div>
    </SlowSync>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">sync {Math.round(sync * 100)}%</span>
        {scattered ? " · patch scattered · drifting back" : ` · ${phase(sync)}`}
      </p>
    </div>
  );
}
