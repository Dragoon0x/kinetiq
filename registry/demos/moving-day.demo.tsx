"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultMovingDaySources, MovingDay } from "@/registry/ui/moving-day";

export const tweaks = defineTweaks({
  boxStyle: {
    kind: "choice",
    label: "Box",
    default: "carton",
    options: ["carton", "crate", "tote"],
    names: { carton: "Carton", crate: "Crate", tote: "Tote" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "kraft",
    options: ["kraft", "slate", "cobalt", "mint"],
    names: { kraft: "Kraft", slate: "Slate", cobalt: "Cobalt", mint: "Mint" },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const fmt = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * A harbour crew lead joining Fieldline brings four years of Coldbrook Tasks
 * across: projects, the crew, the files and every comment thread.
 */
export function MovingDayDemo({
  chrome = true,
  // The move is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [source, setSource] = React.useState("coldbrook");
  const [note, setNote] = React.useState<string | null>(null);

  const step = (
    <MovingDay
      key={round}
      source={source}
      onSourceChange={setSource}
      onStart={() => setNote("moving")}
      onPause={() => setNote("paused")}
      onResume={() => setNote("moving")}
      onRetry={(ids) => setNote(`retrying ${ids.length}`)}
      onDone={(s) =>
        setNote(
          `moved ${fmt(s.moved)}${s.stayed.length ? ` · ${s.stayed.length} stayed behind` : ""}`,
        )
      }
      onOpenWorkspace={() => setNote("opening fieldline")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{step}</div>;

  const from = defaultMovingDaySources.find((s) => s.id === source);
  const total = from
    ? Object.values(from.counts).reduce((t, c) => t + c, 0)
    : 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {step}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
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
        <span className="text-signal">{note ?? "ready"}</span> · {fmt(total)}{" "}
        items from {from?.name.toLowerCase() ?? "the old tool"}
      </p>
    </div>
  );
}
