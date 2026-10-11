"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultWrapWallItems, WrapWall } from "@/registry/ui/wrap-wall";

export const tweaks = defineTweaks({
  columns: {
    kind: "range",
    label: "Columns",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  skew: {
    kind: "range",
    label: "Skew",
    default: 5,
    min: 0,
    max: 12,
    step: 1,
    unit: "°",
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * The Coldbrook Archive's summer wall: sixteen photographs from the season,
 * repeated in every direction so the wall never runs out.
 */
export function WrapWallDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const [centre, setCentre] = React.useState<number | null>(null);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <WrapWall
          label="The summer wall"
          value={open}
          onValueChange={setOpen}
          height={520}
          {...values}
        />
      </div>
    );
  }

  const name = (i: number | null) => {
    const item = i === null ? undefined : defaultWrapWallItems[i];
    return item?.caption ?? item?.alt ?? "";
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Archive
        </p>
        <p className="text-base font-medium text-foreground">The summer wall</p>
      </div>
      <WrapWall
        label="The summer wall"
        value={open}
        onValueChange={setOpen}
        onCentreChange={setCentre}
        height={420}
        className="border border-hairline"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open !== null ? (
          <>
            <span className="text-signal">open</span> · {name(open)} · esc
            closes
          </>
        ) : centre !== null ? (
          <>
            <span className="text-signal">centre</span> · {name(centre)} · enter
            opens it
          </>
        ) : (
          <>
            <span className="text-signal">16 pictures</span> · drag, throw or
            use the arrows
          </>
        )}
      </p>
    </div>
  );
}
