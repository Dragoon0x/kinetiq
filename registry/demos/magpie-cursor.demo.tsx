"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { MagpieCursor } from "@/registry/ui/magpie-cursor";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 22,
    min: 0,
    max: 60,
    step: 2,
    unit: "px",
  },
  lag: {
    kind: "range",
    label: "Lag",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  maxTags: {
    kind: "range",
    label: "Max tags",
    default: 5,
    min: 1,
    max: 8,
    step: 1,
  },
});

const PLANTS = [
  "Maidenhair",
  "Staghorn",
  "Bird's nest",
  "Hart's tongue",
  "Sword fern",
  "Moss pole",
];

const chip =
  "inline-flex h-8 items-center rounded-full border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:border-cobalt-bright/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks' nursery: point at the plants you like and their names trail
 * your cursor; click to lay them down and compare.
 */
export function MagpieCursorDemo({
  chrome = true,
  // The magpie is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stack, setStack] = React.useState<string[]>([]);
  const [dropped, setDropped] = React.useState<string[] | null>(null);

  const board = (
    <MagpieCursor
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-60" : "h-52",
      )}
      value={stack}
      onValueChange={(next) => {
        setStack(next);
        if (next.length > 0) setDropped(null);
      }}
      onDrop={setDropped}
      {...values}
    >
      <div className="flex size-full flex-col justify-between gap-3 p-4 sm:p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks · Nursery
        </p>
        <div className="flex flex-col gap-3">
          <p className="text-lg leading-tight font-semibold tracking-[-0.01em] text-foreground">
            Point at what you like.
          </p>
          <div className="flex max-w-md flex-wrap gap-2">
            {PLANTS.map((plant) => (
              <button
                key={plant}
                type="button"
                data-magpie={plant}
                className={chip}
              >
                {plant}
              </button>
            ))}
          </div>
        </div>
      </div>
    </MagpieCursor>
  );

  if (!chrome) return <div className="flex w-full">{board}</div>;

  const list = stack.map((s) => s.toLowerCase());
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stack.length > 0 ? (
          <>
            <span className="text-signal">{stack.length} collected</span> ·{" "}
            {list.slice(0, 2).join(", ")}
            {list.length > 2 ? ` and ${list.length - 2} more` : ""}
          </>
        ) : dropped ? (
          <>
            <span className="text-signal">dropped {dropped.length}</span> ·
            gathering up
          </>
        ) : (
          <>
            <span className="text-signal">stack empty</span> · point at a plant,
            click to drop
          </>
        )}
      </p>
    </div>
  );
}
