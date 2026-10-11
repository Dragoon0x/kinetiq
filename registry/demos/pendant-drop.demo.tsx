"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PendantDrop } from "@/registry/ui/pendant-drop";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  reach: {
    kind: "range",
    label: "Reach",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "iris",
    options: ["iris", "amber", "lagoon", "rose"],
    names: { iris: "Iris", amber: "Amber", lagoon: "Lagoon", rose: "Rose" },
  },
});

const INKS: Record<string, string> = {
  iris: "Iris No. 4",
  amber: "Amber No. 2",
  lagoon: "Lagoon No. 7",
  rose: "Rose No. 5",
};

/**
 * Fernworks Inks: a bottled fountain ink whose product picture is a drop of
 * it, hanging over the well.
 */
export function PendantDropDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [drips, setDrips] = React.useState(0);
  const [falling, setFalling] = React.useState(false);
  const settle = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (settle.current !== null) window.clearTimeout(settle.current);
    },
    [],
  );

  const onDrip = (count: number) => {
    setDrips(count);
    setFalling(true);
    if (settle.current !== null) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setFalling(false), 900);
  };

  const ink = INKS[values.palette ?? "iris"] ?? INKS.iris;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <PendantDrop
          className="h-[540px] w-full rounded-3 border border-hairline bg-card"
          label={`A drop of ${ink}`}
          sound={sound}
          onDrip={onDrip}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col overflow-clip rounded-3 border border-hairline bg-card">
        <PendantDrop
          className="h-72 w-full"
          label={`A drop of ${ink}`}
          sound={sound}
          onDrip={onDrip}
          {...values}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fernworks Inks
            </p>
            <p className="text-base leading-snug font-semibold text-foreground">
              {ink}
            </p>
            <p className="text-sm leading-snug text-ink-2">
              Bottled fountain ink, 50 ml. Dries in fourteen seconds.
            </p>
          </div>
          <p className="font-mono text-sm text-foreground tabular-nums">
            $18.00
          </p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {drips === 0 ? (
          <>
            <span className="text-signal">holding</span> · bring the pointer
            close, or press Enter
          </>
        ) : (
          <>
            <span className="text-signal">
              {drips === 1 ? "first drip" : `drip ${drips}`}
            </span>
            {falling ? " · falling into the well" : " · back in the well"}
          </>
        )}
      </p>
    </div>
  );
}
