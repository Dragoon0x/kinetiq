"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  DropPin,
  dropPinPlace,
  type DropPinPoint,
} from "@/registry/ui/drop-pin";

export const tweaks = defineTweaks({
  delay: {
    kind: "range",
    label: "Delay",
    default: 450,
    min: 200,
    max: 1000,
    step: 50,
    unit: "ms",
  },
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colour: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "red", "green", "amber"],
    names: { cobalt: "Cobalt", red: "Red", green: "Green", amber: "Amber" },
  },
  map: {
    kind: "choice",
    label: "Map",
    default: "paper",
    options: ["paper", "night"],
    names: { paper: "Paper", night: "Night" },
  },
});

/**
 * A Fernworks courier asking where to leave a parcel: hold anywhere on the
 * town map and a pin drops there with its grid reference; drag it to adjust.
 */
export function DropPinDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pin, setPin] = React.useState<DropPinPoint | null>(null);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <DropPin
        label="Drop-off point for Fernworks order FW-4410"
        value={pin}
        onValueChange={setPin}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {pin ? (
              <>
                <span className="text-signal">drop-off set</span> ·{" "}
                {dropPinPlace(pin).text}
              </>
            ) : (
              <>
                <span className="text-signal">no pin</span> · hold anywhere on
                the map
              </>
            )}
          </p>
          <button
            type="button"
            disabled={!pin}
            onClick={() => setPin(null)}
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-2 border border-hairline-strong px-2.5 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
