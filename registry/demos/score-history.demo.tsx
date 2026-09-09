"use client";

import * as React from "react";

import { ScoreHistory, type ScoreVersion } from "@/registry/ui/score-history";

/** Fernworks Model 3 on the Support replies suite, release by release. */
const RELEASES: ScoreVersion[] = [
  { id: "1.0", label: "v1.0", score: 61, passed: 153, total: 250 },
  { id: "1.1", label: "v1.1", score: 66, passed: 165, total: 250 },
  { id: "1.2", label: "v1.2", score: 64, passed: 160, total: 250 },
  { id: "1.3", label: "v1.3", score: 71, passed: 178, total: 250 },
  { id: "1.4", label: "v1.4", score: 69, passed: 172, total: 250 },
  { id: "1.5", label: "v1.5", score: 78, passed: 195, total: 250 },
  { id: "1.6", label: "v1.6", score: 84, passed: 212, total: 250 },
  { id: "1.7", label: "v1.7", score: 86, passed: 215, total: 250 },
  { id: "1.8", label: "v1.8", score: 83, passed: 208, total: 250 },
  { id: "1.9", label: "v1.9", score: 88, passed: 220, total: 250 },
];
const SHOWN_AT_START = 7;

const BUTTON =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 disabled:hover:bg-transparent";

export function ScoreHistoryDemo() {
  const [shown, setShown] = React.useState(SHOWN_AT_START);
  const [reading, setReading] = React.useState<ScoreVersion | null>(null);

  const versions = RELEASES.slice(0, shown);
  const latest = versions[versions.length - 1];
  const spoken = reading ?? latest;
  const index = spoken ? versions.findIndex((v) => v.id === spoken.id) : -1;
  const before = index > 0 ? versions[index - 1] : undefined;
  const delta = spoken && before ? spoken.score - before.score : null;
  const deltaText =
    delta === null
      ? ""
      : delta > 0
        ? ` · +${delta}`
        : delta < 0
          ? ` · −${-delta}`
          : " · ±0";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <ScoreHistory
        label="Support replies"
        versions={versions}
        onReadChange={setReading}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={shown >= RELEASES.length}
          onClick={() => setShown((n) => Math.min(RELEASES.length, n + 1))}
          className={BUTTON}
        >
          Add release
        </button>
        <button
          type="button"
          disabled={shown === SHOWN_AT_START}
          onClick={() => setShown(SHOWN_AT_START)}
          className={BUTTON}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading ? "Reading" : "Latest"}{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {spoken ? `${spoken.label} · ${spoken.score}` : "—"}
        </span>
        {spoken ? ` · ${spoken.passed}/${spoken.total} cases${deltaText}` : ""}
      </p>
    </div>
  );
}
