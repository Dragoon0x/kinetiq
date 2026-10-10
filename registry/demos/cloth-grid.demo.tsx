"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ClothGrid } from "@/registry/ui/cloth-grid";

export const tweaks = defineTweaks({
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  resolution: {
    kind: "range",
    label: "Resolution",
    default: 28,
    min: 12,
    max: 44,
    step: 4,
  },
  pin: {
    kind: "choice",
    label: "Pin",
    default: "sheet",
    options: ["sheet", "banner", "corners"],
    names: { sheet: "Sheet", banner: "Banner", corners: "Corners" },
  },
});

/**
 * Fernworks Linen's tea towel, laid out on the counter: pinch it, pull it,
 * and let it fall back flat.
 */
export function ClothGridDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [holding, setHolding] = React.useState(false);

  const cloth = (
    <ClothGrid
      caption="Fernworks Linen · No. 14"
      label="Tea towel"
      onGrabChange={setHolding}
      className={chrome ? "aspect-auto h-60 sm:h-72" : "aspect-auto h-52"}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-2xl">{cloth}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks · linen, woven slow
      </p>
      {cloth}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {holding ? (
          <>
            <span className="text-signal">holding</span> · let go to watch it
            settle
          </>
        ) : (
          <>
            <span className="text-signal">resting</span> · grab the cloth
            anywhere or tab in
          </>
        )}
      </p>
    </div>
  );
}
