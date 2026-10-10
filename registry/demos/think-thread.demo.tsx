"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ThinkThread } from "@/registry/ui/think-thread";

export const tweaks = defineTweaks({
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  wander: {
    kind: "range",
    label: "Wander",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "ink",
    options: ["ink", "cobalt", "signal", "amber"],
    names: { ink: "Ink", cobalt: "Cobalt", signal: "Signal", amber: "Amber" },
  },
});

/** How long the demo thinks, then rests, in ms. */
const THINK = 3400;
const REST = 2600;

/**
 * Gaugeworks Reasoner working on a question about an uptime report: it
 * thinks, settles with how long it took, and is asked again.
 */
export function ThinkThreadDemo({
  chrome = true,
  // The thread is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [thinking, setThinking] = React.useState(true);
  const [took, setTook] = React.useState(Math.round(THINK / 1000));
  const [cycle, setCycle] = React.useState(0);
  const started = React.useRef(0);

  // The demo's own clock: think for a while, settle, rest, think again.
  React.useEffect(() => {
    started.current = performance.now();
    const timer = window.setTimeout(
      () => {
        if (thinking) {
          setTook(
            Math.max(
              1,
              Math.round((performance.now() - started.current) / 1000),
            ),
          );
          setThinking(false);
        } else {
          setThinking(true);
        }
      },
      thinking ? THINK : REST,
    );
    return () => window.clearTimeout(timer);
  }, [thinking, cycle]);

  const toggle = () => {
    if (thinking) {
      setTook(
        Math.max(1, Math.round((performance.now() - started.current) / 1000)),
      );
    }
    setThinking((t) => !t);
    setCycle((c) => c + 1);
  };

  const card = (
    <div className="flex w-full flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Why did uptime dip on the 14th?
        </p>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Reasoner
        </span>
      </div>
      <ThinkThread
        thinking={thinking}
        label="Gaugeworks Reasoner is thinking"
        doneLabel={`Thought for ${took}s`}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-sm justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {card}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {thinking ? "thinking" : "settled"}
          </span>
          {thinking ? " · gaugeworks reasoner" : ` · thought for ${took}s`}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <span className="grid text-center">
            <span className="invisible col-start-1 row-start-1">
              Think again
            </span>
            <span className="col-start-1 row-start-1">
              {thinking ? "Stop" : "Think again"}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
