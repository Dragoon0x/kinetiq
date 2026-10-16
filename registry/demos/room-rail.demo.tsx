"use client";

import * as React from "react";

import { Pause, Play, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRailBookings,
  defaultRailRooms,
  RoomRail,
  type RailBooking,
} from "@/registry/ui/room-rail";

export const tweaks = defineTweaks({
  rowHeight: {
    kind: "range",
    label: "Rows",
    default: 56,
    min: 40,
    max: 72,
    step: 4,
    unit: "px",
  },
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "soft",
    options: ["soft", "solid", "outline"],
    names: { soft: "Soft", solid: "Solid", outline: "Outline" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Iris",
    },
  },
});

const START = 620;
const TICK_MS = 1200;

const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const roomName = (id: string) =>
  (defaultRailRooms.find((r) => r.id === id)?.name ?? id).toLowerCase();

/**
 * The Basinworks office on Thursday morning. A simulated clock moves a minute
 * every 1.2 seconds, only while the rail is on screen and the page visible;
 * the now-line sweeps with it.
 */
export function RoomRailDemo({
  chrome = true,
  // The rail is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bookings, setBookings] =
    React.useState<RailBooking[]>(defaultRailBookings);
  const [now, setNow] = React.useState(START);
  const [playing, setPlaying] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);

  // The clock only runs while someone can see it.
  React.useEffect(() => {
    const node = ref.current;
    if (!node || !playing) return;
    let visible = false;
    let timer = 0;
    const tick = () => setNow((n) => (n >= 18 * 60 ? START : n + 1));
    const sync = () => {
      window.clearInterval(timer);
      timer = 0;
      if (visible && !document.hidden)
        timer = window.setInterval(tick, TICK_MS);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, [playing, run]);

  const rail = (
    <RoomRail
      key={run}
      bookings={bookings}
      onBookingsChange={setBookings}
      now={now}
      onBook={(d) =>
        setNote(
          `booked · ${roomName(d.roomId)} ${clock(d.start)}–${clock(d.end)}`,
        )
      }
      onExtend={(b, end) =>
        setNote(`extended · ${roomName(b.room)} to ${clock(end)}`)
      }
      onRelease={(b) =>
        setNote(`released · ${roomName(b.room)} at ${clock(b.end)}`)
      }
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full">
        {rail}
      </div>
    );
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const inUse = new Set(
    bookings.filter((b) => b.start <= now && now < b.end).map((b) => b.room),
  );
  const open = defaultRailRooms.filter(
    (r) => !r.outOfService && !inUse.has(r.id),
  ).length;

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {rail}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!playing}
          onClick={() => setPlaying((p) => !p)}
          className={button}
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
          {playing ? "Pause clock" : "Play clock"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBookings(defaultRailBookings);
            setNow(START);
            setNote(null);
            setPlaying(true);
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
            <span className="text-signal">{note}</span> · {clock(now)}
          </>
        ) : (
          <>
            <span className="text-signal">{clock(now)}</span> · {open} of{" "}
            {defaultRailRooms.length} rooms free now
          </>
        )}
      </p>
    </div>
  );
}
