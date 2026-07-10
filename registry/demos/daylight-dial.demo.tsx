"use client";

import * as React from "react";

import { DaylightDial } from "@/registry/ui/daylight-dial";
import { cn } from "@/registry/lib/utils";

const pad2 = (v: number): string => String(v).padStart(2, "0");

/**
 * DaylightDial dressed as the KQ-125 observatory clock: drag the sky through
 * a full civil day — the sun and moon trade the arc, shadows rake off the
 * skyline, and the bench readout mirrors each settled hour.
 */
export function DaylightDialDemo() {
  // KQ-125 boots at 10:00; the readout mirrors settles only.
  const [setHour, setSetHour] = React.useState(10);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Observatory Clock</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-125</span>
        </div>

        <DaylightDial
          defaultHour={10}
          height={240}
          onHourChange={setSetHour}
          aria-label="Observatory time of day"
        />

        {/* Settled readout — moves on release and keys, never per frame. */}
        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-3 tabular-nums"
        >
          Set &middot;{" "}
          <span className="font-mono text-sm text-signal">
            {pad2(setHour)}:00
          </span>
        </p>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-125 &middot; Daylight Dial &middot; Sweep 24 h &middot; Arc
          180&deg; &middot; &zeta; 0.98
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag the sky - shadows sweep and the stars keep their hours.
      </p>
    </div>
  );
}
