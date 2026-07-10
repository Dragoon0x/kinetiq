"use client";

import * as React from "react";

import { ShadowScript } from "@/registry/ui/shadow-script";
import { cn } from "@/registry/lib/utils";

/**
 * ShadowScript on the noon bench: the KQ-108 plate stands MERIDIAN in the
 * light while the vault note hides in its shadow. A status word mirrors the
 * reveal — the shadow reads MUTE under the overhead lamp and flips to
 * LEGIBLE once the light swings past the 42° line.
 */
export function ShadowScriptDemo() {
  const [revealed, setRevealed] = React.useState(false);

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
          <span className="text-label text-ink-2">
            Noon Bench &middot; Cast Study
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-108</span>
        </div>

        <ShadowScript
          text="MERIDIAN"
          secret="the vault opens at dusk"
          onReveal={setRevealed}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-hairline pt-3">
          <p
            role="status"
            className={cn(
              "font-mono text-xs font-medium tracking-[0.14em]",
              revealed ? "text-signal" : "text-ink-2",
            )}
          >
            SHADOW &middot; {revealed ? "LEGIBLE" : "MUTE"}
          </p>
          <p className="font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
            KQ-108 &middot; Shadow Script &middot; Reveal 42&deg; &middot;
            &zeta; 0.98
          </p>
        </div>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag the lamp low - the shadow has something to say.
      </p>
    </div>
  );
}
