"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AddressCascade,
  filterCascadeSuggestions,
  type CascadeSuggestion,
} from "@/registry/ui/address-cascade";

export const tweaks = defineTweaks({
  fieldStyle: {
    kind: "choice",
    label: "Fields",
    default: "boxed",
    options: ["boxed", "line", "filled"],
    names: { boxed: "Boxed", line: "Line", filled: "Filled" },
  },
  columns: {
    kind: "range",
    label: "Columns",
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
  staggerSpeed: {
    kind: "range",
    label: "Stagger",
    default: 70,
    min: 30,
    max: 110,
    step: 10,
    unit: "ms",
  },
});

/**
 * Coldbrook Roasters' checkout, the delivery step. Type "fern" and pick a
 * suggestion; "Slow lookup" shows the quiet spinner and "Fail lookup" the
 * fall-back to manual entry.
 */
export function AddressCascadeDemo({
  chrome = true,
  // The cascade is seen, not heard.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [slow, setSlow] = React.useState(false);
  const [fail, setFail] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "delivery",
    rest: "type a street or postcode",
  });

  const suggest = (query: string) => {
    setLine({ lead: "looking up", rest: `“${query.toLowerCase()}”` });
    if (fail)
      return new Promise<CascadeSuggestion[]>((_, reject) =>
        window.setTimeout(() => {
          setLine({ lead: "lookup failed", rest: "manual entry" });
          reject(new Error("timeout"));
        }, 600),
      );
    const found = filterCascadeSuggestions(query);
    if (!slow) return found;
    return new Promise<CascadeSuggestion[]>((resolve) =>
      window.setTimeout(() => resolve(found), 900),
    );
  };

  const form = (
    <AddressCascade
      key={round}
      onSuggest={suggest}
      onPick={(s) => {
        const n = Object.values(s.values).filter(Boolean).length;
        setLine({
          lead: s.label.toLowerCase(),
          rest: `${n} ${n === 1 ? "field" : "fields"} filled`,
        });
      }}
      onSubmit={(v) => {
        setLine({
          lead: "saved",
          rest: `${v.city ?? ""} ${v.postcode ?? ""}`.trim().toLowerCase(),
        });
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  const toggle = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
      "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
      on && "border-hairline-strong bg-surface-2 text-foreground",
    );

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {form}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={slow}
          onClick={() => setSlow((v) => !v)}
          className={toggle(slow)}
        >
          Slow lookup
        </button>
        <button
          type="button"
          aria-pressed={fail}
          onClick={() => setFail((v) => !v)}
          className={cn(toggle(fail), fail && "border-danger/50 text-danger")}
        >
          Fail lookup
        </button>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setLine({ lead: "delivery", rest: "type a street or postcode" });
          }}
          className={toggle(false)}
        >
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
