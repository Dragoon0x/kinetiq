"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DatamoshType } from "@/registry/ui/datamosh-type";

export const tweaks = defineTweaks({
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 0.6,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  burst: {
    kind: "range",
    label: "Burst",
    default: 520,
    min: 200,
    max: 1200,
    step: 40,
    unit: "ms",
  },
  split: {
    kind: "range",
    label: "Split",
    default: 0.04,
    min: 0,
    max: 0.12,
    step: 0.01,
    unit: "em",
  },
  block: {
    kind: "range",
    label: "Block",
    default: 0.28,
    min: 0.12,
    max: 0.6,
    step: 0.04,
    unit: "em",
  },
});

/**
 * The title card of a Fernworks Studio reel: the headline holds still between
 * takes and breaks up like a stream that lost its key frame.
 */
export function DatamoshTypeDemo({
  chrome = true,
  // The corruption is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [key, setKey] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [live, setLive] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Studio · Reel 04
        </p>
        <DatamoshType
          as="h2"
          burstKey={key}
          onBurstStart={() => setLive(true)}
          onComplete={() => {
            setLive(false);
            setCount((c) => c + 1);
          }}
          className="text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground @md:text-[2.2rem] @xl:text-[3rem]"
          {...values}
        >
          Every frame survives the cut
        </DatamoshType>
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            burst {count} · {live ? "corrupting" : "clean frame"}
          </p>
          <button
            type="button"
            onClick={() => setKey((k) => k + 1)}
            className="inline-flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Corrupt
          </button>
        </div>
      ) : null}
    </div>
  );
}
