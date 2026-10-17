"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMouldArgs,
  SchemaMould,
  type SchemaMouldStatus,
} from "@/registry/ui/schema-mould";

export const tweaks = defineTweaks({
  mouldStyle: {
    kind: "choice",
    label: "Mould",
    default: "inset",
    options: ["inset", "outline", "cast"],
    names: { inset: "Inset", outline: "Outline", cast: "Cast" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const RUN_MS = 1100;

/**
 * Coldbrook Billing's create_invoice, as an agent called it for Basinworks'
 * October invoice: the amount came as text, one quantity was spelled out
 * and the purchase order number is missing. Fix all three and Run.
 */
export function SchemaMouldDemo({
  chrome = true,
  // The mould is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [args, setArgs] = React.useState(defaultMouldArgs);
  const [phase, setPhase] = React.useState<SchemaMouldStatus | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const surface = (
    <SchemaMould
      key={round}
      args={args}
      onFixArgument={(path, value) => {
        setArgs((a) => setIn(a, path, value));
        setNote(`fixed ${path}`);
        setPhase(null);
      }}
      onRun={() => {
        setPhase("running");
        setNote("running create_invoice");
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setPhase("completed");
          setNote("completed · CB-2207");
        }, RUN_MS);
      }}
      onCopy={() => setNote("arguments copied")}
      status={phase ?? undefined}
      result="Invoice CB-2207 created · $1,240.00 due 14 Nov 2026 · sent to accounts@basinworks.example"
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            setRound((r) => r + 1);
            setArgs(defaultMouldArgs);
            setPhase(null);
            setNote(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
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
          {note ?? "create_invoice · coldbrook"}
        </span>
        {` · ${outsideCount(args)} outside the mould`}
      </p>
    </div>
  );
}

/** The demo's own copy of the path writer, so the host owns its arguments. */
function setIn(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  const write = (node: unknown, i: number): unknown => {
    const key = keys[i];
    if (key === undefined) return value;
    if (Array.isArray(node)) {
      const copy = [...node];
      copy[Number(key)] = write(copy[Number(key)], i + 1);
      return copy;
    }
    const base =
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)
        : {};
    return { ...base, [key]: write(base[key], i + 1) };
  };
  return write(root, 0) as Record<string, unknown>;
}

/** The three known problems, counted from the demo's own arguments. */
function outsideCount(args: Record<string, unknown>) {
  const items = (args.line_items as { quantity?: unknown }[] | undefined) ?? [];
  let n = 0;
  if (typeof args.amount_due !== "number") n += 1;
  if (typeof args.po_number !== "string" || args.po_number === "") n += 1;
  n += items.filter((i) => !Number.isInteger(i.quantity)).length;
  return n;
}
