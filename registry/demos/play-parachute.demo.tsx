"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlayParachute } from "@/registry/ui/play-parachute";

export const tweaks = defineTweaks({
  panels: {
    kind: "range",
    label: "Panels",
    default: 12,
    min: 6,
    max: 20,
    step: 2,
  },
  billow: {
    kind: "range",
    label: "Billow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const HANDLES = 8;
const clockName = (k: number) => {
  const hours = Math.round(12 - (k / HANDLES) * 12 + 6) % 12;
  return `${hours === 0 ? 12 : hours} o'clock`;
};

/**
 * Fernworks Play's Saturday club: the parachute is out on the lawn, and
 * anyone can lift an edge.
 */
export function PlayParachuteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [last, setLast] = React.useState<
    { kind: "throw" } | { kind: "lift"; handle: number } | null
  >(null);
  const [throws, setThrows] = React.useState(0);
  const panels = values.panels ?? tweaks.panels.default;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <PlayParachute
          handles={HANDLES}
          className="h-52 w-full"
          sound={sound}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Play · Saturday club
        </p>
        <p className="text-base font-medium text-foreground">
          Parachute games at 10:00
        </p>
      </div>
      <div className="w-full overflow-clip rounded-3 border border-hairline bg-card">
        <PlayParachute
          handles={HANDLES}
          onThrow={() => {
            setLast({ kind: "throw" });
            setThrows((n) => n + 1);
          }}
          onLift={(handle) => setLast({ kind: "lift", handle })}
          className="h-64 w-full"
          sound={sound}
          {...values}
        />
      </div>
      <p className="text-xs text-ink-3">
        Drag an edge to send waves across; tap to throw it up.
      </p>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last?.kind === "throw" ? (
          <>
            <span className="text-signal">thrown</span> ·{" "}
            {throws === 1 ? "once" : `${throws} times`} · settling on the air
          </>
        ) : last?.kind === "lift" ? (
          <>
            <span className="text-signal">{clockName(last.handle)}</span> · edge
            lifted · waves rolling in
          </>
        ) : (
          <>
            <span className="text-signal">resting</span> · {panels} panels ·{" "}
            {HANDLES} handles
          </>
        )}
      </p>
    </div>
  );
}
