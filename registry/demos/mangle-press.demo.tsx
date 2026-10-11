"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ManglePress, type MangleItem } from "@/registry/ui/mangle-press";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  rollers: {
    kind: "range",
    label: "Rollers",
    default: 2,
    min: 2,
    max: 6,
    step: 2,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "studio",
    options: ["studio", "garden", "harbour", "ember"],
    names: {
      studio: "Studio",
      garden: "Garden",
      harbour: "Harbour",
      ember: "Ember",
    },
  },
});

/**
 * The Gaugeworks print room: drafts go in on the left, and what the team
 * asked for comes out on the right. Wind the crank to hurry it along.
 */
export function ManglePressDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [printed, setPrinted] = React.useState(0);
  const [latest, setLatest] = React.useState<MangleItem | null>(null);
  const speed = values.speed ?? tweaks.speed.default;

  const press = (
    <ManglePress
      label="Gaugeworks print room"
      sound={sound}
      onResult={(item) => {
        setPrinted((n) => n + 1);
        setLatest(item);
      }}
      className={
        chrome
          ? "h-58 rounded-3 border border-hairline"
          : "h-54 rounded-3 border border-hairline"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{press}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · print room
        </p>
        <p className="text-base font-medium text-foreground">
          Drafts in, deliverables out
        </p>
      </div>
      {press}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">printed {printed}</span>
        {latest
          ? ` · last: ${latest.title.toLowerCase()}`
          : " · warming up"} · {speed.toFixed(2).replace(/0$/, "")}×
      </p>
    </div>
  );
}
