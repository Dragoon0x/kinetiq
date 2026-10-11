"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FoldedSteel, foldedSteelPattern } from "@/registry/ui/folded-steel";

export const tweaks = defineTweaks({
  layers: {
    kind: "range",
    label: "Layers",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
  },
  twist: {
    kind: "range",
    label: "Twist",
    default: 0.75,
    min: -3,
    max: 3,
    step: 0.25,
    unit: "turns",
  },
  etch: {
    kind: "range",
    label: "Etch",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Knifeworks, billet 14: a chef's blank before it is ground. The
 * twist lives here, seeded from the tweak, so a drag, a key or a quench moves
 * it and the tweak can still set it.
 */
export function FoldedSteelDemo({
  chrome = true,
  // The bar is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  twist = 0.75,
  layers = 24,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [turns, setTurns] = React.useState(twist);
  const [seen, setSeen] = React.useState(twist);
  if (seen !== twist) {
    setSeen(twist);
    setTurns(twist);
  }
  const [fold, setFold] = React.useState(0.2);

  const bar = (
    <FoldedSteel
      label="Billet 14, pattern-welded steel"
      layers={layers}
      {...values}
      twist={turns}
      onTwistChange={setTurns}
      fold={fold}
      onFoldChange={setFold}
      className="h-32"
    />
  );

  const caption = (
    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
      Coldbrook · billet 14 · {layers} layers
    </p>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {bar}
        {caption}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        {caption}
        <p className="text-sm font-medium text-foreground">
          Chef&apos;s blank, before the grind
        </p>
      </div>
      {bar}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          twist {Math.abs(turns).toFixed(2)} turns
        </span>{" "}
        · fold {Math.round(fold * 100)}% · {foldedSteelPattern(turns, fold)}
      </p>
    </div>
  );
}
