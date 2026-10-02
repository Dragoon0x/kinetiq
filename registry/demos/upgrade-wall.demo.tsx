"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultUpgradeNow,
  defaultUpgradePlans,
  UpgradeWall,
  type UpgradeBilling,
  type UpgradeState,
} from "@/registry/ui/upgrade-wall";

export const tweaks = defineTweaks({
  timeline: {
    kind: "choice",
    label: "Timeline",
    default: "track",
    options: ["track", "list", "none"],
    names: { track: "Track", list: "List", none: "No trial" },
  },
  compare: {
    kind: "choice",
    label: "Compare",
    default: "table",
    options: ["table", "unlocks", "all"],
    names: { table: "Table", unlocks: "Unlocks", all: "All plans" },
  },
  cycle: {
    kind: "choice",
    label: "Cycle",
    default: "both",
    options: ["both", "monthly", "yearly"],
    names: { both: "Both", monthly: "Monthly", yearly: "Yearly" },
  },
});

const SEATS = 3;
const TRIAL = 14;
const REMIND = 2;
const DAY = 86_400_000;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/**
 * Gaugeworks, an analytics product: a team of three on Free has used all
 * three of its dashboards, and the wall offers Team or Business.
 */
export function UpgradeWallDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plan, setPlan] = React.useState("team");
  const [billing, setBilling] = React.useState<UpgradeBilling>("yearly");
  const [state, setState] = React.useState<UpgradeState>("idle");
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const cycle = values.cycle ?? "both";
  const timeline = values.timeline ?? "track";
  const shownBilling: UpgradeBilling = cycle === "both" ? billing : cycle;
  const chosen = defaultUpgradePlans.find((p) => p.id === plan);
  const perSeat = chosen
    ? shownBilling === "yearly"
      ? chosen.yearly
      : chosen.monthly
    : 0;
  const total = perSeat * SEATS * (shownBilling === "yearly" ? 12 : 1);
  const trial = timeline !== "none";

  const wall = (
    <UpgradeWall
      key={round}
      seats={SEATS}
      trialDays={TRIAL}
      reminderDays={REMIND}
      now={defaultUpgradeNow}
      title="Upgrade to keep your dashboards live"
      subtitle="Gaugeworks · Your team has used 3 of 3 dashboards on Free."
      plan={plan}
      onPlanChange={(next) => {
        setPlan(next);
        setNote(null);
      }}
      billing={billing}
      onBillingChange={(next) => {
        setBilling(next);
        setNote(null);
      }}
      onStateChange={setState}
      onPurchase={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          window.setTimeout(() => {
            if (fail) {
              setNote("declined · nothing charged");
              reject(new Error("Your card was declined. Nothing was charged."));
              return;
            }
            setNote(null);
            resolve();
          }, 900);
        })
      }
      onDismiss={() =>
        setNote("not now · the wall stays until a plan is chosen")
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{wall}</div>;

  const line =
    note ??
    (state === "pending"
      ? trial
        ? "starting trial"
        : "processing upgrade"
      : state === "success"
        ? trial
          ? `trial started · reminder on ${day(defaultUpgradeNow + (TRIAL - REMIND) * DAY)}`
          : `upgraded · €${total} charged`
        : `${plan} · ${shownBilling} · €${total} ${
            trial ? `on ${day(defaultUpgradeNow + TRIAL * DAY)}` : "today"
          }`);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {wall}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setPlan("team");
              setBilling("yearly");
              setState("idle");
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
