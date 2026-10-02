"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSizes,
  defaultSwatches,
  SwatchCard,
} from "@/registry/ui/swatch-card";

export const tweaks = defineTweaks({
  wipe: {
    kind: "range",
    label: "Wipe",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shade: {
    kind: "range",
    label: "Shade",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stepper: { kind: "toggle", label: "Stepper", default: true },
});

const pounds = (n: number) => `£${n}`;

/**
 * Fernworks' Harbour tote: every colour re-dyes the bag, some cost more, and
 * not every colour comes in every size.
 */
export function SwatchCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [colour, setColour] = React.useState("moss");
  const [size, setSize] = React.useState("daily");
  const [qty, setQty] = React.useState(0);
  const swatch = defaultSwatches.find((s) => s.id === colour);
  const fit = defaultSizes.find((z) => z.id === size);
  const each = (swatch?.price ?? 0) + (fit?.price ?? 0);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <SwatchCard
        className="self-center"
        value={colour}
        onValueChange={setColour}
        selectedSize={size}
        onSelectedSizeChange={setSize}
        quantity={qty}
        onQuantityChange={setQty}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {swatch?.label} · {fit?.label}
          </span>{" "}
          · {pounds(each)} ·{" "}
          {qty === 0 ? "not in bag" : `${qty} in bag · ${pounds(each * qty)}`}
        </p>
      ) : null}
    </div>
  );
}
