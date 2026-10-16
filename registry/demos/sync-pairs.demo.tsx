"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSyncLeftFields,
  defaultSyncPairs,
  defaultSyncRightFields,
  SyncPairs,
  type SyncDirection,
  type SyncPair,
} from "@/registry/ui/sync-pairs";

export const tweaks = defineTweaks({
  cableStyle: {
    kind: "choice",
    label: "Cables",
    default: "soft",
    options: ["soft", "taut", "dashed"],
    names: { soft: "Soft", taut: "Taut", dashed: "Dashed" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "moss", "plum", "ember"],
    names: { cobalt: "Cobalt", moss: "Moss", plum: "Plum", ember: "Ember" },
  },
});

const name = (side: "left" | "right", id: string) =>
  (
    (side === "left" ? defaultSyncLeftFields : defaultSyncRightFields).find(
      (f) => f.id === id,
    )?.name ?? id
  ).toLowerCase();
const ARROW: Record<SyncDirection, string> = {
  right: "→",
  left: "←",
  both: "⇄",
};

/**
 * Coldbrook CRM contacts syncing into Fernworks Desk requesters. Five fields
 * are paired; the phone number loses its formatting on the way. Drag Plan to
 * Tier, or press a cable's knot to turn it around.
 */
export function SyncPairsDemo({
  chrome = true,
  // The mapping is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pairs, setPairs] = React.useState<SyncPair[]>(defaultSyncPairs);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const mapping = (
    <SyncPairs
      key={run}
      pairs={pairs}
      onPairsChange={setPairs}
      onPair={(p) =>
        setNote(
          `paired ${name("left", p.left)} ${ARROW[p.direction]} ${name("right", p.right)}`,
        )
      }
      onUnpair={(p) => setNote(`unpaired ${name("left", p.left)}`)}
      onDirectionChange={(p, d) =>
        setNote(
          `${name("left", p.left)} ${ARROW[d]} ${name("right", p.right)} · ${d === "both" ? "both ways" : "one way"}`,
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{mapping}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {mapping}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPairs(defaultSyncPairs);
            setNote(null);
            setRun((r) => r + 1);
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
          {note ?? `${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"}`}
        </span>
        {note
          ? ` · ${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"}`
          : null}
      </p>
    </div>
  );
}
