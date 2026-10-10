"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PaperCrease } from "@/registry/ui/paper-crease";

export const tweaks = defineTweaks({
  folds: {
    kind: "range",
    label: "Folds",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  shade: {
    kind: "range",
    label: "Shade",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * A Coldbrook Bank letter of credit, delivered: the headline arrives folded
 * like the letter itself and opens crease by crease.
 */
export function PaperCreaseDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card px-5 py-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Bank · letter 0412
        </p>
        <PaperCrease
          as="h2"
          text={"Letter of credit,\nsigned and sealed"}
          paper="var(--bg-2)"
          sound={sound}
          onComplete={(state) => setOpen(state === "open")}
          className="text-[clamp(1.375rem,8cqw,3.25rem)] leading-[1.15] font-medium tracking-tight text-foreground"
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">open</span> · press the letter to
              fold it again
            </>
          ) : (
            <>
              <span className="text-signal">folded</span> · in its envelope
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
