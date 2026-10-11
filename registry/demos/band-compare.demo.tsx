"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BandCompare,
  defaultBandCompareItems,
} from "@/registry/ui/band-compare";

export const tweaks = defineTweaks({
  bands: {
    kind: "range",
    label: "Bands",
    default: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  seamStyle: {
    kind: "choice",
    label: "Seams",
    default: "handle",
    options: ["line", "handle", "gap", "fold"],
    names: { line: "Line", handle: "Handle", gap: "Gap", fold: "Fold" },
  },
  labels: {
    kind: "choice",
    label: "Labels",
    default: "chip",
    options: ["chip", "rule", "none"],
    names: { chip: "Chip", rule: "Rule", none: "None" },
  },
});

/**
 * Fernworks grade: one frame from the harbour shoot, passed through four
 * grades and laid side by side so the colourist can pick one.
 */
export function BandCompareDemo({
  chrome = true,
  // The frame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const n = values.bands ?? tweaks.bands.default;
  const [seams, setSeams] = React.useState<number[]>([]);
  const [wide, setWide] = React.useState<number | null>(null);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <BandCompare
          label="Four grades of one frame"
          expanded={wide}
          onExpandedChange={setWide}
          className="h-56 w-full"
          {...values}
        />
      </div>
    );
  }

  const shown =
    seams.length === n - 1
      ? seams
      : Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
  const edges = [0, ...shown, 1];
  const open = wide !== null && wide < n ? wide : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks grade · harbour, frame 0412
        </p>
        <p className="text-base font-medium text-foreground">
          {n === 4 ? "Four" : n === 3 ? "Three" : "Five"} passes of one frame
        </p>
      </div>
      <BandCompare
        label="Grades of one frame"
        onValueChange={setSeams}
        expanded={open}
        onExpandedChange={setWide}
        className="h-64 w-full border border-hairline"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open !== null ? (
          <>
            <span className="text-signal">
              {defaultBandCompareItems[open]?.label}
            </span>{" "}
            · full frame · double-click to share
          </>
        ) : (
          defaultBandCompareItems.slice(0, n).map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 ? " · " : null}
              <span className={i === 0 ? "text-signal" : undefined}>
                {item.label}
              </span>{" "}
              {Math.round(((edges[i + 1] ?? 1) - (edges[i] ?? 0)) * 100)}%
            </React.Fragment>
          ))
        )}
      </p>
    </div>
  );
}
