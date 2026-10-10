"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LockOn } from "@/registry/ui/lock-on";

export const tweaks = defineTweaks({
  corner: {
    kind: "range",
    label: "Corner",
    default: 10,
    min: 4,
    max: 20,
    step: 2,
    unit: "px",
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 40,
    min: 0,
    max: 180,
    step: 10,
    unit: "°/s",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", amber: "Amber", ink: "Ink" },
  },
});

const READINGS = { zero: "0.00", calibrate: "2.40", idle: "2.41" } as const;

const control =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Gaugeworks bench 4: the pressure rig's console, where the reticle hunts
 * across the panel and locks onto whichever control you reach for.
 */
export function LockOnDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [locked, setLocked] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState<keyof typeof READINGS>("idle");
  const [exported, setExported] = React.useState(false);

  const panel = (
    <LockOn
      className="w-full rounded-3 border border-hairline bg-surface-1"
      sound={sound}
      onLock={(el) => setLocked(el?.dataset.name ?? null)}
      {...values}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Gaugeworks · bench 4
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              Pressure rig
            </p>
          </div>
          <p className="font-mono text-2xl leading-none text-foreground tabular-nums">
            {READINGS[reading]}
            <span className="ml-1 text-xs text-ink-3">bar</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-name="Zero"
            onClick={() => setReading("zero")}
            className={cn(
              control,
              "border border-hairline-strong text-foreground hover:bg-surface-2",
            )}
          >
            Zero
          </button>
          <button
            type="button"
            data-name="Calibrate"
            data-lock-home
            onClick={() => setReading("calibrate")}
            className={cn(
              control,
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            Calibrate
          </button>
          <button
            type="button"
            data-name="Export log"
            onClick={() => setExported(true)}
            className={cn(
              control,
              "border border-hairline-strong text-foreground hover:bg-surface-2",
            )}
          >
            {/* Both labels share one cell so the button keeps its width. */}
            <span className="grid">
              <span
                className={cn(
                  "col-start-1 row-start-1",
                  exported && "invisible",
                )}
              >
                Export log
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1",
                  !exported && "invisible",
                )}
              >
                Log exported
              </span>
            </span>
          </button>
          <button
            type="button"
            data-name="History"
            onClick={() => setReading("idle")}
            className={cn(
              control,
              "px-2 text-ink-2 underline-offset-4 hover:text-foreground hover:underline",
            )}
          >
            History
          </button>
        </div>
      </div>
    </LockOn>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{panel}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {locked ? (
          <>
            <span className="text-signal">locked</span> · {locked}
          </>
        ) : (
          <>
            <span className="text-signal">scanning</span> · point at a control
            or press Tab
          </>
        )}
      </p>
    </div>
  );
}
