"use client";

import * as React from "react";

import { CodeScaffold } from "@/registry/ui/code-scaffold";

/** A Fieldline deploy plan in the house plan language, one line per entry. */
const LINES = [
  'plan "fieldline-deploy"',
  "  step build",
  '    run "assemble" from "main"',
  "    check size < 400",
  "  step stage",
  '    emit "staging" into "fieldline"',
  "    wait 30",
  '    when health == "ok" then done',
  "    else retry 2",
  "  step ship",
  '    emit "release" into "fieldline"',
  "    done -- ship it",
];

/** The scaffold holds for a beat, then lines land on a seeded jitter. */
const SCAFFOLD_HOLD_MS = 700;
const DELAYS = [120, 90, 160, 110, 140, 100, 180, 130, 90, 150, 120, 100];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CodeScaffoldDemo() {
  const [arrived, setArrived] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // A hidden tab holds the writing where it is; code should not finish unseen.
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
        if (next >= LINES.length) setGenerating(false);
      },
      arrived === 0
        ? SCAFFOLD_HOLD_MS
        : (DELAYS[arrived % DELAYS.length] ?? 120),
    );
    return () => window.clearTimeout(timer);
  }, [generating, visible, arrived]);

  const write = () => {
    setArrived(0);
    setCopied(false);
    setGenerating(true);
  };

  const line = generating
    ? arrived === 0
      ? ["Scaffold", `${LINES.length} bars`, ""]
      : ["Writing", `line ${arrived} of ${LINES.length}`, ""]
    : arrived >= LINES.length
      ? ["Complete", `${LINES.length} lines`, copied ? "· copied" : ""]
      : ["Idle · press write", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CodeScaffold
        label="Deploy plan from Gaugeworks Reasoner"
        filename="deploy.plan"
        lines={LINES}
        arrived={arrived}
        generating={generating}
        onCopy={() => setCopied(true)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={write}
          disabled={generating}
          className={button}
        >
          {arrived > 0 ? "Rewrite" : "Write"}
        </button>
      </div>

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
