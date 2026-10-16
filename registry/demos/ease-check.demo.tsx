"use client";

import * as React from "react";

import { Download, FileSpreadsheet, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { EaseCheck } from "@/registry/ui/ease-check";

export const tweaks = defineTweaks({
  trackStyle: {
    kind: "choice",
    label: "Track",
    default: "string",
    options: ["string", "cord", "beads"],
    names: { string: "String", cord: "Cord", beads: "Beads" },
  },
  stepCount: {
    kind: "range",
    label: "Steps",
    default: 7,
    min: 3,
    max: 10,
    step: 1,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "accent",
    options: ["accent", "score", "ink"],
    names: { accent: "Accent", score: "Score", ink: "Ink" },
  },
});

/**
 * Waylight has just finished exporting the Q3 usage report. The question
 * asks once per export; "Export again" starts a new one, so it can be asked
 * again.
 */
export function EaseCheckDemo({
  chrome = true,
  // The question is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // Each copy of the demo (the gallery card, the stage, the docs plate) asks
  // about its own exports: a task answered in one must not vanish from another.
  const scope = React.useId();
  const [run, setRun] = React.useState(1);
  const [line, setLine] = React.useState("asked · q3 usage export");
  const [done, setDone] = React.useState(false);
  const steps = values.stepCount ?? 7;

  const again = () => {
    setRun((r) => r + 1);
    setDone(false);
    setLine("asked · new export");
  };

  const surface = (
    <div className="flex w-full max-w-xl flex-col gap-2 self-center">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card px-3 py-2">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-2 text-success"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--success) 14%, transparent)",
          }}
        >
          <FileSpreadsheet className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            Export ready
          </p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            q3-usage{run > 1 ? `-${run}` : ""}.csv · 2.4 MB
          </p>
        </div>
        {done ? (
          <button
            type="button"
            onClick={again}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Export again
          </button>
        ) : (
          <button
            type="button"
            aria-label="Download q3-usage.csv"
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <Download aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <EaseCheck
        taskId={`waylight-export-q3-${scope}-${run}`}
        onAnswer={(score) => {
          const low = score <= Math.floor((steps - 1) / 2);
          setLine(`answered ${score} of ${steps}${low ? " · why open" : ""}`);
          if (!low) setDone(true);
        }}
        onComment={() => {
          setLine("comment sent");
          setDone(true);
        }}
        onDismiss={() => {
          setLine("dismissed · will not ask again for this export");
          setDone(true);
        }}
        {...values}
      />
    </div>
  );

  if (!chrome) return surface;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {surface}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
