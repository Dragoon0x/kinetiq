"use client";

import * as React from "react";

import { SampleWheel, type WheelSample } from "@/registry/ui/sample-wheel";

/** A Basinworks Scout smoke run: id, title, overall, then accuracy, tone, brevity. */
const ROWS: [string, string, number, number, number, number][] = [
  ["S-01", "Late parcel refund", 88, 91, 86, 87],
  ["S-02", "Two-stop merge", 81, 84, 79, 80],
  ["S-03", "Depot handover", 90, 93, 88, 89],
  ["S-04", "Wrong postcode", 42, 38, 51, 37],
  ["S-05", "Return leg", 77, 80, 74, 77],
  ["S-06", "Fuel stop", 85, 88, 83, 84],
  ["S-07", "Night window", 46, 44, 52, 42],
  ["S-08", "Cold chain", 92, 95, 90, 91],
  ["S-09", "Bridge closure", 79, 82, 77, 78],
  ["S-10", "Split load", 83, 86, 81, 82],
  ["S-11", "Signature miss", 39, 35, 47, 35],
  ["S-12", "Weight check", 87, 90, 85, 86],
];

const SAMPLES: WheelSample[] = ROWS.map(
  ([id, title, score, accuracy, tone, brevity]) => ({
    id,
    label: id,
    title,
    score,
    passed: score >= 60,
    scores: [
      { name: "Accuracy", value: accuracy },
      { name: "Tone", value: tone },
      { name: "Brevity", value: brevity },
    ],
  }),
);
const FAILED = SAMPLES.filter((sample) => !sample.passed).length;

export function SampleWheelDemo() {
  const [value, setValue] = React.useState("S-01");
  const front = SAMPLES.find((sample) => sample.id === value);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Scout · smoke run
        </span>
        <SampleWheel
          label="Smoke run samples"
          samples={SAMPLES}
          value={value}
          onValueChange={setValue}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Sample{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {front ? `${front.label} · ${front.score}` : "—"}
        </span>
        {front ? ` · ${front.passed ? "pass" : "fail"}` : ""} · {FAILED} of{" "}
        {SAMPLES.length} failed
      </p>
    </div>
  );
}
