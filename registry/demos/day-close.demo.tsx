"use client";

import * as React from "react";

import {
  DayClose,
  type DayCategory,
  type DayFigure,
  type DayState,
} from "@/registry/ui/day-close";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Terminal 2 on an invented Tuesday. */
const FIGURES: DayFigure[] = [
  { id: "sales", label: "Sales", value: 1284.5 },
  { id: "refunds", label: "Refunds", value: -36, tone: "danger" },
  { id: "tips", label: "Tips", value: 112.25, tone: "success" },
  { id: "net", label: "Net", value: 1360.75 },
];

const CATEGORIES: DayCategory[] = [
  { id: "drinks", label: "Drinks", value: 512.3 },
  { id: "food", label: "Food", value: 448.9 },
  { id: "retail", label: "Retail", value: 219.6 },
  { id: "other", label: "Other", value: 103.7 },
];

const NET = currency.format(1360.75);

export function DayCloseDemo() {
  const [state, setState] = React.useState<DayState>("open");

  const line =
    state === "open"
      ? "Open · not totalled"
      : state === "totalled"
        ? `Totalled · net ${NET}`
        : `Closed · net ${NET}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DayClose
        label="Waylight Pay · Terminal 2"
        heading="Tuesday 9 September"
        figures={FIGURES}
        categories={CATEGORIES}
        state={state}
        onStateChange={setState}
      />

      <button
        type="button"
        onClick={() => setState("open")}
        disabled={state === "open"}
        className="flex h-8 w-fit items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45"
      >
        Reopen
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
