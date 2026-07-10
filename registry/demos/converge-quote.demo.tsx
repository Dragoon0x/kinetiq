"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";
import { ConvergeQuote } from "@/registry/ui/converge-quote";

const LINES = [
  "Nothing here moves",
  "unless a spring",
  "was tuned to move it.",
];

/**
 * ConvergeQuote dressed as a bench instrument: the KQ-107 commissioning
 * note — a bezel plate with corner registration ticks, a mono spec header,
 * and a status line that flips from ASSEMBLING to READABLE as the scattered
 * lines land on their plane. Under reduced motion the plate renders already
 * assembled, so the status reads READABLE from the start.
 */
export function ConvergeQuoteDemo() {
  const motionSafe = useMotionSafe();
  const [converged, setConverged] = React.useState(false);

  // Reduced motion never crosses the threshold — the quote is simply
  // readable, and the status mirrors that instead of waiting.
  const readable = converged || !motionSafe;

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
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

        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-label text-ink-2">COMMISSIONING NOTE</p>
          <p className="text-label text-ink-3 tabular-nums">KQ-107</p>
        </div>

        <ConvergeQuote
          lines={LINES}
          attribution={"BENCH MANUAL · REV 4"}
          height={250}
          aria-label="Commissioning note"
          onConverge={setConverged}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          PLATE &middot;{" "}
          <span className="text-cobalt-bright">
            {readable ? "READABLE" : "ASSEMBLING"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll to assemble the plate - lines land in their own time.
        </p>
      </div>
    </div>
  );
}
