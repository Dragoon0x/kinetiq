"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultFieldLoupeNotes, FieldLoupe } from "@/registry/ui/field-loupe";

export const tweaks = defineTweaks({
  power: {
    kind: "range",
    label: "Power",
    default: 2.5,
    min: 1.5,
    max: 4,
    step: 0.25,
    unit: "×",
  },
  lensSize: {
    kind: "range",
    label: "Lens",
    default: 144,
    min: 96,
    max: 200,
    step: 8,
    unit: "px",
  },
  snap: {
    kind: "range",
    label: "Snap",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Bench Co.'s "Inside the workshop" page: one photo of the bench,
 * with the stories of the tools on it pinned where they sit.
 */
export function FieldLoupeDemo({
  chrome = true,
  // The loupe is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(
    defaultFieldLoupeNotes[0]?.id ?? null,
  );
  const [zoom, setZoom] = React.useState<number | null>(null);
  // A new resting power from the panel resets what the wheel did.
  const [seen, setSeen] = React.useState(values.power);
  if (seen !== values.power) {
    setSeen(values.power);
    setZoom(null);
  }
  const power = zoom ?? values.power ?? 2.5;
  const note = defaultFieldLoupeNotes.find((n) => n.id === open);

  const photo = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Bench Co.
        </p>
        <p className="text-xs text-ink-2">Inside the workshop</p>
      </div>
      <FieldLoupe
        label="The Fernworks bench, with notes"
        value={open}
        onValueChange={setOpen}
        onPowerChange={setZoom}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{photo}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {photo}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">loupe {power.toFixed(1)}×</span> ·{" "}
        {note ? note.title : "roaming · tab walks the notes"}
      </p>
    </div>
  );
}
