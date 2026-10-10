"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShapeLattice } from "@/registry/ui/shape-lattice";

export const tweaks = defineTweaks({
  shape: {
    kind: "choice",
    label: "Shape",
    default: "square",
    options: ["square", "cross", "arrow"],
    names: { square: "Square", cross: "Cross", arrow: "Arrow" },
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 26,
    min: 16,
    max: 48,
    step: 2,
    unit: "px",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "ink",
    options: ["ink", "accent", "signal", "ember"],
    names: { ink: "Ink", accent: "Accent", signal: "Signal", ember: "Ember" },
  },
});

type Hand = "light" | "you" | "flipped";

/**
 * Gaugeworks, makers of field instruments: the lattice behind the launch
 * line turns to face whoever is looking, and a tap flips it over.
 */
export function ShapeLatticeDemo({
  chrome = true,
  // The lattice is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState<Hand>("light");
  const motionSafe = useMotionSafe();

  // A flip is a beat: the line says so, then goes back to who is facing.
  React.useEffect(() => {
    if (hand !== "flipped") return;
    const done = window.setTimeout(() => setHand("you"), 1600);
    return () => window.clearTimeout(done);
  }, [hand]);

  const lattice = (
    <ShapeLattice
      onActiveChange={(active) =>
        setHand((h) => (active ? (h === "flipped" ? h : "you") : "light"))
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
          // Under reduced motion the lattice does not flip, so neither does the line.
          if (event.target === event.currentTarget && motionSafe)
            setHand("flipped");
        }}
      >
        <div className="max-w-60 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Instruments that turn toward you
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">Field kit · 12 sensors</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the kit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ShapeLattice>
  );

  if (!chrome) return <div className="flex w-full">{lattice}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {lattice}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hand === "flipped" ? (
          <>
            <span className="text-signal">flipped from your press</span> · the
            ring rolls out
          </>
        ) : hand === "you" ? (
          <>
            <span className="text-signal">facing you</span> · the turn travels
          </>
        ) : (
          <>
            <span className="text-signal">following the light</span> · move in
          </>
        )}
      </p>
    </div>
  );
}
