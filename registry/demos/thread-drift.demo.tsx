"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ThreadDrift } from "@/registry/ui/thread-drift";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Threads",
    default: 18,
    min: 4,
    max: 40,
    step: 2,
  },
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 1.4,
    min: 0.5,
    max: 4,
    step: 0.1,
    unit: "px",
  },
  colors: {
    kind: "choice",
    label: "Colors",
    default: "silk",
    options: ["silk", "indigo", "meadow", "ink"],
    names: { silk: "Silk", indigo: "Indigo", meadow: "Meadow", ink: "Ink" },
  },
});

/**
 * Waylight Mill spins undyed wool; the hero skein drifts behind the opening
 * line and gathers to the visitor's hand.
 */
export function ThreadDriftDemo({
  chrome = true,
  // The skein is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gathering, setGathering] = React.useState(false);
  const [pinched, setPinched] = React.useState(false);
  const count = values.count ?? 18;
  const thickness = values.thickness ?? 1.4;
  const colors = values.colors ?? "silk";

  const skein = (
    <ThreadDrift
      onActiveChange={setGathering}
      onPinchChange={setPinched}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Mill
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Yarn spun slow
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Undyed wool from the valley, by the skein
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Browse yarn
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ThreadDrift>
  );

  if (!chrome) return <div className="flex w-full">{skein}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {skein}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pinched ? (
          <>
            <span className="text-signal">pinched</span> · let go to release
            them
          </>
        ) : gathering ? (
          <>
            <span className="text-signal">gathering</span> · the threads come to
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{colors}</span> · {count} threads ·{" "}
            {thickness.toFixed(1)} px
          </>
        )}
      </p>
    </div>
  );
}
