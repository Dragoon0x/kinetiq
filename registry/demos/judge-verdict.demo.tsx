"use client";

import * as React from "react";

import {
  JudgeVerdict,
  type JudgeVerdictLabel,
} from "@/registry/ui/judge-verdict";

/** Three seeded support cases: label, score, verdict, confidence, reasoning. */
const CASES: [string, number, JudgeVerdictLabel, number, string[]][] = [
  [
    "Case 1 · Late parcel",
    7.4,
    "pass",
    0.82,
    [
      "Names the seven-day rule and the thirty-day claim window correctly.",
      "Points the customer to the order page, which is where the claim lives.",
      "Overstates the settlement time by a day; minor.",
    ],
  ],
  [
    "Case 2 · Closed card",
    3.1,
    "fail",
    0.91,
    [
      "Says the refund returns to a closed card; policy holds it as credit.",
      "Never asks whether the card is still open, so the customer cannot tell.",
    ],
  ],
  [
    "Case 3 · Plan choice",
    5.6,
    "borderline",
    0.44,
    [
      "Recommends Fieldline, which the rate table supports at forty parcels.",
      "Skips the margin over the plan fee, so the advice cannot be checked.",
      "Could not settle whether growth should have been raised.",
    ],
  ],
];

/** How long the judge is seen to think before the seeded verdict lands. */
const JUDGING_MS = 1100;

export function JudgeVerdictDemo() {
  const [index, setIndex] = React.useState(0);
  const [judging, setJudging] = React.useState(false);
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    if (!judging) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => setJudging(false), JUDGING_MS);
    };
    // A hidden tab holds the judge where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [judging]);

  const [caseLabel, score, label, confidence, reasoning] = CASES[index] ??
    CASES[0] ?? ["", 0, "fail", 0, []];
  const verdict = { score, label, confidence, reasoning };
  const next = () => {
    setIndex((prev) => (prev + 1) % CASES.length);
    setOpen(true);
    setJudging(true);
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <JudgeVerdict
        judge="Gaugeworks Reasoner"
        caseLabel={caseLabel}
        judging={judging}
        verdict={judging ? null : verdict}
        reasoningOpen={open}
        onReasoningOpenChange={setOpen}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={next}
          disabled={judging}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Judge next case
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {judging ? "Judging " : `Case ${index + 1} · `}
        <span className="text-[var(--signal,var(--primary))]">
          {judging ? `case ${index + 1}` : `${score.toFixed(1)}/10 · ${label}`}
        </span>
        {judging
          ? ""
          : ` · confidence ${Math.round(confidence * 100)}%${open ? "" : " · reasoning folded"}`}
      </p>
    </div>
  );
}
