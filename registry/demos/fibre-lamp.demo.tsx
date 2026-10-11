"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FibreLamp } from "@/registry/ui/fibre-lamp";

export const tweaks = defineTweaks({
  strandCount: {
    kind: "range",
    label: "Strands",
    default: 96,
    min: 40,
    max: 160,
    step: 8,
  },
  sway: {
    kind: "range",
    label: "Sway",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hueSpeed: {
    kind: "range",
    label: "Hue speed",
    default: 0.1,
    min: 0,
    max: 0.5,
    step: 0.05,
  },
});

const NAMES = ["Rose", "Amber", "Lime", "Teal", "Cobalt", "Violet"] as const;

/**
 * Fernworks Lighting: the Strand lamp on its product page, lit, with the
 * wheel turning slowly until the visitor picks a colour.
 */
export function FibreLampDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const [climbing, setClimbing] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  const turning = (values.hueSpeed ?? 0.1) > 0;

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onAdvance = (index: number) => {
    setPicked(index);
    setClimbing(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    // The lamp's colour takes its `travel` to reach the longest tips.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setClimbing(false);
    }, 1100);
  };

  const scene = (
    <div className="flex w-full items-center gap-2">
      <div className="flex w-24 shrink-0 flex-col gap-1 pl-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks
        </span>
        <span className="text-sm leading-snug font-medium text-foreground">
          Strand lamp
        </span>
        <span className="text-xs leading-snug text-ink-3">
          Six colours, one wheel
        </span>
      </div>
      <FibreLamp
        names={NAMES}
        className={chrome ? "h-56 min-w-0 flex-1" : "h-52 min-w-0 flex-1"}
        sound={sound}
        onAdvance={onAdvance}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{scene}</div>;

  const name = picked === null ? null : (NAMES[picked] ?? null);

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {name ? (
          <>
            <span className="text-signal">{name}</span>
            {climbing ? " · climbing the fibres" : " · at the tips"}
          </>
        ) : (
          <>
            <span className="text-signal">
              {turning ? "turning" : "holding"}
            </span>{" "}
            · press to change colour
          </>
        )}
      </p>
    </div>
  );
}
