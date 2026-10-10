"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TuneIn } from "@/registry/ui/tune-in";

export const tweaks = defineTweaks({
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 1400,
    min: 600,
    max: 2400,
    step: 100,
    unit: "ms",
  },
  noise: {
    kind: "range",
    label: "Noise",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  readout: { kind: "toggle", label: "Readout", default: true },
});

const FREQUENCY = 104.7;

/**
 * Waylight FM's evening programme page: the headline comes in like the
 * station itself, with the dial reading under the carrier.
 */
export function TuneInDemo({
  chrome = true,
  // The headline is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  // A tweak retunes the headline, so its effect is seen at once.
  const runKey = `${take}:${values.sweep}:${values.noise}:${values.readout}`;
  const [tunedKey, setTunedKey] = React.useState<string | null>(null);
  const tuned = tunedKey === runKey;

  const headline = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight FM · live from the harbour
      </p>
      <TuneIn
        key={runKey}
        text="Music for the late shift"
        frequency={FREQUENCY}
        onComplete={() => setTunedKey(runKey)}
        className="text-[clamp(26px,10cqi,58px)] leading-[1.08] font-semibold tracking-[-0.02em] text-balance text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{headline}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {headline}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {tuned ? (
            <>
              <span className="text-signal">tuned</span> · {FREQUENCY} MHz ·
              hover to detune
            </>
          ) : (
            <>
              <span className="text-signal">scanning</span> · the carrier is
              crossing
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Retune
        </button>
      </div>
    </div>
  );
}
