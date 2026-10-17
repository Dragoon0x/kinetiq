"use client";

import * as React from "react";

import { Eraser, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTilingLayout,
  defaultTilingRecords,
  TilingDesk,
  tilingLeaves,
  type TilingNode,
} from "@/registry/ui/tiling-desk";

export const tweaks = defineTweaks({
  gap: {
    kind: "range",
    label: "Gap",
    default: 8,
    min: 0,
    max: 16,
    step: 2,
    unit: "px",
  },
  splitRule: {
    kind: "choice",
    label: "Split",
    default: "longest",
    options: ["longest", "alternate", "spiral"],
    names: { longest: "Longest", alternate: "Alternate", spiral: "Spiral" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const BUTTON = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
  "hover:bg-surface-2 hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

const titleOf = (id: string | null) =>
  defaultTilingRecords.find((r) => r.id === id)?.title.toLowerCase() ??
  "nothing";

/**
 * A Basinworks dispatcher’s desk: an order being packed, its customer and
 * yesterday’s shipment, with the rest of the morning’s records a click away.
 */
export function TilingDeskDemo({
  chrome = true,
  // The desk is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [layout, setLayout] = React.useState<TilingNode | null>(
    defaultTilingLayout,
  );
  const [focused, setFocused] = React.useState<string | null>("order-3195");
  const [event, setEvent] = React.useState<string | null>(null);
  const count = tilingLeaves(layout).length;

  const surface = (
    <TilingDesk
      key={round}
      layout={layout}
      onLayoutChange={setLayout}
      focused={focused}
      onFocusChange={setFocused}
      onOpenRecord={(r) => setEvent(`opened ${r.title.toLowerCase()}`)}
      onCloseWindow={(id) => setEvent(`closed ${titleOf(id)}`)}
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
            setLayout(null);
            setFocused(null);
            setEvent("desk cleared");
          }}
          className={BUTTON}
        >
          <Eraser aria-hidden className="size-3.5" />
          Clear desk
        </button>
        <button
          type="button"
          onClick={() => {
            setLayout(defaultTilingLayout);
            setFocused("order-3195");
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={BUTTON}
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
          {`${count} window${count === 1 ? "" : "s"}`}
        </span>
        {` · ${event ?? `focus ${titleOf(focused)}`}`}
      </p>
    </div>
  );
}
