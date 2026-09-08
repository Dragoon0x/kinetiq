"use client";

import * as React from "react";

import {
  AllocationSlider,
  type AllocationSlice,
} from "@/registry/ui/allocation-slider";

const SLICES: AllocationSlice[] = [
  { id: "bsn", label: "Basin BSN" },
  { id: "frn", label: "Fernwork FRN" },
  { id: "cbk", label: "Coldbrook CBK" },
  { id: "gge", label: "Gauge GGE" },
];

const SEED = [40, 25, 20, 15];
const TOTAL = 48200;

export function AllocationSliderDemo() {
  const [mix, setMix] = React.useState(SEED);

  const settled = mix.every((weight, index) => weight === SEED[index]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AllocationSlider
        label="Waylight Growth · target mix"
        slices={SLICES}
        value={mix}
        onValueChange={setMix}
        total={TOTAL}
      />

      <button
        type="button"
        disabled={settled}
        onClick={() => setMix(SEED)}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset mix
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">
          {SLICES.map(
            (slice, index) => `${slice.label.split(" ")[1]} ${mix[index] ?? 0}`,
          ).join(" · ")}
        </span>{" "}
        — Sum {mix.reduce((sum, weight) => sum + weight, 0)}
      </p>
    </div>
  );
}
