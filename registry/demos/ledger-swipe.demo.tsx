"use client";

import * as React from "react";

import {
  Archive,
  Check,
  Coffee,
  Flag,
  Leaf,
  RotateCcw,
  Split,
  Train,
  Zap,
} from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LedgerSwipe,
  type LedgerSwipeAction,
  type LedgerSwipeItem,
} from "@/registry/ui/ledger-swipe";

export const tweaks = defineTweaks({
  threshold: {
    kind: "range",
    label: "Threshold",
    default: 0.5,
    min: 0.3,
    max: 0.8,
    step: 0.05,
  },
  actions: {
    kind: "choice",
    label: "Actions",
    default: "both",
    options: ["both", "trailing", "leading"],
    names: { both: "Both", trailing: "Trailing", leading: "Leading" },
  },
  elastic: {
    kind: "range",
    label: "Elastic",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** Coldbrook Bank: this week's transactions waiting for a look. */
const LEDGER: LedgerSwipeItem[] = [
  {
    id: "fernworks",
    title: "Fernworks Nursery",
    subtitle: "Garden · Tue 14",
    amount: -42.8,
    icon: <Leaf />,
  },
  {
    id: "waylight",
    title: "Waylight Rail",
    subtitle: "Transport · Tue 14",
    amount: -3.4,
    icon: <Train />,
  },
  {
    id: "gaugeworks",
    title: "Gaugeworks Payroll",
    subtitle: "Income · Mon 13",
    amount: 2140,
    icon: <Zap />,
  },
  {
    id: "basin",
    title: "Basin Coffee",
    subtitle: "Eating out · Mon 13",
    amount: -4.6,
    icon: <Coffee />,
  },
];

const LEADING: LedgerSwipeAction[] = [
  {
    id: "reviewed",
    label: "Reviewed",
    icon: <Check />,
    tone: "success",
    removes: true,
  },
];

const TRAILING: LedgerSwipeAction[] = [
  {
    id: "archive",
    label: "Archive",
    icon: <Archive />,
    tone: "accent",
    removes: true,
  },
  { id: "flag", label: "Flag", icon: <Flag />, tone: "warn" },
  { id: "split", label: "Split", icon: <Split />, tone: "neutral" },
];

const DONE: Record<string, string> = {
  reviewed: "reviewed",
  archive: "archived",
  split: "split in two",
};

/**
 * A Coldbrook Bank review queue: swipe right to mark a payment reviewed,
 * left to archive, flag or split it.
 */
export function LedgerSwipeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ids, setIds] = React.useState(() => LEDGER.map((t) => t.id));
  const [flagged, setFlagged] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [said, setSaid] = React.useState<string | null>(null);

  const shown = LEDGER.filter((t) => ids.includes(t.id))
    .slice(0, chrome ? 4 : 3)
    .map((t) => ({ ...t, flagged: flagged.has(t.id) }));

  const name = (id: string) =>
    LEDGER.find((t) => t.id === id)?.title.toLowerCase() ?? id;

  const onAction = (action: string, id: string) => {
    if (action === "reviewed" || action === "archive") {
      setIds((prev) => prev.filter((x) => x !== id));
      setSaid(`${DONE[action]} ${name(id)}`);
      return;
    }
    if (action === "flag") {
      const on = !flagged.has(id);
      setFlagged((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
      setSaid(`${on ? "flagged" : "unflagged"} ${name(id)}`);
      return;
    }
    setSaid(`${name(id)} · ${DONE[action] ?? action}`);
  };

  const ledger = (
    <LedgerSwipe
      label="To review"
      items={shown}
      leadingActions={LEADING}
      trailingActions={TRAILING}
      onAction={onAction}
      hint
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{ledger}</div>;
  }

  const left = ids.length;
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {ledger}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{said ?? `${left} to review`}</span>
          {said ? ` · ${left} left` : " · swipe a row"}
        </p>
        <button
          type="button"
          aria-disabled={left === LEDGER.length && flagged.size === 0}
          onClick={() => {
            setIds(LEDGER.map((t) => t.id));
            setFlagged(new Set());
            setSaid(null);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Reset
        </button>
      </div>
    </div>
  );
}
