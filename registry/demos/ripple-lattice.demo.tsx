"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RippleLattice } from "@/registry/ui/ripple-lattice";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 24,
    min: 12,
    max: 48,
    step: 4,
    unit: "px",
  },
  strength: {
    kind: "range",
    label: "Strength",
    default: 0.6,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["ink", "cobalt", "signal", "rose"],
    names: { ink: "Ink", cobalt: "Cobalt", signal: "Signal", rose: "Rose" },
  },
});

/**
 * Basinworks makes pressure-sensing mats; the hero grid answers every touch
 * the way the mat does.
 */
export function RippleLatticeDemo({
  chrome = true,
  // The grid is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rippling, setRippling] = React.useState(false);
  const [dropped, setDropped] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const dropTimer = React.useRef<number | null>(null);
  const spacing = values.spacing ?? 24;
  const strength = values.strength ?? 0.6;
  const color = values.color ?? "cobalt";

  const onRipple = React.useCallback((x: number, y: number) => {
    setDropped({ x, y });
    if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    dropTimer.current = window.setTimeout(() => {
      dropTimer.current = null;
      setDropped(null);
    }, 1400);
  }, []);

  React.useEffect(
    () => () => {
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    },
    [],
  );

  const grid = (
    <RippleLattice
      onActiveChange={setRippling}
      onRipple={onRipple}
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
            Basinworks
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Surfaces that answer back
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Pressure mats for studios and labs
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the mat
              </button>
            </>
          ) : null}
        </div>
      </div>
    </RippleLattice>
  );

  if (!chrome) return <div className="flex w-full">{grid}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {grid}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {dropped ? (
          <>
            <span className="text-signal">ripple</span> · from {dropped.x},{" "}
            {dropped.y}
          </>
        ) : rippling ? (
          <>
            <span className="text-signal">rippling</span> · the grid follows
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{color}</span> · {spacing} px cells ·
            strength {strength.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
