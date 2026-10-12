"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countVeto,
  defaultVetoGroups,
  defaultVetoRecords,
  defaultVetoValue,
  VetoChips,
  type VetoValue,
} from "@/registry/ui/veto-chips";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "soft",
    options: ["soft", "outline", "solid"],
    names: { soft: "Soft", outline: "Outline", solid: "Solid" },
  },
  flipAxis: {
    kind: "choice",
    label: "Flip",
    default: "x",
    options: ["x", "y", "none"],
    names: { x: "Tumble", y: "Turn", none: "Fade" },
  },
  tone: {
    kind: "choice",
    label: "Veto",
    default: "danger",
    options: ["danger", "warn", "ink"],
    names: { danger: "Red", warn: "Amber", ink: "Ink" },
  },
});

/**
 * Fieldline's work-order queue: keep the Coldbrook crew's jobs, rule out PVC
 * work, and see what is left — in one row of chips.
 */
export function VetoChipsDemo({
  chrome = true,
  // The chips are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<VetoValue>(defaultVetoValue);

  if (!chrome) {
    return (
      <div className="w-full">
        <VetoChips className="h-[208px]" {...values} />
      </div>
    );
  }

  const left = countVeto(defaultVetoRecords, defaultVetoGroups, value);
  const total = defaultVetoRecords.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <VetoChips
        className="h-[300px]"
        value={value}
        onChange={setValue}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            keeping {value.include.length} · excluding {value.exclude.length}
          </span>{" "}
          · {left} of {total} work orders
        </p>
        <button
          type="button"
          onClick={() => setValue(defaultVetoValue)}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
