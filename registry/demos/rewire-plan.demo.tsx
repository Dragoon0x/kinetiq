"use client";

import * as React from "react";

import { RotateCcw, Sparkles } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPlanDependencies,
  defaultPlanSteps,
  RewirePlan,
  type RewireStatus,
} from "@/registry/ui/rewire-plan";

export const tweaks = defineTweaks({
  arrowStyle: {
    kind: "choice",
    label: "Arrows",
    default: "curve",
    options: ["curve", "elbow", "metro"],
    names: { curve: "Curve", elbow: "Elbow", metro: "Metro" },
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "card",
    options: ["card", "row", "ticket"],
    names: { card: "Card", row: "Row", ticket: "Ticket" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/**
 * The agent's first draft switches reads before the data is verified: the
 * reviewer drags the verify step up (or presses Fix order) before approving.
 */
const PROPOSED = [
  "snapshot",
  "provision",
  "schema",
  "copy",
  "reads",
  "verify",
  "writes",
  "retire",
];
const DRAFT_MS = 1400;

const backwardsIn = (order: string[]) =>
  defaultPlanDependencies.filter(
    (d) => order.indexOf(d.to) < order.indexOf(d.from),
  ).length;

/**
 * Waylight's migration agent proposes how it will move the orders database
 * to a new cluster. The reviewer reorders the steps until every arrow runs
 * forwards, then approves.
 */
export function RewirePlanDemo({
  chrome = true,
  // The plan is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [order, setOrder] = React.useState<string[]>(PROPOSED);
  const [status, setStatus] = React.useState<RewireStatus>("ready");
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const surface = (
    <RewirePlan
      key={round}
      order={order}
      status={status}
      onReorder={(next, moved) => {
        setOrder(next);
        const step = defaultPlanSteps.find((s) => s.id === moved);
        const back = backwardsIn(next);
        setNote(
          `${step ? `moved ${step.title.toLowerCase()} to ${next.indexOf(step.id) + 1}` : "order fixed"} · ${
            back === 0
              ? "in order"
              : `${back} ${back === 1 ? "arrow" : "arrows"} backwards`
          }`,
        );
      }}
      onEditStep={(s) => setNote(`edited · ${s.title.toLowerCase()}`)}
      onAddStep={() => setNote("added a step")}
      onApprove={(o) => setNote(`approved · ${o.length} steps`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const back = backwardsIn(order);
  const minutes = defaultPlanSteps.reduce((a, s) => a + s.minutes, 0);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setStatus("drafting");
            setNote("drafting the plan");
            timer.current = window.setTimeout(() => {
              setStatus("ready");
              setOrder(PROPOSED);
              setNote(null);
              setRound((r) => r + 1);
            }, DRAFT_MS);
          }}
          className={button}
        >
          <Sparkles aria-hidden className="size-3.5" />
          Draft again
        </button>
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setStatus("ready");
            setOrder(PROPOSED);
            setNote(null);
            setRound((r) => r + 1);
          }}
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
        <span className="text-signal">
          {note ??
            `${order.length} steps · ${Math.floor(minutes / 60)} h ${minutes % 60} min · ${
              back === 0
                ? "in order"
                : `${back} ${back === 1 ? "arrow" : "arrows"} backwards`
            }`}
        </span>
      </p>
    </div>
  );
}
