"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  GuessLine,
  type GuessLineResult,
  type GuessLineSeries,
} from "@/registry/ui/guess-line";

export const tweaks = defineTweaks({
  smoothing: {
    kind: "range",
    label: "Smoothing",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  reveal: {
    kind: "range",
    label: "Reveal",
    default: 1200,
    min: 400,
    max: 2400,
    step: 200,
    unit: "ms",
  },
  score: { kind: "toggle", label: "Score", default: true },
  dataset: {
    kind: "choice",
    label: "Dataset",
    default: "riders",
    options: ["riders", "level", "rate"],
    names: { riders: "Riders", level: "Reservoir", rate: "Savings rate" },
  },
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const QUARTERS = ["23", "24", "25"].flatMap((y) =>
  ["Q1", "Q2", "Q3", "Q4"].map((q) => `${q} ’${y}`),
);

const series = (
  labels: string[],
  values: number[],
): GuessLineSeries["points"] =>
  labels.map((label, i) => ({ label, value: values[i] ?? 0 }));

/**
 * Three invented stories, each with a turn in its last four points: ferry
 * riders that fall away when the Coldbrook bridge reopens in September, a
 * reservoir that bottoms out and refills, and a savings rate that eases off.
 */
const SERIES: Record<string, GuessLineSeries> = {
  riders: {
    title: "Fieldline ferry riders",
    caption: "thousands a month",
    unit: "k",
    decimals: 0,
    hide: 4,
    points: series(MONTHS, [38, 41, 45, 47, 52, 58, 63, 66, 61, 49, 44, 42]),
  },
  level: {
    title: "Basinworks reservoir",
    caption: "% full, month end",
    unit: "%",
    decimals: 0,
    hide: 4,
    points: series(MONTHS, [71, 76, 84, 90, 93, 88, 79, 68, 61, 64, 72, 80]),
  },
  rate: {
    title: "Coldbrook savings rate",
    caption: "% a year, by quarter",
    unit: "%",
    decimals: 2,
    step: 0.05,
    hide: 4,
    points: series(
      QUARTERS,
      [1.2, 1.5, 1.9, 2.4, 2.9, 3.25, 3.4, 3.45, 3.35, 3.1, 2.85, 2.7],
    ),
  },
};

/**
 * Guess the rest of the year: draw across the shaded months, let go, and the
 * real line draws in with the gap shaded and a score.
 */
export function GuessLineDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const key = values.dataset ?? "riders";
  const chart = SERIES[key] ?? SERIES.riders;
  const [guessed, setGuessed] = React.useState(0);
  const [result, setResult] = React.useState<GuessLineResult | null>(null);
  const [shownKey, setShownKey] = React.useState(key);

  // A new dataset is a new question.
  if (shownKey !== key) {
    setShownKey(key);
    setGuessed(0);
    setResult(null);
  }

  const points = chart?.points ?? [];
  const hidden = chart?.hide ?? 4;
  const from = points[points.length - hidden]?.label ?? "";
  const to = points[points.length - 1]?.label ?? "";
  const unit = chart?.unit ?? "";
  const decimals = chart?.decimals ?? 0;
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <GuessLine
        series={SERIES}
        onValueChange={(guess) => {
          setGuessed(guess.filter((v) => v !== null).length);
          setResult(null);
        }}
        onReveal={setResult}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {result ? (
            <>
              <span className="text-signal">
                {values.score === false ? "revealed" : `${result.score}% close`}
              </span>{" "}
              · {to} was {fmt(result.truth[result.truth.length - 1] ?? 0)}, you
              said {fmt(result.guess[result.guess.length - 1] ?? 0)}
            </>
          ) : guessed === 0 ? (
            <>
              <span className="text-signal">{key}</span> · draw {from} to {to}
            </>
          ) : (
            <>
              <span className="text-signal">
                {guessed} of {hidden} guessed
              </span>{" "}
              · {guessed === hidden ? "ready to reveal" : "keep drawing"}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
