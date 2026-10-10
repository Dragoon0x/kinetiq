"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { IrisWatch, type IrisWatchWatching } from "@/registry/ui/iris-watch";

export const tweaks = defineTweaks({
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "slate", "hazel", "moss"],
    names: { cobalt: "Cobalt", slate: "Slate", hazel: "Hazel", moss: "Moss" },
  },
  dilation: {
    kind: "range",
    label: "Dilation",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tracking: {
    kind: "range",
    label: "Tracking",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks Optics, an independent optician: its hero is an eye that keeps
 * an eye on the visitor.
 */
export function IrisWatchDemo({
  chrome = true,
  // The eye is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [watching, setWatching] = React.useState<IrisWatchWatching>(null);
  const dilation = values.dilation ?? 0.45;

  const eye = (
    <IrisWatch
      onWatchChange={setWatching}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Optics
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Lenses for the way you look
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Fitted by hand in Coldbrook
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a fitting
              </button>
            </>
          ) : null}
        </div>
      </div>
    </IrisWatch>
  );

  if (!chrome) return <div className="flex w-full">{eye}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {eye}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {watching === "pointer" ? (
          <>
            <span className="text-signal">watching</span> · your pointer
          </>
        ) : watching === "focus" ? (
          <>
            <span className="text-signal">watching</span> · book a fitting
          </>
        ) : (
          <>
            <span className="text-signal">wandering</span> · pupil{" "}
            {Math.round(16 + 40 * dilation)}%
          </>
        )}
      </p>
    </div>
  );
}
