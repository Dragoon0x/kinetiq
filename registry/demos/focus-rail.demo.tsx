"use client";

import { FocusRail, type FocusRailItem } from "@/registry/ui/focus-rail";

/** Fixed field-ops modules for Fieldline — ids, labels, copy; never random. */
const FIELDS = [
  {
    id: "survey",
    label: "Survey",
    line1: "Chart the seabed before the cutter moves in.",
    line2: "Sonar sweeps feed depth straight into the plan.",
    stat: "SOUNDINGS 12,400",
  },
  {
    id: "dredge",
    label: "Dredge",
    line1: "Cutter suction runs the channel to grade.",
    line2: "Output is tracked against the permitted volume.",
    stat: "3,120 M3/HR",
  },
  {
    id: "berth",
    label: "Berth",
    line1: "Six berths, one board, no double bookings.",
    line2: "Turnaround times roll straight into the weekly report.",
    stat: "BERTHS 6 OF 6",
  },
  {
    id: "relay",
    label: "Relay",
    line1: "Spoil moves through relay stations by pipe.",
    line2: "Pressure and flow are checked at every joint.",
    stat: "RELAY 1.8 KM",
  },
  {
    id: "ledger",
    label: "Ledger",
    line1: "Every cubic meter moved gets a line entry.",
    line2: "The record a permit audit actually wants to see.",
    stat: "ENTRIES 8,204",
  },
] as const;

const ITEMS: FocusRailItem[] = FIELDS.map((field) => ({
  id: field.id,
  label: field.label,
  content: (
    <div className="flex flex-col gap-1">
      <p className="text-sm leading-relaxed text-ink-2">{field.line1}</p>
      <p className="text-sm leading-relaxed text-ink-2">{field.line2}</p>
      <p className="mt-1 font-mono text-[11px] tracking-[0.06em] text-ink-3">
        {field.stat}
      </p>
    </div>
  ),
}));

export function FocusRailDemo() {
  return (
    <div className="flex w-full justify-center">
      <FocusRail
        items={ITEMS}
        expandOn="hover"
        className="h-64 w-full max-w-3xl"
      />
    </div>
  );
}
