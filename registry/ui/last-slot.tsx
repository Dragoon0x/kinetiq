"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Armchair,
  ArrowRight,
  Hourglass,
  RotateCcw,
  Ticket,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SlotSeat = {
  /** The seat's name on the map, e.g. "B3". */
  id: string;
  /** Its row on the map, from 0. */
  row: number;
  /** Its column on the map, from 0. */
  col: number;
  /** Already booked when the session arrived. @default false */
  taken?: boolean;
};

export type SlotSession = {
  id: string;
  /** The day, "YYYY-MM-DD". */
  day: string;
  /** Start, in minutes from midnight. */
  start: number;
  /** Length, in minutes. */
  length: number;
  title: string;
  host: string;
  /** The map's shape; seats sit on it by row and column. */
  rows: number;
  cols: number;
  seats: SlotSeat[];
};

/** A seat booked elsewhere. Applied when it arrives: the seat flips to taken. */
export type SlotEvent = {
  id: string;
  sessionId: string;
  seatId: string;
};

/** The chosen session and the seats held in it. */
export type SlotValue = { sessionId: string | null; seats: string[] };

export type SlotChangeType =
  "session" | "pick" | "unpick" | "bumped" | "moved" | "released";

export type SlotChange = {
  type: SlotChangeType;
  sessionId: string | null;
  /** The seat picked, released, lost or moved to. */
  seat?: string;
  /** The seats released by a session change or an expired hold. */
  seats?: string[];
};

export type SlotSeatShape = "round" | "square";
export type SlotMapStyle = "rows" | "tables";
export type SlotDensity = "compact" | "cozy" | "roomy";
export type SlotStatus = "ready" | "loading" | "error";

export type LastSlotProps = {
  /** The seats' outline: round stools or square chairs. @default "round" */
  seatShape?: SlotSeatShape;
  /** How the map lays a session's rows out: as benches facing the front, or as tables with seats on both sides. @default "rows" */
  mapStyle?: SlotMapStyle;
  /** Seat size and spacing. @default "cozy" */
  density?: SlotDensity;
  /** The sessions, with their seats. @default defaultSlotSessions */
  sessions?: SlotSession[];
  /** Controlled: the chosen session and the seats held in it. */
  value?: SlotValue;
  /** Initial choice when uncontrolled. @default defaultSlotValue */
  defaultValue?: SlotValue;
  /** Fires from every change: a session chosen, a seat held or released, a seat lost to someone else, a move to the offered seat, and a hold that expired. */
  onChange?: (value: SlotValue, change: SlotChange) => void;
  /** Seats booked by others, as they arrive; each new entry flips its seat to taken, and one of yours is replaced by an offer of the nearest free seat. @default [] */
  events?: SlotEvent[];
  /** Most seats one booking may hold. @default 4 */
  maxSeats?: number;
  /** How long held seats are kept before they are released, in seconds. @default 120 */
  holdSeconds?: number;
  /** The moment the hold is measured at, in ms. When given, the piece keeps no clock: the bar stands at that moment and the hold expires only when the host moves `now` past its end. Otherwise it ticks once a second while a hold runs. */
  now?: number;
  /** Book was pressed with the held seats. */
  onConfirm?: (value: SlotValue, session: SlotSession) => void;
  /** Whether the sessions have arrived. @default "ready" */
  status?: SlotStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Basinworks Workshops" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the sessions and the map scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen, held or booked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const LETTERS = "ABCDEFGHJK";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A full map of rows by cols with `takenCount` seats already booked, seeded. */
export const makeSlotSeats = (
  rows: number,
  cols: number,
  takenCount: number,
  seed: number,
): SlotSeat[] => {
  const rand = mulberry32(seed);
  const order = Array.from({ length: rows * cols }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = a;
  }
  const taken = new Set(order.slice(0, Math.min(takenCount, order.length)));
  return Array.from({ length: rows * cols }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      id: `${LETTERS[row] ?? "R"}${col + 1}`,
      row,
      col,
      taken: taken.has(i),
    };
  });
};

/** Three days of Basinworks Workshops: one session on its last seat, one sold out. */
export const defaultSlotSessions: SlotSession[] = [
  {
    id: "tue-1",
    day: "2026-10-13",
    start: 600,
    length: 90,
    title: "Wheel throwing",
    host: "Ines Varga",
    rows: 3,
    cols: 6,
    seats: makeSlotSeats(3, 6, 8, 1699),
  },
  {
    id: "tue-2",
    day: "2026-10-13",
    start: 840,
    length: 120,
    title: "Glaze chemistry",
    host: "Tomas Reyes",
    rows: 3,
    cols: 6,
    seats: makeSlotSeats(3, 6, 17, 1702),
  },
  {
    id: "tue-3",
    day: "2026-10-13",
    start: 1110,
    length: 90,
    title: "Open studio",
    host: "Mara Lind",
    rows: 4,
    cols: 6,
    seats: makeSlotSeats(4, 6, 10, 1705),
  },
  {
    id: "wed-1",
    day: "2026-10-14",
    start: 600,
    length: 90,
    title: "Hand building",
    host: "Kenji Aoki",
    rows: 3,
    cols: 6,
    seats: makeSlotSeats(3, 6, 7, 1711),
  },
  {
    id: "wed-2",
    day: "2026-10-14",
    start: 810,
    length: 120,
    title: "Kiln loading",
    host: "Priya Nair",
    rows: 2,
    cols: 6,
    seats: makeSlotSeats(2, 6, 12, 1714),
  },
  {
    id: "wed-3",
    day: "2026-10-14",
    start: 1020,
    length: 90,
    title: "Surface decoration",
    host: "Ines Varga",
    rows: 3,
    cols: 6,
    seats: makeSlotSeats(3, 6, 9, 1720),
  },
  {
    id: "thu-1",
    day: "2026-10-15",
    start: 570,
    length: 180,
    title: "Raku firing",
    host: "Tomas Reyes",
    rows: 3,
    cols: 6,
    seats: makeSlotSeats(3, 6, 16, 1726),
  },
  {
    id: "thu-2",
    day: "2026-10-15",
    start: 840,
    length: 90,
    title: "Slip casting",
    host: "Mara Lind",
    rows: 4,
    cols: 6,
    seats: makeSlotSeats(4, 6, 5, 1731),
  },
];

/** Wednesday's hand building, with one seat already held. */
export const defaultSlotValue: SlotValue = {
  sessionId: "wed-1",
  seats: ["B2"],
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const SIZES: Record<SlotDensity, { seat: number; gap: number; aisle: number }> =
  {
    compact: { seat: 22, gap: 5, aisle: 10 },
    cozy: { seat: 26, gap: 6, aisle: 12 },
    roomy: { seat: 32, gap: 8, aisle: 16 },
  };

const HATCH =
  "repeating-linear-gradient(135deg, transparent 0 3px, var(--hairline-strong) 3px 4px)";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const TRAVEL_MS = 480;
const URGENT_S = 20;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const pad = (n: number) => String(n).padStart(2, "0");

/** "10:00", from minutes past midnight. */
export const timeOf = (minutes: number) =>
  `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map((p) => Number(p));
  return new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
};

/** "Tue 13", from "YYYY-MM-DD". Fixed names, so the server and the browser agree. */
const dayLabel = (day: string) => {
  const date = parseDay(day);
  return `${DAYS[date.getUTCDay()] ?? ""} ${date.getUTCDate()}`;
};

const dateLabel = (day: string) => {
  const date = parseDay(day);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""}`;
};

const takenIn = (session: SlotSession, events: SlotEvent[]) => {
  const set = new Set<string>();
  for (const seat of session.seats) if (seat.taken) set.add(seat.id);
  for (const event of events) {
    if (event.sessionId === session.id) set.add(event.seatId);
  }
  return set;
};

/** Seats nobody holds: for hosts that show a total elsewhere. */
export const countFree = (session: SlotSession, events: SlotEvent[] = []) =>
  session.seats.length - takenIn(session, events).size;

/** The free seat closest to `from`, preferring its own row; null when none is left. */
export const nearestFreeSeat = (
  session: SlotSession,
  taken: Set<string>,
  held: string[],
  from: string,
): string | null => {
  const origin = session.seats.find((s) => s.id === from);
  let best: { id: string; score: number } | null = null;
  for (const seat of session.seats) {
    if (taken.has(seat.id) || held.includes(seat.id) || seat.id === from) {
      continue;
    }
    const score = origin
      ? Math.abs(seat.row - origin.row) * 1.5 + Math.abs(seat.col - origin.col)
      : seat.row * 1.5 + seat.col;
    if (!best || score < best.score) best = { id: seat.id, score };
  }
  return best?.id ?? null;
};

const seatWord = (style: SlotMapStyle) =>
  style === "tables" ? "Table" : "Row";

const seatName = (seat: SlotSeat, style: SlotMapStyle) =>
  `${seatWord(style)} ${LETTERS[seat.row] ?? seat.row + 1}, seat ${seat.col + 1}`;

const sameSeats = (a: string[], b: string[]) =>
  a.length === b.length && a.every((s) => b.includes(s));

const listSeats = (seats: string[]) =>
  seats.length <= 1
    ? (seats[0] ?? "")
    : `${seats.slice(0, -1).join(", ")} and ${seats[seats.length - 1] ?? ""}`;

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Seats ring                                 */
/* ----------------------------------------------------------------------- */

const RING_R = 11.5;
const RING_C = 2 * Math.PI * RING_R;

function Ring({
  left,
  total,
  held,
  motionSafe,
}: {
  left: number;
  total: number;
  held: number;
  motionSafe: boolean;
}) {
  const frac = total > 0 ? clamp(left / total, 0, 1) : 0;
  const tone =
    left === 0
      ? held > 0
        ? "var(--accent-bright)"
        : "var(--ink-3)"
      : left === 1
        ? "var(--warn)"
        : "var(--accent-bright)";
  return (
    <span className="relative block size-[30px] shrink-0">
      <svg aria-hidden viewBox="0 0 30 30" className="absolute inset-0">
        <circle
          cx={15}
          cy={15}
          r={RING_R}
          fill="none"
          strokeWidth={2.5}
          className="stroke-hairline-strong"
        />
        <motion.circle
          cx={15}
          cy={15}
          r={RING_R}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          initial={false}
          animate={{ strokeDashoffset: r3(RING_C * (1 - frac)), stroke: tone }}
          transition={
            motionSafe
              ? {
                  strokeDashoffset: springs.snap,
                  stroke: { duration: durations.base },
                }
              : { duration: 0 }
          }
          style={{ rotate: -90, transformOrigin: "50% 50%" }}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium",
          left === 0 && held === 0 ? "text-ink-3" : "text-foreground",
        )}
      >
        <Roll value={left} motionSafe={motionSafe} />
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Session card                               */
/* ----------------------------------------------------------------------- */

type SessionCardProps = {
  session: SlotSession;
  dayText: string;
  left: number;
  held: number;
  selected: boolean;
  tabIndex: number;
  inert: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLDivElement | null) => void;
  onChoose: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function SessionCard({
  session,
  dayText,
  left,
  held,
  selected,
  tabIndex,
  inert,
  motionSafe,
  nodeRef,
  onChoose,
  onFocus,
  onNav,
}: SessionCardProps) {
  const total = session.seats.length;
  const last = left === 1;
  const full = left === 0 && held === 0;
  const state = full
    ? "sold out"
    : `${left} of ${total} ${left === 1 ? "seat" : "seats"} free`;
  return (
    <div
      ref={nodeRef}
      role="option"
      aria-selected={selected}
      aria-disabled={inert || undefined}
      aria-label={`${session.title}, ${dayText} ${timeOf(session.start)}, ${state}${last ? ", last slot" : ""}${held > 0 ? `, ${held} held` : ""}`}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onChoose}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onChoose();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-3 border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-cobalt-bright bg-cobalt-wash"
          : "border-hairline hover:bg-surface-1",
        full && !selected && "opacity-60",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span className="font-mono text-[11px] text-ink-2 tabular-nums">
        {timeOf(session.start)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">
          {session.title}
        </span>
        <span className="block truncate text-[11px] text-ink-3">
          {session.host} · {session.length} min
        </span>
      </span>
      <Ring left={left} total={total} held={held} motionSafe={motionSafe} />
      <AnimatePresence initial={false}>
        {last ? (
          <motion.span
            key="ribbon"
            aria-hidden
            initial={
              motionSafe
                ? { opacity: 0, scale: 0.6, rotate: -10, y: -distances.nudge }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, scale: 1, rotate: -3, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="pointer-events-none absolute -top-2 right-9 rounded-1 bg-warn px-1.5 py-0.5 font-mono text-[9px] leading-none font-semibold tracking-[0.12em] text-background uppercase shadow-[0_2px_6px_-2px_color-mix(in_oklab,black_40%,transparent)]"
          >
            Last slot
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Seat                                   */
/* ----------------------------------------------------------------------- */

type SeatCellProps = {
  seat: SlotSeat;
  name: string;
  taken: boolean;
  picked: boolean;
  booked: boolean;
  shape: SlotSeatShape;
  size: number;
  focusable: boolean;
  inert: boolean;
  motionSafe: boolean;
  marker: "lost" | "travel" | null;
  markerId: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onPress: () => void;
  onFocus: () => void;
  onKey: (event: React.KeyboardEvent) => void;
};

function SeatCell({
  seat,
  name,
  taken,
  picked,
  booked,
  shape,
  size,
  focusable,
  inert,
  motionSafe,
  marker,
  markerId,
  nodeRef,
  onPress,
  onFocus,
  onKey,
}: SeatCellProps) {
  const radius = shape === "round" ? "rounded-full" : "rounded-2";
  const flipping = motionSafe;
  return (
    <div
      ref={nodeRef}
      role="gridcell"
      aria-selected={picked}
      aria-disabled={taken || inert || undefined}
      aria-label={name}
      tabIndex={focusable ? 0 : -1}
      onClick={onPress}
      onFocus={onFocus}
      onKeyDown={onKey}
      className={cn(
        "group/seat relative shrink-0 touch-manipulation select-none [perspective:160px]",
        radius,
        taken || inert ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
      style={{ width: size, height: size }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 block [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: flipping && taken ? 180 : 0 }}
        transition={flipping ? springs.snap : { duration: 0 }}
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center border transition-[background-color,border-color,opacity] duration-150 [backface-visibility:hidden]",
            radius,
            booked
              ? "border-transparent bg-success text-background"
              : picked
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-hairline-strong bg-surface-1 group-hover/seat:border-ink-3",
            !flipping && taken && "opacity-0",
          )}
        >
          {picked || booked ? (
            <svg aria-hidden viewBox="0 0 14 14" className="size-[55%]">
              <motion.path
                d="M3 7.4 5.8 10 11 4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
          ) : (
            <span className="font-mono text-[9px] leading-none text-ink-3">
              {seat.col + 1}
            </span>
          )}
        </span>
        <span
          className={cn(
            "absolute inset-0 border border-hairline bg-surface-2 transition-opacity duration-150 [backface-visibility:hidden]",
            radius,
            !flipping && !taken && "opacity-0",
          )}
          style={{
            transform: flipping ? "rotateY(180deg)" : undefined,
            backgroundImage: HATCH,
          }}
        />
      </motion.span>
      {marker ? (
        <motion.span
          aria-hidden
          layoutId={markerId}
          transition={springs.glide}
          className={cn(
            "pointer-events-none absolute -inset-[3px] border-2",
            radius,
            marker === "lost"
              ? "border-dashed border-warn"
              : "border-cobalt-bright",
          )}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Toast = { lost: string; offer: string | null };

/**
 * A session and seat picker where the last few seats matter. Sessions sit in
 * a column by day, each with a ring of its remaining seats; choosing one
 * glides its seat map in on `springs.glide`. Picking a seat ticks it on
 * `springs.flick` while the count of seats left rolls; the ring on the card
 * follows, and when a session is down to one seat the ring turns amber and a
 * "last slot" ribbon lands on the card on `springs.recoil`.
 *
 * Seats booked elsewhere arrive through `events`: the seat flips to its taken
 * face on `springs.snap`, and if it was one of yours a toast says so and
 * offers the nearest free seat — accepting it glides a marker from the lost
 * seat to the new one before it ticks. Held seats drain a hold bar for
 * `holdSeconds`; when it runs out they are released with a note.
 *
 * The sessions are a listbox (arrows, Home, End, Enter chooses) and the map
 * is a grid (arrows, Home and End along a row, Space or Enter holds or lets
 * go, Escape dismisses the offer). Under reduced motion nothing flips,
 * travels or rolls: seats cross-fade to their new face, the map and the
 * ribbon fade in place, and every count and announcement still lands.
 */
export function LastSlot({
  seatShape = "round",
  mapStyle = "rows",
  density = "cozy",
  sessions = defaultSlotSessions,
  value,
  defaultValue = defaultSlotValue,
  onChange,
  events = [],
  maxSeats = 4,
  holdSeconds = 120,
  now,
  onConfirm,
  status = "ready",
  onRetry,
  title = "Basinworks Workshops",
  label,
  height = 540,
  disabled = false,
  className,
}: LastSlotProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const markerId = `${uid}-marker`;

  const [own, setOwn] = React.useState<SlotValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [booked, setBooked] = React.useState<SlotValue | null>(null);
  const [holdAt, setHoldAt] = React.useState<number | null>(null);
  const [tick, setTick] = React.useState(0);
  const [expired, setExpired] = React.useState<string[] | null>(null);
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [travel, setTravel] = React.useState<string | null>(null);
  const [activeSession, setActiveSession] = React.useState<string | null>(null);
  const [activeSeat, setActiveSeat] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    seat: string;
    seq: number;
  } | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so nothing on the page at
  // load animates in; true for what mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sessionNodes = React.useRef(new Map<string, HTMLDivElement>());
  const seatNodes = React.useRef(new Map<string, HTMLDivElement>());
  const travelTimer = React.useRef<number | null>(null);
  const bumped = React.useRef(new Set<string>());

  /* -------------------------------- data ------------------------------- */

  const ordered = [...sessions].sort((a, b) =>
    a.day === b.day ? a.start - b.start : a.day < b.day ? -1 : 1,
  );
  const days = ordered.reduce<{ day: string; sessions: SlotSession[] }[]>(
    (acc, s) => {
      const last = acc[acc.length - 1];
      if (last && last.day === s.day) last.sessions.push(s);
      else acc.push({ day: s.day, sessions: [s] });
      return acc;
    },
    [],
  );
  const session = sessions.find((s) => s.id === current.sessionId) ?? null;
  const taken = session ? takenIn(session, events) : new Set<string>();
  const isBooked =
    booked !== null &&
    booked.sessionId === current.sessionId &&
    sameSeats(booked.seats, current.seats);
  const held = session ? current.seats.filter((s) => !taken.has(s)) : [];
  const holding = session !== null && held.length > 0 && !isBooked;
  const freeHere = session ? session.seats.length - taken.size : 0;
  const leftHere = Math.max(0, freeHere - current.seats.length);
  const soldOut = session !== null && freeHere === 0 && held.length === 0;
  const empty =
    sessions.length === 0 ||
    sessions.every(
      (s) =>
        countFree(s, events) === 0 &&
        !(s.id === current.sessionId && current.seats.length > 0),
    );

  const sizes = SIZES[density] ?? SIZES.cozy;
  const seatRows = session
    ? Array.from({ length: session.rows }, (_, r) =>
        session.seats.filter((s) => s.row === r).sort((a, b) => a.col - b.col),
      )
    : [];
  const seatById = new Map((session?.seats ?? []).map((s) => [s.id, s]));

  /* --------------------------------- time ------------------------------ */

  const moment = now ?? tick;
  const holdEnd = holdAt === null ? null : holdAt + holdSeconds * 1000;
  // Before the hold's start is read (the server render, and the frame before
  // the effect runs) the bar stands full, so it never swings up from empty.
  const remainMs =
    holdEnd === null
      ? holdSeconds * 1000
      : clamp(holdEnd - moment, 0, holdSeconds * 1000);
  const remainS = Math.ceil(remainMs / 1000);
  const holdFrac = holdSeconds > 0 ? remainMs / (holdSeconds * 1000) : 0;
  const urgent = holding && remainS <= URGENT_S;

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: SlotValue, change: SlotChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const announce = (text: string) => setAnnouncement(text);

  const release = () => {
    const seats = held;
    if (!session || seats.length === 0 || isBooked) return;
    commit(
      { sessionId: session.id, seats: [] },
      { type: "released", sessionId: session.id, seats },
    );
    setExpired(seats);
    setHoldAt(null);
    setToast(null);
    announce(
      `Hold expired. ${listSeats(seats)} ${seats.length === 1 ? "was" : "were"} released; ${freeHere} ${freeHere === 1 ? "seat is" : "seats are"} free.`,
    );
  };

  const bump = () => {
    if (!session || isBooked) return;
    const lost = current.seats.filter(
      (s) => taken.has(s) && !bumped.current.has(`${session.id}:${s}`),
    );
    const first = lost[0];
    if (!first) return;
    for (const s of lost) bumped.current.add(`${session.id}:${s}`);
    const keep = current.seats.filter((s) => !taken.has(s));
    const offer = nearestFreeSeat(session, taken, keep, first);
    commit(
      { sessionId: session.id, seats: keep },
      { type: "bumped", sessionId: session.id, seat: first },
    );
    setToast({ lost: first, offer });
    const offerSeat = offer ? seatById.get(offer) : undefined;
    announce(
      `Seat ${first} was just taken by someone else. ${
        offerSeat
          ? `${seatName(offerSeat, mapStyle)} is the nearest free seat.`
          : "No other seat is free."
      }`,
    );
  };

  const land = (to: string) => {
    if (!session) return;
    const seats = [...current.seats.filter((s) => s !== to), to];
    commit(
      { sessionId: session.id, seats },
      { type: "moved", sessionId: session.id, seat: to },
    );
    setFocusReq((f) => ({ seat: to, seq: (f?.seq ?? 0) + 1 }));
    const seat = seatById.get(to);
    announce(
      `Moved to ${seat ? seatName(seat, mapStyle) : to}. ${seats.length} held.`,
    );
  };

  // The latest closures, for the timers and the effects that fire them.
  const latest = React.useRef({ release, bump, land });
  React.useEffect(() => {
    latest.current = { release, bump, land };
  });

  const chooseSession = (id: string) => {
    if (inert) return;
    const next = sessions.find((s) => s.id === id);
    if (!next || session?.id === id) return;
    const releasing = holding ? held : [];
    commit(
      { sessionId: id, seats: [] },
      { type: "session", sessionId: id, seats: releasing },
    );
    setToast(null);
    setTravel(null);
    setExpired(null);
    setHoldAt(null);
    setActiveSeat(null);
    const free = countFree(next, events);
    announce(
      `${next.title}, ${dayLabel(next.day)} ${timeOf(next.start)}. ${
        free === 0
          ? "Sold out."
          : `${free} of ${next.seats.length} ${free === 1 ? "seat" : "seats"} free.`
      }${releasing.length > 0 ? ` ${listSeats(releasing)} released.` : ""}`,
    );
  };

  const toggleSeat = (id: string) => {
    if (inert || !session || isBooked) return;
    const seat = seatById.get(id);
    if (!seat) return;
    if (taken.has(id)) {
      announce(`${seatName(seat, mapStyle)} is taken.`);
      return;
    }
    const has = current.seats.includes(id);
    if (!has && current.seats.length >= maxSeats) {
      announce(
        `You can hold ${maxSeats} ${maxSeats === 1 ? "seat" : "seats"} at most. Let one go first.`,
      );
      return;
    }
    const seats = has
      ? current.seats.filter((s) => s !== id)
      : [...current.seats, id];
    commit(
      { sessionId: session.id, seats },
      { type: has ? "unpick" : "pick", sessionId: session.id, seat: id },
    );
    setExpired(null);
    if (seats.length === 0) setHoldAt(null);
    const left = freeHere - seats.length;
    announce(
      `${seatName(seat, mapStyle)} ${has ? "let go" : "held"}. ${seats.length} held, ${left} ${left === 1 ? "seat" : "seats"} left.`,
    );
  };

  const confirm = () => {
    if (inert || !session || !holding) return;
    setBooked({ sessionId: session.id, seats: held });
    setHoldAt(null);
    setToast(null);
    onConfirm?.({ sessionId: session.id, seats: held }, session);
    announce(
      `Booked ${listSeats(held)} for ${session.title}, ${dayLabel(session.day)} ${timeOf(session.start)}.`,
    );
  };

  const accept = () => {
    if (!toast?.offer || !session || inert) return;
    const to = toast.offer;
    setToast(null);
    if (!motionSafe) {
      land(to);
      return;
    }
    setTravel(to);
    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    travelTimer.current = window.setTimeout(() => {
      travelTimer.current = null;
      setTravel(null);
      latest.current.land(to);
    }, TRAVEL_MS);
  };

  const dismiss = () => {
    setToast(null);
    const first = held[0] ?? activeSeat;
    if (first) seatNodes.current.get(first)?.focus({ preventScroll: true });
  };

  /* ------------------------------- effects ----------------------------- */

  React.useEffect(
    () => () => {
      if (travelTimer.current !== null) {
        window.clearTimeout(travelTimer.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    watcher.observe(root);
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // A hold starts with the first seat held — including seats that arrived
  // with the value — and ends when none is held or the booking is made.
  React.useEffect(() => {
    if (holding && holdAt === null) {
      const at = now ?? Date.now();
      // The clock is read when the hold starts, never during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHoldAt(at);
      setTick(at);
    } else if (!holding && holdAt !== null) {
      setHoldAt(null);
    }
  }, [holding, holdAt, now]);

  // Expiry: one timeout for the hold's end on the piece's own clock, or the
  // host's `now` carried past it.
  React.useEffect(() => {
    if (holdEnd === null) return;
    if (now !== undefined) {
      if (now >= holdEnd) latest.current.release();
      return;
    }
    const wait = Math.max(0, holdEnd - Date.now());
    const id = window.setTimeout(() => latest.current.release(), wait);
    return () => window.clearTimeout(id);
  }, [holdEnd, now]);

  // The bar and the seconds tick once a second, only while a hold runs on
  // the piece's own clock and the card is on a visible page.
  const ticking = holdAt !== null && now === undefined && onScreen && pageShown;
  React.useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  // Someone else took one of yours: let it go and offer the nearest seat.
  const takenKey = session ? [...taken].sort().join(",") : "";
  const seatsKey = current.seats.join(",");
  React.useEffect(() => {
    if (!takenKey || !seatsKey) return;
    latest.current.bump();
  }, [takenKey, seatsKey]);

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    seatNodes.current.get(focusReq.seat)?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------ keyboard ----------------------------- */

  const sessionIds = ordered.map((s) => s.id);
  const activeSessionId =
    activeSession && sessionIds.includes(activeSession)
      ? activeSession
      : current.sessionId && sessionIds.includes(current.sessionId)
        ? current.sessionId
        : (sessionIds[0] ?? null);

  const onSessionNav = (event: React.KeyboardEvent, id: string) => {
    const i = sessionIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = sessionIds.length - 1;
    else return;
    event.preventDefault();
    const target = sessionIds[clamp(to, 0, sessionIds.length - 1)];
    if (target) sessionNodes.current.get(target)?.focus();
  };

  const activeSeatId =
    activeSeat && seatById.has(activeSeat)
      ? activeSeat
      : (held[0] ??
        session?.seats.find((s) => !taken.has(s.id))?.id ??
        session?.seats[0]?.id ??
        null);

  const seatAt = (row: number, col: number) =>
    session?.seats.find((s) => s.row === row && s.col === col) ?? null;

  const step = (seat: SlotSeat, dr: number, dc: number) => {
    if (!session) return null;
    let r = seat.row + dr;
    let c = seat.col + dc;
    while (r >= 0 && r < session.rows && c >= 0 && c < session.cols) {
      const hit = seatAt(r, c);
      if (hit) return hit;
      r += dr;
      c += dc;
    }
    return null;
  };

  const onSeatKey = (event: React.KeyboardEvent, seat: SlotSeat) => {
    if (!session) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleSeat(seat.id);
      return;
    }
    if (event.key === "Escape") {
      if (toast) {
        event.preventDefault();
        setToast(null);
      }
      return;
    }
    let target: SlotSeat | null = null;
    const row = seatRows[seat.row] ?? [];
    if (event.key === "ArrowRight") target = step(seat, 0, 1);
    else if (event.key === "ArrowLeft") target = step(seat, 0, -1);
    else if (event.key === "ArrowDown") target = step(seat, 1, 0);
    else if (event.key === "ArrowUp") target = step(seat, -1, 0);
    else if (event.key === "Home") {
      target = event.ctrlKey ? (seatRows[0]?.[0] ?? null) : (row[0] ?? null);
    } else if (event.key === "End") {
      const lastRow = seatRows[seatRows.length - 1] ?? [];
      target = event.ctrlKey
        ? (lastRow[lastRow.length - 1] ?? null)
        : (row[row.length - 1] ?? null);
    } else return;
    event.preventDefault();
    if (target) seatNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const range =
    days.length > 0
      ? `${dateLabel(days[0]?.day ?? "")} to ${dateLabel(days[days.length - 1]?.day ?? "")}`
      : "";

  const seatState = (seat: SlotSeat) =>
    taken.has(seat.id)
      ? "taken"
      : isBooked && current.seats.includes(seat.id)
        ? "booked, yours"
        : current.seats.includes(seat.id)
          ? "held by you"
          : "free";

  const renderSeat = (seat: SlotSeat) => (
    <SeatCell
      key={seat.id}
      seat={seat}
      name={`${seatName(seat, mapStyle)}, ${seatState(seat)}`}
      taken={taken.has(seat.id)}
      picked={current.seats.includes(seat.id)}
      booked={isBooked && current.seats.includes(seat.id)}
      shape={seatShape}
      size={sizes.seat}
      focusable={seat.id === activeSeatId}
      inert={inert || isBooked}
      motionSafe={motionSafe}
      marker={
        travel === seat.id ? "travel" : toast?.lost === seat.id ? "lost" : null
      }
      markerId={markerId}
      nodeRef={(node) => {
        if (node) seatNodes.current.set(seat.id, node);
        else seatNodes.current.delete(seat.id);
      }}
      onPress={() => toggleSeat(seat.id)}
      onFocus={() => setActiveSeat(seat.id)}
      onKey={(event) => onSeatKey(event, seat)}
    />
  );

  const renderRow = (row: SlotSeat[], r: number) => {
    if (!session) return null;
    const letter = LETTERS[r] ?? String(r + 1);
    if (mapStyle === "tables") {
      const half = Math.ceil(row.length / 2);
      const top = row.slice(0, half);
      const bottom = row.slice(half);
      return (
        <div
          key={r}
          role="row"
          className="flex flex-col items-center"
          style={{ rowGap: sizes.gap }}
        >
          <div className="flex" style={{ columnGap: sizes.gap }}>
            {top.map(renderSeat)}
          </div>
          <div
            role="rowheader"
            className="flex items-center justify-center rounded-2 border border-hairline-strong bg-surface-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{
              width: half * sizes.seat + (half - 1) * sizes.gap + sizes.aisle,
              height: Math.round(sizes.seat * 0.7),
            }}
          >
            {letter}
          </div>
          <div className="flex" style={{ columnGap: sizes.gap }}>
            {bottom.map(renderSeat)}
          </div>
        </div>
      );
    }
    const mid = Math.ceil(session.cols / 2);
    return (
      <div
        key={r}
        role="row"
        className="flex items-center"
        style={{ columnGap: sizes.gap }}
      >
        <span
          role="rowheader"
          className="w-4 shrink-0 text-center font-mono text-[10px] leading-none text-ink-3"
        >
          {letter}
        </span>
        {row.map((seat) => (
          <span
            key={seat.id}
            className="flex"
            style={{
              marginLeft: seat.col === mid && mid > 0 ? sizes.aisle : undefined,
            }}
          >
            {renderSeat(seat)}
          </span>
        ))}
      </div>
    );
  };

  // Sessions that arrive after a load cascade in; those on the page at load
  // sit still.
  const stepDelay = cascade(Math.min(ordered.length, 8));

  const sessionList = (
    <div
      role="listbox"
      aria-label="Sessions"
      aria-describedby={hintId}
      className="grid gap-x-3 gap-y-3 @min-[26rem]:grid-cols-3 @min-[40rem]:grid-cols-1"
    >
      {days.map((group) => (
        <div
          key={group.day}
          role="group"
          aria-label={dayLabel(group.day)}
          className="flex min-w-0 flex-col gap-1.5"
        >
          <span className="px-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {dayLabel(group.day)}
          </span>
          {group.sessions.map((s) => {
            const free = countFree(s, events);
            const heldHere = s.id === session?.id ? current.seats.length : 0;
            const i = sessionIds.indexOf(s.id);
            return (
              <motion.div
                key={s.id}
                initial={
                  live
                    ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe
                    ? {
                        ...springs.glide,
                        delay: r3(Math.min(i, 8) * stepDelay),
                      }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? r3(Math.min(i, 8) * stepDelay) : 0,
                  },
                }}
              >
                <SessionCard
                  session={s}
                  dayText={dayLabel(s.day)}
                  left={Math.max(0, free - heldHere)}
                  held={heldHere}
                  selected={s.id === session?.id}
                  tabIndex={s.id === activeSessionId ? 0 : -1}
                  inert={inert}
                  motionSafe={motionSafe}
                  nodeRef={(node) => {
                    if (node) sessionNodes.current.set(s.id, node);
                    else sessionNodes.current.delete(s.id);
                  }}
                  onChoose={() => chooseSession(s.id)}
                  onFocus={() => setActiveSession(s.id)}
                  onNav={(event) => onSessionNav(event, s.id)}
                />
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const holdBar = (
    <div
      className={cn(
        "flex items-center gap-2.5 transition-opacity duration-200",
        holding ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!holding}
    >
      <Hourglass
        aria-hidden
        className={cn("size-3 shrink-0", urgent ? "text-warn" : "text-ink-3")}
      />
      <span
        className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Hold"
        aria-valuemin={0}
        aria-valuemax={holdSeconds}
        aria-valuenow={remainS}
        aria-valuetext={`${remainS} seconds left on the hold`}
      >
        <span
          className="block h-full rounded-full"
          style={{
            transform: `scaleX(${r3(holdFrac)})`,
            transformOrigin: "left",
            backgroundColor: urgent ? "var(--warn)" : "var(--accent-bright)",
            transition:
              motionSafe && ticking
                ? "transform 1s linear, background-color 240ms"
                : "background-color 240ms",
          }}
        />
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums",
          urgent ? "text-warn" : "text-ink-3",
        )}
      >
        {Math.floor(remainS / 60)}:{pad(remainS % 60)} held
      </span>
    </div>
  );

  const mapPane = session ? (
    <motion.div
      key={session.id}
      initial={{ opacity: 0, x: motionSafe ? distances.shift : 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.base }
      }
      className="flex min-h-full flex-col gap-3 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.title}</p>
          <p className="truncate text-[11px] text-ink-3">
            {dayLabel(session.day)} · {timeOf(session.start)} to{" "}
            {timeOf(session.start + session.length)} · {session.host}
          </p>
        </div>
        <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
          <span className="sr-only">
            {leftHere} {leftHere === 1 ? "seat" : "seats"} left
          </span>
          <Roll
            value={leftHere}
            motionSafe={motionSafe}
            className={cn(
              "font-mono text-[15px] font-medium",
              leftHere === 0
                ? "text-ink-3"
                : leftHere === 1
                  ? "text-warn"
                  : "text-foreground",
            )}
          />
          <span aria-hidden>left</span>
        </p>
      </div>

      {holdBar}

      {soldOut ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Ticket aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">This session is sold out.</p>
          <p className="text-[11px] text-ink-3">
            Pick another, or watch for a seat to open.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3">
          <div
            aria-hidden
            className="flex w-full max-w-[16rem] flex-col items-center gap-1"
          >
            <span className="h-1 w-3/4 rounded-full bg-hairline-strong" />
            <span className="font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
              Front
            </span>
          </div>
          <div
            role="grid"
            aria-label={`${session.title} seats`}
            aria-multiselectable="true"
            aria-describedby={hintId}
            aria-disabled={inert || isBooked || undefined}
            className="flex flex-col items-center"
            style={{ rowGap: mapStyle === "tables" ? sizes.aisle : sizes.gap }}
          >
            {seatRows.map(renderRow)}
          </div>
          <div
            aria-hidden
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-3"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 border border-hairline-strong bg-surface-1",
                  seatShape === "round" ? "rounded-full" : "rounded-[3px]",
                )}
              />
              free
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 bg-primary",
                  seatShape === "round" ? "rounded-full" : "rounded-[3px]",
                )}
              />
              yours
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 border border-hairline bg-surface-2",
                  seatShape === "round" ? "rounded-full" : "rounded-[3px]",
                )}
                style={{ backgroundImage: HATCH }}
              />
              taken
            </span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.lost}
            role="status"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3 border border-hairline-strong bg-popover px-3 py-2.5 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-warn"
            />
            <span className="min-w-0 flex-1 text-[12px] text-foreground">
              Seat {toast.lost} was just taken.{" "}
              <span className="text-ink-2">
                {toast.offer
                  ? `${toast.offer} is the nearest free seat.`
                  : "No other seat is free."}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {toast.offer ? (
                <button
                  type="button"
                  onClick={accept}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_88%,var(--ink))]",
                    FOCUS_RING,
                  )}
                >
                  Take {toast.offer}
                  <ArrowRight aria-hidden className="size-3" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-3">
        <p className="min-w-0 flex-1 text-[12px] text-ink-2">
          {isBooked ? (
            <motion.span
              key="booked"
              initial={
                live
                  ? motionSafe
                    ? { scale: 0.85, opacity: 0 }
                    : { opacity: 0 }
                  : false
              }
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="inline-flex items-center gap-1.5 text-success"
            >
              <span className="font-medium">Booked</span>
              <span className="text-ink-2">{listSeats(current.seats)}</span>
            </motion.span>
          ) : expired ? (
            <span className="text-warn">
              Hold expired. {listSeats(expired)}{" "}
              {expired.length === 1 ? "was" : "were"} released; pick again.
            </span>
          ) : held.length > 0 ? (
            <span>
              Holding <span className="font-medium">{listSeats(held)}</span>
              <span className="text-ink-3"> · up to {maxSeats}</span>
            </span>
          ) : (
            <span className="text-ink-3">
              Pick up to {maxSeats} {maxSeats === 1 ? "seat" : "seats"}.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={confirm}
          aria-disabled={!holding || inert || undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
            holding && !inert
              ? "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,var(--ink))]"
              : "cursor-default bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          {isBooked
            ? "Booked"
            : held.length === 0
              ? "Book seats"
              : `Book ${held.length} ${held.length === 1 ? "seat" : "seats"}`}
        </button>
      </div>
    </motion.div>
  ) : (
    <motion.div
      key="none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
      className="flex min-h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center"
    >
      <Armchair aria-hidden className="size-5 text-ink-3" />
      <p className="text-sm text-ink-2">Choose a session to see its seats.</p>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Arrows move. Enter chooses a session. Space holds or lets go of a seat.
        Escape dismisses an offer.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          {range ? (
            <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {range}
            </p>
          ) : null}
        </div>
        {ready && session && !soldOut ? (
          <p
            aria-hidden
            className={cn(
              "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
              leftHere === 1 ? "text-warn" : "text-ink-3",
            )}
          >
            {leftHere === 1 ? "last slot" : `${leftHere} left`}
          </p>
        ) : null}
      </header>

      {status === "loading" ? (
        <div
          aria-hidden
          className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row"
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-hairline p-3 @min-[40rem]:w-[16rem] @min-[40rem]:border-r @min-[40rem]:border-b-0">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="h-[46px] rounded-3 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
            {Array.from({ length: 3 }, (_, r) => (
              <span key={r} className="flex gap-1.5">
                {Array.from({ length: 6 }, (_, c) => (
                  <span
                    key={c}
                    className="size-[26px] rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${(r * 6 + c) * 40}ms` }}
                  />
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The sessions didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(BUTTON, "h-8 px-3 text-foreground", FOCUS_RING)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Ticket aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">Every session is full.</p>
          <p className="max-w-[22rem] text-[12px] text-ink-2">
            {sessions.length === 0
              ? "No sessions are scheduled yet."
              : "Seats open up when someone cancels; check back closer to the day."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @min-[40rem]:flex-row @min-[40rem]:overflow-hidden">
          <div className="shrink-0 border-b border-hairline p-3 @min-[40rem]:w-[16rem] @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-r @min-[40rem]:border-b-0">
            {sessionList}
          </div>
          <div className="relative flex min-h-[18rem] flex-1 flex-col @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain">
            <AnimatePresence mode="wait" initial={false}>
              {mapPane}
            </AnimatePresence>
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
