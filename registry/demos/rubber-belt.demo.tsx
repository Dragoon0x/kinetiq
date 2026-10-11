"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultBeltItems,
  RubberBelt,
  type RubberBeltState,
} from "@/registry/ui/rubber-belt";

export const tweaks = defineTweaks({
  elasticity: {
    kind: "range",
    label: "Elasticity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 16,
    min: 0,
    max: 40,
    step: 4,
    unit: "px",
  },
  direction: {
    kind: "choice",
    label: "Drift",
    default: "left",
    options: ["left", "right", "still"],
    names: { left: "Left", right: "Right", still: "Still" },
  },
});

/**
 * Fieldline's autumn field notes: a strip of the season's pictures on a
 * rubber belt, drifting until someone reaches for one.
 */
export function RubberBeltDemo({
  chrome = true,
  // The belt is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [state, setState] = React.useState<RubberBeltState>("resting");
  const [picked, setPicked] = React.useState<number | null>(null);
  const items = defaultBeltItems;
  const caption = items[index]?.caption ?? "";
  const direction = values.direction ?? tweaks.direction.default;

  const belt = (
    <RubberBelt
      items={items}
      value={index}
      onValueChange={(i) => {
        setIndex(i);
        setPicked(null);
      }}
      onSelect={setPicked}
      onMotionChange={setState}
      label="Field notes, autumn"
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{belt}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · field notes
        </p>
        <p className="text-sm font-medium text-foreground">
          Autumn, eight places
        </p>
      </div>
      {belt}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "held" ? (
          <>
            <span className="text-signal">in hand</span> · the belt stretches
          </>
        ) : state === "pulling" ? (
          <>
            <span className="text-signal">pulling in</span> · one elastic
            overshoot
          </>
        ) : state === "drifting" ? (
          <>
            <span className="text-signal">drifting {direction}</span> · hover to
            hold
          </>
        ) : picked !== null ? (
          <>
            <span className="text-signal">opened</span> · {caption}
          </>
        ) : (
          <>
            <span className="text-signal">{caption}</span> · {index + 1} of{" "}
            {items.length}
          </>
        )}
      </p>
    </div>
  );
}
