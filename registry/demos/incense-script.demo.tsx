"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { IncenseScript } from "@/registry/ui/incense-script";

export const tweaks = defineTweaks({
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  linger: {
    kind: "range",
    label: "Linger",
    default: 2600,
    min: 800,
    max: 6000,
    step: 200,
    unit: "ms",
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
});

const PHRASES = ["Slow mornings", "Quiet rooms", "Tea at four"];

/**
 * Fieldline Tea Rooms: the stick on the counter writes the house's three
 * promises in smoke, one after another.
 */
export function IncenseScriptDemo({
  chrome = true,
  // The smoke is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState({ index: 0, written: false });

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-1">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · tea rooms
      </p>
      <IncenseScript
        as="h2"
        phrases={PHRASES}
        onPhraseChange={(index) => setState({ index, written: false })}
        onComplete={(index) => setState({ index, written: true })}
        className="text-[12.5cqw] leading-[1.2] font-medium tracking-[-0.01em] @md:text-[min(8.6cqw,3.5rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="mt-2 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {state.written ? "written" : "writing"}
          </span>{" "}
          · {PHRASES[state.index]} · {state.index + 1} of {PHRASES.length}
        </p>
      ) : null}
    </div>
  );
}
