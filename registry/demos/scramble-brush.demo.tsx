"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ScrambleBrush } from "@/registry/ui/scramble-brush";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 48,
    min: 16,
    max: 112,
    step: 8,
    unit: "px",
  },
  restore: {
    kind: "range",
    label: "Restore",
    default: 420,
    min: 100,
    max: 1500,
    step: 100,
    unit: "ms",
  },
  glyphs: {
    kind: "choice",
    label: "Glyphs",
    default: "symbols",
    options: ["symbols", "binary", "blocks", "letters"],
    names: {
      symbols: "Symbols",
      binary: "Binary",
      blocks: "Blocks",
      letters: "Letters",
    },
  },
});

/**
 * Gaugeworks release notes: the paragraph scrambles under the cursor and
 * settles back behind it, a little noise for a release about noise.
 */
export function ScrambleBrushDemo({
  chrome = true,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [count, setCount] = React.useState(0);

  const notes = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks 4.2 · release notes
      </p>
      <ScrambleBrush
        text="Readings now arrive in order, even over a weak link. Gauges that drop out mid-sync pick up where they left off, and a noisy sensor is flagged before its numbers reach your charts."
        onScrambleChange={setCount}
        {...values}
        className="text-[clamp(0.95rem,2.7cqi,1.25rem)] leading-[1.55] text-foreground"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{notes}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {notes}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {count > 0
            ? `${count} ${count === 1 ? "letter" : "letters"} scrambled`
            : "settled"}
        </span>{" "}
        · brush the paragraph
      </p>
    </div>
  );
}
