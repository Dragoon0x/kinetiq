"use client";

import * as React from "react";

import {
  AutopayToggle,
  payDateLabel,
  type ScheduleItem,
} from "@/registry/ui/autopay-toggle";

const AMOUNT = 84;
const NEXT = { month: 10, day: 15 };

const SCHEDULE: ScheduleItem[] = [
  { id: "topup", label: "Waylight Pay top-up", month: 10, day: 3, amount: 50 },
  {
    id: "freight",
    label: "Basinworks Freight invoice",
    month: 10,
    day: 22,
    amount: 340,
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AutopayToggleDemo() {
  const [on, setOn] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <AutopayToggle
        label="Fernworks card"
        amount={AMOUNT}
        nextDate={NEXT}
        schedule={SCHEDULE}
        checked={on}
        onCheckedChange={setOn}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Autopay <span className="text-signal">{on ? "on" : "off"}</span>
        {on
          ? ` · next ${payDateLabel(NEXT)} · ${money.format(AMOUNT)}`
          : " · pay by hand"}
      </p>
    </div>
  );
}
