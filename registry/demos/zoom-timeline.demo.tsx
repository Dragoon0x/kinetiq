"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTimelineEvents,
  ZoomTimeline,
  type ZoomTimelineView,
} from "@/registry/ui/zoom-timeline";

export const tweaks = defineTweaks({
  levels: {
    kind: "choice",
    label: "Range",
    default: "years-minutes",
    options: ["years-minutes", "months-hours", "days-minutes"],
    names: {
      "years-minutes": "Yr–min",
      "months-hours": "Mo–hr",
      "days-minutes": "Day–min",
    },
  },
  cluster: {
    kind: "range",
    label: "Cluster",
    default: 28,
    min: 0,
    max: 64,
    step: 4,
    unit: "px",
  },
  momentum: {
    kind: "range",
    label: "Momentum",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const UNIT_NAMES = {
  year: "years",
  month: "months",
  day: "days",
  hour: "hours",
  minute: "minutes",
} as const;

/**
 * The Fieldline Basin Road survey programme: two years of milestones, and
 * two field days whose samples are minutes apart.
 */
export function ZoomTimelineDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ZoomTimelineView | null>(null);
  const [reset, setReset] = React.useState(0);
  const chosen = defaultTimelineEvents.find((e) => e.id === selected);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ZoomTimeline
        key={reset}
        label="Basin Road survey programme"
        value={selected}
        onValueChange={setSelected}
        onViewChange={setView}
        now="2026-04-20T12:00:00Z"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {chosen ? (
              <>
                <span className="text-signal">selected {chosen.title}</span>
                {view ? ` · ${UNIT_NAMES[view.unit]}` : null}
              </>
            ) : view ? (
              <>
                <span className="text-signal">{UNIT_NAMES[view.unit]}</span> ·{" "}
                {view.visible} visible · {view.bubbles}{" "}
                {view.bubbles === 1 ? "bubble" : "bubbles"}
              </>
            ) : (
              <>
                <span className="text-signal">drag to pan</span> · ctrl + scroll
                to zoom
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setReset((n) => n + 1);
              setView(null);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-[11px] text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset view
          </button>
        </div>
      ) : null}
    </div>
  );
}
