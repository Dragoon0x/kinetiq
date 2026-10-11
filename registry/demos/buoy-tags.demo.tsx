"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BuoyTags, defaultBuoyTags } from "@/registry/ui/buoy-tags";

export const tweaks = defineTweaks({
  bob: {
    kind: "range",
    label: "Bob",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  moorings: { kind: "toggle", label: "Moorings", default: true },
});

/**
 * The Basinworks journal asks new readers what they want to read about; the
 * topics float on the harbour, and a press dunks one in or out.
 */
export function BuoyTagsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [picked, setPicked] = React.useState<string[]>(["tides", "kelp"]);
  const names = defaultBuoyTags
    .filter((t) => picked.includes(t.id))
    .map((t) => t.label.toLowerCase());

  const water = (
    <BuoyTags
      label="Topics"
      value={picked}
      onValueChange={setPicked}
      sound={sound}
      className={
        chrome
          ? "h-58 rounded-3 border border-hairline"
          : "h-54 rounded-3 border border-hairline"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{water}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks journal
        </p>
        <p className="text-base font-medium text-foreground">
          What would you like to read about?
        </p>
      </div>
      {water}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {picked.length === 0
            ? "no topics yet"
            : `${picked.length} ${picked.length === 1 ? "topic" : "topics"}`}
        </span>
        {picked.length === 0
          ? " · press a tag to dunk it"
          : ` · ${names.join(", ")}`}
      </p>
    </div>
  );
}
