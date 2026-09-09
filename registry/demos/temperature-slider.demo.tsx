"use client";

import * as React from "react";

import {
  TemperatureSlider,
  type TemperatureSample,
} from "@/registry/ui/temperature-slider";

/** One release note, each slot ordered from the steadiest word to the wildest. */
const SAMPLE: string[][] = [
  ["The"],
  ["update", "release", "drop"],
  ["fixes", "repairs", "banishes"],
  ["the sync"],
  ["issue", "hiccup", "gremlin"],
  ["for"],
  ["crews", "teams", "everyone"],
  ["on Waylight"],
  ["today.", "this week.", "at last."],
];

/** Slots with more than one word — the ones that can swap. */
const SLOTS = SAMPLE.filter((slot) => slot.length > 1).length;

const zoneOf = (t: number) =>
  t < 1 / 3 ? "steady" : t < 2 / 3 ? "varied" : "wild";

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TemperatureSliderDemo() {
  const [temperature, setTemperature] = React.useState(0.7);
  const [swapped, setSwapped] = React.useState(0);

  const onSample = (sample: TemperatureSample) => setSwapped(sample.swapped);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TemperatureSlider
        label="Waylight release notes · temperature"
        sample={SAMPLE}
        value={temperature}
        onValueChange={setTemperature}
        onSampleChange={onSample}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setTemperature(0.2);
            setSwapped(0);
          }}
        >
          Steady
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setTemperature(1.6);
            setSwapped(SLOTS);
          }}
        >
          Wild
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {`Temp ${temperature.toFixed(1)} · ${zoneOf(temperature / 2)} · ${swapped} of ${SLOTS} words swapped`}
      </p>
    </div>
  );
}
