"use client";

import * as React from "react";

import { ExtrudeTitle } from "@/registry/ui/extrude-title";
import { cn } from "@/registry/lib/utils";

/**
 * ExtrudeTitle dressed as the KQ-102 pressroom masthead: the KINETIQ block
 * centered on its plate, with a live counter that ticks every time the
 * headline is stamped flat.
 */
export function ExtrudeTitleDemo() {
  const [presses, setPresses] = React.useState(0);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
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

        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="text-label text-ink-3">Pressroom</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-102</span>
        </div>

        <div className="flex items-center justify-center px-2 py-10">
          <ExtrudeTitle
            className="text-4xl sm:text-5xl"
            onPress={() => setPresses((count) => count + 1)}
          >
            KINETIQ
          </ExtrudeTitle>
        </div>

        <p
          role="status"
          className="border-hairline text-label text-ink-3 border-t pt-3 text-center"
        >
          Presses &middot;{" "}
          <span className="text-signal tabular-nums">
            {String(presses).padStart(2, "0")}
          </span>
        </p>
      </div>

      <p className="text-label text-ink-3 text-center">
        Lean around the block, then press it flat.
      </p>
    </div>
  );
}
