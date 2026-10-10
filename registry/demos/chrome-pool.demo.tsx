"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ChromePool } from "@/registry/ui/chrome-pool";

export const tweaks = defineTweaks({
  tint: {
    kind: "choice",
    label: "Tint",
    default: "chrome",
    options: ["chrome", "gold", "rose", "cobalt"],
    names: { chrome: "Chrome", gold: "Gold", rose: "Rose", cobalt: "Cobalt" },
  },
  ripple: {
    kind: "range",
    label: "Ripple",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  roughness: {
    kind: "range",
    label: "Roughness",
    default: 0.25,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Hand = "rest" | "pressed" | "back";

/**
 * Basinworks Foundry, cast-metal homewares: the launch line floats on a
 * pool of the metal itself, and a press leaves a dimple that springs back.
 */
export function ChromePoolDemo({
  chrome = true,
  // The metal is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState<Hand>("rest");
  const tint = values.tint ?? "chrome";

  // The dimple is back to level in under a second; the line says so then.
  React.useEffect(() => {
    if (hand !== "back") return;
    const done = window.setTimeout(() => setHand("rest"), 900);
    return () => window.clearTimeout(done);
  }, [hand]);

  const pool = (
    <ChromePool
      onPressChange={(pressed) => setHand(pressed ? "pressed" : "back")}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Foundry
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Poured, not pressed
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Hand-cast trays · four finishes
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the finishes
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ChromePool>
  );

  if (!chrome) return <div className="flex w-full">{pool}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pool}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hand === "pressed" ? (
          <>
            <span className="text-signal">pressed in</span> · the metal gives
          </>
        ) : hand === "back" ? (
          <>
            <span className="text-signal">springing back</span> · to level
          </>
        ) : (
          <>
            <span className="text-signal">{tint}</span> · at rest
          </>
        )}
      </p>
    </div>
  );
}
