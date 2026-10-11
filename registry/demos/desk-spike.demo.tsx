"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { DeskSpike } from "@/registry/ui/desk-spike";

export const tweaks = defineTweaks({
  slips: {
    kind: "choice",
    label: "Slips",
    default: "orders",
    options: ["orders", "messages", "wire", "receipts"],
    names: {
      orders: "Orders",
      messages: "Messages",
      wire: "Wire",
      receipts: "Receipts",
    },
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "white",
    options: ["white", "canary", "pink", "mixed"],
    names: { white: "White", canary: "Canary", pink: "Pink", mixed: "Mixed" },
  },
});

const COUNTS: Record<string, number> = {
  orders: 5,
  messages: 4,
  wire: 4,
  receipts: 4,
};

/**
 * Coldbrook Café's counter: the order tickets go on the spike as they are
 * made, and the barista tears the top one off to read the next.
 */
export function DeskSpikeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const set = values.slips ?? "orders";
  const total = COUNTS[set] ?? 4;
  const [torn, setTorn] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);
  // A different stack of notes goes on the spike whole.
  const [seen, setSeen] = React.useState(set);
  if (seen !== set) {
    setSeen(set);
    setTorn(0);
    setLast(null);
  }

  const spike = (
    <DeskSpike
      value={torn}
      onValueChange={(next) => {
        if (next < torn) setLast(null);
        setTorn(next);
      }}
      onTear={(slip) => setLast(slip.title)}
      onRestore={() => setLast(null)}
      sound={sound}
      label="Coldbrook order spike"
      className={cn("w-full rounded-3", chrome ? "h-[29rem]" : "h-[34rem]")}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{spike}</div>;

  const left = total - torn;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {spike}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {left === 0 ? (
            <>
              <span className="text-signal">spike clear</span> · click to refill
            </>
          ) : last ? (
            <>
              <span className="text-signal">torn</span> · {last} · {left} left
            </>
          ) : (
            <>
              <span className="text-signal">{left} on the spike</span> · click
              to tear
            </>
          )}
        </p>
        <button
          type="button"
          disabled={torn === 0}
          onClick={() => {
            setTorn((t) => Math.max(0, t - 1));
            setLast(null);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50"
        >
          Put back
        </button>
      </div>
    </div>
  );
}
