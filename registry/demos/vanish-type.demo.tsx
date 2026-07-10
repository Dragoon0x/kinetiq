"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { VanishType } from "@/registry/ui/vanish-type";

const WORDS = [
  "Motion",
  "is",
  "a",
  "material",
  "calibrated",
  "to",
  "the",
  "hand",
];

/**
 * VanishType dressed as a bench instrument: a bezel plate with corner ticks,
 * a mono spec header, and a status line that mirrors the read head as the
 * manifesto is scrolled word by word into the reading slot.
 */
export function VanishTypeDemo() {
  const [wordIndex, setWordIndex] = React.useState(0);

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
          <p className="text-label text-ink-2">
            MANIFESTO RAIL · {String(WORDS.length).padStart(2, "0")} WORDS
          </p>
          <p className="text-label text-ink-3 tabular-nums">KQ-101</p>
        </div>

        <VanishType
          words={WORDS}
          height={240}
          aria-label="Manifesto rail"
          onWordChange={setWordIndex}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          WORD ·{" "}
          <span className="text-cobalt-bright tabular-nums">
            {String(wordIndex + 1).padStart(2, "0")}/
            {String(WORDS.length).padStart(2, "0")}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll the rail - each word takes the reading slot in turn.
        </p>
      </div>
    </div>
  );
}
