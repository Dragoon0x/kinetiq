"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultOpenDayDate,
  defaultOpenDayEvents,
  OpenDay,
  type OpenDayChange,
  type OpenDayEvent,
  type OpenDayStatus,
} from "@/registry/ui/open-day";

export const tweaks = defineTweaks({
  span: {
    kind: "choice",
    label: "Hours",
    default: "work",
    options: ["work", "day", "full"],
    names: { work: "Work", day: "Day", full: "Full" },
  },
  wash: {
    kind: "choice",
    label: "Wash",
    default: "sun",
    options: ["sun", "plain", "ink"],
    names: { sun: "Sun", plain: "Plain", ink: "Ink" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * A Tuesday on the Basinworks calendar with nothing on it: lay in the three
 * suggested blocks, draw more on the hours, and clear them to open it again.
 */
export function OpenDayDemo({
  chrome = true,
  // The day is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [events, setEvents] =
    React.useState<OpenDayEvent[]>(defaultOpenDayEvents);
  const [date, setDate] = React.useState(defaultOpenDayDate);
  const [status, setStatus] = React.useState<OpenDayStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setNote(fail ? "the day failed to load" : "reloaded");
    }, 900);
  };

  const onChange = (next: OpenDayEvent[], change: OpenDayChange) => {
    setEvents(next);
    setNote(
      change.type === "add"
        ? `${change.event.title.toLowerCase()} added`
        : `${change.event.title.toLowerCase()} removed`,
    );
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <OpenDay height={548} {...values} />
      </div>
    );
  }

  const onDay = events.filter((e) => e.day === date).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <OpenDay
        height={520}
        date={date}
        onDateChange={setDate}
        events={events}
        onChange={onChange}
        status={status}
        onRetry={() => {
          const fail = failNext;
          setFailNext(false);
          load(fail);
        }}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {onDay === 0
              ? "open"
              : `${onDay} ${onDay === 1 ? "block" : "blocks"}`}
          </span>{" "}
          · {events.length} on the calendar
          {note ? ` · ${note}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const fail = failNext;
              setFailNext(false);
              load(fail);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              if (timer.current !== null) window.clearTimeout(timer.current);
              timer.current = null;
              setEvents(defaultOpenDayEvents);
              setDate(defaultOpenDayDate);
              setStatus("ready");
              setFailNext(false);
              setNote(null);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
