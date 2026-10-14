"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countFree,
  defaultSlotSessions,
  defaultSlotValue,
  LastSlot,
  type SlotChange,
  type SlotEvent,
  type SlotStatus,
  type SlotValue,
} from "@/registry/ui/last-slot";

export const tweaks = defineTweaks({
  seatShape: {
    kind: "choice",
    label: "Seats",
    default: "round",
    options: ["round", "square"],
    names: { round: "Round", square: "Square" },
  },
  mapStyle: {
    kind: "choice",
    label: "Map",
    default: "rows",
    options: ["rows", "tables"],
    names: { rows: "Rows", tables: "Tables" },
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
 * Three days of Basinworks Workshops: hold a couple of seats in Wednesday's
 * hand building, then let someone else book one out from under you and take
 * the seat the toast offers.
 */
export function LastSlotDemo({
  chrome = true,
  // The map is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<SlotValue>(defaultSlotValue);
  const [events, setEvents] = React.useState<SlotEvent[]>([]);
  const [status, setStatus] = React.useState<SlotStatus>("ready");
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
      setNote(fail ? "the sessions failed to load" : "reloaded");
    }, 900);
  };

  const onChange = (next: SlotValue, change: SlotChange) => {
    setValue(next);
    setNote(
      change.type === "pick"
        ? `${change.seat} held`
        : change.type === "unpick"
          ? `${change.seat} let go`
          : change.type === "bumped"
            ? `${change.seat} lost`
            : change.type === "moved"
              ? `moved to ${change.seat}`
              : change.type === "released"
                ? "hold expired"
                : "session changed",
    );
  };

  /** Books a seat as someone else: one of yours first, else the scarcest free seat. */
  const someoneBooks = () => {
    const taken = (sessionId: string) =>
      new Set(
        events.filter((e) => e.sessionId === sessionId).map((e) => e.seatId),
      );
    const chosen = defaultSlotSessions.find((s) => s.id === value.sessionId);
    const mine = chosen
      ? value.seats.find((id) => !taken(chosen.id).has(id))
      : undefined;
    let sessionId = chosen?.id ?? null;
    let seatId = mine ?? null;
    if (!seatId) {
      const open = defaultSlotSessions
        .map((s) => ({ s, free: countFree(s, events) }))
        .filter(
          ({ s, free }) =>
            free - (s.id === value.sessionId ? value.seats.length : 0) > 0,
        )
        .sort((a, b) => a.free - b.free);
      const pick = open[0];
      if (!pick) {
        setNote("every seat is taken");
        return;
      }
      sessionId = pick.s.id;
      const sold = taken(pick.s.id);
      seatId =
        pick.s.seats.find(
          (seat) =>
            !seat.taken &&
            !sold.has(seat.id) &&
            !(pick.s.id === value.sessionId && value.seats.includes(seat.id)),
        )?.id ?? null;
    }
    if (!sessionId || !seatId) return;
    const id = `ev-${events.length + 1}`;
    setEvents((list) => [...list, { id, sessionId, seatId }]);
    setNote(`${seatId} booked elsewhere`);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <LastSlot height={548} {...values} />
      </div>
    );
  }

  const session = defaultSlotSessions.find((s) => s.id === value.sessionId);
  const left = session
    ? Math.max(0, countFree(session, events) - value.seats.length)
    : 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <LastSlot
        height={520}
        value={value}
        onChange={onChange}
        events={events}
        status={status}
        onRetry={() => {
          const fail = failNext;
          setFailNext(false);
          load(fail);
        }}
        onConfirm={(v) => setNote(`booked ${v.seats.join(", ")}`)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {value.seats.length === 0
              ? "nothing held"
              : `holding ${value.seats.join(", ")}`}
          </span>{" "}
          ·{" "}
          {session
            ? `${left} left in ${session.title.toLowerCase()}`
            : "no session"}
          {note ? ` · ${note}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={someoneBooks}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Someone books a seat
          </button>
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
              setValue(defaultSlotValue);
              setEvents([]);
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
