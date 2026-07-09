"use client";

import * as React from "react";

import { CoinToggle } from "@/registry/ui/coin-toggle";
import { cn } from "@/registry/lib/utils";

export function CoinToggleDemo() {
  // KQ-073 ships with the main channel armed; the aux coin rests on tails.
  const [armed, setArmed] = React.useState(true);
  const [auxArmed, setAuxArmed] = React.useState(false);

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <p className="flex items-baseline justify-between text-label text-ink-3">
        <span>Channel Relay</span>
        <span className="font-mono text-[10px] tracking-[0.14em] tabular-nums">
          KQ-073
        </span>
      </p>

      {/* Bezel — generous padding so the coin can bulge mid-flip unclipped. */}
      <div className="rounded-4 border border-hairline bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
          {/* CH A — the primary relay. */}
          <div className="flex items-center gap-4">
            <CoinToggle
              checked={armed}
              onCheckedChange={setArmed}
              aria-label="Arm channel A relay"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-label text-ink-3">CH A &middot; MAIN</span>
              <span
                role="status"
                className={cn(
                  "font-mono text-sm font-medium tracking-[0.14em] tabular-nums",
                  armed ? "text-cobalt-bright" : "text-ink-2",
                )}
              >
                {armed ? "ARMED" : "SAFE"}
              </span>
            </div>
          </div>

          {/* CH B — smaller aux coin, resting on its OFF face. */}
          <div className="flex items-center gap-3">
            <CoinToggle
              size={40}
              defaultChecked={false}
              onCheckedChange={setAuxArmed}
              aria-label="Arm channel B relay"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-label text-ink-3">CH B &middot; AUX</span>
              <span
                className={cn(
                  "font-mono text-xs tracking-[0.14em] tabular-nums",
                  auxArmed ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                {auxArmed ? "ARMED" : "SAFE"}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-073 &middot; Coin Toggle &middot; P 700 &middot; &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Flip the coin - heads arms the channel.
      </p>
    </div>
  );
}
