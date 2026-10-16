"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultOfflineShelfCached,
  defaultOfflineShelfFresh,
  defaultOfflineShelfNow,
  OfflineShelf,
  type OfflineShelfItem,
  type OfflineShelfStatus,
} from "@/registry/ui/offline-shelf";

export const tweaks = defineTweaks({
  retryStyle: {
    kind: "choice",
    label: "Wait",
    default: "ring",
    options: ["ring", "bar", "ticks"],
    names: { ring: "Ring", bar: "Bar", ticks: "Ticks" },
  },
  stampStyle: {
    kind: "choice",
    label: "Mark",
    default: "stamp",
    options: ["stamp", "tag", "dim"],
    names: { stamp: "Stamp", tag: "Tag", dim: "Dim" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "quiet",
    options: ["quiet", "amber", "cobalt"],
    names: { quiet: "Quiet", amber: "Amber", cobalt: "Cobalt" },
  },
});

const DELAYS = [4, 8, 16, 30];
const ANSWER_MS = 800;

/**
 * A Fieldline tablet in the North Yard that lost its signal mid-shift. Every
 * attempt is refused after a short wait while the signal is down. With chrome
 * the signal is yours to restore or lose; without it the signal comes back on
 * the second attempt, so the card shows the hand-over.
 */
export function OfflineShelfDemo({
  chrome = true,
  // The shelf is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [status, setStatus] = React.useState<OfflineShelfStatus>("offline");
  const [signal, setSignal] = React.useState(false);
  const [cached, setCached] = React.useState<OfflineShelfItem[]>(
    defaultOfflineShelfCached,
  );
  const [cachedAt, setCachedAt] = React.useState(
    defaultOfflineShelfNow - 2 * 60 * 60_000,
  );
  const [tries, setTries] = React.useState(0);
  const [checking, setChecking] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const signalRef = React.useRef(signal);
  React.useEffect(() => {
    signalRef.current = signal;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const retry = (_cause: "auto" | "manual", attempt: number) =>
    new Promise<void>((resolve, reject) => {
      setChecking(true);
      const up = chrome ? signalRef.current : attempt >= 2;
      timers.current.push(
        window.setTimeout(() => {
          setChecking(false);
          if (up) {
            setStatus("online");
            setNote("back online · 2 new, 1 updated");
            resolve();
          } else {
            setTries(attempt);
            setNote(null);
            reject(new Error("unreachable"));
          }
        }, ANSWER_MS),
      );
    });

  const shelf = (
    <OfflineShelf
      key={round}
      now={defaultOfflineShelfNow}
      cachedAt={cachedAt}
      status={status}
      cachedItems={cached}
      freshItems={defaultOfflineShelfFresh}
      retryDelays={DELAYS}
      onRetry={retry}
      onOpenCached={(item) =>
        setNote(`opened ${item.title.toLowerCase()} · from the cache`)
      }
      onOpen={(item) => setNote(`opened ${item.title.toLowerCase()}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{shelf}</div>;

  const toggleSignal = () => {
    if (signal) {
      setSignal(false);
      if (status === "online") {
        // The device kept what it last saw before the signal went.
        setCached(defaultOfflineShelfFresh);
        setCachedAt(defaultOfflineShelfNow);
        setStatus("offline");
        setTries(0);
      }
      setNote("signal lost");
    } else {
      setSignal(true);
      setNote("signal restored · the next attempt connects");
    }
  };
  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setStatus("offline");
    setSignal(false);
    setCached(defaultOfflineShelfCached);
    setCachedAt(defaultOfflineShelfNow - 2 * 60 * 60_000);
    setTries(0);
    setChecking(false);
    setNote(null);
    setRound((r) => r + 1);
  };
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {shelf}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={signal}
          onClick={toggleSignal}
          className={cn(
            button,
            signal && "border-success/50 text-success hover:text-success",
          )}
        >
          {signal ? "Lose signal" : "Restore signal"}
        </button>
        <button
          type="button"
          aria-disabled={
            status === "online" || cached.length === 0 || undefined
          }
          onClick={() => {
            if (status === "online" || cached.length === 0) return;
            setCached([]);
            setNote("cache emptied");
          }}
          className={button}
        >
          Empty cache
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
        {checking ? (
          <span className="text-signal">checking fieldline</span>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : status === "online" ? (
          <span className="text-signal">online</span>
        ) : (
          <>
            <span className="text-signal">offline</span> ·{" "}
            {tries === 0
              ? `${cached.length} saved on this device`
              : `${tries} failed ${tries === 1 ? "attempt" : "attempts"} · waiting longer`}
          </>
        )}
      </p>
    </div>
  );
}
