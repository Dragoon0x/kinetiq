"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CallbackQueue,
  defaultQueue,
  defaultQueueAgents,
  defaultQueueNow,
  type CallbackQueueStatus,
  type QueueAgent,
  type QueueSnapshot,
} from "@/registry/ui/callback-queue";

export const tweaks = defineTweaks({
  tokenStyle: {
    kind: "choice",
    label: "Tokens",
    default: "dots",
    options: ["dots", "tickets", "lane"],
    names: { dots: "Dots", tickets: "Tickets", lane: "Lane" },
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
    options: ["cobalt", "jade", "amber", "mono"],
    names: { cobalt: "Cobalt", jade: "Jade", amber: "Amber", mono: "Mono" },
  },
});

const MIN = 60_000;
/** 21:40, after the lines close at 20:00. */
const EVENING = Date.UTC(2026, 9, 15, 21, 40);

/**
 * Coldbrook Bank's live chat on a Thursday afternoon: four people ahead of
 * you, three agents on chats and one on a break. The line moves every few
 * seconds while the demo is on screen, and only then.
 */
export function CallbackQueueDemo({
  chrome = true,
  // The queue is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [queue, setQueue] = React.useState<QueueSnapshot>(defaultQueue);
  const [agents, setAgents] = React.useState<QueueAgent[]>(defaultQueueAgents);
  const [status, setStatus] = React.useState<CallbackQueueStatus>("open");
  const [minutes, setMinutes] = React.useState(0);
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const [away, setAway] = React.useState(false);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.3 });
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const queueRef = React.useRef(queue);
  React.useEffect(() => {
    queueRef.current = queue;
  });
  const next = React.useCallback(() => {
    const q = queueRef.current;
    const position = Math.max(0, q.position - 1);
    const moved = {
      ...q,
      position,
      // Someone usually joins behind you as the front is served.
      waiting: Math.max(position, q.waiting - 1 + (q.position % 2)),
    };
    queueRef.current = moved;
    setQueue(moved);
    setMinutes((m) => m + 2);
    // Your turn comes when an agent frees up.
    if (position === 0)
      setAgents((list) =>
        list.map((a) => (a.id === "lou" ? { ...a, status: "free" } : a)),
      );
  }, []);

  const reset = React.useCallback(() => {
    setQueue(defaultQueue);
    setAgents(defaultQueueAgents);
    setStatus("open");
    setMinutes(0);
    setNote(null);
    setAway(false);
    setRound((r) => r + 1);
  }, []);

  // The line moves only while someone can see it, and stops for anyone
  // who has stepped out of it.
  const live = inView && visible && status === "open" && !away;
  React.useEffect(() => {
    if (!live || queue.position === 0) return;
    const t = window.setTimeout(next, chrome ? 5200 : 3600);
    return () => window.clearTimeout(t);
  }, [live, queue.position, next, chrome]);

  // The gallery card starts over a while after your turn comes.
  React.useEffect(() => {
    if (chrome || !inView || queue.position !== 0) return;
    const t = window.setTimeout(reset, 5000);
    return () => window.clearTimeout(t);
  }, [chrome, inView, queue.position, reset]);

  const surface = (
    <CallbackQueue
      key={round}
      queue={queue}
      agents={agents}
      status={status}
      now={status === "closed" ? EVENING : defaultQueueNow + minutes * MIN}
      onRequestCallback={({ slot }) =>
        new Promise<void>((resolve) =>
          window.setTimeout(() => {
            setNote(`callback ${slot.at === null ? "soonest" : slot.label}`);
            setAway(true);
            resolve();
          }, 500),
        )
      }
      onCancelCallback={() => {
        setNote("callback cancelled");
        setAway(false);
      }}
      onLeave={() => {
        setNote("left the queue");
        setAway(true);
      }}
      onRejoin={() => {
        setNote("rejoined");
        setAway(false);
      }}
      onJoinChat={() => setNote("chat opened with lou")}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const ordinal = (n: number) =>
    `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

  return (
    <div ref={frame} className="flex w-full max-w-md flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={queue.position === 0 || undefined}
          onClick={() => {
            if (queue.position > 0) next();
          }}
          className={cn(
            button,
            queue.position === 0 && "cursor-not-allowed opacity-60",
          )}
        >
          Next in line
        </button>
        <button
          type="button"
          aria-pressed={status === "closed"}
          onClick={() => setStatus((s) => (s === "closed" ? "open" : "closed"))}
          className={button}
        >
          Close hours
        </button>
        <button
          type="button"
          aria-pressed={status === "full"}
          onClick={() => {
            setStatus((s) => (s === "full" ? "open" : "full"));
            setQueue((q) => ({ ...q, waiting: status === "full" ? 9 : 24 }));
          }}
          className={button}
        >
          Fill queue
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (status === "closed"
              ? "closed · opens 08:00"
              : status === "full"
                ? "queue full · callbacks open"
                : queue.position === 0
                  ? "your turn · join chat"
                  : `${ordinal(queue.position)} in line`)}
        </span>{" "}
        · coldbrook live chat
      </p>
    </div>
  );
}
