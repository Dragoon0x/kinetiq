"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { IronSand } from "@/registry/ui/iron-sand";

export const tweaks = defineTweaks({
  grains: {
    kind: "range",
    label: "Grains",
    default: 3500,
    min: 1000,
    max: 6000,
    step: 500,
  },
  strength: {
    kind: "range",
    label: "Strength",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "graphite",
    options: ["graphite", "rust", "cobalt"],
    names: { graphite: "Graphite", rust: "Rust", cobalt: "Cobalt" },
  },
  poles: {
    kind: "range",
    label: "Poles",
    default: 2,
    min: 0,
    max: 4,
    step: 1,
  },
});

const POLES = [
  "no poles",
  "one pole",
  "two poles",
  "three poles",
  "four poles",
];

/**
 * Fieldline Magnetics, a teaching kit: the page is the sheet of sand over the
 * kit's magnets, and the visitor's pointer is one more.
 */
export function IronSandDemo({
  chrome = true,
  // The sand is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [carrying, setCarrying] = React.useState(false);
  const grains = values.grains ?? 3500;
  const poles = Math.round(values.poles ?? 2);
  const color = values.color ?? "graphite";

  const plate = (
    <IronSand
      onActiveChange={setCarrying}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Magnetics
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            See the field you cannot feel
          </p>
          {chrome ? (
            <button
              type="button"
              className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Explore the kit
            </button>
          ) : null}
        </div>
      </div>
    </IronSand>
  );

  if (!chrome) return <div className="flex w-full">{plate}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {plate}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {carrying ? (
          <>
            <span className="text-signal">carrying a pole</span> · the sand
            follows
          </>
        ) : (
          <>
            <span className="text-signal">{POLES[poles] ?? "two poles"}</span> ·{" "}
            {grains.toLocaleString("en-US")} grains · {color}
          </>
        )}
      </p>
    </div>
  );
}
