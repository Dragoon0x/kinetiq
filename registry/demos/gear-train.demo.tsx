"use client";

import * as React from "react";

import { GearTrain } from "@/registry/ui/gear-train";
import { cn } from "@/registry/lib/utils";

/** KQ-153 bench ratios: drive, idler, output tooth counts. */
const TEETH: [number, number, number] = [12, 18, 24];

/** Feed the bench boots with — the readout mirrors settles from here. */
const BOOT_FEED = 35;

const pad3 = (v: number): string => String(Math.round(v)).padStart(3, "0");

/**
 * GearTrain dressed as the KQ-153 transmission bench: three meshed wheels
 * carry a hand-cranked drive through 12:18:24 into the feed needle. The FEED
 * readout mirrors each settle, and the ratio line prints what the train does
 * to your hand on the way through.
 */
export function GearTrainDemo() {
  // KQ-153 boots at 35 percent feed; the readout only moves on settle.
  const [feed, setFeed] = React.useState(BOOT_FEED);
  const ratioIn = (TEETH[0] / TEETH[0]).toFixed(2);
  const ratioOut = (TEETH[0] / TEETH[2]).toFixed(2);

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
          <span className="text-label text-ink-2">Transmission Bench</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-153</span>
        </div>

        <div className="flex flex-col items-center gap-4">
          <GearTrain
            defaultValue={BOOT_FEED}
            teeth={TEETH}
            height={190}
            onValueChange={setFeed}
            aria-label="Feed rate"
          />

          <div className="flex w-full flex-col gap-2 border-t border-hairline pt-3">
            {/* Settled readout — FEED lands with the needle, never per pixel. */}
            <p
              role="status"
              className="text-center text-label text-ink-3 tabular-nums"
            >
              Feed &middot;{" "}
              <span className="font-mono text-sm text-signal">
                {pad3(feed)}%
              </span>
            </p>
            <p className="text-center font-mono text-[10px] tracking-[0.12em] text-ink-3 tabular-nums">
              {TEETH.join(":")} &middot; {ratioIn}x &rarr; {ratioOut}x
            </p>
          </div>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-153 &middot; Gear Train &middot; {TEETH.join(":")} &middot; 2.5
          Turns &middot; &zeta; 1.00
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Turn any wheel - the ratios carry your hand to the needle.
      </p>
    </div>
  );
}
