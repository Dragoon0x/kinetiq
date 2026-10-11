"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PillowPrint } from "@/registry/ui/pillow-print";

export const tweaks = defineTweaks({
  puff: {
    kind: "range",
    label: "Puff",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wrinkle: {
    kind: "range",
    label: "Wrinkle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Phase = "resting" | "pressed" | "popping back";

/**
 * Coldbrook Swim Club: this summer's pass, printed on a puffed vinyl pillow
 * that gives under a thumb.
 */
export function PillowPrintDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("resting");
  const [presses, setPresses] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const pillow = (
    <PillowPrint
      label="Coldbrook Lido pass"
      className={chrome ? "h-60" : "h-[208px]"}
      onPress={() => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        setPhase("pressed");
        setPresses((n) => n + 1);
      }}
      onRelease={() => {
        setPhase("popping back");
        timer.current = window.setTimeout(() => setPhase("resting"), 900);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{pillow}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Coldbrook Swim Club
        </p>
        <p className="text-xs text-ink-3">Summer pass, puffed vinyl</p>
      </div>
      {pillow}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{phase}</span>
        {` · ${presses} ${presses === 1 ? "press" : "presses"}`}
      </p>
    </div>
  );
}
