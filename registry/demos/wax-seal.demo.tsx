"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WaxSeal } from "@/registry/ui/wax-seal";

export const tweaks = defineTweaks({
  hold: {
    kind: "range",
    label: "Hold",
    default: 800,
    min: 400,
    max: 1500,
    step: 100,
    unit: "ms",
  },
  wax: {
    kind: "choice",
    label: "Wax",
    default: "crimson",
    options: ["crimson", "navy", "forest"],
    names: { crimson: "Crimson", navy: "Navy", forest: "Forest" },
  },
  folds: { kind: "range", label: "Folds", default: 3, min: 2, max: 3, step: 1 },
});

/**
 * A private note in the Basinworks studio app: Mira leaves Ada the keys,
 * sealed until she opens it.
 */
export function WaxSealDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [resealed, setResealed] = React.useState(false);

  return (
    <div className="flex w-full max-w-80 flex-col items-center gap-4">
      <WaxSeal
        to="Ada Fern"
        from="Mira"
        date="07 Oct"
        message="The studio keys are under the blue pot by the door. Water the fig if the soil is dry, and finish the plum cake before Friday."
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setResealed(true);
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">open</span> · from mira · 07 oct
            </>
          ) : (
            <>
              <span className="text-signal">
                {resealed ? "resealed" : "sealed"}
              </span>{" "}
              · hold the seal to open
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
