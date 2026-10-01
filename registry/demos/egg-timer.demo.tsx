"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EggTimer } from "@/registry/ui/egg-timer";

export const tweaks = defineTweaks({
  max: {
    kind: "range",
    label: "Scale",
    default: 60,
    min: 15,
    max: 60,
    step: 5,
    unit: "min",
  },
  shell: {
    kind: "choice",
    label: "Shell",
    default: "lemon",
    options: ["pear", "lemon", "mint"],
    names: { pear: "Pear", lemon: "Lemon", mint: "Mint" },
  },
  ticking: { kind: "toggle", label: "Ticking", default: true },
});

const pad = (n: number) => String(n).padStart(2, "0");
const clockOf = (s: number) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

/**
 * Fernworks' kitchen card: the eggs went on a little while ago and the timer
 * is already running. It stays silent until someone touches it.
 */
export function EggTimerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [secs, setSecs] = React.useState(312);
  const [running, setRunning] = React.useState(true);
  const [done, setDone] = React.useState(false);

  const timer = (
    <EggTimer
      label="Soft-boiled eggs"
      value={secs}
      onValueChange={(s) => {
        setSecs(s);
        if (s > 0) setDone(false);
      }}
      running={running}
      onRunningChange={setRunning}
      onRing={() => setDone(true)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return timer;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex justify-center">{timer}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {done && secs === 0 ? (
            <>
              <span className="text-signal">time is up</span> · eggs ready
            </>
          ) : secs === 0 ? (
            <>
              <span className="text-signal">set a time</span> · twist the dial
            </>
          ) : running ? (
            <>
              <span className="text-signal">running</span> · {clockOf(secs)}{" "}
              left
            </>
          ) : (
            <>
              <span className="text-signal">paused</span> at {clockOf(secs)}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setSecs(4);
            setRunning(true);
            setDone(false);
          }}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Skip to the bell
        </button>
      </div>
    </div>
  );
}
