"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultYearbookPeople,
  YearbookGrid,
} from "@/registry/ui/yearbook-grid";

export const tweaks = defineTweaks({
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 2.2,
    min: 1.4,
    max: 3,
    step: 0.1,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 4,
    min: 0,
    max: 12,
    step: 1,
    unit: "px",
  },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks prints its team page like a yearbook: everyone who builds,
 * calibrates and ships the gauges, one portrait each.
 */
export function YearbookGridDemo({
  chrome = true,
  // The page is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focus, setFocus] = React.useState<number | null>(null);
  const [pinned, setPinned] = React.useState<number | null>(null);
  const shown = focus ?? pinned;
  const person = shown === null ? undefined : defaultYearbookPeople[shown];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          Gaugeworks · the team, 2026
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {defaultYearbookPeople.length} people
        </p>
      </div>
      <YearbookGrid
        label="Gaugeworks team"
        value={pinned}
        onValueChange={setPinned}
        onFocusChange={setFocus}
        maxHeight={chrome ? 440 : 500}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {person ? (
            <>
              <span className="text-signal">
                {shown === pinned ? "pinned" : "focus"}
              </span>{" "}
              · {person.name} · {person.role.toLowerCase()}
            </>
          ) : (
            <>
              <span className="text-signal">resting</span> · point at a face
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
