"use client";

import * as React from "react";

import {
  ForecastCard,
  type ForecastOption,
} from "@/registry/blocks/forecast-card/forecast-card";
import { PressureButton } from "@/registry/ui/pressure-button";

const OPTIONS: ForecastOption[] = [
  { id: "orrery-dial", label: "Orrery Dial", votes: 18 },
  { id: "bellows-panel", label: "Bellows Panel", votes: 11 },
  { id: "plumb-meter", label: "Plumb Meter", votes: 7 },
];

/** Evaluated once per load — the market closes a week out. */
const CLOSES_AT = new Date(Date.now() + 7 * 86_400_000);

export function ForecastCardDemo() {
  // Remounting with a fresh key is the documented reset for the
  // uncontrolled pattern: internal vote state re-seeds from OPTIONS.
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <ForecastCard
        key={run}
        question="Next specimen to build?"
        options={OPTIONS}
        allowRevote
        closesAt={CLOSES_AT}
      />
      <PressureButton
        variant="ghost"
        size="sm"
        onClick={() => setRun((count) => count + 1)}
      >
        Reset demo
      </PressureButton>
    </div>
  );
}
