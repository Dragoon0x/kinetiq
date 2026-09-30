"use client";

import * as React from "react";

import { QueueDepth, type PendingDeploy } from "@/registry/ui/queue-depth";

/** Coldbrook's deploy queue: five waiting, two of them the same service. */
const SEED: PendingDeploy[] = (
  [
    ["d1", "ledger-api", "4f2c", "Rill", 240],
    ["d2", "dock-worker", "91ab", "Perez", 180],
    ["d3", "dock-worker", "7c30", "Perez", 150],
    ["d4", "gate-relay", "22e8", "Okafor", 95],
    ["d5", "ledger-api", "b104", "Rill", 40],
  ] as [string, string, string, string, number][]
).map(([id, service, change, author, waitedSeconds]) => ({
  id,
  service,
  change,
  author,
  waitedSeconds,
}));

const TOTAL = 20;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function QueueDepthDemo() {
  const [pending, setPending] = React.useState(SEED);
  // Seeded with the queue's own order so the first paint reads 4 waiting
  // rather than none; the component confirms it on its first commit.
  const [order, setOrder] = React.useState<string[]>(() =>
    SEED.map((deploy) => deploy.id),
  );
  const [merged, setMerged] = React.useState<Record<string, string[]>>({});
  const [seconds, setSeconds] = React.useState(TOTAL);
  const [running, setRunning] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  // The order and the merges are the queue's own state, so Reset remounts it.
  const [round, setRound] = React.useState(0);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The head ships when its countdown runs out, taking anything merged into it.
  // A hidden tab throttles timers, so the clock holds rather than shipping the
  // whole queue the moment it comes back.
  React.useEffect(() => {
    if (!running || held || hidden || pending.length === 0) return;
    const timer = window.setTimeout(() => {
      if (seconds > 1) {
        setSeconds(seconds - 1);
        return;
      }
      const headId = order[0];
      const gone = new Set(headId ? [headId, ...(merged[headId] ?? [])] : []);
      setPending((queue) => queue.filter((deploy) => !gone.has(deploy.id)));
      setMerged((folds) =>
        Object.fromEntries(
          Object.entries(folds).filter(([into]) => into !== headId),
        ),
      );
      setSeconds(TOTAL);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [running, held, hidden, seconds, order, merged, pending.length]);

  const head = pending.find((deploy) => deploy.id === order[0]);
  const pristine =
    pending.length === SEED.length &&
    seconds === TOTAL &&
    order.join() === SEED.map((deploy) => deploy.id).join();

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QueueDepth
        key={round}
        label="Coldbrook deploy queue"
        deploys={pending}
        headSeconds={seconds}
        headTotalSeconds={TOTAL}
        held={held}
        onHeldChange={setHeld}
        onQueueChange={setOrder}
        onMerge={(into, from) =>
          setMerged((folds) => ({
            ...folds,
            [into]: [...(folds[into] ?? []), from],
          }))
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={pending.length === 0}
          onClick={() => setRunning(!running)}
        >
          {running ? "Pause queue" : "Run queue"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={pristine}
          onClick={() => {
            setRunning(false);
            setPending(SEED);
            setMerged({});
            setSeconds(TOTAL);
            setRound((count) => count + 1);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{order.length} waiting</span>
        {head ? ` · head ${head.service} ${head.change}` : ""}
        {held ? " · held" : head ? ` · ${seconds} s` : ""}
      </p>
    </div>
  );
}
