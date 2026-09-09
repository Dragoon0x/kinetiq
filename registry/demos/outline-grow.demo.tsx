"use client";

import * as React from "react";

import { OutlineGrow, type OutlineSection } from "@/registry/ui/outline-grow";

/** Fernworks Model 3 drafting Coldbrook Bank's quarterly note: id, heading, paragraph. */
const DRAFT: [string, string, string][] = [
  [
    "summary",
    "Summary",
    "The quarter closed ahead of plan on deposits. Lending held level and costs stayed flat. No new provisions were needed.",
  ],
  [
    "deposits",
    "Deposits",
    "Savings grew for the third quarter running. Most of it came from Waylight Pay sweep accounts. Term deposits rolled over without churn.",
  ],
  [
    "lending",
    "Lending",
    "Drawdowns matched repayments almost exactly. Arrears stayed under one percent of the book. The Fieldline equipment line was extended.",
  ],
  [
    "outlook",
    "Outlook",
    "The board expects a quieter quarter ahead. Rate moves are the main open question. Guidance is unchanged.",
  ],
];

/** Split after each full stop so every sentence lands on its own. */
const SECTIONS: OutlineSection[] = DRAFT.map(([id, heading, text]) => ({
  id,
  heading,
  sentences: text.split(/(?<=\.) /),
}));

/** Where each section's sentences end in the stream. */
const ENDS = SECTIONS.map((_, index) =>
  SECTIONS.slice(0, index + 1).reduce((n, s) => n + s.sentences.length, 0),
);
const TOTAL = ENDS[ENDS.length - 1] ?? 0;

/** The outline holds for a beat, then sentences land on a seeded jitter. */
const OUTLINE_HOLD_MS = 800;
const DELAYS = [320, 240, 420, 280, 360, 260, 400, 300, 340, 220, 380, 260];

const button =
  "flex h-8 items-center self-start rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function OutlineGrowDemo() {
  const [arrived, setArrived] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [landed, setLanded] = React.useState(false);

  // A hidden tab holds the draft where it is; prose should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!generating || !visible) return;
    const timer = window.setTimeout(
      () => {
        const next = arrived + 1;
        setArrived(next);
        if (next >= TOTAL) setGenerating(false);
      },
      arrived === 0
        ? OUTLINE_HOLD_MS
        : (DELAYS[arrived % DELAYS.length] ?? 300),
    );
    return () => window.clearTimeout(timer);
  }, [generating, visible, arrived]);

  const draft = () => {
    setArrived(0);
    setLanded(false);
    setGenerating(true);
  };

  const sectionAt = ENDS.findIndex((end) => arrived < end) + 1;
  const line = generating
    ? arrived === 0
      ? ["Outline", `${SECTIONS.length} sections`, ""]
      : ["Writing", `section ${sectionAt} of ${SECTIONS.length}`, ""]
    : arrived >= TOTAL
      ? [
          landed ? "Complete" : "Landing",
          `${SECTIONS.length} sections`,
          `· ${TOTAL} sentences`,
        ]
      : ["Idle · press draft", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OutlineGrow
        title="Coldbrook Bank quarterly note"
        model="Fernworks Model 3"
        sections={SECTIONS}
        arrived={arrived}
        generating={generating}
        onComplete={() => setLanded(true)}
      />

      <button
        type="button"
        onClick={draft}
        disabled={generating}
        className={button}
      >
        {arrived > 0 ? "Redraft" : "Draft"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
