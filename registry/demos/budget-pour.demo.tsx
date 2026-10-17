"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BudgetPour,
  defaultBudgetPot,
  defaultBudgetRequest,
  fitUnderCap,
} from "@/registry/ui/budget-pour";

export const tweaks = defineTweaks({
  barStyle: {
    kind: "choice",
    label: "Bar",
    default: "solid",
    options: ["solid", "cells", "rail"],
    names: { solid: "Solid", cells: "Cells", rail: "Rail" },
  },
  pourSpeed: {
    kind: "range",
    label: "Pour",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

type Scenario = "order" | "over" | "expired" | "twostep";
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "order", label: "Order" },
  { id: "over", label: "Over" },
  { id: "expired", label: "Expired" },
  { id: "twostep", label: "Two-step" },
];

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 17, 14, 0);
const TOTAL = defaultBudgetRequest.items.reduce(
  (a, i) => a + i.qty * i.unit,
  0,
);
const OVER_POT = { ...defaultBudgetPot, committed: 2100 };
const EXPIRED = {
  ...defaultBudgetRequest,
  quote: { id: "Q-3318", validUntil: NOW - 2 * DAY },
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

/**
 * Fieldline's purchasing agent wants soil sensors for the north plots,
 * against the field team's Q4 equipment budget. The scenarios put the same
 * order over budget, behind an expired quote, or above the second-approval
 * line.
 */
export function BudgetPourDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [scenario, setScenario] = React.useState<Scenario>("order");
  const [cap, setCap] = React.useState(TOTAL);
  const [approvals, setApprovals] = React.useState<string[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  const pot = scenario === "over" ? OVER_POT : defaultBudgetPot;
  const request = scenario === "expired" ? EXPIRED : defaultBudgetRequest;
  const left = pot.total - pot.spent - pot.committed;

  const restart = (next: Scenario) => {
    setScenario(next);
    setCap(TOTAL);
    setApprovals([]);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <BudgetPour
      key={`${scenario}-${round}`}
      request={request}
      budget={pot}
      cap={cap}
      onSetCap={(c) => {
        setCap(c);
        setNote(null);
      }}
      approvals={approvals}
      secondApprovalAbove={scenario === "twostep" ? 2500 : 3000}
      now={NOW}
      onApprove={(amount) =>
        setNote(
          scenario === "twostep"
            ? "waiting · 1 of 2 approvals"
            : `poured · ${money(amount)} · ${money(left - amount)} left`,
        )
      }
      onReject={() => setNote("declined · nothing spent")}
      onRequestQuote={() => setNote("asked for a new quote")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const { kept, sum } = fitUnderCap(request.items, cap);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const line =
    note ??
    (scenario === "expired"
      ? "quote expired · approve held"
      : sum > left
        ? `over budget by ${money(sum - left)}`
        : `cap ${money(cap)} · ${kept} of ${request.items.length} items · ${money(left - sum)} left after`);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Scenario"
          className="flex flex-wrap items-center gap-1"
        >
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={scenario === s.id}
              tabIndex={scenario === s.id ? 0 : -1}
              onClick={() => restart(s.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                  return;
                event.preventDefault();
                const at = SCENARIOS.findIndex((x) => x.id === scenario);
                const to =
                  SCENARIOS[
                    (at +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      SCENARIOS.length) %
                      SCENARIOS.length
                  ];
                if (!to) return;
                restart(to.id);
                (
                  event.currentTarget.parentElement?.querySelector(
                    `[data-bp-scenario="${to.id}"]`,
                  ) as HTMLElement | null
                )?.focus();
              }}
              data-bp-scenario={s.id}
              className={cn(
                button,
                scenario === s.id &&
                  "border-hairline-strong bg-surface-2 text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scenario === "twostep" ? (
          <button
            type="button"
            aria-pressed={approvals.includes("mara")}
            onClick={() => {
              setApprovals(["mara"]);
              setNote(
                `poured · second approval in · ${money(left - sum)} left`,
              );
            }}
            className={button}
          >
            Second approver signs
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => restart(scenario)}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
