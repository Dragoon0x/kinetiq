"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSeriesOccurrences,
  SeriesEdit,
  type SeriesOccurrence,
  type SeriesScope,
} from "@/registry/ui/series-edit";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "tile",
    options: ["tile", "pill", "stub"],
    names: { tile: "Tile", pill: "Pill", stub: "Stub" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "moss", "plum", "ember"],
    names: { cobalt: "Cobalt", moss: "Moss", plum: "Plum", ember: "Ember" },
  },
});

const SCOPE_WORDS: Record<SeriesScope, string> = {
  one: "this meeting",
  following: "this and following",
  all: "all meetings",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const dayOf = (id: string) => {
  const o = defaultSeriesOccurrences.find((x) => x.id === id);
  if (!o) return id;
  const d = new Date(o.date);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/**
 * The Gaugeworks weekly review: the draft already moves Thursday 12
 * November to 11:00. Choose "This and following" to cleave the series there
 * and see what the later Thursdays would run into.
 */
export function SeriesEditDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<SeriesOccurrence[]>(
    defaultSeriesOccurrences,
  );
  const [anchor, setAnchor] = React.useState("nov-12");
  const [scope, setScope] = React.useState<SeriesScope>("one");
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const editor = (
    <SeriesEdit
      key={run}
      occurrences={list}
      onOccurrencesChange={setList}
      anchor={anchor}
      onAnchorChange={(id) => {
        setAnchor(id);
        setNote(null);
      }}
      scope={scope}
      onScopeChange={(s) => {
        setScope(s);
        setNote(null);
      }}
      defaultChanges={{ start: 11 * 60 }}
      onEditOne={(o) => setNote(`saved · ${dayOf(o.id)} as a one-off`)}
      onEditFollowing={(o) => setNote(`saved · new series from ${dayOf(o.id)}`)}
      onEditAll={() => setNote("saved · every meeting")}
      onDiscard={() => setNote("discarded")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{editor}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {editor}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setList(defaultSeriesOccurrences);
            setAnchor("nov-12");
            setScope("one");
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
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
          {note ?? `editing ${dayOf(anchor)}`}
        </span>{" "}
        · {SCOPE_WORDS[scope]}
      </p>
    </div>
  );
}
