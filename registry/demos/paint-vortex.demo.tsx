"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PaintVortex } from "@/registry/ui/paint-vortex";

export const tweaks = defineTweaks({
  twist: {
    kind: "range",
    label: "Twist",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.1,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dusk",
    options: ["dusk", "sage", "clay", "ink"],
    names: { dusk: "Dusk", sage: "Sage", clay: "Clay", ink: "Ink" },
  },
});

type Hand = "rest" | "pull" | "stirred";

/**
 * Fernworks Felt, a hand-dyed wool shop: this season's colourways wound
 * into one slow vortex of felt behind the launch line.
 */
export function PaintVortexDemo({
  chrome = true,
  // The paint is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState<Hand>("rest");
  const motionSafe = useMotionSafe();
  const palette = values.palette ?? "dusk";
  const twist = values.twist ?? 0.5;
  const speed = values.speed ?? 0.5;

  // A stir settles in under a second; the line says so for that beat.
  React.useEffect(() => {
    if (hand !== "stirred") return;
    const done = window.setTimeout(() => setHand("pull"), 1100);
    return () => window.clearTimeout(done);
  }, [hand]);

  const vortex = (
    <PaintVortex
      onActiveChange={(active) =>
        setHand((h) => (active ? (h === "stirred" ? h : "pull") : "rest"))
      }
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div
        className="flex size-full items-center p-4 sm:p-6"
        onPointerDown={(event) => {
          // Under reduced motion the paint is not stirred, so neither is the line.
          if (event.target === event.currentTarget && motionSafe)
            setHand("stirred");
        }}
      >
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Felt
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Dyed by hand, wound slow
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Five colourways this season
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Shop the wool
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PaintVortex>
  );

  if (!chrome) return <div className="flex w-full">{vortex}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {vortex}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hand === "stirred" ? (
          <>
            <span className="text-signal">stirred</span> · the arms wind and
            settle
          </>
        ) : hand === "pull" ? (
          <>
            <span className="text-signal">following you</span> · the eye leans
            in
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · twist{" "}
            {twist.toFixed(2)} · {speed > 0 && motionSafe ? "turning" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
