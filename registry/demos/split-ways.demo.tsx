"use client";

import * as React from "react";

import {
  SplitWays,
  type SplitItem,
  type SplitMode,
  type SplitPerson,
} from "@/registry/ui/split-ways";

const TOTAL = 86.4;
const PEOPLE: SplitPerson[] = [
  { id: "ada", name: "Ada" },
  { id: "bo", name: "Bo" },
  { id: "cy", name: "Cy" },
];
const ITEMS: SplitItem[] = [
  { id: "flatbread", label: "Flatbread", amount: 14 },
  { id: "mains", label: "Two mains", amount: 52.4 },
  { id: "sides", label: "Sides", amount: 12 },
  { id: "tea", label: "Tea", amount: 8 },
];
const ASSIGNMENTS = { flatbread: "ada", mains: "ada", sides: "bo", tea: "cy" };
const EVEN: Record<string, number> = { ada: 28.8, bo: 28.8, cy: 28.8 };
const MODE_LABEL: Record<SplitMode, string> = {
  count: "By count",
  item: "By item",
  amount: "By amount",
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SplitWaysDemo() {
  const [mode, setMode] = React.useState<SplitMode>("count");
  const [shares, setShares] = React.useState<Record<string, number>>(EVEN);

  const assigned = PEOPLE.reduce(
    (sum, person) => sum + (shares[person.id] ?? 0),
    0,
  );
  const gap = Math.round((TOTAL - assigned) * 100) / 100;
  const tail =
    mode === "count" || gap === 0
      ? ""
      : gap > 0
        ? ` · ${MONEY.format(gap)} unassigned`
        : ` · ${MONEY.format(-gap)} over`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SplitWays
        label="Fernworks Kitchen"
        total={TOTAL}
        people={PEOPLE}
        items={ITEMS}
        mode={mode}
        onModeChange={setMode}
        defaultAssignments={ASSIGNMENTS}
        onSharesChange={setShares}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {MODE_LABEL[mode]} ·{" "}
        <span className="text-cobalt-bright tabular-nums">
          {PEOPLE.map(
            (person) =>
              `${person.name} ${MONEY.format(shares[person.id] ?? 0)}`,
          ).join(" · ")}
          {tail}
        </span>
      </p>
    </div>
  );
}
