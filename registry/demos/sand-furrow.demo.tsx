"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SandFurrow } from "@/registry/ui/sand-furrow";

export const tweaks = defineTweaks({
  grainSize: {
    kind: "range",
    label: "Grain size",
    default: 1.5,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: "px",
  },
  settle: {
    kind: "range",
    label: "Settle",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  plough: {
    kind: "range",
    label: "Plough",
    default: 24,
    min: 8,
    max: 40,
    step: 2,
    unit: "px",
  },
});

/**
 * The Basinworks dig, trench four: a floor found under the dunes, still
 * mostly buried. Plough a furrow to look; the sand slumps back in.
 */
export function SandFurrowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [cleared, setCleared] = React.useState(false);
  const [uncovered, setUncovered] = React.useState(0);

  const tray = (
    <SandFurrow
      label="Trench four"
      cleared={cleared}
      onClearedChange={setCleared}
      onPlough={setUncovered}
      sound={sound}
      className={chrome ? "h-60 w-full" : "h-56 w-full"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{tray}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks dig · trench 4
          </p>
          <p className="text-base font-medium text-foreground">
            A floor under the dunes
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCleared((c) => !c)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {cleared ? "Cover again" : "Sweep clear"}
        </button>
      </div>
      {tray}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {cleared ? (
          <>
            <span className="text-signal">swept clear</span> · backspace pours
            it back
          </>
        ) : uncovered > 0 ? (
          <>
            <span className="text-signal">
              {Math.round(uncovered * 100)}% uncovered
            </span>{" "}
            · the banks slump back in
          </>
        ) : (
          <>
            <span className="text-signal">buried</span> · drag to plough a
            furrow
          </>
        )}
      </p>
    </div>
  );
}
