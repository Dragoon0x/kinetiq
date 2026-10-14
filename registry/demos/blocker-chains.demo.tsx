"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BlockerChains,
  blockersOf,
  defaultChainDone,
  defaultChainTasks,
  unblockedNow,
  type ChainBlockers,
  type ChainStatus,
} from "@/registry/ui/blocker-chains";

export const tweaks = defineTweaks({
  chainStyle: {
    kind: "choice",
    label: "Chains",
    default: "chain",
    options: ["chain", "line", "dots"],
    names: { chain: "Chain", line: "Line", dots: "Dots" },
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
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Success" },
  },
});

/**
 * Basinworks Builds' fit-out of the Coldbrook unit: the slab is poured, the
 * walls wait on it, the kitchen waits on an order, and two fixture tasks
 * wait on each other.
 */
export function BlockerChainsDemo({
  chrome = true,
  // The list is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [done, setDone] = React.useState<string[]>(defaultChainDone);
  const [chains, setChains] = React.useState<ChainBlockers>(() =>
    blockersOf(defaultChainTasks),
  );
  const [status, setStatus] = React.useState<ChainStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setNote(fail ? "load failed" : "loaded");
    }, 900);
  };

  const surface = (
    <BlockerChains
      key={round}
      height={chrome ? 560 : 540}
      value={done}
      onChange={(next, change) => {
        setDone(next);
        const task = defaultChainTasks.find((t) => t.id === change.id);
        setNote(
          `${task?.ref ?? change.id} ${change.to}${
            change.unblocked.length
              ? ` · unblocked ${change.unblocked.length}`
              : ""
          }`,
        );
      }}
      blockers={chains}
      onBlockersChange={(next, change) => {
        setChains(next);
        const task = defaultChainTasks.find((t) => t.id === change.id);
        const blocker = defaultChainTasks.find((t) => t.id === change.blocker);
        setNote(
          `${change.to === "added" ? "chained" : "unchained"} ${task?.ref ?? change.id} ${
            change.to === "added" ? "to" : "from"
          } ${blocker?.ref ?? change.blocker}`,
        );
      }}
      status={status}
      onRetry={load}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const ready = unblockedNow(defaultChainTasks, chains, done).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={load} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setDone(defaultChainDone);
            setChains(blockersOf(defaultChainTasks));
            setStatus("ready");
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
        <span className="text-signal">{note ?? `${ready} can start now`}</span>{" "}
        · {done.length} of {defaultChainTasks.length} done
      </p>
    </div>
  );
}
