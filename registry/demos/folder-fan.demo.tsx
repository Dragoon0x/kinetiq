"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FolderFan, type FolderFanItem } from "@/registry/ui/folder-fan";

export const tweaks = defineTweaks({
  sheets: {
    kind: "range",
    label: "Sheets",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  fan: {
    kind: "range",
    label: "Fan",
    default: 24,
    min: 0,
    max: 48,
    step: 4,
    unit: "°",
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "manila",
    options: ["manila", "sky", "sage", "clay"],
    names: { manila: "Manila", sky: "Sky", sage: "Sage", clay: "Clay" },
  },
});

const STATEMENTS: FolderFanItem[] = [
  { id: "sep", label: "September 2025", meta: "PDF" },
  { id: "aug", label: "August 2025", meta: "PDF" },
  { id: "jul", label: "July 2025", meta: "PDF" },
  { id: "jun", label: "June 2025", meta: "PDF" },
  { id: "may", label: "May 2025", meta: "PDF" },
  { id: "apr", label: "April 2025", meta: "PDF" },
];

/**
 * A Coldbrook account's statements, kept in a folder: the papers lift out
 * when you come near, and opening it spreads them into a list to pick from.
 */
export function FolderFanDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<string | null>(null);

  const folder = (
    <FolderFan
      label="Statements"
      items={STATEMENTS}
      open={open}
      onOpenChange={setOpen}
      value={chosen}
      onValueChange={setChosen}
      sound={sound}
      className="self-center"
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{folder}</div>;
  }

  const name = STATEMENTS.find((s) => s.id === chosen)?.label.toLowerCase();
  const count = Math.min(values.sheets ?? 4, STATEMENTS.length);
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {folder}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {open ? "open" : name ? `chose ${name}` : "statements"}
        </span>
        {open
          ? ` · ${count} statements`
          : name
            ? " · coldbrook"
            : " · hover or press to open"}
      </p>
    </div>
  );
}
