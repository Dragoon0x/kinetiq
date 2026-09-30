"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  NodeWire,
  type NodeWireLink,
  type NodeWireNode,
} from "@/registry/ui/node-wire";

export const tweaks = defineTweaks({
  sag: {
    kind: "range",
    label: "Sag",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  snap: {
    kind: "range",
    label: "Snap",
    default: 24,
    min: 12,
    max: 40,
    step: 2,
    unit: "px",
  },
  wire: {
    kind: "choice",
    label: "Wire",
    default: "rope",
    options: ["rope", "curve"],
    names: { rope: "Rope", curve: "Curve" },
  },
});

/** A Waylight Pay automation: card payments, rounded up, into savings. */
const NODES: NodeWireNode[] = [
  {
    id: "pay",
    label: "Payment",
    x: 0,
    y: 0.08,
    outputs: [
      { id: "amount", label: "Amount", type: "number" },
      { id: "merchant", label: "Merchant", type: "text" },
    ],
  },
  {
    id: "round",
    label: "Round up",
    x: 0.5,
    y: 0.92,
    inputs: [{ id: "amount", label: "Amount", type: "number" }],
    outputs: [{ id: "change", label: "Change", type: "number" }],
  },
  {
    id: "save",
    label: "Savings",
    x: 1,
    y: 0.2,
    inputs: [
      { id: "deposit", label: "Deposit", type: "number" },
      { id: "memo", label: "Memo", type: "text" },
    ],
  },
];

const START: NodeWireLink[] = [{ from: "pay.amount", to: "round.amount" }];
const INPUTS = ["round.amount", "save.deposit", "save.memo"];

function flowOf(links: NodeWireLink[]) {
  const into = (to: string) => links.find((l) => l.to === to)?.from;
  const deposit = into("save.deposit");
  const saving =
    deposit === "round.change"
      ? into("round.amount") === "pay.amount"
        ? "round-ups reach coldbrook savings"
        : "round up has no payment in"
      : deposit === "pay.amount"
        ? "whole payments go to savings"
        : "savings not wired yet";
  return into("save.memo") === "pay.merchant"
    ? `${saving} · memo from merchant`
    : saving;
}

/**
 * Wiring a Waylight Pay automation: a card payment's amount runs through a
 * round-up node, and the spare change should land in Coldbrook savings.
 */
export function NodeWireDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [links, setLinks] = React.useState<NodeWireLink[]>(START);
  const wired = INPUTS.filter((to) => links.some((l) => l.to === to)).length;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <NodeWire
        label="Round-up automation"
        nodes={NODES}
        value={links}
        onValueChange={setLinks}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {wired} of {INPUTS.length} inputs wired
          </span>{" "}
          · {flowOf(links)}
        </p>
      ) : null}
    </div>
  );
}
