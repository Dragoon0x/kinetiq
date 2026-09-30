"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  FlingSort,
  type FlingSortCategory,
  type FlingSortChange,
  type FlingSortItem,
} from "@/registry/ui/fling-sort";

export const tweaks = defineTweaks({
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 2000,
    min: 800,
    max: 3200,
    step: 200,
    unit: "px/s²",
  },
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.4,
    min: 0,
    max: 0.8,
    step: 0.05,
  },
  drag: {
    kind: "range",
    label: "Drag",
    default: 0.8,
    min: 0,
    max: 3,
    step: 0.1,
  },
  bins: {
    kind: "range",
    label: "Bins",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
});

/** This week's Fernworks receipts, waiting to be filed. */
const RECEIPTS: FlingSortItem[] = [
  { id: "taxi", label: "Taxi", detail: "24.80" },
  { id: "lunch", label: "Lunch", detail: "18.50" },
  { id: "ink", label: "Ink", detail: "42.00" },
  { id: "hotel", label: "Hotel", detail: "212.00" },
  { id: "coffee", label: "Coffee", detail: "4.60" },
  { id: "train", label: "Train", detail: "38.20" },
];

const CATEGORIES: FlingSortCategory[] = [
  { id: "travel", label: "Travel" },
  { id: "meals", label: "Meals" },
  { id: "office", label: "Office" },
  { id: "other", label: "Other" },
];

/**
 * Filing a week of Fernworks expenses: throw each receipt into its
 * category. Changing the number of bins starts a fresh pile.
 */
export function FlingSortDemo({
  chrome = true,
  sound,
  bins = tweaks.bins.default,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  return (
    <Expenses
      key={bins}
      chrome={chrome}
      sound={sound}
      bins={bins}
      {...values}
    />
  );
}

function Expenses({
  chrome,
  sound,
  bins,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome: boolean; bins: number }) {
  const [filed, setFiled] = React.useState<Record<string, string>>({});
  const [last, setLast] = React.useState<FlingSortChange | null>(null);
  const [round, setRound] = React.useState(0);
  const count = Object.keys(filed).length;
  const item = RECEIPTS.find((r) => r.id === last?.item);
  const bin = CATEGORIES.find((c) => c.id === last?.bin);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <FlingSort
        key={round}
        label="Fernworks receipts"
        items={RECEIPTS}
        categories={CATEGORIES}
        bins={bins}
        value={filed}
        onValueChange={(next, change) => {
          setFiled(next);
          setLast(change);
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">
              {count} of {RECEIPTS.length} filed
            </span>{" "}
            ·{" "}
            {item
              ? `${item.label} ${bin ? `to ${bin.label}` : "back to the inbox"}`
              : "throw a receipt into a bin"}
          </p>
          {count > 0 ? (
            <button
              type="button"
              onClick={() => {
                setFiled({});
                setLast(null);
                setRound((n) => n + 1);
              }}
              className="h-7 shrink-0 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Start over
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
