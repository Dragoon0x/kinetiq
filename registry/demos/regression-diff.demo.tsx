"use client";

import * as React from "react";

import { RegressionDiff } from "@/registry/ui/regression-diff";

const TESTS = [
  { id: "refund", name: "Refund window", before: 92, after: 78 },
  { id: "plan", name: "Plan advice", before: 71, after: 84 },
  { id: "label", name: "Label reprint", before: 88, after: 88 },
  { id: "customs", name: "Customs codes", before: 64, after: 61 },
  { id: "hours", name: "Depot hours", before: 97, after: 98 },
  { id: "damage", name: "Damage claims", before: 83, after: 66 },
  { id: "pickup", name: "Pickup booking", before: 76, after: 81 },
  { id: "tone", name: "Tone check", before: 90, after: 90 },
];

/** Cumulative landing times in ms from a seeded step so every run replays alike. */
const ARRIVE = TESTS.map((_, index) => {
  let clock = 220;
  for (let step = 0; step <= index; step += 1) {
    clock += 260 + ((step * 7919) % 5) * 70;
  }
  return clock;
});
const END = ARRIVE[ARRIVE.length - 1] ?? 0;
const TICK = 40;

export function RegressionDiffDemo() {
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [settled, setSettled] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = clock + TICK;
        setClock(next);
        if (next >= END) setPlaying(false);
      }, TICK);
    };
    // A hidden tab holds the run where it is and resumes on return.
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
  }, [playing, clock]);

  const tests = TESTS.map((test, index) => ({
    id: test.id,
    name: test.name,
    before: test.before,
    after: (ARRIVE[index] ?? 0) <= clock ? test.after : undefined,
  }));
  const scored = tests.filter((test) => test.after !== undefined).length;

  const start = () => {
    setSettled(null);
    setClock(0);
    setPlaying(true);
  };

  const line =
    settled !== null
      ? [
          `${settled} ${settled === 1 ? "regression" : "regressions"}`,
          "moved up",
        ]
      : scored === TESTS.length
        ? ["Settling", ""]
        : playing
          ? ["Scoring ·", `${scored} of ${TESTS.length}`]
          : ["Press run ·", `${TESTS.length} tests`];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <RegressionDiff
        label="Fernworks Model 3 · run 41 against run 40"
        tests={tests}
        threshold={2}
        onSettle={setSettled}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {clock > 0 ? "Run again" : "Run"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>
      </p>
    </div>
  );
}
