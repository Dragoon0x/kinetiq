"use client";

import * as React from "react";

import { GimbalDial } from "@/registry/ui/gimbal-dial";
import { cn } from "@/registry/lib/utils";

/** Boresight sits mid-rail; trim is ALIGNED when both axes hold 50±step. */
const BORESIGHT = 50;
const STEP = 5;

const pad = (v: number): string => String(Math.round(v)).padStart(3, "0");

/**
 * GimbalDial dressed as an antenna trim panel: the KQ-075 dial beside an
 * AZ/EL readout card that mirrors yaw/pitch at every settled detent, plus a
 * status word that flips to ALIGNED when both axes hold boresight.
 */
export function GimbalDialDemo() {
  // KQ-075 boots on boresight; the readout only moves when a detent lands.
  const [trim, setTrim] = React.useState({ yaw: BORESIGHT, pitch: BORESIGHT });
  const aligned =
    Math.abs(trim.yaw - BORESIGHT) <= STEP &&
    Math.abs(trim.pitch - BORESIGHT) <= STEP;

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

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Antenna Trim &middot; 2-Axis</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-075</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
          <GimbalDial
            defaultValue={{ yaw: BORESIGHT, pitch: BORESIGHT }}
            onValueChange={setTrim}
            axisLabels={{ yaw: "Azimuth trim", pitch: "Elevation trim" }}
            aria-label="Antenna trim"
          />

          {/* Settled readout — AZ/EL mirror yaw/pitch, moving per detent. */}
          <dl className="flex w-44 flex-col gap-3 rounded-3 border border-hairline bg-surface-0 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-label text-ink-3">AZ</dt>
              <dd className="font-mono text-sm text-signal tabular-nums">
                {pad(trim.yaw)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-label text-ink-3">EL</dt>
              <dd className="font-mono text-sm text-signal tabular-nums">
                {pad(trim.pitch)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
              <dt className="text-label text-ink-3">Status</dt>
              <dd
                role="status"
                className={cn(
                  "font-mono text-xs font-medium tracking-[0.14em] tabular-nums",
                  aligned ? "text-signal" : "text-ink-2",
                )}
              >
                {aligned ? "ALIGNED" : "SLEWING"}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-075 &middot; Gimbal Dial &middot; Step 5 &middot; P 800 &middot;
          &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Spin a ring or use the arrow keys - each settles on a detent.
      </p>
    </div>
  );
}
