"use client";

import * as React from "react";

import { ScheduleSend, type ScheduleValue } from "@/registry/ui/schedule-send";

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STEP = 50;
const MIN = 50;
const MAX = 1500;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function ScheduleSendDemo() {
  const [amount, setAmount] = React.useState(240);
  const [schedule, setSchedule] = React.useState<ScheduleValue>({
    mode: "now",
    offsetDays: 1,
    repeat: "once",
  });

  const shift = (delta: number) =>
    setAmount((value) => Math.min(MAX, Math.max(MIN, value + delta)));

  const when =
    schedule.mode === "now"
      ? "now"
      : `day +${schedule.offsetDays}, ${schedule.repeat}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Waylight Pay · Fernworks Supply
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums">
          {MONEY.format(amount)}
        </span>
      </div>

      <ScheduleSend
        amount={amount}
        value={schedule}
        onValueChange={setSchedule}
        label="Send"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={amount >= MAX}
          onClick={() => shift(STEP)}
        >
          Amount +{STEP}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={amount <= MIN}
          onClick={() => shift(-STEP)}
        >
          Amount −{STEP}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight Pay{" "}
        <span className="text-cobalt-bright tabular-nums">
          {MONEY.format(amount)} {when}
        </span>
      </p>
    </div>
  );
}
