"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultFirstEventNow,
  FirstEvent,
  type FirstEventPoint,
} from "@/registry/ui/first-event";

export const tweaks = defineTweaks({
  pulseStyle: {
    kind: "choice",
    label: "Pulse",
    default: "rings",
    options: ["rings", "sweep", "dot"],
    names: { rings: "Rings", sweep: "Sweep", dot: "Dot" },
  },
  axisStyle: {
    kind: "choice",
    label: "Axes",
    default: "grid",
    options: ["grid", "ticks", "bare"],
    names: { grid: "Grid", ticks: "Ticks", bare: "Bare" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const MIN = 60_000;
const SINCE = defaultFirstEventNow - 4 * MIN;
/** Signups per minute after the deploy: a slow start that finds its feet. */
const COUNTS = [1, 2, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8];
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * Waylight's web app has just been wired up and the engineer is waiting for
 * the first signup. Check now (inside the panel) is answered by the first
 * event, then a reading a second for a dozen minutes of simulated time, so
 * the gallery card plays the arrival on a press.
 */
export function FirstEventDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [now, setNow] = React.useState(defaultFirstEventNow);
  const [events, setEvents] = React.useState<FirstEventPoint[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  const streaming = React.useRef(false);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    streaming.current = false;
  };
  React.useEffect(() => clear, []);

  const minutes = Math.floor((now - SINCE) / MIN);
  const waiting = events.length === 0;

  // Simulated minutes pass while listening, until the panel times out.
  React.useEffect(() => {
    if (!chrome || !waiting || minutes >= 15) return;
    const t = window.setTimeout(() => setNow((n) => n + MIN), 3000);
    return () => window.clearTimeout(t);
  }, [chrome, waiting, minutes]);

  const stream = (from: number) => {
    if (streaming.current) return;
    streaming.current = true;
    COUNTS.forEach((count, i) => {
      timers.current.push(
        window.setTimeout(
          () => {
            const at = from + i * MIN;
            setEvents((list) => [...list, { at, count }]);
            setNow(at + 30_000);
            setNote(
              i === 0
                ? `first event · signup at ${clock(at)}`
                : `${i + 1} minutes of signups · line drawing`,
            );
          },
          i === 0 ? 0 : i * 1000,
        ),
      );
    });
  };

  const panel = (
    <FirstEvent
      key={round}
      now={now}
      listeningSince={SINCE}
      events={events}
      onCheckNow={() =>
        new Promise<void>((resolve) => {
          timers.current.push(
            window.setTimeout(() => {
              resolve();
              if (events.length === 0) stream(now);
            }, 700),
          );
        })
      }
      onCopy={(id) => setNote(`copied step ${id}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  const reset = () => {
    clear();
    setEvents([]);
    setNow(defaultFirstEventNow);
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
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={!waiting || undefined}
          onClick={() => {
            if (waiting) stream(now);
          }}
          className={button}
        >
          Send test event
        </button>
        <button
          type="button"
          aria-disabled={!waiting || minutes >= 15 || undefined}
          onClick={() => {
            if (waiting && minutes < 15) setNow(SINCE + 15 * MIN);
          }}
          className={button}
        >
          Skip to timeout
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
        {note ? (
          <span className="text-signal">{note}</span>
        ) : minutes >= 15 ? (
          <>
            <span className="text-signal">no events after 15 min</span> · check
            the list
          </>
        ) : (
          <>
            <span className="text-signal">listening · {minutes} min</span> ·
            waiting for the first signup
          </>
        )}
      </p>
    </div>
  );
}
