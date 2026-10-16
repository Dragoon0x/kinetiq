"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPracticeLessons,
  PracticeRun,
  type PracticeProgress,
} from "@/registry/ui/practice-run";

export const tweaks = defineTweaks({
  coachStyle: {
    kind: "choice",
    label: "Coach",
    default: "bubble",
    options: ["bubble", "ticker", "margin"],
    names: { bubble: "Bubble", ticker: "Ticker", margin: "Margin" },
  },
  stampStyle: {
    kind: "choice",
    label: "Stamp",
    default: "seal",
    options: ["seal", "tick", "ink"],
    names: { seal: "Seal", tick: "Tick", ink: "Ink" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * A new Fieldline dispatcher's first five minutes: move a job, mention the
 * dock lead, label a job — each done for real in a copy that keeps nothing.
 */
export function PracticeRunDemo({
  chrome = true,
  // The run is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [progress, setProgress] = React.useState<PracticeProgress>({});
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);

  const run = (
    <PracticeRun
      key={round}
      progress={progress}
      onProgressChange={setProgress}
      onComplete={(l) => setNote(`done · ${l.title.toLowerCase()}`)}
      onSkip={(l) => setNote(`skipped · ${l.title.toLowerCase()}`)}
      onFinish={() => setNote("off to work")}
      onRestart={() => setNote(null)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{run}</div>;

  const total = defaultPracticeLessons.length;
  const done = Object.values(progress).filter((s) => s === "done").length;
  const skipped = Object.values(progress).filter((s) => s === "skipped").length;
  const current = defaultPracticeLessons.find((l) => !progress[l.id]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {run}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setProgress({});
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {done} of {total} done{skipped ? ` · ${skipped} skipped` : ""}
        </span>{" "}
        ·{" "}
        {note ??
          (current
            ? `lesson ${defaultPracticeLessons.indexOf(current) + 1} · ${current.title.toLowerCase()}`
            : "all practised")}
      </p>
    </div>
  );
}
