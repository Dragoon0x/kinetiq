"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { SparkBurst, type SparkBurstHandle } from "@/registry/ui/spark-burst";

/**
 * SparkBurst on a bench plate: a hairline bezel with corner registration ticks
 * frames the stage, and a real "Ship it" button sits centered with an
 * invisible SparkBurst layered dead-center behind it. Clicking fires one
 * calibrated burst; the "Dense" control fires a heavier 20-ray shot. The burst
 * layer is pointer-events-none, so it never intercepts the click. The serial is
 * stamped by the specimen plate around this demo, so it prints none of its own.
 */
export function SparkBurstDemo() {
  const burst = React.useRef<SparkBurstHandle>(null);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
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

        <div className="bg-surface-1 rounded-2 flex flex-col items-center gap-6 px-6 py-10">
          <span className="text-label text-ink-2">SPARK · BURST</span>

          {/* The burst sits centered on the button; the button owns the click. */}
          <div className="relative inline-flex items-center justify-center">
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <SparkBurst ref={burst} color="var(--signal)" spread={44} />
            </span>
            <button
              type="button"
              onClick={() => burst.current?.fire()}
              className="border-input bg-surface-0 hover:border-hairline-strong rounded-2 relative border px-5 py-2 text-sm font-medium tracking-tight transition-colors"
            >
              Ship it
            </button>
          </div>

          <button
            type="button"
            onClick={() => burst.current?.fire({ rays: 20 })}
            className="text-ink-3 hover:text-ink-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
          >
            Fire dense (20 rays)
          </button>
        </div>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Click — a calibrated burst, no confetti.
      </p>
    </div>
  );
}
