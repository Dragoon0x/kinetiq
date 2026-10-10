"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TickSpring } from "@/registry/ui/tick-spring";

export const tweaks = defineTweaks({
  stroke: {
    kind: "range",
    label: "Stroke",
    default: 2.25,
    min: 1.5,
    max: 3.5,
    step: 0.25,
    unit: "px",
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 520,
    min: 200,
    max: 1000,
    step: 50,
  },
  strike: { kind: "toggle", label: "Strike", default: false },
});

const KIT = [
  { id: "map", label: "Map and compass" },
  { id: "filter", label: "Water filter" },
  { id: "shell", label: "Rain shell" },
] as const;

/**
 * A Fieldline trail-kit list: the parent box ticks the whole kit, and shows a
 * dash while only some of it is packed.
 */
export function TickSpringDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [packed, setPacked] = React.useState<Record<string, boolean>>({
    map: true,
    filter: false,
    shell: false,
  });
  const done = KIT.filter((item) => packed[item.id]).length;
  const all = done === KIT.length ? true : done === 0 ? false : "indeterminate";

  const list = (
    <fieldset className="m-0 flex w-full max-w-64 min-w-0 flex-col gap-2.5 self-center border-0 p-0">
      <legend className="sr-only">Fieldline trail kit</legend>
      <TickSpring
        label={<span className="font-medium">Pack for the ridge walk</span>}
        checked={all}
        onCheckedChange={(next) =>
          setPacked({ map: next, filter: next, shell: next })
        }
        sound={sound}
        {...values}
      />
      <div className="ml-2.5 flex flex-col gap-2 border-l border-hairline-strong pl-5">
        {KIT.map((item) => (
          <TickSpring
            key={item.id}
            label={item.label}
            checked={packed[item.id] ?? false}
            onCheckedChange={(next) =>
              setPacked((prev) => ({ ...prev, [item.id]: next }))
            }
            sound={sound}
            {...values}
          />
        ))}
      </div>
    </fieldset>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{list}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {list}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {done === KIT.length
          ? "all packed · ready for the ridge"
          : `${done} of ${KIT.length} packed · space ticks the focused box`}
      </p>
    </div>
  );
}
