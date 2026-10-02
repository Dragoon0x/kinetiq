"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSubscriptionNow,
  defaultSubscriptionPlan,
  defaultSubscriptionProducts,
  defaultSubscriptionValue,
  scheduleOf,
  SubscriptionManager,
  type SubscriptionValue,
} from "@/registry/ui/subscription-manager";

export const tweaks = defineTweaks({
  calendar: {
    kind: "choice",
    label: "Calendar",
    default: "strip",
    options: ["strip", "month"],
    names: { strip: "Strip", month: "Month" },
  },
  frequency: {
    kind: "choice",
    label: "Frequency",
    default: "chips",
    options: ["chips", "slider"],
    names: { chips: "Chips", slider: "Slider" },
  },
  swap: {
    kind: "choice",
    label: "Swap",
    default: "shelf",
    options: ["shelf", "menu"],
    names: { shelf: "Shelf", menu: "Menu" },
  },
});

const DAY_MS = 86_400_000;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const said = (day: number) => {
  const d = new Date(day * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const short = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const nameOf = (id: string) =>
  (
    defaultSubscriptionProducts.find((p) => p.id === id)?.name ?? id
  ).toLowerCase();
const every = (w: number) => (w === 1 ? "every week" : `every ${w} weeks`);

const BUTTON =
  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks Coffee's Roaster's Box, every two weeks: the next box is on
 * Thursday 8 October with an espresso, a filter roast and a tin of
 * shortbread, and four more are on the shelf.
 */
export function SubscriptionManagerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plan, setPlan] = React.useState<SubscriptionValue>(
    defaultSubscriptionValue,
  );
  const [event, setEvent] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  const manager = (
    <SubscriptionManager
      key={round}
      value={plan}
      onValueChange={setPlan}
      onSkip={(date, skipped) => {
        const next = scheduleOf(
          defaultSubscriptionPlan,
          {
            ...plan,
            skipped: skipped
              ? [...plan.skipped, date]
              : plan.skipped.filter((d) => d !== date),
          },
          defaultSubscriptionNow,
        ).next;
        setEvent(
          skipped
            ? `skipped ${short(date)}${next ? ` · next ${said(next.day)}` : ""}`
            : `${short(date)} back on`,
        );
      }}
      onSwap={(_, from, to) =>
        setEvent(`swapped ${nameOf(from)} for ${nameOf(to)}`)
      }
      onPause={(until) =>
        setEvent(until ? `paused until ${short(until)}` : "resumed")
      }
      onCadenceChange={(w) => setEvent(every(w))}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{manager}</div>;

  const schedule = scheduleOf(
    defaultSubscriptionPlan,
    plan,
    defaultSubscriptionNow,
  );
  const total = plan.box.reduce(
    (s, id) =>
      s + (defaultSubscriptionProducts.find((p) => p.id === id)?.price ?? 0),
    0,
  );
  const withShipping =
    total >= 40 ? total : total + defaultSubscriptionPlan.shipping;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {manager}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {event ??
              (schedule.next
                ? `next box ${said(schedule.next.day)}`
                : "no box scheduled")}
          </span>
          {event?.startsWith("every") ? "" : ` · ${every(plan.cadence)}`} · $
          {withShipping.toFixed(2)}
        </p>
        <button
          type="button"
          onClick={() => {
            setPlan(defaultSubscriptionValue);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={BUTTON}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
