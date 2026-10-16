"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { OpenDay, type DayBlock } from "@/registry/ui/open-day";

export const tweaks = defineTweaks({
  hourHeight: {
    kind: "range",
    label: "Hour",
    default: 40,
    min: 28,
    max: 56,
    step: 4,
    unit: "px",
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "soft",
    options: ["soft", "outline", "solid"],
    names: { soft: "Soft", outline: "Outline", solid: "Solid" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "warm", "mono"],
    names: { calm: "Calm", warm: "Warm", mono: "Mono" },
  },
});

const SAVE_MS = 500;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const length = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

/**
 * A Fieldline designer's Thursday with nothing on it yet. Drag a suggestion
 * onto the day, or focus one and press Enter. Fail next save shows a block
 * that landed but didn't reach the calendar.
 */
export function OpenDayDemo({
  chrome = true,
  // The day is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [blocks, setBlocks] = React.useState<DayBlock[]>([]);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const place = (block: DayBlock) =>
    new Promise<void>((resolve, reject) => {
      const fail = failRef.current;
      failRef.current = false;
      if (fail) setFailNext(false);
      timers.current.push(
        window.setTimeout(() => {
          if (fail) {
            setNote(`sync failed · ${block.label.toLowerCase()} unsaved`);
            reject(new Error("sync failed"));
            return;
          }
          setNote(
            `placed ${block.label.toLowerCase()} ${clock(block.start)}–${clock(block.end)}`,
          );
          resolve();
        }, SAVE_MS),
      );
    });

  const day = (
    <OpenDay
      key={run}
      value={blocks}
      onValueChange={setBlocks}
      onPlace={place}
      onRemove={(b) => setNote(`removed ${b.label.toLowerCase()}`)}
      onDismiss={(s) => setNote(`dismissed ${s.label.toLowerCase()}`)}
      onRetry={() => setNote("retrying the sync")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{day}</div>;

  const booked = blocks.reduce((sum, b) => sum + (b.end - b.start) / 60_000, 0);
  const open = Math.max(0, 8 * 60 - booked);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {day}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext((v) => !v);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next save
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            failRef.current = false;
            setBlocks([]);
            setFailNext(false);
            setNote(null);
            setRun((r) => r + 1);
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
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {length(open)} open
          </>
        ) : (
          <>
            <span className="text-signal">
              {blocks.length ? `${blocks.length} placed` : "nothing booked"}
            </span>{" "}
            · {length(open)} open
          </>
        )}
      </p>
    </div>
  );
}
