"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultTeaserSummary, TeaserLens } from "@/registry/ui/teaser-lens";

export const tweaks = defineTweaks({
  lensSize: {
    kind: "range",
    label: "Lens",
    default: 136,
    min: 96,
    max: 184,
    step: 8,
    unit: "px",
  },
  blurAmount: {
    kind: "range",
    label: "Blur",
    default: 6,
    min: 2,
    max: 12,
    step: 1,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

type Note = { lead: string; rest: string };

const START: Note = { lead: "pro report", rest: "drag the lens over an area" };

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const AREA: Record<string, string> = {
  pulse: "team pulse",
  trend: "throughput trend",
  cohorts: "retention by start week",
  stages: "where work waits",
};

/**
 * Fieldline's September delivery report, a Pro feature: the workspace's own
 * numbers drawn and blurred, with a lens to read one area before upgrading.
 */
export function TeaserLensDemo({
  chrome = true,
  // The report is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [sample, setSample] = React.useState(false);
  const [note, setNote] = React.useState<Note>(START);

  if (!chrome) {
    return (
      <div className="w-full">
        <TeaserLens className="h-[548px]" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <TeaserLens
        key={round}
        summary={sample ? null : defaultTeaserSummary}
        className="h-[500px]"
        onRegionChange={(region) =>
          setNote({
            lead: `lens on ${region.id}`,
            rest: AREA[region.id] ?? region.title,
          })
        }
        onUpgrade={(region) =>
          setNote({ lead: "upgrade", rest: AREA[region.id] ?? region.title })
        }
        onDismissedChange={(gone) =>
          setNote(
            gone
              ? { lead: "lens put away", rest: "report stays blurred" }
              : { lead: "lens back", rest: "drag it over an area" },
          )
        }
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={sample}
          onClick={() => {
            setSample((v) => !v);
            setNote(
              sample
                ? { lead: "your numbers", rest: "fieldline · september" }
                : { lead: "no data yet", rest: "labelled sample report" },
            );
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors hover:bg-surface-2 hover:text-foreground",
            sample ? "bg-surface-2 text-foreground" : "text-ink-2",
            FOCUS_RING,
          )}
        >
          No data yet
        </button>
        <button
          type="button"
          onClick={() => {
            setNote(START);
            setSample(false);
            setRound((n) => n + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
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
        <span className="text-signal">{note.lead}</span> · {note.rest}
      </p>
    </div>
  );
}
