"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BlastRadius,
  defaultBlastEdges,
  defaultBlastNow,
  defaultBlastServices,
  type BlastStatus,
} from "@/registry/ui/blast-radius";

export const tweaks = defineTweaks({
  layoutDirection: {
    kind: "choice",
    label: "Layout",
    default: "right",
    options: ["right", "down"],
    names: { right: "Across", down: "Down" },
  },
  ringSpeed: {
    kind: "range",
    label: "Hop time",
    default: 400,
    min: 200,
    max: 900,
    step: 100,
    unit: "ms",
  },
  nodeShape: {
    kind: "choice",
    label: "Nodes",
    default: "pill",
    options: ["pill", "dot", "card"],
    names: { pill: "Pill", dot: "Dot", card: "Card" },
  },
});

const MIN = 60_000;

/** How far a fall reaches: every caller, hop by hop. */
function reachOf(id: string) {
  const hops = new Map([[id, 0]]);
  let frontier = [id];
  let hop = 0;
  while (frontier.length > 0) {
    hop += 1;
    const next: string[] = [];
    for (const f of frontier) {
      for (const e of defaultBlastEdges) {
        if (e.to === f && !hops.has(e.from)) {
          hops.set(e.from, hop);
          next.push(e.from);
        }
      }
    }
    frontier = next;
  }
  return { n: hops.size - 1, hops: Math.max(...hops.values()) };
}

/**
 * The Waylight platform at a quarter past nine: Basinworks queue has stopped
 * accepting work. The map opens on it, so the blast walks up through billing
 * and notify to the API and both front ends as the card comes into view.
 */
export function BlastRadiusDemo({
  chrome = true,
  // The map is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>("queue");
  const [status, setStatus] = React.useState<BlastStatus>("ready");
  const [updatedAt, setUpdatedAt] = React.useState(defaultBlastNow - 6 * MIN);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const refresh = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    timer.current = window.setTimeout(() => {
      if (fail) {
        setStatus("error");
        setFailNext(false);
      } else {
        setStatus("ready");
        setUpdatedAt(defaultBlastNow);
      }
    }, 1200);
  };

  const surface = (
    <BlastRadius
      key={round}
      value={selected}
      onValueChange={setSelected}
      onSelect={() => setNote(null)}
      onAcknowledge={(service) =>
        setNote(`acknowledged ${service.name.toLowerCase()}`)
      }
      onOpenRunbook={(service) =>
        setNote(`runbook · ${service.name.toLowerCase()}`)
      }
      status={status}
      updatedAt={updatedAt}
      now={defaultBlastNow}
      onRetry={refresh}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const source = defaultBlastServices.find((s) => s.id === selected);
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
            if (status !== "loading") refresh();
          }}
          // Stays focusable while it works: a disabled button drops focus.
          aria-disabled={status === "loading" || undefined}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Refresh
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next refresh
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setSelected("queue");
            setStatus("ready");
            setUpdatedAt(defaultBlastNow - 6 * MIN);
            setFailNext(false);
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
        {status === "loading" ? (
          <span className="text-signal">refreshing the map</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">refresh failed</span> · map from{" "}
            {Math.round((defaultBlastNow - updatedAt) / MIN)} min ago
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : source ? (
          <>
            <span className="text-signal">
              {source.health === "down"
                ? `${source.name.toLowerCase()} down`
                : `what if ${source.name.toLowerCase()} falls over`}
            </span>
            {(() => {
              const r = reachOf(source.id);
              return ` · ${r.n} impacted · ${r.hops} ${r.hops === 1 ? "hop" : "hops"}`;
            })()}
          </>
        ) : (
          <>
            <span className="text-signal">no service selected</span> ·{" "}
            {defaultBlastServices.length} services
          </>
        )}
      </p>
    </div>
  );
}
