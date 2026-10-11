"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FlutedTumbler } from "@/registry/ui/fluted-tumbler";

export const tweaks = defineTweaks({
  fluteCount: {
    kind: "range",
    label: "Flutes",
    default: 20,
    min: 10,
    max: 36,
    step: 2,
  },
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  layers: {
    kind: "range",
    label: "Layers",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
});

type Phase = "settled" | "stirring" | "separating";

/** The tonic's layers, bottom to top, as the menu names them. */
const LIQUIDS = ["Cherry", "amber", "cream", "sage"] as const;

/**
 * Coldbrook Tonic Bar: the house layered tonic, built in its fluted glass —
 * cherry under amber under cream — for the guest to stir or leave be.
 */
export function FlutedTumblerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("settled");
  const timer = React.useRef<number | null>(null);
  const layers = values.layers ?? 3;
  const flutes = values.fluteCount ?? 20;

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onStir = () => {
    setPhase("stirring");
    if (timer.current !== null) window.clearTimeout(timer.current);
    // The narration moves on once the hand has had a moment; the glass's own
    // settle is what ends it.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPhase((p) => (p === "stirring" ? "separating" : p));
    }, 1600);
  };

  const onSettle = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPhase("settled");
  };

  const scene = (
    <div className="flex w-full items-center gap-2">
      <div className="flex w-24 shrink-0 flex-col gap-1 pl-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · No. 3
        </span>
        <span className="text-sm leading-snug font-medium text-foreground">
          Orchard tonic
        </span>
        <span className="text-xs leading-snug text-ink-3">
          {LIQUIDS.slice(0, layers).join(", ")}
        </span>
      </div>
      <FlutedTumbler
        className={chrome ? "h-56 min-w-0 flex-1" : "h-52 min-w-0 flex-1"}
        sound={sound}
        onStir={onStir}
        onSettle={onSettle}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{scene}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{phase}</span>
        {phase === "settled"
          ? ` · ${layers} layers, ${flutes} flutes`
          : phase === "stirring"
            ? " · the layers fold together"
            : " · by weight"}
      </p>
    </div>
  );
}
