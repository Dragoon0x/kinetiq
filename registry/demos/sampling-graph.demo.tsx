"use client";

import * as React from "react";

import {
  SamplingGraph,
  sampleDistribution,
  type SamplingCandidate,
  type SamplingPick,
} from "@/registry/ui/sampling-graph";

/** Gaugeworks Reasoner, mid-sentence: "The tide came in and the boats …" */
const CANDIDATES: SamplingCandidate[] = [
  { token: "rose", logit: 2.4 },
  { token: "lifted", logit: 2.1 },
  { token: "the", logit: 1.9, seen: true },
  { token: "began", logit: 1.7 },
  { token: "were", logit: 1.4 },
  { token: "drifted", logit: 1.2 },
  { token: "boats", logit: 1.0, seen: true },
  { token: "bobbed", logit: 0.6 },
];

const START = { temperature: 1, penalty: 1, topP: 0.9, seed: 1 };
type Param = keyof typeof START;

const RANGES: {
  key: Param;
  name: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "temperature", name: "Temp", min: 0.2, max: 2, step: 0.1 },
  { key: "penalty", name: "Penalty", min: 1, max: 2, step: 0.1 },
  { key: "topP", name: "Top-p", min: 0.5, max: 1, step: 0.05 },
];

export function SamplingGraphDemo() {
  const id = React.useId();
  const [params, setParams] = React.useState(START);
  // The status opens on the same pick the chart shows, before any settle.
  const [pick, setPick] = React.useState<SamplingPick | null>(
    () =>
      sampleDistribution(CANDIDATES, START).find((row) => row.picked) ?? null,
  );

  const set = (key: Param, value: number) =>
    setParams((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SamplingGraph
        label="Gaugeworks Reasoner · next token"
        candidates={CANDIDATES}
        temperature={params.temperature}
        penalty={params.penalty}
        topP={params.topP}
        seed={params.seed}
        onSettle={setPick}
      />

      <div className="flex flex-col gap-1">
        {RANGES.map((range) => (
          <label
            key={range.key}
            htmlFor={`${id}-${range.key}`}
            className="flex h-8 items-center gap-2 text-xs"
          >
            <span className="w-14 shrink-0 text-ink-2">{range.name}</span>
            <input
              id={`${id}-${range.key}`}
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={params[range.key]}
              onChange={(event) => set(range.key, Number(event.target.value))}
              className="h-1 min-w-0 flex-1 accent-cobalt-bright"
            />
            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
              {params[range.key].toFixed(range.step < 0.1 ? 2 : 1)}
            </span>
          </label>
        ))}
        <button
          type="button"
          onClick={() => set("seed", params.seed + 1)}
          className="mt-1 flex h-8 items-center self-start rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Draw again
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pick ? (
          <>
            Picked <span className="text-signal">&quot;{pick.token}&quot;</span>
            {` · ${Math.round(pick.probability * 100)}%`}
          </>
        ) : (
          "Sampling"
        )}
        {` · T ${params.temperature.toFixed(1)} · P ${params.topP.toFixed(2)} · Pen ${params.penalty.toFixed(1)} · Draw ${params.seed}`}
      </p>
    </div>
  );
}
