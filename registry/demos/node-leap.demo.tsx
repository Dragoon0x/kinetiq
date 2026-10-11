"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NodeLeap } from "@/registry/ui/node-leap";

export const tweaks = defineTweaks({
  strands: {
    kind: "range",
    label: "Strands",
    default: 7,
    min: 2,
    max: 14,
    step: 1,
  },
  hopRate: {
    kind: "range",
    label: "Hop rate",
    default: 3,
    min: 0.5,
    max: 8,
    step: 0.5,
    unit: "/s",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Relay: a message network that routes around trouble. The hero
 * sits over the relay itself, signals hopping node to node.
 */
export function NodeLeapDemo({
  chrome = true,
  // The relay is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [crossings, setCrossings] = React.useState(0);
  const strands = values.strands ?? 7;
  const rate = values.hopRate ?? 3;

  const field = (
    <NodeLeap
      onCrossing={() => setCrossings((n) => n + 1)}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-58 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Relay
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Messages that find their own way
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Every node passes it on; a gap is just another route.
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Start relaying
              </button>
            </>
          ) : null}
        </div>
      </div>
    </NodeLeap>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {strands} {strands === 1 ? "strand" : "strands"}
        </span>{" "}
        · {rate} {rate === 1 ? "hop" : "hops"} a second · {crossings}{" "}
        {crossings === 1 ? "crossing" : "crossings"}
      </p>
    </div>
  );
}
